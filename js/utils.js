// =======================================
// Utils.js
// =======================================

class DateUtils {

    static calcularDiasRestantes(dataVencimento) {

        if (!dataVencimento) return null;

        const [ano, mes, dia] = dataVencimento.split("-");

        const vencimento = new Date(ano, mes - 1, dia);

        const hoje = new Date();

        hoje.setHours(0,0,0,0);

        const diff = vencimento.getTime() - hoje.getTime();

        return Math.ceil(diff / (1000 * 60 * 60 * 24));

    }

    static formatarDataBR(data) {

        if (!data) return "-";

        const [ano, mes, dia] = data.split("-");

        return `${dia}/${mes}/${ano}`;

    }

    // Compatibilidade com módulos antigos
    static formatar(data){

        return this.formatarDataBR(data);

    }

}

window.DateUtils = DateUtils;
