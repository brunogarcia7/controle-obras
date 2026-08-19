// =====================================================
// DATABASE.JS
// Sistema Gestão de Equipamentos v7.0.0
// =====================================================

(() => {
    'use strict';

    const DB = {
        client: null,
        ultimoCarregamentoOk: null,

        inicializar() {
            if (DB.client) {
                return DB.client;
            }

            if (
                !window.supabase ||
                typeof window.supabase.createClient !== 'function'
            ) {
                throw new Error(
                    'A biblioteca do Supabase não foi carregada.'
                );
            }

            if (!window.CONFIG) {
                throw new Error(
                    'O arquivo config.js não foi carregado.'
                );
            }

            if (
                !CONFIG.SUPABASE_URL ||
                !CONFIG.SUPABASE_KEY
            ) {
                throw new Error(
                    'URL ou chave do Supabase não configurada.'
                );
            }

            DB.client = window.supabase.createClient(
                CONFIG.SUPABASE_URL,
                CONFIG.SUPABASE_KEY
            );

            console.info(
                '[DB] Cliente Supabase inicializado.'
            );

            return DB.client;
        },

        obterTabela() {
            return CONFIG.TABELA_PRINCIPAL || 'locacoes';
        },

        obterCampos() {
            return CONFIG.CAMPOS_LOCACOES || '*';
        },

        obterClient() {
            return DB.client || DB.inicializar();
        },

        limparPayload(payload) {
            if (
                !payload ||
                typeof payload !== 'object' ||
                Array.isArray(payload)
            ) {
                throw new Error(
                    'Os dados enviados para gravação são inválidos.'
                );
            }

            return Object.fromEntries(
                Object.entries(payload).filter(
                    ([, valor]) => valor !== undefined
                )
            );
        },

        atualizarRegistroNoState(registro, idOriginal = null) {
            if (
                !window.State ||
                !Array.isArray(State.dadosGlobais) ||
                !registro
            ) {
                return;
            }

            const id = idOriginal ?? registro.id;

            const indice = State.dadosGlobais.findIndex(
                item => String(item.id) === String(id)
            );

            if (indice >= 0) {
                State.dadosGlobais[indice] = registro;
            } else {
                State.dadosGlobais.unshift(registro);
            }
        },

        registrarErro(contexto, erro) {
            console.error(`[DB] ${contexto}`, {
                message: erro?.message,
                code: erro?.code,
                details: erro?.details,
                hint: erro?.hint,
                status: erro?.status,
                erro
            });
        },

        async carregarDados() {
            DB.ultimoCarregamentoOk = null;

            Utils.showLoader(
                'Carregando base de dados...'
            );

            try {
                const client = DB.obterClient();
                const tabela = DB.obterTabela();

                console.info(
                    `[DB] Buscando registros em "${tabela}"...`
                );

                const { data, error } = await client
                    .from(tabela)
                    .select(DB.obterCampos());

                if (error) {
                    throw error;
                }

                const registros = Array.isArray(data)
                    ? data
                    : [];

                State.dadosGlobais = registros;
                DB.ultimoCarregamentoOk = true;

                console.info(
                    `[DB] ${registros.length} registro(s) carregado(s).`
                );

                return registros;

            } catch (erro) {
                DB.registrarErro(
                    'Erro ao carregar os dados.',
                    erro
                );

                State.dadosGlobais = [];
                DB.ultimoCarregamentoOk = false;

                const semPermissao =
                    erro?.code === '42501' ||
                    erro?.status === 401 ||
                    erro?.status === 403;

                Utils.showToast(
                    semPermissao
                        ? 'O Supabase bloqueou o acesso. Verifique as políticas RLS.'
                        : 'Erro ao conectar ao banco de dados.',
                    'error'
                );

                return [];

            } finally {
                Utils.hideLoader();
            }
        },

        async salvar(id, payload) {
            Utils.showLoader(
                id
                    ? 'Salvando alterações...'
                    : 'Cadastrando item...'
            );

            try {
                const client = DB.obterClient();
                const tabela = DB.obterTabela();
                const dadosLimpos = DB.limparPayload(payload);

                let consulta;

                if (
                    id !== undefined &&
                    id !== null &&
                    id !== ''
                ) {
                    consulta = client
                        .from(tabela)
                        .update(dadosLimpos)
                        .eq('id', id);
                } else {
                    consulta = client
                        .from(tabela)
                        .insert(dadosLimpos);
                }

                const { data, error } = await consulta
                    .select(DB.obterCampos())
                    .single();

                if (error) {
                    throw error;
                }

                DB.atualizarRegistroNoState(data, id);

                Utils.registrarLog(
                    id ? 'Edição' : 'Novo cadastro',
                    `Item: ${
                        dadosLimpos.equipamento ||
                        data?.equipamento ||
                        'Não informado'
                    }`
                );

                return data;

            } catch (erro) {
                DB.registrarErro(
                    'Erro ao salvar o registro.',
                    erro
                );

                Utils.showToast(
                    erro?.code === '42501'
                        ? 'Sem permissão para salvar. Verifique as políticas RLS.'
                        : 'Erro ao salvar o registro.',
                    'error'
                );

                return null;

            } finally {
                Utils.hideLoader();
            }
        },

        async mudarStatus(id, status, nomeItem = '') {
            Utils.showLoader(
                'Atualizando status...'
            );

            try {
                if (
                    id === undefined ||
                    id === null ||
                    id === ''
                ) {
                    throw new Error(
                        'ID do registro não informado.'
                    );
                }

                if (!status) {
                    throw new Error(
                        'Status não informado.'
                    );
                }

                const client = DB.obterClient();
                const tabela = DB.obterTabela();

                const { data, error } = await client
                    .from(tabela)
                    .update({ status })
                    .eq('id', id)
                    .select(DB.obterCampos())
                    .single();

                if (error) {
                    throw error;
                }

                DB.atualizarRegistroNoState(data, id);

                Utils.registrarLog(
                    'Status alterado',
                    `${
                        nomeItem ||
                        data?.equipamento ||
                        `Registro ${id}`
                    } movido para ${status}`
                );

                return data;

            } catch (erro) {
                DB.registrarErro(
                    'Erro ao atualizar o status.',
                    erro
                );

                Utils.showToast(
                    erro?.code === '42501'
                        ? 'Sem permissão para alterar o status.'
                        : 'Erro ao atualizar o status.',
                    'error'
                );

                return null;

            } finally {
                Utils.hideLoader();
            }
        }
    };

    try {
        DB.inicializar();
    } catch (erro) {
        console.error(
            '[DB] Falha na inicialização:',
            erro
        );
    }

    window.DB = DB;
})();
