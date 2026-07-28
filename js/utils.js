// =====================================================
// UTILS.JS
// Sistema Gestão de Equipamentos v6.3.0
// =====================================================

(() => {
    'use strict';

    const obterElemento = (id) => document.getElementById(id);

    const interpretarDataLocal = (valor) => {
        if (!valor) return null;

        if (valor instanceof Date) {
            return Number.isNaN(valor.getTime())
                ? null
                : new Date(
                    valor.getFullYear(),
                    valor.getMonth(),
                    valor.getDate()
                );
        }

        const texto = String(valor).trim();
        const formatoISO = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);

        if (formatoISO) {
            const ano = Number(formatoISO[1]);
            const mes = Number(formatoISO[2]);
            const dia = Number(formatoISO[3]);
            const data = new Date(ano, mes - 1, dia);

            if (
                data.getFullYear() === ano &&
                data.getMonth() === mes - 1 &&
                data.getDate() === dia
            ) {
                return data;
            }

            return null;
        }

        const data = new Date(texto);

        if (Number.isNaN(data.getTime())) {
            return null;
        }

        return new Date(
            data.getFullYear(),
            data.getMonth(),
            data.getDate()
        );
    };

    const iconesToast = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const Utils = {
        showLoader(mensagem = 'Carregando...') {
            const loader = obterElemento('global-loader');
            const texto = obterElemento('global-loader-msg');

            if (texto) {
                texto.textContent = String(
                    mensagem || 'Carregando...'
                );
            }

            if (loader) {
                loader.style.display = 'flex';
                loader.setAttribute('aria-hidden', 'false');
            }

            if (window.State) {
                window.State.carregando = true;
            }
        },

        hideLoader() {
            const loader = obterElemento('global-loader');

            if (loader) {
                loader.style.display = 'none';
                loader.setAttribute('aria-hidden', 'true');
            }

            if (window.State) {
                window.State.carregando = false;
            }
        },

        showToast(mensagem, tipo = 'info', duracao = 4000) {
            const container = obterElemento('toast-container');

            if (!container) {
                console.log(`[${tipo}] ${mensagem}`);
                return;
            }

            const tipoSeguro = [
                'success',
                'error',
                'warning',
                'info'
            ].includes(tipo)
                ? tipo
                : 'info';

            const toast = document.createElement('div');
            toast.className = `toast ${tipoSeguro}`;
            toast.setAttribute(
                'role',
                tipoSeguro === 'error' ? 'alert' : 'status'
            );

            const icone = document.createElement('span');
            icone.textContent = iconesToast[tipoSeguro];
            icone.setAttribute('aria-hidden', 'true');

            const texto = document.createElement('span');
            texto.textContent = String(mensagem ?? '');

            toast.appendChild(icone);
            toast.appendChild(texto);
            container.appendChild(toast);

            requestAnimationFrame(() => {
                toast.classList.add('show');
            });

            window.setTimeout(() => {
                toast.classList.remove('show');

                window.setTimeout(() => {
                    toast.remove();
                }, 350);
            }, Math.max(1000, Number(duracao) || 4000));
        },

        registrarLog(acao, detalhe = '') {
            try {
                const chave = 'controle_logs';
                const salvo = JSON.parse(
                    localStorage.getItem(chave) || '[]'
                );
                const logs = Array.isArray(salvo) ? salvo : [];

                logs.unshift({
                    data: new Date().toLocaleString('pt-BR'),
                    acao: String(acao || 'Ação'),
                    detalhe: String(detalhe || '')
                });

                localStorage.setItem(
                    chave,
                    JSON.stringify(logs.slice(0, 500))
                );

                if (
                    typeof UI !== 'undefined' &&
                    typeof UI.renderizarLogs === 'function' &&
                    obterElemento('secao-sistema')
                        ?.classList.contains('animate-show')
                ) {
                    UI.renderizarLogs();
                }
            } catch (erro) {
                console.warn(
                    '[Utils] Não foi possível registrar o log:',
                    erro
                );
            }
        },

        showConfirm(
            titulo,
            mensagem,
            callback,
            perigoso = false
        ) {
            const modal = obterElemento('modal-confirm');
            const tituloEl = obterElemento('confirm-title');
            const mensagemEl = obterElemento('confirm-msg');
            const iconeEl = obterElemento('confirm-icon');
            const botao = obterElemento('btn-confirm-action');

            if (!modal || !botao) {
                const confirmado = window.confirm(
                    `${titulo || 'Confirmação'}\n\n${mensagem || ''}`
                );

                if (
                    confirmado &&
                    typeof callback === 'function'
                ) {
                    Promise.resolve(callback()).catch((erro) => {
                        console.error(
                            '[Utils] Erro na ação confirmada:',
                            erro
                        );

                        Utils.showToast(
                            'Não foi possível concluir a operação.',
                            'error'
                        );
                    });
                }

                return;
            }

            if (tituloEl) {
                tituloEl.textContent = String(
                    titulo || 'Confirmação'
                );
            }

            if (mensagemEl) {
                mensagemEl.textContent = String(
                    mensagem || ''
                );
            }

            if (iconeEl) {
                iconeEl.textContent = perigoso
                    ? '🚨'
                    : '⚠️';
            }

            botao.textContent = perigoso
                ? 'Confirmar exclusão'
                : 'Confirmar';

            botao.style.background = perigoso
                ? 'var(--danger)'
                : 'var(--primary)';

            botao.disabled = false;

            botao.onclick = async () => {
                botao.disabled = true;
                Utils.fecharConfirm();

                try {
                    if (typeof callback === 'function') {
                        await callback();
                    }
                } catch (erro) {
                    console.error(
                        '[Utils] Erro na ação confirmada:',
                        erro
                    );

                    Utils.hideLoader();

                    Utils.showToast(
                        'Não foi possível concluir a operação.',
                        'error'
                    );
                } finally {
                    botao.disabled = false;
                }
            };

            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
        },

        fecharConfirm() {
            const modal = obterElemento('modal-confirm');
            const botao = obterElemento('btn-confirm-action');

            if (modal) {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }

            if (botao) {
                botao.onclick = null;
            }
        },

        formatarMoeda(valor) {
            const numero = Number(valor);

            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(
                Number.isFinite(numero)
                    ? numero
                    : 0
            );
        },

        formatarData(valor) {
            const data = interpretarDataLocal(valor);

            if (!data) {
                return '-';
            }

            return new Intl.DateTimeFormat(
                'pt-BR'
            ).format(data);
        },

        escapeStr(valor) {
            return String(valor ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#39;');
        }
    };

    class DateUtils {
        static calcularDiasRestantes(dataVencimento) {
            const vencimento = interpretarDataLocal(
                dataVencimento
            );

            if (!vencimento) {
                return null;
            }

            const hoje = new Date();

            hoje.setHours(0, 0, 0, 0);
            vencimento.setHours(0, 0, 0, 0);

            const diferenca =
                vencimento.getTime() - hoje.getTime();

            return Math.round(
                diferenca / 86400000
            );
        }

        static formatarDataBR(data) {
            return Utils.formatarData(data);
        }

        static formatar(data) {
            return DateUtils.formatarDataBR(data);
        }
    }

    window.Utils = Utils;
    window.DateUtils = DateUtils;
})();
