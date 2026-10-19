// Regras do cadastro móvel: uma linha do documento por equipamento cadastrado.
(() => {
    'use strict';

    function moeda(valor) {
        if (valor === null || valor === undefined || String(valor).trim() === '') return null;
        let texto = String(valor).replace(/R\$|\s/g, '');
        if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, '');
        if (!/^\d+(\.\d{1,2})?$/.test(texto)) return null;
        const centavos = Math.round(Number(texto) * 100);
        return Number.isSafeInteger(centavos) ? centavos / 100 : null;
    }

    function dataISO(valor) {
        const texto = String(valor || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return '';
        const data = new Date(`${texto}T12:00:00`);
        return Number.isNaN(data.getTime()) ||
            data.getFullYear() !== Number(texto.slice(0, 4)) ||
            data.getMonth() + 1 !== Number(texto.slice(5, 7)) ||
            data.getDate() !== Number(texto.slice(8, 10)) ? '' : texto;
    }

    function normalizarResposta(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Leitura do documento inválida.');
        const legado = !Object.prototype.hasOwnProperty.call(data, 'itens');
        if (!legado && (!Array.isArray(data.itens) || !data.itens.length)) {
            throw new Error('A leitura não retornou equipamentos. Adicione as linhas manualmente ou tente outra imagem.');
        }
        const itens = (legado ? [data] : data.itens).map((item, indice) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`O item ${indice + 1} não pôde ser lido.`);
            return {
                codigo: String(item.codigo || '').trim(),
                equipamento: String(item.equipamento || '').trim(),
                quantidade: item.quantidade ?? 1,
                valor: moeda(item.valor) ?? '',
                valor_indenizacao: moeda(item.valor_indenizacao) ?? ''
            };
        });
        const avisos = (Array.isArray(data.avisos) ? data.avisos : []).map(String);
        if (legado) avisos.push('A leitura retornou somente um equipamento. Confira todas as linhas e adicione as faltantes.');
        const informado = Number(data.total_itens);
        if (informado > 0 && informado !== itens.length) {
            avisos.push(`O documento indica ${informado} linhas e a leitura retornou ${itens.length}. Confira os itens faltantes.`);
        }
        return {
            fornecedor: String(data.fornecedor || '').trim(),
            contrato: String(data.contrato || '').trim(),
            data_inicio: dataISO(data.data_inicio),
            data_fim: dataISO(data.data_fim),
            periodo: /dia|di[aá]ri/i.test(data.periodo) ? 'Dia' : /semana/i.test(data.periodo) ? 'Semana' : 'Mês',
            valor_total: moeda(data.valor_total ?? (legado ? data.valor : '')),
            valor_indenizacao_total: moeda(data.valor_indenizacao_total),
            itens,
            avisos: [...new Set(avisos)]
        };
    }

    function resumir(itens) {
        return itens.reduce((soma, item) => {
            const quantidade = Number(item.quantidade);
            soma.unidades += Number.isSafeInteger(quantidade) && quantidade > 0 ? quantidade : 0;
            for (const campo of ['valor', 'valor_indenizacao']) {
                const numero = moeda(item[campo]);
                if (numero === null) soma.pendentes[campo] += 1;
                else soma[campo] += Math.round(numero * 100);
            }
            return soma;
        }, { linhas: itens.length, unidades: 0, valor: 0, valor_indenizacao: 0, pendentes: { valor: 0, valor_indenizacao: 0 } });
    }

    function criarPayloads(cadastro, urlAnexo, hoje) {
        const obra = String(cadastro.obra || '').trim();
        if (!obra) throw new Error('Preencha a obra / destino.');
        if (!Array.isArray(cadastro.itens) || !cadastro.itens.length) throw new Error('Adicione pelo menos um equipamento.');
        const inicio = dataISO(cadastro.data_inicio || hoje);
        const fim = cadastro.data_fim ? dataISO(cadastro.data_fim) : null;
        if (!inicio || (cadastro.data_fim && !fim)) throw new Error('Confira as datas de início e vencimento.');
        const compra = cadastro.tipo === 'Compra';
        if (!compra && fim && fim < inicio) throw new Error('O vencimento não pode ser anterior à data inicial.');

        return cadastro.itens.map((item, indice) => {
            const equipamento = String(item.equipamento || '').trim();
            const quantidade = Number(item.quantidade);
            const valor = moeda(item.valor);
            const indenizacaoVazia = item.valor_indenizacao === '' || item.valor_indenizacao === null || item.valor_indenizacao === undefined;
            const indenizacao = indenizacaoVazia ? 0 : moeda(item.valor_indenizacao);
            if (!equipamento) throw new Error(`Preencha a descrição do item ${indice + 1}.`);
            if (!Number.isSafeInteger(quantidade) || quantidade < 1) throw new Error(`Confira a quantidade do item ${indice + 1}.`);
            if (valor === null) throw new Error(`Preencha o valor total de locação/compra do item ${indice + 1}. Use 0 quando for gratuito.`);
            if (indenizacao === null) throw new Error(`Confira o valor de indenização do item ${indice + 1}.`);
            return {
                obra,
                equipamento,
                fornecedor: String(cadastro.fornecedor || '').trim() || 'Não identificado',
                quantidade,
                valor,
                valor_indenizacao: indenizacao,
                data_inicio: inicio,
                data_fim: compra ? inicio : fim,
                status: 'ativo',
                anexo: urlAnexo || null,
                unidade: compra ? 'Proprio' : ['Dia', 'Semana', 'Mês'].includes(cadastro.periodo) ? cadastro.periodo : 'Mês',
                contrato: String(cadastro.contrato || '').trim() || (compra ? 'NF Compra Mobile' : 'NF via App')
            };
        });
    }

    globalThis.OCRItens = Object.freeze({ moeda, dataISO, normalizarResposta, resumir, criarPayloads });
})();
