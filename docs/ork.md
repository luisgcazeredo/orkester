# The `ork` command

English · [Português](ork.pt-BR.md)

`ork` is the agent's hands inside Orkester. With it, an agent opens other agents, delegates, reads the screen
of whoever it is linked to, rearranges the canvas and assembles its own team.

Two rules apply to everything below:

- **It only runs inside a terminal on the canvas.** Outside the app the command refuses — it talks to the
  window through a named pipe (or, in a sandbox that forbids pipes, a file mailbox) that exists only there.
- **The link is the permission**, and an agent cannot grant itself one: it links, unlinks, renames or hands
  a card only to what it **opened** or what is **already linked** to it. An agent reaches whoever it is wired to (or whoever shares its band), and
  nobody else. Cards are addressed by name.

The app writes this manual as an `orkester` skill into `~/.claude/skills` and `~/.codex/skills`, so the agent
learns the command by itself the first time it needs it.

The command itself is in Portuguese, like the rest of the app's interface.

To drive the canvas from **outside** the app — your own Claude, Codex, any MCP client — see
[`mcp.md`](mcp.md).

### If the agent runs in a sandbox

Nothing to do: `ork` works the same. Codex is the case that needs help, and the app sets it up on its own:
Codex runs every command in a sandbox and refuses to leave it, so the app writes an execpolicy rule to
`~/.codex/rules/orkester.rules` allowing the `ork` program — Codex's own documented mechanism for this.
Without it a Codex agent can read the canvas and never speak on it. The rule widens Codex's sandbox for that
one command; the file says who wrote it and why, and deleting it puts the asking back. The detail, for whoever is curious — the command talks to the app
through a named pipe, and some sandboxes refuse to open one (Codex on Windows answers `EPERM`). When that
happens `ork` leaves the same request as a file in a private folder the app watches, and reads the answer
from there. Same verbs, same answers, same exit codes; the difference is a few milliseconds. The folder sits
under the system temp directory, holds nothing but requests in flight, and is deleted when the app closes.

It is not a way around the sandbox: the mailbox carries the same verbs the pipe carries, and the link is
still the permission.

---

## Where am I

| Command | What it does |
|---|---|
| `ork quem` | who you are, who you are linked to, and the last known context |
| `ork orcamento` | how much window Claude has left; Codex declares that it does not expose this |
| `ork espacos` | lists every workspace, with window, cards, and marks yours |
| `ork ajuda` | the full help, straight from the app |

## Working with other agents

