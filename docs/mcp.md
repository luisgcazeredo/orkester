# The MCP server

English · [Português](mcp.pt-BR.md)

`ork` is for agents **on** the canvas. The MCP server is for everything **outside** it — your own Claude Code,
Claude Desktop, Codex, any MCP client — to read the board and put work on it, authenticated by a key you
generate in the app.

Two rules apply to everything below:

- **Orkester has to be open.** The server does not touch your boards on disk; it asks the running app, over
  the same pipe and through the same validation as `ork`. App closed → every tool answers "Orkester is not
  open".
- **A key acts as you, not as an agent.** What it opens lands with no owner and no link, exactly like a card
  you create by hand. The link is a permission *between agents*; it does not apply to you on your own board.

## Connecting a client

1. In Orkester, click the gear at the foot of the page bar on the left and go to **Configurações › Conexões** (settings › connections), **Chaves** (keys) tab; or search **Conexões (Configurações)** in the command palette (Ctrl+K).
2. Name the key after whoever will use it — "Claude Code", "laptop" — and click **Generate key**.
3. Pick your client's tab, click **Copy**, paste. Start a **new** session of the client: tools are loaded when
   a session starts.

The key is shown **once**. Orkester stores only a SHA-256 fingerprint of it; lose it, generate another and
revoke the old one in the same screen.

What the app generates, by client (your paths will differ):

**Claude Code** — one line in a terminal, valid for every project (`-s user`):

```text
claude mcp add orkester -s user -e ORK_CHAVE=ork_… -- "C:\Program Files\nodejs\node.exe" "C:\Users\you\.orkester\bin\cli\mcp.js"
```

**Claude Desktop / a project's `.mcp.json`** — goes inside `mcpServers`:

```json
{
  "mcpServers": {
    "orkester": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\you\\.orkester\\bin\\cli\\mcp.js"],
      "env": { "ORK_CHAVE": "ork_…" }
    }
  }
}
```

**Codex** — at the end of `~/.codex/config.toml`:

```toml
[mcp_servers.orkester]
command = 'C:\Program Files\nodejs\node.exe'
args = ['C:\Users\you\.orkester\bin\cli\mcp.js']
env = { ORK_CHAVE = 'ork_…' }
```

The server is a single file, `mcp.js`, that the app copies into `~/.orkester/bin/cli/` every time it starts.
It runs on any Node. Without Node on the machine, the generated command runs it with the Node built into
`Orkester.exe` instead (`ELECTRON_RUN_AS_NODE=1` in `env`); nothing changes for the client.

### Environment

| Variable | | |
|---|---|---|
| `ORK_CHAVE` | required | the key, `ork_` followed by 64 hex characters |
| `ORK_DADOS` | optional | Orkester's data folder, if not `~/.orkester` |

## Tools

One tool per action, rather than a generic "run a command": a client allows or asks **by tool name**, so you
can let it read the board freely and still be asked before it opens an agent.

Every tool takes an optional `espaco` (workspace name). Without it, the tool acts on the one workspace open in
a window; with several open, it refuses and lists them.

