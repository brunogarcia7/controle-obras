// js/alertas.js
class AlertasContratos {
    constructor() {
        this.configDias = [2, 5, 7]; // Padrão, será subscrito pelo BD
        this.init();
    }

    async init() {
        await this.carregarConfiguracoes();
        this.processarAlertas();
    }

    async carregarConfiguracoes() {
        const { data } = await db.from('configuracoes_sistema').select('*').eq('chave', 'alerta_vencimento_dias').single();
        if (data && data.valor && data.valor.dias) {
            this.configDias = data.valor.dias.sort((a, b) => a - b);
        }
    }

    async processarAlertas() {
        // Busca locacoes ativas com data de vencimento preenchida
        const { data: locacoes, error } = await db.from('locacoes').select('*').eq('status', 'ativo').not('data_vencimento', 'is', null);
        if (error || !locacoes) return;

        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        
        let alertasAtivos = [];
        let vencidos = [];

        locacoes.forEach(loc => {
            const vcto = new Date(loc.data_vencimento);
            vcto.setHours(0,0,0,0); // Fuso Brasil
            
            const diffTime = vcto.getTime() - hoje.getTime();
            const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            loc.dias_restantes = diasRestantes;
            loc.status_visual = this.definirStatusVisual(diasRestantes);

            if (diasRestantes < 0) {
                vencidos.push(loc);
            } else if (diasRestantes <= Math.max(...this.configDias)) {
                alertasAtivos.push(loc);
            }
        });

        // Ordenação
        alertasAtivos.sort((a, b) => a.dias_restantes - b.dias_restantes); // Mais urgente primeiro
        vencidos.sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento)); // Mais antigo primeiro

        this.renderizarDashboardCards(alertasAtivos.length, vencidos.length);
        this.verificarDisparoAutomatico(alertasAtivos);
        
        // Expor dados globalmente para a UI consumir se precisar renderizar tabelas
        window.dadosAlertas = { ativos: alertasAtivos, vencidos: vencidos };
    }

    definirStatusVisual(dias) {
        if (dias < 0) return 'vermelho';
        if (dias <= 7 && dias > Math.max(...this.configDias)) return 'azul'; // Se X < 7
        if (dias <= Math.max(...this.configDias)) return 'amarelo';
        return 'verde'; // Mais de 7
    }

    async verificarDisparoAutomatico(locacoesA Vencer) {
        for (let loc of locacoesA Vencer) {
            // Verifica se a quantidade de dias restantes está EXATAMENTE dentro de algum dos dias de gatilho
            if (this.configDias.includes(loc.dias_restantes)) {
                // Se já enviou ambos, ignora para não floodar
                if (loc.notificacao_email_enviada && loc.notificacao_whatsapp_enviada) continue;
                
                // Busca Responsável da Obra
                const { data: resp } = await db.from('responsaveis_obras').select('*').eq('obra', loc.obra).single();
                if (!resp) continue; // Sem responsável, não notifica
                
                try {
                    await NotificationService.enviarNotificacao(loc, resp);
                } catch(e) { console.error("Erro no envio automático:", e) }
            }
        }
    }

    renderizarDashboardCards(qtdAlertas, qtdVencidos) {
        const cardVencer = document.getElementById('dash-card-vencer');
        const cardVencidos = document.getElementById('dash-card-vencidos');
        const badgeMenu = document.getElementById('badge-alertas');
        
        if (cardVencer) cardVencer.innerText = qtdAlertas;
        if (cardVencidos) cardVencidos.innerText = qtdVencidos;
        
        const totalAlertas = qtdAlertas + qtdVencidos;
        if (badgeMenu && totalAlertas > 0) {
            badgeMenu.innerText = totalAlertas;
            badgeMenu.style.display = 'inline-block';
        }
    }
}
window.AlertasManager = new AlertasContratos();