| Command | What it does |
|---|---|
| `ork abrir [claude\|codex\|shell]` | opens a new session beside you, already linked. With `--funcao`, the agent kind is optional |
| `ork pedir <name> "text"` | sends a request and waits for it to finish; returns the screen |
| `ork entregar "text"` | sends your result to whoever gave you the task (or opened you); no receipt. Also `responder`, `devolver` |
| `ork pagina responder "<page>" "text"` | answers a "+" page linked to your card (open: arrives at once; closed: kept until it opens). Also `--arquivo answer.md`. See [`docs/paginas.md`](paginas.md) |
| `ork esperar <name>` | waits for the other one to finish what it is doing |
| `ork ver <name>` | reads its screen without sending anything |
| `ork teclas <name> <key>…` | answers menus and prompts: `enter`, `esc`, `tab`, `shift-tab`, arrows, `ctrl-c`, `y`, `n`, numbers |
| `ork limpar <name>` | clears the session's context (`/clear` on Claude, `/new` on Codex) |
| `ork fechar <name>` | closes a session **you** opened; what it opened is handed to you |
| `ork passar <name>` | hands your whole role to a living successor: the sessions you opened, all your strings (not only your children's), the messages waiting in your inbox and the deliveries you were waiting for (an `ork entregar` without `--para` now reaches the successor). Works with no children too. Only inside one space: it is refused, before anything changes, when the successor is in another space or when you have sessions open in another space (close those first with `ork fechar`). A message or delivery aimed at a card that no longer exists goes to the space's Maestro instead, with a line saying so. All or nothing — if anything fails, nothing changes and you should not `ork sair` |
| `ork sair` | closes your own card; with `--com-as-minhas`, takes the tree you opened with it |

Options for `ork abrir`:

```text
--espaco "Name"     open in another workspace (you remain its owner)
--nome N            the card's name
--pasta P           the folder the terminal opens in
--funcao "Role"     born with that role's prompt, in its folder, on its preset (engine + level)
--preset "Name"     overrides the preset for this one session ("Claude forte")
--modelo M          the model (see `ork modelos`); overrides the role
--esforco E         the effort (low … max; ultra is Codex only); overrides the role
--tarefa N          puts the agent to work on kanban task #N
--pedido "text"     the first request, already typed
--arquivo p.md      the first request, read from a file
--esperar           only return when it has finished
--tempo S           how many seconds to wait
```

`ork pedir` also takes `--arquivo`, `--tarefa`, `--sem-esperar` and `--tempo`. `ork entregar` takes `--arquivo` and `--para "Name"`.

### The inbox

Nothing an agent sends to another is typed on the spot. `ork pedir` and `ork entregar` put the message in the
target's **inbox**, and the app types one at a time, only when the target is idle **and the user is not writing
in it** (no key for 5 s and nothing in the input field). So an agent that finishes does not paste its delivery
into the middle of what you are typing. The card shows a badge with how many messages wait and why; if you
cleared the field and the badge insists, click it.

Whoever delegates does not need to watch. The delivery reaches the asker as `[ork · entrega de "Name"]`. If the
agent works and then stops for about 20 s without delivering, the app tells the asker with
`[ork · aviso do Orkester]` and the last lines of its screen; at a question, sooner. In a shell, deliveries and
notices go in as comments (`# `), so PowerShell runs nothing.

## Building the team

| Command | What it does |
|---|---|
| `ork funcoes` | lists the saved roles, for use with `ork abrir --funcao` |
| `ork banda` | lists the bands on this floor and who sits inside each |
| `ork banda criar "Name" <card>…` | draws a frame around those agents: they all start talking to each other |
| `ork modelos` | the Claude and Codex models, the efforts each one accepts and the defaults |
| `ork modelo <card> [<model>] [--esforco level]` | changes the model and/or effort of a card you opened, while it is free; the card reopens and the conversation goes on. The answer says which effort stayed when only the model changed |
| `ork trocar <card> <claude\|codex\|shell>` | swaps the agent on a card you opened; place, name and links stay |
| `ork partitura` | lists the saved teams |
| `ork partitura usar "Name"` | raises that team beside you, linked to you |
| `ork partitura salvar "Name" [card]…` | saves those cards, or the whole floor, as a score |
| `ork catalogo importar <folder>` | turns the `.md` sheets of a folder into roles (below) |

### Team sheets

A team written outside the app — by hand, by another agent, copied from another project — is a folder of
Markdown files, one per role. Each has a header between `---` lines and a body that becomes the role's prompt:

```markdown
---
nome: Revisor
motor: Codex
nivel: forte
pasta: app
---
You review every change before it is pushed. …
```

- `nome` is required; the rest is optional. `pasta` is relative to the workspace folder.
- `motor` names the engine. **"Codex e Claude"** (or "Codex, Claude") creates **two** roles, one per engine,
  with the engine in the name; **"Shell com Claude"**, with no separator, is one card described in prose.
- `nivel` is matched to a preset of that engine by name: `forte`, `medio` or `rapido` in the preset's name.
  With no preset at that level it falls back to the engine's first preset, and the report says so.
- Importing again **updates by name** instead of duplicating, and **never deletes** a role: the folder may be
  part of a team, not all of it. A file without a header is skipped and named in the report.

## Working the canvas

| Command | What it does |
|---|---|
| `ork quadro` | reads the canvas: every card with number, name, place and size, and the links |
| `ork mover <card>… --x N --y N` | places cards; with `--dx/--dy`, moves them from where they are |
| `ork arrumar [card]… --colunas N` | lays cards out in a grid, starting from the corner they were in |
| `ork nome <card> "New name"` | renames an agent card |
| `ork ligar <card> <card>` | draws the link: the two can now talk (only between cards you can reach) |
| `ork desligar <card> <card>` | removes the link |
| `ork anotar "text"` | writes a note on the canvas, below your card |
| `ork juntar <card>… [--soltar]` | groups cards so they move together |
| `ork ler <card>` | reads one card in full (the list cuts text at 60 characters) |
| `ork apagar <card>…` | removes cards with no process behind them; an agent is `ork fechar`. Ctrl+Z undoes it |
| `ork janela "Workspace"` | opens a workspace in a window; `--novo "Name"` creates it first |

Everything the agent does to the canvas:

- **goes into the user's undo stack** — one Ctrl+Z takes it back;
- **never deletes anything**;
- **never touches** a locked card or a code card;
- **only reaches the floor currently on screen**.

## Code trees

Every agent card has file trees beside it — one per line of work. The files it writes appear there on their
own, with the git diff.

| Command | What it does |
|---|---|
| `ork arvore` | lists your card's trees and says which one is in use |
| `ork arvore nova "Name"` | creates a tree and starts using it for the next files |
| `ork arvore usar "Name"` | switches to a tree that already exists |
| `ork arvore mostrar <file>…` | opens those files as cards; `--arvore "Name"` picks where |
| `ork arvore dar "Agent" <file>…` | hands those code cards to another agent on the canvas |
| `ork arvore desfazer "Name"` | undoes the tree; its files go back to the main one |

## Kanban

The space's kanban (the same one as the Kanban page). An agent only reaches its own space's kanban, and its name
goes into each task's history.

| Command | What it does |
|---|---|
| `ork kanban [ver] [--coluna C] [--para Name\|eu\|ninguem] [--etiqueta e]` | the tasks by column, with who works on each; `ork kanban ver 12` shows #12 in full |
| `ork kanban criar "Title" [--descricao T \| --arquivo f.md] [--coluna C] [--para Name] [--etiqueta a,b] [--pasta P]` | creates a task; without `--coluna`, it starts in Fazendo (Demandas belongs to the user); with `--pasta`, it starts inside a folder of the column |
| `ork kanban pegar <n>` | you join the list of who works on it; from Demandas or Com o Maestro it moves to Fazendo |
| `ork kanban soltar <n> [Name]` | you leave the list (removing someone else: only the Maestro and the user) |
| `ork kanban mover <n> "Column" [--posicao topo\|fim\|N]` | moves it to another column; Com o Maestro belongs to the user, the final column to the user and the Maestro |
| `ork kanban editar <n> [--titulo T] [--descricao T \| --arquivo f.md] [--etiqueta +a,-b] [--pasta P\|-]` | changes title, description, labels or folder (`--pasta -` takes it out of its folder) |
| `ork kanban pasta <n> ["name"]` | puts the task in a folder of its column (up to 40 characters); without the name, takes it out. If a folder with the same name already exists, ignoring case and accents, its spelling wins |
| `ork kanban atribuir <n> Name\|eu\|ninguem` | puts the agent on the list and tells it in its inbox (`ninguem` empties it) |
| `ork kanban comentar <n> "text"` | comments (also `--arquivo f.md`) |
| `ork kanban apagar <n> --confirmar` | sends it to the bin (the page restores it) |
| `ork kanban coluna criar "Name"` | also `renomear "Old" "New"` and `apagar "Name"` |

`ork abrir --tarefa N` and `ork pedir --tarefa N` put the agent to work on task #N and quote the task in the request.

**Folders (1.9.7).** Each column can group its tasks into collapsible folders (one per version, for example). An agent
puts a task into a folder with `ork kanban pasta` or `--pasta`. A task without a folder that reaches the final column
with a version label (`1.9.7`, `v2.0`) goes into that version's folder on its own; the user turns this off on the page.
Organizing many tasks at once (by version or by label) belongs to the user, through the column's ⋯ menu on the Kanban
page: there is no `ork` verb or MCP tool for it.

The `--arquivo` file may carry a UTF-8 BOM (Windows PowerShell's `Set-Content -Encoding utf8` writes one): `ork` strips it when reading, in every command.

## Flows

The space's flows (the same as the Fluxos page): automations as nodes, with a trigger and what to do next. The JSON
format, each node's settings and the rules are in [`fluxos.md`](fluxos.md). An agent only reaches the flows of its own
space. A flow is found by its name (case-insensitive) or by the start of it.

| Command | What it does |
|---|---|
| `ork fluxo [listar]` | the space's flows: on or off, triggers, folder, the last run and the files that fail to open |
| `ork fluxo ver "Name" [--json]` | one whole flow: nodes and links; `--json` returns the JSON that `criar` and `editar` take |
| `ork fluxo criar --arquivo f.json [--pasta "F"]` | creates from the JSON (the name goes inside it); born off; `--pasta` is a folder that already exists |
| `ork fluxo editar "Name" --arquivo f.json` | replaces the name, nodes and links with the JSON |
| `ork fluxo ligar "Name"` / `ork fluxo desligar "Name"` | turns it on or off |
| `ork fluxo rodar "Name"` | runs it now, through the Manual trigger, and shows what each node did |
| `ork fluxo execucoes "Name" [--n 10]` | the last runs: result, time and the node that failed |
| `ork fluxo apagar "Name" --confirmar` | deletes the flow and its runs, for good |

Rules for the agent:

- **Code, HTTP or Shell command:** the flow is born (or stays, when edited) off, and `ligar` is refused. Only the user
  turns it on, on the page, seeing those nodes. `rodar` also refuses while the user has not approved those nodes.
- **Reach:** the flow only cites cards the agent reaches (link, band or one it opened): the message target, who gets
  the delivery, who the trigger watches and the command's shell. A message with no `entregaPara` sends the delivery
  back to the agent itself. At every firing, messages and the trigger are checked again (the command's shell is not:
  the user saw it when turning the flow on); out of reach, the flow skips that turn, and without the agent's card a
  flow with a message turns off.
- **Local network:** the allowed local addresses (`rede.locaisPermitidos`) only change on the page, by the user. A `rede` in an agent's JSON is ignored,
  the flow stays as it was and the answer carries a warning.
- **Credential:** the HTTP node cites only the name of a credential the user saved. There is no command to read or
  create a credential.
- Creating, editing, turning on, turning off and deleting by an agent show in the corner of the user's window.

---

## Example: delegate and wait

```powershell
# open a reviewer with a defined role and a first request, and wait for the answer
ork abrir codex --nome "Revisor" --funcao "Revisor" --pedido "Read src/main/janelas.ts and point out risks" --esperar

# read what it answered
ork ver "Revisor" --linhas 40

# it stopped on a menu prompt: answer it
ork teclas "Revisor" enter

# done: close it
ork fechar "Revisor"
```
