const Exportacao = {
    gerarExcel: () => {
        if (State.dadosFiltrados.length === 0) return Utils.showToast("Nada para exportar", "warning");
        Utils.showLoader("Gerando Excel...");
        setTimeout(() => {
            const data = State.dadosFiltrados.map(i => ({ Status: i.status, Equipamento: i.equipamento, Valor: i.valor }));
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Dados");
            XLSX.writeFile(wb, `Relatorio_${Date.now()}.xlsx`);
            Utils.hideLoader();
            Utils.showToast("Exportado com sucesso!");
        }, 300);
    },
    imprimir: () => window.print()
};
