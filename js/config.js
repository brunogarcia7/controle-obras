const CONFIG = {
    SUPABASE_URL: 'https://aidlesbrbwfxpziivkgw.supabase.co',
    SUPABASE_KEY: 'COLE_SUA_CHAVE_AQUI_A_QUE_COMECA_COM_eyJ',
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
