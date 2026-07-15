const Utils = {
    formatarData: (d) => d ? d.split('-').reverse().join('/') : '--',
    formatarMoeda: (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    
    // Protege o código contra aspas inseridas pelo usuário
    escapeStr: (str) => {
        if (str === null || str === undefined) return '';
        return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
    },
    
    showToast: (message, type = 'success') => {
        const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast ${type}`;
        let icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
        toast.innerHTML = `<span style="font-size: 1.2rem;">${icon}</span> <span>${message}</span>`;
        container.appendChild(toast); void toast.offsetWidth; toast.classList.add('show');
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3500);
    },

    showLoader: (msg = 'Processando...') => { document.getElementById('global-loader-msg').innerText = msg; document.getElementById('global-loader').style.display = 'flex'; },
    hideLoader: () => { document.getElementById('global-loader').style.display = 'none'; },

    confirmCallbackAction: null,
    showConfirm: (title, message, onConfirm, isDanger = false) => {
        document.getElementById('confirm-title').innerText = title; document.getElementById('confirm-msg').innerText = message; document.getElementById('confirm-icon').innerText = isDanger ? '🚨' : '⚠️';
        const btnConfirm = document.getElementById('btn-confirm-action'); btnConfirm.style.background = isDanger ? 'var(--danger)' : 'var(--primary)';
        btnConfirm.innerText = isDanger ? 'Sim, Confirmar' : 'Confirmar'; Utils.confirmCallbackAction = onConfirm; document.getElementById('modal-confirm').style.display = 'flex';
    },
    fecharConfirm: () => { document.getElementById('modal-confirm').style.display = 'none'; },

    registrarLog: (acao, detalhe) => {
        let logs = JSON.parse(localStorage.getItem('controle_logs')) || [];
        logs.unshift({ data: new Date().toLocaleString('pt-BR'), acao, detalhe });
        if (logs.length > 50) logs = logs.slice(0, 50);
        localStorage.setItem('controle_logs', JSON.stringify(logs));
        if(typeof UI !== 'undefined' && UI.renderizarLogs) UI.renderizarLogs();
    }
};

document.getElementById('btn-confirm-action').addEventListener('click', () => { 
    if (Utils.confirmCallbackAction) { const action = Utils.confirmCallbackAction; Utils.confirmCallbackAction = null; Utils.fecharConfirm(); action(); } 
});
