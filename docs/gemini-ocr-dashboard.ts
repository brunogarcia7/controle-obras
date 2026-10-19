// @ts-nocheck
// Gerado por scripts/gerar-ocr-dashboard.mjs. Cole todo este arquivo no index.ts da função gemini-ocr.
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
        valor_total: {
            type: 'string',
            description: 'Total de locação ou compra do documento. Não é o valor de reposição dos equipamentos. Vazio se ausente.'
        },
        valor_indenizacao_total: {
            type: 'string',
            description: 'Total de reposição/indenização de todos os equipamentos. Vazio se ausente.'
        },
        data_inicio: { type: 'string', description: 'Data inicial da locação/compra em YYYY-MM-DD; vazio se ausente.' },
        data_fim: { type: 'string', description: 'Data final da locação em YYYY-MM-DD; vazio se ausente.' },
        periodo: { type: 'string', description: 'Dia, Semana ou Mês, conforme o documento; vazio se ausente.' },
        total_itens: { type: 'integer', minimum: 1, description: 'Número de linhas de equipamentos do documento, não a soma das quantidades.' },
        itens: {
            type: 'array',
            minItems: 1,
            description: 'TODAS as linhas de equipamentos, na ordem do documento. Uma entrada por linha; nunca agrupar ou escolher apenas o principal.',
            items: {
                type: 'object',
                properties: {
                    codigo: { type: 'string', description: 'Código da linha; vazio se ausente.' },
                    equipamento: { type: 'string', description: 'Descrição completa desta linha, incluindo dimensões e características.' },
                    quantidade: { type: 'integer', minimum: 1 },
                    valor: { type: 'string', description: 'Total de locação/compra DESTA linha, para sua quantidade. Inclua linhas com 0,00. Vazio se ilegível ou ausente.' },
                    valor_indenizacao: { type: 'string', description: 'Total de indenização/reposição DESTA linha para sua quantidade. Colunas como Vlr. Equip. Total não são aluguel. Vazio se ausente.' }
                },
                required: ['codigo', 'equipamento', 'quantidade', 'valor', 'valor_indenizacao'],
                additionalProperties: false
            }
        },
        avisos: {
            type: 'array',
            items: { type: 'string' },
            description: 'Trechos ilegíveis, linhas incompletas e dúvidas que precisam de revisão; vazio quando não houver.'
        },
        contrato: {
            type: 'string',
            description: 'Número do contrato, pedido, fatura ou nota fiscal; vazio quando ausente.'
        }
    },
    required: ['fornecedor', 'contrato', 'data_inicio', 'data_fim', 'periodo', 'valor_total', 'valor_indenizacao_total', 'total_itens', 'itens', 'avisos'],
    additionalProperties: false
});

