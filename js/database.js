const DB = {
    client: supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY),
    
    carregarDados: async () => {
        Utils.showLoader('Conectando ao banco...');
        try {
            const { data, error } = await DB.client.from('locacoes').select('*');
            if (error) throw error;
            State.dadosGlobais = data || [];
        } catch (err) {
            Utils.showToast("Erro ao conectar no banco.", "error");
            console.error(err);
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
            Utils.showToast("Erro ao salvar.", "error"); 
            return false;
        } finally { 
            Utils.hideLoader(); 
        }
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
