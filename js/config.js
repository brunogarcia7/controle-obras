const CONFIG = {
    SUPABASE_URL: 'https://aidlesbrbwfxpziivkgw.supabase.co',
    SUPABASE_KEY: 'sb_publishable_1wUqabj2T6y9L5tC-tAnwA_bzj-fyx0',
    COLUNAS_PADRAO: { obra: true, equip: true, periodo: true, contrato: true, valor: true, anexo: true, acoes: true }
};

const State = {
    dadosGlobais: [],
    dadosFiltrados: [],
    sortColuna: 'data_inicio',
    sortAsc: false,
    abaAtiva: localStorage.getItem('controle_aba') || 'locacoes'
};
