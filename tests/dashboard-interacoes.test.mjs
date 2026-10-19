import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Integra os módulos reais com um DOM mínimo. Não acessa o Supabase.
const fontes = ['config', 'utils', 'ui', 'alertas', 'app'].map((nome) => ({
    nome,
    codigo: readFileSync(new URL(`../js/${nome}.js`, import.meta.url), 'utf8')
}));

const locacao = (id, extras = {}) => ({
    id,
    obra: 'Norte',
    fornecedor: 'Alfa',
    equipamento: `Equipamento ${id}`,
    contrato: `C-${id}`,
    quantidade: 1,
    status: 'ativo',
    unidade: 'Dia',
    data_inicio: '2026-10-01',
    data_fim: '2026-10-18',
    ...extras
});

const registros = () => [
    locacao(1, { equipamento: 'Betoneira' }),
    locacao(2, { obra: 'Sul', fornecedor: 'Beta', equipamento: 'Andaime', data_inicio: '2026-10-02' }),
    locacao(3, { data_fim: '2026-10-19' }),
    locacao(4, { data_fim: '2026-10-25' }),
    locacao(5, { status: 'inativo' }),
    locacao(6, { status: 'excluido' }),
    locacao(7, { unidade: 'Patrimônio Próprio' }),
    locacao(8, { data_fim: null }),
    locacao(9, { data_fim: '2026-02-30' })
];

function ambiente({ dados = registros(), armazenamento = new Map() } = {}) {
    const elementos = new Map();
    const erros = [];
    const documento = {
        readyState: 'loading',
        activeElement: null,
        addEventListener() {},
        getElementById: (id) => elementos.get(id) || null,
        querySelectorAll(seletor) {
            if (seletor === '.secao-tabela') {
                return [...elementos.values()].filter((el) => el.id.startsWith('secao-') && el.id !== 'secao-metricas');
            }
            if (seletor === '.sidebar .menu-item[id^="menu-"]') {
                return [...elementos.values()].filter((el) => el.id.startsWith('menu-'));
            }
            return [];
        }
    };

    const criarElemento = (id) => {
        const classes = new Set();
        const atributos = new Map();
        const eventos = new Map();
        let html = '';
        const el = {
            id, value: '', textContent: '', innerText: '', options: [],
            dataset: {}, style: {}, parentElement: null, inert: false,
            classList: {
                add: (...nomes) => nomes.forEach((n) => classes.add(n)),
                remove: (...nomes) => nomes.forEach((n) => classes.delete(n)),
                contains: (nome) => classes.has(nome),
                toggle(nome, forcar = !classes.has(nome)) {
                    if (forcar) classes.add(nome);
                    else classes.delete(nome);
                    return forcar;
                }
            },
            getAttribute: (nome) => atributos.get(nome) ?? null,
            setAttribute: (nome, valor) => atributos.set(nome, String(valor)),
            addEventListener(nome, callback) {
                if (!eventos.has(nome)) eventos.set(nome, []);
                eventos.get(nome).push(callback);
            },
            click() { (eventos.get('click') || []).forEach((fn) => fn({ target: el })); },
            focus() { documento.activeElement = el; },
            contains(outro) {
                for (let atual = outro; atual; atual = atual.parentElement) {
                    if (atual === el) return true;
                }
                return false;
            },
            add(opcao) { el.options.push(opcao); },
            closest() { return null; },
            get innerHTML() { return html; },
            set innerHTML(valor) {
                html = String(valor);
                el.options = [...html.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)]
                    .map((m) => ({ value: m[1], text: m[2] }));
                if (el.options.length) el.value = el.options[0].value;
            }
        };
        elementos.set(id, el);
        return el;
    };

    documento.body = criarElemento('body');
    for (const id of [
        'filtroObra', 'filtroForn', 'filtroContrato', 'btn-limpar-filtros',
        'registro-contador', 'card-contratos-vencidos', 'atalho-vencidos',
        'legenda-card-vencidos', 'secao-metricas', 'painel-metricas',
        'btn-toggle-metricas', 'toggle-metricas-texto', 'body-alertas',
        'dash-card-vencidos', 'dash-card-vencer', 'badge-alertas',
        'kpi-total', 'kpi-ativos', 'kpi-arquivados', 'kpi-contratos', 'kpi-fornecedores'
    ]) criarElemento(id);

    for (const aba of ['locacoes', 'compras', 'historico', 'excluidos', 'fornecedores', 'alertas']) {
        criarElemento(`menu-${aba}`);
        criarElemento(`secao-${aba}`);
        criarElemento(`body-${aba}`);
        criarElemento(`tabela-${aba}`);
    }
    elementos.get('filtroObra').value = 'todas';
    elementos.get('filtroForn').value = 'todos';
    elementos.get('card-contratos-vencidos').parentElement = elementos.get('painel-metricas');
    elementos.get('btn-toggle-metricas').setAttribute('aria-expanded', 'true');

    class DataFixa extends Date {
        constructor(...args) { super(...(args.length ? args : [2026, 9, 19, 9])); }
    }

    const localStorage = {
        getItem: (chave) => armazenamento.get(chave) ?? null,
        setItem: (chave, valor) => armazenamento.set(chave, String(valor))
    };
    const contexto = vm.createContext({
        document: documento, localStorage, Date: DataFixa, URL,
        Option: function (text, value = text) { return { text, value }; },
        console: { info() {}, log() {}, warn() {}, error: (...args) => erros.push(args) }
    });
    contexto.window = contexto;
    for (const { nome, codigo } of fontes) {
        vm.runInContext(codigo, contexto, { filename: `${nome}.js` });
    }
    contexto.State.dadosGlobais = dados;

    return {
        ...contexto, elementos, armazenamento, erros,
        elemento: (id) => elementos.get(id),
        ids: () => Array.from(contexto.State.dadosFiltrados, (item) => item.id)
    };
}

