// js/notificationService.js
class NotificationService {
    static async enviarNotificacao(locacao, responsavel, canais = ['EMAIL', 'WHATSAPP']) {
        try {
            // Chama a Edge Function para proteger chaves e processar envios
            const { data, error } = await db.functions.invoke('enviar-notificacoes', {
                body: { locacao, responsavel, canais }
            });

            if (error) throw new Error(error.message);

            // Gravar Histórico no Banco
            if (data && data.resultados) {
                for (let res of data.resultados) {
                    await this.registrarHistorico(locacao, res.canal, res.destinatario, res.msg, res.sucesso ? 'SUCESSO' : 'ERRO', res.erro);
                }
                // Atualizar Flags no Equipamento (Evitar duplicidade)
                await this.atualizarStatusEnvio(locacao.id, data.resultados);
            }

            return data;
        } catch (error) {
            console.error('[NotificationService] Falha no envio:', error);
            throw error;
        }
    }

    static async registrarHistorico(locacao, canal, destinatarios, mensagem, status, erroMsg = null) {
        await db.from('historico_notificacoes').insert([{
            locacao_id: locacao.id,
            canal: canal,
            destinatarios: destinatarios,
            mensagem: mensagem,
            status: status,
            erro: erroMsg,
            equipamento: locacao.equipamento,
            contrato: locacao.contrato,
            obra: locacao.obra,
            fornecedor: locacao.fornecedor
        }]);
    }

    static async atualizarStatusEnvio(locacaoId, resultados) {
        const payload = { ultima_notificacao: new Date().toISOString() };
        if (resultados.some(r => r.canal === 'EMAIL' && r.sucesso)) payload.notificacao_email_enviada = true;
        if (resultados.some(r => r.canal === 'WHATSAPP' && r.sucesso)) payload.notificacao_whatsapp_enviada = true;
        
        await db.from('locacoes').update(payload).eq('id', locacaoId);
    }
}
window.NotificationService = NotificationService;
