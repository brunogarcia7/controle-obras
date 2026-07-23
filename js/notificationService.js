class NotificationService {
    static async enviarNotificacao(locacao, responsavel, tipo = 'EMAIL') {
        console.log(`[NotificationService] Iniciando envio de ${tipo} para ${responsavel.nome}...`);
        try {
            // CORREÇÃO: Usando DB.client
            const { data, error } = await DB.client.functions.invoke('enviar-notificacoes', {
                body: { locacao, responsavel, canais: [tipo] }
            });

            if (error) throw error;

            console.log(`[NotificationService] ${tipo} enviado com sucesso.`);
            await this.registrarHistorico(locacao, responsavel, tipo, 'SUCESSO');
            return true;

        } catch (error) {
            console.error(`[NotificationService] Erro ao enviar ${tipo}:`, error);
            await this.registrarHistorico(locacao, responsavel, tipo, 'FALHA', error.message);
            return false;
        }
    }

    static async registrarHistorico(locacao, responsavel, tipo, status, erro = null) {
        await DB.client.from('historico_notificacoes').insert([{
            locacao_id: locacao.id,
            canal: tipo,
            destinatarios: responsavel.email,
            responsavel_nome: responsavel.nome,
            mensagem: `Aviso de vencimento: Contrato ${locacao.contrato || '-'}`,
            status: status,
            erro: erro,
            equipamento: locacao.equipamento,
            contrato: locacao.contrato,
            obra: locacao.obra,
            fornecedor: locacao.fornecedor
        }]);
    }
}
window.NotificationService = NotificationService;
