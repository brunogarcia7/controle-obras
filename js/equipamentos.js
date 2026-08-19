'use strict';

const Equipamentos = {
    formatarDataLocal(data = new Date()) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const dia = String(data.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
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

        try {
            const { mimeType } = StorageService.validarArquivo(file);

            State.arquivoAnexoTemporario = file;
            State.base64AnexoTemporario = null;
            State.mimeTypeTemporario = mimeType;

            const nomeBox = document.getElementById(`${origem}-anexo-nome`);
            if (nomeBox) {
                const observacao = mimeType === 'application/pdf'
                    ? 'PDF preservado sem alteracoes'
                    : 'imagem sera compactada ao salvar';
                nomeBox.innerText = `${file.name} (${StorageService.formatarBytes(file.size)}; ${observacao})`;
                nomeBox.style.color = mimeType === 'application/pdf'
                    ? 'var(--danger)'
                    : 'var(--primary)';
                nomeBox.style.fontWeight = 'bold';
            }
        } catch (erro) {
            Equipamentos.limparAnexoTemporario(origem);
            Utils.showToast(erro.message || 'Arquivo invalido.', 'warning');
        }
    },

    async uploadAnexoTemporario() {
        const file = State.arquivoAnexoTemporario;
        if (!file) return null;

        return await StorageService.upload(file, {
            client: DB.client,
            prefix: 'doc'
        });
    },

    async limparUploadFalho(upload) {
        if (!upload?.created || !upload?.publicUrl) return;

        try {
            await StorageService.removerSeSemReferencia(upload.publicUrl, {
                client: DB.client
            });
        } catch (erro) {
            console.warn('[Equipamentos] Nao foi possivel limpar upload sem registro:', erro);
        }
    },

    async removerAnexoAntigoSeOrfao(referencia, idAtual) {
        if (!referencia) return;

        try {
            await StorageService.removerSeSemReferencia(referencia, {
                client: DB.client,
                ignoreId: idAtual
            });
        } catch (erro) {
            // A aplicacao continua funcionando mesmo se a politica de DELETE do bucket nao existir.
            console.warn('[Equipamentos] Anexo antigo ficou para a limpeza de manutencao:', erro);
        }
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

        Utils.showLoader(State.arquivoAnexoTemporario ? 'Otimizando e subindo anexo...' : 'Cadastrando...');
        let upload = null;

        try {
            upload = await Equipamentos.uploadAnexoTemporario();
            if (upload) objSalvar.anexo = upload.publicUrl;

            const { data, error } = await DB.client
                .from('locacoes')
                .insert([objSalvar])
                .select(DB.obterCampos());

            if (error) throw error;
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('O Supabase não devolveu o registro cadastrado.');
            }

            State.dadosGlobais.unshift(data[0]);
            Utils.registrarLog('Novo Cadastro', `Item: ${equipamento}`);
            Utils.showToast(
                `Salvo!${StorageService.mensagemEconomia(upload)}`,
                'success'
            );
            UI.fecharModal('modal-novo');
            Equipamentos.limparAnexoTemporario('novo');
            App.aplicarFiltrosELocalSort();
        } catch (erro) {
            await Equipamentos.limparUploadFalho(upload);
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

        const registroAtual = State.dadosGlobais.find(
            item => String(item.id) === String(id)
        );
        const anexoAnterior = registroAtual?.anexo || null;

        Utils.showLoader(State.arquivoAnexoTemporario ? 'Otimizando e atualizando anexo...' : 'Salvando...');
        let upload = null;

        try {
            upload = await Equipamentos.uploadAnexoTemporario();
            if (upload) objUpdate.anexo = upload.publicUrl;

            const { data, error } = await DB.client
                .from('locacoes')
                .update(objUpdate)
                .eq('id', id)
                .select(DB.obterCampos());

            if (error) throw error;
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('O Supabase não devolveu o registro atualizado.');
            }

            const idx = State.dadosGlobais.findIndex(item => String(item.id) === String(id));
            if (idx > -1) State.dadosGlobais[idx] = data[0];

            if (
                upload?.publicUrl &&
                anexoAnterior &&
                anexoAnterior !== upload.publicUrl
            ) {
                await Equipamentos.removerAnexoAntigoSeOrfao(anexoAnterior, id);
            }

            Utils.registrarLog('Edição', `Atualizou o item: ${equipamento}`);
            UI.fecharModal('modal-editar');
            Equipamentos.limparAnexoTemporario('edit');
            Utils.showToast(
                `Salvo com sucesso!${StorageService.mensagemEconomia(upload)}`,
                'success'
            );
            App.aplicarFiltrosELocalSort();
        } catch (erro) {
            await Equipamentos.limparUploadFalho(upload);
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
        Utils.showConfirm('Mover para a lixeira', 'Deseja mover para Itens Excluídos?', () =>
            Equipamentos.atualizarStatus(
                id,
                'excluido',
                'Excluindo...',
                'Excluído!',
                'Movido para lixeira',
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
    },
    normalizarNomeFornecedor(valor) {
        if (
            typeof Utils !== 'undefined' &&
            typeof Utils.normalizarFornecedor === 'function'
        ) {
            return Utils.normalizarFornecedor(valor);
        }

        const texto = String(valor ?? '')
            .replace(/\s+/g, ' ')
            .trim();

        return texto || 'Não identificado';
    },

    obterRegistrosFornecedor(nome) {
        const fornecedor = Equipamentos.normalizarNomeFornecedor(nome);
        const registros = Array.isArray(State.dadosGlobais)
            ? State.dadosGlobais
            : [];

        return registros.filter((item) =>
            Equipamentos.normalizarNomeFornecedor(
                item?.fornecedor
            ) === fornecedor
        );
    },

    obterFornecedoresDisponiveis() {
        const registros = Array.isArray(State.dadosGlobais)
            ? State.dadosGlobais
            : [];

        return [
            ...new Set(
                registros.map((item) =>
                    Equipamentos.normalizarNomeFornecedor(
                        item?.fornecedor
                    )
                )
            )
        ].sort((a, b) =>
            a.localeCompare(b, 'pt-BR')
        );
    },

    resumirFornecedor(nome) {
        const fornecedor = Equipamentos.normalizarNomeFornecedor(nome);
        const registros = Equipamentos.obterRegistrosFornecedor(fornecedor);
        const resumo = {
            nome: fornecedor,
            totalRegistros: registros.length,
            ativos: 0,
            devolvidos: 0,
            excluidos: 0,
            outros: 0,
            unidades: 0
        };

        registros.forEach((item) => {
            const status = String(item?.status || '')
                .trim()
                .toLowerCase();

            const quantidade = Math.max(
                1,
                Number.parseInt(item?.quantidade, 10) || 1
            );

            resumo.unidades += quantidade;

            if (status === 'ativo') resumo.ativos += 1;
            else if (status === 'inativo') resumo.devolvidos += 1;
            else if (status === 'excluido') resumo.excluidos += 1;
            else resumo.outros += 1;
        });

        return resumo;
    },

    formatarResumoFornecedor(resumo) {
        if (!resumo || resumo.totalRegistros === 0) {
            return 'Nenhum registro encontrado.';
        }

        const partes = [
            `${resumo.totalRegistros} registro(s)`,
            `${resumo.ativos} ativo(s)`,
            `${resumo.devolvidos} devolvido(s)`,
            `${resumo.excluidos} excluído(s)`
        ];

        if (resumo.outros > 0) {
            partes.push(`${resumo.outros} em outro status`);
        }

        return `${partes.join(' • ')} • ${resumo.unidades} unidade(s)`;
    },

    obterDestinoCanonico(nomeDesejado, origem) {
        const destino = Equipamentos.normalizarNomeFornecedor(nomeDesejado);
        const origemNormalizada = Equipamentos.normalizarNomeFornecedor(origem);

        const existente = Equipamentos
            .obterFornecedoresDisponiveis()
            .filter((nome) => nome !== origemNormalizada)
            .find((nome) =>
                nome.localeCompare(
                    destino,
                    'pt-BR',
                    { sensitivity: 'accent' }
                ) === 0
            );

        return existente || destino;
    },

    abrirRenomearForn(nome) {
        const resumo = Equipamentos.resumirFornecedor(nome);

        if (resumo.totalRegistros === 0) {
            Utils.showToast(
                'Fornecedor não encontrado na base carregada.',
                'warning'
            );
            return;
        }

        const origem = document.getElementById('renomear-forn-origem');
        const origemTexto = document.getElementById('renomear-forn-origem-txt');
        const novoNome = document.getElementById('renomear-forn-novo');
        const impacto = document.getElementById('renomear-forn-impacto');

        if (!origem || !origemTexto || !novoNome) {
            Utils.showToast(
                'Os campos de edição do fornecedor não foram encontrados.',
                'error'
            );
            return;
        }

        origem.value = resumo.nome;
        origemTexto.value = resumo.nome;
        novoNome.value = resumo.nome;

        if (impacto) {
            impacto.textContent =
                Equipamentos.formatarResumoFornecedor(resumo);
        }

        UI.abrirModal('modal-renomear-forn');

        window.setTimeout(() => {
            novoNome.focus();
            novoNome.select();
        }, 0);
    },

    salvarRenomearForn() {
        const origemCampo = document.getElementById('renomear-forn-origem');
        const novoCampo = document.getElementById('renomear-forn-novo');
        const valorDigitado = String(novoCampo?.value || '').trim();

        if (!origemCampo || !novoCampo) {
            Utils.showToast(
                'Os campos de edição do fornecedor não foram encontrados.',
                'error'
            );
            return;
        }

        if (!valorDigitado) {
            Utils.showToast(
                'Informe o novo nome do fornecedor.',
                'warning'
            );
            novoCampo.focus();
            return;
        }

        const origem = Equipamentos.normalizarNomeFornecedor(
            origemCampo.value
        );
        const destino = Equipamentos.obterDestinoCanonico(
            valorDigitado,
            origem
        );

        if (destino.length > 180) {
            Utils.showToast(
                'O nome do fornecedor deve ter no máximo 180 caracteres.',
                'warning'
            );
            return;
        }

        if (destino === origem) {
            Utils.showToast(
                'O nome informado é igual ao nome atual.',
                'info'
            );
            return;
        }

        const resumo = Equipamentos.resumirFornecedor(origem);
        const destinoJaExiste = Equipamentos
            .obterFornecedoresDisponiveis()
            .some((nome) => nome === destino && nome !== origem);

        const mensagem = destinoJaExiste
            ? `O fornecedor "${origem}" será mesclado com "${destino}". ${Equipamentos.formatarResumoFornecedor(resumo)}.`
            : `O fornecedor "${origem}" será renomeado para "${destino}" em ${resumo.totalRegistros} registro(s).`;

        Utils.showConfirm(
            destinoJaExiste
                ? 'Renomear e mesclar fornecedor'
                : 'Renomear fornecedor',
            mensagem,
            () => Equipamentos.atualizarFornecedorEmLote(
                origem,
                destino,
                {
                    modalId: 'modal-renomear-forn',
                    acaoLog: destinoJaExiste
                        ? 'Mesclagem de fornecedor'
                        : 'Renomeação de fornecedor'
                }
            )
        );
    },

    abrirMesclarForn(nome) {
        const origemResumo = Equipamentos.resumirFornecedor(nome);

        if (origemResumo.totalRegistros === 0) {
            Utils.showToast(
                'Fornecedor não encontrado na base carregada.',
                'warning'
            );
            return;
        }

        const origem = document.getElementById('merge-origem');
        const origemTexto = document.getElementById('merge-origem-txt');
        const origemResumoEl = document.getElementById('merge-origem-resumo');
        const destinoSelect = document.getElementById('merge-destino');
        const botao = document.getElementById('btn-confirmar-mesclagem');

        if (!origem || !origemTexto || !destinoSelect || !botao) {
            Utils.showToast(
                'Os campos de mesclagem não foram encontrados.',
                'error'
            );
            return;
        }

        const destinos = Equipamentos
            .obterFornecedoresDisponiveis()
            .filter((fornecedor) => fornecedor !== origemResumo.nome);

        if (destinos.length === 0) {
            Utils.showToast(
                'Não existe outro fornecedor para realizar a mesclagem.',
                'warning'
            );
            return;
        }

        origem.value = origemResumo.nome;
        origemTexto.value = origemResumo.nome;

        if (origemResumoEl) {
            origemResumoEl.textContent =
                Equipamentos.formatarResumoFornecedor(origemResumo);
        }

        destinoSelect.innerHTML = '';
        destinoSelect.add(
            new Option('Selecione o fornecedor correto...', '')
        );

        destinos.forEach((fornecedor) => {
            const resumo = Equipamentos.resumirFornecedor(fornecedor);
            destinoSelect.add(
                new Option(
                    `${fornecedor} — ${resumo.totalRegistros} registro(s)`,
                    fornecedor
                )
            );
        });

        destinoSelect.value = '';
        botao.disabled = true;
        Equipamentos.atualizarResumoMesclagem();
        UI.abrirModal('modal-mesclar-forn');

        window.setTimeout(() => destinoSelect.focus(), 0);
    },

    atualizarResumoMesclagem() {
        const origem = Equipamentos.normalizarNomeFornecedor(
            document.getElementById('merge-origem')?.value
        );
        const destinoSelect = document.getElementById('merge-destino');
        const destinoResumoEl = document.getElementById('merge-destino-resumo');
        const botao = document.getElementById('btn-confirmar-mesclagem');
        const destinoValor = String(destinoSelect?.value || '').trim();

        if (!destinoSelect || !botao) return;

        if (!destinoValor) {
            botao.disabled = true;
            if (destinoResumoEl) {
                destinoResumoEl.textContent =
                    'Selecione o fornecedor que será mantido.';
            }
            return;
        }

        const destino = Equipamentos.normalizarNomeFornecedor(destinoValor);

        if (destino === origem) {
            botao.disabled = true;
            if (destinoResumoEl) {
                destinoResumoEl.textContent =
                    'O fornecedor de destino deve ser diferente da origem.';
            }
            return;
        }

        const resumoOrigem = Equipamentos.resumirFornecedor(origem);
        const resumoDestino = Equipamentos.resumirFornecedor(destino);

        if (destinoResumoEl) {
            destinoResumoEl.textContent =
                `${Equipamentos.formatarResumoFornecedor(resumoDestino)}. ` +
                `Após a mesclagem: ${resumoOrigem.totalRegistros + resumoDestino.totalRegistros} registro(s) e ${resumoOrigem.unidades + resumoDestino.unidades} unidade(s).`;
        }

        botao.disabled = resumoOrigem.totalRegistros === 0;
    },

    salvarMesclarForn() {
        const origem = Equipamentos.normalizarNomeFornecedor(
            document.getElementById('merge-origem')?.value
        );
        const destinoValor = String(
            document.getElementById('merge-destino')?.value || ''
        ).trim();

        if (!destinoValor) {
            Utils.showToast(
                'Selecione o fornecedor que será mantido.',
                'warning'
            );
            return;
        }

        const destino = Equipamentos.normalizarNomeFornecedor(destinoValor);

        if (origem === destino) {
            Utils.showToast(
                'Escolha um fornecedor diferente da origem.',
                'warning'
            );
            return;
        }

        const resumo = Equipamentos.resumirFornecedor(origem);

        if (resumo.totalRegistros === 0) {
            Utils.showToast(
                'O fornecedor de origem não possui registros.',
                'warning'
            );
            return;
        }

        Utils.showConfirm(
            'Confirmar mesclagem',
            `Substituir "${origem}" por "${destino}" em ${resumo.totalRegistros} registro(s)? Nenhum equipamento ou contrato será apagado.`,
            () => Equipamentos.atualizarFornecedorEmLote(
                origem,
                destino,
                {
                    modalId: 'modal-mesclar-forn',
                    acaoLog: 'Mesclagem de fornecedor'
                }
            )
        );
    },

    atualizarEstadoFornecedor(idsAtualizados, destino, origem, filtroAnterior) {
        const ids = new Set(
            [...idsAtualizados].map((id) => String(id))
        );

        State.dadosGlobais.forEach((item) => {
            if (ids.has(String(item?.id))) {
                item.fornecedor = destino;
            }
        });

        App.carregarFiltrosSelect();

        const filtroFornecedor = document.getElementById('filtroForn');
        const filtroEraOrigem =
            filtroAnterior !== 'todos' &&
            Equipamentos.normalizarNomeFornecedor(
                filtroAnterior
            ) === origem;

        if (
            filtroFornecedor &&
            filtroEraOrigem &&
            [...filtroFornecedor.options].some(
                (opcao) => opcao.value === destino
            )
        ) {
            filtroFornecedor.value = destino;
        }

        App.aplicarFiltrosELocalSort();

        if (
            window.AlertService &&
            typeof window.AlertService.updateAll === 'function'
        ) {
            Promise.resolve(
                window.AlertService.updateAll(State.dadosGlobais)
            ).catch((erro) => {
                console.warn(
                    '[Equipamentos] Não foi possível atualizar os alertas:',
                    erro
                );
            });
        }
    },

    async atualizarFornecedorEmLote(origem, destino, opcoes = {}) {
        const origemNormalizada = Equipamentos.normalizarNomeFornecedor(origem);
        const destinoNormalizado = Equipamentos.normalizarNomeFornecedor(destino);
        const registros = Equipamentos.obterRegistrosFornecedor(
            origemNormalizada
        );

        if (origemNormalizada === destinoNormalizado) {
            Utils.showToast(
                'Origem e destino são iguais.',
                'warning'
            );
            return false;
        }

        if (registros.length === 0) {
            Utils.showToast(
                'Nenhum registro foi encontrado para atualizar.',
                'warning'
            );
            return false;
        }

        const mapaIds = new Map();

        registros.forEach((item) => {
            if (
                item?.id !== undefined &&
                item?.id !== null &&
                String(item.id) !== ''
            ) {
                mapaIds.set(String(item.id), item.id);
            }
        });

        const ids = [...mapaIds.values()];

        if (ids.length !== registros.length) {
            Utils.showToast(
                'Existem registros sem ID válido; a operação foi cancelada.',
                'error'
            );
            return false;
        }

        const filtroAnterior =
            document.getElementById('filtroForn')?.value || 'todos';
        const idsConfirmados = new Set();
        const tamanhoLote = 100;

        Utils.showLoader(
            `Atualizando ${registros.length} registro(s)...`
        );

        try {
            const client = typeof DB.obterClient === 'function'
                ? DB.obterClient()
                : DB.client;
            const tabela = typeof DB.obterTabela === 'function'
                ? DB.obterTabela()
                : 'locacoes';

            if (!client) {
                throw new Error('Cliente do Supabase não inicializado.');
            }

            for (let indice = 0; indice < ids.length; indice += tamanhoLote) {
                const lote = ids.slice(indice, indice + tamanhoLote);
                const { data, error } = await client
                    .from(tabela)
                    .update({ fornecedor: destinoNormalizado })
                    .in('id', lote)
                    .select('id');

                if (error) throw error;

                const retornados = Array.isArray(data)
                    ? data
                    : [];
                const idsRetornados = new Set(
                    retornados.map((item) => String(item?.id))
                );
                const faltantes = lote.filter(
                    (id) => !idsRetornados.has(String(id))
                );

                retornados.forEach((item) => {
                    if (item?.id !== undefined && item?.id !== null) {
                        idsConfirmados.add(String(item.id));
                    }
                });

                if (faltantes.length > 0) {
                    const erroIncompleto = new Error(
                        `O Supabase não confirmou ${faltantes.length} atualização(ões). Verifique a política RLS de UPDATE e SELECT.`
                    );
                    erroIncompleto.code = 'FORNECEDOR_UPDATE_INCOMPLETO';
                    throw erroIncompleto;
                }
            }

            Equipamentos.atualizarEstadoFornecedor(
                idsConfirmados,
                destinoNormalizado,
                origemNormalizada,
                filtroAnterior
            );

            if (opcoes.modalId) {
                UI.fecharModal(opcoes.modalId);
            }

            Utils.registrarLog(
                opcoes.acaoLog || 'Atualização de fornecedor',
                `${origemNormalizada} → ${destinoNormalizado} (${idsConfirmados.size} registro(s))`
            );

            Utils.showToast(
                `${idsConfirmados.size} registro(s) atualizado(s). Fornecedor: ${destinoNormalizado}.`,
                'success',
                6000
            );

            return true;
        } catch (erro) {
            console.error(
                '[Equipamentos] Falha ao atualizar fornecedor em lote:',
                erro
            );

            if (idsConfirmados.size > 0) {
                Equipamentos.atualizarEstadoFornecedor(
                    idsConfirmados,
                    destinoNormalizado,
                    origemNormalizada,
                    filtroAnterior
                );
            }

            const semPermissao =
                erro?.code === '42501' ||
                erro?.status === 401 ||
                erro?.status === 403;
            const parcial = idsConfirmados.size > 0;
            const mensagem = semPermissao
                ? 'O Supabase bloqueou a alteração. Verifique a política RLS de UPDATE da tabela locacoes.'
                : (erro?.message || 'Não foi possível atualizar o fornecedor.');

            Utils.showToast(
                parcial
                    ? `Operação parcial: ${idsConfirmados.size} registro(s) foram atualizados. ${mensagem}`
                    : mensagem,
                'error',
                9000
            );

            return false;
        } finally {
            Utils.hideLoader();
        }
    }
};

window.Equipamentos = Equipamentos;
