import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHandler } from '../supabase/functions/gemini-ocr/core.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/contrato-multiplos-itens.json', import.meta.url), 'utf8'));
const env = {
    GEMINI_API_KEY: 'chave-simulada', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    GEMINI_MODELS: 'gemini-3.6-flash,gemini-3.5-flash'
};
const logger = { info() {}, warn() {}, error() {} };
const success = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(fixture) }] } }] });
const unavailable = (headers = {}) => Response.json({ error: { message: 'This model is currently experiencing high demand.' } }, { status: 503, headers });
const request = () => new Request('https://example.test/gemini-ocr', {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_test' },
    body: JSON.stringify({ file: { mimeType: 'image/webp', data: Buffer.from('imagem-de-teste').toString('base64') } })
});

function ambiente(fetchImpl, overrides = {}) {
    let clock = 0;
    const waits = [];
    const handler = createHandler({
        env: { ...env, ...overrides }, logger, fetchImpl, randomImpl: () => 0,
        nowImpl: () => clock,
        sleepImpl: async (ms) => { waits.push(ms); clock += ms; }
    });
    return { handler, waits, advance: (ms) => { clock += ms; } };
}

test('503 transitório é repetido uma vez e entrega todos os equipamentos quando recupera', async () => {
    let calls = 0;
    const a = ambiente(async () => ++calls === 1 ? unavailable() : success());
    const response = await a.handler(request());
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.itens.length, 5);
    assert.equal(data._meta.recoveryVersion, 1);
    assert.equal(calls, 2);
    assert.deepEqual(a.waits, [1000]);
});

test('falha persistente no primeiro modelo permite sucesso no segundo', async () => {
    const calls = [];
    const a = ambiente(async (url) => {
        calls.push(url);
        return url.includes('gemini-3.6-flash:') ? unavailable() : success();
    });
    const response = await a.handler(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json())._meta.model, 'gemini-3.5-flash');
    assert.equal(calls.length, 3);
});

test('503 nos modelos preferidos consulta o catálogo da chave e tenta Flash-Lite estável disponível', async () => {
    const calls = [];
    const a = ambiente(async (url) => {
        calls.push(url);
        if (url.includes('/models?')) return Response.json({ models: [
            { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.1-flash-lite-001', baseModelId: 'gemini-3.1-flash-lite', outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-4-pro', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-4-flash-preview', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-1.5-flash', outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-4-flash', supportedGenerationMethods: ['embedContent'] }
        ] });
        return url.includes('gemini-3.1-flash-lite:') ? success() : unavailable();
    });
    const response = await a.handler(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json())._meta.model, 'gemini-3.1-flash-lite');
    assert.equal(calls.length, 6);
    assert.ok(!calls.some((url) => /gemini-4-pro:|preview:|gemini-1.5-flash:/.test(url)));
});

test('indisponibilidade em todos os candidatos termina sem loop e retorna mensagem curta em português', async () => {
    let calls = 0;
    const a = ambiente(async (url) => {
        calls++;
        if (url.includes('/models?')) return Response.json({ models: [
            { name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }
        ] });
        return unavailable();
    });
    const response = await a.handler(request());
    const data = await response.json();
    assert.equal(response.status, 503);
    assert.equal(data.code, 'GEMINI_BUSY');
    assert.match(data.error, /temporariamente ocupado/);
    assert.equal(data.details.attempts, undefined);
    assert.equal(data.details.retryAfterSeconds, 10);
    assert.equal(calls, 9); // dois preferidos, dois descobertos, duas tentativas cada e uma consulta
    assert.equal(a.waits.length, 4);
});

test('Retry-After curto é respeitado na repetição da mesma chamada', async () => {
    let calls = 0;
    const a = ambiente(async () => ++calls === 1 ? unavailable({ 'retry-after': '3' }) : success());
    assert.equal((await a.handler(request())).status, 200);
    assert.deepEqual(a.waits, [3000]);
});

test('credencial rejeitada não é repetida nem inicia descoberta de modelos', async () => {
    let calls = 0;
    const a = ambiente(async () => { calls++; return Response.json({ error: { message: 'Invalid API key' } }, { status: 403 }); });
    const response = await a.handler(request());
    assert.equal((await response.json()).code, 'GEMINI_AUTH_FAILED');
    assert.equal(calls, 1);
    assert.deepEqual(a.waits, []);
});

test('erros de parâmetros não são tratados como indisponibilidade transitória', async () => {
    let calls = 0;
    const a = ambiente(async () => { calls++; return Response.json({ error: { message: 'Invalid request' } }, { status: 400 }); });
    const response = await a.handler(request());
    assert.equal((await response.json()).code, 'ALL_GEMINI_MODELS_FAILED');
    assert.equal(calls, 2);
    assert.deepEqual(a.waits, []);
});

test('orçamento total encerrado impede novas chamadas ou esperas', async () => {
    let calls = 0;
    let a;
    a = ambiente(async () => { calls++; a.advance(61000); return unavailable(); });
    const response = await a.handler(request());
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'GEMINI_BUSY');
    assert.equal(calls, 1);
    assert.deepEqual(a.waits, []);
});

test('quantidade excessiva de repetições configurada é limitada e usa espera crescente', async () => {
    let calls = 0;
    const a = ambiente(async () => { calls++; return unavailable(); }, {
        GEMINI_MODELS: 'gemini-3.6-flash', GEMINI_MAX_RETRIES: '999', GEMINI_AUTO_DISCOVER: 'false'
    });
    assert.equal((await a.handler(request())).status, 503);
    assert.equal(calls, 3);
    assert.deepEqual(a.waits, [1000, 2000]);
});
