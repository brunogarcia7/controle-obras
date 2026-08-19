import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const codigo = fs.readFileSync(
    new URL('../js/equipamentos.js', import.meta.url),
    'utf8'
);

function criarElemento(id, extras = {}) {
    let htmlInterno = '';

    const elemento = {
        id,
        value: '',
        textContent: '',
        innerText: '',
        disabled: false,
        options: [],
        style: {},
        focusChamado: false,
        selectChamado: false,
        focus() {
            this.focusChamado = true;
        },
        select() {
            this.selectChamado = true;
        },
        add(opcao) {
            this.options.push(opcao);
        },
        appendChild(opcao) {
            this.options.push(opcao);
        },
        setAttribute() {},
        ...extras
    };

    Object.defineProperty(elemento, 'innerHTML', {
        get() {
            return htmlInterno;
        },
        set(valor) {
            htmlInterno = String(valor ?? '');
            if (htmlInterno === '') this.options = [];
        }
    });

    return elemento;
}

function criarAmbiente({ registros = [], responderLote } = {}) {
    const elementos = new Map();
    const chamadas = {
        banco: [],
        toasts: [],
        loaders: [],
        logs: [],
        modaisAbertos: [],
        modaisFechados: [],
        filtrosCarregados: 0,
        renderizacoes: 0,
        alertas: 0,
        confirmacoes: []
    };

    const adicionarElemento = (id, extras) => {
        const elemento = criarElemento(id, extras);
        elementos.set(id, elemento);
        return elemento;
    };

    const filtro = adicionarElemento('filtroForn');
    filtro.value = 'todos';
    filtro.options = [{ value: 'todos' }];

    const State = {
        dadosGlobais: registros.map((item) => ({ ...item })),
        arquivoAnexoTemporario: null,
        base64AnexoTemporario: null,
        mimeTypeTemporario: ''
    };

    const Utils = {
        normalizarFornecedor(valor, padrao = 'Não identificado') {
            const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
            return texto || padrao;
        },
        showToast(...args) {
            chamadas.toasts.push(args);
        },
        showLoader(mensagem) {
            chamadas.loaders.push(['show', mensagem]);
        },
        hideLoader() {
            chamadas.loaders.push(['hide']);
        },
        registrarLog(...args) {
            chamadas.logs.push(args);
        },
        showConfirm(titulo, mensagem, callback) {
            chamadas.confirmacoes.push({ titulo, mensagem, callback });
        }
    };

    const client = {
        from(tabela) {
            return {
                update(payload) {
                    return {
                        in(coluna, lote) {
                            return {
                                async select(campos) {
                                    chamadas.banco.push({
                                        tabela,
                                        payload,
                                        coluna,
                                        lote: [...lote],
                                        campos
                                    });

                                    if (responderLote) {
                                        return responderLote({
                                            tabela,
                                            payload,
                                            coluna,
                                            lote: [...lote],
                                            campos,
                                            indice: chamadas.banco.length - 1
                                        });
                                    }

                                    return {
                                        data: lote.map((id) => ({ id })),
                                        error: null
                                    };
                                }
                            };
                        }
                    };
                }
            };
        }
    };

    const DB = {
        client,
        obterClient: () => client,
        obterTabela: () => 'locacoes'
    };

    const App = {
        carregarFiltrosSelect() {
            chamadas.filtrosCarregados += 1;
            const nomes = [
                ...new Set(
                    State.dadosGlobais.map((item) =>
                        Utils.normalizarFornecedor(item.fornecedor)
                    )
                )
            ];
            filtro.options = [
                { value: 'todos' },
                ...nomes.map((value) => ({ value }))
            ];
            filtro.value = 'todos';
        },
        aplicarFiltrosELocalSort() {
            chamadas.renderizacoes += 1;
        }
    };

    const UI = {
        abrirModal(id) {
            chamadas.modaisAbertos.push(id);
        },
        fecharModal(id) {
            chamadas.modaisFechados.push(id);
        }
    };

    const window = {
        setTimeout(callback) {
            callback();
            return 1;
        },
        AlertService: {
            async updateAll() {
                chamadas.alertas += 1;
            }
        }
    };

    const context = vm.createContext({
        console,
        State,
        Utils,
        DB,
        App,
        UI,
        StorageService: {},
        document: {
            getElementById(id) {
                return elementos.get(id) || null;
            }
        },
        window,
        Option: function Option(text, value = text) {
            return { text, textContent: text, value };
        },
        setTimeout: window.setTimeout
    });

    vm.runInContext(
        `${codigo}\nglobalThis.__Equipamentos = Equipamentos;`,
        context,
        { filename: 'equipamentos.js' }
    );

    return {
        Equipamentos: context.__Equipamentos,
        State,
        chamadas,
        elementos,
        adicionarElemento,
        filtro
    };
}

test('expõe as funções de edição e mesclagem de fornecedores', () => {
    const { Equipamentos } = criarAmbiente();

    for (const nome of [
        'abrirRenomearForn',
        'salvarRenomearForn',
        'abrirMesclarForn',
        'atualizarResumoMesclagem',
        'salvarMesclarForn',
        'atualizarFornecedorEmLote'
    ]) {
        assert.equal(typeof Equipamentos[nome], 'function', nome);
    }
});

