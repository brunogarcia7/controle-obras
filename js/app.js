const App = {
    carregarFiltrosSelect: async () => {
        const { data } = await DB.client.from('locacoes').select('obra, fornecedor');
        if(data) {
            const obras = [...new Set(data.map(i => i.obra))].filter(Boolean).sort();
            const forns = [...new Set(data.map(i => i.fornecedor))].filter(Boolean).sort();
            const selObra = document.getElementById('filtroObra'); const selForn = document.getElementById('filtroForn');
            const listObras = document.getElementById('lista-obras'); const listForns = document.getElementById('lista-forns');
            selObra.innerHTML = '<option value="todas">🏢 Todas as Obras</option>'; selForn.innerHTML = '<option value="todos">🚚 Todos os Fornecedores</option>';
            listObras.innerHTML = ''; listForns.innerHTML = ''; 
            obras.forEach(o => { selObra.add(new Option(o, o)); listObras.appendChild(new Option(o)); });
            forns.forEach(f => { selForn.add(new Option(f, f)); listForns.appendChild(new Option(f)); });

            const savedFiltros = JSON.parse(localStorage.getItem('controle_filtros'));
            if (savedFiltros) {
                if ([...selObra.options].some(o => o.value === savedFiltros.obra)) selObra.value = savedFiltros.obra;
                if ([...selForn.options].some(o => o.value === savedFiltros.forn)) selForn.value = savedFiltros.forn;
                document.getElementById('filtroContrato').value = savedFiltros.texto || '';
            }
        }
    },

    carregarDados: async () => {
        document.querySelectorAll('.loader').forEach(e => e.style.display = 'block');
        await App.carregarFiltrosSelect();
        await DB.carregarDados();
        const abaSalva = localStorage.getItem('controle_aba') || 'locacoes';
        UI.mudarAba(abaSalva);
        App.aplicarFiltrosELocalSort(); 
    },

    aplicarFiltrosELocalSort: () => {
        const fObra = document.getElementById('filtroObra').value; const fForn = document.getElementById('filtroForn').value; const fTexto = document.getElementById('filtroContrato').value.trim().toLowerCase();
        localStorage.setItem('controle_filtros', JSON.stringify({ obra: fObra, forn: fForn, texto: fTexto }));

        State.dadosFiltrados = State.dadosGlobais.filter(item => {
            const matchObra = fObra === 'todas' || item.obra === fObra; const matchForn = fForn === 'todos' || item.fornecedor === fForn;
            const textoAlvo = `${item.equipamento} ${item.contrato} ${item.fornecedor} ${item.obra}`.toLowerCase();
            const matchTexto = fTexto === '' || textoAlvo.includes(fTexto);
            return matchObra && matchForn && matchTexto;
        });

        const btnLimpar = document.getElementById('btn-limpar-filtros');
        if(btnLimpar) btnLimpar.style.display = (fObra !== 'todas' || fForn !== 'todos' || fTexto !== '') ? 'flex' : 'none';

        State.dadosFiltrados.sort((a, b) => {
            let valA = a[State.sortColunaAtual]; let valB = b[State.sortColunaAtual];
            if (typeof valA === 'number' || typeof valB === 'number') { return State.sortDirecaoAsc ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0); }
            valA = String(valA || '').toLowerCase(); valB = String(valB || '').toLowerCase();
            return State.sortDirecaoAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });

        App.atualizarSetasOrdenacao(); 
        UI.renderizarTabelas(); 
        UI.atualizarKPIsEDashboards(); 
        UI.renderizarModuloFornecedores();
    },

    ordenarColuna: (coluna) => {
        if (State.sortColunaAtual === coluna) { State.sortDirecaoAsc = !State.sortDirecaoAsc; } else { State.sortColunaAtual = coluna; State.sortDirecaoAsc = true; }
        App.aplicarFiltrosELocalSort();
    },

    atualizarSetasOrdenacao: () => {
        document.querySelectorAll('.sort-icon').forEach(span => span.innerText = ''); const seta = State.sortDirecaoAsc ? ' ▲' : ' ▼';
        const idsSetas = ['sort-obra', 'sort-equipamento', 'sort-data_fim', 'sort-contrato', 'sort-valor', 'sort-comp-obra', 'sort-comp-equip', 'sort-comp-data', 'sort-comp-contrato', 'sort-comp-valor', 'sort-hist-obra', 'sort-hist-equip', 'sort-hist-data', 'sort-hist-contrato', 'sort-hist-valor', 'sort-ex-obra', 'sort-ex-equip', 'sort-ex-data', 'sort-ex-contrato', 'sort-ex-valor'];
        idsSetas.forEach(id => { const el = document.getElementById(id); if (el && id.includes(State.sortColunaAtual)) { el.innerText = seta; } });
    },

    limparFiltros: () => {
        document.getElementById('filtroObra').value = 'todas'; document.getElementById('filtroForn').value = 'todos'; document.getElementById('filtroContrato').value = '';
        App.aplicarFiltrosELocalSort(); Utils.showToast("Filtros limpos!", "success");
    }
};

window.onload = () => {
    UI.inicializarTema();
    App.carregarDados();
};
