import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/gemini-ocr/core.js';

const PUBLIC_KEY = 'sb_publishable_test';
const BASE_ENV = {
    GEMINI_API_KEY: 'gemini-test-key',
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLIC_KEY }),
    ALLOWED_ORIGINS: 'https://brunogarcia7.github.io',
    GEMINI_MODELS: 'gemini-3.6-flash,gemini-3.5-flash'
};
const base64 = Buffer.from('fake-image-bytes').toString('base64');
const request = (body, headers = {}) => new Request('https://example.test/gemini-ocr', {
    method: 'POST',
    headers: {
        'content-type': 'application/json',
        apikey: PUBLIC_KEY,
        origin: 'https://brunogarcia7.github.io',
        ...headers
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});
const successResponse = () => new Response(JSON.stringify({
    candidates: [{
        content: {
            parts: [{
                text: JSON.stringify({
                    fornecedor: 'Locadora Exemplo',
                    equipamento: 'Betoneira 400L',
                    quantidade: 2,
                    valor: '1.250,00',
                    contrato: 'NF123'
                })
            }]
        }
    }]
}), { status: 200, headers: { 'content-type': 'application/json' } });
const silentLogger = { info() {}, warn() {}, error() {} };
let tests = 0;

{
    let requestBody;
    let requestHeaders;
    const handler = createHandler({
        env: BASE_ENV,
        logger: silentLogger,
        fetchImpl: async (_url, options) => {
            requestBody = JSON.parse(options.body);
            requestHeaders = options.headers;
            return successResponse();
        }
    });
    const response = await handler(request({ file: { mimeType: 'image/jpeg', data: base64, name: 'nf.jpg' } }));
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.fornecedor, 'Locadora Exemplo');
    assert.equal(json.quantidade, 2);
    assert.equal(json._meta.model, 'gemini-3.6-flash');
    assert.equal(requestHeaders['x-goog-api-key'], 'gemini-test-key');
    assert.equal(requestBody.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
    assert.equal(requestBody.generationConfig.responseFormat.text.mimeType, 'application/json');
    assert.equal(requestBody.generationConfig.responseFormat.text.schema.type, 'object');
    assert.equal('temperature' in requestBody.generationConfig, false);
    tests += 1;
}

{
    const calls = [];
    const handler = createHandler({
        env: BASE_ENV,
        logger: silentLogger,
        fetchImpl: async (url) => {
            calls.push(url);
            if (url.includes('gemini-3.6-flash')) {
                return new Response(JSON.stringify({ error: { message: 'Model not found' } }), { status: 404 });
            }
            return successResponse();
        }
    });
    const response = await handler(request({ file: { mimeType: 'application/pdf', data: base64 } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json())._meta.model, 'gemini-3.5-flash');
    assert.equal(calls.length, 2);
    tests += 1;
}

{
    let calls = 0;
    const handler = createHandler({
        env: { ...BASE_ENV, GEMINI_MODELS: 'gemini-3.6-flash' },
        logger: silentLogger,
        fetchImpl: async (_url, options) => {
            calls += 1;
            const body = JSON.parse(options.body);
            if (body.generationConfig.responseFormat?.text?.schema) {
                return new Response(JSON.stringify({ error: { message: 'Unsupported responseFormat schema' } }), { status: 400 });
            }
            return successResponse();
        }
    });
    const response = await handler(request({ file: { mimeType: 'image/png', data: base64 } }));
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    tests += 1;
}

{
    const legacyPayload = {
        contents: [{
            role: 'user',
            parts: [
                { text: 'prompt antigo' },
                { inline_data: { mime_type: 'application/pdf', data: base64 } }
            ]
        }]
    };
    const handler = createHandler({ env: BASE_ENV, fetchImpl: async () => successResponse(), logger: silentLogger });
    const response = await handler(request(legacyPayload));
    assert.equal(response.status, 200);
    tests += 1;
}

{
    const handler = createHandler({ env: BASE_ENV, fetchImpl: async () => successResponse(), logger: silentLogger });
    const response = await handler(request({ file: { mimeType: 'image/jpeg', data: 'not-base64!' } }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_BASE64');
    tests += 1;
}

{
    const handler = createHandler({ env: BASE_ENV, fetchImpl: async () => successResponse(), logger: silentLogger });
    const response = await handler(request(
        { file: { mimeType: 'image/jpeg', data: base64 } },
        { apikey: 'wrong' }
    ));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'INVALID_SUPABASE_API_KEY');
    tests += 1;
}

{
    const handler = createHandler({
        env: BASE_ENV,
        logger: silentLogger,
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 })
    });
    const response = await handler(request({ file: { mimeType: 'image/jpeg', data: base64 } }));
    assert.equal(response.status, 502);
    const json = await response.json();
    assert.equal(json.code, 'ALL_GEMINI_MODELS_FAILED');
    assert.equal(json.details.attempts.length, 2);
    assert.equal(json.details.attempts[0].status, 429);
    tests += 1;
}

{
    const handler = createHandler({ env: BASE_ENV, fetchImpl: async () => successResponse(), logger: silentLogger });
    const response = await handler(request('{invalid-json'));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_JSON');
    tests += 1;
}

console.log(`ocr-core.test.mjs: ${tests} testes aprovados`);