test('resume fornecedor em todos os status e normaliza espaços', () => {
    const { Equipamentos } = criarAmbiente({
        registros: [
            { id: 1, fornecedor: '  Alfa   Locações ', status: 'ativo', quantidade: 3 },
            { id: 2, fornecedor: 'Alfa Locações', status: 'inativo', quantidade: 1 },
            { id: 3, fornecedor: 'Alfa Locações', status: 'excluido', quantidade: 2 },
            { id: 4, fornecedor: 'Beta', status: 'ativo', quantidade: 9 }
        ]
    });

    const resumo = Equipamentos.resumirFornecedor('Alfa Locações');

    assert.deepEqual(
        JSON.parse(JSON.stringify(resumo)),
        {
            nome: 'Alfa Locações',
            totalRegistros: 3,
            ativos: 1,
            devolvidos: 1,
            excluidos: 1,
            outros: 0,
            unidades: 6
        }
    );
});

test('usa o nome canônico existente ao renomear para fornecedor já cadastrado', () => {
    const { Equipamentos } = criarAmbiente({
        registros: [
            { id: 1, fornecedor: 'Duplicado', status: 'ativo', quantidade: 1 },
            { id: 2, fornecedor: 'FORNECEDOR CORRETO', status: 'ativo', quantidade: 1 }
        ]
    });

    assert.equal(
        Equipamentos.obterDestinoCanonico(
            'fornecedor correto',
            'Duplicado'
        ),
        'FORNECEDOR CORRETO'
    );
});

test('abre os modais e preenche as opções de mesclagem', () => {
    const ambiente = criarAmbiente({
        registros: [
            { id: 1, fornecedor: 'Duplicado', status: 'ativo', quantidade: 2 },
            { id: 2, fornecedor: 'Correto', status: 'ativo', quantidade: 3 }
        ]
    });

    const ids = [
        'renomear-forn-origem',
        'renomear-forn-origem-txt',
        'renomear-forn-novo',
        'renomear-forn-impacto',
        'merge-origem',
        'merge-origem-txt',
        'merge-origem-resumo',
        'merge-destino',
        'merge-destino-resumo',
        'btn-confirmar-mesclagem'
    ];
    ids.forEach((id) => ambiente.adicionarElemento(id));

    ambiente.Equipamentos.abrirRenomearForn('Duplicado');
    assert.equal(
        ambiente.elementos.get('renomear-forn-novo').value,
        'Duplicado'
    );
    assert.ok(
        ambiente.elementos.get('renomear-forn-impacto')
            .textContent.includes('1 registro(s)')
    );
    assert.ok(
        ambiente.chamadas.modaisAbertos.includes('modal-renomear-forn')
    );

    ambiente.Equipamentos.abrirMesclarForn('Duplicado');
    const select = ambiente.elementos.get('merge-destino');
    assert.equal(select.options.length, 2);
    assert.equal(select.options[1].value, 'Correto');
    assert.equal(
        ambiente.elementos.get('btn-confirmar-mesclagem').disabled,
        true
    );
});

test('mescla registros em lotes, atualiza o estado e preserva o filtro', async () => {
    const registros = [];
    for (let id = 1; id <= 205; id += 1) {
        registros.push({
            id,
            fornecedor: id % 2 === 0 ? ' Duplicado ' : 'Duplicado',
            status: 'ativo',
            quantidade: 1
        });
    }
    registros.push({
        id: 999,
        fornecedor: 'Correto',
        status: 'ativo',
        quantidade: 1
    });

    const ambiente = criarAmbiente({ registros });
    ambiente.filtro.value = 'Duplicado';
    ambiente.filtro.options = [
        { value: 'todos' },
        { value: 'Duplicado' },
        { value: 'Correto' }
    ];

    const resultado = await ambiente.Equipamentos.atualizarFornecedorEmLote(
        'Duplicado',
        'Correto',
        {
            modalId: 'modal-mesclar-forn',
            acaoLog: 'Mesclagem de fornecedor'
        }
    );

    assert.equal(resultado, true);
    assert.deepEqual(
        ambiente.chamadas.banco.map((item) => item.lote.length),
        [100, 100, 5]
    );
    assert.ok(
        ambiente.State.dadosGlobais
            .filter((item) => item.id <= 205)
            .every((item) => item.fornecedor === 'Correto')
    );
    assert.equal(
        ambiente.State.dadosGlobais.find((item) => item.id === 999).fornecedor,
        'Correto'
    );
    assert.equal(ambiente.filtro.value, 'Correto');
    assert.ok(
        ambiente.chamadas.modaisFechados.includes('modal-mesclar-forn')
    );
    assert.equal(ambiente.chamadas.logs.length, 1);
    assert.equal(ambiente.chamadas.renderizacoes, 1);
    assert.equal(ambiente.chamadas.loaders.at(-1)[0], 'hide');
});

test('não informa sucesso quando o Supabase não confirma todas as linhas', async () => {
    const ambiente = criarAmbiente({
        registros: [
            { id: 1, fornecedor: 'Duplicado', status: 'ativo', quantidade: 1 },
            { id: 2, fornecedor: 'Duplicado', status: 'ativo', quantidade: 1 }
        ],
        responderLote({ lote }) {
            return {
                data: [{ id: lote[0] }],
                error: null
            };
        }
    });

    const resultado = await ambiente.Equipamentos.atualizarFornecedorEmLote(
        'Duplicado',
        'Correto'
    );

    assert.equal(resultado, false);
    assert.equal(
        ambiente.State.dadosGlobais.find((item) => item.id === 1).fornecedor,
        'Correto'
    );
    assert.equal(
        ambiente.State.dadosGlobais.find((item) => item.id === 2).fornecedor,
        'Duplicado'
    );
    assert.ok(
        ambiente.chamadas.toasts.at(-1)[0].includes('Operação parcial')
    );
});
