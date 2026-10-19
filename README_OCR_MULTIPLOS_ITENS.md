# Cadastro móvel: leitura por linha e indenização

Para falhas HTTP 503 por alta demanda do Gemini, esta versão inclui recuperação automática. Veja também [README_OCR_RECUPERACAO_503.md](README_OCR_RECUPERACAO_503.md).

## Resultado da correção

A versão anterior solicitava ao Gemini apenas o equipamento principal, sua quantidade e o total do documento. O cadastro móvel tinha campos para apenas esse equipamento e fazia uma inserção de uma linha. Isso associava o valor do contrato inteiro ao primeiro item e deixava os demais de fora.

A nova versão solicita todas as linhas e mantém cada equipamento separado até a gravação. Nenhum acessório é descartado por ter locação de R$ 0,00. Descrições e códigos repetidos também permanecem em linhas separadas.

O formulário mostra campos editáveis por item: descrição, quantidade, valor total de locação/compra e valor total de indenização. É possível adicionar ou remover itens manualmente. Fornecedor, obra, contrato, datas e período são compartilhados pelas linhas.

## Publicação obrigatória em duas partes

### 1. Atualizar o GitHub

Extraia o ZIP e envie o conteúdo da pasta do projeto para os mesmos caminhos do repositório, incluindo os novos arquivos. O `index.html` e o `app.html` continuam na raiz.

Os arquivos necessários para o novo cadastro são:

- `app.html`;
- `css/mobile-app.css`;
- `js/mobile-app.js`;
- `js/ocr-itens.js`.

O pacote completo também mantém a atualização anterior do painel de vencidos e do recolhimento dos indicadores.

### 2. Atualizar a função de OCR no Supabase

Enviar a pasta `supabase` ao GitHub não publica a função automaticamente na configuração atual do projeto. A função `gemini-ocr` precisa receber o código novo para retornar todos os itens e as indenizações.

Pelo navegador:

1. Entre no projeto do Supabase usado pelo app.
2. Abra **Edge Functions → gemini-ocr → Code**.
3. No ZIP extraído, abra `docs/gemini-ocr-dashboard.ts` em um editor de texto.
4. Copie TODO o conteúdo desse arquivo e substitua o conteúdo do `index.ts` da função no editor do Supabase. Esse arquivo é completo e dispensa criar o `core.js` no editor.
5. Clique em **Deploy updates** e aguarde a conclusão.
6. Mantenha os segredos e as configurações de autenticação que já estão em uso pela função.

Alternativa com o Supabase CLI, na pasta raiz do projeto:

```bash
npx supabase login
npx supabase functions deploy gemini-ocr --project-ref aidlesbrbwfxpziivkgw --no-verify-jwt
```

O deploy via CLI usa `supabase/functions/gemini-ocr/index.ts` e `core.js`. O arquivo de colar no Dashboard foi gerado a partir desses mesmos arquivos. Para regenerá-lo após futuras alterações:

```bash
node scripts/gerar-ocr-dashboard.mjs
```

Depois das duas publicações, abra `app.html` com **Ctrl + F5** ou em uma janela anônima. O rodapé deve mostrar **OCR por item e indenização**. A resposta da função atualizada inclui `_meta.schemaVersion: 2` e `_meta.itemCount`.

## Conferência do contrato 012004/A enviado

Valores de referência transcritos da imagem, usados como caso de teste; não são o resultado de uma nova chamada real ao Gemini:

| Código | Equipamento | Quantidade | Locação total da linha | Indenização total da linha |
| --- | --- | ---: | ---: | ---: |
| 78 | Andaime tubular (1,00 m × 1,00 m) | 4 | R$ 100,00 | R$ 1.060,00 |
| 51 | Trava diagonal 1,45 m | 1 | R$ 0,00 | R$ 108,00 |
| 52 | Piso metálico (0,33 m × 1,00 m) para andaime 1,00 m | 3 | R$ 45,00 | R$ 855,00 |
| 154 | Rodízio giratório 6″ poliuretano com trava | 4 | R$ 60,00 | R$ 980,00 |
| 54 | Guarda-corpo simples para andaime 1,00 m | 4 | R$ 60,00 | R$ 580,00 |
| **Total: 5 linhas** | | **16** | **R$ 265,00** | **R$ 3.583,00** |

As datas do contrato são 08/09/2026 a 08/10/2026, com período mensal.

O campo `valor_indenizacao` guarda o total da linha para a quantidade cadastrada. Por exemplo, os quatro andaimes têm R$ 1.060,00 de indenização no total, equivalentes a R$ 265,00 por unidade. O formulário não multiplica novamente um total já informado.

## Conferências e gravação

- A tela exibe a quantidade de linhas, a soma das unidades e os totais financeiros.
- Diferenças entre a contagem de linhas ou os totais impressos e os itens retornados geram avisos. Valores ilegíveis ficam em branco para revisão; zero explícito é preservado.
- Uma resposta interrompida pelo limite de tokens é rejeitada como leitura incompleta.
- Uma resposta no formato antigo de item único continua utilizável, com aviso para conferir e adicionar as linhas faltantes.
- Todas as linhas são validadas antes de qualquer upload ou gravação. Valores de aluguel em branco não viram zero automaticamente; itens gratuitos devem ter zero explícito.
- O anexo é enviado uma vez. Todos os equipamentos recebem o mesmo contrato e link do documento, em uma única inserção de múltiplas linhas.
- Uma falha de gravação mantém os campos para correção ou nova tentativa. O botão permanece bloqueado durante o envio para evitar acionamentos simultâneos.
- A coluna `valor_indenizacao` já era utilizada no painel administrativo; esta atualização passa a preenchê-la também pelo cadastro móvel.

## Testes e limites de validação

Na raiz do projeto:

```bash
node --test tests/*.test.mjs
```

Foram testados o endpoint de OCR com a API do Gemini simulada, o tratamento do contrato de referência, a separação e a preservação das linhas, os valores zero, as indenizações, os totais, a compatibilidade antiga e os controladores do formulário com DOM simulado. Os testes do painel, fornecedores e armazenamento também são mantidos.

Resultado: **39 testes do runner Node.js aprovados, sem falhas**, além das oito verificações internas do módulo de OCR original. Também foram verificadas a sintaxe de 15 arquivos/scripts JavaScript, a correspondência do arquivo de publicação com o código-fonte, os IDs, os rótulos e as referências locais dos HTMLs.

Não foi feita uma nova chamada real do contrato ao Gemini, nem uma gravação no banco de produção. O teste final com a imagem deve ser realizado após publicar as duas partes. A renderização em navegador real também não foi validada neste ambiente.

Referências de publicação: [editor de Edge Functions do Supabase](https://supabase.com/docs/guides/functions/quickstart-dashboard) e [deploy pelo CLI](https://supabase.com/docs/guides/functions/deploy).
