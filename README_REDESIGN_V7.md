# ControleObras — Interface Profissional v7.0.0

Esta versão moderniza completamente o painel administrativo e o cadastro móvel sem alterar as regras de negócio, o modelo de dados ou a integração existente com o Supabase.

## Principais melhorias

### Painel administrativo

- Nova identidade visual com navegação lateral profissional, marca própria e hierarquia mais clara.
- Cabeçalho operacional com estado real da conexão: carregando, sincronizado ou indisponível.
- Filtros e ações reorganizados para reduzir ruído visual e agilizar o uso diário.
- Indicadores em cartões com cores semânticas, ícones vetoriais e informações auxiliares.
- Prazo do indicador “Contratos a vencer” alinhado à regra atual do sistema: próximos 7 dias.
- Tabelas redesenhadas para melhorar leitura, comparação e reconhecimento das ações.
- Tela de fornecedores preservada, incluindo edição e mesclagem.
- Modais de cadastro, edição, confirmação, fornecedores, colunas e responsáveis modernizados.
- Menu lateral recolhível no computador, com preferência salva no navegador.
- Menu lateral em formato off-canvas para celular e tablet.
- Tema escuro revisado em toda a aplicação.
- Navegação por teclado em elementos interativos e fechamento de menu/modal com `Esc`.
- Melhor comportamento em telas pequenas para KPIs, filtros, botões, tabelas e modais.

### Cadastro móvel

- Fluxo visual dividido em documento e revisão dos dados.
- Área de câmera e seleção de arquivo mais clara e adequada para toque.
- Campos, mensagens, estados de leitura e botão de envio redesenhados.
- Cabeçalho de marca e indicador real de conectividade/envio.
- Melhor aproveitamento de largura em celulares pequenos e telas maiores.
- IDs e rotinas de OCR, compactação, deduplicação e upload preservados.

## Compatibilidade da atualização

A atualização foi implementada como uma camada visual e de experiência sobre o sistema existente. Não há:

- criação ou alteração de tabelas;
- alteração de colunas do Supabase;
- mudança nas políticas de acesso;
- troca de bucket;
- migração de dados;
- alteração das credenciais configuradas;
- remoção das correções de armazenamento, OCR ou fornecedores.

Os IDs usados pelos JavaScripts foram comparados entre a versão anterior e a v7.0.0. Nenhum ID funcional do `index.html` ou do `app.html` foi removido.

## Arquivos visuais novos

```text
assets/controle-obras-mark.svg
css/dashboard.css
css/mobile-app.css
docs/dashboard-preview.png
docs/dashboard-collapsed-preview.png
docs/dashboard-mobile-preview.png
docs/dark-mode-preview.png
docs/mobile-preview.png
docs/modal-preview.png
```

O CSS profissional é carregado depois dos estilos anteriores. Assim, a apresentação moderna substitui visualmente a camada antiga sem exigir reescrita das rotinas do sistema.

## Publicação no GitHub Pages

1. Gere um backup da versão atualmente publicada.
2. Extraia o pacote da v7.0.0.
3. Copie **todo o conteúdo da pasta `controle-obras-v7.0.0-profissional`** para a raiz do repositório, onde está o `index.html`.
4. Confirme que as pastas `css`, `assets`, `js` e `supabase` também foram enviadas.
5. Faça commit e push para o GitHub.
6. Aguarde a atualização do GitHub Pages.
7. Abra o sistema e pressione `Ctrl + F5` para ignorar o cache antigo.
8. Confirme no cabeçalho a identificação **Versão 7.0.0**.

O endereço do cadastro móvel continua sendo:

```text
/app.html
```

## Validação executada

- Sintaxe de todos os módulos JavaScript verificada com Node.js.
- Sintaxe dos scripts inline de `index.html` e `app.html` validada.
- 11 testes do runner Node.js aprovados, sem falhas.
- O teste de OCR contém 8 verificações internas aprovadas.
- Nenhum ID duplicado encontrado nos dois HTMLs.
- Nenhum ID funcional removido em comparação com a versão anterior.
- Referências locais de CSS, JavaScript, favicon e imagens verificadas.
- Smoke test no navegador aprovado para painel desktop, painel responsivo e cadastro móvel.
- Interações verificadas: troca de tela, modal, tema, recolhimento da barra lateral e menu móvel.
- Ausência de rolagem horizontal indevida verificada nos tamanhos testados.

Os testes de navegador usaram um Supabase simulado e dados demonstrativos. Nenhum dado real foi gravado ou alterado.

## Pré-visualizações

- `docs/dashboard-preview.png`: painel principal em desktop.
- `docs/dashboard-collapsed-preview.png`: menu lateral recolhido.
- `docs/dashboard-mobile-preview.png`: painel administrativo em tela pequena.
- `docs/dark-mode-preview.png`: tema escuro.
- `docs/modal-preview.png`: modal de novo cadastro.
- `docs/mobile-preview.png`: cadastro móvel.

## Reversão

Como não existe migração de banco, a reversão é simples: restaure os arquivos da versão anterior no repositório e publique novamente. Os dados permanecem no mesmo Supabase.
