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
| `ork esperar <name>` | waits for the other one to finish what it is doing |
| `ork ver <name>` | reads its screen without sending anything |
| `ork teclas <name> <key>…` | answers menus and prompts: `enter`, `esc`, `tab`, `shift-tab`, arrows, `ctrl-c`, `y`, `n`, numbers |
| `ork limpar <name>` | clears the session's context (`/clear` on Claude, `/new` on Codex) |
| `ork fechar <name>` | closes a session **you** opened; what it opened is handed to you |
| `ork passar <name>` | hands the sessions you opened to a living successor |
| `ork sair` | closes your own card; with `--com-as-minhas`, takes the tree you opened with it |

Options for `ork abrir`:

```text
--espaco "Name"     open in another workspace (you remain its owner)
--nome N            the card's name
--pasta P           the folder the terminal opens in
--funcao "Role"     born with that role's prompt, in its folder, on its preset (engine + level)
--preset "Name"     overrides the preset for this one session ("Claude forte")
--pedido "text"     the first request, already typed
--arquivo p.md      the first request, read from a file
--esperar           only return when it has finished
--tempo S           how many seconds to wait
```

`ork pedir` also takes `--arquivo`, `--sem-esperar` and `--tempo`.

## Building the team

| Command | What it does |
|---|---|
| `ork funcoes` | lists the saved roles, for use with `ork abrir --funcao` |
| `ork banda` | lists the bands on this floor and who sits inside each |
| `ork banda criar "Name" <card>…` | draws a frame around those agents: they all start talking to each other |
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
