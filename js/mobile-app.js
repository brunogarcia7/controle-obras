'use strict';

const SUPABASE_URL = window.CONFIG?.SUPABASE_URL || '';
const SUPABASE_KEY = window.CONFIG?.SUPABASE_KEY || '';
const OCR_FUNCTION_NAME = window.CONFIG?.OCR_FUNCTION_NAME || 'gemini-ocr';
const OCR_ENDPOINT = `${SUPABASE_URL}/functions/v1/${OCR_FUNCTION_NAME}`;

if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error('A biblioteca do Supabase não foi carregada.');
}
if (!SUPABASE_URL || !/^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(SUPABASE_URL)) {
    throw new Error('A URL pública do Supabase não foi configurada corretamente.');
}
if (!SUPABASE_KEY || (!SUPABASE_KEY.startsWith('sb_publishable_') && !SUPABASE_KEY.startsWith('eyJ'))) {
    throw new Error('A chave pública do Supabase não foi configurada corretamente.');
}

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const MIME_PERMITIDOS = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
]);
const LIMITE_PROCESSADO_BYTES = 8 * 1024 * 1024;
const TIMEOUT_IA_MS = 75000;

let arquivoAnexoGlobal = null;
let anexoPreparadoGlobal = null;
let processamentoIA = false;
let salvamentoEmAndamento = false;
let ocrControllerAtivo = null;
let conferenciaOCR = null;
let arquivoOCRPreparadoGlobal = null;
let ultimaLeituraFalhou = false;

const elementos = {
    fotoCamera: document.getElementById('foto-camera'),
    fotoArquivo: document.getElementById('foto-arquivo'),
    btnCamera: document.getElementById('btn-camera'),
    btnArquivo: document.getElementById('btn-arquivo'),
    btnSalvar: document.getElementById('btn-enviar-sistema'),
    statusFoto: document.getElementById('foto-status'),
    loaderIA: document.getElementById('loader-ia'),
    loaderSalvar: document.getElementById('loader-salvar'),
    cloudStatus: document.getElementById('mobile-cloud-status'),
    itens: document.getElementById('itens-cadastro'),
    btnAdicionar: document.getElementById('btn-adicionar-item'),
    resumo: document.getElementById('resumo-itens'),
    aviso: document.getElementById('aviso-conferencia'),
    btnRepetirOCR: document.getElementById('btn-repetir-ocr')
};
const modeloItem = elementos.itens.querySelector('.item-cadastro').cloneNode(true);
const moedaBR = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function obterItensDoFormulario() {
    return [...elementos.itens.querySelectorAll('.item-cadastro')].map((linha) => {
        const item = { codigo: linha.dataset.codigo || '' };
        linha.querySelectorAll('[data-campo]').forEach((campo) => {
            item[campo.dataset.campo] = campo.value;
        });
        return item;
    });
}

function renderizarItens(itens) {
    const lista = itens.length ? itens : [{ quantidade: 1 }];
    const fragmento = document.createDocumentFragment();
    lista.forEach((item, indice) => {
        const linha = modeloItem.cloneNode(true);
        linha.dataset.codigo = String(item.codigo || '');
        linha.querySelector('[data-titulo-item]').textContent = `Item ${indice + 1}`;
        linha.querySelector('[data-codigo-item]').textContent = item.codigo ? `Código ${item.codigo}` : '';
        const remover = linha.querySelector('[data-remover-item]');
        remover.dataset.indice = String(indice);
        remover.disabled = lista.length === 1;
        remover.setAttribute('aria-label', `Remover item ${indice + 1}`);
        linha.querySelectorAll('[data-campo]').forEach((campo) => {
            const chave = campo.dataset.campo;
            const idBase = chave === 'valor_indenizacao' ? 'valor-indenizacao' : chave;
            campo.id = indice === 0 ? idBase : `item-${indice + 1}-${idBase}`;
            campo.value = item[chave] ?? (chave === 'quantidade' ? 1 : '');
            linha.querySelector(`[data-label-campo="${chave}"]`).htmlFor = campo.id;
        });
        const ajuda = linha.querySelector('[data-ajuda-indenizacao]');
        ajuda.id = indice === 0 ? 'ajuda-indenizacao' : `ajuda-indenizacao-${indice + 1}`;
        linha.querySelector('[data-campo="valor_indenizacao"]').setAttribute('aria-describedby', ajuda.id);
        fragmento.appendChild(linha);
    });
    elementos.itens.replaceChildren(fragmento);
    atualizarResumoItens();
    atualizarEstadoControles();
}

