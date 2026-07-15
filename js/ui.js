const UI = {
    colunasAtivas: JSON.parse(localStorage.getItem('controle_colunas')) || CONFIG.COLUNAS_PADRAO,

    inicializarTema: () => {
        if (localStorage.getItem('controle_tema') === 'dark') { 
            document.documentElement.setAttribute('data-theme', 'dark'); 
            document.getElementById('tema-icone').innerText = '☀️'; document.getElementById('tema-texto').innerText = 'Modo Claro'; 
        }
        UI.aplicarEstiloColunas();
    },

    toggleTema: () => {
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            document.documentElement.removeAttribute('data-theme'); localStorage.setItem('controle_tema', 'light');
            document.getElementById('tema-icone').innerText = '🌙'; document.getElementById('tema-texto').innerText = 'Modo Escuro';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('controle_tema', 'dark');
            document.getElementById('tema-icone').innerText = '☀️'; document.getElementById('tema-texto').innerText = 'Modo Claro';
        }
    },

    toggleSidebar: () => document.getElementById('sidebar').classList.toggle('collapsed'),
    abrirModal: (id) => document.getElementById(id).style.display = 'flex',
    fecharModal: (id) => document.getElementById(id).style.display = 'none',

    mudarAba: (aba) => {
        document.querySelectorAll('.sidebar .menu-item').forEach(e => { if (!e.innerText.includes('Tema')) e.classList.remove('active'); });
        document.querySelectorAll('.secao-tabela').forEach(e => e.classList.remove('animate-show'));
        const menuEl = document.getElementById('menu-' + aba); const secaoEl = document.getElementById('secao-' + aba);
        if (menuEl) menuEl.classList.add('active'); if (secaoEl) secaoEl.classList.add('animate-show');
        if (aba === 'sistema') UI.renderizarLogs(); 
        localStorage.setItem('controle_aba', aba); 
    },

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
        UI.aplicarEstiloColunas(); UI.fecharModal('modal-colunas'); Utils.showToast("Visualização atualizada!", "success");
    },

    renderizarLogs: () => {
        const tbody = document.getElementById('body-logs'); if(!tbody) return;
        let logs = JSON.parse(localStorage.getItem('controle_logs')) || [];
        tbody.innerHTML = '';
        if(logs.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px;">Nenhum log registrado.</td></tr>'; return; }
        logs.forEach(l => {
            let cor = l.acao.includes('Exclu') || l.acao.includes('Arquiv') ? 'var(--danger)' : l.acao.includes('Edit') || l.acao.includes('Renova') ? 'var(--warning)' : 'var(--success)';
            tbody.innerHTML += `<tr><td style="font-size:0.8rem; color:var(--text-light);">${l.data}</td><td><span style="color:${cor}; font-weight:bold; font-size:0.8rem;">${l.acao}</span></td><td style="font-size:0.85rem; font-weight:600;">${l.detalhe}</td></tr>`;
        });
    },

    atualizarKPIsEDashboards: () => {
        let t = 0, at = 0, arq = 0, forn = new Set(), cont = new Set();
        State.dadosFiltrados.forEach(i => {
            let q = parseInt(i.quantidade) || 1; 
            t += q;
            if (i.status === 'ativo') { 
                at += q; 
                if (i.contrato && !['NF via IA App','NF Compra','Sem Contrato','Cadastro Manual'].includes(i.contrato)) cont.add(i.contrato); 
            } 
            else if (i.status === 'inativo') { arq += q; }
            if (i.status !== 'excluido' && i.fornecedor && i.fornecedor !== 'Não identificado') forn.add(i.fornecedor);
        });
        document.getElementById('kpi-total').innerText = t; document.getElementById('kpi-ativos').innerText = at;
        document.getElementById('kpi-arquivados').innerText = arq; document.getElementById('kpi-contratos').innerText = cont.size; 
        document.getElementById('kpi-fornecedores').innerText = forn.size;
    },

    renderizarTabelas: () => {
        try {
            const bLoc = document.getElementById('body-locacoes'); const bComp = document.getElementById('body-compras'); 
            const bHist = document.getElementById('body-historico'); const bExc = document.getElementById('body-excluidos');
            
            let arrLoc = [], arrComp = [], arrHist = [], arrExc = [];
            const hojeISO = new Date().toISOString().split('T')[0];

            State.dadosFiltrados.forEach(item => {
                let btnAnexo = `<span class="btn-sem-anexo">Sem anexo</span>`;
                if (item.anexo && typeof item.anexo === 'string') {
                    if (item.anexo.toLowerCase().includes('pdf')) btnAnexo = `<a href="${item.anexo}" target="_blank" class="btn-anexo pdf-style">📄 Ver PDF</a>`;
                    else btnAnexo = `<a href="${item.anexo}" target="_blank" class="btn-anexo">📸 Ver Foto</a>`;
                }
                
                let alertas = '';
                if (!item.fornecedor || item.fornecedor === 'Não identificado') alertas += `<span class="smart-alert alert-yellow" title="Fornecedor ausente">⚠️ Sem Fornecedor</span>`;
                if (item.status === 'ativo' && item.unidade !== 'Proprio' && item.data_fim && item.data_fim < hojeISO) alertas += `<span class="smart-alert alert-red" title="Vencido">🚨 Vencido</span>`;

                const badgeQtd = `<span class="qtd-badge">${item.quantidade || 1} UN</span>`;
                const ctrStr = item.contrato && !['NF via IA App','NF Compra','Sem Contrato','Cadastro Manual'].includes(item.contrato) ? `<span class="highlight-txt">${item.contrato}</span>` : '--';
                const indeniz = item.valor_indenizacao && item.valor_indenizacao > 0 ? `<br><div class="indeniz-tag">Indenização: ${Utils.formatarMoeda(item.valor_indenizacao)}</div>` : '';

                const safeEquip = Utils.escapeStr(item.equipamento);

                // GERAÇÃO REFEITA DOS BOTÕES COM DATA-ATTRIBUTES PARA TODAS AS ABAS
                let botoesAcao = '';
                if (item.status === 'ativo') {
                    botoesAcao += `<button class="btn-action-small" data-action="editar" data-id="${item.id}" title="Editar">✏️</button>`;
                    if (item.unidade !== 'Proprio') botoesAcao += `<button class="btn-action-small" data-action="renovar" data-id="${item.id}" data-fim="${item.data_fim}" data-uni="${item.unidade}" title="Renovar">🔄</button>`;
                    botoesAcao += `<button class="btn-action-small" data-action="devolver" data-id="${item.id}" data-nome="${safeEquip}" title="Devolver (Histórico)">↩️</button>`;
                    botoesAcao += `<button class="btn-action-small" data-action="excluir" data-id="${item.id}" data-nome="${safeEquip}" title="Excluir Permanente">🗑️</button>`;
                } else if (item.status === 'inativo') {
                    botoesAcao = `<span class="status-badge" style="margin-right:8px;">Devolvido</span> <button class="btn-action-small" data-action="restaurar" data-id="${item.id}" data-nome="${safeEquip}" title="Restaurar para Ativos">🔄</button>`;
                } else if (item.status === 'excluido') {
                    botoesAcao = `<span class="status-badge" style="margin-right:8px; background:var(--danger); color:white;">Excluído</span> <button class="btn-action-small" data-action="restaurar" data-id="${item.id}" data-nome="${safeEquip}" title="Restaurar para Ativos">🔄</button>`;
                }

                const tr = `<tr>
                    <td class="col-obra"><div class="group-info"><span class="main-txt">${item.obra || '--'}</span><span class="sub-txt">Forn: ${item.fornecedor || '--'}</span></div></td>
                    <td class="col-equip"><span class="main-txt">${badgeQtd} ${item.equipamento || '--'}</span><div style="margin-top:4px;">${alertas}</div></td>
                    <td class="col-periodo"><div class="group-info"><span class="main-txt">${item.unidade === 'Proprio' ? Utils.formatarData(item.data_inicio) : (item.unidade || 'Mês')}</span>${item.unidade !== 'Proprio' ? `<span class="sub-txt" style="color:var(--primary); font-weight:600;">Vence: ${Utils.formatarData(item.data_fim)}</span>` : ''}</div></td>
                    <td class="col-contrato"><div class="group-info"><span class="main-txt">${ctrStr}</span></div></td>
                    <td class="col-valor"><div class="group-info"><span class="price-tag">${Utils.formatarMoeda(item.valor)}</span>${indeniz}</div></td>
                    <td class="col-anexo">${btnAnexo}</td>
                    <td class="col-acoes"><div class="action-buttons">${botoesAcao}</div></td>
                </tr>`;
                
                if (item.status === 'excluido') arrExc.push(tr);
                else if (item.status === 'inativo') arrHist.push(tr);
                else if (item.unidade === 'Proprio') arrComp.push(tr);
                else arrLoc.push(tr);
            });

            if(bLoc) bLoc.innerHTML = arrLoc.join('');
            if(bComp) bComp.innerHTML = arrComp.join('');
            if(bHist) bHist.innerHTML = arrHist.join('');
            if(bExc) bExc.innerHTML = arrExc.join('');

            document.querySelectorAll('.loader').forEach(e => e.style.display = 'none');
            
            const tbLoc = document.getElementById('tabela-locacoes'); if(tbLoc) tbLoc.style.display = arrLoc.length > 0 ? 'table' : 'none';
            const tbComp = document.getElementById('tabela-compras'); if(tbComp) tbComp.style.display = arrComp.length > 0 ? 'table' : 'none';
            const tbHist = document.getElementById('tabela-historico'); if(tbHist) tbHist.style.display = arrHist.length > 0 ? 'table' : 'none';
            const tbExc = document.getElementById('tabela-excluidos'); if(tbExc) tbExc.style.display = arrExc.length > 0 ? 'table' : 'none';

        } catch (errorRender) {
            console.error("Erro de Renderização de Tabelas: ", errorRender);
        }
    },

    renderizarModuloFornecedores: () => {
        const bodyForn = document.getElementById('body-fornecedores'); if(!bodyForn) return;
        bodyForn.innerHTML = '';
        let contagemForns = {}; 
        State.dadosFiltrados.forEach(item => { 
            if(item.status === 'ativo') { let f = item.fornecedor || 'Não identificado'; contagemForns[f] = (contagemForns[f] || 0) + 1; }
        });
        Object.keys(contagemForns).sort((a, b) => a.localeCompare(b)).forEach(forn => {
            const safeForn = Utils.escapeStr(forn);
            bodyForn.innerHTML += `<tr><td class="col-obra"><span class="main-txt">${forn}</span></td><td class="col-equip"><span class="status-badge highlight">${contagemForns[forn]} equipamentos</span></td><td class="col-acoes"><div class="action-buttons"><button class="btn-action-small" data-action="renomear-forn" data-nome="${safeForn}" title="Renomear">✏️</button><button class="btn-action-small" data-action="mesclar-forn" data-nome="${safeForn}" title="Mesclar">🔗</button></div></td></tr>`;
        });
        const tbForn = document.getElementById('tabela-fornecedores');
        if(tbForn) tbForn.style.display = Object.keys(contagemForns).length > 0 ? 'table' : 'none';
    }
};