test('vencido exige locação ativa, data válida anterior a hoje e exclui patrimônio próprio', () => {
    const a = ambiente();
    assert.deepEqual(registros().filter(a.Utils.contratoEstaVencido).map((item) => item.id), [1, 2]);
    assert.equal(a.Utils.contratoEstaVencido(locacao(10, { status: ' ATIVO ' })), true);
    assert.equal(a.Utils.contratoEstaVencido(locacao(10, { unidade: 'PROPRIO' })), false);
    assert.equal(a.Utils.contratoEstaVencido(locacao(10, { data_fim: 'inválida' })), false);
    assert.equal(a.Utils.contratoEstaVencido(null), false);
});

test('clique no card filtra a tabela real, abre locações e permite desfazer', () => {
    const a = ambiente();
    a.App.bindEventos();
    a.UI.mudarAba('historico');
    a.elemento('card-contratos-vencidos').click();
    assert.deepEqual(a.ids(), [2, 1]);
    assert.equal(a.State.abaAtual, 'locacoes');
    assert.equal(a.elemento('card-contratos-vencidos').getAttribute('aria-pressed'), 'true');
    assert.equal(a.elemento('atalho-vencidos').getAttribute('aria-pressed'), 'true');
    assert.equal(a.elemento('legenda-card-vencidos').textContent, 'Filtro ativo');
    assert.match(a.elemento('body-locacoes').innerHTML, /Betoneira/);
    assert.match(a.elemento('body-locacoes').innerHTML, /Andaime/);
    assert.doesNotMatch(a.elemento('body-locacoes').innerHTML, /Equipamento 3/);
    assert.equal(a.elemento('registro-contador').textContent, '2 encontrados');
    a.elemento('card-contratos-vencidos').click();
    assert.equal(a.ids().length, registros().length);
    assert.equal(a.elemento('card-contratos-vencidos').getAttribute('aria-pressed'), 'false');
    assert.equal(a.elemento('btn-limpar-filtros').style.display, 'none');
    assert.deepEqual(a.erros, []);
});

test('filtro de vencidos combina com obra, fornecedor, busca e ordenação', () => {
    const a = ambiente();
    a.elemento('filtroObra').value = 'Norte';
    a.elemento('filtroForn').value = 'Alfa';
    a.elemento('filtroContrato').value = 'betoneira';
    a.App.alternarFiltroVencidos();
    assert.deepEqual(a.ids(), [1]);
    a.elemento('filtroContrato').value = 'andaime';
    a.App.aplicarFiltrosELocalSort();
    assert.deepEqual(a.ids(), []);
    assert.match(a.elemento('body-locacoes').innerHTML, /Nenhuma locação ativa encontrada/);
    assert.equal(a.elemento('registro-contador').textContent, '0 encontrados');
    a.App.alternarFiltroVencidos();
    assert.equal(a.elemento('filtroObra').value, 'Norte');
    assert.equal(a.elemento('filtroForn').value, 'Alfa');
    assert.equal(a.elemento('filtroContrato').value, 'andaime');
    assert.deepEqual(a.erros, []);
});

test('Limpar filtros remove vencidos e restaura também os filtros existentes', () => {
    const a = ambiente();
    a.App.alternarFiltroVencidos();
    a.elemento('filtroObra').value = 'Norte';
    a.elemento('filtroForn').value = 'Alfa';
    a.elemento('filtroContrato').value = 'Betoneira';
    a.App.limparFiltros();
    assert.equal(a.State.filtroVencidos, false);
    assert.equal(a.elemento('filtroObra').value, 'todas');
    assert.equal(a.elemento('filtroForn').value, 'todos');
    assert.equal(a.elemento('filtroContrato').value, '');
    assert.equal(a.ids().length, registros().length);
    assert.equal(JSON.parse(a.armazenamento.get('controle_filtros')).vencidos, false);
});

test('atalho Vencidos funciona com o painel recolhido e o vínculo não é duplicado', () => {
    const a = ambiente();
    a.App.bindEventos();
    a.App.bindEventos();
    a.elemento('btn-toggle-metricas').click();
    a.elemento('atalho-vencidos').click();
    assert.equal(a.elemento('painel-metricas').inert, true);
    assert.deepEqual(a.ids(), [2, 1]);
    a.elemento('atalho-vencidos').click();
    assert.equal(a.State.filtroVencidos, false);
});

