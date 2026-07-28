const DEFAULT_MODELS = Object.freeze([
    'gemini-3.6-flash',
    'gemini-3.5-flash'
]);

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
]);

const OCR_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        fornecedor: {
            type: 'string',
            description: 'Empresa emissora do documento, nunca o destinatário.'
        },
        equipamento: {
            type: 'string',
            description: 'Principal equipamento ou material, sem prefixos de locação ou aluguel.'
        },
        quantidade: {
            type: 'integer',
            minimum: 1,
            description: 'Quantidade do item principal.'
        },
        valor: {
            type: 'string',
            description: 'Valor total final do documento, preservando os separadores exibidos.'
        },
        contrato: {
            type: 'string',
            description: 'Número do contrato, pedido, fatura ou nota fiscal; vazio quando ausente.'
        }
    },
    required: ['fornecedor', 'equipamento', 'quantidade', 'valor', 'contrato'],
    additionalProperties: false
});

const OCR_PROMPT = `Analise o documento brasileiro anexado (nota fiscal, recibo, fatura de locação ou documento de compra) e extraia somente os campos definidos no esquema JSON.
Regras obrigatórias:
- fornecedor: empresa emissora/vendedora/locadora; nunca o destinatário/cliente;
- equipamento: principal equipamento ou material; remova prefixos como "LOCAÇÃO DE", "LOCAÇÃO" e "ALUGUEL DE";
- quantidade: inteiro maior ou igual a 1; use 1 quando não houver quantidade explícita;
- valor: valor total final do documento, não subtotal nem valor unitário;
- contrato: número do contrato, pedido, fatura ou nota fiscal; use string vazia quando não existir;
- não invente dados e não acrescente explicações.`;

class HttpError extends Error {
    constructor(status, code, message, stage, details = undefined) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.code = code;
        this.stage = stage;
        this.details = details;
    }
}

function cleanText(value, maxLength = 300) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function parseCsv(value, fallback = []) {
    const values = String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    return values.length ? [...new Set(values)] : [...fallback];
}

function parseJsonMap(value) {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}

function getConfiguredPublicKeys(env) {
    const keys = new Set();
    const named = parseJsonMap(env.SUPABASE_PUBLISHABLE_KEYS);
    Object.values(named).forEach((value) => {
        if (typeof value === 'string' && value) keys.add(value);
    });

    for (const name of ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']) {
        if (typeof env[name] === 'string' && env[name]) keys.add(env[name]);
    }
    return keys;
}

