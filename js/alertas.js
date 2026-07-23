class AlertService {
    static async updateAll() {
        console.log("[AlertService] Carregando contratos ativos...");
        
        try {
            // CORREÇÃO: Usando DB.client e a coluna data_fim
            const { data: contratos, error } = await DB.client.from('locacoes')
                .select('*')
                .eq('status', 'ativo')
                .not('data_fim', 'is', null);

            if (error) throw error;

            let totalAtivos = 0;
            let aVencer = [];
            let vencidos = [];

            if (contratos) {
                console.log(`[AlertService] Contratos processados: ${contratos.length}`);
                
                contratos.forEach(contrato => {
                    totalAtivos++;
                    // CORREÇÃO: Usando data_fim
                    const diasRestantes = DateUtils.calcularDiasRestantes(contrato.data_fim);
                    contrato.diasRestantes = diasRestantes;

                    if (diasRestantes <= 0) {
                        vencidos.push(contrato);
                    } else if (diasRestantes >= 1 && diasRestantes <= 7) {
                        aVencer.push(contrato);
                    }
                });
            }

            // Ordenação
            aVencer.sort((a, b) => a.diasRestantes - b.diasRestantes); // Urgentes primeiro
            vencidos.sort((a, b) => new Date(a.data_fim) - new Date(b.data_fim)); // Mais antigos primeiro

            if (typeof DashboardService !== 'undefined') {
                DashboardService.updateCards(totalAtivos, aVencer.length, vencidos.length);
            }
            this.renderTabelaProximos(aVencer);
            this.renderTabelaVencidos(vencidos);
            
        } catch (err) {
            console.error("[AlertService] Erro crítico:", err);
        }
    }

    static renderTabelaProximos(contratos) {
        const tbody = document.getElementById('body-proximos');
        if (!tbody) return;
        tbody.innerHTML = contratos.map(c => `
            <tr>
                <td><b>${c.equipamento}</b></td>
                <td>${c.fornecedor}</td>
                <td>${c.contrato || '-'}</td>
                <td>${DateUtils.formatarDataBR(c.data_fim)}</td>
                <td><span class="smart-alert alert-yellow">${c.diasRestantes} dias</span></td>
                <td>
                    <button class="btn-action-small" onclick="Equipamentos.abrirModalEditar('${c.id}')">🔄</button>
                    <button class="btn-action-small" onclick="NotificationService.enviarNotificacaoMock('${c.id}')">📧</button>
                </td>
            </tr>
        `).join('');
    }

    static renderTabelaVencidos(contratos) {
        const tbody = document.getElementById('body-vencidos');
        if (!tbody) return;
        tbody.innerHTML = contratos.map(c => `
            <tr>
                <td><b>${c.equipamento}</b></td>
                <td>${c.fornecedor}</td>
                <td>${c.contrato || '-'}</td>
                <td>${DateUtils.formatarDataBR(c.data_fim)}</td>
                <td><span class="smart-alert alert-red">VENCIDO (${Math.abs(c.diasRestantes)} dias)</span></td>
                <td><button class="btn-action-small" onclick="Equipamentos.abrirModalEditar('${c.id}')">🔄</button></td>
            </tr>
        `).join('');
    }
}

class DashboardService {
    static updateCards(ativos, aVencer, vencidos) {
        const elAtivos = document.getElementById('dash-card-ativos');
        const elAVencer = document.getElementById('dash-card-vencer');
        const elVencidos = document.getElementById('dash-card-vencidos');

        if (elAtivos) elAtivos.innerText = ativos;
        if (elAVencer) elAVencer.innerText = aVencer;
        if (elVencidos) elVencidos.innerText = vencidos;
    }
}

window.AlertService = AlertService;
window.DashboardService = DashboardService;
