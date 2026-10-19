import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/contrato-multiplos-itens.json', import.meta.url), 'utf8'));
const codigoItens = readFileSync(new URL('../js/ocr-itens.js', import.meta.url), 'utf8');
const codigoApp = readFileSync(new URL('../js/mobile-app.js', import.meta.url), 'utf8');

// DOM mínimo para exercitar os controladores reais, sem acesso a serviços externos.
function no() {
    const eventos = new Map();
    return {
        dataset: {}, style: {}, value: '', disabled: false, textContent: '', hidden: false,
        setAttribute(nome, valor) { this[nome] = valor; },
        focus() { this.focused = true; },
        addEventListener(nome, callback) { eventos.set(nome, callback); },
        disparar(nome, evento = {}) { return eventos.get(nome)?.(evento); }
    };
}

function linha() {
    const campos = ['equipamento', 'quantidade', 'valor', 'valor_indenizacao'].map((chave) => {
        const campo = no(); campo.dataset.campo = chave; return campo;
    });
    const labels = Object.fromEntries(campos.map((campo) => [campo.dataset.campo, no()]));
    const partes = {
        '[data-titulo-item]': no(), '[data-codigo-item]': no(),
        '[data-remover-item]': no(), '[data-ajuda-indenizacao]': no()
    };
    return {
        ...no(), campos, partes,
        cloneNode() { return linha(); },
        querySelectorAll(seletor) {
            if (seletor === '[data-campo]') return campos;
            if (seletor === '[data-remover-item]') return [partes[seletor]];
            const chave = seletor.match(/^\[data-campo="([^"]+)"\]$/)?.[1];
            return campos.filter((campo) => campo.dataset.campo === chave);
        },
        querySelector(seletor) {
            const chave = seletor.match(/^\[data-label-campo="([^"]+)"\]$/)?.[1];
            return partes[seletor] || labels[chave] || this.querySelectorAll(seletor)[0] || null;
        }
    };
}

function ambiente({ inserir = async () => ({ error: null }), fetchImpl = async () => { throw new Error('Fetch não esperado'); } } = {}) {
    const elementos = new Map();
    for (const id of ['foto-camera', 'foto-arquivo', 'btn-camera', 'btn-arquivo', 'btn-repetir-ocr', 'btn-enviar-sistema', 'foto-status', 'loader-ia', 'loader-salvar', 'mobile-cloud-status', 'btn-adicionar-item', 'resumo-itens', 'aviso-conferencia', 'obra', 'fornecedor', 'contrato', 'tipo', 'periodo', 'data-inicio', 'data-fim', 'lista-obras']) {
        elementos.set(id, no());
    }
    elementos.get('tipo').value = 'Locação';
    elementos.get('periodo').value = 'Mês';
    elementos.get('lista-obras').replaceChildren = () => {};
    const lista = {
        ...no(), linhas: [linha()],
        querySelectorAll(seletor) {
            return seletor === '.item-cadastro' ? this.linhas : this.linhas.flatMap((l) => l.querySelectorAll(seletor));
        },
        querySelector(seletor) { return this.querySelectorAll(seletor)[0] || null; },
        replaceChildren(fragmento) { this.linhas = fragmento.children; }
    };
    elementos.set('itens-cadastro', lista);
    const chamadas = { inserts: [], uploads: 0, limpezas: 0, avisos: [] };
    const documento = {
        getElementById(id) { return elementos.get(id) || lista.linhas.flatMap((l) => l.campos).find((c) => c.id === id) || null; },
        createElement: () => no(),
        createDocumentFragment: () => ({ children: [], appendChild(filho) { this.children.push(filho); } }),
        querySelectorAll: () => [...elementos.values(), ...lista.linhas.flatMap((l) => l.campos)]
    };
    const db = { from() { return {
        select: async () => ({ data: [], error: null }),
        insert: async (itens) => {
            chamadas.inserts.push(structuredClone(itens));
            return inserir(itens);
        }
    }; } };
    const contexto = vm.createContext({
        document: documento, Intl, Date, URL, AbortController, setTimeout, clearTimeout, fetch: fetchImpl,
        CONFIG: { SUPABASE_URL: 'https://exemplo.supabase.co', SUPABASE_KEY: 'sb_publishable_test' },
        supabase: { createClient: () => db },
        StorageService: {
            uploadPreparado: async () => { chamadas.uploads++; return { created: true, publicUrl: 'https://example.test/anexo.webp' }; },
            removerSeSemReferencia: async () => { chamadas.limpezas++; },
            mensagemEconomia: () => ''
        },
        sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        alert: (mensagem) => chamadas.avisos.push(mensagem),
        console: { info() {}, warn() {}, error() {} },
        addEventListener() {}
    });
    contexto.window = contexto;
    vm.runInContext(codigoItens, contexto);
    vm.runInContext(codigoApp, contexto);
    return { contexto, lista, chamadas, elemento: (id) => documento.getElementById(id) };
}