| Tool | Parameters | What it does |
|---|---|---|
| `espacos` | — | Lists the workspaces, with their card count and whether each is open in a window. |
| `quadro` | `espaco?` | Reads the visible floor: numbered cards, with position and state. |
| `funcoes` | `espaco?` | Lists the saved roles that `abrir_cartao` uses by name. |
| `ver_cartao` | `cartao`, `linhas?` (1–2000, default 50), `espaco?` | Reads an agent's screen right now, and whether it is idle, working or waiting on a question. `cartao` is the card's name or its beginning. |
| `abrir_cartao` | `funcao?`, `agente?` (`claude` · `codex` · `shell`), `preset?`, `nome?`, `pasta?`, `modelo?`, `esforco?`, `tarefa?`, `espaco?` | Opens a new session. With `funcao`, engine, model and effort come from the role; without it, `agente` is required. `preset` overrides by name ("Claude forte"); `modelo` and `esforco` (`low` … `max`; `ultra` is Codex only) override the role. `tarefa` (the N of #N) puts the agent to work on that kanban task. `pasta` is relative to the workspace folder. |
| `modelos` | `espaco?` | The Claude and Codex models, the efforts each accepts and the defaults. |
| `trocar_modelo` | `cartao`, `modelo?`, `esforco?`, `espaco?` | Changes the model and/or effort of an idle agent: the card reopens and the conversation goes on. Refuses while it is busy. |
| `partituras` | `espaco?` | Lists the saved teams (scores), with their agents, roles and links. |
| `subir_partitura` | `nome`, `espaco?` | Raises a saved team on the visible floor. An unknown name is refused with the list of the ones that exist. |
| `importar_catalogo` | `pasta`, `espaco?` | Turns the `.md` sheets of a folder into roles — the same format as `ork catalogo importar`, described in [`ork.md`](ork.md). Updates by name instead of duplicating; never deletes. |
| `kanban` | `numero?`, `coluna?`, `responsavel?`, `etiqueta?`, `espaco?` | The tasks by column, with number, labels and who works on each. With `numero`, the whole task. |
| `kanban_criar` | `titulo`, `descricao?`, `coluna?`, `responsavel?`, `etiquetas?`, `espaco?` | Creates a task and returns its number (#N). Without `coluna`, the user creates it in Demandas and an agent in Fazendo. |
| `kanban_mover` | `numero`, `coluna`, `posicao?` (`topo` · `fim` · N), `espaco?` | Moves the task to another column. Moving to Com o Maestro is delegating (the user only); the final column belongs to the user and the Maestro. |
| `kanban_editar` | `numero`, `titulo?`, `descricao?`, `etiquetas?`, `espaco?` | Changes title, description or labels (`+a,-b` adds and removes). |
| `kanban_atribuir` | `numero`, `responsavel`, `espaco?` | Puts an agent on the task's list of workers and tells it in its inbox (`ninguem` empties it). |
| `kanban_soltar` | `numero`, `quem?`, `espaco?` | Takes an agent off the list. |
| `kanban_comentar` | `numero`, `texto`, `espaco?` | Comments on the task. |
| `kanban_apagar` | `numero`, `confirmar: true`, `espaco?` | Sends the task to the bin (the Kanban page restores it). |
| `fluxo_ver` | `nome?`, `json?`, `espaco?` | Without `nome`, the space's flows: on or off, triggers and the last run. With `nome`, one whole flow; with `json: true`, the JSON that `fluxo_criar` and `fluxo_editar` take. A credential shows only by name. |
| `fluxo_criar` | `fluxo`, `pasta?`, `espaco?` | Creates a flow from the JSON (object or text; cards and columns can go by name only). Born off. `pasta` is a folder that already exists on the Fluxos page. |
| `fluxo_editar` | `nome`, `fluxo`, `espaco?` | Replaces the name, nodes and links with the JSON sent. |
| `fluxo_ligar` | `nome`, `espaco?` | Turns the flow on. Refuses one with Code, HTTP or a command, and one that still has a card or column to choose. |
| `fluxo_desligar` | `nome`, `espaco?` | Turns the flow off; nothing else changes in it. |
| `fluxo_rodar` | `nome`, `espaco?` | Runs it once, now, through the Manual trigger, and returns what each node did. Refuses without a Manual trigger, or with Code, HTTP or a command not yet approved. |
| `fluxo_execucoes` | `nome`, `n?` (1–50, default 10), `espaco?` | The last runs, with the result, the time and the node that failed. |
| `fluxo_apagar` | `nome`, `confirmar: true`, `espaco?` | Deletes the flow and its runs, for good. |

The kanban acts **as the caller**: from an Orkester terminal, as that agent (the same rules as `ork kanban`, its own
space only, its name in the history — do not send `espaco`); from outside, as you.

Flows also act as the caller, with the rules of `ork fluxo` ([`ork.md`](ork.md#flows)). With one difference: **a flow
with Code, HTTP or a command does not turn on through MCP, not even with your key.** The client creates and edits, the
flow stays off, and you turn it on on the Fluxos page, seeing those nodes. The allowed local addresses (`rede.locaisPermitidos`) also only change on the page (a `rede` in the JSON is ignored, with a warning). There is no
tool for credentials. The format
and the nodes are in [`fluxos.md`](fluxos.md).

Answers are plain text, the same text `ork` prints. A refusal comes back as a tool error (`isError: true`)
whose text says why — the client sees it and can correct itself.

## Errors

| Message | Meaning |
|---|---|
| `o Orkester não está aberto nesta máquina` | The app is closed (or is a version older than 1.3). Open it. |
| `falta a chave` | `ORK_CHAVE` is missing from the server's configuration. |
| `chave inválida ou revogada` | Wrong key, or revoked in Configurações › Conexões. Generate another. |
| `o Orkester fechou desde a última vez` | The app was closed after the client connected. Reopen it; no restart of the client needed. |
| `o Orkester não respondeu em 30 s` | The app is open but stuck. |

The messages are in Portuguese, like the rest of the interface.

## What the key is and is not

- **Is:** intent (nothing outside the canvas reaches the board without one), a name, revocation that takes
  effect on the next call, and a record — Configurações › Conexões shows when each key was created and last used. Revoked
  keys are marked, not deleted, so the record of who had access survives.
- **Is not:** a boundary against programs already running as you. Anything that runs under your user can
  read `~/.orkester` anyway. The key is about knowing who did what and cutting access, not about keeping
  local malware out.

## How it works

While the app runs, it writes the address of its pipe to `~/.orkester/cano.json` and deletes the file when
it exits — the address is random per launch, and an MCP client does not inherit the app's environment the
way a card's terminal does. The server reads that address, sends the same request `ork` would send with
`chave` where `ork` sends its badge, and returns the answer. Permissions are decided in the app, never in
the server: the server runs on the caller's side.

Source: [`app/src/mcp/orkester.ts`](../app/src/mcp/orkester.ts) (the server),
[`app/src/shared/chaves.ts`](../app/src/shared/chaves.ts) (keys and the generated configurations).