const OCR_PROMPT = `Analise todas as páginas do documento brasileiro anexado (contrato, nota fiscal, recibo ou fatura) e extraia os campos do esquema JSON, incluindo a lista itens.
Regras obrigatórias:
- fornecedor: empresa emissora/vendedora/locadora; nunca o destinatário/cliente;
- percorra a tabela de equipamentos de cima para baixo e TODAS as páginas. Cada linha vira um objeto em itens, mesmo que tenha descrição ou código repetido. NUNCA agrupe acessórios, some quantidades de linhas diferentes ou escolha apenas o equipamento principal;
- inclua acessórios e linhas com locação de R$ 0,00. Não descarte travas, pisos, rodízios, guarda-corpos ou peças sem patrimônio;
- equipamento: transcreva toda a descrição da linha, incluindo medidas e características. Remova somente prefixos como LOCAÇÃO DE ou ALUGUEL DE;
- quantidade: quantidade desta linha, não o código/patrimônio. Use 1 apenas quando não houver quantidade explícita;
- itens[].valor: TOTAL de aluguel/compra desta linha. Não repita o total do contrato em cada item. Se existir só valor unitário explicitamente identificado, multiplique pela quantidade. Uma coluna Vlr. Locação pode já representar o total da linha: confira com o total do contrato e não multiplique novamente;
- itens[].valor_indenizacao: TOTAL de reposição/indenização da linha. Colunas Vlr. Equip. Total, valor do equipamento e reposição são indenização, não aluguel. Se houver só indenização unitária, multiplique pela quantidade. Nunca copie o total geral de reposição para cada item;
- valor_total e valor_indenizacao_total são os totais gerais impressos, usados para conferência. Não distribua diferenças, frete, multas ou descontos entre linhas;
- valores monetários: preserve os separadores impressos; use string vazia se ausentes/ilegíveis. Zero impresso é "0,00", nunca vazio;
- total_itens: conte as linhas da tabela independentemente da extração e compare com o tamanho da lista. Não conte cabeçalhos, frete ou totais como equipamentos;
- data_inicio, data_fim: copie as datas do contrato em YYYY-MM-DD; periodo: Dia, Semana ou Mês; vazios se ausentes;
- contrato: número do contrato, pedido, fatura ou nota fiscal; use string vazia quando não existir;
- avisos: informe linhas ilegíveis, omissões e valores cuja coluna não pôde ser identificada. Não invente dados e não acrescente texto fora do JSON.`;

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
    const generationConfig = { maxOutputTokens: 16384 };

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
                { text: outputMode === 'legacy-json' ? `${OCR_PROMPT}\nEsquema JSON obrigatório: ${JSON.stringify(OCR_SCHEMA)}` : OCR_PROMPT },
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
    if (candidates[0]?.finishReason === 'MAX_TOKENS') {
        throw new HttpError(502, 'OCR_TRUNCATED_RESPONSE',
            'A leitura foi interrompida antes de concluir todos os itens. Envie o documento em partes e confira as linhas.',
            'gemini-response');
    }
    const parts = candidates[0]?.content?.parts;
    const text = Array.isArray(parts)
        ? parts.filter((part) => part?.thought !== true).map((part) => typeof part?.text === 'string' ? part.text : '').join('').trim()
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

    if ('itens' in value && (!Array.isArray(value.itens) || value.itens.length === 0)) {
        throw new HttpError(502, 'OCR_ITEMS_MISSING', 'O OCR não retornou a lista de equipamentos. Revise a imagem ou preencha os itens manualmente.', 'normalization');
    }
    const legacy = !Array.isArray(value.itens);
    const itens = (legacy ? [value] : value.itens).map((item, indice) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new HttpError(502, 'INVALID_OCR_ITEM', `O item ${indice + 1} não foi retornado corretamente.`, 'normalization');
        }
        const quantity = Number.parseInt(item.quantidade, 10);
        return {
            codigo: cleanText(item.codigo, 80),
            equipamento: cleanText(item.equipamento, 500),
            quantidade: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            valor: cleanText(item.valor, 80),
            valor_indenizacao: cleanText(item.valor_indenizacao, 80)
        };
    });
    if (!itens.some((item) => item.equipamento)) {
        throw new HttpError(502, 'OCR_ITEMS_MISSING', 'Não foi possível identificar equipamentos no documento.', 'normalization');
    }
    const avisos = (Array.isArray(value.avisos) ? value.avisos : []).map((v) => cleanText(v, 400)).filter(Boolean);
    const totalInformado = Number.parseInt(value.total_itens, 10);
    if (legacy) avisos.push('O modelo retornou somente um item no formato antigo. Confira todas as linhas do documento e adicione as faltantes.');
    if (Number.isFinite(totalInformado) && totalInformado !== itens.length) {
        avisos.push(`Leitura parcial: o documento indica ${totalInformado} linhas, mas foram retornados ${itens.length} itens. Confira e adicione as linhas faltantes.`);
    }
    itens.forEach((item, indice) => {
        if (!item.equipamento || monetaryCents(item.valor) === null) {
            avisos.push(`Revise a descrição e o valor de locação/compra do item ${indice + 1}.`);
        }
    });
    const valorTotal = cleanText(value.valor_total ?? (legacy ? value.valor : ''), 80);
    const indenizacaoTotal = cleanText(value.valor_indenizacao_total, 80);
    for (const [campo, total, rotulo] of [
        ['valor', valorTotal, 'locação/compra'],
        ['valor_indenizacao', indenizacaoTotal, 'indenização']
    ]) {
        const esperado = monetaryCents(total);
        const valores = itens.map((item) => monetaryCents(item[campo]));
        if (esperado !== null && valores.every((v) => v !== null) && valores.reduce((soma, v) => soma + v, 0) !== esperado) {
            avisos.push(`A soma de ${rotulo} dos itens difere do total impresso. Confira todas as linhas, frete e descontos antes de enviar.`);
        }
    }
    return {
        fornecedor: cleanText(value.fornecedor, 180),
        contrato: cleanText(value.contrato, 120),
        data_inicio: cleanText(value.data_inicio, 10),
        data_fim: cleanText(value.data_fim, 10),
        periodo: cleanText(value.periodo, 30),
        valor_total: valorTotal,
        valor_indenizacao_total: indenizacaoTotal,
        total_itens: Number.isFinite(totalInformado) && totalInformado > 0 ? totalInformado : itens.length,
        itens,
        avisos: [...new Set(avisos)],
        // Compatibilidade com o formulário anterior de um único equipamento.
        equipamento: itens[0].equipamento,
        quantidade: itens[0].quantidade,
        valor: itens[0].valor,
        valor_indenizacao: itens[0].valor_indenizacao
    };
}

function monetaryCents(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    let text = String(value).replace(/R\$|\s/g, '');
    if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? Math.round(number * 100) : null;
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
                    schemaVersion: 2,
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
                    schemaVersion: 2,
                    itemCount: execution.result.itens.length,
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

const handler = createHandler({
    env: Deno.env.toObject(),
    fetchImpl: fetch,
    logger: console
});

Deno.serve(handler);
