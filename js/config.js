// =====================================================
// CONFIG.JS
// Sistema Gestão de Equipamentos v6.3.0
// =====================================================

// Configuração principal do sistema
const CONFIG = Object.freeze({

    // ==========================
    // SUPABASE
    // ==========================

    SUPABASE_URL: "https://aidlesbrbwfxpziivkgw.supabase.co",

    SUPABASE_KEY:
        "sb_publishable_1wUqabj2T6y9L5tC-tAnwA_bzj-fyx0",

    // ==========================
    // BANCO
    // ==========================

    TABELA_PRINCIPAL: "locacoes",

    TABELA_LOGS: "logs",

    // Edge Function responsável pelo OCR seguro no servidor
    OCR_FUNCTION_NAME: "gemini-ocr",

    // ==========================
    // SISTEMA
    // ==========================

    VERSAO: "6.3.0",

    NOME_SISTEMA: "Gestão de Equipamentos",

    CACHE_KEY: "controle-obras",

    // ==========================
    // ALERTAS
    // ==========================

    ALERTA_DIAS: 7,

    ALERTA_CRITICO: 2,

    // ==========================
    // COLUNAS PADRÃO
    // ==========================

    COLUNAS_PADRAO: {

        obra: true,

        equip: true,

        periodo: true,

        contrato: true,

        valor: true,

        anexo: true,

        acoes: true

    }

});


// =====================================================
// ESTADO GLOBAL
// =====================================================

const State = {

    // Dados carregados do banco
    dadosGlobais: [],

    // Dados após filtros
    dadosFiltrados: [],

    // Dados devolvidos
    dadosHistorico: [],

    // Dados excluídos
    dadosExcluidos: [],

    // Ordenação
    sortColunaAtual: "data_inicio",

    sortDirecaoAsc: false,

    // Upload temporário
    base64AnexoTemporario: null,

    arquivoAnexoTemporario: null,

    mimeTypeTemporario: "",

    // Tema
    temaAtual: localStorage.getItem("tema") || "light",

    // Tela atual
    abaAtual: "locacoes",

    // Controle de carregamento
    carregando: false

};


// =====================================================
// OBJETO GLOBAL
// =====================================================

window.CONFIG = CONFIG;

window.State = State;
