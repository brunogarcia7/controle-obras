import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createHandler, internals } from '../supabase/functions/gemini-ocr/core.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/contrato-multiplos-itens.json', import.meta.url), 'utf8'));
const contexto = vm.createContext({});
vm.runInContext(readFileSync(new URL('../js/ocr-itens.js', import.meta.url), 'utf8'), contexto);
const api = contexto.OCRItens;
const copy = (valor = fixture) => structuredClone(valor);
const dadosCadastro = (itens) => ({ ...fixture, obra: 'Obra de teste', tipo: 'Locação', itens });

test('normalização mantém as cinco linhas, quantidades, dimensões e aluguel zero do contrato de referência', () => {
    const result = internals.normalizeOcrResult(copy());
    assert.equal(result.itens.length, 5);
    assert.deepEqual(result.itens.map((item) => item.codigo), ['78', '51', '52', '154', '54']);
    assert.equal(result.itens.reduce((soma, item) => soma + item.quantidade, 0), 16);
    assert.equal(result.itens[1].valor, '0,00');
    assert.equal(result.itens[0].valor, '100,00');
    assert.equal(result.itens[0].valor_indenizacao, '1.060,00');
    assert.match(result.itens[2].equipamento, /0,33m/);
    assert.deepEqual(result.avisos, []);
});

test('totais por linha não são multiplicados novamente nem substituídos pelo total do contrato', () => {
    const leitura = api.normalizarResposta(internals.normalizeOcrResult(copy()));
    const resumo = api.resumir(leitura.itens);
    const payload = api.criarPayloads(dadosCadastro(leitura.itens), 'https://example.test/contrato.webp', '2026-10-19');
    assert.equal(resumo.valor, 26500);
    assert.equal(resumo.valor_indenizacao, 358300);
    assert.equal(payload.length, 5);
    assert.deepEqual(Array.from(payload, (item) => item.valor), [100, 0, 45, 60, 60]);
    assert.deepEqual(Array.from(payload, (item) => item.valor_indenizacao), [1060, 108, 855, 980, 580]);
    assert.ok(payload.every((item) => item.contrato === '012004/A' && item.data_inicio === '2026-09-08' && item.data_fim === '2026-10-08'));
    assert.ok(payload.every((item) => item.anexo === 'https://example.test/contrato.webp'));
});

test('linhas com descrição/código iguais continuam independentes', () => {
    const dados = copy();
    dados.itens.push(copy(dados.itens[0]));
    dados.total_itens = 6;
    const result = internals.normalizeOcrResult(dados);
    assert.equal(result.itens.length, 6);
    assert.equal(api.normalizarResposta(result).itens.length, 6);
});

test('leitura parcial e divergência dos totais geram avisos em vez de sucesso silencioso', () => {
    const dados = copy();
    dados.itens.pop();
    const result = internals.normalizeOcrResult(dados);
    assert.equal(result.itens.length, 4);
    assert.ok(result.avisos.some((aviso) => /5 linhas.*4 itens/.test(aviso)));
    assert.ok(result.avisos.some((aviso) => /soma de locação/.test(aviso)));
    assert.ok(result.avisos.some((aviso) => /soma de indenização/.test(aviso)));
});

test('lista vazia ou inválida não cai silenciosamente no equipamento principal', () => {
    for (const itens of [[], null, {}, 'texto']) {
        const dados = { ...fixture, equipamento: 'Agrupado', itens };
        assert.throws(() => internals.normalizeOcrResult(dados));
        assert.throws(() => api.normalizarResposta(dados));
    }
    assert.throws(() => internals.normalizeOcrResult({ ...fixture, itens: [null] }));
});

test('resposta antiga continua legível e avisa que outros itens podem estar faltando', () => {
    const antigo = { equipamento: 'Betoneira', quantidade: 2, valor: '50,00', valor_indenizacao: '1.000,00' };
    const result = internals.normalizeOcrResult(antigo);
    assert.equal(result.itens.length, 1);
    assert.ok(result.avisos.length > 0);
    const leitura = api.normalizarResposta(antigo);
    assert.equal(leitura.itens[0].valor_indenizacao, 1000);
    assert.ok(leitura.avisos.length > 0);
});

test('valores monetários distinguem zero, vazio, milhares e valores inválidos', () => {
    for (const [texto, esperado] of [['R$ 1.060,00', 1060], ['3.583', 3583], ['3583.50', 3583.5], [0, 0], ['0,00', 0], ['', null], [null, null], ['-10', null], ['inválido', null]]) {
        assert.equal(api.moeda(texto), esperado, String(texto));
    }
    const leitura = api.normalizarResposta({ ...fixture, itens: [{ equipamento: 'Teste', quantidade: 1, valor: '', valor_indenizacao: '' }] });
    assert.equal(leitura.itens[0].valor, '');
    assert.throws(() => api.criarPayloads(dadosCadastro(leitura.itens), null, '2026-10-19'), /valor total/);
});

test('qualquer linha inválida bloqueia a criação do lote completo', () => {
    for (const alteracao of [{ equipamento: '' }, { quantidade: 0 }, { quantidade: 1.5 }, { valor: -10 }, { valor: '' }, { valor_indenizacao: -5 }]) {
        const itens = api.normalizarResposta(copy()).itens;
        itens[3] = { ...itens[3], ...alteracao };
        assert.throws(() => api.criarPayloads(dadosCadastro(itens), null, '2026-10-19'), /item 4/);
    }
});

test('datas são conferidas e cadastro de compra mantém o tratamento de patrimônio próprio', () => {
    const itens = api.normalizarResposta(copy()).itens;
    assert.equal(api.dataISO('2026-02-30'), '');
    assert.throws(() => api.criarPayloads({ ...dadosCadastro(itens), data_fim: '2026-08-01' }, null, '2026-10-19'), /vencimento/);
    const payload = api.criarPayloads({ ...dadosCadastro(itens), tipo: 'Compra' }, null, '2026-10-19');
    assert.ok(payload.every((item) => item.unidade === 'Proprio' && item.data_fim === item.data_inicio));
});

function requisicao() {
    return new Request('https://example.test/gemini-ocr', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_test' },
        body: JSON.stringify({ file: { mimeType: 'image/webp', data: Buffer.from('imagem-simulada').toString('base64') } })
    });
}

const env = { GEMINI_API_KEY: 'chave-teste', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', GEMINI_MODELS: 'gemini-teste' };
const logger = { info() {}, warn() {}, error() {} };

test('endpoint entrega todas as linhas e metadados de versão para o cadastro móvel', async () => {
    let enviado;
    const handler = createHandler({ env, logger, fetchImpl: async (_url, options) => {
        enviado = JSON.parse(options.body);
        return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(copy()) }] } }] });
    } });
    const response = await handler(requisicao());
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result._meta.schemaVersion, 2);
    assert.equal(result._meta.itemCount, 5);
    assert.equal(api.normalizarResposta(result).itens.length, 5);
    assert.equal(enviado.generationConfig.responseFormat.text.schema.properties.itens.type, 'array');
});

test('resposta cortada por limite de tokens não é aceita como leitura completa', async () => {
    const handler = createHandler({ env, logger, fetchImpl: async () => Response.json({
        candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(copy()) }] } }]
    }) });
    const response = await handler(requisicao());
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'OCR_TRUNCATED_RESPONSE');
});
