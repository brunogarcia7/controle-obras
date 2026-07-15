const App = {
    init: () => {
        UI.inicializarTema();
        App.bindEventos();
        App.recarregarTudo();
    },

    recarregarTudo: async () => {
        await DB.carregarDados();
        App.aplicarFiltros();
    },

    bindEventos: () => {
        // EVENT DELEGATION OTIMIZADO (Um único ouvinte para a tabela inteira)
        document.getElementById('tabelas-container').addEventListener('click', e => {
            const btn = e.target.closest('button[data-action]');
            if(!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            const nome = btn.dataset.nome;

            if(action === 'editar') Equipamentos.abrirEdicao(id);
            if(action === 'devolver') Equipamentos.alterarStatus(id, 'inativo', nome);
            if(action === 'excluir') Equipamentos.alterarStatus(id, 'excluido', nome);
            if(action === 'restaurar') Equipamentos.alterarStatus(id, 'ativo', nome);
        });

        // Filtros (Busca instantânea)
        document.getElementById('filtroContrato').addEventListener('keyup', App.aplicarFiltros);
    },

    aplicarFiltros: () => {
        const fTexto = document.getElementById('filtroContrato').value.trim().toLowerCase();
        State.dadosFiltrados = State.dadosGlobais.filter(item => {
            if(!fTexto) return true;
            return `${item.equipamento} ${item.contrato} ${item.fornecedor}`.toLowerCase().includes(fTexto);
        });

        UI.atualizarKPIs();
        App.renderizarTabelasRapido();
    },

    renderizarTabelasRapido: () => {
        // RENDERIZAÇÃO EM MEMÓRIA (DOM FRAGMENT STRING - 100x mais rápido)
        let htmlTabelas = `<div class="card-table"><table class="table-modern">
            <thead><tr>
                <th class="col-obra">Obra/Forn</th>
                <th class="col-equip">Equipamento</th>
                <th class="col-periodo">Período</th>
                <th class="col-contrato">Contrato</th>
                <th class="col-valor">Valor (R$)</th>
                <th class="col-anexo">Anexo</th>
                <th class="col-acoes">Ações</th>
            </tr></thead><tbody>`;
        
        State.dadosFiltrados.forEach(i => {
            // A ordem de botões solicitada na Versão 1.8: Editar, Renovar, Devolver, Excluir Permanente
            htmlTabelas += `<tr>
                <td class="col-obra">${i.obra} <br><small>${i.fornecedor}</small></td>
                <td class="col-equip"><b>${i.quantidade}x</b> ${i.equipamento}</td>
                <td class="col-periodo">${Utils.formatarData(i.data_inicio)} até ${Utils.formatarData(i.data_fim)}</td>
                <td class="col-contrato">${i.contrato || '--'}</td>
                <td class="col-valor">${Utils.formatarMoeda(i.valor)}</td>
                <td class="col-anexo">${i.anexo ? '✅ Sim' : '❌ Não'}</td>
                <td class="col-acoes">
                    <button data-action="editar" data-id="${i.id}" class="btn-action-small">✏️</button>
                    <button data-action="devolver" data-id="${i.id}" data-nome="${i.equipamento}" class="btn-action-small">↩️</button>
                    <button data-action="excluir" data-id="${i.id}" data-nome="${i.equipamento}" class="btn-action-small">🗑️</button>
                </td>
            </tr>`;
        });

        htmlTabelas += `</tbody></table></div>`;
        document.getElementById('tabelas-container').innerHTML = htmlTabelas;
    }
};

window.onload = App.init;
