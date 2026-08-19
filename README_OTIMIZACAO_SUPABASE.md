# Otimizacao de Storage e Egress do Supabase

## Diagnostico da captura enviada

A captura nao mostra o limite de armazenamento atingido. Ela mostra:

- **Storage Size:** aproximadamente 0,076 GB de 1 GB, ou cerca de 8%;
- **Egress no ciclo atual:** aproximadamente 0,272 GB de 5 GB, ou cerca de 5%;
- aviso do ciclo anterior: **Egress Exceeded**.

Portanto, o bloqueio anterior foi provocado por trafego de saida, isto e, arquivos/dados enviados do Supabase para navegadores ou outros servicos. Abrir ou baixar PDFs do bucket gera egress. A Edge Function de OCR e consultas repetidas ao banco tambem podem contribuir.

## Alteracoes feitas nesta versao

### 1. Imagens compactadas antes do Storage

Fotos JPG, PNG, WEBP, HEIC e HEIF passam por compactacao no navegador antes do upload:

- dimensao maxima padrao: 1800 px;
- formato preferencial: WEBP;
- qualidade padrao: 0,80;
- tamanho final maximo padrao: 3 MB.

No aplicativo movel, a mesma imagem compactada e usada no OCR e no Storage. Antes, a IA recebia uma copia reduzida, mas o Storage recebia a foto original grande.

### 2. PDFs preservados e limitados

PDFs nao sao remontados automaticamente. Isso evita remover camada de texto, metadados, formularios ou invalidar assinaturas digitais.

O limite padrao passou a ser **6 MB por PDF**. Esse valor pode ser alterado em `js/config.js`:

```js
STORAGE_MAX_PDF_BYTES: 6 * 1024 * 1024,
```

Para um PDF maior, compacte-o antes do envio com uma ferramenta confiavel e confira a legibilidade e as assinaturas.

### 3. Deduplicacao por SHA-256

O sistema calcula o hash do arquivo e usa um caminho baseado no conteudo:

```text
sha256_abcdef...123.pdf
```

Se o mesmo contrato for anexado novamente, o objeto existente e reutilizado em vez de ocupar espaco duplicado. Isso e especialmente util quando um unico contrato aparece em varios equipamentos.

### 4. Cache longo para reduzir egress futuro

Novos objetos recebem:

```js
cacheControl: "31536000"
```

Como os nomes sao imutaveis e baseados no hash, o navegador pode manter o arquivo em cache por ate um ano. Isso diminui downloads repetidos no mesmo dispositivo.

Esse ajuste vale para **novos uploads**. Ele nao altera automaticamente os metadados dos objetos antigos.

### 5. Limpeza de uploads orfaos

A versao anterior podia deixar arquivos sem registro no banco quando:

- o upload terminava, mas o insert/update falhava;
- um anexo era substituido e o objeto antigo continuava no bucket.

A nova versao tenta remover esses objetos sem referencia. Se a politica do bucket nao permitir DELETE pelo navegador, a aplicacao continua funcionando e o objeto pode ser removido pela funcao administrativa descrita abaixo.

### 6. Menos egress de banco

- O painel agora seleciona apenas as colunas realmente utilizadas.
- A tela de alertas reutiliza os dados ja carregados, em vez de executar uma segunda consulta completa a `locacoes` a cada abertura.

## Arquivos principais alterados

- `js/storage.js`: compactacao, hash, deduplicacao, cache e remocao segura;
- `js/equipamentos.js`: upload otimizado e tratamento de arquivos orfaos;
- `app.html`: usa a mesma copia compactada no OCR e no Storage;
- `js/database.js`: seleciona apenas campos usados;
- `js/alertas.js`: elimina consulta duplicada;
- `js/config.js`: parametros de Storage centralizados;
- `supabase/functions/storage-cleanup/index.ts`: limpeza administrativa em modo seguro.

## Como publicar

Publique todos os arquivos do projeto, incluindo o novo `js/storage.js`. O `index.html` e o `app.html` ja apontam para a versao `6.4.0`, o que ajuda a evitar que o navegador mantenha JavaScript antigo.

No bucket `comprovantes`, configure tambem um limite de arquivo proximo de 6 MB. Isso impede que outro cliente ou uma versao antiga do site envie arquivos muito grandes.

## Limpeza administrativa de objetos orfaos

A funcao `storage-cleanup` usa a service role somente dentro da Edge Function. A chave de service role nunca deve ser colocada em HTML ou JavaScript do navegador.

### Implantacao

Crie um token aleatorio com pelo menos 32 caracteres e salve como segredo:

```bash
supabase secrets set STORAGE_MAINTENANCE_TOKEN="COLOQUE_UM_TOKEN_ALEATORIO_LONGO"
supabase functions deploy storage-cleanup --no-verify-jwt
```

### Simulacao sem apagar

```bash
curl -X POST \
  "https://SEU_PROJECT_REF.supabase.co/functions/v1/storage-cleanup" \
  -H "content-type: application/json" \
  -H "x-maintenance-token: COLOQUE_UM_TOKEN_ALEATORIO_LONGO" \
  -d '{}'
```

A resposta informa quantos objetos existem, quantos estao referenciados e quais parecem orfaos. Nada e removido no modo `dry-run`.

### Exclusao confirmada

Execute somente depois de revisar o `preview`:

```bash
curl -X POST \
  "https://SEU_PROJECT_REF.supabase.co/functions/v1/storage-cleanup" \
  -H "content-type: application/json" \
  -H "x-maintenance-token: COLOQUE_UM_TOKEN_ALEATORIO_LONGO" \
  -d '{"confirm":"DELETE_ORPHANS"}'
```

A funcao remove apenas objetos do bucket `comprovantes` que nao aparecem no campo `locacoes.anexo`.

## Como investigar o egress

No painel do Supabase:

1. Abra **Organization > Usage** e examine o grafico de egress por dia e por servico.
2. Em **Observability**, confira os caminhos mais requisitados.
3. Verifique se os picos coincidem com abertura de PDFs, uso intenso do OCR ou muitas recargas do painel.
4. Evite compartilhar URLs publicas dos contratos fora do sistema.

## Privacidade dos contratos

O codigo atual usa `getPublicUrl`, portanto o bucket precisa estar publico e qualquer pessoa que obtenha a URL pode abrir o documento. Isso melhora o aproveitamento de cache, mas contratos podem conter dados sensiveis.

Para documentos confidenciais, a arquitetura recomendada e:

- autenticar os usuarios;
- tornar o bucket privado;
- guardar o caminho do objeto em vez da URL publica;
- criar URLs assinadas somente quando o usuario autorizado clicar.

Essa mudanca exige revisar Auth e politicas RLS; nao foi aplicada automaticamente para nao interromper o sistema existente.

## Observacao sobre arquivos antigos

A atualizacao reduz o consumo **daqui para frente**. Ela nao reduz retroativamente o egress ja contabilizado no ciclo anterior e nao compacta contratos antigos que continuam referenciados. Para os PDFs antigos muito grandes, substitua cada um por uma copia compactada e depois execute a limpeza administrativa em modo `dry-run`.
