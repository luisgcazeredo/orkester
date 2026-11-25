# MCP in Orkester

English · [Português](mcp.pt-BR.md)

MCP shows up in Orkester in two ways, and this page covers both:

- **Orkester's MCP (server):** your Claude Code, Codex or another client reads the board and puts work on it. That is
  everything from here down to [How it works](#how-it-works).
- **External servers (client, 1.9.7):** Orkester uses the tools of another MCP server (n8n-mcp, a spreadsheet one…)
  in flows and in "+" pages. It is in [External servers](#external-servers).

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
| `kanban_criar` | `titulo`, `descricao?`, `coluna?`, `responsavel?`, `etiquetas?`, `pasta?`, `espaco?` | Creates a task and returns its number (#N). Without `coluna`, the user creates it in Demandas and an agent in Fazendo. With `pasta` (folder, up to 40 characters), it is born inside a folder of the column. |
| `kanban_mover` | `numero`, `coluna`, `posicao?` (`topo` · `fim` · N), `espaco?` | Moves the task to another column. Moving to Com o Maestro is delegating (the user only); the final column belongs to the user and the Maestro. |
| `kanban_editar` | `numero`, `titulo?`, `descricao?`, `etiquetas?`, `pasta?`, `espaco?` | Changes title, description, labels (`+a,-b` adds and removes) or folder (`""` takes the task out of its folder). |
| `kanban_atribuir` | `numero`, `responsavel`, `espaco?` | Puts an agent on the task's list of workers and tells it in its inbox (`ninguem` empties it). |
| `kanban_soltar` | `numero`, `quem?`, `espaco?` | Takes an agent off the list. |
| `kanban_comentar` | `numero`, `texto`, `espaco?` | Comments on the task. |
| `kanban_apagar` | `numero`, `confirmar: true`, `espaco?` | Sends the task to the bin (the Kanban page restores it). |
| `fluxo_ver` | `nome?`, `json?`, `espaco?` | Without `nome`, the space's flows: on or off, triggers and the last run. With `nome`, one whole flow; with `json: true`, the JSON that `fluxo_criar` and `fluxo_editar` take. A credential shows only by name. |
| `fluxo_criar` | `fluxo`, `pasta?`, `espaco?` | Creates a flow from the JSON (object or text; cards and columns can go by name only). Born off. `pasta` is a folder that already exists on the Fluxos page. |
| `fluxo_editar` | `nome`, `fluxo`, `espaco?` | Replaces the name, nodes and links with the JSON sent. |
| `fluxo_ligar` | `nome`, `espaco?` | Turns the flow on. Refuses one with a sensitive node (Code, HTTP, MCP tool or a command), and one that still has a card, column or server to choose. |
| `fluxo_desligar` | `nome`, `espaco?` | Turns the flow off; nothing else changes in it. |
| `fluxo_rodar` | `nome`, `espaco?` | Runs it once, now, through the Manual trigger, and returns what each node did. Refuses without a Manual trigger, or with a sensitive node (Code, HTTP, MCP tool or a command) not yet approved. |
| `fluxo_execucoes` | `nome`, `n?` (1–50, default 10), `espaco?` | The last runs, with the result, the time and the node that failed. |
| `fluxo_apagar` | `nome`, `confirmar: true`, `espaco?` | Deletes the flow and its runs, for good. |

The kanban acts **as the caller**: from an Orkester terminal, as that agent (the same rules as `ork kanban`, its own
space only, its name in the history — do not send `espaco`); from outside, as you. Organizing in bulk (applying
folders to many tasks at once) has no tool: it is only through the column's ⋯ menu on the Kanban page, which has Undo.

Flows also act as the caller, with the rules of `ork fluxo` ([`ork.md`](ork.md#flows)). With one difference: **a flow
with Code, HTTP, an MCP tool or a command does not turn on through MCP, not even with your key.** The client creates and edits, the
flow stays off, and you turn it on on the Fluxos page, seeing those nodes. The allowed local addresses (`rede.locaisPermitidos`) also only change on the page (a `rede` in the JSON is ignored, with a warning). There is no
tool for credentials or for external servers. The format
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

## External servers

Since 1.9.7 Orkester is also an MCP **client**: you register other people's servers (n8n-mcp, a spreadsheet one, one of
your own) and use their tools in the flows' [Ferramenta MCP](fluxos.md#ferramenta-mcp--foramcp) node and in the "+"
pages you tick the server for ([what the page sees](#what-the-page-sees)). It lives in Configurações › Conexões › **MCP** tab, in the **Servidores de
fora** (external servers) part (the top part, **Ligar programas ao Orkester**, connect programs to Orkester, is the one
with the keys, as before).

### Registering

**Adicionar servidor** (add server) opens the form. There are two kinds:

- **stdio (a program on your PC):** the command, the arguments, the folder (optional) and the environment variables.
  The command shows **in full** on the card, with the warning "roda no seu PC com os seus poderes" (runs on your PC
  with your powers): only register what you trust. Each variable is visible text or a **Segredo** (secret; encrypted,
  no domain; **Criar segredo** right there; see [Server secrets](#server-secrets)). The server gets only the minimal environment plus what you
  declared: Orkester's variables (`ORK_PIPE`, `ORK_CHAVE`…) never reach it, and declaring an `ORK_*` is refused.
- **http (a server on the internet):** the URL and the headers. **https** only, and the host must be a name (not an
  IP, not `localhost`, not `.local`); the IP is checked before connecting. The header comes from an API of Conexões ›
  **APIs** (Token, Basic or **Cabeçalho próprio**, custom header) whose domain covers the host; never from a Segredo.
  The API's "só lê" (read only) does not apply here: MCP always POSTs, and what changes things is chosen per tool. A
  server running on your PC goes in through stdio.

Servers live in `~/.orkester/mcp-servidores.json`, with the ids of secrets and APIs only (no value). They work in every space.
There is no `ork` verb or MCP tool to change them: only the app window.

### Importing from Claude Code

**Importar do Claude Code** reads the `mcpServers` in your `~/.claude.json` (the user ones and each project's);
**Importar de um arquivo…** (import from a file) reads a `.mcp.json` you pick. Nothing besides `mcpServers` is read.

- The list shows each server with its full command or URL, what will become an encrypted secret or API and
  whether it already exists. The ones that do not exist yet come checked; you choose.
- Environment variables become **Segredos** (in Segredos dos servidores). An `Authorization: Bearer …` header becomes
  a **Token** API with the URL's domain; any other header becomes a **Cabeçalho próprio** (custom header) API (both show
  in Conexões › APIs), both **Só lê** (read only): change that in Conexões › APIs if it needs to write. The plain text
  is never written.
- Orkester itself is not offered.
- Left out, with a warning: SSE servers, HTTP to `localhost`, variables whose value is shorter than 4 characters. A value with `${…}`
  (Claude Code's expansion) comes in as literal text, with a warning.
- **A key in the arguments or the URL:** a server that carries a key in its command-line arguments (an
  `--api-key …`, something shaped like a token) or in its URL (a password, a key in the query) **is not offered**. The
  warning says where it is (for example, "argumento 4, o valor de --api-key", argument 4, the value of --api-key), never
  the value: move the key to an environment variable of the server (stdio) or to a header (http) and import again. The
  other arguments come in as they are, visible.
- An HTTP server with no header (ClickUp's, for example, which signs in through a login) gets the **Precisa de login
  (chega na 1.9.8)** badge (needs login, arrives in 1.9.8): MCP OAuth login does not exist in the app yet. Editing it
  and adding a header from an API removes the badge.

### Test, fingerprint and Review

- **Testar** (test) starts the server and lists the tools, without calling any. Each one shows "diz que só lê (palavra
  do servidor)" (says it only reads, the server's word) when the server annotates it as read-only; with no annotation,
  it shows in red, "pode mudar coisas" (may change things).
- The app keeps a **fingerprint** of each tool (name, description, schema and annotations). The first list is
  approved in full.
- If the fingerprint changes later (the server was updated, or a new tool appeared), **only that tool stops**, in
  flows and pages, until you review it. The card shows the warning in red and the **Rever ferramentas mudadas**
  (review changed tools) button: read what each one says now and **Aceitar** (accept). The app approves only the
  version you saw: if any changed again after you opened it, none is approved ("mudou de novo depois que você abriu;
  releia antes de aceitar", changed again, read it again) and the panel is read again. This protects against a "read"
  tool that starts deleting.
- The app also reads the server's list again **before each call** (in flows and pages), even if the server does not
  announce a change. If the list cannot be read, the call is refused.

### How the app runs the servers

- **stdio:** starts on the first call and is reused; closes after 5 minutes idle. At most 6 alive at once (the oldest
  idle one closes to make room). On close and on app exit, the whole process tree is ended, and the app checks in the
  Windows process list that it died. If anything is left, the card says so ("fechou, mas N processo(s) seguem vivos",
  closed, but N processes are still alive, with the pids); if it cannot check, it says that instead of saying it
  closed. Closing takes 1 or 2 seconds longer because of this.
- **Time limits:** 30 s per call, 60 s for the first start. Results up to 2 MB, text and structured content only
  (images and files are left out and counted).
- **Crashes:** 3 crashes in 10 minutes leave the server **Pausado** (paused; it holds even after restarting the app).
  **Pausar** and **Religar** (pause, turn back on) are also on the card; turning back on resets the crashes.
  **Editar** drops the live connection; **Remover** asks for confirmation.
- **Secrets:** the value of the server's secrets and API comes back as `•••` in results, runs and error messages.
- **Deleting a secret or an API** a server uses does not delete the server: the next start fails ("não existe mais",
  no longer exists) and the card shows an error. The delete warning lists the servers that use it.

### Server secrets

Since 1.9.7, secrets (the value of an environment variable a stdio server reads, like the n8n-mcp key) live in
Conexões › MCP, in the **Segredos dos servidores** (server secrets) part, no longer in the list of APIs (a secret is not
an API).

- **Guardar o valor de uma variável de ambiente** (save the value of an environment variable) opens the form: name and
  value. You can also create one in the server's own form, with **Criar segredo**.
- It has no domain and **never goes in a header or an HTTP request**: the HTTP node does not list it and the app
  refuses to use it in a request.
- The card is the same as the APIs': **Trocar o valor** (replace the value), **Editar** (the name) and **Apagar**
  (delete). The server cites the secret by id, so renaming does not break it.
- Same vault and same file as the APIs (`~/.orkester/credenciais.json`, each value encrypted by the Windows vault).
  Once saved, the screen shows only the last 4 characters.

### What the page sees

A "+" page uses an external server only if **you** tick it, at acceptance or on its card in Conexões › Páginas, in the
**MCPs que esta página enxerga** (MCPs this page sees) section. The page's manifest only suggests
(`mcp: [{ encaixe, ferramentas }]`); a suggestion pre-ticks and never grants.

- **Per tool.** Ticking the server opens its tools, each with a box and the label "diz que só lê (palavra do
  servidor)" (says it only reads, the server's word) or, in red, "pode mudar coisas" (may change things). None comes
  ticked except the suggested ones; there are **marcar as que dizem só ler** (tick the ones that say they only read)
  and **marcar todas** (tick all). Up to 5 servers and 20 tools per server.
- A server that **needs login** shows disabled: it cannot be ticked. If it starts needing login after being ticked,
  the page's call is refused: "o servidor X precisa de login: termine em Conexões › MCP antes de marcar" (server X
  needs login: finish it in Conexões › MCP before ticking).
- The page calls by the server's name (or the manifest's name), ignoring case, accents and spaces:
  `orkPagina.mcp.disponiveis()`, `mcp.ferramentas(nome)` and `mcp.chamar(nome, ferramenta, argumentos)`. A tool that is
  not ticked is refused before reaching the server.
- The page **does not see** the server's configuration, command, secrets or the tools you did not tick.
- The fingerprint rules apply the same: a changed tool stays out until you review it here.
- A page with `rede` or `local` sees no server at all.

Details in the [pages guide](paginas.md#apis-and-mcps-the-page-sees).

### What does not work yet (1.9.8)

- MCP HTTP OAuth login (what unlocks the ClickUp MCP).
- MCP HTTP to a server on this PC (use stdio).
- wss with an API key.

Source: [`app/src/main/mcpFora/`](../app/src/main/mcpFora/) (client, registry and import),
[`app/src/shared/mcpFora.ts`](../app/src/shared/mcpFora.ts) (pure rules).