function makeRequestId(candidate) {
    const supplied = String(candidate || '').trim();
    if (/^[A-Za-z0-9._:-]{8,100}$/.test(supplied)) return supplied;
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getAllowedOrigins(env) {
    return parseCsv(env.ALLOWED_ORIGINS, [
        'https://brunogarcia7.github.io',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ]);
}

function createCorsHeaders(origin, allowedOrigins) {
    const headers = {
        'Access-Control-Allow-Headers': 'content-type, apikey, x-request-id',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Content-Type': 'application/json; charset=utf-8',
        'Vary': 'Origin'
    };
    if (origin && allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    return headers;
}

function jsonResponse(body, status, headers) {
    return new Response(JSON.stringify(body), { status, headers });
}

function logEvent(logger, level, event, fields = {}) {
    const payload = {
        level,
        event,
        timestamp: new Date().toISOString(),
        ...fields
    };
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    logger[method](JSON.stringify(payload));
}

function normalizeMimeType(value) {
    return String(value || '').toLowerCase().split(';')[0].trim();
}

function normalizeBase64(value) {
    let data = String(value || '').trim();
    const commaIndex = data.indexOf(',');
    if (data.startsWith('data:') && commaIndex >= 0) data = data.slice(commaIndex + 1);
    return data.replace(/\s/g, '');
}

function estimateBase64Bytes(base64) {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function findInlinePart(payload) {
    const contents = Array.isArray(payload?.contents) ? payload.contents : [];
    for (const content of contents) {
        const parts = Array.isArray(content?.parts) ? content.parts : [];
        for (const part of parts) {
            const inline = part?.inlineData || part?.inline_data;
            if (inline && typeof inline === 'object') return inline;
        }
    }
    return null;
}

function extractFile(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new HttpError(400, 'INVALID_JSON_SHAPE', 'O body deve ser um objeto JSON.', 'request');
    }

    const file = payload.file && typeof payload.file === 'object'
        ? payload.file
        : null;
    const legacyInline = findInlinePart(payload);

    const mimeType = normalizeMimeType(
        file?.mimeType || file?.mime_type || payload.mimeType || payload.mime_type ||
        legacyInline?.mimeType || legacyInline?.mime_type
    );
    const data = normalizeBase64(
        file?.data || payload.data || legacyInline?.data
    );
    const name = cleanText(file?.name || payload.fileName || '', 160);

    if (!mimeType) {
        throw new HttpError(400, 'MIME_REQUIRED', 'mimeType não foi informado.', 'validation');
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        throw new HttpError(
            415,
            'MIME_NOT_SUPPORTED',
            `Formato não suportado: ${mimeType}.`,
            'validation',
            { allowedMimeTypes: [...ALLOWED_MIME_TYPES] }
        );
    }
    if (!data) {
        throw new HttpError(400, 'BASE64_REQUIRED', 'O conteúdo Base64 do arquivo está vazio.', 'validation');
    }
    if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
        throw new HttpError(400, 'INVALID_BASE64', 'O conteúdo do arquivo não é Base64 válido.', 'validation');
    }

    return {
        mimeType,
        data,
        name,
        size: estimateBase64Bytes(data)
    };
}

function buildGeminiPayload(file, outputMode = 'structured') {
    const generationConfig = { maxOutputTokens: 2048 };

    if (outputMode === 'structured') {
        generationConfig.responseFormat = {
            text: {
                mimeType: 'application/json',
                schema: OCR_SCHEMA
            }
        };
    } else if (outputMode === 'legacy-json') {
        generationConfig.responseMimeType = 'application/json';
    }

    return {
        contents: [{
            role: 'user',
            parts: [
                { text: OCR_PROMPT },
                {
                    inline_data: {
                        mime_type: file.mimeType,
                        data: file.data
                    }
                }
            ]
        }],
        generationConfig
    };
}

function extractGeminiText(responseJson) {
    const candidates = Array.isArray(responseJson?.candidates) ? responseJson.candidates : [];
    const parts = candidates[0]?.content?.parts;
    const text = Array.isArray(parts)
        ? parts.map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim()
        : '';

    if (!text) {
        const blockReason = responseJson?.promptFeedback?.blockReason;
        const finishReason = candidates[0]?.finishReason;
        throw new HttpError(
            502,
            'EMPTY_GEMINI_RESPONSE',
            'O Gemini não retornou conteúdo utilizável.',
            'gemini-response',
            { blockReason, finishReason }
        );
    }
    return text;
}

function parseOcrJson(text) {
    let candidate = String(text || '').trim();
    candidate = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
        return JSON.parse(candidate);
    } catch {
        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(candidate.slice(start, end + 1));
            } catch {
                // O erro detalhado é produzido abaixo.
            }
        }
    }

    throw new HttpError(
        502,
        'INVALID_GEMINI_JSON',
        'O Gemini respondeu, mas o conteúdo não era um JSON válido.',
        'gemini-response',
        { responsePreview: cleanText(candidate, 240) }
    );
}

function normalizeOcrResult(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new HttpError(502, 'INVALID_OCR_OBJECT', 'O JSON do OCR não é um objeto.', 'normalization');
    }

    const quantity = Number.parseInt(value.quantidade, 10);
    return {
        fornecedor: cleanText(value.fornecedor, 180),
        equipamento: cleanText(value.equipamento, 240),
        quantidade: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        valor: cleanText(value.valor, 80),
        contrato: cleanText(value.contrato, 120)
    };
}

async function readResponseBody(response) {
    const text = await response.text();
    if (!text) return { text: '', json: null };
    try {
        return { text, json: JSON.parse(text) };
    } catch {
        return { text, json: null };
    }
}

function describeGoogleError(status, body) {
    const message = body.json?.error?.message || body.json?.message || body.text || `HTTP ${status}`;
    return cleanText(message, 360);
}

async function callGeminiModel({ model, file, apiKey, fetchImpl, timeoutMs, outputMode }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    try {
        const response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(buildGeminiPayload(file, outputMode)),
            signal: controller.signal
        });
        const body = await readResponseBody(response);

        if (!response.ok) {
            return {
                ok: false,
                status: response.status,
                error: describeGoogleError(response.status, body),
                outputMode
            };
        }
        if (!body.json) {
            return {
                ok: false,
                status: 502,
                error: 'Resposta não JSON recebida da API Gemini.',
                outputMode
            };
        }

        const text = extractGeminiText(body.json);
        return {
            ok: true,
            result: normalizeOcrResult(parseOcrJson(text)),
            outputMode
        };
    } catch (error) {
        if (error?.name === 'AbortError') {
            return { ok: false, status: 504, error: `Timeout de ${timeoutMs} ms.`, outputMode };
        }
        if (error instanceof HttpError) throw error;
        return { ok: false, status: 502, error: cleanText(error?.message || error, 360), outputMode };
    } finally {
        clearTimeout(timer);
    }
}

