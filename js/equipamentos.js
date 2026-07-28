'use strict';

const Equipamentos = {
    MIME_ANEXOS: new Set([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp'
    ]),

    formatarDataLocal(data = new Date()) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    },

    extensaoPorMime(mimeType) {
        return ({
            'application/pdf': 'pdf',
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
        })[mimeType] || 'bin';
    },

    limparAnexoTemporario(origem, texto = 'Nenhum arquivo') {
        State.arquivoAnexoTemporario = null;
        State.base64AnexoTemporario = null;
        State.mimeTypeTemporario = '';

        const input = document.getElementById(`${origem}-anexo-file`);
        const nomeBox = document.getElementById(`${origem}-anexo-nome`);
        if (input) input.value = '';
        if (nomeBox) {
            nomeBox.innerText = texto;
            nomeBox.style.color = 'var(--text-light)';
            nomeBox.style.fontWeight = 'normal';
        }
    },

    processarUploadArquivo(event, origem) {
        const file = event.target.files?.[0];
        if (!file) return;

        const mimeType = String(file.type || '').toLowerCase().split(';')[0].trim();
        if (!Equipamentos.MIME_ANEXOS.has(mimeType)) {
            Equipamentos.limparAnexoTemporario(origem);
            Utils.showToast('Use PDF, JPG, PNG ou WEBP.', 'warning');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            Equipamentos.limparAnexoTemporario(origem);
            Utils.showToast('O anexo deve ter no máximo 20 MB.', 'warning');
            return;
        }

        State.arquivoAnexoTemporario = file;
        State.base64AnexoTemporario = null;
        State.mimeTypeTemporario = mimeType;

        const nomeBox = document.getElementById(`${origem}-anexo-nome`);
        if (nomeBox) {
            nomeBox.innerText = file.name;
            nomeBox.style.color = mimeType === 'application/pdf' ? 'var(--danger)' : 'var(--primary)';
            nomeBox.style.fontWeight = 'bold';
        }
    },

    async uploadAnexoTemporario() {
        const file = State.arquivoAnexoTemporario;
        if (!file) return null;

        const mimeType = State.mimeTypeTemporario || file.type || 'application/octet-stream';
        const extensao = Equipamentos.extensaoPorMime(mimeType);
        const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const caminho = `doc_${id}.${extensao}`;

        const { data, error } = await DB.client.storage
            .from('comprovantes')
            .upload(caminho, file, {
                contentType: mimeType,
                upsert: false
            });

        if (error) throw new Error(`Falha no upload do anexo: ${error.message}`);
        return DB.client.storage.from('comprovantes').getPublicUrl(data.path).data.publicUrl;
    },

    toggleCamposNovo() {
        const tipo = document.getElementById('novo-tipo').value;
        document.getElementById('campos-locacao').style.display = tipo === 'aluguel' ? 'block' : 'none';
        document.getElementById('box-vencimento').style.display = tipo === 'aluguel' ? 'block' : 'none';
        document.getElementById('lbl-forn').innerText = tipo === 'aluguel' ? 'Locadora' : 'Loja / Fornecedor';
        document.getElementById('lbl-data-inicio').innerText = tipo === 'aluguel' ? 'Data Locação' : 'Data da Compra';
    },

    abrirModalNovo() {
        document.getElementById('novo-tipo').value = 'aluguel';
        document.getElementById('novo-obra').value = '';
        document.getElementById('novo-equip').value = '';
        document.getElementById('novo-qtd').value = '1';
        document.getElementById('novo-valor').value = '';
        document.getElementById('novo-forn').value = '';
        document.getElementById('novo-contrato').value = '';
        document.getElementById('novo-periodo').value = 'Mês';

        const hoje = new Date();
        document.getElementById('novo-inicio').value = Equipamentos.formatarDataLocal(hoje);
        hoje.setDate(hoje.getDate() + 30);
        document.getElementById('novo-vencimento').value = Equipamentos.formatarDataLocal(hoje);

        Equipamentos.limparAnexoTemporario('novo');
        Equipamentos.toggleCamposNovo();
        UI.abrirModal('modal-novo');
    },

    async salvarNovo() {
        const tipo = document.getElementById('novo-tipo').value;
        const obra = document.getElementById('novo-obra').value.trim();
        const equipamento = document.getElementById('novo-equip').value.trim();
        const quantidade = Math.max(1, Number.parseInt(document.getElementById('novo-qtd').value, 10) || 1);
        const valor = Math.max(0, Number.parseFloat(document.getElementById('novo-valor').value) || 0);
        const fornecedor = document.getElementById('novo-forn').value.trim() || 'Não identificado';

        if (!obra || !equipamento) {
            Utils.showToast('Preencha obra e equipamento!', 'warning');
            return;
        }

        const data_inicio = document.getElementById('novo-inicio').value || Equipamentos.formatarDataLocal();
        const objSalvar = { obra, fornecedor, equipamento, quantidade, valor, status: 'ativo', data_inicio };

        if (tipo === 'compra') {
            objSalvar.unidade = 'Proprio';
            objSalvar.data_fim = data_inicio;
            objSalvar.contrato = 'Cadastro Manual';
        } else {
            objSalvar.unidade = document.getElementById('novo-periodo').value.trim() || 'Mês';
            objSalvar.data_fim = document.getElementById('novo-vencimento').value || data_inicio;
            objSalvar.contrato = document.getElementById('novo-contrato').value.trim() || 'Sem Contrato';
        }

        Utils.showLoader(State.arquivoAnexoTemporario ? 'Subindo anexo...' : 'Cadastrando...');
        try {
            const urlAnexo = await Equipamentos.uploadAnexoTemporario();
            if (urlAnexo) objSalvar.anexo = urlAnexo;

            const { data, error } = await DB.client.from('locacoes').insert([objSalvar]).select();
            if (error) throw error;
            if (!Array.isArray(data) || data.length === 0) throw new Error('O Supabase não devolveu o registro cadastrado.');

            State.dadosGlobais.unshift(data[0]);
            Utils.registrarLog('Novo Cadastro', `Item: ${equipamento}`);
            Utils.showToast('Salvo!', 'success');
            UI.fecharModal('modal-novo');
            Equipamentos.limparAnexoTemporario('novo');
            App.aplicarFiltrosELocalSort();
        } catch (erro) {
            console.error('[Equipamentos] Falha ao cadastrar:', erro);
            Utils.showToast(erro.message || 'Erro ao cadastrar.', 'error');
        } finally {
            Utils.hideLoader();
        }
    },

    abrirEdicao(id) {
        const item = State.dadosGlobais.find(registro => String(registro.id) === String(id));
        if (!item) return;

        document.getElementById('edit-id').value = item.id;
        document.getElementById('edit-equip').value = item.equipamento || '';
        document.getElementById('edit-forn').value = item.fornecedor || '';
        document.getElementById('edit-qtd').value = item.quantidade || 1;
        document.getElementById('edit-contrato').value = item.contrato || '';
        document.getElementById('edit-periodo').value = item.unidade || 'Mês';
        document.getElementById('edit-valor').value = item.valor || 0;
        document.getElementById('edit-inicio').value = item.data_inicio ? item.data_inicio.split('T')[0] : '';
        document.getElementById('edit-vencimento').value = item.data_fim ? item.data_fim.split('T')[0] : '';
        document.getElementById('edit-indenizacao').value = item.valor_indenizacao || 0;

        Equipamentos.limparAnexoTemporario(
            'edit',
            item.anexo ? 'Arquivo atual mantido.' : 'Nenhum arquivo.'
        );
        UI.abrirModal('modal-editar');
    },

    async salvarEdicao() {
        const id = document.getElementById('edit-id').value;
        const equipamento = document.getElementById('edit-equip').value.trim();
        const fornecedor = document.getElementById('edit-forn').value.trim() || 'Não identificado';
        const quantidade = Math.max(1, Number.parseInt(document.getElementById('edit-qtd').value, 10) || 1);
        const contrato = document.getElementById('edit-contrato').value.trim();
        const unidade = document.getElementById('edit-periodo').value.trim() || 'Mês';
        const valor = Math.max(0, Number.parseFloat(document.getElementById('edit-valor').value) || 0);
        const data_inicio = document.getElementById('edit-inicio').value;
        const data_fim = document.getElementById('edit-vencimento').value;
        const valor_indenizacao = Math.max(0, Number.parseFloat(document.getElementById('edit-indenizacao').value) || 0);

        if (!id || !equipamento) {
            Utils.showToast('ID e equipamento são obrigatórios.', 'warning');
            return;
        }

        const objUpdate = {
            equipamento,
            fornecedor,
            quantidade,
            contrato,
            unidade,
            valor,
            data_inicio,
            data_fim,
            valor_indenizacao
        };

        Utils.showLoader(State.arquivoAnexoTemporario ? 'Atualizando anexo...' : 'Salvando...');
        try {
            const urlAnexo = await Equipamentos.uploadAnexoTemporario();
            if (urlAnexo) objUpdate.anexo = urlAnexo;

            const { data, error } = await DB.client
                .from('locacoes')
                .update(objUpdate)
                .eq('id', id)
                .select();

            if (error) throw error;
            if (!Array.isArray(data) || data.length === 0) throw new Error('O Supabase não devolveu o registro atualizado.');

            const idx = State.dadosGlobais.findIndex(item => String(item.id) === String(id));
            if (idx > -1) State.dadosGlobais[idx] = data[0];
            Utils.registrarLog('Edição', `Atualizou o item: ${equipamento}`);
            UI.fecharModal('modal-editar');
            Equipamentos.limparAnexoTemporario('edit');
            Utils.showToast('Salvo com sucesso!', 'success');
            App.aplicarFiltrosELocalSort();
        } catch (erro) {
            console.error('[Equipamentos] Falha ao editar:', erro);
            Utils.showToast(erro.message || 'Erro ao salvar.', 'error');
        } finally {
            Utils.hideLoader();
        }
    },

    async atualizarStatus(id, status, mensagemLoader, mensagemSucesso, acaoLog, equipNome) {
        Utils.showLoader(mensagemLoader);
        try {
            const { error } = await DB.client.from('locacoes').update({ status }).eq('id', id);
            if (error) throw error;

            const idx = State.dadosGlobais.findIndex(item => String(item.id) === String(id));
            if (idx > -1) State.dadosGlobais[idx].status = status;
            Utils.registrarLog(acaoLog, equipNome);
            Utils.showToast(mensagemSucesso, 'success');
            App.aplicarFiltrosELocalSort();
        } catch (erro) {
            console.error(`[Equipamentos] Falha ao alterar status para ${status}:`, erro);
            Utils.showToast(erro.message || 'Erro ao alterar status.', 'error');
        } finally {
            Utils.hideLoader();
        }
    },

    devolverItem(id, equipNome) {
        Utils.showConfirm('Devolver Equipamento', 'Deseja marcar este item como devolvido?', () =>
            Equipamentos.atualizarStatus(
                id,
                'inativo',
                'Devolvendo...',
                'Devolvido!',
                'Devolução',
                `Moveu para devolvidos: ${equipNome}`
            ), false);
    },

    excluirPermanenteItem(id, equipNome) {
        Utils.showConfirm('Excluir Permanentemente', 'Deseja mover para a lixeira (Itens Excluídos)?', () =>
            Equipamentos.atualizarStatus(
                id,
                'excluido',
                'Excluindo...',
                'Excluído!',
                'Exclusão Permanente',
                `Moveu para excluídos: ${equipNome}`
            ), true);
    },

    restaurarItem(id, equipNome) {
        Utils.showConfirm('Restaurar Item', 'Mover item de volta para os ATIVOS?', () =>
            Equipamentos.atualizarStatus(
                id,
                'ativo',
                'Restaurando...',
                'Restaurado!',
                'Restauração',
                `Voltou para os ativos: ${equipNome}`
            ));
    },

    renovarItem(id, fim, unidade) {
        Utils.showConfirm('Renovar Período', 'Prorrogar locação?', async () => {
            Utils.showLoader('Renovando...');
            try {
                const data = new Date(`${fim}T00:00:00`);
                if (Number.isNaN(data.getTime())) throw new Error('Data final inválida.');

                if (String(unidade).includes('Mês')) data.setDate(data.getDate() + 30);
                else if (String(unidade).includes('Quinzena')) data.setDate(data.getDate() + 15);
                else data.setDate(data.getDate() + 1);

                const novaDataFim = Equipamentos.formatarDataLocal(data);
                const { error } = await DB.client.from('locacoes').update({ data_fim: novaDataFim }).eq('id', id);
                if (error) throw error;

                const idx = State.dadosGlobais.findIndex(item => String(item.id) === String(id));
                if (idx > -1) State.dadosGlobais[idx].data_fim = novaDataFim;
                Utils.registrarLog('Renovação', `Prorrogou contrato ID: ${id}`);
                Utils.showToast('Renovado!', 'success');
                App.aplicarFiltrosELocalSort();
            } catch (erro) {
                console.error('[Equipamentos] Falha ao renovar:', erro);
                Utils.showToast(erro.message || 'Erro ao renovar.', 'error');
            } finally {
                Utils.hideLoader();
            }
        });
    }
};
