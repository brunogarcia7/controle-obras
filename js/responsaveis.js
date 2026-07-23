class ResponsaveisService {
    static async listar() {
        console.log("[ResponsaveisService] Buscando responsáveis...");
        // CORREÇÃO: Usando DB.client
        const { data, error } = await DB.client.from('responsaveis_obras').select('*').order('nome');
        if (error) console.error("Erro ao listar responsáveis:", error);
        return data || [];
    }

    static async salvar(responsavel) {
        console.log("[ResponsaveisService] Salvando...", responsavel);
        if (responsavel.id) {
            return await DB.client.from('responsaveis_obras').update(responsavel).eq('id', responsavel.id);
        } else {
            return await DB.client.from('responsaveis_obras').insert([responsavel]);
        }
    }

    static async excluir(id) {
        return await DB.client.from('responsaveis_obras').delete().eq('id', id);
    }

    static async toggleAtivo(id, statusAtual) {
        return await DB.client.from('responsaveis_obras').update({ ativo: !statusAtual }).eq('id', id);
    }
}
window.ResponsaveisService = ResponsaveisService;