function parseModelVersion(name) {
    const match = String(name).match(/^gemini-(\d+)(?:\.(\d+))?-flash$/);
    return match ? [Number(match[1]), Number(match[2] || 0)] : null;
}

async function discoverStableFlashModels(apiKey, fetchImpl, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(
            'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
            { headers: { 'x-goog-api-key': apiKey }, signal: controller.signal }
        );
        if (!response.ok) return [];
        const json = await response.json();
        const names = (Array.isArray(json?.models) ? json.models : [])
            .filter((model) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
            .map((model) => String(model?.name || '').replace(/^models\//, ''))
            .filter((name) => parseModelVersion(name));

        return [...new Set(names)].sort((a, b) => {
            const av = parseModelVersion(a);
            const bv = parseModelVersion(b);
            return (bv[0] - av[0]) || (bv[1] - av[1]);
        });
    } catch {
        return [];
    } finally {
        clearTimeout(timer);
    }
}

async function runModels({ models, file, apiKey, fetchImpl, timeoutMs, logger, requestId }) {
    const errors = [];
    for (const model of models) {
        logEvent(logger, 'info', 'gemini_request_started', { requestId, model, mimeType: file.mimeType, size: file.size });
        let attempt = await callGeminiModel({ model, file, apiKey, fetchImpl, timeoutMs, outputMode: 'structured' });

        if (!attempt.ok && attempt.status === 400 && /schema|responsejsonschema|responseformat|generationconfig/i.test(attempt.error)) {
            logEvent(logger, 'warn', 'gemini_structured_output_retry', { requestId, model, status: attempt.status, error: attempt.error });
            attempt = await callGeminiModel({ model, file, apiKey, fetchImpl, timeoutMs, outputMode: 'legacy-json' });
        }

        if (attempt.ok) {
            logEvent(logger, 'info', 'gemini_request_succeeded', { requestId, model, outputMode: attempt.outputMode });
            return { result: attempt.result, model, errors };
        }

        const item = { model, status: attempt.status, error: attempt.error };
        errors.push(item);
        logEvent(logger, 'warn', 'gemini_request_failed', { requestId, ...item });

        if (attempt.status === 401 || attempt.status === 403) break;
    }
    return { result: null, model: null, errors };
}

function formatErrorResponse(error, requestId) {
    if (error instanceof HttpError) {
        return {
            status: error.status,
            body: {
                error: error.message,
                code: error.code,
                stage: error.stage,
                requestId,
                ...(error.details ? { details: error.details } : {})
            }
        };
    }
    return {
        status: 500,
        body: {
            error: 'Erro interno inesperado na Edge Function.',
            code: 'UNEXPECTED_ERROR',
            stage: 'edge-function',
            requestId
        }
    };
}

export function createHandler(options = {}) {
    const env = options.env || {};
    const fetchImpl = options.fetchImpl || fetch;
    const logger = options.logger || console;
    const models = parseCsv(env.GEMINI_MODELS, DEFAULT_MODELS);
    const allowedOrigins = getAllowedOrigins(env);
    const maxFileBytes = Number(env.OCR_MAX_FILE_BYTES) || (10 * 1024 * 1024);
    const maxRequestBytes = Number(env.OCR_MAX_REQUEST_BYTES) || (15 * 1024 * 1024);
    const timeoutMs = Number(env.GEMINI_TIMEOUT_MS) || 35000;

    return async function handler(request) {
        const startedAt = Date.now();
        const requestId = makeRequestId(request.headers.get('x-request-id'));
        const origin = request.headers.get('origin') || '';
        const corsHeaders = createCorsHeaders(origin, allowedOrigins);

        if (request.method === 'OPTIONS') {
            if (origin && !allowedOrigins.includes(origin)) {
                return jsonResponse({ error: 'Origem não permitida.', code: 'ORIGIN_NOT_ALLOWED', requestId }, 403, corsHeaders);
            }
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        try {
            if (origin && !allowedOrigins.includes(origin)) {
                throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Origem não permitida.', 'cors');
            }

            const geminiApiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;

            if (request.method === 'GET') {
                return jsonResponse({
                    ok: true,
                    service: 'gemini-ocr',
                    requestId,
                    geminiKeyConfigured: Boolean(geminiApiKey),
                    models,
                    maxFileBytes
                }, 200, corsHeaders);
            }

            if (request.method !== 'POST') {
                throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST para executar o OCR.', 'request');
            }

            const publicKeys = getConfiguredPublicKeys(env);
            if (publicKeys.size === 0 && env.ALLOW_UNAUTHENTICATED !== 'true') {
                throw new HttpError(500, 'SUPABASE_KEYS_NOT_CONFIGURED', 'As chaves públicas do Supabase não estão disponíveis na função.', 'configuration');
            }
            if (publicKeys.size > 0 && !publicKeys.has(request.headers.get('apikey') || '')) {
                throw new HttpError(401, 'INVALID_SUPABASE_API_KEY', 'Chave pública do Supabase ausente ou inválida.', 'authentication');
            }
            if (!geminiApiKey) {
                throw new HttpError(500, 'GEMINI_API_KEY_MISSING', 'O segredo GEMINI_API_KEY não está configurado.', 'configuration');
            }

            const declaredLength = Number(request.headers.get('content-length')) || 0;
            if (declaredLength > maxRequestBytes) {
                throw new HttpError(413, 'REQUEST_TOO_LARGE', 'O corpo da requisição excede o limite da função.', 'request', { maxRequestBytes });
            }

            const rawBody = await request.text();
            const actualBytes = new TextEncoder().encode(rawBody).byteLength;
            if (actualBytes > maxRequestBytes) {
                throw new HttpError(413, 'REQUEST_TOO_LARGE', 'O corpo da requisição excede o limite da função.', 'request', { maxRequestBytes });
            }

            let payload;
            try {
                payload = JSON.parse(rawBody);
            } catch {
                throw new HttpError(400, 'INVALID_JSON', 'O body não contém JSON válido.', 'request');
            }

            logEvent(logger, 'info', 'ocr_request_received', { requestId, origin: origin || 'none', requestBytes: actualBytes });
            const file = extractFile(payload);
            if (file.size > maxFileBytes) {
                throw new HttpError(413, 'FILE_TOO_LARGE', 'O arquivo excede o limite permitido para OCR.', 'validation', { size: file.size, maxFileBytes });
            }
            logEvent(logger, 'info', 'ocr_file_validated', { requestId, mimeType: file.mimeType, size: file.size, name: file.name || undefined });

            let execution = await runModels({ models, file, apiKey: geminiApiKey, fetchImpl, timeoutMs, logger, requestId });

            const allConfiguredModelsMissing = execution.errors.length === models.length && execution.errors.every((item) => item.status === 404);
            if (!execution.result && allConfiguredModelsMissing) {
                const discovered = (await discoverStableFlashModels(geminiApiKey, fetchImpl, Math.min(timeoutMs, 15000)))
                    .filter((model) => !models.includes(model));
                if (discovered.length) {
                    logEvent(logger, 'warn', 'gemini_models_auto_discovered', { requestId, models: discovered });
                    const discoveredExecution = await runModels({ models: discovered, file, apiKey: geminiApiKey, fetchImpl, timeoutMs, logger, requestId });
                    execution = {
                        ...discoveredExecution,
                        errors: [...execution.errors, ...discoveredExecution.errors]
                    };
                }
            }

            if (!execution.result) {
                const authFailure = execution.errors.find((item) => item.status === 401 || item.status === 403);
                if (authFailure) {
                    throw new HttpError(502, 'GEMINI_AUTH_FAILED', 'A API do Gemini rejeitou a chave configurada.', 'gemini-auth', { attempts: execution.errors });
                }
                throw new HttpError(502, 'ALL_GEMINI_MODELS_FAILED', 'Todos os modelos Gemini configurados falharam.', 'gemini', { attempts: execution.errors });
            }

            const durationMs = Date.now() - startedAt;
            logEvent(logger, 'info', 'ocr_completed', { requestId, model: execution.model, durationMs });
            return jsonResponse({
                ...execution.result,
                _meta: {
                    requestId,
                    model: execution.model,
                    durationMs
                }
            }, 200, corsHeaders);
        } catch (error) {
            const formatted = formatErrorResponse(error, requestId);
            logEvent(logger, 'error', 'ocr_failed', {
                requestId,
                status: formatted.status,
                code: formatted.body.code,
                stage: formatted.body.stage,
                message: error?.message || String(error),
                durationMs: Date.now() - startedAt
            });
            return jsonResponse(formatted.body, formatted.status, corsHeaders);
        }
    };
}

export const internals = Object.freeze({
    extractFile,
    normalizeOcrResult,
    parseOcrJson,
    buildGeminiPayload,
    estimateBase64Bytes,
    DEFAULT_MODELS
});
