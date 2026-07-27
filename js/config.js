const CONFIG = {
    SUPABASE_URL: 'https://aidlesbrbwfxpziivkgw.supabase.co',
    SUPABASE_KEY: 'sb_publishable_1wUqabj2T6y9L5tC-tAnwA_bzj-fyx0',
    COLUNAS_PADRAO: { obra: true, equip: true, periodo: true, contrato: true, valor: true, anexo: true, acoes: true }
};

const State = {
    dadosGlobais: [],
    dadosFiltrados: [],
    sortColunaAtual: 'data_inicio',
    sortDirecaoAsc: false,
    base64AnexoTemporario: null,
    mimeTypeTemporario: ''
};
