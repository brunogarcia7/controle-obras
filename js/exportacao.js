const Exportacao = {
    exportarExcel: () => {
        if (State.dadosFiltrados.length === 0) return Utils.showToast("Nenhum dado filtrado para exportar.", "warning");
        Utils.showLoader("Gerando Excel...");
        setTimeout(() => {
            const incHist = document.getElementById('check-print-hist').checked;
            const dadosParaExportar = incHist ? State.dadosFiltrados : State.dadosFiltrados.filter(i => i.status === 'ativo' || i.unidade === 'Proprio');
            
            if (dadosParaExportar.length === 0) { 
                Utils.hideLoader(); 
                return Utils.showToast("Nenhum item ATIVO para exportar.", "warning"); 
            }

            const dadosExcel = dadosParaExportar.map(item => ({
                "Status": item.status === 'ativo' ? 'Ativo' : item.status === 'inativo' ? 'Devolvido' : 'Excluído',
                "Obra": item.obra || "-", "Fornecedor": item.fornecedor || "-", "Equipamento": item.equipamento || "-",
                "Quantidade": item.quantidade || 1, "Nº Contrato": item.contrato || "-", "Período/Unidade": item.unidade || "-",
                "Data Locação/Compra": item.data_inicio ? Utils.formatarData(item.data_inicio) : "-", "Data Vencimento": item.data_fim ? Utils.formatarData(item.data_fim) : "-",
                "Valor Total (R$)": parseFloat(item.valor) || 0, "Indenização (R$)": parseFloat(item.valor_indenizacao) || 0
            }));
            const worksheet = XLSX.utils.json_to_sheet(dadosExcel); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Equipamentos");
            worksheet['!cols'] = [ {wch: 12}, {wch: 25}, {wch: 35}, {wch: 40}, {wch: 12}, {wch: 18}, {wch: 15}, {wch: 20}, {wch: 20}, {wch: 15}, {wch: 15} ];
            XLSX.writeFile(workbook, `Controle_Obras_${new Date().toISOString().split('T')[0]}.xlsx`);
            Utils.hideLoader(); Utils.registrarLog('Exportação', `Gerou Excel de ${dadosExcel.length} itens`); Utils.showToast("Planilha gerada!", "success");
        }, 500);
    },

    prepararImpressao: () => {
        const incHist = document.getElementById('check-print-hist').checked;
        
        document.querySelectorAll('.secao-tabela').forEach(sec => {
            const table = sec.querySelector('table');
            if (sec.id !== 'secao-sistema' && sec.id !== 'secao-fornecedores' && table && table.style.display !== 'none') {
                if (!incHist && (sec.id === 'secao-historico' || sec.id === 'secao-excluidos')) {
                    sec.classList.remove('print-visible');
                } else {
                    sec.classList.add('print-visible');
                }
            } else {
                sec.classList.remove('print-visible');
            }
        });

        const fObra = document.getElementById('filtroObra').options[document.getElementById('filtroObra').selectedIndex].text; 
        const fForn = document.getElementById('filtroForn').options[document.getElementById('filtroForn').selectedIndex].text; 
        const fTexto = document.getElementById('filtroContrato').value.trim();
        
        let filtros = `<strong>Filtros aplicados:</strong> Obra: ${fObra} | Fornecedor: ${fForn}`;
        if (fTexto) filtros += ` | Pesquisa: "${fTexto}"`; 
        if (!incHist) filtros += ` | <i>Histórico Omitido</i>`;
        
        document.getElementById('print-filters').innerHTML = filtros;
        const hoje = new Date(); 
        document.getElementById('print-date').innerText = `Gerado em: ${hoje.toLocaleDateString('pt-BR')} às ${hoje.toLocaleTimeString('pt-BR')}`;
        
        const qtdPrint = incHist ? State.dadosFiltrados.length : State.dadosFiltrados.filter(i => i.status === 'ativo' || i.unidade === 'Proprio').length;
        document.getElementById('print-count').innerText = `Total de Registros Impressos: ${qtdPrint}`;

        Utils.registrarLog('Impressão', `Gerou relatório para ${qtdPrint} itens`); 
        window.print();
    },

    exportarBackupJSON: () => {
        if(State.dadosGlobais.length === 0) return Utils.showToast("Nenhum dado para backup.", "warning");
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(State.dadosGlobais));
        const btn = document.createElement('a'); btn.setAttribute("href", dataStr); btn.setAttribute("download", "backup_obras_" + new Date().toISOString().split('T')[0] + ".json");
        document.body.appendChild(btn); btn.click(); btn.remove();
        Utils.registrarLog('Backup Finalizado', `Download JSON (${State.dadosGlobais.length} itens)`); Utils.showToast("Backup baixado!", "success");
    },

    importarBackupJSON: (event) => {
        const file = event.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const json = JSON.parse(e.target.result);
                if(!Array.isArray(json)) throw new Error("Formato inválido.");
                Utils.showConfirm("🚨 Restaurar Backup", `Upload de ${json.length} registros para Sincronizar o banco. Confirmar?`, async () => {
                    Utils.showLoader("Sincronizando..."); const { error } = await DB.client.from('locacoes').upsert(json); Utils.hideLoader();
                    if(error) { Utils.showToast("Erro: " + error.message, "error"); } else { Utils.registrarLog('Restauração de Backup', `Importados ${json.length} itens.`); Utils.showToast("Restaurado com sucesso!", "success"); App.carregarDados(); }
                }, true);
            } catch(err) { Utils.showToast("Arquivo corrompido.", "error"); }
        };
        reader.readAsText(file); event.target.value = ''; 
    }
};