test('formulário real apresenta cada linha e seus campos de indenização', () => {
    const a = ambiente();
    a.contexto.preencherFormularioComOCR(structuredClone(fixture));
    assert.equal(a.lista.linhas.length, 5);
    assert.equal(a.elemento('valor').value, 100);
    assert.equal(a.elemento('valor-indenizacao').value, 1060);
    assert.equal(a.elemento('item-2-valor').value, 0);
    assert.equal(a.elemento('item-5-valor-indenizacao').value, 580);
    assert.equal(a.elemento('data-inicio').value, '2026-09-08');
    assert.equal(a.elemento('data-fim').value, '2026-10-08');
    assert.match(a.elemento('resumo-itens').textContent, /5 itens · 16 unidades/);
    assert.equal(a.elemento('aviso-conferencia').hidden, true);
    const ids = a.lista.linhas.flatMap((l) => l.campos.map((c) => c.id));
    assert.equal(new Set(ids).size, ids.length);
});

test('envio grava cinco equipamentos em uma operação, compartilha o anexo e limpa após sucesso', async () => {
    const a = ambiente();
    a.elemento('obra').value = 'Obra de teste';
    a.contexto.preencherFormularioComOCR(structuredClone(fixture));
    vm.runInContext('arquivoAnexoGlobal = {}; anexoPreparadoGlobal = {};', a.contexto);
    await a.contexto.salvarDados();
    assert.equal(a.chamadas.inserts.length, 1);
    assert.equal(a.chamadas.uploads, 1);
    const lote = a.chamadas.inserts[0];
    assert.equal(lote.length, 5);
    assert.equal(lote.reduce((soma, item) => soma + item.valor, 0), 265);
    assert.equal(lote.reduce((soma, item) => soma + item.valor_indenizacao, 0), 3583);
    assert.ok(lote.every((item) => item.anexo === 'https://example.test/anexo.webp'));
    assert.equal(a.lista.linhas.length, 1);
    assert.equal(a.elemento('equipamento').value, '');
    assert.equal(a.elemento('obra').value, 'Obra de teste');
    assert.match(a.chamadas.avisos[0], /5 itens salvos/);
});

test('linha incompleta impede qualquer upload ou gravação e mantém as demais para correção', async () => {
    const a = ambiente();
    a.elemento('obra').value = 'Obra de teste';
    a.contexto.preencherFormularioComOCR(structuredClone(fixture));
    a.elemento('item-4-equipamento').value = '';
    await a.contexto.salvarDados();
    assert.equal(a.chamadas.inserts.length, 0);
    assert.equal(a.chamadas.uploads, 0);
    assert.equal(a.lista.linhas.length, 5);
    assert.match(a.chamadas.avisos[0], /item 4/);
});

