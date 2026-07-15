const Equipamentos = {
    processarUploadArquivo: (event, origem) => {
        const file = event.target.files[0]; if (!file) return;
        const isPDF = file.type === 'application/pdf';
        const nomeBox = document.getElementById(`${origem}-anexo-nome`);
        nomeBox.innerText = file.name; nomeBox.style.color = isPDF ? 'var(--danger)' : 'var(--primary)'; nomeBox.style.fontWeight = 'bold';
        State.mimeTypeTemporario = isPDF ? 'pdf' : 'jpg';
        const reader = new FileReader();
        reader.onload = function(e) { State.base64AnexoTemporario = e.target.result; };
        reader.readAsDataURL(file);
    },

    toggleCamposNovo: () => {
        const tipo = document.getElementById('novo-tipo').value;
        document.getElementById('campos-locacao').style.display = tipo === 'aluguel' ? 'block' : 'none';
        document.getElementById('box-vencimento').style.display = tipo === 'aluguel' ? 'block' : 'none';
        document.getElementById('lbl-forn').innerText = tipo === 'aluguel' ? 'Locadora' : 'Loja / Fornecedor';
        document.getElementById('lbl-data-inicio').innerText = tipo === 'aluguel' ? 'Data Locação' : 'Data da Compra';
    },

    abrirModalNovo: () => {
        document.getElementById('novo-tipo').value = 'aluguel'; document.getElementById('novo-obra').value = ''; document.getElementById('novo-equip').value = ''; document.getElementById('novo-qtd').value = '1'; document.getElementById('novo-valor').value = ''; document.getElementById('novo-forn').value = ''; document.getElementById('novo-contrato').value = ''; document.getElementById('novo-periodo').value = 'Mês'; 
        const hoje = new Date(); document.getElementById('novo-inicio').value = hoje.toISOString().split('T')[0]; hoje.setDate(hoje.getDate() + 30); document.getElementById('novo-vencimento').value = hoje.toISOString().split('T')[0];
        State.base64AnexoTemporario = null; document.getElementById('novo-anexo-file').value = ''; document.getElementById('novo-anexo-nome').innerText = "Nenhum arquivo"; document.getElementById('novo-anexo-nome').style.color = "var(--text-light)"; document.getElementById('novo-anexo-nome').style.fontWeight = "normal";
        Equipamentos.toggleCamposNovo(); UI.abrirModal('modal-novo');
    },

    salvarNovo: async () => {
        const tipo = document.getElementById('novo-tipo').value; const obra = document.getElementById('novo-obra').value.trim(); const equipamento = document.getElementById('novo-equip').value.trim(); const quantidade = parseInt(document.getElementById('novo-qtd').value) || 1; const valor = parseFloat(document.getElementById('novo-valor').value) || 0; const fornecedor = document.getElementById('novo-forn').value.trim() || 'Não identificado';
        if (!obra || !equipamento) return Utils.showToast("Preencha obra e equipamento!", "warning");
        const data_inicio = document.getElementById('novo-inicio').value || new Date().toISOString().split('T')[0];
        let objSalvar = { obra, fornecedor, equipamento, quantidade, valor, status: 'ativo', data_inicio };

        if (tipo === 'compra') { objSalvar.unidade = 'Proprio'; objSalvar.data_fim = data_inicio; objSalvar.contrato = 'Cadastro Manual'; } 
        else { objSalvar.unidade = document.getElementById('novo-periodo').value.trim() || 'Mês'; objSalvar.data_fim = document.getElementById('novo-vencimento').value || data_inicio; objSalvar.contrato = document.getElementById('novo-contrato').value.trim() || 'Sem Contrato'; }

        if (State.base64AnexoTemporario) {
            Utils.showLoader("Subindo anexo...");
            const blob = await (await fetch(State.base64AnexoTemporario)).blob();
            const { data, error } = await DB.client.storage.from('comprovantes').upload(`doc_${Date.now()}.${State.mimeTypeTemporario}`, blob);
            if(!error) objSalvar.anexo = DB.client.storage.from('comprovantes').getPublicUrl(data.path).data.publicUrl;
        }

        Utils.showLoader("Cadastrando..."); const { error } = await DB.client.from('locacoes').insert([objSalvar]); Utils.hideLoader();
        if (!error) { Utils.registrarLog('Novo Cadastro', `Item: ${equipamento}`); Utils.showToast("Salvo!", "success"); UI.fecharModal('modal-novo'); App.carregarDados(); } else { Utils.showToast("Erro.", "error"); }
    },

    abrirEdicao: (id) => {
        const item = State.dadosGlobais.find(i => i.id === id); if(!item) return;
        document.getElementById('edit-id').value = item.id; document.getElementById('edit-equip').value = item.equipamento || '';
        document.getElementById('edit-forn').value = item.fornecedor || ''; document.getElementById('edit-qtd').value = item.quantidade || 1; document.getElementById('edit-contrato').value = item.contrato || ''; document.getElementById('edit-periodo').value = item.unidade || 'Mês';
        document.getElementById('edit-valor').value = item.valor || 0; document.getElementById('edit-inicio').value = item.data_inicio ? item.data_inicio.split('T')[0] : ''; document.getElementById('edit-vencimento').value = item.data_fim ? item.data_fim.split('T')[0] : ''; document.getElementById('edit-indenizacao').value = item.valor_indenizacao || 0;
        State.base64AnexoTemporario = null; document.getElementById('edit-anexo-file').value = ''; document.getElementById('edit-anexo-nome').innerText = item.anexo ? "Arquivo atual mantido." : "Nenhum arquivo."; document.getElementById('edit-anexo-nome').style.color = "var(--text-light)"; document.getElementById('edit-anexo-nome').style.fontWeight = "normal";
        UI.abrirModal('modal-editar');
    },

    salvarEdicao: async () => {
        const id = document.getElementById('edit-id').value; const equipamento = document.getElementById('edit-equip').value.trim(); const fornecedor = document.getElementById('edit-forn').value.trim() || 'Não identificado'; const quantidade = parseInt(document.getElementById('edit-qtd').value) || 1; const contrato = document.getElementById('edit-contrato').value.trim(); const unidade = document.getElementById('edit-periodo').value.trim() || 'Mês'; const valor = parseFloat(document.getElementById('edit-valor').value) || 0; const data_inicio = document.getElementById('edit-inicio').value; const data_fim = document.getElementById('edit-vencimento').value; const valor_indenizacao = parseFloat(document.getElementById('edit-indenizacao').value) || 0;
        let objUpdate = { equipamento, fornecedor, quantidade, contrato, unidade, valor, data_inicio, data_fim, valor_indenizacao };
        
        if (State.base64AnexoTemporario) {
            Utils.showLoader("Atualizando anexo...");
            const blob = await (await fetch(State.base64AnexoTemporario)).blob();
            const { data, error } = await DB.client.storage.from('comprovantes').upload(`doc_${Date.now()}.${State.mimeTypeTemporario}`, blob);
            if(!error) objUpdate.anexo = DB.client.storage.from('comprovantes').getPublicUrl(data.path).data.publicUrl;
        }

        Utils.showLoader("Salvando..."); const { error } = await DB.client.from('locacoes').update(objUpdate).eq('id', id); Utils.hideLoader();
        if(!error) { Utils.registrarLog('Edição', `Atualizou o item: ${equipamento}`); UI.fecharModal('modal-editar'); Utils.showToast("Salvo com sucesso!", "success"); App.carregarDados(); } else { Utils.showToast("Erro ao salvar.", "error"); }
    },

    devolverItem: (id, equipNome) => Utils.showConfirm("Devolver Equipamento", "Deseja marcar este item como devolvido?", async () => { Utils.showLoader("Devolvendo..."); await DB.client.from('locacoes').update({ status: 'inativo' }).eq('id', id); Utils.hideLoader(); Utils.registrarLog('Devolução', `Moveu para devolvidos: ${equipNome}`); Utils.showToast("Devolvido!", "success"); App.carregarDados(); }, false),
    excluirPermanenteItem: (id, equipNome) => Utils.showConfirm("Excluir Permanentemente", "Deseja mover para a lixeira (Itens Excluídos)?", async () => { Utils.showLoader("Excluindo..."); await DB.client.from('locacoes').update({ status: 'excluido' }).eq('id', id); Utils.hideLoader(); Utils.registrarLog('Exclusão Permanente', `Moveu para excluídos: ${equipNome}`); Utils.showToast("Excluído!", "success"); App.carregarDados(); }, true),
    restaurarItem: (id, equipNome) => Utils.showConfirm("Restaurar Item", "Mover item de volta para os ATIVOS?", async () => { Utils.showLoader("Restaurando..."); await DB.client.from('locacoes').update({ status: 'ativo' }).eq('id', id); Utils.hideLoader(); Utils.registrarLog('Restauração', `Voltou para os ativos: ${equipNome}`); Utils.showToast("Restaurado!", "success"); App.carregarDados(); }),
    renovarItem: (id, fim, uni) => Utils.showConfirm("Renovar Período", "Prorrogar locação?", async () => { Utils.showLoader("Renovando..."); let d = new Date(fim); d.setMinutes(d.getMinutes() + d.getTimezoneOffset()); if(uni.includes('Mês')) d.setDate(d.getDate() + 30); else if (uni.includes('Quinzena')) d.setDate(d.getDate() + 15); else d.setDate(d.getDate() + 1); await DB.client.from('locacoes').update({ data_fim: d.toISOString().split('T')[0] }).eq('id', id); Utils.hideLoader(); Utils.registrarLog('Renovação', `Prorrogou contrato ID: ${id}`); Utils.showToast("Renovado!", "success"); App.carregarDados(); }),

    abrirRenomearForn: (origem) => { document.getElementById('renomear-forn-origem').value = origem; document.getElementById('renomear-forn-origem-txt').value = origem; document.getElementById('renomear-forn-novo').value = origem; UI.abrirModal('modal-renomear-forn'); },
    salvarRenomearForn: () => {
        const origem = document.getElementById('renomear-forn-origem').value; const novoNome = document.getElementById('renomear-forn-novo').value.trim();
        if (!novoNome || novoNome === origem) return Utils.showToast("Nome inválido!", "warning");
        Utils.showConfirm('Renomear Fornecedor', `TODOS os equipamentos de "${origem}" mudarão para "${novoNome}".`, async () => {
            UI.fecharModal('modal-renomear-forn'); Utils.showLoader("Atualizando..."); await DB.client.from('locacoes').update({ fornecedor: novoNome }).eq('fornecedor', origem); Utils.hideLoader(); Utils.registrarLog('Renomeou Fornecedor', `De ${origem} para ${novoNome}`); Utils.showToast("Alterado com sucesso!", "success"); App.carregarDados();
        });
    },
    abrirMesclarForn: (origem) => {
        document.getElementById('merge-origem').value = origem; document.getElementById('merge-origem-txt').value = origem; const selDestino = document.getElementById('merge-destino'); selDestino.innerHTML = '';
        [...new Set(State.dadosGlobais.map(i => i.fornecedor))].filter(Boolean).sort().forEach(f => { if(f !== origem) { selDestino.add(new Option(f, f)); } });
        UI.abrirModal('modal-mesclar-forn');
    },
    salvarMesclarForn: () => {
        const origem = document.getElementById('merge-origem').value; const destino = document.getElementById('merge-destino').value;
        if(!destino) return Utils.showToast("Selecione o destino!", "warning");
        Utils.showConfirm('Mesclar Fornecedores', `Unificar "${origem}" dentro de "${destino}"?`, async () => {
            UI.fecharModal('modal-mesclar-forn'); Utils.showLoader("Mesclando..."); await DB.client.from('locacoes').update({ fornecedor: destino }).eq('fornecedor', origem); Utils.hideLoader(); Utils.registrarLog('Mesclou Fornecedores', `Transferiu de ${origem} para ${destino}`); Utils.showToast("Mesclado!", "success"); App.carregarDados();
        });
    }
};