function atualizarResumoItens() {
    const itens = obterItensDoFormulario();
    const resumo = OCRItens.resumir(itens);
    const partes = [
        `${resumo.linhas} ${resumo.linhas === 1 ? 'item' : 'itens'} · ${resumo.unidades} unidades`,
        `Locação / compra: ${moedaBR.format(resumo.valor / 100)}${resumo.pendentes.valor ? ' (valores pendentes)' : ''}`,
        `Indenização: ${moedaBR.format(resumo.valor_indenizacao / 100)}${resumo.pendentes.valor_indenizacao ? ' (há valores não informados)' : ''}`
    ];
    elementos.resumo.textContent = partes.join('\n');
    elementos.btnSalvar.textContent = itens.length > 1 ? `Enviar ${itens.length} itens` : 'Enviar cadastro';
    const avisos = [...(conferenciaOCR?.avisos || [])];
    for (const [campo, total, rotulo] of [
        ['valor', conferenciaOCR?.valor_total, 'locação/compra'],
        ['valor_indenizacao', conferenciaOCR?.valor_indenizacao_total, 'indenização']
    ]) {
        if (total !== null && total !== undefined && !resumo.pendentes[campo] && resumo[campo] !== Math.round(total * 100)) {
            avisos.push(`A soma de ${rotulo} das linhas difere do total do documento (${moedaBR.format(total)}). Confira os itens, frete e descontos.`);
        }
    }
    elementos.aviso.textContent = [...new Set(avisos)].join('\n');
    elementos.aviso.hidden = avisos.length === 0;
}

function limparDadosDoDocumento() {
    conferenciaOCR = null;
    arquivoOCRPreparadoGlobal = null;
    ultimaLeituraFalhou = false;
    for (const id of ['fornecedor', 'contrato', 'data-fim']) document.getElementById(id).value = '';
    document.getElementById('data-inicio').value = formatarDataLocalISO();
    document.getElementById('periodo').value = 'Mês';
    renderizarItens([{ quantidade: 1 }]);
}

function atualizarStatusNuvem(estado = 'loading', texto = '') {
    if (!elementos.cloudStatus) return;

    const textos = {
        loading: 'Conectando',
        ready: 'Pronto para envio',
        online: 'Nuvem conectada',
        error: 'Conexão indisponível'
    };
    const estadoSeguro = Object.prototype.hasOwnProperty.call(textos, estado)
        ? estado
        : 'loading';

    elementos.cloudStatus.dataset.state = estadoSeguro;
    elementos.cloudStatus.textContent = texto || textos[estadoSeguro];
}