test('adicionar e remover linhas preserva a edição dos demais itens', () => {
    const a = ambiente();
    a.contexto.preencherFormularioComOCR(structuredClone(fixture));
    a.elemento('valor').value = '110';
    a.elemento('btn-adicionar-item').disparar('click');
    assert.equal(a.lista.linhas.length, 6);
    assert.equal(a.elemento('valor').value, '110');
    const botao = a.lista.linhas[5].partes['[data-remover-item]'];
    a.lista.disparar('click', { target: { closest: () => botao } });
    assert.equal(a.lista.linhas.length, 5);
    assert.equal(a.elemento('valor').value, '110');
    assert.equal(a.elemento('valor-indenizacao').value, 1060);
});

test('falha de banco preserva a revisão e trata anexo sem registro', async () => {
    const a = ambiente({ inserir: async () => ({ error: new Error('Falha simulada') }) });
    a.elemento('obra').value = 'Obra de teste';
    a.contexto.preencherFormularioComOCR(structuredClone(fixture));
    vm.runInContext('arquivoAnexoGlobal = {}; anexoPreparadoGlobal = {};', a.contexto);
    await a.contexto.salvarDados();
    assert.equal(a.lista.linhas.length, 5);
    assert.equal(a.chamadas.limpezas, 1);
    assert.match(a.chamadas.avisos[0], /Falha simulada/);
});

test('segundo acionamento durante envio não cria outro lote', async () => {
    let concluir;
    const a = ambiente({ inserir: () => new Promise((resolve) => { concluir = resolve; }) });
    a.elemento('obra').value = 'Obra de teste';
    a.contexto.preencherFormularioComOCR(structuredClone(fixture));
    const primeiro = a.contexto.salvarDados();
    await a.contexto.salvarDados();
    assert.equal(a.chamadas.inserts.length, 1);
    concluir({ error: null });
    await primeiro;
});

test('nova tentativa reaproveita o documento após 503 e preenche as cinco linhas quando recupera', async () => {
    const pedidos = [];
    const a = ambiente({ fetchImpl: async (_url, options) => {
        pedidos.push(JSON.parse(options.body));
        return pedidos.length === 1
            ? Response.json({ error: 'O serviço de leitura está temporariamente ocupado.', code: 'GEMINI_BUSY', requestId: 'teste-503' }, { status: 503 })
            : Response.json(structuredClone(fixture));
    } });
    vm.runInContext("arquivoOCRPreparadoGlobal = {name:'contrato.webp', mimeType:'image/webp', size:4, data:'ZmFrZQ=='}; anexoPreparadoGlobal = {}; arquivoAnexoGlobal = {};", a.contexto);
    await a.contexto.repetirLeituraOCR();
    assert.equal(a.elemento('btn-repetir-ocr').hidden, false);
    assert.match(a.elemento('loader-ia').innerText, /temporariamente ocupado/);
    await a.elemento('btn-repetir-ocr').disparar('click');
    assert.equal(pedidos.length, 2);
    assert.deepEqual(pedidos[0].file, pedidos[1].file);
    assert.equal(a.chamadas.uploads, 0);
    assert.equal(a.lista.linhas.length, 5);
    assert.equal(a.elemento('btn-repetir-ocr').hidden, true);
});

test('limpar o documento descarta a imagem da nova tentativa', async () => {
    let calls = 0;
    const a = ambiente({ fetchImpl: async () => { calls++; return Response.json({ error: 'Ocupado', code: 'GEMINI_BUSY' }, { status: 503 }); } });
    vm.runInContext("arquivoOCRPreparadoGlobal = {name:'contrato.webp', mimeType:'image/webp', size:4, data:'ZmFrZQ=='}; anexoPreparadoGlobal = {}; arquivoAnexoGlobal = {};", a.contexto);
    await a.contexto.repetirLeituraOCR();
    a.contexto.limparDadosDoDocumento();
    assert.equal(a.elemento('btn-repetir-ocr').hidden, true);
    await a.contexto.repetirLeituraOCR();
    assert.equal(calls, 1);
});
