// ==========================================
// 🚨 MÓDULO ÚNICO: SMART ALERTS
// ==========================================

// IMPORTANTE:
// DateUtils agora vem do utils.js.
// Não recrie window.DateUtils aqui.

// ==========================================
// 1. Memória Interna da Tela de Alertas
// ==========================================

window.AlertasState = {
    abaAtual: 'proximos',
    aVencer: [],
    vencidos: []
};

// ==========================================
// 2. Controle da Tela
// ==========================================

window.AlertasManager = {

    mudarAbaAlerta: (aba) => {

        window.AlertasState.abaAtual = aba;

        document.querySelectorAll('.tabs-alertas button')
            .forEach(btn => btn.classList.remove('active'));

        const botao = document.getElementById('tab-btn-' + aba);

        if (botao) botao.classList.add('active');

        window.AlertasManager.renderizarTela();
    },

    abrirConfigResponsavel: () => {

        const modal = document.getElementById("modal-config-responsaveis");

        if (modal)
            modal.style.display = "flex";
    },

    filtrarStatus: (status) => {

        console.log("Filtro:", status);

    },

    renderizarTela: () => {

        const tbody = document.getElementById("body-alertas");

        if (!tbody) return;

        const aba = window.AlertasState.abaAtual;

        let html = "";

        //==============================
        // PRÓXIMOS DO VENCIMENTO
        //==============================

        if (aba === "proximos") {

            if (window.AlertasState.aVencer.length === 0) {

                html = `
                    <tr>
                        <td colspan="6" style="text-align:center;padding:25px;">
                            Nenhum contrato próximo do vencimento.
                        </td>
                    </tr>
                `;

            } else {

                html = window.AlertasState.aVencer.map(c => `

                    <tr>

                        <td>

                            <b>${Utils.escapeStr(c.equipamento || "-")}</b><br>

                            <small>Contrato: ${Utils.escapeStr(c.contrato || "S/N")}</small>

                        </td>

                        <td>

                            ${Utils.escapeStr(c.obra || "-")}<br>

                            <small>${Utils.escapeStr(c.fornecedor || "-")}</small>

                        </td>

                        <td>

                            ${DateUtils.formatarDataBR(c.data_fim)}

                        </td>

                        <td>

                            <span class="smart-alert alert-yellow">

                                ${c.diasRestantes} dias restantes

                            </span>

                        </td>

                        <td>-</td>

                        <td>

                            <button
                                class="btn-action-small"
                                onclick="alert('Envio de e-mail ainda não implementado.')">

                                📧

                            </button>

                        </td>

                    </tr>

                `).join("");

            }

        }

        //==============================
        // VENCIDOS
        //==============================

        if (aba === "vencidos") {

            if (window.AlertasState.vencidos.length === 0) {

                html = `
                    <tr>
                        <td colspan="6" style="text-align:center;padding:25px;">
                            Nenhum contrato vencido.
                        </td>
                    </tr>
                `;

            } else {

                html = window.AlertasState.vencidos.map(c => `

                    <tr>

                        <td>

                            <b>${Utils.escapeStr(c.equipamento || "-")}</b><br>

                            <small>Contrato: ${Utils.escapeStr(c.contrato || "S/N")}</small>

                        </td>

                        <td>

                            ${Utils.escapeStr(c.obra || "-")}<br>

                            <small>${Utils.escapeStr(c.fornecedor || "-")}</small>

                        </td>

                        <td>

                            ${DateUtils.formatarDataBR(c.data_fim)}

                        </td>

                        <td>

                            <span class="smart-alert alert-red">

                                VENCIDO (${Math.abs(c.diasRestantes)} dias)

                            </span>

                        </td>

                        <td>-</td>

                        <td>

                            <button
                                class="btn-action-small"
                                onclick="alert('Envio de e-mail ainda não implementado.')">

                                📧

                            </button>

                        </td>

                    </tr>

                `).join("");

            }

        }

        tbody.innerHTML = html;

    }

};

// ==========================================
// 3. Serviço Principal
// ==========================================

window.AlertService = {

    updateAll: async (registrosCarregados = null) => {

        try {

            console.log("[SmartAlerts] Atualizando a partir dos dados ja carregados...");

            // Evita uma segunda consulta completa ao Supabase a cada abertura do painel.
            // Isso reduz chamadas e egress de banco sem alterar o resultado da tela.
            const fonte = Array.isArray(registrosCarregados)
                ? registrosCarregados
                : (Array.isArray(window.State?.dadosGlobais) ? State.dadosGlobais : []);

            const contratos = fonte.filter(item =>
                String(item?.status || '').toLowerCase() === 'ativo'
            );

            let totalAtivos = 0;

            let aVencer = [];

            let vencidos = [];

            (contratos || []).forEach(contrato => {

                totalAtivos++;

                if (!contrato.data_fim)
                    return;

                const dias = DateUtils.calcularDiasRestantes(
                    contrato.data_fim
                );

                contrato.diasRestantes = dias;

                if (dias === null)
                    return;

                if (dias <= 0) {

                    vencidos.push(contrato);

                }

                else if (dias <= 7) {

                    aVencer.push(contrato);

                }

            });

            aVencer.sort((a, b) => a.diasRestantes - b.diasRestantes);

            vencidos.sort((a, b) => a.diasRestantes - b.diasRestantes);

            window.AlertasState.aVencer = aVencer;

            window.AlertasState.vencidos = vencidos;

            const kpiContratos = document.getElementById("kpi-contratos");
            const kpiVencer = document.getElementById("dash-card-vencer");
            const kpiVencidos = document.getElementById("dash-card-vencidos");
            const badge = document.getElementById("badge-alertas");

            if (kpiContratos)
                kpiContratos.innerText = totalAtivos;

            if (kpiVencer)
                kpiVencer.innerText = aVencer.length;

            if (kpiVencidos)
                kpiVencidos.innerText = vencidos.length;

            if (badge) {

                const totalAlertas = aVencer.length + vencidos.length;

                badge.innerText = totalAlertas;

                badge.style.display =
                    totalAlertas > 0 ? "inline-block" : "none";

            }

            window.AlertasManager.renderizarTela();

        }

        catch (erro) {

            console.error("[SmartAlerts]", erro);

        }

    }

};
