import { readFileSync, writeFileSync } from 'node:fs';

const raiz = new URL('../', import.meta.url);
const core = readFileSync(new URL('supabase/functions/gemini-ocr/core.js', raiz), 'utf8');
const entrada = readFileSync(new URL('supabase/functions/gemini-ocr/index.ts', raiz), 'utf8')
    .replace(/^import \{ createHandler \} from '\.\/core\.js';\s*/, '');
const cabecalho = '// @ts-nocheck\n// Recuperação HTTP 503, versão 1: tentativas limitadas e modelos Flash alternativos.\n// Gerado por scripts/gerar-ocr-dashboard.mjs. Cole todo este arquivo no index.ts da função gemini-ocr.\n';
writeFileSync(new URL('docs/gemini-ocr-dashboard.ts', raiz), `${cabecalho}${core}\n${entrada}`);
console.log('Gerado: docs/gemini-ocr-dashboard.ts');
