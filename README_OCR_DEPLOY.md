# Deploy da correção OCR

Este projeto contém agora o código-fonte completo da Edge Function `gemini-ocr`. O frontend e a função precisam ser publicados; apenas enviar o `app.html` ao GitHub Pages não atualiza a função que roda no Supabase.

## 1. Pré-requisitos

- Node.js 20 ou superior.
- Supabase CLI.
- Acesso ao projeto Supabase `aidlesbrbwfxpziivkgw`.
- Uma chave válida da Gemini Developer API.
- Docker apenas para executar a Edge Function localmente.

## 2. Configurar o segredo do Gemini

Nunca coloque a chave Gemini no GitHub ou em `app.html`.

```bash
npx supabase login
npx supabase link --project-ref aidlesbrbwfxpziivkgw
npx supabase secrets set GEMINI_API_KEY=SUA_CHAVE_AQUI --project-ref aidlesbrbwfxpziivkgw
npx supabase secrets set GEMINI_MODELS=gemini-3.6-flash,gemini-3.5-flash --project-ref aidlesbrbwfxpziivkgw
npx supabase secrets set ALLOWED_ORIGINS=https://brunogarcia7.github.io --project-ref aidlesbrbwfxpziivkgw
```

As variáveis `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` e `SUPABASE_URL` são fornecidas automaticamente pelo Supabase hospedado. Não crie segredos próprios iniciados por `SUPABASE_`.

## 3. Publicar a Edge Function

O arquivo `supabase/config.toml` já define `verify_jwt = false`, requisito para usar a chave `sb_publishable_...` no header `apikey`. A função faz a validação dessa chave internamente.

```bash
npx supabase functions deploy gemini-ocr \
  --project-ref aidlesbrbwfxpziivkgw \
  --no-verify-jwt
```

Depois do deploy, confira os logs:

```bash
npx supabase functions logs gemini-ocr --project-ref aidlesbrbwfxpziivkgw
```

Caso a versão instalada da CLI não tenha o subcomando `logs`, use **Supabase Dashboard > Edge Functions > gemini-ocr > Logs**.

## 4. Teste de saúde

No navegador, abra o endpoint da função. A resposta esperada é um JSON com:

```json
{
  "ok": true,
  "service": "gemini-ocr",
  "geminiKeyConfigured": true,
  "models": ["gemini-3.6-flash", "gemini-3.5-flash"]
}
```

`geminiKeyConfigured: false` significa que o segredo não foi configurado no projeto correto.

## 5. Publicar o GitHub Pages

Substitua os arquivos do repositório pelos arquivos deste pacote, incluindo a nova pasta `supabase/` e os arquivos JavaScript atualizados. Depois:

```bash
git add .
git commit -m "Corrige OCR Gemini e adiciona Edge Function auditável"
git push origin main
```

Confirme que `js/config.js` mantém a chave pública `sb_publishable_...`. Ela é própria para uso no navegador. Nunca coloque `sb_secret_...`, `service_role` ou `GEMINI_API_KEY` nesse arquivo.

## 6. Teste funcional

1. Abra `app.html` em uma janela anônima para evitar cache antigo.
2. Abra o DevTools e filtre o Console por `[OCR]`.
3. Selecione uma imagem JPG/PNG/WEBP ou um PDF de até 8 MB.
4. Confirme a sequência de logs:
   - `arquivo_recebido`
   - `compressao_iniciada` / `compressao_concluida` para imagens
   - `base64_concluida`
   - `edge_envio_iniciado`
   - `edge_resposta_recebida` com HTTP 200
   - `formulario_preenchido`
   - `ocr_concluido`
5. Confirme nos logs da Edge Function:
   - `ocr_request_received`
   - `ocr_file_validated`
   - `gemini_request_started`
   - `gemini_request_succeeded`
   - `ocr_completed`

A resposta deve incluir `_meta.requestId`, `_meta.model` e `_meta.durationMs`. O mesmo `requestId` aparece no navegador e no Supabase, facilitando a correlação.

## 7. Diagnóstico por código

- `INVALID_JSON`, HTTP 400: body não é JSON.
- `INVALID_BASE64`, HTTP 400: Base64 malformado.
- `INVALID_SUPABASE_API_KEY`, HTTP 401: header `apikey` ausente/incorreto.
- `FILE_TOO_LARGE`, HTTP 413: arquivo processado acima do limite.
- `GEMINI_API_KEY_MISSING`, HTTP 500: segredo ausente.
- `GEMINI_AUTH_FAILED`, HTTP 502: Google recusou a chave.
- `ALL_GEMINI_MODELS_FAILED`, HTTP 502: todos os modelos falharam; `details.attempts` traz modelo, status e mensagem do Google.
- `OCR_TIMEOUT`, frontend: execução ultrapassou 75 segundos.

## 8. Testes automatizados incluídos

```bash
node tests/ocr-core.test.mjs
```

A suíte cobre contrato novo, compatibilidade com o payload antigo, fallback de modelo, fallback de formato estruturado, Base64 inválido, chave Supabase inválida, JSON inválido e falha de todos os modelos.