test('recolher e expandir sincroniza botão, acessibilidade e preferência', () => {
    const a = ambiente();
    a.App.bindEventos();
    a.UI.inicializarPainelMetricas();
    a.elemento('card-contratos-vencidos').focus();
    a.elemento('btn-toggle-metricas').click();
    assert.equal(a.elemento('secao-metricas').classList.contains('is-collapsed'), true);
    assert.equal(a.elemento('painel-metricas').inert, true);
    assert.equal(a.elemento('painel-metricas').getAttribute('aria-hidden'), 'true');
    assert.equal(a.elemento('btn-toggle-metricas').getAttribute('aria-expanded'), 'false');
    assert.equal(a.document.activeElement, a.elemento('btn-toggle-metricas'));
    assert.equal(a.elemento('toggle-metricas-texto').textContent, 'Mostrar indicadores');
    assert.equal(a.armazenamento.get('controle_metricas_recolhidas'), 'true');
    a.elemento('btn-toggle-metricas').click();
    assert.equal(a.elemento('secao-metricas').classList.contains('is-collapsed'), false);
    assert.equal(a.elemento('painel-metricas').inert, false);
    assert.equal(a.elemento('btn-toggle-metricas').getAttribute('aria-expanded'), 'true');
    assert.equal(a.elemento('toggle-metricas-texto').textContent, 'Ocultar indicadores');
});

test('reabrir a página restaura o painel e o filtro com a busca anterior', () => {
    const a = ambiente();
    a.elemento('filtroObra').value = 'Norte';
    a.elemento('filtroForn').value = 'Alfa';
    a.elemento('filtroContrato').value = 'betoneira';
    a.App.alternarFiltroVencidos();
    a.UI.togglePainelMetricas();
    const b = ambiente({ armazenamento: a.armazenamento });
    b.App.carregarFiltrosSelect();
    b.UI.inicializarPainelMetricas();
    b.App.aplicarFiltrosELocalSort();
    assert.deepEqual(b.ids(), [1]);
    assert.equal(b.elemento('filtroObra').value, 'Norte');
    assert.equal(b.elemento('filtroForn').value, 'Alfa');
    assert.equal(b.elemento('filtroContrato').value, 'betoneira');
    assert.equal(b.elemento('painel-metricas').inert, true);
    assert.equal(b.elemento('atalho-vencidos').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(b.erros, []);
});

test('preferências antigas e JSON inválido continuam compatíveis', () => {
    for (const salvo of ['{"obra":"Norte","forn":"Alfa","texto":""}', '{inválido']) {
        const a = ambiente({ armazenamento: new Map([['controle_filtros', salvo]]) });
        assert.doesNotThrow(() => a.App.carregarFiltrosSelect());
        assert.equal(a.State.filtroVencidos, false);
    }
});

test('painel continua alternando se o navegador bloquear o armazenamento', () => {
    const a = ambiente();
    a.localStorage.getItem = () => { throw new Error('Armazenamento bloqueado'); };
    a.localStorage.setItem = () => { throw new Error('Armazenamento bloqueado'); };
    assert.doesNotThrow(() => a.UI.inicializarPainelMetricas());
    assert.doesNotThrow(() => a.UI.togglePainelMetricas());
    assert.equal(a.elemento('painel-metricas').inert, true);
    assert.doesNotThrow(() => a.UI.togglePainelMetricas());
    assert.equal(a.elemento('painel-metricas').inert, false);
});

test('indicador e alertas usam os mesmos vencidos da lista e se atualizam após renovação', async () => {
    const a = ambiente();
    await a.AlertService.updateAll(a.State.dadosGlobais);
    assert.deepEqual(Array.from(a.AlertasState.vencidos, (item) => item.id), [1, 2]);
    assert.equal(a.elemento('dash-card-vencidos').innerText, 2);
    assert.ok(a.AlertasState.aVencer.some((item) => item.id === 3));
    a.App.alternarFiltroVencidos();
    a.State.dadosGlobais.find((item) => item.id === 1).data_fim = '2026-11-19';
    a.App.aplicarFiltrosELocalSort();
    await a.AlertService.updateAll(a.State.dadosGlobais);
    assert.deepEqual(a.ids(), [2]);
    assert.equal(a.elemento('dash-card-vencidos').innerText, 1);
    assert.equal(a.elemento('card-contratos-vencidos').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(a.erros, []);
});

test('base sem vencidos mostra tabela vazia e mantém acesso ao botão de limpar', () => {
    const a = ambiente({ dados: [locacao(1, { data_fim: '2026-11-20' })] });
    a.App.alternarFiltroVencidos();
    assert.deepEqual(a.ids(), []);
    assert.match(a.elemento('body-locacoes').innerHTML, /Nenhuma locação ativa encontrada/);
    assert.equal(a.elemento('btn-limpar-filtros').style.display, 'flex');
    a.App.limparFiltros();
    assert.deepEqual(a.ids(), [1]);
});