function criarRequestId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `ocr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function registrarEtapaOCR(etapa, dados = {}, nivel = 'info') {
    const payload = {
        etapa,
        horario: new Date().toISOString(),
        ...dados
    };
    const metodo = nivel === 'error' ? 'error' : nivel === 'warn' ? 'warn' : 'info';
    console[metodo]('[OCR]', payload);
}

function atualizarEstadoControles() {
    const bloqueado = processamentoIA || salvamentoEmAndamento;
    elementos.btnCamera.disabled = bloqueado;
    elementos.btnArquivo.disabled = bloqueado;
    elementos.btnSalvar.disabled = bloqueado;
    elementos.btnAdicionar.disabled = bloqueado;
    elementos.btnRepetirOCR.disabled = bloqueado;
    elementos.btnRepetirOCR.hidden = !ultimaLeituraFalhou || !arquivoOCRPreparadoGlobal;
    document.querySelectorAll('.capture-card input, .capture-card select').forEach((campo) => { campo.disabled = bloqueado; });
    elementos.itens.querySelectorAll('[data-remover-item]').forEach((botao) => {
        botao.disabled = bloqueado || elementos.itens.querySelectorAll('.item-cadastro').length === 1;
    });
    if (document.getElementById('tipo').value === 'Compra') {
        document.getElementById('data-fim').disabled = true;
        document.getElementById('periodo').disabled = true;
    }
}

function definirProcessamentoIA(ativo) {
    processamentoIA = ativo;
    atualizarEstadoControles();
}

function definirSalvamento(ativo) {
    salvamentoEmAndamento = ativo;
    atualizarEstadoControles();
    elementos.loaderSalvar.style.display = ativo ? 'block' : 'none';
}

function exibirStatusIA(mensagem, tipo = 'processando') {
    const estilos = {
        processando: { cor: '#6366f1', fundo: 'rgba(99, 102, 241, 0.1)' },
        sucesso: { cor: 'var(--success)', fundo: 'rgba(16, 185, 129, 0.1)' },
        aviso: { cor: 'var(--warning)', fundo: 'rgba(245, 158, 11, 0.1)' },
        erro: { cor: 'var(--danger)', fundo: 'rgba(239, 68, 68, 0.1)' }
    };
    const estilo = estilos[tipo] || estilos.processando;
    elementos.loaderIA.style.display = 'block';
    elementos.loaderIA.innerText = mensagem;
    elementos.loaderIA.style.color = estilo.cor;
    elementos.loaderIA.style.background = estilo.fundo;
}

function abrirSeletor(input) {
    if (processamentoIA || salvamentoEmAndamento) return;
    input.value = '';
    input.click();
}

function obterMimeType(file) {
    const mimeInformado = String(file.type || '').toLowerCase().split(';')[0].trim();
    if (MIME_PERMITIDOS.has(mimeInformado)) return mimeInformado;

    const extensao = String(file.name || '').toLowerCase().split('.').pop();
    const porExtensao = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        heic: 'image/heic',
        heif: 'image/heif',
        pdf: 'application/pdf'
    };
    return porExtensao[extensao] || mimeInformado;
}

function lerComoDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
        reader.onabort = () => reject(new Error('A leitura do arquivo foi cancelada.'));
        reader.readAsDataURL(blob);
    });
}

function extrairBase64(dataURL) {
    const separador = dataURL.indexOf(',');
    if (separador < 0) throw new Error('O arquivo não foi convertido para Base64 corretamente.');
    const base64 = dataURL.slice(separador + 1).replace(/\s/g, '');
    if (!base64) throw new Error('O arquivo convertido está vazio.');
    if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        throw new Error('O arquivo convertido contém Base64 inválido.');
    }
    return base64;
}

async function prepararArquivoParaIA(file, requestId) {
    const mimeTypeOriginal = obterMimeType(file);
    registrarEtapaOCR('arquivo_recebido', {
        requestId,
        nome: file.name,
        mimeType: mimeTypeOriginal,
        tamanho: file.size
    });

    // A mesma versao compactada e usada no OCR e no Storage. Assim a foto
    // nao e enviada pequena para a IA e depois armazenada em tamanho original.
    const storagePrepared = await StorageService.prepararArquivo(file);

    if (storagePrepared.blob.size > LIMITE_PROCESSADO_BYTES) {
        throw new Error('O arquivo processado ficou maior que 8 MB. Reduza a resolução e tente novamente.');
    }

    registrarEtapaOCR('base64_iniciada', {
        requestId,
        mimeType: storagePrepared.mimeType,
        tamanhoProcessado: storagePrepared.blob.size,
        economiaPercentual: storagePrepared.economiaPercentual
    });
    const dataURL = await lerComoDataURL(storagePrepared.blob);
    const base64 = extrairBase64(dataURL);
    registrarEtapaOCR('base64_concluida', {
        requestId,
        caracteres: base64.length,
        tamanhoProcessado: storagePrepared.blob.size
    });

    return {
        name: file.name,
        mimeType: storagePrepared.mimeType,
        data: base64,
        size: storagePrepared.blob.size,
        blob: storagePrepared.blob,
        storagePrepared
    };
}

function criarErroDaResposta(data, status, requestIdPadrao) {
    const mensagem = data?.error || data?.message || `Falha no servidor (${status}).`;
    const detalhes = Array.isArray(data?.details?.attempts)
        ? data.details.attempts.map(item => `${item.model}: HTTP ${item.status} - ${item.error}`).join(' | ')
        : '';
    const erro = new Error(detalhes ? `${mensagem} ${detalhes}` : mensagem);
    erro.code = data?.code || 'OCR_SERVER_ERROR';
    erro.stage = data?.stage || 'edge-function';
    erro.requestId = data?.requestId || requestIdPadrao;
    erro.status = status;
    erro.details = data?.details;
    return erro;
}

async function chamarGeminiOCR(arquivoPreparado, requestId) {
    const controller = new AbortController();
    ocrControllerAtivo = controller;
    const timer = setTimeout(() => controller.abort(), TIMEOUT_IA_MS);
    const payload = {
        requestId,
        file: {
            name: arquivoPreparado.name,
            mimeType: arquivoPreparado.mimeType,
            size: arquivoPreparado.size,
            data: arquivoPreparado.data
        }
    };

    try {
        registrarEtapaOCR('edge_envio_iniciado', {
            requestId,
            endpoint: OCR_ENDPOINT,
            mimeType: arquivoPreparado.mimeType,
            tamanho: arquivoPreparado.size
        });

        const resposta = await fetch(OCR_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'apikey': SUPABASE_KEY,
                'x-request-id': requestId
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
            cache: 'no-store'
        });

        const corpoTexto = await resposta.text();
        let data = {};
        if (corpoTexto) {
            try {
                data = JSON.parse(corpoTexto);
            } catch {
                const erro = new Error(`A Edge Function retornou conteúdo não JSON (HTTP ${resposta.status}).`);
                erro.stage = 'edge-response-parse';
                erro.requestId = requestId;
                erro.responsePreview = corpoTexto.slice(0, 240);
                throw erro;
            }
        }

        registrarEtapaOCR('edge_resposta_recebida', {
            requestId: data?._meta?.requestId || data?.requestId || requestId,
            status: resposta.status,
            ok: resposta.ok,
            modelo: data?._meta?.model,
            duracaoMs: data?._meta?.durationMs,
            codigo: data?.code,
            etapaErro: data?.stage
        }, resposta.ok ? 'info' : 'warn');

        if (!resposta.ok || data?.error) {
            throw criarErroDaResposta(data, resposta.status, requestId);
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('A Edge Function não retornou um objeto de OCR válido.');
        }
        return data;
    } catch (erro) {
        if (erro.name === 'AbortError') {
            const timeoutError = new Error('A análise excedeu 75 segundos. Consulte os logs da Edge Function e tente novamente.');
            timeoutError.code = 'OCR_TIMEOUT';
            timeoutError.stage = 'frontend-timeout';
            timeoutError.requestId = requestId;
            throw timeoutError;
        }
        throw erro;
    } finally {
        clearTimeout(timer);
        if (ocrControllerAtivo === controller) ocrControllerAtivo = null;
    }
}

function preencherFormularioComOCR(data) {
    const leitura = OCRItens.normalizarResposta(data);
    conferenciaOCR = leitura;
    if (leitura.fornecedor && leitura.fornecedor.toLowerCase() !== 'não identificado') {
        document.getElementById('fornecedor').value = leitura.fornecedor;
    }
    document.getElementById('contrato').value = leitura.contrato;
    if (leitura.data_inicio) document.getElementById('data-inicio').value = leitura.data_inicio;
    document.getElementById('data-fim').value = leitura.data_fim;
    document.getElementById('periodo').value = leitura.periodo;
    renderizarItens(leitura.itens);
    registrarEtapaOCR('formulario_preenchido', {
        fornecedorPreenchido: Boolean(leitura.fornecedor),
        itens: leitura.itens.length,
        contratoPreenchido: Boolean(leitura.contrato),
        avisos: leitura.avisos.length
    });
    return leitura;
}

function tratarFalhaOCR(erro, requestId) {
    ultimaLeituraFalhou = true;
    if (!anexoPreparadoGlobal) {
        arquivoAnexoGlobal = null;
        elementos.statusFoto.innerText = '❌ Arquivo não aceito para envio.';
        elementos.statusFoto.style.color = 'var(--danger)';
    }
    registrarEtapaOCR('ocr_falhou', {
        requestId: erro.requestId || requestId,
        codigo: erro.code, etapa: erro.stage, status: erro.status,
        mensagem: erro.message, detalhes: erro.details
    }, 'error');
    const temporario = ['GEMINI_BUSY', 'OCR_TIMEOUT'].includes(erro.code) ||
        [503, 504].includes(erro.status) ||
        (Array.isArray(erro.details?.attempts) && erro.details.attempts.some((item) => item.status === 503));
    const mensagem = temporario
        ? 'O serviço de leitura está temporariamente ocupado. Aguarde um pouco e clique em “Tentar leitura novamente”. Sua imagem foi mantida.'
        : `Não foi possível ler o documento: ${erro.message}. Revise os dados manualmente ou tente a leitura novamente.`;
    exibirStatusIA(`⚠️ ${mensagem} Referência: ${erro.requestId || requestId}.`, 'aviso');
}

async function executarLeituraOCR(arquivoPreparado, requestId) {
    definirProcessamentoIA(true);
    ultimaLeituraFalhou = false;
    elementos.btnRepetirOCR.hidden = true;
    exibirStatusIA('☁️ Lendo o documento. Se o serviço estiver ocupado, novas tentativas serão feitas automaticamente...', 'processando');
    try {
        const dados = await chamarGeminiOCR(arquivoPreparado, requestId);
        const leitura = preencherFormularioComOCR(dados);
        exibirStatusIA(`${leitura.avisos.length ? '⚠️' : '✅'} ${leitura.itens.length} ${leitura.itens.length === 1 ? 'item reconhecido' : 'itens reconhecidos'}. Confira todas as linhas antes de enviar.`, leitura.avisos.length ? 'aviso' : 'sucesso');
        registrarEtapaOCR('ocr_concluido', {
            requestId: dados?._meta?.requestId || requestId,
            modelo: dados?._meta?.model,
            duracaoMs: dados?._meta?.durationMs
        });
    } catch (erro) {
        tratarFalhaOCR(erro, requestId);
    } finally {
        definirProcessamentoIA(false);
    }
}

async function repetirLeituraOCR() {
    if (!arquivoOCRPreparadoGlobal || processamentoIA || salvamentoEmAndamento) return;
    await executarLeituraOCR(arquivoOCRPreparadoGlobal, criarRequestId());
}

async function previewFotoEProcessarIA(event) {
    const file = event.target.files?.[0];
    if (!file || processamentoIA || salvamentoEmAndamento) return;

    // Um novo anexo nunca deve ficar associado aos campos do documento anterior.
    limparDadosDoDocumento();

    const requestId = criarRequestId();
    const mimeType = obterMimeType(file);
    const isPDF = mimeType === 'application/pdf';

    arquivoAnexoGlobal = file;
    anexoPreparadoGlobal = null;
    elementos.statusFoto.style.display = 'block';
    elementos.statusFoto.innerText = isPDF
        ? `📄 PDF selecionado: ${file.name}`
        : `✅ Imagem selecionada: ${file.name}`;
    elementos.statusFoto.style.color = isPDF ? 'var(--primary)' : 'var(--success)';

    definirProcessamentoIA(true);
    exibirStatusIA('🤖 Validando e preparando o documento...', 'processando');

    try {
        const arquivoPreparado = await prepararArquivoParaIA(file, requestId);
        anexoPreparadoGlobal = arquivoPreparado.storagePrepared;
        arquivoOCRPreparadoGlobal = arquivoPreparado;

        const info = arquivoPreparado.storagePrepared;
        const economia = info.otimizado
            ? `, reduzida de ${StorageService.formatarBytes(info.tamanhoOriginal)} para ${StorageService.formatarBytes(info.tamanhoFinal)}`
            : `, ${StorageService.formatarBytes(info.tamanhoFinal)}`;
        elementos.statusFoto.innerText = isPDF
            ? `📄 PDF pronto: ${file.name} (${StorageService.formatarBytes(info.tamanhoFinal)})`
            : `✅ Imagem pronta${economia}`;

        await executarLeituraOCR(arquivoPreparado, requestId);
    } catch (erro) {
        tratarFalhaOCR(erro, requestId);
    } finally {
        definirProcessamentoIA(false);
    }
}

function preencherDatalistObras(obras) {
    const datalist = document.getElementById('lista-obras');
    const fragmento = document.createDocumentFragment();
    for (const obra of obras) {
        const option = document.createElement('option');
        option.value = obra;
        fragmento.appendChild(option);
    }
    datalist.replaceChildren(fragmento);
}

async function carregarObras() {
    try {
        const cache = sessionStorage.getItem('obras_cache_v2');
        if (cache) {
            const obrasCache = JSON.parse(cache);
            if (Array.isArray(obrasCache)) {
                preencherDatalistObras(obrasCache.map(String));
                atualizarStatusNuvem('ready');
                return;
            }
        }

        const { data, error } = await db.from('locacoes').select('obra');
        if (error) throw error;

        const obrasUnicas = [...new Set((data || [])
            .map(item => String(item.obra || '').trim())
            .filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
        preencherDatalistObras(obrasUnicas);
        sessionStorage.setItem('obras_cache_v2', JSON.stringify(obrasUnicas));
        atualizarStatusNuvem('online');
    } catch (erro) {
        atualizarStatusNuvem('error');
        console.error('[Mobile] Erro ao carregar obras:', erro);
    }
}

function obterExtensaoUpload(file) {
    const porMime = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/heic': 'heic',
        'image/heif': 'heif'
    };
    return porMime[obterMimeType(file)] || 'bin';
}

function formatarDataLocalISO(data = new Date()) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

async function salvarDados() {
    if (salvamentoEmAndamento) return;
    if (processamentoIA) {
        alert('Aguarde a leitura do documento terminar antes de salvar.');
        return;
    }

    let upload = null;

    try {
        // Valida todas as linhas antes do upload e de qualquer gravação.
        const payloads = OCRItens.criarPayloads({
            obra: document.getElementById('obra').value,
            fornecedor: document.getElementById('fornecedor').value,
            tipo: document.getElementById('tipo').value,
            contrato: document.getElementById('contrato').value,
            periodo: document.getElementById('periodo').value,
            data_inicio: document.getElementById('data-inicio').value,
            data_fim: document.getElementById('data-fim').value,
            itens: obterItensDoFormulario()
        }, null, formatarDataLocalISO());

        definirSalvamento(true);
        atualizarStatusNuvem('loading', 'Enviando cadastro');
        let urlAnexo = null;

        if (arquivoAnexoGlobal) {
            if (!anexoPreparadoGlobal) {
                throw new Error('O anexo ainda não foi preparado. Selecione o arquivo novamente.');
            }

            upload = await StorageService.uploadPreparado(
                anexoPreparadoGlobal,
                { client: db, prefix: 'mobile_nf' }
            );
            urlAnexo = upload.publicUrl;
        }

        payloads.forEach((item) => { item.anexo = urlAnexo; });
        // Uma única inserção de todas as linhas; o anexo é enviado só uma vez.
        const { error } = await db.from('locacoes').insert(payloads);
        if (error) throw error;

        try { sessionStorage.removeItem('obras_cache_v2'); } catch (_) { /* Cache opcional. */ }
        atualizarStatusNuvem('online', 'Cadastro enviado');
        alert(`✅ ${payloads.length} ${payloads.length === 1 ? 'item salvo' : 'itens salvos'} com sucesso no Painel!${StorageService.mensagemEconomia(upload)}`);
        limparDadosDoDocumento();
        elementos.fotoCamera.value = '';
        elementos.fotoArquivo.value = '';
        elementos.statusFoto.style.display = 'none';
        elementos.loaderIA.style.display = 'none';
        arquivoAnexoGlobal = null;
        anexoPreparadoGlobal = null;
    } catch (erro) {
        if (upload?.created && upload?.publicUrl) {
            try {
                await StorageService.removerSeSemReferencia(upload.publicUrl, {
                    client: db
                });
            } catch (limpezaErro) {
                console.warn('[Mobile] Upload sem registro ficou para manutencao:', limpezaErro);
            }
        }

        atualizarStatusNuvem('error', 'Falha no envio');
        console.error('[Mobile] Erro ao salvar:', erro);
        alert(`❌ Erro ao salvar: ${erro.message}`);
    } finally {
        definirSalvamento(false);
    }
}

elementos.btnCamera.addEventListener('click', () => abrirSeletor(elementos.fotoCamera));
elementos.btnArquivo.addEventListener('click', () => abrirSeletor(elementos.fotoArquivo));
elementos.fotoCamera.addEventListener('change', previewFotoEProcessarIA);
elementos.fotoArquivo.addEventListener('change', previewFotoEProcessarIA);
elementos.btnSalvar.addEventListener('click', salvarDados);
elementos.btnRepetirOCR.addEventListener('click', repetirLeituraOCR);
elementos.btnAdicionar.addEventListener('click', () => {
    if (processamentoIA || salvamentoEmAndamento) return;
    const itens = obterItensDoFormulario();
    itens.push({ quantidade: 1 });
    renderizarItens(itens);
    elementos.itens.querySelectorAll('[data-campo="equipamento"]')[itens.length - 1].focus();
});
elementos.itens.addEventListener('input', atualizarResumoItens);
elementos.itens.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-remover-item]');
    if (!botao || processamentoIA || salvamentoEmAndamento) return;
    const itens = obterItensDoFormulario();
    if (itens.length < 2) return;
    itens.splice(Number(botao.dataset.indice), 1);
    renderizarItens(itens);
    elementos.itens.querySelector('[data-campo="equipamento"]').focus();
});
document.getElementById('tipo').addEventListener('change', atualizarEstadoControles);

limparDadosDoDocumento();
carregarObras();

window.addEventListener('error', event => {
    console.error('[Mobile] Erro JavaScript não tratado:', event.error || event.message);
});
window.addEventListener('unhandledrejection', event => {
    console.error('[Mobile] Promise rejeitada sem tratamento:', event.reason);
});
