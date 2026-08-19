import assert from 'node:assert/strict';
import test from 'node:test';

const originalWindow = globalThis.window;
globalThis.window = globalThis;
globalThis.CONFIG = {
    STORAGE_BUCKET: 'comprovantes',
    STORAGE_CACHE_CONTROL: 31536000,
    STORAGE_MAX_PDF_BYTES: 6 * 1024 * 1024,
    STORAGE_MAX_IMAGE_ORIGINAL_BYTES: 20 * 1024 * 1024,
    STORAGE_MAX_OPTIMIZED_IMAGE_BYTES: 3 * 1024 * 1024,
    TABELA_PRINCIPAL: 'locacoes'
};

await import('../js/storage.js');
const service = globalThis.StorageService;

test('extrai caminho de URL publica e caminho cru', () => {
    assert.equal(
        service.extrairCaminho(
            'https://demo.supabase.co/storage/v1/object/public/comprovantes/sha256/ab/arquivo.pdf?download=1'
        ),
        'sha256/ab/arquivo.pdf'
    );
    assert.equal(service.extrairCaminho('comprovantes/doc_1.pdf'), 'doc_1.pdf');
    assert.equal(service.extrairCaminho('doc_2.pdf'), 'doc_2.pdf');
});

test('rejeita PDF acima do limite configurado', () => {
    const grande = new File(
        [new Uint8Array(6 * 1024 * 1024 + 1)],
        'contrato.pdf',
        { type: 'application/pdf' }
    );

    assert.throws(
        () => service.validarArquivo(grande),
        /PDF maior que/
    );
});

test('hash SHA-256 e deterministico', async () => {
    const arquivo = new Blob(['mesmo-conteudo'], { type: 'application/pdf' });
    const primeiro = await service.calcularHash(arquivo);
    const segundo = await service.calcularHash(arquivo);

    assert.equal(primeiro, segundo);
    assert.match(primeiro, /^[a-f0-9]{64}$/);
});

test('reutiliza objeto quando o Storage informa conflito', async () => {
    const client = {
        storage: {
            from() {
                return {
                    async upload() {
                        return {
                            data: null,
                            error: { statusCode: '409', message: 'The resource already exists' }
                        };
                    },
                    getPublicUrl(path) {
                        return {
                            data: {
                                publicUrl: `https://demo.supabase.co/storage/v1/object/public/comprovantes/${path}`
                            }
                        };
                    }
                };
            }
        }
    };

    const file = new File(['pdf'], 'contrato.pdf', { type: 'application/pdf' });
    const prepared = await service.prepararArquivo(file);
    const result = await service.uploadPreparado(prepared, { client });

    assert.equal(result.created, false);
    assert.equal(result.deduplicated, true);
    assert.match(result.path, /^sha256_[a-f0-9]{64}\.pdf$/);
});

test.after(() => {
    globalThis.window = originalWindow;
});
