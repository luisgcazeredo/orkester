# Orkester user manual

English · [Português](manual.pt-BR.md)

[//]: # "Manual checked against the code of 1.9.6 (base 0278334 + A2 Configurações + Fluxos), on 23/11/2026, and updated with the 1.9.7 deliveries (API and MCP in pages, external MCP servers, Kanban folders, D1 to D6) on 24/11/2026. Each section cites where it came from, in a comment like this one, invisible on GitHub and in the app's Leitor. An HTML comment would show as text in the Leitor, hence this form. Paths relative to app/src/."

This manual is for someone who has never seen Orkester. It explains every page, button, menu and shortcut, in the
order you will run into them. The technical references live in other files: the agents' command in
[`ork.md`](ork.md), the MCP server in [`mcp.md`](mcp.md), the guide to building flows in [`fluxos.md`](fluxos.md)
and the guide to building your own pages in [`paginas.md`](paginas.md).

## Contents

1. [What it is](#what-it-is)
2. [First steps](#first-steps)
3. [The window](#the-window)
4. [The canvas](#the-canvas)
5. [Agent cards](#agent-cards)
6. [The other cards](#the-other-cards)
7. [Links, bands and scores](#links-bands-and-scores)
8. [Code viewer and code trees](#code-viewer-and-code-trees)
9. [Floors](#floors)
10. [Spaces and windows](#spaces-and-windows)
11. [The Leitor de Markdown page](#the-leitor-de-markdown-page)
12. [The Rotinas page](#the-rotinas-page)
13. [The Agentes page: roles, presets, model and effort](#the-agentes-page)
14. [The Kanban page](#the-kanban-page)
15. [The Fluxos page](#the-fluxos-page)
16. [Configurações: general, appearance, connections and shortcuts](#configurações)
17. [Own pages ("+")](#own-pages-)
18. [The team and the `ork` command](#the-team-and-the-ork-command)
19. [Connecting your own Claude from outside (MCP)](#connecting-your-own-claude-from-outside-mcp)
20. [Where the data lives](#where-the-data-lives)
21. [Tips and common problems](#tips-and-common-problems)

## What it is

Orkester is an infinite canvas where every terminal becomes a card. Claude Code, Codex and PowerShell run for real
inside the cards, next to sticky notes, files, a browser and drawings. Three ideas hold the rest together:

- **The canvas is the state.** Position, name, group and link decide who can reach whom. Dragging an agent into a
  band is putting it on the team.
- **The link is the permission.** An agent only talks to whoever is linked to it by a cord (or sits in the same
  band).
- **The agent has hands.** Inside any terminal on the canvas there is the `ork` command: with it the agent opens
  other agents, delegates, reads the screen of whoever is linked to it and arranges the canvas.

It needs Windows 11 x64. Orkester does not ship Claude Code or Codex: install them separately, with your own
accounts. Without them, PowerShell cards work just the same.

## First steps

[//]: # "ui/ListaDeEspacos.tsx:22-39, ui/BarraFerramentas.tsx:119-259, quadro/Quadro.tsx:171-179"

1. **Install and open it.** The installer is not signed: Windows shows "O Windows protegeu o computador" (Windows
   protected your PC). Click **Mais informações → Executar assim mesmo** (More info → Run anyway).
2. **Create a workspace.** In the list on the left, the **Novo espaço de trabalho** (new workspace) button. Give it
   a name and pick the **Pasta do projeto (onde os terminais abrem)** (project folder, where the terminals open)
   with **Escolher pasta…** → **Criar**. A space is a canvas tied to a folder.
3. **Open an agent.** In the toolbar at the top, click **Terminal** and choose **Claude Code**, **Codex** or
   **PowerShell**. The card is born in the middle of the screen, already running in the space's folder.
4. **Talk to it.** Click the card to select it on its own: the keyboard now goes to the terminal. Type as you would
   in your usual terminal.
5. **Open a second agent and link the two.** Hover over an agent card: two dots appear on its sides ("Arraste até
   outro terminal para ligar", drag to another terminal to link). Drag from one of them to the other card. The line
   that stays is the **corda** (cord, the link): now the two can talk with `ork pedir`, `ork ver` and
   `ork entregar`.
6. **Let the agent build the team.** Ask the first one: "open a Codex to review what you do". It uses
   `ork abrir codex …` and the new card is born beside it, already linked.
7. **Explore.** Press **?** on the canvas to see the shortcut sheet, and **Ctrl+K** to search any card, floor,
   space or command.

## The window

[//]: # "casca/Casca.tsx:201-209, casca/BarraPaginas.tsx, paginas/configuracoes/abrir.ts, App.tsx:39-55"

- **Page bar** (the icon rail, left of everything). From top to bottom: **Quadro** (canvas), **Leitor de
  Markdown**, **Rotinas**, **Agentes**, **Kanban**, **Fluxos**; then a divider and your
  own pages ("Nome (página extra)"); then the **+** (own pages); and, at the foot, the **gear**, which opens
  [Configurações](#configurações) (general, appearance, connections and shortcuts). The page on screen is marked.
  Hover to see the name.
- **Space list** (right of the page bar). It only appears on the Quadro page; hide or show it with the
  "Mostrar ou esconder os espaços" button, in the top left corner of the canvas.
- **The page content.** The canvas stays alive when you go to another page: the terminals do not drop.
- **Window title**: "‹space› — Orkester ‹version›".

Each page's shortcuts only work while that page is on screen. There is no keyboard shortcut to switch pages: use
the bar or the palette (Ctrl+K), which has "Rotinas (página)", "Kanban (página)", "Fluxos (página)", "Agentes (página)", "Funções (página Agentes)",
"Presets (página Agentes)", "Partituras (página Agentes)", "Configurações", "Geral (Configurações)", "Aparência:
temas e cor de destaque (Configurações)", "Conexões (Configurações)" and "Atalhos (Configurações)".

## The canvas

### Toolbar (top, centre)

[//]: # "ui/BarraFerramentas.tsx:119-285, ui/menus.ts:322-334, estado/coresDeDados.ts"

| Button | What it does |
|---|---|
| **Selecionar (V)** | the normal tool: click, select, drag |
| **Terminal** | opens the terminal menu (below) |
| **Post-it (N)** | the next click on empty space creates a sticky note |
| **Anexar arquivo** | picks a file from disk and puts a card for it in the middle of the screen |
| **Árvore de arquivos de uma pasta** | picks a folder and puts a card with its tree |
| **Portal: navegador no quadro** | creates an embedded browser, opened on Google |
| **Texto (T)** | the next click on empty space creates a loose text |
| **Desenhar (D)** | pencil, rectangle, arrow and eraser, with 7 colours |

Clicking an active tool again goes back to Selecionar, and after you create a card the tool goes back on its own.

**Terminal menu:**

- **Agentes**: one button per preset (factory: Claude Code, Codex, PowerShell). Creates the terminal in the middle
  of the screen.
- **Funções**: one button per role (a saved part with a prompt). The agent is born with the role's name and gets
  its prompt as the first request. With more than 8 roles, "Filtrar funções…" appears (Enter opens the first).
- **Times**: the scores (saved teams). Clicking raises the whole team.
- At the foot: **Editar presets…**, **Editar funções…** and **Partituras…** (they open the Agentes page on the
  right tab).

**Drawing bar** (with Desenhar on): **Lápis**, **Retângulo**, **Seta**, **Borracha** (E: pass over the strokes to
erase) and the colours. Clicking a stroke with Selecionar selects it; dragging moves it.

### Screen corners

[//]: # "ui/Controles.tsx:50-213, ui/Andares.tsx:262-301"

- **Top left**: "Mostrar ou esconder os espaços"; off the ground floor, the floor indicator (click goes back to
  the ground floor).
- **Top right**: **Arquivos e pastas (Ctrl+Shift+E)** opens the explorer on the right; **Ver tudo** frames all the
  content; **Tema claro / Tema escuro** switches the theme base.
- **Bottom right**: the **Andares** pill; **Mini-mapa**; **Contexto dos terminais**; and the zoom
  (**Diminuir (Ctrl -)**, the value in %, which goes back to 100% when clicked, and **Aumentar (Ctrl +)**).

**Mini-mapa**: a 200×130 thumbnail with one rectangle per card and the visible area. Click a point to take the
screen there (dragging inside it does not move).

**Contexto dos terminais**: lists the space's terminals with their state (free, working, question, finished), the
context still left in % and a bar. Updates every 5 s; clicking a terminal takes you to it. "—" when the client
does not let the context be read (Codex does not expose it).

**Explorer on the right** ("Arquivos"): the space's (or the floor's) folder always stays pinned; **Abrir uma pasta
aqui** adds others, each with **Atualizar** and **Tirar do explorador** (the folder on disk is not touched). Right
click on a file: **Ver o código no quadro**, **Abrir no programa do sistema**, **Pôr o arquivo no quadro**,
**Anexar ao prompt de** ‹terminal›, **Mostrar no Explorer**. On a folder: **Pôr a árvore no quadro**, **Anexar ao
prompt de**, **Mostrar no Explorer**.

### Selection bar

[//]: # "ui/BarraSelecao.tsx:30-87"

A pill floats above whatever is selected: **Cor**, **Duplicar (Ctrl+D)**, **Agrupar (Ctrl+G)** (several items),
**Desagrupar (Ctrl+Shift+G)** (one group), **Tirar do grupo** (one item of a group), **Travar (não move nem
apaga)** / **Destravar**, **Apagar (Delete)** and **Mais opções** (the same menu as the right click). With several
items, it shows how many.

A **locked** card shows a padlock: it does not move, resize or get deleted, but it stays usable.

### Mouse

[//]: # "quadro/Quadro.tsx:112-310, quadro/MolduraNo.tsx:41-80, quadro/arrasto.ts, estado/selecao.ts:100-161"

| Gesture | Does |
|---|---|
| Drag on empty space, middle button, or **Space** + drag | moves the view |
| Wheel | scrolls the canvas |
| **Ctrl** + wheel, or pinch on the touchpad | zoom at the mouse point (10% to 200%) |
| **Shift** + drag on empty space | selection rectangle (adds to the selection) |
| **Shift** or **Ctrl** + click | adds to or removes from the selection |
| Drag a card | moves the whole selection; near the edge, the screen moves along |
| **Alt** while dragging | releases the guides' magnet (which snaps to edges and centres) |
| Esc in the middle of a drag | puts everything back in place |
| Handle on the corner of the selected card | resizes (an image does not distort) |
| Click an item of a group | selects the group; click again takes just the item |
| Double click on a sticky note or text | edits |
| Right click | menu for whatever is under the mouse |

### Keyboard

[//]: # "quadro/atalhos.ts:64-109, ui/Atalhos.tsx:20-61"

The shortcuts do not work while you type in a field, with a menu or dialog open, or with **a terminal selected on
its own** (then the key belongs to the terminal).

| Key | Does |
|---|---|
| **V** / **N** / **T** / **D** / **E** | Selecionar / Post-it / Texto / Desenhar / Borracha |
| **Esc** | cancels the gesture, clears the selection, leaves editing, closes an open layer, goes back to Selecionar |
| **Ctrl+Z** / **Ctrl+Y** or **Ctrl+Shift+Z** | undo / redo (each floor has its own) |
| **Ctrl+C** / **Ctrl+X** / **Ctrl+V** | copy, cut, paste (also between spaces and windows) |
| **Ctrl+D** | duplicates (40 px to the side; a duplicated terminal gets " (cópia)" and a new conversation) |
| **Ctrl+A** | selects everything |
| **Ctrl+G** / **Ctrl+Shift+G** | group / ungroup |
| Arrows (**Shift**: 10 px) | nudge the selection 1 px |
| **Delete** or **Backspace** | deletes |
| **Ctrl+=** / **Ctrl+-** / **Ctrl+0** | zoom in / out / 100% |
| **Ctrl+1** | see everything |
| **Ctrl+K** | palette: searches card, floor, space, flow or command (on any page) |
| **Ctrl+Shift+N** | new window (another space at the same time) |
| **Ctrl+Shift+E** | shows or hides the explorer on the right |
| **?** | the shortcut sheet |

**Paste** uses the system clipboard: copied cards come back as cards; a screenshot becomes an image card; short
text (one line, up to 60 characters) becomes a loose text; longer text becomes a sticky note. **Copying** cards and
pasting outside the app gives plain text (terminal name, sticky note content, file path, portal address).

### Command palette (Ctrl+K)

[//]: # "ui/Paleta.tsx:74-271"

"Buscar cartão, andar, espaço ou comando…". It opens with **Ctrl+K** on any page. Arrows choose, Enter runs, Esc closes. The search ignores accents. It
lists:

- **Comandos**: new terminal per preset, new sticky note, text, portal, attach file, folder tree, paste, new
  floor, new window, see everything, select everything, show/hide the mini-map, light/dark theme, shortcuts and
  the pages.
- **Cartões** of the floor on show (choosing one takes the screen to it and selects it).
- **Andares** and **Espaços** (one open in another window says "outra janela").
- **Fluxos** of the open space, by name, with "ligado" or "desligado" (on/off) beside it; choosing one opens it in
  the editor.

### Right-click menus

[//]: # "ui/menus.ts:126-690"

**On the canvas background**: Novo terminal ▸ (presets), Post-it, Texto, Anexar arquivo…, Árvore de uma pasta…,
Portal (navegador), Banda (grupo de agentes)…, Colar aqui, Andares ▸ (Novo andar…, Térreo, each floor), Selecionar
tudo, Ver tudo, Mini-mapa, Tema claro/escuro, Atalhos do teclado.

**On every card** (at the end of the menu): Cor ▸, Copiar, Recortar, Duplicar, Tirar do grupo, Trazer para frente,
Enviar para trás, Travar/Destravar, Apagar. Card colours: Sem cor, Azul, Roxo, Rosa, Vermelho, Laranja, Amarelo,
Verde, Cinza. Sticky note: Amarelo, Rosa, Azul, Verde, Roxo.

**With several items selected**: Cor, Copiar, Recortar, Duplicar; with an agent in the selection, **Salvar como
partitura…** and **Juntar numa banda…**; Agrupar/Desagrupar, Desfazer os grupos; **Alinhar** ▸ (left, centre,
right, top, middle, bottom; distribute horizontally and vertically, with 3 or more); Trazer para frente, Enviar
para trás, Travar; Apagar N itens.

**On a link**: Apagar ligação. **On a drawing**: Cor, Duplicar, Tirar do grupo, Apagar desenho.

The menus for agent, band, code, floor and space are in the section for each one.

## Agent cards

[//]: # "nos/PecaTerminal.tsx:16-167, terminal/CorpoXterm.tsx:18-177, estado/caixas.ts:42-49, estado/nos.ts:37-114, ui/menus.ts:532-556"

### Opening

With the **Terminal** button (preset, role or team), with the background menu **Novo terminal**, or with the
palette. An agent can also open another one with `ork abrir`. The card is born at 800×500, with the name of the
preset or role (a repeat on the same floor gets " 2", " 3"…). A role types its prompt as the first request as soon
as the agent is ready. Claude gets a conversation id when it is born, and Codex has its own discovered later: when
the app reopens, the conversation resumes.

### Header

From left to right:

- the engine icon (Claude, Codex or shell) and the **name**;
- the terminal's **number** on the floor;
- **model · effort** (e.g. `opus · xhigh`); when none was chosen, it says `padrão` (default) in soft text, e.g. `opus · padrão`;
- the **agente** badge: this card was opened by an agent through `ork`;
- the **#N** badge: the Kanban task it is working on (click opens it in the Kanban);
- the **⚠ pedido?** badge: the first request may not have gone out (the text says which case: written and not
  sent, could not confirm, the agent did not become ready…). Look at the screen before repeating; clicking
  dismisses the warning;
- the **envelope with a number** badge: the **inbox**, messages from other agents waiting to go in. Orkester types
  one at a time, only when the agent is free and you are not typing in it. The tooltip gives the reason for the
  wait: "ele está trabalhando" (it is working), "ele está numa pergunta" (it is at a question), "você está
  escrevendo aqui" (you are typing here), "há texto seu no campo, ainda não enviado" (there is unsent text of yours
  in the field), "o processo está encerrado" (the process has ended)… If you have already cleared the field and
  the badge persists (it turns red), click it to release.

The header does not show the state (free, working…). That appears in the **Contexto dos terminais** panel (bottom
right corner) and on the **Agentes** page.

### The terminal

- **To type, select the card on its own** (one click). Before that, the card drags from any point and the wheel
  moves the canvas.
- **Scrolling**: with the card active, the wheel scrolls the history (5000 lines).
- **Copy**: **Ctrl+C** copies when there is selected text (with no selection, it goes to the program, as
  interrupt); **Ctrl+Shift+C** only copies. **Ctrl+V** pastes.
- **Zoom**: the terminal follows the canvas zoom (sharp up to 200%). There is no terminal-only zoom.
- **Off screen** for more than 20 s: the card stops drawing and shows "fora da tela · o processo continua" (off
  screen, the process continues).
- **Process ended**: "Processo encerrado (código N)." with **Abrir de novo**.
- **Clearing the context**: there is no button; an agent does it with `ork limpar <name>` (`/clear` in Claude,
  `/new` in Codex), or you type the client's own command in the terminal.

### Footer

- the **folder** the terminal runs in (full path in the tooltip);
- **paperclip** "Anexar arquivo ou pasta ao prompt": picks a file or folder and **writes the path** on the agent's
  line (the file is not sent; the agent reads it from disk);
- **code**: this agent's code cards (open, collapse all, close all). See
  [Code viewer](#code-viewer-and-code-trees).

Dragging a file from Windows onto the canvas does not work; use the paperclip, **Anexar arquivo** or the explorer.

### Agent card menu

**Renomear…**, **Código que ele escreve** ▸, **Trocar o agente** ▸ (another preset in the same place, with the same
name, links and tree; the role is delivered again), **Rotinas…** (opens Rotinas with this card chosen), **Ver
tarefas dele** (Kanban filtered; does not appear on a shell), **Salvar como partitura…**, **Anexar ao prompt** ▸
(Arquivo…, Pasta…), and the common items.

### Closing

**Delete**, **Apagar** in the menu or the bin on the selection bar. Deleting the card ends the process. **Ctrl+Z**
brings the card back, and the terminal opens again.

### Roles, presets, model and effort

- **Preset**: what appears on the Terminal button. Name, engine and the command typed into PowerShell when the
  terminal opens.
- **Função** (role): a part written once. Name, prompt (goes as the first request), optional folder, model and
  effort.
- **Model and effort**: chosen in the presets and roles (the role wins over the preset), on the Agentes page. They
  are not chosen from the card. Efforts: `low`, `medium`, `high`, `xhigh`, `max` and `ultra` (`ultra` only in
  Codex). Suggested models: Claude `fable`, `opus`, `sonnet`, `haiku`; Codex `gpt-5.6-terra`, `gpt-5.6-luna`. An
  agent switches the model of a free card it opened with `ork modelo <card> <model> --esforco <level>` (the
  conversation continues); you, through MCP (`trocar_modelo`).

Details in [The Agentes page](#the-agentes-page).

## The other cards

[//]: # "nos/PostIt.tsx, nos/Texto.tsx, nos/Arquivo.tsx, nos/Imagem.tsx, nos/ArvorePasta.tsx, nos/Portal.tsx, nos/PortalChrome.tsx, ui/menus.ts:559-591, main/dados.ts:97-270"

| Card | How to create | What it does |
|---|---|---|
| **Post-it** | **N** and click on empty space; background menu; paste long text | Simple Markdown: `#` headings, `- ` lists, `- [ ]` tasks with a clickable box. Double click edits; Esc or a click outside leaves. Each sticky note is a `.md` file in `~/.orkester/espacos/<id>/notas/`, readable outside the app |
| **Texto** | **T** and click on empty space; paste short text | Loose text that grows with its content. Menu: **Tamanho** (Pequeno, Médio, Grande, Enorme), **Letra monoespaçada**; the colour is the letter colour. Empty on leaving = deleted |
| **Arquivo** | **Anexar arquivo**; "Pôr o arquivo no quadro" in the explorer | Icon by extension and the name. Double click opens it in the system program. Menu: **Abrir**, **Mostrar no Explorer** |
| **Imagem** | paste a screenshot (Ctrl+V) | Up to 640×480 when it comes in. Stored in `~/.orkester/espacos/<id>/imagens/` |
| **Árvore de pasta** | **Árvore de arquivos de uma pasta**; background menu; explorer | The folder's tree, with **Atualizar**. Click opens folders; double click opens the file in the system program |
| **Portal** | **Portal: navegador no quadro**; background menu; palette | A browser inside the card (see below) |
| **Desenho** | **D** | Pencil, rectangle and arrow; **E** erases |
| **Banda** | background menu or "Juntar numa banda…" | A team (see [Bands](#bands)) |
| **Código** | on its own, when the agent saves; "Ver o código no quadro" | See [Code viewer](#code-viewer-and-code-trees) |

### Portal (browser on the canvas)

[//]: # "nos/PortalChrome.tsx:28-314, nos/Portal.tsx:57-128, nos/endereco.ts, main/navegador.ts:9"

- If the PC has Chrome, the portal uses the app's own Chrome; otherwise, a fallback embedded browser.
- Bar: **Voltar**, **Avançar**, **Recarregar**, the address (Enter navigates; text with a space becomes a Google
  search), **Abrir esta aba na janela do Chrome** (to sign in with a passkey or use an extension; afterwards,
  **Trazer a página de volta para o quadro**) and **Abrir no seu navegador de sempre**.
- When not selected, the card shows "Clique para usar a página" (click to use the page). Selected on its own,
  mouse, wheel and keyboard go to the page (Ctrl+wheel is still the canvas zoom; Ctrl+A/C/X/V/Z/Y edit in the
  page).
- The site's dialogs become app windows ("A página diz", "A página pergunta", "Sair da página?"); a pop-up from the
  site becomes another portal card beside it.
- Sign-ins live in a profile of their own, separate from your browser (`~/.orkester/navegador`). To delete them:
  Configurações › Conexões, **Portais** tab, **Limpar login**.

## Links, bands and scores

### Links

[//]: # "estado/cordas.ts:10-22, quadro/Camadas.tsx:128-153, ui/menus.ts:666-668"

- **Drawing one**: drag from a **port** (the dot on the agent's side, or the one at the bottom of a band) to
  another agent or band.
- **What it means**: the two agents can talk through `ork` (request, see the screen, deliver). A link tied to a
  band counts for each agent inside it.
- **No direction**: linking A→B or B→A is the same link. It does not link a card to itself, nor repeat.
- **Deleting**: click the link and **Delete**, or right click → **Apagar ligação**. Deleting one of the cards takes
  the link with it.
- Agents opened by another agent in the same space are born already linked to whoever opened them.
- The thin lines running from an agent to its code viewers are **not** links.

### Bands

[//]: # "shared/quadro/bandas.ts:1-134, nos/Banda.tsx:10-25, ui/menus.ts:433-437, 492-496, 597-615"

A band is a dashed frame with a name: **every agent whose centre is inside it talks to all the others inside**.
Dragging an agent in or out changes the team.

- **Creating**: background menu → **Banda (grupo de agentes)…** (empty frame), or select agents → **Juntar numa
  banda…** (frame around them). Dialog "Nova banda", field "Nome do time".
- The title bar shows "N agentes · todos se falam" (N agents, all talk to each other) or "vazia: arraste agentes
  para dentro" (empty: drag agents inside). Dragging the frame takes the team along. The bottom port links the
  whole band to an agent outside.
- Menu: **Renomear a banda…**, the list "No time: …" and **Ver o time todo**. At most 24 agents; the name does not
  repeat on the floor.

### Scores (saved teams)

[//]: # "shared/quadro/partituras.ts:8-89, ui/Partituras.tsx, paginas/agentes/Agentes.tsx:260-323, estado/espacos.ts:226-261"

A **partitura** (score) stores a whole team: agents (name, engine, command, role, model, effort), texts, sticky
notes, bands, links and groups. **The folder is not saved**: each agent opens in the folder of the space where the
team is raised (or the role's folder). Code cards, folder cards and portals are not included.

- **Saving**: select the cards → right click → **Salvar como partitura…** → "Nome do time". The same name replaces
  the previous one.
- **Raising**: **Terminal** button → **Times** section, or Agentes page → **Partituras** tab → **Subir**. The team
  is raised in the middle of the screen on the floor on show; if the spot is taken, it moves down until it finds
  room. Ctrl+Z undoes.
- **Renaming and deleting**: Agentes page, Partituras tab. Deleting does not touch the cards already raised.
- They work for every space. Up to 50 scores, 40 cards each. An agent raises a team with
  `ork partitura usar "Nome"`.

## Code viewer and code trees

[//]: # "nos/Codigo.tsx:25-419, estado/codigo.ts:34-327, shared/quadro/visor.ts:17-23, ui/menus.ts:159-276, 619-640, quadro/Camadas.tsx:150-230"

When an agent saves a file in its folder, Orkester opens a **viewer** beside the agent: the list of touched files
on the left (newest on top) and the chosen file on the right, with the **git diff** (+ and − in the gutter). A thin
line ties the agent to the viewer.

**Viewer header**: follow the agent (always shows the newest) or pin to a file; **Abrir no Leitor** and **Ver
formatado** on `.md`; line wrap; **diff ↔ whole file**; **Reler agora**; **Recolher** (becomes a small block with
the name and "N arquivos"; double click opens). Without git, or for a new file, it shows the whole file and says
why.

**"Código que ele escreve" menu** (in the agent menu and on the code icon in the footer): turn on/off **Mostrar no
visor sozinho o que ele gravar**; **Mostrar o último arquivo mexido no visor**; **Árvores** ▸; collapse, open,
gather beside the agent or **Fechar o visor e parar de abrir**; **Mostrar as linhas até os visores**.

**Code trees** split the files by line of work: each tree has a viewer of its own. In the **Árvores** submenu:
**Nova árvore…**, and on each one **Os próximos arquivos vêm para cá**, collapse/open, **Renomear a árvore…** and
**Desfazer a árvore**. On the canvas, a dot with the tree's name sits between the agent and the viewers: clicking
collapses or opens them all; dragging takes the whole tree. An agent creates trees with `ork arvore`.

**A single file**: explorer → **Ver o código no quadro**. Code card menu: see whole / see what changed, open /
collapse, take out of the agent's column / give back, open in the system program, show in Explorer.

Limits: up to 50 files per viewer. A folder that is too big is not watched ("aponte o agente para a pasta do
projeto", point the agent at the project folder).

## Floors

[//]: # "ui/Andares.tsx:12-371, ui/acoesAndar.ts:37-117, main/andares.ts:11-189, ui/menus.ts:757-788"

A **floor** (andar) is another level of the same space, with its own cards and undo. If the space's folder is a
git repository, the floor gets **a branch and a folder of its own** (`git worktree`), and its terminals open
there: two teams work on the same project without stepping on each other. The main floor is called **Térreo**
(ground floor).

- **Creating**: background menu → Andares → **Novo andar…**, the palette, the space menu or "+ Novo andar" in the
  stack. Name it after what is going to be done. With git, the "Ramo isolado com git" box creates `andar/<name>`
  from the current branch, in a folder under `~/.orkester/andares/`. Without git, the floor is just a new canvas on
  the same folder.
- **Entering**: the **Andares** pill (bottom right corner) opens the 3D view with one pill per floor ("3 commits ·
  2 alterados" or "em dia", updated every 5 s). Click enters; right click opens the menu. Also through the
  background menu, the palette and the space list. Off the ground floor, the indicator in the top left corner goes
  back to the ground floor.
- **Floor menu**: **Ir para este andar**, **Renomear…**, **Status** ▸ (Trabalhando, Travado (precisa de você), Em
  revisão, Pronto, Sem status; shown as a coloured dot), **Mostrar pasta do andar no Explorer**, **Juntar ao
  principal…** (git only) and **Apagar andar…**.
- **Juntar ao principal** (merge into main): does a `--no-ff` merge of the floor's branch into the ground floor's
  branch, takes the floor off the canvas and deletes its folder (with an option to delete the branch too). It is
  refused if the ground floor has no branch (detached HEAD) or if the floor or the main one has uncommitted
  changes.
- **Apagar andar**: warns about losing whatever is uncommitted; deleting the branch is optional (the commits are
  gone).

## Spaces and windows

[//]: # "ui/ListaDeEspacos.tsx:22-153, ui/menus.ts:694-748, main/janelas.ts:5-203, shared/janelas.ts:65-133"

- **Space list**: "Filtrar", **Nova janela** (Ctrl+Shift+N) and **Novo espaço de trabalho** at the top. Each space
  shows how many terminals it has and an icon when it is open in another window ("clique para ir até ela", click
  to go to it). Click opens; double click renames; the floors appear under each space.
- **Space menu**: Abrir, Abrir em nova janela, Ir para a janela dele, Renomear…, Mostrar pasta no Explorer, Novo
  andar…, **Apagar espaço…** (the canvas, the sticky notes and the floors leave the app; the project folder and the
  git branches are not touched; close its window first).
- **Windows**: each space opens in a single window; asking for a space that is already open brings its window to
  the front. When the app reopens, the windows of the last session come back (up to 6), where they were.
- The terminals stay alive when you switch spaces.

## The Leitor de Markdown page

[//]: # "paginas/leitor/*, main/leitor.ts, main/leitorCaminhos.ts, shared/leitor.ts, shared/markdown.ts"

Reads `.md` files formatted, without editing anything.

- **On the left**: the folders of every space (tag *espaço*) and the ones you pinned; **Fixar pasta…** adds one
  (the unpin icon removes it); the search **"Buscar por nome (Ctrl+F)"** (each word must be in the path, ignoring
  accents); the tree (folders first).
- **On the right**: the formatted file, with **Voltar (Alt+←)**, up to 50 files of history. Reloads on its own when
  the file changes on disk, without losing the scroll.
- **Links**: `http(s)` and `mailto` open in the system browser; a relative link to another `.md` opens in the
  Leitor. Images appear only as their alt text, and HTML inside the file appears as text.
- **Shortcuts**: **Ctrl+F** searches, **Esc** closes the notice and then clears the search, **Alt+←** goes back.
- **Limits**: file up to 400 KB; tree up to 3000 files and 10 levels; ignores `node_modules`, `.git`, `dist`,
  `out`, `build` and folders starting with a dot; up to 20 pinned folders. It does not accept a network folder, the
  root of a drive or the whole user folder (a subfolder is fine).
- From the canvas, the code viewer's **Abrir no Leitor** button opens a `.md` here.

## The Rotinas page

[//]: # "paginas/rotinas/Rotinas.tsx, main/rotinas.ts, shared/rotinas.ts, main/espera.ts:231-256"

The app **types** a request (or command) into a terminal card at the set time. If the terminal is busy, stopped at
a question, finished, or you are typing in it, the routine **skips its turn** (it does not pile up).

- Routines appear grouped by space. Each one shows the card, the frequency ("a cada 30 min", "todo dia às
  09:00", "toda terça às 09:00"), the next time, the last result ("rodou", "pulou: o terminal estava ocupado"…)
  and how many times it ran.
- Buttons: **Digitar agora (testar)**, **Pausar / Voltar a rodar**, **Apagar rotina** (only in this window's
  space).
- **Nova rotina no espaço aberto**: name, the card (terminals of the floor on show), the text to type, and the
  frequency: **a cada…** (every, 1 to 10080 minutes), **todo dia às…** (every day at) or **toda semana…** (every
  week, day and time) → **Criar rotina**. From the card menu, **Rotinas…** arrives with it already chosen.
- **They only run with the space open in a window.** Those of other spaces appear here; pausing, turning on and
  testing work for them, creating and deleting do not.
- Up to 40 routines per space; text up to 2000 characters.

## The Agentes page

[//]: # "paginas/agentes/Agentes.tsx, Funcoes.tsx, Presets.tsx, shared/modelos.ts, main/modelos.ts, shared/catalogo.ts"

Four tabs: **Agentes**, **Funções**, **Presets**, **Partituras**.

**Agentes**: every live agent of every space, read-only ("daqui não se comanda agente nenhum", no agent is
commanded from here). Filters by **Espaço**, **Situação** (free, busy, at a question, finished) and **Motor**;
**Recolher todos / Abrir todos**. Each card shows role, engine, model · effort (`padrão` when none was chosen; since
1.9.7, with what the engine's config says in parentheses, in soft text, like "padrão (gpt-5.6-terra · high)", read
only from the model and effort keys of `~/.claude/settings.json` or `~/.codex/config.toml`; when it cannot be read,
just `padrão`), inbox ("N recados esperando") and
the Kanban tasks (clicking opens the task, switching the window to its space). Updates every 3 s.

**Funções**: each role has a name, **modelo**, **esforço**, folder (empty = the space's) and the prompt ("O que ele
é, o que se espera dele, o que não fazer…"). **Nova função**, **Desfazer alterações**, **Salvar** (off while there
is an error: no name, repeated name, empty prompt, invalid model, effort the engine does not accept). An agent
opens a role with `ork abrir claude --funcao "Nome"`. A role named **Maestro** has a special part in the Kanban.

**Presets**: Nome, Motor (Claude Code, Codex, Só o PowerShell), Comando digitado no PowerShell, Modelo, Esforço.
**Novo preset**, **Restaurar padrão**, **Desfazer alterações**, **Salvar**. From 1 to 50 presets; one-line command.

**Partituras**: the list of saved teams, with **Subir**, **Renomear** and **Apagar**.

**Model and effort**: what counts is the request's, then the role's, then the preset's. Empty = the engine's
default. Efforts `low`, `medium`, `high`, `xhigh`, `max`, `ultra` (Claude does not accept `ultra`). The models
offered come from `~/.orkester/modelos.json` (optional, you write it), from the Codex cache and from the factory
ones. A model outside the list opens with a warning; an effort the engine does not accept is refused.

**Importing a catalogue** (team sheets in `.md`): there is no button. Use `ork catalogo importar <folder>` or the
MCP tool `importar_catalogo`. See [`ork.md`](ork.md#team-sheets).

## The Kanban page

[//]: # "paginas/kanban/*, shared/kanban.ts, main/kanban.ts"

The tasks of this window's space, in columns. "Tarefa" (task) belongs to the Kanban; "cartão" (card) is still the
canvas one.

**Factory columns**: **Demandas** → **Com o Maestro** (with the Maestro) → **Fazendo** → **Revisão** → **Feito**.
Demandas, Com o Maestro and Revisão can be renamed but not deleted.

**Top**: the space list (switching there switches the window's space); **+ Demanda**; **⋯** with **Nova
coluna…**, **Renomear coluna**, **Apagar coluna** (empty only; if a flow uses the
column, the app asks for confirmation first, listing the flows with **Ver o fluxo**, see the flow; the enabled ones
turn off when you delete) and **Lixeira (N)**. Each column has its own **⋯** in the header, with Organizar (see
[Folders](#folders-and-organizar) below). Filters: search ("título,
descrição ou #número", key **/**), **Quem trabalha**, **Etiqueta**, **Esconder concluídas há mais de 7 dias**
(comes ticked) and **Limpar filtros**.

**"Ocupados sem tarefa" strip** (busy without a task): agents working with no open task. Click → **Pôr numa
tarefa** or **Ir ao cartão**.

**Columns**: double click on the name renames. In Demandas, **+ Demanda** opens a field that stays open for the
next one. **Com o Maestro** shows who the Maestro is and whether it is free, or "sem Maestro".

**Task**: number, title, tags, comments and a chip for each agent working on it (with its state). Click opens the
**panel** on the right: editable title, column, **Delegar ao Maestro** (in Demandas), **Trabalhando nela** (Ir ao
cartão, remove, **+ pôr um agente**, which notifies its inbox), tags (up to 8, up to 24 characters each; you can type
several at once separated by commas, `cliente-a, 1.9.7`, and Enter; a repeated one goes in once, a longer one is cut
at 24 and one past 8 is left out, and the notice says which; the field suggests the tags in use in the space; creating
a task takes only the title: tags go in afterwards, in the panel), description in Markdown (pencil to
edit), **Comentários** (Ctrl+Enter sends) and **Apagar (vai para a lixeira)**.

**Dragging**: move the task between columns (Esc cancels). **Dropping on "Com o Maestro" = delegating**: the
Maestro gets the request in its inbox. The Maestro is the live Claude or Codex agent with the role named
**Maestro**; without it, the column refuses ("Não há Maestro aberto neste espaço", there is no Maestro open in this
space). Moving the task back to Demandas, or deleting it, undoes the delegation.

**Rules**: delegating is yours alone. Agents work on the tasks through `ork kanban` (take, move, comment); an agent
that is not the Maestro takes it to Revisão, and Feito belongs to you and the Maestro. Assigning only notifies the
agent. The **#N** badge on the agent's card shows its task.

**Shortcuts**: **N** new demand, **/** search, **Esc** closes the panel.

**Lixeira** (bin): **Restaurar** (what was with the Maestro goes back to Demandas) and **Esvaziar a lixeira**.

Limits: 500 tasks, title 120 characters, description 8 KB, 12 columns, bin of 50.

### Folders and Organizar

[//]: # "paginas/kanban/{Coluna,pastas,PainelDaTarefa,filtros}.ts(x), shared/kanban.ts, shared/kanbanOrganizar.ts, main/kanban.ts (1.9.7, K1, K2 and simple Organizar)"

Since 1.9.7 each column groups its tasks into **collapsible folders** (*pastas*; one per version, for example), so
Feito does not become an endless list. It works for any space: folders come from the tasks' **labels**.

- **In the column**: tasks without a folder stay at the top; then the folders, newest to oldest. Click a folder's
  header to open or collapse it; what stays collapsed is kept on this machine, per space. In **Feito**, only the
  current version's folder starts open.
- **One task**: its panel has the **Pasta** (folder) field, with suggestions from the existing folders; type and Enter
  changes it, clear and Enter removes it. Dragging a card into a folder also puts it there. A folder with the same name
  ignoring case and accents becomes the same one (no "geral" next to "Geral"). Names up to 40 characters.
- **Filter and search**: there is a **Pasta** filter; the search also matches the folder name and opens the folders
  that have results.
- **A version label** is one that looks like a version: `1.9.6`, `v2.0` (`2024` and `fluxos` do not count).
- **Automatic**: a task without a folder that **reaches Feito** with a version label goes into that version's folder
  on its own, and its history says "Organizar automático". A task already in Feito whose folder you removed does not
  go back. It comes on; in the final column's **⋯** menu, the item reads **Organizar sozinho por versão: ligado
  (desligar)** (organize by version on its own: on, turn off) or **…: desligado (ligar)** (off, turn on), and only you
  change it.
- **First opening in 1.9.7**: once per space, if Feito has tasks without a folder that carry a version label, the page
  puts them into the version folders and shows "Feito organizado por versão · **Desfazer**" (Feito organized by
  version · Undo). A space with no version label: nothing happens, not even a notice.
- **Organizing a column**: in the **⋯** menu of each column's header (there is no button at the top):
  - **Organizar por versão** (by version; only shows if the column has a version label);
  - **Uma pasta para cada etiqueta** (one folder per label; disabled if no task without a folder has a label): each
    task goes into the folder of one of its labels. With several, the version label wins; without one, the label most
    used in that column; on a tie, the first in alphabetical order. The task stays in one folder only, and its other
    labels stay on it;
  - **Juntar numa pasta ▸** (gather into a folder): pick one of the column's labels, with how many tasks **without a
    folder** have it (`cliente-a (3)`); only those go into the folder of the same name. A label whose tasks are all in
    folders already shows disabled, "(já em pastas)" (already in folders).

  It applies at once, with no preview, and only to tasks **without a folder** (a task with a folder is never touched
  by anything automatic). Then the notice says where they went, with **Desfazer** (undo): `2 tarefas → pasta "1.9.7"`
  or `5 tarefas → 3 pastas`, and the target folder opens and the column scrolls to it. With nothing to change, "Nada a
  organizar em <coluna>: …" (nothing to organize) and nothing is saved. If someone touched one of those tasks
  afterwards, Undo skips it. With a read-only kanban, none of this is active.
- **From agents**: `ork kanban pasta` and `--pasta` on create and edit (see [`ork.md`](ork.md#kanban)); through MCP,
  `pasta` in `kanban_criar`/`kanban_editar`. Organizing many tasks at once is always yours, on the page.

## The Fluxos page

[//]: # "paginas/fluxos/{Fluxos,Lista,Pastas,Editor,PainelDoNo,Execucoes,ConfirmarLigar}.tsx, paginas/fluxos/editor/teclas.ts, shared/fluxos/*, main/fluxos/servico.ts, main/regrasDaBandeja.ts, main/bandeja.ts"

Automations drawn as nodes (*fluxos*, flows): a **trigger** (a task that changes column, a delivery, an agent that
stopped, the clock, or the **Rodar fluxo** button) and what to do next (message, task, notice, decide, change the data,
JavaScript, call an API). Each space has its own flows. **The full guide** (the format, each node's settings,
expressions, Code, HTTP, credentials, limits and recipes) is in [`fluxos.md`](fluxos.md).

**List**

- **Top**: **Espaço:** (this window's space shows as "(aberto aqui)", open here; other spaces can only be viewed),
  **Buscar fluxo** (search across all folders, accent-insensitive) and **Novo fluxo** (new flow; only in the space
  open in this window).
- **Folders** (*Pastas*), on the left: **Todos os fluxos** (all), **Sem pasta** (no folder) and yours, each with its
  count. A parent folder also shows the flows of its subfolders (with each one's folder on its row), and its count
  adds theirs. **Nova** creates a folder (up to 3 levels and 100 folders; name up to 60 characters, unique in the same place);
  hover a folder to **Renomear** or **Apagar** it (the flows inside it, and in its subfolders, go to "Sem pasta"). Drag
  a flow onto a folder to keep it there, or use the folder selector on its row.
- **Each flow**: the switch (**Ligado: clique para desligar** / **Desligado: clique para ligar**, on / off), the name
  (click opens the editor), the triggers, how many nodes, the cap ("até 6/hora", up to 6 per hour), the folder, who
  created and who edited it, and the last firing ("hoje 14:03" with **ok**, **erro**, **barrado: laço**, **barrado:
  excesso** or **sem destino**; or "nunca disparou", never fired). Badges: **Código, HTTP, MCP ou comando** (it is
  sensitive), **criado por agente**, **editado por agente** and the reason for an automatic switch-off (**desligado por
  excesso de disparos**, **desligado: um cartão saiu do quadro**, **desligado: uma coluna saiu do kanban**, **desligado: mudou sem a sua
  aprovação**). The bin
  icon deletes the flow and its runs.
- A flow file that does not open shows in a notice with the reason; it does not run and is not deleted.
- **Examples**: the first time, the space gets three flows, turned off, in the Exemplos folder ("Tarefa pronta avisa o
  Maestro", "Agente parou numa pergunta" and "Revisão de fim de dia"). Once deleted, they do not come back.

**Editor** (click a flow's name, or **Novo fluxo**)

- **Top**: **← Fluxos** (back to the list; clicking **Fluxos** in the page bar also goes back), the flow's name, the "não salvo" (unsaved) badge, the **Fluxo** and
  **Execuções** tabs, **Undo** and **Redo**, **+ Nó** (add node), **Rodar fluxo**, the **Rede local: N endereços** badge (when a local address is allowed; see below), the **Ligado/Desligado** switch and
  **Salvar** (Ctrl+S). With unsaved changes, leaving the editor or switching page asks: **Continuar editando**,
  **Descartar** or **Salvar e sair**.
- **Move and zoom**: the mouse wheel moves; **Ctrl+wheel** zooms at the pointer; dragging the background also moves;
  **Shift+drag** on the background selects an area. **1** shows everything.
- **Add a node**: **+ Nó**, **Tab**, **N** or a double click on empty space open the node search ("Buscar nó (gatilho,
  recado, Se…)"), with the groups **Gatilhos** (triggers), **Orkester**, **Lógica** (logic) and **Fora do Orkester**
  (outside Orkester).
- **Link**: drag from a node's output dot to another node. Dropping on empty space opens the search for the next node
  ("Que nó vem depois?"), already linked. The **Se** (If) node has two outputs, true and false. A trigger takes no
  incoming link: coming from an output (or with a node selected), the search shows the triggers at the end, in a group
  of their own with the note "gatilho entra solto" (a trigger comes in unlinked), and the trigger you pick is born
  without a link.
- **Keys**: **Del** deletes the selection (nodes or the clicked link); **Ctrl+Z** undoes, **Ctrl+Y** or
  **Ctrl+Shift+Z** redoes; **Ctrl+A** selects all; **F2** renames the node; **Enter** opens the node panel; **Esc**
  closes the search or the panel.
- **Copy and paste**: **Ctrl+C** copies the selected nodes (or the whole flow) as JSON; **Ctrl+V** pastes. It also
  pastes a whole flow copied from Orkester or from `ork fluxo ver --json`. Cards and columns are matched by name in this
  space; whatever does not match becomes "a escolher" (to choose). Pasting nodes into an enabled flow turns it off on
  save.
- **Node panel** (double-click the node or **Enter**): the name and type at the top and three columns: **Entrada**
  (input), **Ajustes** (settings) and **Saída** (output). The settings change with the type; fields that accept
  `{{ field }}` say so underneath. Input and Output show the items of the open run, as **Tabela** (table) or **JSON**
  (the Code node also shows its `console.log`). **Notas** is free text for whoever reads the flow later. **Fechar
  (Esc)**.
- A node with something missing shows **Falta: …** (missing), and **Salvar** refuses the flow, saying why.
- A flow of a space open in another window opens with the badge "outro espaço: só olhar" (other space: view only).

**The 14 nodes** (each one's settings are in the [guide](fluxos.md#the-nodes)):

| Group | Node | What it does |
|---|---|---|
| Triggers | **Tarefa mudou de coluna** | a Kanban task entered a column (by you, by an agent or by anyone) |
| | **Entrega chegou** | an agent delivered with `ork entregar` (filters: from whom, to whom, text that contains) |
| | **Agente parou** | an agent became free, stopped at a question or exited |
| | **Relógio** | every N minutes (at least 2), every day or every week |
| | **Manual** | the **Rodar fluxo** button |
| Orkester | **Recado** | sends a message to an agent or to the Maestro, through the inbox |
| | **Tarefa** | creates a task in the Kanban (in the Com o Maestro column, it delegates) |
| | **Comando no shell** | types a fixed command in a shell card of the space. **Sensitive** |
| | **Avisar** | a notice to you, in the window corner or in a Windows notification |
| | **Consultar o Orkester** | reads tasks, columns, agents, cards, floors, the space, flows or runs **of this space**, one ficha per item. Read only |
| Logic | **Se** | splits the items into true and false, by conditions |
| | **Definir campos** | sets or replaces fields on the items |
| Outside Orkester | **Código** | isolated JavaScript, no disk and no network, 5 seconds. **Sensitive** |
| | **HTTP** | calls an API on the internet, with the key of an API from Conexões › APIs if needed (the **API** field lists only the ones that cover the URL's host; **Criar API** opens the form with the host already filled in). With a "só lê" (read only) API, a writing method is flagged on screen and refused before it goes out. **Sensitive** |
| | **Ferramenta MCP** | calls a tool of a server in Conexões › MCP › Servidores de fora: pick the server and the tool, and the fields come from its schema (1.9.7). A tool that changed is blocked until you review it. **Sensitive** |

**Turning on**. With the switch in the list or in the editor. It needs at least one trigger and no card or column "a
escolher". A flow with a **sensitive** node (Code, HTTP, MCP tool or Shell command) first opens a confirmation showing
each of those nodes in full (for the MCP tool: the server, the tool and the arguments), marked **igual ao que você aprovou** (same as you approved), **mudou** (changed) or **novo**
(new), plus the agent that touched it, if any. Only you can turn on a sensitive flow: an agent cannot. Changing a
sensitive node later turns the flow off until you confirm again. Once on, the flow fires by itself, with guards
against loops and excess (in the [guide](fluxos.md#guards-and-limits)).

**Local network in the HTTP node.** By default the HTTP node only talks to the internet. To call something on your
computer or your local network (e.g. `http://localhost:5678/...`), write the fixed address and port in the node and
click **Permitir localhost:5678 neste fluxo** (allow localhost:5678 in this flow). The permission covers that address
**and port**, no other. With at least one address allowed, the top of the editor shows **Rede local: N endereços**
(local network: N addresses), and **Tirar** (remove) removes each one. DNS names (other than `localhost`) cannot be
allowed: use the IP. Metadata addresses (`169.254.…`) are never allowed. It takes effect on **save**; in an enabled
flow, changing the list turns it off until you confirm again. Only you change it, on the page: an agent, `ork` or MCP
cannot (a `rede` in their JSON is ignored, and they get a warning). Old flows with the whole network allowed open with
no addresses and turned off. More in the [guide](fluxos.md#the-http-node-and-the-network).

**Rodar fluxo** (run flow). Runs what is **saved**, once, now, entering through the **Manual** trigger (without one,
the button says it is missing). It works with the flow turned off. With a sensitive node not yet approved, it opens the
confirmation with those nodes and the button **Aprovar e rodar uma vez** (approve and run once): it runs now and
approves the nodes, but does **not** turn the flow on. The run opens by itself on the drawing.

**Execuções** (runs; the tab at the top of the editor). The flow's last 50, newest first: the result (**ok**, **erro**,
**barrado: laço**, **barrado: excesso**, **sem destino**), when, how long, what fired it (the trigger or Rodar fluxo)
and the reason for an error or a block. Click one to see it on the drawing: green nodes ran, red failed, grey did not
run, and each link shows how many items went through. The banner at the top sums up the run and closes to go back to
editing. In the node panel, that run's Input and Output (up to about 10 KB per node; beyond that, **Cortado**, cut,
shows). No credential ever shows in a run. If any `{{ }}` came out empty, the top strip lists which one and in which
node ("`{{ x }}` veio vazio em <node>").

**Notices**. What an agent does with flows ("Revisor criou o fluxo …") and the failure of an enabled flow show in the
window corner; without a window, in a Windows notification (failures: at most one notice every 10 minutes per flow).

**Tray: with a flow on, closing the window does not quit.** If at least one flow is on in any space, closing the last
window leaves Orkester running in the Windows tray (by the clock), with the icon "Orkester · N fluxos ligados" (and,
since 1.9.7, "· N agentes seguem abertos", N agents still open, when there are live agents): the agents stay alive
and the flows keep firing. The first time, a balloon explains it, also saying how many agents are still open. Click the icon (or **Abrir** in its
menu) to reopen the windows; opening the Orkester shortcut also reopens them. **To quit for good, use Sair on the tray
icon.** If the last enabled flow is turned off while the app is in the tray, it quits by itself. With no flow on,
closing the last window quits the app as always.

## Configurações

[//]: # "paginas/configuracoes/Configuracoes.tsx, paginas/configuracoes/abrir.ts, casca/BarraPaginas.tsx"

The **gear** at the foot of the bar opens the Configurações (settings) page, on the last section you used. On the
left, four sections: **Geral** (general), **Aparência** (appearance), **Conexões** (connections) and **Atalhos**
(shortcuts). The palette (Ctrl+K) has an item for each.

### Geral

- **Sobre** (about): the Orkester version and those of Electron and Chromium.
- **Onde ficam os dados** (where the data lives): the **Pasta de dados** (data folder) and the **Registro (log)**
  (one `.jsonl` a day with `ork` commands, notes, deliveries and routines), each with **Abrir pasta**.
- **Quadro**: **Linhas entre o agente e os cartões de código dele** (lines between an agent and its code cards; the
  same option as "Mostrar as linhas até os visores").
- **Aparência**: the theme in use and **Mudar o tema e a cor de destaque**.
- **Páginas próprias**: on or off and how many are installed, with a shortcut to Conexões › Páginas.

### Aparência

[//]: # "paginas/temas/*, shared/temas.ts, shared/temasUsuario.ts, shared/cssPlugin.ts, estilos/tokens.css"

The app's colours in two steps. It changes at once, stays saved, and the terminal follows.

1. **Base**: **Escuro** (dark, the default), **Claro** (light) or **OLED** (pure black). **Usar** applies;
   **Duplicar** creates a copy of your own to edit.
2. **Cor de destaque** (accent colour): Azul (the default), Vermelho, Verde, Roxo, Laranja, Rosa, Ciano.

**Seus temas** (your themes): editable copies. The editor has **Nome** and the colours by group (Fundo, Bordas,
Texto, Destaque, Perigo e estados, Terminal), each with a picker, a `#rrggbb` field and "Voltar à cor da base";
**Salvar**, **Descartar**, **Apagar**.

**Plugins de CSS**: they only change **tokens** (the app's colour and size variables), inside `:root`,
`.tema-escuro`, `.tema-claro` or `.tema-oled`. No style rules, `url(`, `@import` or outside fonts. Paste the CSS or
**Escolher arquivo .css…** → **Adicionar**. Each plugin turns on and off, moves up and down (the lower one wins).
The **Guia de CSS** explains what a token is, gives an example to copy, what is refused and the table of every
token with its current value. Order of strength: factory tokens < plugins < your theme.

Up to 50 themes and 30 plugins; `.css` file up to 64 KB.

### Conexões

[//]: # "paginas/conexoes/Conexoes.tsx, paginas/conexoes/Credenciais.tsx, shared/chaves.ts, shared/ferramentasMcp.ts, shared/fluxos/credenciais.ts, main/portais.ts"

What ties Orkester to what is outside it, in five tabs: **Chaves**, **MCP**, **Páginas**, **APIs** (it was
**Credenciais** up to 1.9.6) and **Portais**.

**Chaves** (keys): for an outside program (your Claude, Codex) to work on the canvas as you. Give it a name
("Claude Desktop", "notebook") → **Gerar chave**. The key appears **once** ("Copie agora", copy it now), with the
configuration block ready in tabs (**Claude Code**, **Claude Desktop**, **.mcp.json**, **Codex**) and **Copiar**;
**Já copiei** closes. Under **Suas chaves**, each one shows whether it is in use, its beginning, the date and the
last use, and **Revogar** (immediate, no way back). Up to 20 keys.

**MCP**, in two parts:

- **Ligar programas ao Orkester** (connect programs to Orkester): the step by step to connect your program (have a
  key, choose where to paste, replace `COLE_AQUI_SUA_CHAVE` with the key) and **Baixar a lista (.md)** of the tools.
- **Servidores de fora** (external servers, 1.9.7): the MCP servers Orkester uses in the flows' **Ferramenta MCP** node
  and in the "+" pages where you tick the server. **Adicionar servidor** (stdio: the command, arguments, folder and
  variables, each as text or as a **Segredo**, with **Criar segredo** right there; or http: the URL and a header from
  an API of **APIs**, https only), **Importar do Claude Code** and **Importar de um arquivo…** (reads `mcpServers`;
  what is secret becomes an encrypted credential; you tick which ones come in; a server with a key in its arguments or
  URL is not offered, and the warning says where it is so you move it to an environment variable or a header). Each card shows the status, the full
  command with the warning "roda no seu PC com os seus poderes" (runs on your PC with your powers), and the buttons
  **Testar** (lists the tools: "diz que só lê", says it only reads, or, in red, "pode mudar coisas", may change
  things), **Rever ferramentas mudadas** (shows when a tool changed: it stays blocked until you accept), **Editar**,
  **Pausar / Religar** and **Remover**. An HTTP server that signs in through a login (ClickUp's) gets the **Precisa de
  login (chega na 1.9.8)** badge.
- **Segredos dos servidores** (server secrets, 1.9.7): the value of an environment variable a stdio server reads. It
  has no domain and never goes in a header or an HTTP request. **Guardar o valor de uma variável de ambiente** (save the
  value of an environment variable) opens the form; each secret has the same card as the APIs (**Trocar o valor**,
  **Editar**, **Apagar**, which asks `Apagar o segredo "Nome"?` and lists the servers that use it); the form's button
  is **Guardar o segredo** (save the secret). The server cites the secret by id, so renaming does not break it. Same vault and same file
  as the APIs; up to 1.9.6 it showed in the Credenciais tab.

Details in [`mcp.md`](mcp.md) (both parts).

**Páginas**: the master switch **Ligar páginas próprias (experimental)**, **Adicionar página…** and one card per
installed page (see [Own pages](#own-pages-)).

**APIs** (it was **Credenciais** up to 1.9.6): the key of each API that [own pages](#own-pages-), the **HTTP** node of
the [flows](#the-fluxos-page) and the header of an http MCP server use without the value showing. Pages and flows call
the API by its **name**. **Guardar uma API** (save an API): **Nome** (how pages and flows will call it, "ClickUp"),
**Tipo** (**Token (Bearer)**, **Cabeçalho próprio** — a custom header — with its **Nome do cabeçalho**, or **Usuário e
senha (Basic)**), **Domínios onde ela pode ir** (where it may go, one per line; `*.exemplo.org` covers the subdomains,
not `exemplo.org` itself), the value and **O que ela pode fazer** (what it can do): **Só lê (GET, HEAD)** (read only)
or **Lê e escreve** (reads and writes, in red). A "só lê" API lets pages and flows only query: a POST, PUT, PATCH or
DELETE is refused before it goes out. In an MCP server's header this does not apply (MCP always POSTs, and what
changes things is chosen per tool). A new API starts as "só lê"; the ones saved in 1.9.6 count as "lê e escreve". →
**Guardar a API** (save the API, encrypted). With at least one API saved, the form sits behind the **+ Nova API** (new
API) button. Under **Suas APIs**, each one shows its type, its domains, the **só lê** or **lê e
escreve** (red) badge and only the last 4 characters, with **Trocar o valor** (replace the value), **Editar** and
**Apagar**. **Editar** warns when you change the name: "Vão parar até você ajustar: …" (they will stop until you adjust
them; amber, with the list), or "Nada usa esta API agora: mudar o nome não quebra nada." (nothing uses it now); after
saving, the app says who cited the old name. **Apagar** (delete) asks first, `Apagar a API "Nome"?`: the value is gone
for good, and the dialog lists who uses it ("Nada usa agora.", or the flows, pages and servers, which are not touched:
their next request fails), with **Apagar assim mesmo** (delete anyway) when something uses it. If it cannot check who
uses it, it does not delete. You can also create an API without coming here: the **Criar
API** button is in a page's acceptance and in the HTTP node, with the domain already filled in. The MCP servers'
secrets (environment variables) live in the **MCP** tab. They work in every space, only go over https and only to the
domains you marked, and are encrypted by the Windows vault; without the vault the tab is **Só leitura** (read-only) and
saves nothing. The value never comes back to the screen, nor to `ork`, MCP or the Code node. Up to 100 (APIs and
secrets added up). Details in the [flows guide](fluxos.md#credentials).

**Portais**: the stored sign-in of the portal cards' browser ("Login guardado" or "Sem login", on how many sites)
and **Limpar login**. The cookie values never appear.

### Atalhos

The keyboard shortcuts per page: the canvas ones (the same list as **?**) and those of the Kanban and the Leitor,
which only work with that page open.

## Own pages ("+")

[//]: # "paginas/extra/*, casca/BarraPaginas.tsx, paginas/conexoes/Conexoes.tsx (aba Páginas)"

Screens made by you or your team (HTML, CSS and JavaScript) that get an icon on the bar. **The full guide to
building one is in [`paginas.md`](paginas.md)**, and also inside the app: **+** → **Guia completo**.

- **Turning them on**: they come off because they run outside code (isolated from your PC). Turn them on in
  Configurações › Conexões › **Páginas**, or with **+** → **Ligar páginas**.
- **Adding** (**+** button): the ready examples **Resumo do espaço** and **Eco de API** (1.9.7; tests a request to an
  API through the app with httpbin.org, a public test service, and an API with a made-up value), **Escolher pasta…** (a
  folder of yours) or **Pedir a um agente para criar** (becomes a demand in the Kanban, handed to the Maestro; below
  the description, tick **APIs que ela vai usar** and **MCPs que ela vai usar**, the APIs and MCPs it will use: the
  demand carries only names, domains and "read only / writes", never the key). The app reads the
  folder without running anything and shows the accept dialog with each permission; **Adicionar e permitir** copies
  the page and puts the icon on the bar.
- **APIs and MCPs the page sees (1.9.7)**: you decide, not the manifest. The acceptance has two
  sections: **APIs que esta página enxerga** (all your APIs from Conexões › APIs, one box each; ticked, **também
  escreve**, also writes, shows in red, only if the API "lê e escreve"; with no API, **Criar API** with the domain
  already filled in) and **MCPs que esta página enxerga** (the servers of Conexões › MCP, except the ones that need login; ticking one opens its tools,
  each with a box and the label "diz que só lê" or, in red, "pode mudar coisas", with **marcar as que dizem só ler** and
  **marcar todas**). The page's manifest only **suggests**: the API or server that serves it comes ticked, with "a
  página chama de '…'" (the page calls it '…'). A page with `rede` or `local` sees no API or MCP (the sections show
  disabled). Updating the page never changes what you ticked. The page sees only name, domains and "writes or not" of
  what you ticked, never the key. Details in the [pages guide](paginas.md#apis-and-mcps-the-page-sees).
- **On the page**: the app's frame shows the name, the version, what it is linked to, "usa: ClickUp, Eco de teste"
  (the APIs and servers it sees; red if one writes or has an MCP tool that may change things),
  **Ligar a agente…** (so it can send messages to that agent), **Recarregar a página** and **Permissões, APIs e MCPs
  (Configurações › Conexões › Páginas)**.
- **In Configurações › Conexões › Páginas**, each page has: **Rever** (when it asks for a new permission or changed outside the
  app), **Desligar / Religar**, **Atualizar da pasta**, **Remover**, **Revogar / Permitir de novo** per permission,
  the **Ligada a** list, the same two sections as the acceptance (**APIs e MCPs que esta página enxerga**, with
  **Guardar** and **Desfazer**; a deleted API or server shows "sumiu", gone, to untick) and the
  **Registro de pedidos** with the last 100, gone when the app closes. Switching off, removing or unticking cuts any
  request the page has in flight.
- A page that hangs or eats memory is closed on its own; three crashes in 10 minutes turn it off until you turn it
  back on.

## The team and the `ork` command

[//]: # "docs/ork.pt-BR.md, main/manual.ts"

Inside any terminal on the canvas, the agent has the `ork` command. Outside the app, it refuses to run. The app
teaches the command to the agents on its own: it writes the `orkester` skill for Claude Code and Codex.

```text
ork quem                         who you are and who is linked to you
ork abrir claude|codex|shell     new session beside you, already linked (--funcao, --pedido, --esperar…)
ork pedir <nome> "…"             sends a request and waits for the answer
ork entregar "…"                 hands the result back to whoever asked
ork ver <nome>                   reads its screen without sending anything
ork limpar <nome>                clears its context
ork banda criar "Nome" …         puts a frame around agents
ork partitura usar "Nome"        raises a saved team
ork kanban …                     reads and works on the space's Kanban
ork fluxo …                      views, creates, edits, turns on and runs the space's flows
ork pagina responder "…" "…"     answers a "+" page linked to it
ork passar <name>                hands your whole role to a living successor (only inside one space)
```

How a team usually works:

- A **Maestro** agent receives the demands (through the Kanban, Com o Maestro column) and opens the others with
  `ork abrir --funcao …`, each with a role.
- Messages between agents go in through the **inbox**, one at a time, when the target is free and you are not
  typing in it. The delivery arrives as `[ork · entrega de "Nome"]`; if an agent stops without delivering, the app
  tells whoever asked with `[ork · aviso do Orkester]`.
- An agent only reaches whoever is linked to it (link or band) or whoever it opened.

The full reference, with the thirty or so verbs, is in [`ork.md`](ork.md).

## Connecting your own Claude from outside (MCP)

`ork` is for the agents inside the canvas. To work on the canvas **from outside** (your Claude Code, Claude
Desktop, Codex), generate a key in Configurações › Conexões › **Chaves** and paste the block the app gives you. The client can then
read the canvas, open agents, raise scores, switch models, work on the Kanban and the flows, as if it were you (a flow with
Code, HTTP, an MCP tool or a command only you turn on, on the page). Orkester needs to be open. Everything in
[`mcp.md`](mcp.md). The other way round (Orkester using someone else's MCP server) is in [Conexões](#conexões), **MCP**
tab, **Servidores de fora** part.

## Where the data lives

[//]: # "main/dados.ts:44-725, main/paginas.ts, main/kanban.ts, main/temas.ts, main/chaves.ts, main/fluxos/{disco,credenciais,index}.ts"

In a single folder: `%USERPROFILE%\.orkester` (or the folder in the `ORK_DADOS` variable, if set). Uninstalling
does not delete it.

| What | Where |
|---|---|
| each space's canvas (cards, links, bands, routines) | `espacos/<id>/espaco.json` |
| sticky notes | `espacos/<id>/notas/*.md` |
| pasted images | `espacos/<id>/imagens/` |
| Kanban | `espacos/<id>/kanban.json` |
| the space's flows (one `.json` per flow, plus `indice.json` with folders and order) | `espacos/<id>/fluxos/` |
| flow runs (the last 50 of each) | `espacos/<id>/fluxos/execucoes/` |
| APIs and MCP servers' secrets (from Conexões › APIs and › MCP; each value encrypted by the Windows vault) | `credenciais.json` |
| external MCP servers (credential ids only, no value) | `mcp-servidores.json` |
| key of the seal that approves sensitive nodes (encrypted) | `fluxos-selo.json` |
| presets, roles, scores, theme base and accent, the Leitor's pinned folders | `preferencias.json` |
| your themes and CSS plugins | `temas.json` |
| MCP keys (fingerprint only) | `chaves.json` |
| windows of the last session | `janelas.json` |
| floor folders | `andares/` |
| the portals' browser profile | `navegador/` |
| own pages and their data | `paginas/`, `paginas.json`, `paginas-dados/` |
| log: `ork` commands, notes, deliveries and routines | `registro/AAAA-MM-DD.jsonl` |
| your own model list (optional) | `modelos.json` |

Unreadable files are not deleted: the app keeps a `.ruim` copy beside them before writing again.

## Tips and common problems

- **The keyboard does not go to the terminal.** Click the card to select it **on its own**. With other items
  selected along with it, the keys belong to the canvas.
- **A canvas shortcut does not work.** It does not work with a terminal selected on its own, with a field in focus
  or with a menu open. Click on empty space and try again.
- **Another agent's message does not go in.** Look at the envelope badge in the header: the tooltip gives the
  reason (the agent is working, at a question, you are typing, there is text in the field). Cleared the field and
  the badge persists? Click it.
- **"⚠ pedido?" in the header.** The first request may not have gone out. Read the screen before repeating.
- **An agent cannot talk to another.** The link (or the band) is missing. Draw one, or open the second one with the
  first one's `ork abrir`.
- **`ork` answers that it is not in the app.** It only runs in an Orkester terminal (`ORK_PIPE` exists). In Git
  Bash, a command with a slash needs `MSYS2_ARG_CONV_EXCL='*'` or `--arquivo`.
- **The routine did not run.** See the last result on the Rotinas page ("pulou: o terminal estava ocupado"…). It
  only runs with the space open in a window.
- **I closed the window and Orkester is still open.** A flow is on: the app went to the Windows tray, with the
  agents alive. To close it for good (for example, before installing a new version), use **Sair** on the tray icon.
- **The flow does not fire, or does not turn on.** Check the editor's **Execuções** tab and the list's badges. To turn
  on, it needs a trigger and no card, column or server "a escolher" (to choose); with Code, HTTP, an MCP tool or a
  command, only you turn it on. More in [`fluxos.md`](fluxos.md#when-something-goes-wrong).
- **I cannot drop on "Com o Maestro".** Open a Claude or Codex agent with the **Maestro** role in the space.
- **The space does not open in this window.** It is already open in another one; the app takes you to it.
- **"Juntar ao principal" refused.** Commit (or discard) the changes on the floor and on the ground floor, and
  check that the ground floor is on a branch.
- **A portal site asks for a passkey or an extension.** Use **Abrir esta aba na janela do Chrome**, sign in, and
  bring it back.
- **The Leitor does not accept the folder.** A network folder, the root of a drive or the whole user folder are not
  allowed; pin a subfolder.
- **An own page does not load.** The frame gives the reason and offers **Rever**, **Religar** or **Recarregar**. See
  [`paginas.md`](paginas.md#debugging).
- **The terminal shows "fora da tela".** That is on purpose: the process continues; bring the screen back to it.
- **Made a mistake?** **Ctrl+Z** undoes almost everything on the canvas, including deleting a terminal (the card
  comes back and the terminal opens again). What an agent closed with `ork fechar` does not come back with Ctrl+Z.
- **Not saved?** The pill "Não consegui salvar. Tento de novo na próxima mudança." (could not save, will try again
  on the next change) appears on the canvas when the disk refuses.
