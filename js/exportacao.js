'use strict';

const Exportacao = {
    formatarDataArquivo(data = new Date()) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    },

    exportarExcel() {
        if (State.dadosFiltrados.length === 0) {
            Utils.showToast('Nenhum dado filtrado para exportar.', 'warning');
            return;
        }

        Utils.showLoader('Gerando Excel...');
        setTimeout(() => {
            try {
                const incHist = document.getElementById('check-print-hist').checked;
                const dadosParaExportar = incHist
                    ? State.dadosFiltrados
                    : State.dadosFiltrados.filter(item => item.status === 'ativo' || item.unidade === 'Proprio');

                if (dadosParaExportar.length === 0) {
                    Utils.showToast('Nenhum item ATIVO para exportar.', 'warning');
                    return;
                }

                const dadosExcel = dadosParaExportar.map(item => ({
                    Status: item.status === 'ativo' ? 'Ativo' : item.status === 'inativo' ? 'Devolvido' : 'Excluído',
                    Obra: item.obra || '-',
                    Fornecedor: item.fornecedor || '-',
                    Equipamento: item.equipamento || '-',
                    Quantidade: item.quantidade || 1,
                    'Nº Contrato': item.contrato || '-',
                    'Período/Unidade': item.unidade || '-',
                    'Data Locação/Compra': item.data_inicio ? Utils.formatarData(item.data_inicio) : '-',
                    'Data Vencimento': item.data_fim ? Utils.formatarData(item.data_fim) : '-',
                    'Valor Total (R$)': Number.parseFloat(item.valor) || 0,
                    'Indenização (R$)': Number.parseFloat(item.valor_indenizacao) || 0
                }));

                const worksheet = XLSX.utils.json_to_sheet(dadosExcel);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Equipamentos');
                worksheet['!cols'] = [
                    { wch: 12 }, { wch: 25 }, { wch: 35 }, { wch: 40 }, { wch: 12 },
                    { wch: 18 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }
                ];
                XLSX.writeFile(workbook, `Controle_Obras_${Exportacao.formatarDataArquivo()}.xlsx`);
                Utils.registrarLog('Exportação', `Gerou Excel de ${dadosExcel.length} itens`);
                Utils.showToast('Planilha gerada!', 'success');
            } catch (erro) {
                console.error('[Exportacao] Falha ao gerar Excel:', erro);
                Utils.showToast('Não foi possível gerar a planilha.', 'error');
            } finally {
                Utils.hideLoader();
            }
        }, 0);
    },

    prepararImpressao() {
        const incHist = document.getElementById('check-print-hist').checked;

        document.querySelectorAll('.secao-tabela').forEach(secao => {
            const tabela = secao.querySelector('table');
            const elegivel = secao.id !== 'secao-sistema' && secao.id !== 'secao-fornecedores' && tabela && tabela.style.display !== 'none';
            const omitida = !incHist && (secao.id === 'secao-historico' || secao.id === 'secao-excluidos');
            secao.classList.toggle('print-visible', Boolean(elegivel && !omitida));
        });

        const filtroObra = document.getElementById('filtroObra');
        const filtroForn = document.getElementById('filtroForn');
        const fObra = filtroObra.options[filtroObra.selectedIndex]?.text || 'Todas';
        const fForn = filtroForn.options[filtroForn.selectedIndex]?.text || 'Todos';
        const fTexto = document.getElementById('filtroContrato').value.trim();
        const partes = [`Filtros aplicados: Obra: ${fObra}`, `Fornecedor: ${fForn}`];
        if (fTexto) partes.push(`Pesquisa: "${fTexto}"`);
        if (!incHist) partes.push('Histórico omitido');
        document.getElementById('print-filters').textContent = partes.join(' | ');

        const hoje = new Date();
        document.getElementById('print-date').innerText = `Gerado em: ${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR')}`;

        const qtdPrint = incHist
            ? State.dadosFiltrados.length
            : State.dadosFiltrados.filter(item => item.status === 'ativo' || item.unidade === 'Proprio').length;
        document.getElementById('print-count').innerText = `Total de Registros Impressos: ${qtdPrint}`;

        Utils.registrarLog('Impressão', `Gerou relatório para ${qtdPrint} itens`);
        window.print();
    },

    exportarBackupJSON() {
        if (State.dadosGlobais.length === 0) {
            Utils.showToast('Nenhum dado para backup.', 'warning');
            return;
        }

        const blob = new Blob([JSON.stringify(State.dadosGlobais, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup_obras_${Exportacao.formatarDataArquivo()}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        Utils.registrarLog('Backup Finalizado', `Download JSON (${State.dadosGlobais.length} itens)`);
        Utils.showToast('Backup baixado!', 'success');
    },

    importarBackupJSON(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            Utils.showToast('O backup deve ter no máximo 20 MB.', 'warning');
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => Utils.showToast('Não foi possível ler o arquivo.', 'error');
        reader.onload = eventLeitura => {
            try {
                const json = JSON.parse(String(eventLeitura.target.result || ''));
                if (!Array.isArray(json)) throw new Error('Formato inválido.');

                Utils.showConfirm(
                    '🚨 Restaurar Backup',
                    `Upload de ${json.length} registros para sincronizar o banco. Confirmar?`,
                    async () => {
                        Utils.showLoader('Sincronizando...');
                        try {
                            const { error } = await DB.client.from('locacoes').upsert(json);
                            if (error) throw error;
                            Utils.registrarLog('Restauração de Backup', `Importados ${json.length} itens.`);
                            Utils.showToast('Restaurado com sucesso!', 'success');
                            await App.carregarDados();
                        } catch (erro) {
                            console.error('[Exportacao] Falha ao importar backup:', erro);
                            Utils.showToast(`Erro: ${erro.message}`, 'error');
                        } finally {
                            Utils.hideLoader();
                        }
                    },
                    true
                );
            } catch (erro) {
                console.error('[Exportacao] Backup inválido:', erro);
                Utils.showToast('Arquivo corrompido ou em formato inválido.', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }
};
