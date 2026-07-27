// ==========================================
// 🚨 MÓDULO ÚNICO: SMART ALERTS
// ==========================================

// 1. Utilitário Isolado de Datas
window.DateUtils = {
    calcularDiasRestantes: (dataFim) => {
        if (!dataFim) return null;
        const [ano, mes, dia] = dataFim.split('-');
        const vencimento = new Date(ano, mes - 1, dia);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0); // Zera hora para ser exato
        return Math.ceil((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
    },
    formatar: (dataStr) => {
        if (!dataStr) return '-';
        const [a, m, d] = dataStr.split('-');
        return `${d}/${m}/${a}`;
    }
};

// 2. Memória Interna da Tela de Alertas
window.AlertasState = {
    abaAtual: 'proximos',
    aVencer: [],
    vencidos: []
};

// 3. Controle dos Botões (O que você clica na tela)
window.AlertasManager = {
    mudarAbaAlerta: (aba) => {
        window.AlertasState.abaAtual = aba;
        // Muda a cor do botão ativo
        document.querySelectorAll('.tabs-alertas button').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById('tab-btn-' + aba);
        if(btn) btn.classList.add('active');
        
        window.AlertasManager.renderizarTela();
    },
    
    abrirConfigResponsavel: () => {
        const modal = document.getElementById('modal-config-responsaveis');
        if(modal) modal.style.display = 'flex';
    },

    filtrarStatus: (status) => {
        console.log("Filtro rápido clicado:", status);
    },
    
    renderizarTela: () => {
        const tbody = document.getElementById('body-alertas');
        if (!tbody) return;
        
        const aba = window.AlertasState.abaAtual;
        let html = '';
        
        if (aba === 'proximos') {
            if (window.AlertasState.aVencer.length === 0) {
                html = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhum contrato próximo do vencimento (1 a 7 dias).</td></tr>';
            } else {
                html = window.AlertasState.aVencer.map(c => `
                    <tr>
                        <td><b>${c.equipamento}</b><br><small>Contrato: ${c.contrato || 'S/N'}</small></td>
                        <td>${c.obra || '-'}<br><small>${c.fornecedor || '-'}</small></td>
                        <td>${DateUtils.formatar(c.data_fim)}</td>
                        <td><span class="smart-alert alert-yellow">${c.diasRestantes} dias restantes</span></td>
                        <td>-</td>
                        <td><button class="btn-action-small" onclick="alert('Função de E-mail em desenvolvimento!')">📧</button></td>
                    </tr>
                `).join('');
            }
        } else if (aba === 'vencidos') {
            if (window.AlertasState.vencidos.length === 0) {
                html = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Nenhum contrato vencido! 🎉</td></tr>';
            } else {
                html = window.AlertasState.vencidos.map(c => `
                    <tr>
                        <td><b>${c.equipamento}</b><br><small>Contrato: ${c.contrato || 'S/N'}</small></td>
                        <td>${c.obra || '-'}<br><small>${c.fornecedor || '-'}</small></td>
                        <td>${DateUtils.formatar(c.data_fim)}</td>
                        <td><span class="smart-alert alert-red">VENCIDO (${Math.abs(c.diasRestantes)} dias)</span></td>
                        <td>-</td>
                        <td><button class="btn-action-small" onclick="alert('Função de E-mail em desenvolvimento!')">📧</button></td>
                    </tr>
                `).join('');
            }
        }
        tbody.innerHTML = html;
    }
};

// 4. O Motor de Cálculos (Busca dados e atualiza o Dashboard)
window.AlertService = {
    updateAll: async () => {
        try {
            console.log("[SmartAlerts] Buscando contratos ativos...");
            const { data: contratos, error } = await DB.client.from('locacoes').select('*').eq('status', 'ativo');
            if (error) throw error;

            let totalAtivos = 0;
            let aVencer = [];
            let vencidos = [];

            if (contratos) {
                contratos.forEach(contrato => {
                    totalAtivos++;
                    if (contrato.data_fim) {
                        const dias = DateUtils.calcularDiasRestantes(contrato.data_fim);
                        contrato.diasRestantes = dias;
                        
                        if (dias !== null) {
                            if (dias <= 0) vencidos.push(contrato);
                            else if (dias >= 1 && dias <= 7) aVencer.push(contrato);
                        }
                    }
                });
            }

            // Ordena urgentes primeiro
            aVencer.sort((a, b) => a.diasRestantes - b.diasRestantes);
            vencidos.sort((a, b) => new Date(a.data_fim) - new Date(b.data_fim));

            window.AlertasState.aVencer = aVencer;
            window.AlertasState.vencidos = vencidos;

            // Atualiza Dashboard
            const kpiAtivos = document.getElementById('kpi-contratos');
            const kpiVencer = document.getElementById('dash-card-vencer');
            const kpiVencidos = document.getElementById('dash-card-vencidos');

            if (kpiAtivos) kpiAtivos.innerText = totalAtivos;
            if (kpiVencer) kpiVencer.innerText = aVencer.length;
            if (kpiVencidos) kpiVencidos.innerText = vencidos.length;

            window.AlertasManager.renderizarTela();

        } catch (err) {
            console.error("[SmartAlerts] Erro crítico:", err);
        }
    }
};
