const UI = {
    colunasAtivas: JSON.parse(localStorage.getItem('controle_colunas')) || CONFIG.COLUNAS_PADRAO,
    
    inicializarTema: () => {
        if (localStorage.getItem('controle_tema') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
        UI.aplicarEstiloColunas();
    },

    toggleTema: () => {
        if (document.documentElement.hasAttribute('data-theme')) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('controle_tema', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('controle_tema', 'dark');
        }
    },

    toggleSidebar: () => document.getElementById('sidebar').classList.toggle('collapsed'),
    
    abrirModal: (id) => document.getElementById(id).style.display = 'flex',
    fecharModal: (id) => document.getElementById(id).style.display = 'none',

    aplicarEstiloColunas: () => {
        let css = '';
        if(!UI.colunasAtivas.obra) css += '.col-obra { display: none !important; } ';
        if(!UI.colunasAtivas.equip) css += '.col-equip { display: none !important; } ';
        if(!UI.colunasAtivas.periodo) css += '.col-periodo { display: none !important; } ';
        if(!UI.colunasAtivas.contrato) css += '.col-contrato { display: none !important; } ';
        if(!UI.colunasAtivas.valor) css += '.col-valor { display: none !important; } ';
        if(!UI.colunasAtivas.anexo) css += '.col-anexo { display: none !important; } ';
        if(!UI.colunasAtivas.acoes) css += '.col-acoes { display: none !important; } ';
        document.getElementById('dynamic-columns-style').innerHTML = css;
    },

    salvarColunas: () => {
        ['obra', 'equip', 'periodo', 'contrato', 'valor', 'anexo', 'acoes'].forEach(key => {
            UI.colunasAtivas[key] = document.getElementById(`chk-col-${key}`).checked;
        });
        localStorage.setItem('controle_colunas', JSON.stringify(UI.colunasAtivas));
        UI.aplicarEstiloColunas();
        UI.fecharModal('modal-colunas');
        Utils.showToast("Colunas atualizadas!");
    },

    atualizarKPIs: () => {
        let t = 0, at = 0, arq = 0, forn = new Set(), cont = new Set();
        State.dadosFiltrados.forEach(i => {
            let q = i.quantidade || 1; t += q;
            if(i.status === 'ativo') { 
                at += q; 
                if(i.contrato && !i.contrato.includes('Sem')) cont.add(i.contrato);
            }
            if(i.status === 'inativo') arq += q;
            if(i.fornecedor) forn.add(i.fornecedor);
        });
        document.getElementById('kpi-total').innerText = t;
        document.getElementById('kpi-ativos').innerText = at;
        document.getElementById('kpi-arquivados').innerText = arq;
        document.getElementById('kpi-contratos').innerText = cont.size;
        document.getElementById('kpi-fornecedores').innerText = forn.size;
    }
};
