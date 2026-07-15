const Utils = {
    formatarData: (d) => d ? d.split('-').reverse().join('/') : '--',
    formatarMoeda: (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    
    showToast: (msg, type = 'success') => {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span style="font-size: 1.2rem;">${type === 'success' ? '✅' : '⚠️'}</span> <span>${msg}</span>`;
        container.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 3000);
    },

    showLoader: (msg) => {
        document.getElementById('global-loader-msg').innerText = msg || 'Processando...';
        document.getElementById('global-loader').style.display = 'flex';
    },
    hideLoader: () => document.getElementById('global-loader').style.display = 'none',
    
    registrarLog: (acao, detalhe) => {
        let logs = JSON.parse(localStorage.getItem('controle_logs')) || [];
        logs.unshift({ data: new Date().toLocaleString('pt-BR'), acao, detalhe });
        if (logs.length > 50) logs = logs.slice(0, 50);
        localStorage.setItem('controle_logs', JSON.stringify(logs));
    }
};
