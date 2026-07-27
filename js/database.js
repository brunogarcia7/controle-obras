const DB = {

    client: supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY),

    carregarDados: async () => {

        Utils.showLoader('A carregar base de dados...');

        try {

            console.log("======================================");
            console.log("INICIANDO LEITURA DO SUPABASE");
            console.log("======================================");

            console.log("CONFIG:", CONFIG);
            console.log("CLIENT:", DB.client);

            const { data, error } = await DB.client
                .from('locacoes')
                .select('*');

            console.log("ERRO RETORNADO:");
            console.log(error);

            console.log("DADOS RETORNADOS:");
            console.log(data);

            if (error) throw error;

            State.dadosGlobais = data || [];

            console.log("REGISTROS CARREGADOS:", State.dadosGlobais.length);
            console.log("STATE:", State.dadosGlobais);

            console.log("======================================");
            console.log("LEITURA FINALIZADA");
            console.log("======================================");

        } catch (err) {

            console.error("ERRO GERAL");
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

            if (id) {
                res = await DB.client
                    .from('locacoes')
                    .update(payload)
                    .eq('id', id);
            } else {
                res = await DB.client
                    .from('locacoes')
                    .insert([payload]);
            }

            if (res.error) throw res.error;

            Utils.registrarLog(
                id ? 'Edição' : 'Novo',
                `Item: ${payload.equipamento}`
            );

            return true;

        } catch (e) {

            console.error(e);
            Utils.showToast("Erro ao salvar.", "error");
            return false;

        } finally {

            Utils.hideLoader();

        }

    },

    mudarStatus: async (id, status, nomeItem) => {

        Utils.showLoader('Atualizando status...');

        const { error } = await DB.client
            .from('locacoes')
            .update({ status })
            .eq('id', id);

        Utils.hideLoader();

        if (!error) {

            Utils.registrarLog(
                'Status alterado',
                `${nomeItem} movido para ${status}`
            );

            return true;
        }

        console.error(error);

        return false;
    }

};
