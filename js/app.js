// =====================================================
// APP.JS
// Sistema Gestão de Equipamentos v6.4.0
// =====================================================

(() => {
    'use strict';

    const App = {
        eventosVinculados: false,

        carregarFiltrosSelect() {
            const registros = Array.isArray(State.dadosGlobais)
                ? State.dadosGlobais
                : [];

            const obras = [
                ...new Set(
                    registros
                        .map(item => item.obra)
                        .filter(Boolean)
                )
            ].sort((a, b) =>
                String(a).localeCompare(
                    String(b),
                    'pt-BR'
                )
            );

            const fornecedores = [
                ...new Set(
                    registros
                        .map(item => item.fornecedor)
                        .filter(Boolean)
                )
            ].sort((a, b) =>
                String(a).localeCompare(
                    String(b),
                    'pt-BR'
                )
            );

            const selObra =
                document.getElementById('filtroObra');

            const selForn =
                document.getElementById('filtroForn');

            const listaObras =
                document.getElementById('lista-obras');

            const listaForns =
                document.getElementById('lista-forns');

            if (selObra) {
                selObra.innerHTML =
                    '<option value="todas">🏢 Todas as Obras</option>';

                obras.forEach((obra) => {
                    selObra.add(
                        new Option(obra, obra)
                    );
                });
            }

            if (selForn) {
                selForn.innerHTML =
                    '<option value="todos">🚚 Todos os Fornecedores</option>';

                fornecedores.forEach((fornecedor) => {
                    selForn.add(
                        new Option(fornecedor, fornecedor)
                    );
                });
            }

            if (listaObras) {
                listaObras.innerHTML = '';

                obras.forEach((obra) => {
                    listaObras.appendChild(
                        new Option(obra)
                    );
                });
            }

            if (listaForns) {
                listaForns.innerHTML = '';

                fornecedores.forEach((fornecedor) => {
                    listaForns.appendChild(
                        new Option(fornecedor)
                    );
                });
            }

            let filtrosSalvos = null;

            try {
                filtrosSalvos = JSON.parse(
                    localStorage.getItem(
                        'controle_filtros'
                    )
                );
            } catch (erro) {
                console.warn(
                    '[App] Filtros locais inválidos:',
                    erro
                );
            }

            if (!filtrosSalvos) {
                return;
            }

            if (
                selObra &&
                [...selObra.options].some(
                    opcao =>
                        opcao.value ===
                        filtrosSalvos.obra
                )
            ) {
                selObra.value = filtrosSalvos.obra;
            }

            if (
                selForn &&
                [...selForn.options].some(
                    opcao =>
                        opcao.value ===
                        filtrosSalvos.forn
                )
            ) {
                selForn.value = filtrosSalvos.forn;
            }

            const campoTexto =
                document.getElementById(
                    'filtroContrato'
                );

            if (campoTexto) {
                campoTexto.value =
                    filtrosSalvos.texto || '';
            }
        },

        async carregarDados() {
            try {
                const registros =
                    await DB.carregarDados();

                App.carregarFiltrosSelect();

                const abaSalva =
                    localStorage.getItem(
                        'controle_aba'
                    ) || 'locacoes';

                UI.mudarAba(abaSalva);
                App.aplicarFiltrosELocalSort();

                if (
                    window.AlertService &&
                    typeof window.AlertService
                        .updateAll === 'function'
                ) {
                    await window.AlertService.updateAll(registros);
                }

                console.info(
                    `[App] Inicialização concluída com ${registros.length} registro(s).`
                );

                return registros;

            } catch (erro) {
                console.error(
                    '[App] Falha ao carregar os dados:',
                    erro
                );

                Utils.hideLoader();

                Utils.showToast(
                    'Não foi possível inicializar o sistema.',
                    'error'
                );

                return [];
            }
        },

        aplicarFiltrosELocalSort() {
            try {
                const campoObra =
                    document.getElementById(
                        'filtroObra'
                    );

                const campoForn =
                    document.getElementById(
                        'filtroForn'
                    );

                const campoTexto =
                    document.getElementById(
                        'filtroContrato'
                    );

                const fObra =
                    campoObra?.value || 'todas';

                const fForn =
                    campoForn?.value || 'todos';

                const fTexto =
                    String(campoTexto?.value || '')
                        .trim()
                        .toLowerCase();

                localStorage.setItem(
                    'controle_filtros',
                    JSON.stringify({
                        obra: fObra,
                        forn: fForn,
                        texto: fTexto
                    })
                );

                const origem =
                    Array.isArray(State.dadosGlobais)
                        ? State.dadosGlobais
                        : [];

                State.dadosFiltrados =
                    origem.filter((item) => {
                        const matchObra =
                            fObra === 'todas' ||
                            item.obra === fObra;

                        const matchForn =
                            fForn === 'todos' ||
                            item.fornecedor === fForn;

                        const equipamento =
                            String(
                                item.equipamento || ''
                            );

                        const contrato =
                            String(
                                item.contrato || ''
                            );

                        const fornecedor =
                            String(
                                item.fornecedor || ''
                            );

                        const obra =
                            String(item.obra || '');

                        const textoAlvo =
                            `${
                                equipamento
                            } ${
                                contrato
                            } ${
                                fornecedor
                            } ${
                                obra
                            }`.toLowerCase();

                        const matchTexto =
                            fTexto === '' ||
                            textoAlvo.includes(fTexto);

                        return (
                            matchObra &&
                            matchForn &&
                            matchTexto
                        );
                    });

                const botaoLimpar =
                    document.getElementById(
                        'btn-limpar-filtros'
                    );

                if (botaoLimpar) {
                    botaoLimpar.style.display =
                        fObra !== 'todas' ||
                        fForn !== 'todos' ||
                        fTexto !== ''
                            ? 'flex'
                            : 'none';
                }

                State.dadosFiltrados.sort(
                    (itemA, itemB) => {
                        let valorA =
                            itemA[
                                State.sortColunaAtual
                            ];

                        let valorB =
                            itemB[
                                State.sortColunaAtual
                            ];

                        const numerico =
                            typeof valorA ===
                                'number' ||
                            typeof valorB ===
                                'number';

                        if (numerico) {
                            const a =
                                Number(valorA) || 0;

                            const b =
                                Number(valorB) || 0;

                            return State.sortDirecaoAsc
                                ? a - b
                                : b - a;
                        }

                        valorA = String(
                            valorA || ''
                        ).toLowerCase();

                        valorB = String(
                            valorB || ''
                        ).toLowerCase();

                        return State.sortDirecaoAsc
                            ? valorA.localeCompare(
                                valorB,
                                'pt-BR'
                            )
                            : valorB.localeCompare(
                                valorA,
                                'pt-BR'
                            );
                    }
                );

                App.atualizarSetasOrdenacao();
                UI.renderizarTabelas();
                UI.atualizarKPIsEDashboards();
                UI.renderizarModuloFornecedores();

                const contador =
                    document.getElementById(
                        'registro-contador'
                    );

                if (contador) {
                    const quantidade =
                        State.dadosFiltrados.length;

                    contador.textContent =
                        `${quantidade} ${
                            quantidade === 1
                                ? 'encontrado'
                                : 'encontrados'
                        }`;

                    contador.classList.toggle(
                        'active',
                        quantidade > 0
                    );
                }

            } catch (erro) {
                console.error(
                    '[App] Erro ao filtrar ou renderizar:',
                    erro
                );

                Utils.showToast(
                    'Os dados foram carregados, mas ocorreu um erro ao montar a tela.',
                    'error'
                );
            }
        },

        ordenarColuna(coluna) {
            if (
                State.sortColunaAtual === coluna
            ) {
                State.sortDirecaoAsc =
                    !State.sortDirecaoAsc;
            } else {
                State.sortColunaAtual = coluna;
                State.sortDirecaoAsc = true;
            }

            App.aplicarFiltrosELocalSort();
        },

        atualizarSetasOrdenacao() {
            document
                .querySelectorAll('.sort-icon')
                .forEach((span) => {
                    span.innerText = '';
                });

            const seta =
                State.sortDirecaoAsc
                    ? ' ▲'
                    : ' ▼';

            const idsSetas = [
                'sort-obra',
                'sort-equipamento',
                'sort-data_fim',
                'sort-contrato',
                'sort-valor',
                'sort-comp-obra',
                'sort-comp-equip',
                'sort-comp-data',
                'sort-comp-contrato',
                'sort-comp-valor',
                'sort-hist-obra',
                'sort-hist-equip',
                'sort-hist-data',
                'sort-hist-contrato',
                'sort-hist-valor',
                'sort-ex-obra',
                'sort-ex-equip',
                'sort-ex-data',
                'sort-ex-contrato',
                'sort-ex-valor'
            ];

            idsSetas.forEach((id) => {
                const elemento =
                    document.getElementById(id);

                if (
                    elemento &&
                    id.includes(
                        State.sortColunaAtual
                    )
                ) {
                    elemento.innerText = seta;
                }
            });
        },

        limparFiltros() {
            const campoObra =
                document.getElementById(
                    'filtroObra'
                );

            const campoForn =
                document.getElementById(
                    'filtroForn'
                );

            const campoTexto =
                document.getElementById(
                    'filtroContrato'
                );

            if (campoObra) {
                campoObra.value = 'todas';
            }

            if (campoForn) {
                campoForn.value = 'todos';
            }

            if (campoTexto) {
                campoTexto.value = '';
            }

            App.aplicarFiltrosELocalSort();

            Utils.showToast(
                'Filtros limpos!',
                'success'
            );
        },

        bindEventos() {
            if (App.eventosVinculados) {
                return;
            }

            document.body.addEventListener(
                'click',
                (evento) => {
                    const botao =
                        evento.target.closest(
                            '.btn-action-small'
                        );

                    if (!botao) {
                        return;
                    }

                    const acao =
                        botao.dataset.action;

                    const id =
                        botao.dataset.id;

                    const nome =
                        botao.dataset.nome;

                    if (acao === 'editar') {
                        Equipamentos.abrirEdicao(id);
                    }

                    if (acao === 'devolver') {
                        Equipamentos.devolverItem(
                            id,
                            nome
                        );
                    }

                    if (acao === 'excluir') {
                        Equipamentos
                            .excluirPermanenteItem(
                                id,
                                nome
                            );
                    }

                    if (acao === 'restaurar') {
                        Equipamentos.restaurarItem(
                            id,
                            nome
                        );
                    }

                    if (acao === 'renovar') {
                        Equipamentos.renovarItem(
                            id,
                            botao.dataset.fim,
                            botao.dataset.uni
                        );
                    }

                    if (
                        acao === 'renomear-forn'
                    ) {
                        Equipamentos
                            .abrirRenomearForn(
                                nome
                            );
                    }

                    if (
                        acao === 'mesclar-forn'
                    ) {
                        Equipamentos
                            .abrirMesclarForn(
                                nome
                            );
                    }
                }
            );

            App.eventosVinculados = true;
        },

        async inicializar() {
            try {
                UI.inicializarTema();
                App.bindEventos();
                await App.carregarDados();
            } catch (erro) {
                console.error(
                    '[App] Erro de inicialização:',
                    erro
                );

                Utils.hideLoader();

                Utils.showToast(
                    'Falha ao iniciar o sistema.',
                    'error'
                );
            }
        }
    };

    window.App = App;

    if (
        document.readyState === 'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            () => App.inicializar(),
            { once: true }
        );
    } else {
        App.inicializar();
    }
})();
