// =====================================================
// CONFIG.JS
// Sistema Gestão de Equipamentos v6.4.0
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
    // STORAGE / ANEXOS
    // ==========================

    STORAGE_BUCKET: "comprovantes",

    // Arquivos usam nomes imutaveis por hash; por isso podem ficar 1 ano no cache do navegador.
    STORAGE_CACHE_CONTROL: 31536000,

    // PDFs nao sao reprocessados automaticamente para preservar texto, metadados e assinaturas digitais.
    STORAGE_MAX_PDF_BYTES: 6 * 1024 * 1024,

    STORAGE_MAX_IMAGE_ORIGINAL_BYTES: 20 * 1024 * 1024,
    STORAGE_MAX_OPTIMIZED_IMAGE_BYTES: 3 * 1024 * 1024,
    STORAGE_IMAGE_MAX_DIMENSION: 1800,
    STORAGE_IMAGE_QUALITY: 0.80,

    // Colunas realmente usadas no painel. Evita baixar campos desnecessarios.
    CAMPOS_LOCACOES: "id,obra,fornecedor,equipamento,quantidade,valor,status,data_inicio,data_fim,unidade,contrato,anexo,valor_indenizacao",

    // ==========================
    // SISTEMA
    // ==========================

    VERSAO: "6.4.0",

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
