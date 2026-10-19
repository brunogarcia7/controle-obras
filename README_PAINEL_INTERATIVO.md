# Painel de indicadores: filtro e recolhimento

## Como usar

- Clique em **Contratos vencidos** para abrir a lista de locações com somente os equipamentos vencidos. Clique novamente para retirar esse filtro.
- O card ganha destaque e a legenda **Filtro ativo**. O atalho **Vencidos** acompanha o mesmo estado e continua disponível com os cards ocultos.
- Os filtros de obra, fornecedor e busca continuam funcionando em conjunto. **Limpar filtros** remove todos, inclusive o de vencidos.
- Use **Ocultar indicadores**, acima dos cards, para recolher o painel. O mesmo botão passa a mostrar **Mostrar indicadores** para expandi-lo.
- O painel usa transição de altura (300 ms) e transparência (200 ms), adaptada à altura real dos cards em cada tamanho de tela. A preferência de movimento reduzido do navegador é respeitada.
- A preferência de recolhimento e o filtro são mantidos no navegador ao reabrir a página.
- Os botões funcionam com mouse, Enter e Espaço. O conteúdo recolhido é removido da navegação por teclado e da leitura assistiva até ser expandido.

## Regra de vencimento

No modelo existente, o campo `status` mantém valores como `ativo`, `inativo` e `excluido`; vencimento é calculado pela data.

Um contrato está vencido quando a locação está ativa, não é patrimônio próprio e possui `data_fim` válida anterior à data local de hoje. Equipamentos devolvidos, excluídos, próprios e registros sem data válida ficam fora do filtro. Contratos com vencimento hoje são classificados em próximos do vencimento.

A regra fica centralizada em `Utils.contratoEstaVencido()`, usada pelo filtro, pela etiqueta da tabela e pelo indicador de contratos vencidos. O indicador de vencidos mantém o total geral da base; obra, fornecedor e busca podem reduzir a lista exibida.

## Código alterado

| Arquivo | Alteração |
| --- | --- |
| `index.html` | Card como botão nativo, botão de recolhimento, contêiner animado, atalho Vencidos e atualização dos parâmetros de cache. |
| `css/dashboard.css` | Animação do painel, seta, destaque do filtro e estilo do card como botão. |
| `js/config.js` | Estado inicial `State.filtroVencidos`. |
| `js/app.js` | Eventos de clique, aplicação combinada dos filtros, restauração e limpeza. |
| `js/ui.js` | Controle do painel, acessibilidade, preferência local e atualização visual do filtro. |
| `js/utils.js` | Regra compartilhada de vencimento e identificação de patrimônio próprio. |
| `js/alertas.js` | Indicador e alertas alinhados à mesma regra da tabela. |
| `tests/dashboard-interacoes.test.mjs` | Testes de integração das novas interações e dos casos de vencimento. |

## Aplicação no projeto

Extraia o ZIP e copie os arquivos alterados para os mesmos caminhos da versão em uso. O ponto de entrada continua sendo `index.html`. Atualize a página com **Ctrl + F5**.

## Validação

Execute na raiz do projeto, com Node.js:

```bash
node --test tests/*.test.mjs
```

Os testes novos integram os módulos reais em um DOM simulado, sem acessar o Supabase. Cobrem vencidos, vencimento hoje, datas inválidas, itens devolvidos, exclusões, patrimônio próprio, combinação e limpeza de filtros, renovação, recolhimento, reabertura e persistência.

Resultado da validação: 22 testes do runner Node.js aprovados, sem falhas. O módulo de OCR também executa oito verificações internas. A sintaxe de 14 arquivos/scripts JavaScript foi validada, assim como os IDs dos HTMLs, os controles do painel e as referências a arquivos locais.

Os testes não medem a renderização ou a duração da transição em um navegador real. A conferência visual em navegador ficou pendente porque o Chromium não estava disponível no ambiente de validação.
