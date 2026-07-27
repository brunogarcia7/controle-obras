const DB = {
    client: supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY),
    
    carregarDados: async () => {
    Utils.showLoader('A carregar base de dados...');
    try {

        console.log("========== INICIANDO LEITURA ==========");

        const { data, error } = await DB.client
            .from('locacoes')
            .select('*');

        console.log("Erro retornado:", error);
        console.log("Quantidade de registros:", data ? data.length : 0);
        console.log("Dados completos:", data);

        if (error) throw error;

        State.dadosGlobais = data || [];

        console.log("State.dadosGlobais:", State.dadosGlobais);

        console.log("========== FIM DA LEITURA ==========");

    } catch (err) {

        console.error("ERRO COMPLETO:");
        console.error(err);

        Utils.showToast("Erro ao conectar no banco.", "error");

    } finally {
        Utils.hideLoader();
    }
},

    salvar: async (id, payload) => {
        Utils.showLoader('Salvando no banco...');
        try {
            let res;
            if (id) res = await DB.client.from('locacoes').update(payload).eq('id', id);
            else res = await DB.client.from('locacoes').insert([payload]);
            if (res.error) throw res.error;
            Utils.registrarLog(id ? 'Edição' : 'Novo', `Item: ${payload.equipamento}`);
            return true;
        } catch(e) {
            Utils.showToast("Erro ao salvar.", "error"); return false;
        } finally { Utils.hideLoader(); }
    },

    mudarStatus: async (id, status, nomeItem) => {
        Utils.showLoader('Atualizando status...');
        const { error } = await DB.client.from('locacoes').update({ status }).eq('id', id);
        Utils.hideLoader();
        if(!error) {
            Utils.registrarLog('Status alterado', `${nomeItem} movido para ${status}`);
            return true;
        }
        return false;
    }
};
