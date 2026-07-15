const Equipamentos = {
    abrirNovo: () => {
        document.getElementById('form-id').value = '';
        document.getElementById('modal-equip-titulo').innerText = '➕ Novo Equipamento';
        UI.abrirModal('modal-equipamento');
    },

    abrirEdicao: (id) => {
        const item = State.dadosGlobais.find(i => i.id == id);
        if(!item) return;
        document.getElementById('form-id').value = item.id;
        document.getElementById('form-equip').value = item.equipamento;
        document.getElementById('form-valor').value = item.valor;
        // Preeche demais campos baseados no form
        document.getElementById('modal-equip-titulo').innerText = '✏️ Editar Equipamento';
        UI.abrirModal('modal-equipamento');
    },

    salvar: async () => {
        const id = document.getElementById('form-id').value;
        const payload = {
            equipamento: document.getElementById('form-equip').value,
            valor: parseFloat(document.getElementById('form-valor').value) || 0,
            status: 'ativo'
        };
        const ok = await DB.salvar(id, payload);
        if(ok) { UI.fecharModal('modal-equipamento'); App.recarregarTudo(); }
    },

    alterarStatus: async (id, status, nome) => {
        if(confirm(`Mover equipamento "${nome}" para: ${status.toUpperCase()}?`)){
            if(await DB.mudarStatus(id, status, nome)) App.recarregarTudo();
        }
    }
};
