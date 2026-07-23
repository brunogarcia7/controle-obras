class DateUtils {
    static calcularDiasRestantes(dataVencimento) {
        if (!dataVencimento) return null;
        
        // Separa YYYY-MM-DD para evitar conversões automáticas de fuso horário
        const [ano, mes, dia] = dataVencimento.split('-');
        const vencimento = new Date(ano, mes - 1, dia);
        
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0); // Zera a hora de hoje
        
        const diffTime = vencimento.getTime() - hoje.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Retorna os dias
    }

    static formatarDataBR(dataString) {
        if (!dataString) return '-';
        const [ano, mes, dia] = dataString.split('-');
        return `${dia}/${mes}/${ano}`;
    }
}
window.DateUtils = DateUtils;
