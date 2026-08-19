// =====================================================
// STORAGE.JS
// Otimizacao de anexos e economia de egress/storage
// =====================================================

'use strict';

const StorageService = {
    MIME_PERMITIDOS: new Set([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
    ]),

    obterBucket() {
        return CONFIG.STORAGE_BUCKET || 'comprovantes';
    },

    obterCliente(cliente = null) {
        if (cliente) return cliente;
        if (window.DB?.obterClient) return DB.obterClient();
        if (window.DB?.client) return DB.client;
        throw new Error('Cliente do Supabase nao inicializado.');
    },

    obterMimeType(file) {
        const informado = String(file?.type || '')
            .toLowerCase()
            .split(';')[0]
            .trim();

        if (StorageService.MIME_PERMITIDOS.has(informado)) {
            return informado;
        }

        const extensao = String(file?.name || '')
            .toLowerCase()
            .split('.')
            .pop();

        const porExtensao = {
            pdf: 'application/pdf',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            webp: 'image/webp',
            heic: 'image/heic',
            heif: 'image/heif'
        };

        return porExtensao[extensao] || informado;
    },

    extensaoPorMime(mimeType) {
        return ({
            'application/pdf': 'pdf',
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/heic': 'heic',
            'image/heif': 'heif'
        })[mimeType] || 'bin';
    },

    formatarBytes(bytes) {
        const valor = Number(bytes) || 0;
        if (valor < 1024) return `${valor} B`;
        if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
        return `${(valor / (1024 * 1024)).toFixed(2)} MB`;
    },

    validarArquivo(file) {
        if (!file || typeof file.size !== 'number') {
            throw new Error('Arquivo invalido.');
        }

        const mimeType = StorageService.obterMimeType(file);
        if (!StorageService.MIME_PERMITIDOS.has(mimeType)) {
            throw new Error('Use PDF, JPG, PNG, WEBP, HEIC ou HEIF.');
        }

        const limitePdf = Number(CONFIG.STORAGE_MAX_PDF_BYTES) || 6 * 1024 * 1024;
        const limiteImagem = Number(CONFIG.STORAGE_MAX_IMAGE_ORIGINAL_BYTES) || 20 * 1024 * 1024;

        if (mimeType === 'application/pdf' && file.size > limitePdf) {
            throw new Error(
                `PDF maior que ${StorageService.formatarBytes(limitePdf)}. ` +
                'Compacte o PDF antes de anexar. O sistema preserva o arquivo original para nao invalidar assinaturas digitais.'
            );
        }

        if (mimeType !== 'application/pdf' && file.size > limiteImagem) {
            throw new Error(
                `Imagem maior que ${StorageService.formatarBytes(limiteImagem)}.`
            );
        }

        return { mimeType };
    },

    async carregarImagem(file) {
        if (typeof createImageBitmap === 'function') {
            try {
                return await createImageBitmap(file, {
                    imageOrientation: 'from-image'
                });
            } catch (erro) {
                console.warn('[Storage] createImageBitmap falhou; tentando Image:', erro);
            }
        }

        return await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const imagem = new Image();

            imagem.onload = () => {
                URL.revokeObjectURL(url);
                resolve(imagem);
            };

            imagem.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('O navegador nao conseguiu decodificar esta imagem.'));
            };

            imagem.src = url;
        });
    },

    async canvasParaBlob(canvas, mimeType, qualidade) {
        return await new Promise((resolve) => {
            canvas.toBlob(resolve, mimeType, qualidade);
        });
    },

    async renderizarImagemCompacta(file, maxDimensao, qualidade) {
        const imagem = await StorageService.carregarImagem(file);
        const larguraOriginal = imagem.naturalWidth || imagem.width;
        const alturaOriginal = imagem.naturalHeight || imagem.height;

        if (!larguraOriginal || !alturaOriginal) {
            if (typeof imagem.close === 'function') imagem.close();
            throw new Error('A imagem possui dimensoes invalidas.');
        }

        const escala = Math.min(
            1,
            maxDimensao / Math.max(larguraOriginal, alturaOriginal)
        );

        const largura = Math.max(1, Math.round(larguraOriginal * escala));
        const altura = Math.max(1, Math.round(alturaOriginal * escala));
        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;

        const contexto = canvas.getContext('2d');
        if (!contexto) {
            if (typeof imagem.close === 'function') imagem.close();
            throw new Error('Canvas indisponivel para compactar a imagem.');
        }

        contexto.imageSmoothingEnabled = true;
        contexto.imageSmoothingQuality = 'high';
        contexto.drawImage(imagem, 0, 0, largura, altura);
        if (typeof imagem.close === 'function') imagem.close();

        let mimeType = 'image/webp';
        let blob = await StorageService.canvasParaBlob(
            canvas,
            mimeType,
            qualidade
        );

        if (!blob || blob.type !== mimeType) {
            mimeType = 'image/jpeg';

            // JPEG nao possui transparencia. Um fundo branco evita areas pretas.
            const canvasJpeg = document.createElement('canvas');
            canvasJpeg.width = largura;
            canvasJpeg.height = altura;
            const contextoJpeg = canvasJpeg.getContext('2d');
            if (!contextoJpeg) {
                throw new Error('Canvas indisponivel para gerar JPEG.');
            }
            contextoJpeg.fillStyle = '#ffffff';
            contextoJpeg.fillRect(0, 0, largura, altura);
            contextoJpeg.drawImage(canvas, 0, 0);
            blob = await StorageService.canvasParaBlob(
                canvasJpeg,
                mimeType,
                qualidade
            );
        }

        if (!blob) {
            throw new Error('Falha ao compactar a imagem.');
        }

        return { blob, mimeType, largura, altura };
    },

    criarArquivo(blob, nomeOriginal, mimeType) {
        const extensao = StorageService.extensaoPorMime(mimeType);
        const base = String(nomeOriginal || 'anexo')
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .slice(0, 80) || 'anexo';

        const nome = `${base}.${extensao}`;

        try {
            return new File([blob], nome, {
                type: mimeType,
                lastModified: Date.now()
            });
        } catch {
            blob.name = nome;
            return blob;
        }
    },

    async otimizarImagem(file, mimeType) {
        const maxDimensao = Number(CONFIG.STORAGE_IMAGE_MAX_DIMENSION) || 1800;
        const qualidade = Number(CONFIG.STORAGE_IMAGE_QUALITY) || 0.8;
        const limiteFinal = Number(CONFIG.STORAGE_MAX_OPTIMIZED_IMAGE_BYTES) || 3 * 1024 * 1024;

        let resultado;

        try {
            resultado = await StorageService.renderizarImagemCompacta(
                file,
                maxDimensao,
                qualidade
            );

            if (resultado.blob.size > limiteFinal) {
                resultado = await StorageService.renderizarImagemCompacta(
                    file,
                    Math.min(maxDimensao, 1400),
                    Math.min(qualidade, 0.68)
                );
            }
        } catch (erro) {
            console.warn('[Storage] Imagem mantida sem compactacao:', erro);
            return {
                arquivo: file,
                blob: file,
                mimeType,
                extensao: StorageService.extensaoPorMime(mimeType),
                tamanhoOriginal: file.size,
                tamanhoFinal: file.size,
                otimizado: false,
                economiaBytes: 0,
                economiaPercentual: 0
            };
        }

        const originalJaEficiente =
            resultado.blob.size >= file.size * 0.95 &&
            ['image/jpeg', 'image/webp'].includes(mimeType);

        if (originalJaEficiente) {
            return {
                arquivo: file,
                blob: file,
                mimeType,
                extensao: StorageService.extensaoPorMime(mimeType),
                tamanhoOriginal: file.size,
                tamanhoFinal: file.size,
                otimizado: false,
                economiaBytes: 0,
                economiaPercentual: 0
            };
        }

        if (resultado.blob.size > limiteFinal) {
            throw new Error(
                `A imagem compactada ainda ficou maior que ${StorageService.formatarBytes(limiteFinal)}.`
            );
        }

        const arquivo = StorageService.criarArquivo(
            resultado.blob,
            file.name,
            resultado.mimeType
        );
        const economiaBytes = Math.max(0, file.size - resultado.blob.size);
        const economiaPercentual = file.size > 0
            ? Math.round((economiaBytes / file.size) * 100)
            : 0;

        return {
            arquivo,
            blob: arquivo,
            mimeType: resultado.mimeType,
            extensao: StorageService.extensaoPorMime(resultado.mimeType),
            tamanhoOriginal: file.size,
            tamanhoFinal: resultado.blob.size,
            otimizado: economiaBytes > 0,
            economiaBytes,
            economiaPercentual,
            largura: resultado.largura,
            altura: resultado.altura
        };
    },

    async prepararArquivo(file) {
        const { mimeType } = StorageService.validarArquivo(file);

        if (mimeType === 'application/pdf') {
            return {
                arquivo: file,
                blob: file,
                mimeType,
                extensao: 'pdf',
                tamanhoOriginal: file.size,
                tamanhoFinal: file.size,
                otimizado: false,
                economiaBytes: 0,
                economiaPercentual: 0
            };
        }

        return await StorageService.otimizarImagem(file, mimeType);
    },

    async calcularHash(blob) {
        if (!window.crypto?.subtle || typeof blob?.arrayBuffer !== 'function') {
            return null;
        }

        const buffer = await blob.arrayBuffer();
        const digest = await window.crypto.subtle.digest('SHA-256', buffer);

        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, '0'))
            .join('');
    },

    conflitoArquivoExistente(error) {
        const status = Number.parseInt(
            String(error?.statusCode || error?.status || ''),
            10
        );
        const mensagem = String(error?.message || '');

        return status === 409 ||
            /already exists|resource.*exists|duplicate/i.test(mensagem);
    },

    async uploadPreparado(preparado, opcoes = {}) {
        if (!preparado?.blob || !preparado?.mimeType) {
            throw new Error('Arquivo preparado para upload e invalido.');
        }

        const cliente = StorageService.obterCliente(opcoes.client);
        const bucket = StorageService.obterBucket();
        const hash = await StorageService.calcularHash(preparado.blob);
        const prefixo = String(opcoes.prefix || 'doc')
            .replace(/[^a-zA-Z0-9_-]/g, '') || 'doc';
        const id = window.crypto?.randomUUID?.() ||
            `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        const caminho = hash
            ? `sha256_${hash}.${preparado.extensao}`
            : `${prefixo}_${id}.${preparado.extensao}`;

        const { data, error } = await cliente.storage
            .from(bucket)
            .upload(caminho, preparado.blob, {
                contentType: preparado.mimeType,
                cacheControl: String(CONFIG.STORAGE_CACHE_CONTROL || 31536000),
                upsert: false
            });

        let criado = true;
        let caminhoFinal = data?.path || caminho;

        if (error) {
            if (!StorageService.conflitoArquivoExistente(error)) {
                throw new Error(`Falha no upload do anexo: ${error.message}`);
            }

            // O mesmo conteudo ja foi enviado antes. Reutiliza o objeto.
            criado = false;
            caminhoFinal = caminho;
        }

        const publicUrl = cliente.storage
            .from(bucket)
            .getPublicUrl(caminhoFinal)
            .data
            .publicUrl;

        return {
            ...preparado,
            path: caminhoFinal,
            publicUrl,
            created: criado,
            deduplicated: !criado,
            hash
        };
    },

    async upload(file, opcoes = {}) {
        const preparado = await StorageService.prepararArquivo(file);
        return await StorageService.uploadPreparado(preparado, opcoes);
    },

    extrairCaminho(referencia) {
        const valor = String(referencia || '').trim();
        if (!valor) return null;

        const bucket = StorageService.obterBucket();

        if (!/^https?:\/\//i.test(valor)) {
            const semBucket = valor.startsWith(`${bucket}/`)
                ? valor.slice(bucket.length + 1)
                : valor;
            return semBucket.replace(/^\/+/, '') || null;
        }

        try {
            const url = new URL(valor);
            const marcadores = [
                `/storage/v1/object/public/${bucket}/`,
                `/storage/v1/object/sign/${bucket}/`,
                `/storage/v1/object/authenticated/${bucket}/`
            ];

            for (const marcador of marcadores) {
                const indice = url.pathname.indexOf(marcador);
                if (indice >= 0) {
                    const codificado = url.pathname.slice(indice + marcador.length);
                    try {
                        return decodeURIComponent(codificado);
                    } catch {
                        return codificado;
                    }
                }
            }
        } catch {
            return null;
        }

        return null;
    },

    async remover(referencia, opcoes = {}) {
        const caminho = StorageService.extrairCaminho(referencia);
        if (!caminho) {
            return { removed: false, reason: 'referencia-externa-ou-invalida' };
        }

        const cliente = StorageService.obterCliente(opcoes.client);
        const { error } = await cliente.storage
            .from(StorageService.obterBucket())
            .remove([caminho]);

        if (error) {
            throw new Error(`Nao foi possivel remover o anexo antigo: ${error.message}`);
        }

        return { removed: true, path: caminho };
    },

    async removerSeSemReferencia(referencia, opcoes = {}) {
        const valor = String(referencia || '').trim();
        if (!valor) return { removed: false, reason: 'sem-referencia' };

        const cliente = StorageService.obterCliente(opcoes.client);
        const tabela = CONFIG.TABELA_PRINCIPAL || 'locacoes';
        let consulta = cliente
            .from(tabela)
            .select('id')
            .eq('anexo', valor)
            .limit(1);

        if (opcoes.ignoreId !== undefined && opcoes.ignoreId !== null) {
            consulta = consulta.neq('id', opcoes.ignoreId);
        }

        const { data, error } = await consulta;
        if (error) {
            throw new Error(`Falha ao conferir referencias do anexo: ${error.message}`);
        }

        if (Array.isArray(data) && data.length > 0) {
            return { removed: false, reason: 'ainda-referenciado' };
        }

        return await StorageService.remover(valor, opcoes);
    },

    mensagemEconomia(upload) {
        if (!upload) return '';
        if (upload.deduplicated) {
            return ' O arquivo ja existia e foi reutilizado, sem ocupar espaco duplicado.';
        }
        if (upload.otimizado && upload.economiaBytes > 0) {
            return ` Anexo reduzido de ${StorageService.formatarBytes(upload.tamanhoOriginal)} ` +
                `para ${StorageService.formatarBytes(upload.tamanhoFinal)} ` +
                `(${upload.economiaPercentual}% menor).`;
        }
        return '';
    }
};

window.StorageService = StorageService;
