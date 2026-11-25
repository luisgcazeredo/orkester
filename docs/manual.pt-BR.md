# Manual de uso do Orkester

[English](manual.md) · Português

[//]: # "Manual conferido no código da 1.9.6 (base 0278334 + A2 Configurações + Fluxos), em 23/11/2026, e atualizado com as entregas da 1.9.7 (API e MCP nas páginas, servidores MCP de fora, Kanban em pastas, D1 a D6) em 24/11/2026. Cada seção cita de onde saiu, num comentário como este, invisível no GitHub e no Leitor do app. Comentário HTML apareceria como texto no Leitor, por isso esta forma. Caminhos relativos a app/src/."

Este manual é para quem nunca viu o Orkester. Ele explica cada página, botão, menu e atalho, na ordem em que você
vai encontrá-los. As referências técnicas ficam em outros arquivos: o comando dos agentes em
[`ork.pt-BR.md`](ork.pt-BR.md), o servidor MCP em [`mcp.pt-BR.md`](mcp.pt-BR.md), o guia para montar fluxos em
[`fluxos.pt-BR.md`](fluxos.pt-BR.md) e o guia para construir páginas próprias em [`paginas.pt-BR.md`](paginas.pt-BR.md).

## Índice

1. [O que é](#o-que-é)
2. [Primeiros passos](#primeiros-passos)
3. [A janela](#a-janela)
4. [O Quadro](#o-quadro)
5. [Cartões de agente](#cartões-de-agente)
6. [Os outros cartões](#os-outros-cartões)
7. [Cordas, bandas e partituras](#cordas-bandas-e-partituras)
8. [Visor de código e árvores de código](#visor-de-código-e-árvores-de-código)
9. [Andares](#andares)
10. [Espaços e janelas](#espaços-e-janelas)
11. [Página Leitor de Markdown](#página-leitor-de-markdown)
12. [Página Rotinas](#página-rotinas)
13. [Página Agentes: funções, presets, modelo e esforço](#página-agentes)
14. [Página Kanban](#página-kanban)
15. [Página Fluxos](#página-fluxos)
16. [Configurações: geral, aparência, conexões e atalhos](#configurações)
17. [Páginas próprias ("+")](#páginas-próprias-)
18. [O time e o comando `ork`](#o-time-e-o-comando-ork)
19. [Ligar o seu Claude de fora (MCP)](#ligar-o-seu-claude-de-fora-mcp)
20. [Onde ficam os dados](#onde-ficam-os-dados)
21. [Dicas e problemas comuns](#dicas-e-problemas-comuns)

## O que é

O Orkester é um quadro infinito em que cada terminal vira um cartão. Claude Code, Codex e PowerShell rodam de
verdade dentro dos cartões, ao lado de post-its, arquivos, navegador e desenhos. Três ideias seguram o resto:

- **O quadro é o estado.** Posição, nome, grupo e ligação decidem quem alcança quem. Arrastar um agente para dentro
  de uma banda é colocá-lo no time.
- **A corda é a permissão.** Um agente só conversa com quem está ligado a ele por uma corda (ou na mesma banda).
- **O agente tem mão.** Dentro de qualquer terminal do quadro existe o comando `ork`: com ele o agente abre outros
  agentes, delega, lê a tela de quem está ligado a ele e organiza o quadro.

Precisa de Windows 11 x64. O Orkester não traz o Claude Code nem o Codex: instale-os à parte, com as suas contas.
Sem eles, os cartões de PowerShell funcionam igual.

## Primeiros passos

[//]: # "ui/ListaDeEspacos.tsx:22-39, ui/BarraFerramentas.tsx:119-259, quadro/Quadro.tsx:171-179"

1. **Instale e abra.** O instalador não é assinado: o Windows mostra "O Windows protegeu o computador". Clique em
   **Mais informações → Executar assim mesmo**.
2. **Crie um espaço de trabalho.** Na lista da esquerda, botão **Novo espaço de trabalho**. Dê um nome e escolha a
   **Pasta do projeto (onde os terminais abrem)** com **Escolher pasta…** → **Criar**. Um espaço é um quadro ligado
   a uma pasta.
3. **Abra um agente.** Na barra de ferramentas do topo, clique em **Terminal** e escolha **Claude Code**, **Codex**
   ou **PowerShell**. O cartão nasce no centro da tela, já rodando na pasta do espaço.
4. **Fale com ele.** Clique no cartão para selecioná-lo sozinho: o teclado passa a ir para o terminal. Escreva
   como escreveria no terminal de sempre.
5. **Abra um segundo agente e ligue os dois.** Passe o mouse num cartão de agente: aparecem duas bolinhas nas
   laterais ("Arraste até outro terminal para ligar"). Arraste de uma delas até o outro cartão. A linha que fica é
   a **corda**: agora os dois podem conversar com `ork pedir`, `ork ver` e `ork entregar`.
6. **Deixe o agente montar o time.** Peça ao primeiro: "abra um Codex para revisar o que você fizer". Ele usa
   `ork abrir codex …` e o cartão novo nasce ao lado, já ligado.
7. **Explore.** Aperte **?** no quadro para ver a folha de atalhos, e **Ctrl+K** para buscar qualquer cartão,
   andar, espaço ou comando.

## A janela

[//]: # "casca/Casca.tsx:201-209, casca/BarraPaginas.tsx, paginas/configuracoes/abrir.ts, App.tsx:39-55"

- **Barra de páginas** (trilho de ícones, à esquerda de tudo). De cima para baixo: **Quadro**, **Leitor de
  Markdown**, **Rotinas**, **Agentes**, **Kanban**, **Fluxos**; depois um traço e as suas páginas
  próprias ("Nome (página extra)"); depois o **+** (páginas próprias); e, no pé, a **engrenagem**, que abre as
  [Configurações](#configurações) (geral, aparência, conexões e atalhos). A página em tela fica marcada. Passe o
  mouse para ver o nome.
- **Lista de espaços** (à direita da barra de páginas). Só aparece na página Quadro; esconda ou mostre pelo botão
  "Mostrar ou esconder os espaços", no canto superior esquerdo do quadro.
- **O conteúdo da página.** O Quadro continua vivo quando você vai a outra página: os terminais não caem.
- **Título da janela**: "‹espaço› — Orkester ‹versão›".

Os atalhos de cada página só valem com ela em tela. Não há atalho de teclado para trocar de página: use a barra ou
a paleta (Ctrl+K), que tem "Rotinas (página)", "Kanban (página)", "Fluxos (página)", "Agentes (página)", "Funções (página Agentes)", "Presets (página
Agentes)", "Partituras (página Agentes)", "Configurações", "Geral (Configurações)", "Aparência: temas e cor de
destaque (Configurações)", "Conexões (Configurações)" e "Atalhos (Configurações)".

## O Quadro

### Barra de ferramentas (topo, no centro)

[//]: # "ui/BarraFerramentas.tsx:119-285, ui/menus.ts:322-334, estado/coresDeDados.ts"

| Botão | O que faz |
|---|---|
| **Selecionar (V)** | a ferramenta normal: clicar, selecionar, arrastar |
| **Terminal** | abre o menu do terminal (abaixo) |
| **Post-it (N)** | o próximo clique no vazio cria um post-it |
| **Anexar arquivo** | escolhe um arquivo do disco e põe um cartão dele no centro da tela |
| **Árvore de arquivos de uma pasta** | escolhe uma pasta e põe um cartão com a árvore dela |
| **Portal: navegador no quadro** | cria um navegador embutido, aberto no Google |
| **Texto (T)** | o próximo clique no vazio cria um texto solto |
| **Desenhar (D)** | lápis, retângulo, seta e borracha, com 7 cores |

Clicar de novo numa ferramenta ativa volta para Selecionar, e depois de criar um cartão a ferramenta volta sozinha.

**Menu do terminal:**

- **Agentes**: um botão por preset (de fábrica: Claude Code, Codex, PowerShell). Cria o terminal no centro da tela.
- **Funções**: um botão por função (papel salvo com prompt). O agente nasce com o nome da função e recebe o prompt
  dela como primeiro pedido. Com mais de 8 funções aparece "Filtrar funções…" (Enter abre a primeira).
- **Times**: as partituras (times salvos). Clicar sobe o time inteiro.
- No pé: **Editar presets…**, **Editar funções…** e **Partituras…** (abrem a página Agentes na aba certa).

**Barra de desenho** (com Desenhar ligado): **Lápis**, **Retângulo**, **Seta**, **Borracha** (E: passe por cima
dos traços para apagar) e as cores. Clicar num traço com Selecionar o seleciona; arrastar o move.

### Cantos da tela

[//]: # "ui/Controles.tsx:50-213, ui/Andares.tsx:262-301"

- **Superior esquerdo**: "Mostrar ou esconder os espaços"; fora do térreo, o indicador do andar (clique volta ao
  térreo).
- **Superior direito**: **Arquivos e pastas (Ctrl+Shift+E)** abre o explorador da direita; **Ver tudo** enquadra
  todo o conteúdo; **Tema claro / Tema escuro** troca a base do tema.
- **Inferior direito**: a pílula **Andares**; **Mini-mapa**; **Contexto dos terminais**; e o zoom
  (**Diminuir (Ctrl -)**, o valor em %, que volta a 100% ao clicar, e **Aumentar (Ctrl +)**).

**Mini-mapa**: uma miniatura de 200×130 com um retângulo por cartão e a área visível. Clique num ponto para levar a
tela até lá (arrastar dentro dele não move).

**Contexto dos terminais**: lista os terminais do espaço com a situação (livre, trabalhando, pergunta,
encerrado), o contexto que ainda resta em % e uma barra. Atualiza a cada 5 s; clicar num terminal leva até ele. "—"
quando o cliente não deixa ler o contexto (o Codex não expõe).

**Explorador da direita** ("Arquivos"): a pasta do espaço (ou do andar) fica sempre fixa; **Abrir uma pasta aqui**
acrescenta outras, cada uma com **Atualizar** e **Tirar do explorador** (a pasta no disco não é tocada). Botão
direito num arquivo: **Ver o código no quadro**, **Abrir no programa do sistema**, **Pôr o arquivo no quadro**,
**Anexar ao prompt de** ‹terminal›, **Mostrar no Explorer**. Numa pasta: **Pôr a árvore no quadro**, **Anexar ao
prompt de**, **Mostrar no Explorer**.

### Barra de seleção

[//]: # "ui/BarraSelecao.tsx:30-87"

Uma pílula flutua em cima do que está selecionado: **Cor**, **Duplicar (Ctrl+D)**, **Agrupar (Ctrl+G)** (vários
itens), **Desagrupar (Ctrl+Shift+G)** (um grupo), **Tirar do grupo** (um item de grupo), **Travar (não move nem
apaga)** / **Destravar**, **Apagar (Delete)** e **Mais opções** (o mesmo menu do botão direito). Com vários itens,
mostra quantos.

Um cartão **travado** mostra um cadeado: não se move, não muda de tamanho e não é apagado, mas continua usável.

### Mouse

[//]: # "quadro/Quadro.tsx:112-310, quadro/MolduraNo.tsx:41-80, quadro/arrasto.ts, estado/selecao.ts:100-161"

| Gesto | Faz |
|---|---|
| Arrastar no vazio, botão do meio, ou **Espaço** + arrastar | move a visão |
| Roda | rola o quadro |
| **Ctrl** + roda, ou pinça no touchpad | zoom no ponto do mouse (10% a 200%) |
| **Shift** + arrastar no vazio | retângulo de seleção (soma à seleção) |
| **Shift** ou **Ctrl** + clique | põe ou tira da seleção |
| Arrastar um cartão | move toda a seleção; perto da borda, a tela anda junto |
| **Alt** ao arrastar | solta o ímã das guias (que gruda em bordas e centros) |
| Esc no meio do arrasto | devolve tudo ao lugar |
| Alça no canto do cartão selecionado | muda o tamanho (imagem não deforma) |
| Clique num item de grupo | seleciona o grupo; clique de novo pega só o item |
| Clique duplo em post-it ou texto | edita |
| Botão direito | menu do que está embaixo do mouse |

### Teclado

[//]: # "quadro/atalhos.ts:64-109, ui/Atalhos.tsx:20-61"

Os atalhos não valem quando você digita num campo, com menu ou diálogo aberto, ou com **um terminal selecionado
sozinho** (aí a tecla é do terminal).

| Tecla | Faz |
|---|---|
| **V** / **N** / **T** / **D** / **E** | Selecionar / Post-it / Texto / Desenhar / Borracha |
| **Esc** | cancela o gesto, tira a seleção, sai da edição, fecha uma camada aberta, volta a Selecionar |
| **Ctrl+Z** / **Ctrl+Y** ou **Ctrl+Shift+Z** | desfaz / refaz (cada andar tem o seu) |
| **Ctrl+C** / **Ctrl+X** / **Ctrl+V** | copia, recorta, cola (também entre espaços e janelas) |
| **Ctrl+D** | duplica (40 px ao lado; terminal duplicado ganha " (cópia)" e conversa nova) |
| **Ctrl+A** | seleciona tudo |
| **Ctrl+G** / **Ctrl+Shift+G** | agrupa / desagrupa |
| Setas (**Shift**: 10 px) | empurra a seleção 1 px |
| **Delete** ou **Backspace** | apaga |
| **Ctrl+=** / **Ctrl+-** / **Ctrl+0** | zoom mais / menos / 100% |
| **Ctrl+1** | ver tudo |
| **Ctrl+K** | paleta: busca cartão, andar, espaço, fluxo ou comando (em qualquer página) |
| **Ctrl+Shift+N** | nova janela (outro espaço ao mesmo tempo) |
| **Ctrl+Shift+E** | mostra ou esconde o explorador da direita |
| **?** | a folha de atalhos |

**Colar** usa a área de transferência do sistema: cartões copiados voltam como cartões; um print vira cartão de
imagem; texto curto (uma linha, até 60 caracteres) vira texto solto; texto maior vira post-it. **Copiar** cartões e
colar fora do app dá texto simples (nome do terminal, conteúdo do post-it, caminho do arquivo, endereço do portal).

### Paleta de comandos (Ctrl+K)

[//]: # "ui/Paleta.tsx:74-271"

"Buscar cartão, andar, espaço ou comando…". Abre com **Ctrl+K** em qualquer página. Setas escolhem, Enter roda, Esc fecha. A busca ignora acentos. Lista:

- **Comandos**: novo terminal por preset, novo post-it, texto, portal, anexar arquivo, árvore de pasta, colar, novo
  andar, nova janela, ver tudo, selecionar tudo, mostrar/esconder o mini-mapa, tema claro/escuro, atalhos e as
  páginas.
- **Cartões** do andar à mostra (escolher leva a tela até ele e o seleciona).
- **Andares** e **Espaços** (um aberto em outra janela diz "outra janela").
- **Fluxos** do espaço aberto, pelo nome, com "ligado" ou "desligado" ao lado; escolher um o abre no editor.

### Menus do botão direito

[//]: # "ui/menus.ts:126-690"

**No fundo do quadro**: Novo terminal ▸ (presets), Post-it, Texto, Anexar arquivo…, Árvore de uma pasta…, Portal
(navegador), Banda (grupo de agentes)…, Colar aqui, Andares ▸ (Novo andar…, Térreo, cada andar), Selecionar tudo,
Ver tudo, Mini-mapa, Tema claro/escuro, Atalhos do teclado.

**Em todo cartão** (no fim do menu): Cor ▸, Copiar, Recortar, Duplicar, Tirar do grupo, Trazer para frente, Enviar
para trás, Travar/Destravar, Apagar. Cores de cartão: Sem cor, Azul, Roxo, Rosa, Vermelho, Laranja, Amarelo, Verde,
Cinza. Post-it: Amarelo, Rosa, Azul, Verde, Roxo.

**Com vários itens selecionados**: Cor, Copiar, Recortar, Duplicar; com agente na seleção, **Salvar como
partitura…** e **Juntar numa banda…**; Agrupar/Desagrupar, Desfazer os grupos; **Alinhar** ▸ (à esquerda, ao
centro, à direita, em cima, no meio, embaixo; distribuir na horizontal e na vertical, com 3 ou mais); Trazer para
frente, Enviar para trás, Travar; Apagar N itens.

**Numa corda**: Apagar ligação. **Num desenho**: Cor, Duplicar, Tirar do grupo, Apagar desenho.

Os menus de agente, banda, código, andar e espaço estão nas seções de cada um.

## Cartões de agente

[//]: # "nos/PecaTerminal.tsx:16-167, terminal/CorpoXterm.tsx:18-177, estado/caixas.ts:42-49, estado/nos.ts:37-114, ui/menus.ts:532-556"

### Abrir

Pelo botão **Terminal** (preset, função ou time), pelo menu do fundo **Novo terminal**, ou pela paleta. Também um
agente abre outro com `ork abrir`. O cartão nasce com 800×500, com o nome do preset ou da função (repetido no
andar ganha " 2", " 3"…). Uma função digita o prompt dela como primeiro pedido assim que o agente fica pronto. O
Claude ganha um id de conversa ao nascer, e o Codex tem a dele descoberta depois: ao reabrir o app, a conversa é
retomada.

### Cabeçalho

Da esquerda para a direita:

- o ícone do motor (Claude, Codex ou shell) e o **nome**;
- o **número** do terminal no andar;
- **modelo · esforço** (ex.: `opus · xhigh`); quando nenhum foi escolhido, aparece `padrão` em tom suave, ex.: `opus · padrão`;
- selo **agente**: este cartão foi aberto por um agente pelo `ork`;
- selo **#N**: a tarefa do Kanban em que ele está trabalhando (clique abre no Kanban);
- selo **⚠ pedido?**: o primeiro pedido pode não ter saído (o texto diz o caso: escrito e não enviado, não deu para
  confirmar, o agente não ficou pronto…). Veja a tela antes de repetir; clicar dispensa o aviso;
- selo de **envelope com número**: a **caixa de entrada**, recados de outros agentes esperando para entrar. O
  Orkester digita um de cada vez, só quando o agente está livre e você não está escrevendo nele. O tooltip diz o
  motivo da espera: "ele está trabalhando", "ele está numa pergunta", "você está escrevendo aqui", "há texto seu no
  campo, ainda não enviado", "o processo está encerrado"… Se você já limpou o campo e o selo insiste (fica
  vermelho), clique nele para liberar.

O cabeçalho não mostra a situação (livre, trabalhando…). Ela aparece no painel **Contexto dos terminais** (canto
inferior direito) e na página **Agentes**.

### O terminal

- **Para digitar, selecione o cartão sozinho** (um clique). Antes disso, o cartão se arrasta de qualquer ponto e a
  roda move o quadro.
- **Rolagem**: com o cartão ativo, a roda rola o histórico (5000 linhas).
- **Copiar**: **Ctrl+C** copia quando há texto selecionado (sem seleção, vai para o programa, como interromper);
  **Ctrl+Shift+C** só copia. **Ctrl+V** cola.
- **Zoom**: o terminal acompanha o zoom do quadro (nítido até 200%). Não há zoom só do terminal.
- **Fora da tela** há mais de 20 s: o cartão para de desenhar e mostra "fora da tela · o processo continua".
- **Processo terminou**: "Processo encerrado (código N)." com **Abrir de novo**.
- **Zerar o contexto**: não há botão; um agente faz isso com `ork limpar <nome>` (`/clear` no Claude, `/new` no
  Codex), ou você digita o comando do próprio cliente no terminal.

### Rodapé

- a **pasta** em que o terminal roda (caminho completo no tooltip);
- **clipe** "Anexar arquivo ou pasta ao prompt": escolhe um arquivo ou pasta e **escreve o caminho** na linha do
  agente (o arquivo não é enviado; o agente lê do disco);
- **código**: os cartões de código deste agente (abrir, recolher todos, fechar todos). Veja
  [Visor de código](#visor-de-código-e-árvores-de-código).

Arrastar um arquivo do Windows para o quadro não funciona; use o clipe, **Anexar arquivo** ou o explorador.

### Menu do cartão de agente

**Renomear…**, **Código que ele escreve** ▸, **Trocar o agente** ▸ (outro preset no mesmo lugar, com o mesmo nome,
cordas e árvore; a função é entregue de novo), **Rotinas…** (abre Rotinas com este cartão escolhido), **Ver tarefas
dele** (Kanban filtrado; não aparece em shell), **Salvar como partitura…**, **Anexar ao prompt** ▸ (Arquivo…,
Pasta…), e os itens comuns.

### Fechar

**Delete**, **Apagar** no menu ou a lixeira da barra de seleção. Apagar o cartão encerra o processo. **Ctrl+Z**
traz o cartão de volta, e o terminal abre de novo.

### Funções, presets, modelo e esforço

- **Preset**: o que aparece no botão Terminal. Nome, motor e o comando digitado no PowerShell quando o terminal abre.
- **Função**: um papel escrito uma vez. Nome, prompt (vai como primeiro pedido), pasta opcional, modelo e esforço.
- **Modelo e esforço**: escolhidos nos presets e nas funções (a função vence o preset), na página Agentes. Não se
  escolhem pelo cartão. Esforços: `low`, `medium`, `high`, `xhigh`, `max` e `ultra` (o `ultra` só no Codex).
  Modelos sugeridos: Claude `fable`, `opus`, `sonnet`, `haiku`; Codex `gpt-5.6-terra`, `gpt-5.6-luna`. Um agente
  troca o modelo de um cartão livre que ele abriu com `ork modelo <cartão> <modelo> --esforco <nível>` (a conversa
  continua); você, pelo MCP (`trocar_modelo`).

Detalhes em [Página Agentes](#página-agentes).

## Os outros cartões

[//]: # "nos/PostIt.tsx, nos/Texto.tsx, nos/Arquivo.tsx, nos/Imagem.tsx, nos/ArvorePasta.tsx, nos/Portal.tsx, nos/PortalChrome.tsx, ui/menus.ts:559-591, main/dados.ts:97-270"

| Cartão | Como cria | O que faz |
|---|---|---|
| **Post-it** | **N** e clique no vazio; menu do fundo; colar texto longo | Markdown simples: títulos `#`, listas `- `, tarefas `- [ ]` com caixa clicável. Clique duplo edita; Esc ou clique fora sai. Cada post-it é um arquivo `.md` em `~/.orkester/espacos/<id>/notas/`, legível fora do app |
| **Texto** | **T** e clique no vazio; colar texto curto | Texto solto que cresce com o conteúdo. Menu: **Tamanho** (Pequeno, Médio, Grande, Enorme), **Letra monoespaçada**; a cor é a da letra. Vazio ao sair = apagado |
| **Arquivo** | **Anexar arquivo**; "Pôr o arquivo no quadro" no explorador | Ícone pela extensão e o nome. Clique duplo abre no programa do sistema. Menu: **Abrir**, **Mostrar no Explorer** |
| **Imagem** | colar um print (Ctrl+V) | Até 640×480 ao entrar. Fica em `~/.orkester/espacos/<id>/imagens/` |
| **Árvore de pasta** | **Árvore de arquivos de uma pasta**; menu do fundo; explorador | A árvore da pasta, com **Atualizar**. Clique abre pastas; clique duplo abre o arquivo no programa do sistema |
| **Portal** | **Portal: navegador no quadro**; menu do fundo; paleta | Um navegador dentro do cartão (veja abaixo) |
| **Desenho** | **D** | Lápis, retângulo e seta; **E** apaga |
| **Banda** | menu do fundo ou "Juntar numa banda…" | Um time (veja [Bandas](#bandas)) |
| **Código** | sozinho, quando o agente grava; "Ver o código no quadro" | Veja [Visor de código](#visor-de-código-e-árvores-de-código) |

### Portal (navegador no quadro)

[//]: # "nos/PortalChrome.tsx:28-314, nos/Portal.tsx:57-128, nos/endereco.ts, main/navegador.ts:9"

- Se o PC tem Chrome, o portal usa um Chrome do próprio app; senão, um navegador embutido de reserva.
- Barra: **Voltar**, **Avançar**, **Recarregar**, o endereço (Enter navega; texto com espaço vira busca no Google),
  **Abrir esta aba na janela do Chrome** (para entrar com passkey ou usar extensão; depois, **Trazer a página de
  volta para o quadro**) e **Abrir no seu navegador de sempre**.
- Sem estar selecionado, o cartão mostra "Clique para usar a página". Selecionado sozinho, mouse, roda e teclado vão
  para a página (Ctrl+roda continua sendo zoom do quadro; Ctrl+A/C/X/V/Z/Y editam na página).
- Diálogos do site viram janelas do app ("A página diz", "A página pergunta", "Sair da página?"); um pop-up do site
  vira outro cartão de portal ao lado.
- Os logins ficam num perfil próprio, separado do seu navegador (`~/.orkester/navegador`). Para apagar: Configurações
  › Conexões, aba **Portais**, **Limpar login**.

## Cordas, bandas e partituras

### Cordas

[//]: # "estado/cordas.ts:10-22, quadro/Camadas.tsx:128-153, ui/menus.ts:666-668"

- **Desenhar**: arraste de uma **porta** (a bolinha na lateral do agente, ou a de baixo de uma banda) até outro
  agente ou banda.
- **O que significa**: os dois agentes podem conversar pelo `ork` (pedir, ver a tela, entregar). Corda ligada a uma
  banda vale para cada agente de dentro dela.
- **Sem direção**: ligar A→B ou B→A é a mesma corda. Não liga um cartão nele mesmo nem repete.
- **Apagar**: clique na corda e **Delete**, ou botão direito → **Apagar ligação**. Apagar um dos cartões leva a corda.
- Agentes abertos por outro agente no mesmo espaço já nascem ligados a quem os abriu.
- As linhas finas que saem de um agente até os visores de código **não** são cordas.

### Bandas

[//]: # "shared/quadro/bandas.ts:1-134, nos/Banda.tsx:10-25, ui/menus.ts:433-437, 492-496, 597-615"

Uma banda é uma moldura tracejada com nome: **todo agente cujo centro está dentro dela fala com todos os outros de
dentro**. Arrastar um agente para dentro ou para fora muda o time.

- **Criar**: menu do fundo → **Banda (grupo de agentes)…** (moldura vazia), ou selecione agentes → **Juntar numa
  banda…** (moldura em volta deles). Diálogo "Nova banda", campo "Nome do time".
- A barra de título mostra "N agentes · todos se falam" ou "vazia: arraste agentes para dentro". Arrastar a moldura
  leva o time junto. A porta de baixo liga a banda inteira a um agente de fora.
- Menu: **Renomear a banda…**, a lista "No time: …" e **Ver o time todo**. Máximo de 24 agentes; o nome não repete
  no andar.

### Partituras (times salvos)

[//]: # "shared/quadro/partituras.ts:8-89, ui/Partituras.tsx, paginas/agentes/Agentes.tsx:260-323, estado/espacos.ts:226-261"

Uma partitura guarda um time inteiro: agentes (nome, motor, comando, função, modelo, esforço), textos, post-its,
bandas, cordas e grupos. **A pasta não é salva**: cada agente abre na pasta do espaço onde o time sobe (ou na da
função). Cartões de código, de pasta e portais não entram.

- **Salvar**: selecione os cartões → botão direito → **Salvar como partitura…** → "Nome do time". O mesmo nome
  substitui a anterior.
- **Subir**: botão **Terminal** → seção **Times**, ou página Agentes → aba **Partituras** → **Subir**. O time sobe
  no centro da tela do andar à mostra; se o lugar está ocupado, desce até achar espaço. Ctrl+Z desfaz.
- **Renomear e apagar**: página Agentes, aba Partituras. Apagar não mexe nos cartões que já subiram.
- Valem para todos os espaços. Até 50 partituras, 40 cartões cada. Um agente sobe um time com
  `ork partitura usar "Nome"`.

## Visor de código e árvores de código

[//]: # "nos/Codigo.tsx:25-419, estado/codigo.ts:34-327, shared/quadro/visor.ts:17-23, ui/menus.ts:159-276, 619-640, quadro/Camadas.tsx:150-230"

Quando um agente grava um arquivo na pasta dele, o Orkester abre um **visor** ao lado do agente: a lista dos
arquivos mexidos à esquerda (o mais novo em cima) e o arquivo escolhido à direita, com o **diff do git** (+ e − na
canaleta). Uma linha fina liga o agente ao visor.

**Cabeçalho do visor**: seguir o agente (mostra sempre o mais novo) ou fixar num arquivo; **Abrir no Leitor** e
**Ver formatado** em `.md`; quebra de linha; **diff ↔ arquivo inteiro**; **Reler agora**; **Recolher** (vira um
bloquinho com o nome e "N arquivos"; clique duplo abre). Sem git, ou arquivo novo, mostra o arquivo inteiro e diz
por quê.

**Menu "Código que ele escreve"** (no menu do agente e no ícone de código do rodapé): ligar/desligar **Mostrar no
visor sozinho o que ele gravar**; **Mostrar o último arquivo mexido no visor**; **Árvores** ▸; recolher, abrir,
juntar ao lado do agente ou **Fechar o visor e parar de abrir**; **Mostrar as linhas até os visores**.

**Árvores de código** separam os arquivos por frente de trabalho: cada árvore tem um visor próprio. No submenu
**Árvores**: **Nova árvore…**, e em cada uma **Os próximos arquivos vêm para cá**, recolher/abrir, **Renomear a
árvore…** e **Desfazer a árvore**. No quadro, uma bolinha com o nome da árvore fica entre o agente e os visores:
clicar recolhe ou abre todos; arrastar leva a árvore inteira. Um agente cria árvores com `ork arvore`.

**Um arquivo só**: explorador → **Ver o código no quadro**. Menu do cartão de código: ver inteiro / ver o que
mudou, abrir / recolher, tirar da coluna do agente / devolver, abrir no programa do sistema, mostrar no Explorer.

Limites: até 50 arquivos por visor. Pasta grande demais não é vigiada ("aponte o agente para a pasta do projeto").

## Andares

[//]: # "ui/Andares.tsx:12-371, ui/acoesAndar.ts:37-117, main/andares.ts:11-189, ui/menus.ts:757-788"

Um **andar** é outro nível do mesmo espaço, com cartões e desfazer próprios. Se a pasta do espaço é um repositório
git, o andar ganha um **ramo e uma pasta à parte** (`git worktree`), e os terminais dele abrem lá: dois times mexem
no mesmo projeto sem se atropelar. O andar principal se chama **Térreo**.

- **Criar**: menu do fundo → Andares → **Novo andar…**, a paleta, o menu do espaço ou "+ Novo andar" na pilha. Dê o
  nome do que vai ser feito. Com git, a caixa "Ramo isolado com git" cria `andar/<nome>` a partir do ramo atual,
  numa pasta em `~/.orkester/andares/`. Sem git, o andar é só um quadro novo na mesma pasta.
- **Entrar**: a pílula **Andares** (canto inferior direito) abre a vista 3D com uma pílula por andar ("3 commits ·
  2 alterados" ou "em dia", atualizado a cada 5 s). Clique entra; botão direito abre o menu. Também pelo menu do
  fundo, pela paleta e pela lista de espaços. Fora do térreo, o indicador no canto superior esquerdo volta ao térreo.
- **Menu do andar**: **Ir para este andar**, **Renomear…**, **Status** ▸ (Trabalhando, Travado (precisa de você),
  Em revisão, Pronto, Sem status; aparece como um ponto colorido), **Mostrar pasta do andar no Explorer**, **Juntar
  ao principal…** (só com git) e **Apagar andar…**.
- **Juntar ao principal**: faz um merge `--no-ff` do ramo do andar no ramo do térreo, tira o andar do quadro e
  apaga a pasta dele (opção de apagar o ramo também). É recusado se o térreo está sem ramo (HEAD solto) ou se o
  andar ou o principal têm mudanças fora de commit.
- **Apagar andar**: avisa da perda do que estiver fora de commit; apagar o ramo é opcional (os commits somem).

## Espaços e janelas

[//]: # "ui/ListaDeEspacos.tsx:22-153, ui/menus.ts:694-748, main/janelas.ts:5-203, shared/janelas.ts:65-133"

- **Lista de espaços**: "Filtrar", **Nova janela** (Ctrl+Shift+N) e **Novo espaço de trabalho** no topo. Cada
  espaço mostra quantos terminais tem e um ícone quando está aberto em outra janela ("clique para ir até ela").
  Clique abre; clique duplo renomeia; os andares aparecem embaixo de cada espaço.
- **Menu do espaço**: Abrir, Abrir em nova janela, Ir para a janela dele, Renomear…, Mostrar pasta no Explorer,
  Novo andar…, **Apagar espaço…** (o quadro, os post-its e os andares saem do app; a pasta do projeto e os ramos do
  git não são tocados; feche a janela dele antes).
- **Janelas**: cada espaço abre numa janela só; pedir um espaço já aberto traz a janela dele para a frente. Ao
  reabrir o app, as janelas da última sessão voltam (até 6), onde estavam.
- Os terminais continuam vivos ao trocar de espaço.

## Página Leitor de Markdown

[//]: # "paginas/leitor/*, main/leitor.ts, main/leitorCaminhos.ts, shared/leitor.ts, shared/markdown.ts"

Lê arquivos `.md` formatados, sem editar nada.

- **À esquerda**: as pastas de todos os espaços (etiqueta *espaço*) e as que você fixou; **Fixar pasta…** acrescenta
  uma (o ícone de desafixar tira); a busca **"Buscar por nome (Ctrl+F)"** (cada palavra precisa estar no caminho, sem
  ligar para acento); a árvore (pastas primeiro).
- **À direita**: o arquivo formatado, com **Voltar (Alt+←)**, até 50 arquivos de histórico. Recarrega sozinho
  quando o arquivo muda no disco, sem perder a rolagem.
- **Links**: `http(s)` e `mailto` abrem no navegador do sistema; link relativo para outro `.md` abre no Leitor. Imagens
  aparecem só como o texto alternativo, e HTML dentro do arquivo aparece como texto.
- **Atalhos**: **Ctrl+F** busca, **Esc** fecha o aviso e depois limpa a busca, **Alt+←** volta.
- **Limites**: arquivo de até 400 KB; árvore de até 3000 arquivos e 10 níveis; ignora `node_modules`, `.git`,
  `dist`, `out`, `build` e pastas começadas por ponto; até 20 pastas fixadas. Não aceita pasta de rede, raiz do
  disco nem a pasta do usuário inteira (uma subpasta vale).
- Do quadro, o botão **Abrir no Leitor** do visor de código abre um `.md` aqui.

## Página Rotinas

[//]: # "paginas/rotinas/Rotinas.tsx, main/rotinas.ts, shared/rotinas.ts, main/espera.ts:231-256"

O app **digita** um pedido (ou comando) num cartão de terminal na hora marcada. Se o terminal está ocupado, parado
numa pergunta, encerrado, ou você está escrevendo nele, a rotina **pula a vez** (não acumula).

- As rotinas aparecem agrupadas por espaço. Cada uma mostra o cartão, a frequência ("a cada 30 min", "todo dia às
  09:00", "toda terça às 09:00"), a próxima vez, o último resultado ("rodou", "pulou: o terminal estava ocupado"…)
  e quantas vezes rodou.
- Botões: **Digitar agora (testar)**, **Pausar / Voltar a rodar**, **Apagar rotina** (só no espaço desta janela).
- **Nova rotina no espaço aberto**: nome, o cartão (terminais do andar à mostra), o texto a digitar, e a
  frequência: **a cada…** (1 a 10080 minutos), **todo dia às…** ou **toda semana…** (dia e hora) → **Criar rotina**.
  Do menu do cartão, **Rotinas…** já chega com ele escolhido.
- **Só correm com o espaço aberto numa janela.** As de outros espaços aparecem aqui; pausar, ligar e testar valem
  para elas, criar e apagar não.
- Até 40 rotinas por espaço; texto de até 2000 caracteres.

## Página Agentes

[//]: # "paginas/agentes/Agentes.tsx, Funcoes.tsx, Presets.tsx, shared/modelos.ts, main/modelos.ts, shared/catalogo.ts"

Quatro abas: **Agentes**, **Funções**, **Presets**, **Partituras**.

**Agentes**: todos os agentes vivos de todos os espaços, só para ler ("daqui não se comanda agente nenhum"). Filtros
por **Espaço**, **Situação** (livre, ocupado, numa pergunta, encerrado) e **Motor**; **Recolher todos / Abrir
todos**. Cada cartão mostra função, motor, modelo · esforço (`padrão` quando nenhum foi escolhido; desde a 1.9.7, com o
que o config do motor diz entre parênteses, em tom suave, como "padrão (gpt-5.6-terra · high)", lido só das chaves de
modelo e esforço de `~/.claude/settings.json` ou `~/.codex/config.toml`; sem leitura, fica só `padrão`), caixa ("N recados esperando") e as tarefas do Kanban
(clicar abre a tarefa, trocando a janela para o espaço dele). Atualiza a cada 3 s.

**Funções**: cada função tem nome, **modelo**, **esforço**, pasta (vazia = a do espaço) e o prompt ("O que ele é, o
que se espera dele, o que não fazer…"). **Nova função**, **Desfazer alterações**, **Salvar** (desligado enquanto há
erro: sem nome, nome repetido, prompt vazio, modelo inválido, esforço que o motor não aceita). Um agente abre uma
função com `ork abrir claude --funcao "Nome"`. Uma função chamada **Maestro** tem papel especial no Kanban.

**Presets**: Nome, Motor (Claude Code, Codex, Só o PowerShell), Comando digitado no PowerShell, Modelo, Esforço.
**Novo preset**, **Restaurar padrão**, **Desfazer alterações**, **Salvar**. De 1 a 50 presets; comando de uma linha.

**Partituras**: a lista dos times salvos, com **Subir**, **Renomear** e **Apagar**.

**Modelo e esforço**: o que vale é o do pedido, depois o da função, depois o do preset. Vazio = o padrão do motor.
Esforços `low`, `medium`, `high`, `xhigh`, `max`, `ultra` (Claude não aceita `ultra`). Os modelos oferecidos vêm de
`~/.orkester/modelos.json` (opcional, você escreve), do cache do Codex e dos de fábrica. Modelo fora da lista abre
com aviso; esforço que o motor não aceita é recusado.

**Importar catálogo** (fichas de time em `.md`): não há botão. Use `ork catalogo importar <pasta>` ou a ferramenta MCP
`importar_catalogo`. Veja [`ork.pt-BR.md`](ork.pt-BR.md#fichas-de-time).

## Página Kanban

[//]: # "paginas/kanban/*, shared/kanban.ts, main/kanban.ts"

As tarefas do espaço desta janela, em colunas. "Tarefa" é do Kanban; "cartão" continua sendo o do quadro.

**Colunas de fábrica**: **Demandas** → **Com o Maestro** → **Fazendo** → **Revisão** → **Feito**. Demandas, Com o
Maestro e Revisão podem ser renomeadas mas não apagadas.

**Topo**: a lista de espaços (trocar ali troca o espaço da janela); **+ Demanda**; **⋯** com **Nova coluna…**,
**Renomear coluna**, **Apagar coluna** (só vazia; se algum fluxo usa a coluna, o app pede confirmação antes, com a
lista dos fluxos e **Ver o fluxo**; os ligados desligam ao apagar) e **Lixeira (N)**. Cada coluna tem o seu **⋯** no cabeçalho, com o Organizar
(veja [Pastas](#pastas-e-organizar) abaixo). Filtros: busca ("título, descrição ou
#número", tecla **/**), **Quem trabalha**, **Etiqueta**, **Esconder concluídas há mais de 7 dias** (vem marcada) e
**Limpar filtros**.

**Faixa "Ocupados sem tarefa"**: agentes trabalhando sem tarefa aberta. Clique → **Pôr numa tarefa** ou **Ir ao
cartão**.

**Colunas**: duplo clique no nome renomeia. Em Demandas, **+ Demanda** abre um campo que fica aberto para a
próxima. **Com o Maestro** mostra quem é o Maestro e se está livre, ou "sem Maestro".

**Tarefa**: número, título, etiquetas, comentários e um chip por agente trabalhando nela (com a situação). Clique
abre o **painel** à direita: título editável, coluna, **Delegar ao Maestro** (em Demandas), **Trabalhando nela**
(Ir ao cartão, tirar, **+ pôr um agente**, que avisa a caixa dele), etiquetas (até 8, de até 24 letras; dá para
digitar várias de uma vez separadas por vírgula, `cliente-a, 1.9.7`, e Enter; repetida entra uma vez só, a mais
longa é cortada em 24 e a que passa de 8 fica de fora, e o aviso diz qual; o campo sugere as etiquetas em uso no
espaço;
na criação vai só o título: as etiquetas entram depois, no painel), descrição em Markdown
(lápis para editar), **Comentários** (Ctrl+Enter envia) e **Apagar (vai para a lixeira)**.

**Arrastar**: leve a tarefa entre colunas (Esc cancela). **Soltar em "Com o Maestro" = delegar**: o Maestro recebe
o pedido na caixa dele. O Maestro é o agente Claude ou Codex vivo com a função chamada **Maestro**; sem ele, a
coluna recusa ("Não há Maestro aberto neste espaço"). Voltar a tarefa a Demandas, ou apagá-la, desfaz a delegação.

**Regras**: delegar é só seu. Agentes trabalham nas tarefas pelo `ork kanban` (pegar, mover, comentar); um agente
que não é o Maestro leva para Revisão, e Feito é seu e do Maestro. Atribuir só avisa o agente. O selo **#N** no
cartão do agente mostra a tarefa dele.

**Atalhos**: **N** nova demanda, **/** busca, **Esc** fecha o painel.

**Lixeira**: **Restaurar** (o que estava com o Maestro volta para Demandas) e **Esvaziar a lixeira**.

Limites: 500 tarefas, título 120 caracteres, descrição 8 KB, 12 colunas, lixeira de 50.

### Pastas e Organizar

[//]: # "paginas/kanban/{Coluna,pastas,PainelDaTarefa,filtros}.ts(x), shared/kanban.ts, shared/kanbanOrganizar.ts, main/kanban.ts (1.9.7, K1, K2 e Organizar simples)"

Desde a 1.9.7 cada coluna agrupa as tarefas em **pastas recolhíveis** (uma por versão, por exemplo), para o Feito não
virar uma lista sem fim. Serve para qualquer espaço: as pastas vêm das **etiquetas** das tarefas.

- **Na coluna**: as tarefas sem pasta ficam no alto; depois, as pastas, da mais nova para a mais velha. Clique no
  cabeçalho de uma pasta para abrir ou recolher; o que fica recolhido é guardado nesta máquina, por espaço. No
  **Feito**, só a pasta da versão atual nasce aberta.
- **Uma tarefa**: o painel dela tem o campo **Pasta**, com sugestões das pastas que já existem; digite e Enter muda,
  apague e Enter tira. Arrastar um cartão para dentro de uma pasta também o põe nela. Uma pasta com o mesmo nome sem
  contar maiúsculas e acentos vira a mesma (não nasce "geral" ao lado de "Geral"). Nome até 40 caracteres.
- **Filtro e busca**: há um filtro **Pasta**; a busca também acha pelo nome da pasta e abre as pastas que têm
  resultado.
- **Etiqueta de versão** é a que tem cara de versão: `1.9.6`, `v2.0` (não valem `2024` nem `fluxos`).
- **Automático**: a tarefa sem pasta que **chega no Feito** com uma etiqueta de versão entra sozinha na pasta da
  versão, e o histórico dela diz "Organizar automático". Quem já estava no Feito e teve a pasta tirada por você não
  volta. Vem ligado; no menu **⋯** da coluna final, o item diz **Organizar sozinho por versão: ligado (desligar)** ou
  **…: desligado (ligar)**, e só você o muda.
- **Primeira abertura na 1.9.7**: uma vez por espaço, se o Feito tem tarefas sem pasta com etiqueta de versão, a
  página as põe nas pastas da versão e avisa "Feito organizado por versão · **Desfazer**". Espaço sem etiqueta de
  versão: nada acontece, nem aviso.
- **Organizar uma coluna**: no menu **⋯** do cabeçalho de cada coluna (não há botão no topo):
  - **Organizar por versão** (só aparece se a coluna tem etiqueta de versão);
  - **Uma pasta para cada etiqueta** (desligado se nenhuma tarefa sem pasta tem etiqueta): cada tarefa vai para a
    pasta de uma etiqueta dela. Com várias, vale a de versão; se não há, a mais usada naquela coluna; no empate, a
    primeira em ordem alfabética. A tarefa fica numa pasta só, e as outras etiquetas continuam nela;
  - **Juntar numa pasta ▸**: escolha uma das etiquetas da coluna, com quantas tarefas **sem pasta** a têm
    (`cliente-a (3)`); só essas vão para a pasta de mesmo nome. Uma etiqueta cujas tarefas já estão todas em pastas
    aparece desligada, "(já em pastas)".

  Aplica na hora, sem prévia, e só nas tarefas **sem pasta** (tarefa com pasta nunca é mexida por nada automático).
  Depois o aviso diz para onde foram, com **Desfazer**: `2 tarefas → pasta "1.9.7"` ou `5 tarefas → 3 pastas`, e a
  pasta de destino abre e a coluna rola até ela. Sem nada a mexer, "Nada a organizar em <coluna>: …" e nada é gravado.
  Se alguém mexeu numa daquelas tarefas depois, o Desfazer a pula. Com o kanban só de leitura, nada disso fica ativo.
- **Pelos agentes**: `ork kanban pasta` e `--pasta` no criar e no editar (veja [`ork.pt-BR.md`](ork.pt-BR.md#kanban));
  pelo MCP, `pasta` em `kanban_criar`/`kanban_editar`. Organizar muitas tarefas de uma vez é sempre seu, pela página.

## Página Fluxos

[//]: # "paginas/fluxos/{Fluxos,Lista,Pastas,Editor,PainelDoNo,Execucoes,ConfirmarLigar}.tsx, paginas/fluxos/editor/teclas.ts, shared/fluxos/*, main/fluxos/servico.ts, main/regrasDaBandeja.ts, main/bandeja.ts"

Automações desenhadas em nós: um **gatilho** (uma tarefa que muda de coluna, uma entrega, um agente que parou, a
hora, ou o botão **Rodar fluxo**) e o que fazer depois (recado, tarefa, aviso, decidir, mexer nos dados, JavaScript,
chamar uma API). Cada espaço tem os seus fluxos. **O guia completo** (o formato, os ajustes de cada nó, expressões,
Código, HTTP, credenciais, limites e receitas) está em [`fluxos.pt-BR.md`](fluxos.pt-BR.md).

**Lista**

- **Topo**: **Espaço:** (o desta janela vem como "(aberto aqui)"; os de outros espaços só se olham), **Buscar fluxo**
  (procura em todas as pastas, sem ligar para acento) e **Novo fluxo** (só no espaço aberto nesta janela).
- **Pastas**, à esquerda: **Todos os fluxos**, **Sem pasta** e as suas, cada uma com a contagem. Uma pasta-mãe
  mostra também os fluxos das subpastas (com a pasta de cada um na linha), e a contagem dela soma os das subpastas. **Nova** cria uma
  pasta (até 3 níveis e 100 pastas; nome de até 60 letras, sem repetir no mesmo lugar); passe o mouse numa pasta para
  **Renomear** ou **Apagar** (os fluxos de dentro, e os das subpastas, vão para "Sem pasta"). Arraste um fluxo até
  uma pasta para guardá-lo nela, ou use o seletor de pasta na linha dele.
- **Cada fluxo**: o interruptor (**Ligado: clique para desligar** / **Desligado: clique para ligar**), o nome (clique
  abre o editor), os gatilhos, quantos nós, o teto ("até 6/hora"), a pasta, quem criou e quem editou, e o último
  disparo ("hoje 14:03" com **ok**, **erro**, **barrado: laço**, **barrado: excesso** ou **sem destino**; ou "nunca
  disparou"). Selos: **Código, HTTP, MCP ou comando** (é sensível), **criado por agente**, **editado por agente** e o
  motivo de um desligamento automático (**desligado por excesso de disparos**, **desligado: um cartão saiu do
  quadro**, **desligado: uma coluna saiu do kanban**, **desligado: mudou sem a sua aprovação**). A lixeira apaga o fluxo e as execuções dele.
- Um arquivo de fluxo que não abre aparece num aviso com o motivo; ele não roda e não é apagado.
- **Exemplos**: na primeira vez, o espaço ganha três fluxos desligados na pasta Exemplos ("Tarefa pronta avisa o
  Maestro", "Agente parou numa pergunta" e "Revisão de fim de dia"). Apagados, não voltam.

**Editor** (clique no nome do fluxo, ou **Novo fluxo**)

- **Topo**: **← Fluxos** (volta à lista; clicar em **Fluxos** na barra de páginas também volta), o nome do fluxo, o selo "não salvo", as abas **Fluxo** e **Execuções**,
  **Desfazer** e **Refazer**, **+ Nó**, **Rodar fluxo**, o selo **Rede local: N endereços** (quando há um endereço local permitido; veja abaixo), o interruptor **Ligado/Desligado** e **Salvar** (Ctrl+S).
  Com mudanças não salvas, sair do editor ou trocar de página pergunta: **Continuar editando**, **Descartar** ou
  **Salvar e sair**.
- **Andar e dar zoom**: a roda do mouse anda; **Ctrl+roda** dá zoom no ponteiro; arrastar o fundo também anda;
  **Shift+arrastar** no fundo seleciona uma área. **1** mostra tudo.
- **Pôr um nó**: **+ Nó**, **Tab**, **N** ou clique duplo no vazio abrem a busca de nós ("Buscar nó (gatilho, recado,
  Se…)"), com os grupos **Gatilhos**, **Orkester**, **Lógica** e **Fora do Orkester**.
- **Ligar**: arraste da bolinha de saída de um nó até outro nó. Soltar no vazio abre a busca para o próximo nó ("Que
  nó vem depois?"), já ligado. O **Se** tem duas saídas, verdadeiro e falso. Gatilho não recebe ligação: vinda de uma
  saída (ou com um nó selecionado), a busca mostra os gatilhos no fim, num grupo à parte com a nota "gatilho entra
  solto", e o gatilho escolhido nasce sem ligação.
- **Teclas**: **Del** apaga o que está selecionado (nós ou a ligação clicada); **Ctrl+Z** desfaz, **Ctrl+Y** ou
  **Ctrl+Shift+Z** refaz; **Ctrl+A** seleciona tudo; **F2** renomeia o nó; **Enter** abre o painel do nó; **Esc**
  fecha a busca ou o painel.
- **Copiar e colar**: **Ctrl+C** copia os nós selecionados (ou o fluxo inteiro) como JSON; **Ctrl+V** cola. Cola também
  um fluxo inteiro copiado do Orkester ou de `ork fluxo ver --json`. Cartões e colunas são acertados pelo nome neste
  espaço; o que não bater fica "a escolher". Colar nós num fluxo ligado o deixa desligado ao salvar.
- **Painel do nó** (clique duplo no nó ou **Enter**): o nome e o tipo no alto e três colunas: **Entrada**, **Ajustes**
  e **Saída**. Os ajustes mudam com o tipo; os campos que aceitam `{{ campo }}` dizem isso embaixo. Entrada e Saída
  mostram os itens da execução aberta, em **Tabela** ou **JSON** (o Código mostra também o `console.log`). **Notas**
  é texto livre para quem ler o fluxo depois. **Fechar (Esc)**.
- Um nó com algo faltando mostra o aviso **Falta: …**, e o **Salvar** recusa o fluxo dizendo o motivo.
- Fluxo de um espaço aberto em outra janela abre com o selo "outro espaço: só olhar".

**Os 14 nós** (os ajustes de cada um estão no [guia](fluxos.pt-BR.md#os-nós)):

| Grupo | Nó | O que faz |
|---|---|---|
| Gatilhos | **Tarefa mudou de coluna** | uma tarefa do Kanban entrou numa coluna (por você, por um agente ou qualquer um) |
| | **Entrega chegou** | um agente entregou com `ork entregar` (filtros: de quem, para quem, texto que contém) |
| | **Agente parou** | um agente ficou livre, parou numa pergunta ou encerrou |
| | **Relógio** | a cada N minutos (mínimo 2), todo dia ou toda semana |
| | **Manual** | o botão **Rodar fluxo** |
| Orkester | **Recado** | manda um recado a um agente ou ao Maestro, pela caixa de entrada |
| | **Tarefa** | cria uma tarefa no Kanban (na coluna Com o Maestro, delega) |
| | **Comando no shell** | digita um comando fixo num cartão shell do espaço. **Sensível** |
| | **Avisar** | um aviso para você, no canto da janela ou numa notificação do Windows |
| | **Consultar o Orkester** | lê tarefas, colunas, agentes, cartões, andares, o espaço, fluxos ou execuções **deste espaço**, uma ficha por item. Só leitura |
| Lógica | **Se** | separa os itens em verdadeiro e falso, por condições |
| | **Definir campos** | põe ou troca campos nos itens |
| Fora do Orkester | **Código** | JavaScript isolado, sem disco e sem rede, 5 segundos. **Sensível** |
| | **HTTP** | chama uma API na internet, com a chave de uma API de Conexões › APIs se precisar (o campo **API** lista só as que cobrem o host da URL; **Criar API** abre o formulário já com o host). Com uma API "só lê", um método de escrita é avisado na tela e recusado antes de sair. **Sensível** |
| | **Ferramenta MCP** | chama uma ferramenta de um servidor de Conexões › MCP › Servidores de fora: escolha o servidor e a ferramenta, e os campos saem do esquema dela (1.9.7). Ferramenta que mudou fica bloqueada até você rever. **Sensível** |

**Ligar**. Pelo interruptor da lista ou do editor. Precisa de pelo menos um gatilho e de nenhum cartão ou coluna "a
escolher". Fluxo com nó **sensível** (Código, HTTP, Ferramenta MCP ou Comando no shell) abre antes uma confirmação com
cada um desses nós inteiro (na Ferramenta MCP: o servidor, a ferramenta e os argumentos), marcado como **igual ao que você aprovou**, **mudou** ou **novo**, e com o agente que mexeu nele, se foi
um. Só você liga um fluxo sensível: um agente não consegue. Mudar um nó sensível depois desliga o fluxo até você
confirmar de novo. Ligado, o fluxo dispara sozinho, com travas contra laço e excesso (no
[guia](fluxos.pt-BR.md#travas-e-limites)).

**Rede local no nó HTTP.** Por padrão, o HTTP só fala com a internet. Para chamar algo do seu computador ou da rede
local (ex.: `http://localhost:5678/...`), escreva o endereço fixo e a porta no nó e clique em **Permitir
localhost:5678 neste fluxo**. A permissão vale para aquele endereço **e porta**, não para outros. Com algum
endereço permitido, o topo do editor mostra **Rede local: N endereços**, e **Tirar** remove cada um. Nomes DNS (fora
`localhost`) não podem ser permitidos: use o IP. Endereços de metadados (`169.254.…`) nunca são permitidos. Vale ao
**salvar**; num fluxo ligado, mudar a lista o desliga até você confirmar de novo. Só você muda, pela página: um
agente, o `ork` ou o MCP não mudam (um `rede` no JSON deles é ignorado, e eles recebem um aviso). Fluxos antigos com a
rede toda liberada abrem sem endereços e desligados. Mais no [guia](fluxos.pt-BR.md#o-nó-http-e-a-rede).

**Rodar fluxo**. Roda uma vez, agora, o que está **salvo**, entrando pelo gatilho **Manual** (sem um, o botão avisa
que falta). Funciona com o fluxo desligado. Com nó sensível ainda não aprovado, abre a confirmação com esses nós e o
botão **Aprovar e rodar uma vez**: roda agora e aprova os nós, mas **não liga** o fluxo. A execução abre sozinha no
desenho.

**Execuções** (a aba no alto do editor). As 50 últimas do fluxo, a mais nova primeiro: o resultado (**ok**, **erro**,
**barrado: laço**, **barrado: excesso**, **sem destino**), quando, quanto durou, o que disparou (o gatilho ou o Rodar
fluxo) e o motivo de um erro ou barrado. Clique numa para vê-la no desenho: nós verdes rodaram, vermelho deu erro,
cinza não rodou, e cada ligação mostra quantos itens passaram. A faixa do alto resume a execução e fecha para voltar a
editar. No painel do nó, a Entrada e a Saída daquela execução (até uns 10 KB por nó; passou disso, aparece
**Cortado**). Nenhuma credencial aparece numa execução. Se alguma `{{ }}` veio vazia, a faixa do alto lista qual e em
que nó ("`{{ x }}` veio vazio em <nó>").

**Avisos**. O que um agente faz nos fluxos ("Revisor criou o fluxo …") e a falha de um fluxo ligado aparecem no canto
da janela; sem janela, numa notificação do Windows (falha: no máximo um aviso a cada 10 minutos por fluxo).

**Bandeja: com fluxo ligado, fechar a janela não encerra.** Se há pelo menos um fluxo ligado em qualquer espaço,
fechar a última janela deixa o Orkester rodando na bandeja do Windows (perto do relógio), com o ícone "Orkester · N
fluxos ligados" (e, desde a 1.9.7, "· N agentes seguem abertos" quando há agentes vivos): os agentes seguem vivos e
os fluxos seguem disparando. Na primeira vez, um balão explica, dizendo também quantos agentes seguem abertos. Clique no
ícone (ou **Abrir**, no menu dele) para reabrir as janelas; abrir o atalho do Orkester também reabre. **Para fechar de
vez, use Sair no ícone da bandeja.** Se o último fluxo ligado for desligado com o app na bandeja, ele sai sozinho. Sem
fluxo ligado, fechar a última janela encerra o app como sempre.

## Configurações

[//]: # "paginas/configuracoes/Configuracoes.tsx, paginas/configuracoes/abrir.ts, casca/BarraPaginas.tsx"

A **engrenagem** no pé da barra abre a página Configurações, na última seção que você usou. À esquerda, quatro
seções: **Geral**, **Aparência**, **Conexões** e **Atalhos**. A paleta (Ctrl+K) tem um item para cada uma.

### Geral

- **Sobre**: a versão do Orkester e as do Electron e do Chromium.
- **Onde ficam os dados**: a **Pasta de dados** e o **Registro (log)** (um `.jsonl` por dia com comandos do `ork`,
  recados, entregas e rotinas), cada um com **Abrir pasta**.
- **Quadro**: **Linhas entre o agente e os cartões de código dele** (a mesma opção "Mostrar as linhas até os
  visores").
- **Aparência**: o tema em uso e **Mudar o tema e a cor de destaque**.
- **Páginas próprias**: ligadas ou desligadas e quantas instaladas, com o atalho para Conexões › Páginas.

### Aparência

[//]: # "paginas/temas/*, shared/temas.ts, shared/temasUsuario.ts, shared/cssPlugin.ts, estilos/tokens.css"

As cores do app em dois passos. Muda na hora, fica guardado, e o terminal acompanha.

1. **Base**: **Escuro** (o padrão), **Claro** ou **OLED** (preto puro). **Usar** aplica; **Duplicar** cria uma
   cópia sua para editar.
2. **Cor de destaque**: Azul (o padrão), Vermelho, Verde, Roxo, Laranja, Rosa, Ciano.

**Seus temas**: cópias editáveis. O editor tem **Nome** e as cores por grupo (Fundo, Bordas, Texto, Destaque,
Perigo e estados, Terminal), cada uma com seletor, campo `#rrggbb` e "Voltar à cor da base"; **Salvar**,
**Descartar**, **Apagar**.

**Plugins de CSS**: só trocam **tokens** (as variáveis de cor e medida do app), dentro de `:root`, `.tema-escuro`,
`.tema-claro` ou `.tema-oled`. Nada de regra de estilo, `url(`, `@import` ou fonte de fora. Cole o CSS ou **Escolher
arquivo .css…** → **Adicionar**. Cada plugin liga e desliga, sobe e desce (o de baixo vence). O **Guia de CSS** explica
o que é um token, traz um exemplo para copiar, o que é recusado e a tabela de todos os tokens com o valor de agora.
Ordem de força: tokens de fábrica < plugins < o seu tema.

Até 50 temas e 30 plugins; arquivo `.css` de até 64 KB.

### Conexões

[//]: # "paginas/conexoes/Conexoes.tsx, paginas/conexoes/Credenciais.tsx, shared/chaves.ts, shared/ferramentasMcp.ts, shared/fluxos/credenciais.ts, main/portais.ts"

O que liga o Orkester ao que está fora dele, em cinco abas: **Chaves**, **MCP**, **Páginas**, **APIs** (era
**Credenciais** até a 1.9.6) e **Portais**.

**Chaves**: para um programa de fora (o seu Claude, o Codex) mexer no quadro como você. Dê um nome ("Claude
Desktop", "notebook") → **Gerar chave**. A chave aparece **uma vez** ("Copie agora"), com o bloco de configuração
pronto em abas (**Claude Code**, **Claude Desktop**, **.mcp.json**, **Codex**) e **Copiar**; **Já copiei** fecha.
Em **Suas chaves**, cada uma mostra se está em uso, o começo dela, a data e o último uso, e **Revogar** (na hora,
sem volta). Até 20 chaves.

**MCP**, em duas partes:

- **Ligar programas ao Orkester**: o passo a passo para ligar o seu programa (tenha uma chave, escolha onde colar,
  troque `COLE_AQUI_SUA_CHAVE` pela chave) e **Baixar a lista (.md)** das ferramentas.
- **Servidores de fora** (1.9.7): os servidores MCP que o Orkester usa no nó **Ferramenta MCP** dos fluxos e nas
  páginas "+" em que você marcar o servidor. **Adicionar servidor** (stdio: o comando, os argumentos, a pasta e as
  variáveis, cada uma em texto ou num **Segredo**, com **Criar segredo** ali mesmo; ou http: a URL e um cabeçalho de
  uma API de **APIs**, só https), **Importar do Claude Code** e **Importar de um arquivo…** (lê os `mcpServers`; o que é
  segredo vira credencial cifrada; você marca quais entram; um servidor com chave nos argumentos ou na URL não é
  oferecido, e o aviso diz onde ela está para você movê-la para uma variável de ambiente ou um cabeçalho). Cada cartão mostra a situação, o comando inteiro com o
  aviso "roda no seu PC com os seus poderes", e os botões **Testar** (lista as ferramentas: "diz que só lê" ou, em
  vermelho, "pode mudar coisas"), **Rever ferramentas mudadas** (aparece quando uma ferramenta mudou: ela fica
  bloqueada até você aceitar), **Editar**, **Pausar / Religar** e **Remover**. Um servidor HTTP que entra por login
  (o do ClickUp) fica com o selo **Precisa de login (chega na 1.9.8)**.
- **Segredos dos servidores** (1.9.7): o valor de uma variável de ambiente que um servidor stdio lê. Não tem domínio
  e nunca vai em cabeçalho nem em pedido HTTP. **Guardar o valor de uma variável de ambiente** abre o formulário; cada
  segredo tem o mesmo cartão das APIs (**Trocar o valor**, **Editar**, **Apagar**, que pergunta `Apagar o segredo
  "Nome"?` e lista os servidores que o usam); o botão do formulário é **Guardar o segredo**. O servidor cita o segredo pelo id,
  então renomear não o quebra. Mesmo cofre e mesmo arquivo das APIs; até a 1.9.6 ele aparecia na aba Credenciais.

Detalhes em [`mcp.pt-BR.md`](mcp.pt-BR.md) (as duas partes).

**Páginas**: a chave geral **Ligar páginas próprias (experimental)**, **Adicionar página…** e um cartão por página
instalada (veja [Páginas próprias](#páginas-próprias-)).

**APIs** (era **Credenciais** até a 1.9.6): a chave de cada API que as [páginas "+"](#páginas-próprias-), o nó
**HTTP** dos [fluxos](#página-fluxos) e o cabeçalho de um servidor MCP http usam sem que o valor apareça. Páginas e
fluxos chamam a API pelo **nome**. **Guardar uma API**: **Nome** (como páginas e fluxos vão chamá-la, "ClickUp"),
**Tipo** (**Token (Bearer)**, **Cabeçalho próprio** com o **Nome do cabeçalho**, ou **Usuário e senha (Basic)**),
**Domínios onde ela pode ir** (um por linha; `*.exemplo.org` vale para os subdomínios, não para o próprio
`exemplo.org`), o valor e **O que ela pode fazer**: **Só lê (GET, HEAD)** ou **Lê e escreve** (em vermelho). Uma API
"só lê" faz páginas e fluxos só consultarem: um POST, PUT, PATCH ou DELETE é recusado antes de sair. No cabeçalho de
um servidor MCP isso não vale (o MCP sempre faz POST, e o que muda coisas é escolhido por ferramenta). API nova nasce
"só lê"; as guardadas na 1.9.6 contam como "lê e escreve". → **Guardar a API** (cifrada). Com ao menos uma API
guardada, o formulário fica atrás do botão **+ Nova API**. Em **Suas APIs**, cada uma mostra
o tipo, os domínios, o selo **só lê** ou **lê e escreve** (vermelho) e só os 4 últimos caracteres, com **Trocar o
valor**, **Editar** e **Apagar**. **Editar** avisa ao mudar o nome: "Vão parar até você ajustar: …" (em âmbar, com a
lista), ou "Nada usa esta API agora: mudar o nome não quebra nada."; depois de guardar, o app diz quem citava o nome
antigo. **Apagar** pergunta antes, `Apagar a API "Nome"?`: o valor some e não dá para recuperar, e o diálogo lista
quem usa ("Nada usa agora." ou os fluxos, páginas e servidores, que não são mexidos: o próximo pedido deles dá erro),
com **Apagar assim mesmo** quando algo usa. Sem conseguir conferir quem usa, não apaga. Dá também para criar uma API sem
vir aqui: o botão **Criar API** está no aceite de uma página e no nó HTTP, já com o domínio preenchido. Os segredos dos
servidores MCP (variáveis de ambiente) ficam na aba **MCP**.
Valem em todos os espaços, só vão por https e só para os domínios marcados, e ficam cifradas pelo cofre do Windows;
sem o cofre, a aba fica **Só leitura** e não guarda nada. O valor nunca volta para a tela, nem para o `ork`, o MCP ou
o nó Código. Até 100 (APIs e segredos somados). Detalhes no [guia dos fluxos](fluxos.pt-BR.md#credenciais).

**Portais**: o login guardado do navegador dos cartões de portal ("Login guardado" ou "Sem login", em quantos sites)
e **Limpar login**. O valor dos cookies nunca aparece.

### Atalhos

Os atalhos do teclado por página: os do Quadro (a mesma lista do **?**) e os do Kanban e do Leitor, que valem só
com a página aberta.

## Páginas próprias ("+")

[//]: # "paginas/extra/*, casca/BarraPaginas.tsx, paginas/conexoes/Conexoes.tsx (aba Páginas)"

Telas feitas por você ou pelo seu time (HTML, CSS e JavaScript) que ganham um ícone na barra. **O guia completo
para construir uma está em [`paginas.pt-BR.md`](paginas.pt-BR.md)**, e também dentro do app: **+** → **Guia
completo**.

- **Ligar**: vêm desligadas porque rodam código de fora (isolado do seu PC). Ligue em Configurações › Conexões › **Páginas**,
  ou pelo **+** → **Ligar páginas**.
- **Adicionar** (botão **+**): os exemplos prontos **Resumo do espaço** e **Eco de API** (1.9.7; testa o pedido a uma
  API pelo app com o httpbin.org, um serviço público de teste, e uma API de valor inventado), **Escolher pasta…** (uma
  pasta sua) ou **Pedir a um agente para criar** (vira uma demanda no Kanban, entregue ao Maestro; abaixo da
  descrição, marque **APIs que ela vai usar** e **MCPs que ela vai usar**: a demanda leva só nomes, domínios e "só lê /
  escreve", nunca a chave). O app lê a pasta sem rodar nada e mostra o diálogo de aceite com cada
  permissão; **Adicionar e permitir** copia a página e põe o ícone na barra.
- **APIs e MCPs que a página enxerga (1.9.7)**: quem decide é você, não o manifesto. O aceite tem
  duas seções: **APIs que esta página enxerga** (todas as suas APIs de Conexões › APIs, uma caixa cada; marcada, aparece
  **também escreve**, só se o teto da API deixa, em vermelho quando marcada; **Criar API** com o domínio já
  preenchido) e **MCPs que esta página enxerga** (os servidores de Conexões › MCP, menos os que precisam de login; marcar um abre as ferramentas dele,
  cada uma com caixa e o rótulo "diz que só lê" ou, em vermelho, "pode mudar coisas", com **marcar as que dizem só
  ler** e **marcar todas**). O manifesto da página só **sugere**: a API ou o servidor que atende vem marcado, com "a
  página chama de '…'". Uma página com `rede` ou `local` não enxerga API nem MCP (as seções aparecem desligadas).
  Atualizar a página nunca muda o que você marcou. A página vê só nome, domínios e "escreve ou não" do que você marcou,
  nunca a chave. Detalhes no [guia das páginas](paginas.pt-BR.md#apis-e-mcps-que-a-página-enxerga).
- **Na página**: a moldura do app mostra o nome, a versão, a quem ela está ligada, "usa: ClickUp, Eco de teste" (as
  APIs e os servidores que ela enxerga; vermelho se alguma escreve ou se tem ferramenta MCP que pode mudar coisas)
 , **Ligar a agente…** (para ela mandar recados a esse agente), **Recarregar a página** e
  **Permissões, APIs e MCPs (Configurações › Conexões › Páginas)**.
- **Em Configurações › Conexões › Páginas**, cada página tem: **Rever** (quando pede permissão nova ou mudou fora do app),
  **Desligar / Religar**, **Atualizar da pasta**, **Remover**, **Revogar / Permitir de novo** por permissão, a
  lista **Ligada a**, as mesmas duas seções do aceite (**APIs e MCPs que esta página enxerga**, com **Guardar APIs e MCPs**
  e **Desfazer**; uma API ou um servidor apagado aparece "sumiu", para desmarcar) e o **Registro de
  pedidos** com os últimos 100, que somem ao fechar o app. Desligar, remover ou desmarcar corta o pedido que a página
  tiver em curso.
- Uma página que trava ou come memória é fechada sozinha; três quedas em 10 minutos a desligam até você religar.

## O time e o comando `ork`

[//]: # "docs/ork.pt-BR.md, main/manual.ts"

Dentro de qualquer terminal do quadro, o agente tem o comando `ork`. Fora do app, ele recusa rodar. O app ensina o
comando aos agentes sozinho: grava a skill `orkester` para o Claude Code e o Codex.

```text
ork quem                         quem é você e quem está ligado a você
ork abrir claude|codex|shell     sessão nova ao lado, já ligada (--funcao, --pedido, --esperar…)
ork pedir <nome> "…"             manda um pedido e espera a resposta
ork entregar "…"                 devolve o resultado a quem pediu
ork ver <nome>                   lê a tela dele sem mandar nada
ork limpar <nome>                zera o contexto dele
ork banda criar "Nome" …         põe uma moldura em volta de agentes
ork partitura usar "Nome"        sobe um time salvo
ork kanban …                     lê e mexe no Kanban do espaço
ork fluxo …                      vê, cria, edita, liga e roda os fluxos do espaço
ork pagina responder "…" "…"     responde a uma página "+" ligada a ele
ork passar <nome>                passa o seu papel inteiro a um sucessor vivo (só dentro de um espaço)
```

Como um time costuma trabalhar:

- Um agente **Maestro** recebe as demandas (pelo Kanban, coluna Com o Maestro) e abre os outros com `ork abrir
  --funcao …`, cada um com um papel.
- Os recados entre agentes entram pela **caixa de entrada**, um de cada vez, quando o destino está livre e você não
  está escrevendo nele. A entrega chega como `[ork · entrega de "Nome"]`; se um agente para sem entregar, o app avisa
  quem pediu com `[ork · aviso do Orkester]`.
- Um agente só alcança quem está ligado a ele (corda ou banda) ou quem ele abriu.

A referência completa, com os cerca de trinta verbos, está em [`ork.pt-BR.md`](ork.pt-BR.md).

## Ligar o seu Claude de fora (MCP)

O `ork` é para os agentes dentro do quadro. Para mexer no quadro **de fora** (o seu Claude Code, o Claude Desktop, o
Codex), gere uma chave em Configurações › Conexões › **Chaves** e cole o bloco que o app dá. O cliente passa a ler o quadro, abrir
agentes, subir partituras, trocar modelos, mexer no Kanban e nos fluxos, como se fosse você (um fluxo com Código,
HTTP, Ferramenta MCP ou comando, só você liga, pela página). O Orkester precisa estar aberto.
Tudo em [`mcp.pt-BR.md`](mcp.pt-BR.md). O caminho contrário (o Orkester usar um servidor MCP de outro) está em
[Conexões](#conexões), aba MCP, parte **Servidores de fora**.

## Onde ficam os dados

[//]: # "main/dados.ts:44-725, main/paginas.ts, main/kanban.ts, main/temas.ts, main/chaves.ts, main/fluxos/{disco,credenciais,index}.ts"

Numa pasta só: `%USERPROFILE%\.orkester` (ou a pasta da variável `ORK_DADOS`, se existir). Desinstalar não apaga.

| O quê | Onde |
|---|---|
| quadro de cada espaço (cartões, cordas, bandas, rotinas) | `espacos/<id>/espaco.json` |
| post-its | `espacos/<id>/notas/*.md` |
| imagens coladas | `espacos/<id>/imagens/` |
| Kanban | `espacos/<id>/kanban.json` |
| fluxos do espaço (um `.json` por fluxo, e `indice.json` com as pastas e a ordem) | `espacos/<id>/fluxos/` |
| execuções dos fluxos (as 50 últimas de cada um) | `espacos/<id>/fluxos/execucoes/` |
| APIs e segredos dos servidores MCP (de Conexões › APIs e › MCP; cada valor cifrado pelo cofre do Windows) | `credenciais.json` |
| servidores MCP de fora (só os ids das credenciais, nenhum valor) | `mcp-servidores.json` |
| chave do selo que aprova os nós sensíveis (cifrada) | `fluxos-selo.json` |
| presets, funções, partituras, base e destaque do tema, pastas fixadas do Leitor | `preferencias.json` |
| seus temas e plugins de CSS | `temas.json` |
| chaves do MCP (só a impressão digital) | `chaves.json` |
| janelas da última sessão | `janelas.json` |
| pastas dos andares | `andares/` |
| perfil do navegador dos portais | `navegador/` |
| páginas próprias e os dados delas | `paginas/`, `paginas.json`, `paginas-dados/` |
| registro: comandos do `ork`, recados, entregas e rotinas | `registro/AAAA-MM-DD.jsonl` |
| lista de modelos sua (opcional) | `modelos.json` |

Arquivos ilegíveis não são apagados: o app guarda uma cópia `.ruim` ao lado antes de gravar de novo.

## Dicas e problemas comuns

- **O teclado não vai para o terminal.** Clique no cartão para selecioná-lo **sozinho**. Com outros itens
  selecionados juntos, as teclas são do quadro.
- **Um atalho do quadro não funciona.** Ele não vale com um terminal selecionado sozinho, com um campo em foco ou
  com um menu aberto. Clique no vazio e tente de novo.
- **O recado de outro agente não entra.** Olhe o selo de envelope no cabeçalho: o tooltip diz o motivo (o agente
  está trabalhando, numa pergunta, você está escrevendo, há texto no campo). Limpou o campo e o selo insiste? Clique
  nele.
- **"⚠ pedido?" no cabeçalho.** O primeiro pedido pode não ter saído. Leia a tela antes de repetir.
- **Um agente não consegue falar com outro.** Falta a corda (ou a banda). Desenhe uma, ou abra o segundo pelo
  `ork abrir` do primeiro.
- **`ork` responde que não está no app.** Ele só roda num terminal do Orkester (`ORK_PIPE` existe). No Git Bash,
  comando com barra precisa de `MSYS2_ARG_CONV_EXCL='*'` ou de `--arquivo`.
- **A rotina não rodou.** Veja o último resultado na página Rotinas ("pulou: o terminal estava ocupado"…). Ela só
  corre com o espaço aberto numa janela.
- **Fechei a janela e o Orkester continua aberto.** Há fluxo ligado: o app foi para a bandeja do Windows, com os
  agentes vivos. Para fechar de vez (por exemplo, antes de instalar uma versão nova), use **Sair** no ícone da bandeja.
- **O fluxo não dispara, ou não liga.** Veja a aba **Execuções** do editor e os selos da lista. Para ligar, ele precisa
  de um gatilho e de nenhum cartão, coluna ou servidor "a escolher"; com Código, HTTP, Ferramenta MCP ou comando, só
  você liga. Mais em
  [`fluxos.pt-BR.md`](fluxos.pt-BR.md#quando-algo-dá-errado).
- **Não consigo soltar em "Com o Maestro".** Abra um agente Claude ou Codex com a função **Maestro** no espaço.
- **O espaço não abre nesta janela.** Ele já está aberto em outra; o app leva você até ela.
- **"Juntar ao principal" recusado.** Faça commit (ou descarte) das mudanças no andar e no térreo, e confira que o
  térreo está num ramo.
- **Site do portal pede passkey ou extensão.** Use **Abrir esta aba na janela do Chrome**, entre, e traga de volta.
- **O Leitor não aceita a pasta.** Não vale pasta de rede, a raiz do disco nem a pasta do usuário inteira; fixe uma
  subpasta.
- **Página própria não carrega.** A moldura diz o motivo e oferece **Rever**, **Religar** ou **Recarregar**. Veja
  [`paginas.pt-BR.md`](paginas.pt-BR.md#depurar).
- **O terminal mostra "fora da tela".** É de propósito: o processo continua; volte a tela até ele.
- **Errou?** **Ctrl+Z** desfaz quase tudo no quadro, inclusive apagar um terminal (o cartão volta e o terminal
  abre de novo). O que um agente fechou com `ork fechar` não volta pelo Ctrl+Z.
- **Não salvou?** A pílula "Não consegui salvar. Tento de novo na próxima mudança." aparece no quadro quando o disco
  recusa.
