// =====================================================
// UI.JS
// Sistema Gestão de Equipamentos v6.4.1
// =====================================================

(() => {
    'use strict';

    const CHAVE_COLUNAS = 'controle_colunas';
    const CHAVE_TEMA = 'controle_tema';
    const CHAVE_ABA = 'controle_aba';

    const obterElemento = (id) => document.getElementById(id);

    const lerJSONLocal = (chave, valorPadrao = {}) => {
        try {
            const valor = JSON.parse(localStorage.getItem(chave) || 'null');
            return valor && typeof valor === 'object' ? valor : valorPadrao;
        } catch (erro) {
            console.warn(`[UI] Valor local inválido em ${chave}:`, erro);
            return valorPadrao;
        }
    };

    const textoSeguro = (valor, padrao = '--') => {
        const texto = String(valor ?? '').trim();
        return Utils.escapeStr(texto || padrao);
    };

    const atributoSeguro = (valor) => Utils.escapeStr(String(valor ?? ''));

    const normalizarStatus = (valor) =>
        String(valor || '').trim().toLowerCase();

    const normalizarFornecedor = (valor) =>
        Utils.normalizarFornecedor(valor);

    const ehPatrimonioProprio = (item) => {
        const unidade = String(item?.unidade || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase();

        return unidade.includes('proprio');
    };

    const urlAnexoSegura = (valor) => {
        if (!valor || typeof valor !== 'string') return '';

        try {
            const url = new URL(valor, window.location.href);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
        } catch (_) {
            return '';
        }
    };

    const criarLinhaVazia = (mensagem) => `
        <tr>
            <td colspan="7" style="text-align:center;padding:28px;color:var(--text-light);">
                ${Utils.escapeStr(mensagem)}
            </td>
        </tr>
    `;

    const colunasSalvas = lerJSONLocal(CHAVE_COLUNAS, {});

    const UI = {
        colunasAtivas: {
            ...(CONFIG.COLUNAS_PADRAO || {}),
            ...colunasSalvas,
            acoes: true
        },

        inicializarTema() {
            const temaSalvo =
                localStorage.getItem(CHAVE_TEMA) ||
                localStorage.getItem('tema') ||
                'light';

            const escuro = temaSalvo === 'dark';
            document.documentElement.toggleAttribute('data-theme', escuro);

            if (!escuro) {
                document.documentElement.removeAttribute('data-theme');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
            }

            const icone = obterElemento('tema-icone');
            const texto = obterElemento('tema-texto');

            if (icone) icone.textContent = escuro ? '☀️' : '🌙';
            if (texto) texto.textContent = escuro ? 'Modo Claro' : 'Modo Escuro';

            if (window.State) State.temaAtual = escuro ? 'dark' : 'light';

            UI.aplicarEstiloColunas();
        },

        toggleTema() {
            const escuroAtual =
                document.documentElement.getAttribute('data-theme') === 'dark';

            const novoTema = escuroAtual ? 'light' : 'dark';
            localStorage.setItem(CHAVE_TEMA, novoTema);
            localStorage.setItem('tema', novoTema);

            UI.inicializarTema();
        },

        toggleSidebar() {
            obterElemento('sidebar')?.classList.toggle('collapsed');
        },

        abrirModal(id) {
            const modal = obterElemento(id);
            if (!modal) {
                console.warn(`[UI] Modal não encontrado: ${id}`);
                return;
            }

            if (id === 'modal-colunas') {
                ['obra', 'equip', 'periodo', 'contrato', 'valor', 'anexo']
                    .forEach((chave) => {
                        const checkbox = obterElemento(`chk-col-${chave}`);
                        if (checkbox) {
                            checkbox.checked = UI.colunasAtivas[chave] !== false;
                        }
                    });
            }

            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
        },

        fecharModal(id) {
            const modal = obterElemento(id);
            if (!modal) return;

            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
        },

        mudarAba(aba) {
            const abaSegura = String(aba || 'locacoes');
            const menu = obterElemento(`menu-${abaSegura}`);
            const secao = obterElemento(`secao-${abaSegura}`);

            if (!menu || !secao) {
                console.warn(`[UI] Aba não encontrada: ${abaSegura}`);
                if (abaSegura !== 'locacoes') UI.mudarAba('locacoes');
                return;
            }

            document
                .querySelectorAll('.sidebar .menu-item[id^="menu-"]')
                .forEach((elemento) => elemento.classList.remove('active'));

            document
                .querySelectorAll('.secao-tabela')
                .forEach((elemento) => elemento.classList.remove('animate-show'));

            menu.classList.add('active');
            secao.classList.add('animate-show');

            localStorage.setItem(CHAVE_ABA, abaSegura);
            if (window.State) State.abaAtual = abaSegura;

            if (abaSegura === 'sistema') UI.renderizarLogs();
            if (abaSegura === 'alertas' && window.AlertasManager) {
                window.AlertasManager.renderizarTela();
            }
        },

        aplicarEstiloColunas() {
            const regras = [];

            ['obra', 'equip', 'periodo', 'contrato', 'valor', 'anexo']
                .forEach((chave) => {
                    if (UI.colunasAtivas[chave] === false) {
                        regras.push(`.col-${chave} { display: none !important; }`);
                    }
                });

            const estilo = obterElemento('dynamic-columns-style');
            if (estilo) estilo.textContent = regras.join('\n');
        },

        salvarColunas() {
            ['obra', 'equip', 'periodo', 'contrato', 'valor', 'anexo']
                .forEach((chave) => {
                    const checkbox = obterElemento(`chk-col-${chave}`);
                    if (checkbox) UI.colunasAtivas[chave] = checkbox.checked;
                });

            UI.colunasAtivas.acoes = true;
            localStorage.setItem(
                CHAVE_COLUNAS,
                JSON.stringify(UI.colunasAtivas)
            );

            UI.aplicarEstiloColunas();
            UI.fecharModal('modal-colunas');
            Utils.showToast('Visualização atualizada!', 'success');
        },

        renderizarLogs() {
            const tbody = obterElemento('body-logs');
            if (!tbody) return;

            let logs = [];
            try {
                const valor = JSON.parse(
                    localStorage.getItem('controle_logs') || '[]'
                );
                logs = Array.isArray(valor) ? valor : [];
            } catch (erro) {
                console.warn('[UI] Log local inválido:', erro);
            }

            if (logs.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align:center;padding:20px;">
                            Nenhum log registrado.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = logs.map((log) => {
                const acao = String(log?.acao || 'Ação');
                const cor = /exclu|arquiv/i.test(acao)
                    ? 'var(--danger)'
                    : /edit|renova/i.test(acao)
                        ? 'var(--warning)'
                        : 'var(--success)';

                return `
                    <tr>
                        <td style="font-size:.8rem;color:var(--text-light);">
                            ${textoSeguro(log?.data, '-')}
                        </td>
                        <td>
                            <span style="color:${cor};font-weight:bold;font-size:.8rem;">
                                ${textoSeguro(acao, 'Ação')}
                            </span>
                        </td>
                        <td style="font-size:.85rem;font-weight:600;">
                            ${textoSeguro(log?.detalhe, '-')}
                        </td>
                    </tr>
                `;
            }).join('');
        },

        atualizarKPIsEDashboards() {
            const registros = Array.isArray(State.dadosFiltrados)
                ? State.dadosFiltrados
                : [];

            let total = 0;
            let ativos = 0;
            let arquivados = 0;
            const fornecedores = new Set();
            const contratos = new Set();

            registros.forEach((item) => {
                const quantidade = Math.max(1, Number.parseInt(item.quantidade, 10) || 1);
                const status = normalizarStatus(item.status);

                total += quantidade;

                if (status === 'ativo') {
                    ativos += quantidade;

                    const contrato = String(item.contrato || '').trim();
                    if (
                        contrato &&
                        ![
                            'NF via IA App',
                            'NF Compra',
                            'Sem Contrato',
                            'Cadastro Manual'
                        ].includes(contrato)
                    ) {
                        contratos.add(contrato);
                    }
                } else if (status === 'inativo') {
                    arquivados += quantidade;
                }

                const fornecedor = normalizarFornecedor(
                    item.fornecedor
                );

                if (
                    status !== 'excluido' &&
                    fornecedor !== 'Não identificado'
                ) {
                    fornecedores.add(fornecedor);
                }
            });

            const valores = {
                'kpi-total': total,
                'kpi-ativos': ativos,
                'kpi-arquivados': arquivados,
                'kpi-contratos': contratos.size,
                'kpi-fornecedores': fornecedores.size
            };

            Object.entries(valores).forEach(([id, valor]) => {
                const elemento = obterElemento(id);
                if (elemento) elemento.textContent = String(valor);
            });
        },

        renderizarTabelas() {
            try {
                const listas = {
                    locacoes: [],
                    compras: [],
                    historico: [],
                    excluidos: []
                };

                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);

                const registros = Array.isArray(State.dadosFiltrados)
                    ? State.dadosFiltrados
                    : [];

                registros.forEach((item) => {
                    const status = normalizarStatus(item.status);
                    const proprio = ehPatrimonioProprio(item);
                    const quantidade = Math.max(
                        1,
                        Number.parseInt(item.quantidade, 10) || 1
                    );

                    const urlAnexo = urlAnexoSegura(item.anexo);
                    let botaoAnexo = '<span class="btn-sem-anexo">Sem anexo</span>';

                    if (urlAnexo) {
                        const pdf = /\.pdf(?:$|[?#])/i.test(urlAnexo) ||
                            String(item.anexo).toLowerCase().includes('pdf');

                        botaoAnexo = `
                            <a href="${atributoSeguro(urlAnexo)}"
                               target="_blank"
                               rel="noopener noreferrer"
                               class="btn-anexo${pdf ? ' pdf-style' : ''}">
                                ${pdf ? '📄 Ver PDF' : '📸 Ver Foto'}
                            </a>
                        `;
                    }

                    let alertas = '';
                    if (!item.fornecedor || item.fornecedor === 'Não identificado') {
                        alertas += '<span class="smart-alert alert-yellow">⚠️ Sem Fornecedor</span>';
                    }

                    const diasRestantes = item.data_fim
                        ? DateUtils.calcularDiasRestantes(item.data_fim)
                        : null;

                    if (
                        status === 'ativo' &&
                        !proprio &&
                        diasRestantes !== null &&
                        diasRestantes < 0
                    ) {
                        alertas += '<span class="smart-alert alert-red">🚨 Vencido</span>';
                    }

                    const contratoOriginal = String(item.contrato || '').trim();
                    const contratoVisivel =
                        contratoOriginal &&
                        ![
                            'NF via IA App',
                            'NF Compra',
                            'Sem Contrato',
                            'Cadastro Manual'
                        ].includes(contratoOriginal)
                            ? `<span class="highlight-txt">${textoSeguro(contratoOriginal, '--')}</span>`
                            : '--';

                    const indenizacao = Number(item.valor_indenizacao) || 0;
                    const indenizacaoHtml = indenizacao > 0
                        ? `<br><div class="indeniz-tag">Indenização: ${Utils.formatarMoeda(indenizacao)}</div>`
                        : '';

                    const id = atributoSeguro(item.id);
                    const nome = atributoSeguro(item.equipamento || 'Equipamento');
                    const fim = atributoSeguro(item.data_fim || '');
                    const unidade = atributoSeguro(item.unidade || 'Dia');

                    let botoes = '';

                    if (status === 'ativo') {
                        botoes += `<button class="btn-action-small" data-action="editar" data-id="${id}" title="Editar">✏️</button>`;

                        if (!proprio) {
                            botoes += `<button class="btn-action-small" data-action="renovar" data-id="${id}" data-fim="${fim}" data-uni="${unidade}" title="Renovar">🔄</button>`;
                        }

                        botoes += `<button class="btn-action-small" data-action="devolver" data-id="${id}" data-nome="${nome}" title="Devolver (Histórico)">↩️</button>`;
                        botoes += `<button class="btn-action-small" data-action="excluir" data-id="${id}" data-nome="${nome}" title="Mover para Itens Excluídos">🗑️</button>`;
                    } else if (status === 'inativo') {
                        botoes = `
                            <span class="status-badge" style="margin-right:8px;">Devolvido</span>
                            <button class="btn-action-small" data-action="restaurar" data-id="${id}" data-nome="${nome}" title="Restaurar para Ativos">🔄</button>
                        `;
                    } else if (status === 'excluido') {
                        botoes = `
                            <span class="status-badge" style="margin-right:8px;background:var(--danger);color:#fff;">Excluído</span>
                            <button class="btn-action-small" data-action="restaurar" data-id="${id}" data-nome="${nome}" title="Restaurar para Ativos">🔄</button>
                        `;
                    } else {
                        botoes = `
                            <span class="status-badge" style="margin-right:8px;background:var(--warning);color:#fff;">Status indefinido</span>
                            <button class="btn-action-small" data-action="restaurar" data-id="${id}" data-nome="${nome}" title="Forçar restauração">🔄</button>
                        `;
                    }

                    const periodoPrincipal = proprio
                        ? Utils.formatarData(item.data_inicio)
                        : textoSeguro(item.unidade, 'Mês');

                    const periodoSecundario = !proprio
                        ? `<span class="sub-txt" style="color:var(--primary);font-weight:600;">Vence: ${Utils.formatarData(item.data_fim)}</span>`
                        : '';

                    const linha = `
                        <tr>
                            <td class="col-obra">
                                <div class="group-info">
                                    <span class="main-txt">${textoSeguro(item.obra, '--')}</span>
                                    <span class="sub-txt">Forn: ${textoSeguro(item.fornecedor, '--')}</span>
                                </div>
                            </td>
                            <td class="col-equip">
                                <span class="main-txt">
                                    <span class="qtd-badge">${quantidade} UN</span>
                                    ${textoSeguro(item.equipamento, '--')}
                                </span>
                                <div style="margin-top:4px;">${alertas}</div>
                            </td>
                            <td class="col-periodo">
                                <div class="group-info">
                                    <span class="main-txt">${periodoPrincipal}</span>
                                    ${periodoSecundario}
                                </div>
                            </td>
                            <td class="col-contrato">
                                <div class="group-info"><span class="main-txt">${contratoVisivel}</span></div>
                            </td>
                            <td class="col-valor">
                                <div class="group-info">
                                    <span class="price-tag">${Utils.formatarMoeda(item.valor)}</span>
                                    ${indenizacaoHtml}
                                </div>
                            </td>
                            <td class="col-anexo">${botaoAnexo}</td>
                            <td class="col-acoes"><div class="action-buttons">${botoes}</div></td>
                        </tr>
                    `;

                    if (status === 'excluido') {
                        listas.excluidos.push(linha);
                    } else if (status === 'inativo') {
                        listas.historico.push(linha);
                    } else if (proprio && status === 'ativo') {
                        listas.compras.push(linha);
                    } else {
                        listas.locacoes.push(linha);
                    }
                });

                const configuracoes = [
                    ['body-locacoes', 'tabela-locacoes', listas.locacoes, 'Nenhuma locação ativa encontrada.'],
                    ['body-compras', 'tabela-compras', listas.compras, 'Nenhum patrimônio próprio encontrado.'],
                    ['body-historico', 'tabela-historico', listas.historico, 'Nenhum equipamento devolvido encontrado.'],
                    ['body-excluidos', 'tabela-excluidos', listas.excluidos, 'Nenhum item excluído encontrado.']
                ];

                configuracoes.forEach(([bodyId, tabelaId, linhas, vazio]) => {
                    const corpo = obterElemento(bodyId);
                    const tabela = obterElemento(tabelaId);

                    if (corpo) corpo.innerHTML = linhas.length
                        ? linhas.join('')
                        : criarLinhaVazia(vazio);

                    if (tabela) tabela.style.display = 'table';
                });

                document
                    .querySelectorAll('.loader')
                    .forEach((elemento) => {
                        elemento.style.display = 'none';
                    });

            } catch (erro) {
                console.error('[UI] Erro ao renderizar tabelas:', erro);
                Utils.showToast(
                    'Os dados chegaram, mas não foi possível montar as tabelas.',
                    'error'
                );
            }
        },

        renderizarModuloFornecedores() {
            const tbody = obterElemento('body-fornecedores');
            const tabela = obterElemento('tabela-fornecedores');
            if (!tbody) return;

            const contagem = new Map();
            const registros = Array.isArray(State.dadosFiltrados)
                ? State.dadosFiltrados
                : [];

            registros.forEach((item) => {
                if (normalizarStatus(item.status) !== 'ativo') return;

                const fornecedor = normalizarFornecedor(
                    item.fornecedor
                );

                const quantidade = Math.max(
                    1,
                    Number.parseInt(item.quantidade, 10) || 1
                );

                contagem.set(
                    fornecedor,
                    (contagem.get(fornecedor) || 0) + quantidade
                );
            });

            const fornecedores = [...contagem.keys()]
                .sort((a, b) => a.localeCompare(b, 'pt-BR'));

            if (fornecedores.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align:center;padding:28px;color:var(--text-light);">
                            Nenhum fornecedor ativo encontrado.
                        </td>
                    </tr>
                `;
                if (tabela) tabela.style.display = 'table';
                return;
            }

            tbody.innerHTML = fornecedores.map((fornecedor) => {
                const fornecedorAtributo = atributoSeguro(fornecedor);

                return `
                    <tr>
                        <td class="col-obra"><span class="main-txt">${textoSeguro(fornecedor)}</span></td>
                        <td class="col-equip"><span class="status-badge highlight">${contagem.get(fornecedor)} ativos</span></td>
                        <td class="col-acoes">
                            <div class="action-buttons">
                                <button class="btn-action-small" data-action="renomear-forn" data-nome="${fornecedorAtributo}" title="Renomear">✏️</button>
                                <button class="btn-action-small" data-action="mesclar-forn" data-nome="${fornecedorAtributo}" title="Mesclar">🔗</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            if (tabela) tabela.style.display = 'table';
        }
    };

    window.UI = UI;
})();
