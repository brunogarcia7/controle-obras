# Recuperação do OCR após HTTP 503

As capturas mostram que as solicitações aos dois modelos preferidos do Gemini receberam HTTP 503 com mensagem de alta demanda. A função já estava sendo executada. Uma nova publicação do mesmo código não modifica a capacidade do serviço do Google.

Esta atualização acrescenta tentativas limitadas, alternativas de modelo e um botão para repetir a leitura preservando o documento.

## 1. Atualizar a função no Supabase

1. Abra **Edge Functions → gemini-ocr → Code → index.ts**.
2. Copie TODO o conteúdo atualizado de `docs/gemini-ocr-dashboard.ts`. O arquivo separado `CODIGO_SUPABASE_GEMINI_OCR.txt` entregue no atendimento contém exatamente esse mesmo código.
3. Substitua todo o conteúdo do `index.ts` pelo código completo.
4. Confira o início do arquivo: primeira linha `// @ts-nocheck` e comentário **Recuperação HTTP 503, versão 1** logo abaixo.
5. Clique em **Deploy updates** e aguarde a conclusão.

No editor do Dashboard, esse `index.ts` funciona sozinho. Se existir `core.js` nessa implantação, ele pode permanecer apenas com o comentário abaixo, pois o arquivo completo não o importa:

```js
// Toda a função gemini-ocr está implementada no arquivo index.ts.
```

O código-fonte do repositório continua dividido em `supabase/functions/gemini-ocr/index.ts` e `core.js` para o deploy pelo CLI. `docs/gemini-ocr-dashboard.ts` é a versão completa gerada para colar no Dashboard. Use cada fluxo conforme estas instruções.

O endpoint de verificação da função atualizada passa a incluir:

```json
{
  "ok": true,
  "schemaVersion": 2,
  "recoveryVersion": 1,
  "geminiKeyConfigured": true
}
```

Essa verificação confirma a versão e a presença da chave; não consulta o Gemini.

## 2. Atualizar os arquivos do app no GitHub

Envie os arquivos do novo ZIP aos mesmos caminhos do projeto. Para o novo botão, os arquivos alterados são `app.html`, `js/mobile-app.js` e `css/mobile-app.css`. Mantenha `js/ocr-itens.js` já incluído na atualização anterior.

Depois da publicação, abra o app com **Ctrl + F5** ou em janela anônima. O rodapé passa a mostrar **OCR por item, indenização e nova tentativa**.

Quando uma leitura falha, o botão **Tentar leitura novamente** permite enviar o mesmo arquivo já preparado, sem fotografar ou selecionar outra vez. Essa repetição não cadastra equipamentos nem faz upload no Storage; a gravação dos equipamentos continua dependendo de **Enviar cadastro**.

O texto em inglês e a lista extensa dos erros de cada modelo são substituídos, nas falhas transitórias tratadas, por uma mensagem curta em português. A referência da solicitação é mantida para consulta nos logs.

## Comportamento da recuperação

- Cada modelo preferido recebe uma tentativa inicial e, por padrão, uma repetição após erro transitório HTTP 408, 500, 502, 503 ou 504.
- A espera cresce entre repetições, inclui uma pequena variação aleatória e considera `Retry-After` quando couber no orçamento de tempo. Esperas superiores a oito segundos não são executadas; o fluxo segue para outro candidato.
- Se os preferidos falharem por indisponibilidade ou não forem encontrados, a função consulta o catálogo oficial usando a chave já configurada e tenta até dois modelos Flash ou Flash-Lite estáveis que anunciem suporte a `generateContent` e capacidade de saída suficiente.
- A escolha é feita sobre a lista retornada pela API; nenhum modelo alternativo é tratado como disponível sem essa consulta.
- Rejeição de credenciais e erros de parâmetros não são repetidos como sobrecarga.
- Todas as tentativas compartilham um limite padrão de 60 segundos, abaixo do tempo de espera de 75 segundos do app.
- Se o serviço continuar indisponível, a função termina com HTTP 503, código `GEMINI_BUSY`, e orienta tentar novamente. Os detalhes de cada tentativa permanecem nos logs.
- A lista por equipamento, as quantidades, o aluguel zero, as indenizações e as melhorias anteriores do painel são preservados.

## Configuração opcional

Não é necessário criar novos segredos para ativar a recuperação. Os padrões já estão no código. Se precisar ajustar:

| Segredo | Padrão | Significado |
| --- | --- | --- |
| `GEMINI_MAX_RETRIES` | `1` | Repetições adicionais por modelo, limitado ao intervalo de 0 a 2. |
| `OCR_TOTAL_TIMEOUT_MS` | `60000` | Orçamento total de execução das chamadas ao Gemini, limitado a 65000 ms. |
| `GEMINI_AUTO_DISCOVER` | Ativado | O valor literal `false` desativa a descoberta de modelos alternativos. |

`GEMINI_MODELS` continua definindo os modelos preferidos. As tentativas adicionais podem gerar mais chamadas à API quando há falha; a repetição é limitada pelas contagens e pelo orçamento total.

## Validação

Execute `node --test tests/*.test.mjs` na raiz. Os testes novos simulam falha 503 seguida de sucesso, troca de modelo, descoberta de Flash-Lite, indisponibilidade persistente, `Retry-After`, limite total, credenciais rejeitadas e a repetição da mesma imagem no controlador móvel.

Resultado desta atualização: **50 testes do runner Node.js aprovados, sem falhas**, além das oito verificações internas do módulo original de OCR. A sintaxe dos JavaScripts e do arquivo completo de publicação foi verificada. O TXT corresponde ao código gerado e contém uma única inicialização da função.

Não foi executada uma leitura com a chave real do projeto nem alterado o banco de produção. O tratamento aumenta as chances de recuperação de falhas transitórias; a leitura continua dependendo de algum modelo do Gemini aceitar e concluir a solicitação. A renderização em navegador real não foi validada neste ambiente.

Referências: [estratégia de repetição recomendada pelo Google](https://ai.google.dev/gemini-api/docs/troubleshooting) e [catálogo oficial de modelos](https://ai.google.dev/api/models).
