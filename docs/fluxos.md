# Flows guide

English · [Português](fluxos.pt-BR.md)

[//]: # "Guide checked against the 1.9.6 code on 2026-11-23. Sources (relative to app/src/): shared/fluxos/{tipos,formato,nos,fichas,expressoes,executor,rede,credenciais,exemplos}.ts, main/fluxos/{servico,verbos,codigo,http,credenciais,alcance,selo,index,consulta}.ts, main/motorDeAutomacoes.ts, shared/automacoes.ts (guards), main/regrasDaBandeja.ts."

A **flow** (*fluxo*) is an automation drawn as nodes: a **trigger** (a task that changes column, a delivery, an agent
that stopped, the clock, or the **Rodar fluxo** button) followed by what to do (send a message, create a task, notify
you, decide, change the data, run JavaScript, call an API). Each space has its own flows.

The app's interface is in Portuguese. Labels appear here in **bold Portuguese**, often with a translation. Node types,
setting names and output fields are the exact keys of the JSON format, also in Portuguese.

This guide is the reference for building a flow, by hand or by asking an agent. How to use the page (list, folders,
editor, runs) is in the manual, under [The Fluxos page](manual.md#the-fluxos-page).

## Contents

1. [Getting started](#getting-started)
2. [How a flow runs](#how-a-flow-runs)
3. [The JSON format](#the-json-format)
4. [The nodes](#the-nodes)
5. [Standard fields (fichas)](#standard-fields-fichas)
6. [Expressions `{{ }}`](#expressions--)
7. [The Code node](#the-code-node)
8. [The HTTP node and the network](#the-http-node-and-the-network)
9. [Credentials](#credentials)
10. [Sensitive nodes: who turns them on](#sensitive-nodes-who-turns-them-on)
11. [Guards and limits](#guards-and-limits)
12. [Flows made by agents](#flows-made-by-agents)
13. [Recipes](#recipes)
14. [When something goes wrong](#when-something-goes-wrong)

## Getting started

A flow is a **trigger** (what makes it fire) followed by **nodes** linked in a row, each doing one thing. The path
through the screen, from nothing to a flow that is on:

1. **Create.** On the **Fluxos** page, click **Novo fluxo** (new flow). The editor opens empty.
2. **First node.** Click the **+** in the middle (**Adicionar o primeiro nó**, add the first node) and pick a
   trigger. To test by hand, start with **Manual**.
3. **Next nodes.** Drag from a node's output dot and drop it on empty space: the search opens and the node you pick is
   already linked. Dropping on another node links the two. **+ Nó**, **Tab** or **N** also open the search.
4. **Set it up.** Double-click a node to open its panel in three columns: **Entrada** (input, what arrived),
   **Ajustes** (settings, what it does) and **Saída** (output, what leaves). The panel's **Documentação** button shows
   this guide's section on that node.
5. **Test.** Click **Salvar** (save, Ctrl+S) and then **Rodar fluxo** (run flow). It runs what is saved once, through
   the Manual trigger, even when the flow is off.
6. **See what happened.** The run opens on the drawing: green ran, red failed, gray did not run. The **Execuções**
   (runs) tab keeps the last 50; open a node to see its input and output for that run.
7. **Turn it on.** The **Ligado/Desligado** (on/off) switch, in the editor or the list, makes the flow fire on its
   own. Every flow starts off. A **sensitive** node (Code, HTTP or Comando no shell) asks for your confirmation first,
   node by node, and only you can turn on a flow that has one.

More things that help:

- **Folders.** The **Nova** (new) button, on the left, creates a folder. Drag a flow onto it.
- **Export and import.** In the editor, **Ctrl+C** with nothing selected copies the whole flow as JSON. To bring one
  in, open **Novo fluxo**, paste with **Ctrl+V** and save.
- **Ask an agent.** Say what you want ("when a task enters Revisão, tell the Revisor"). The agent builds it with
  `ork fluxo`, the flow starts off and a notice shows up in the corner of the window. Check it and turn it on.
- **Ctrl+K** finds a flow by name and opens it in the editor.

To start from a ready example: [Finished task notifies the Maestro](#1-finished-task-notifies-the-maestro) and
[A delivery with a problem becomes a task](#4-a-delivery-with-a-problem-becomes-a-task).

## How a flow runs

- **Items.** What goes from one node to the next is a list of items. Each item is a JSON object (`{ "json": { … } }`
  on disk; in the nodes you only see what is inside `json`). The trigger emits one item with the event data.
- **Path.** The flow walks depth-first from the trigger that fired, following the links in the order they were made.
  A node that receives 0 items does not run, and neither do the ones after it.
- **Several inputs.** A node can be linked from more than one node (for example, a Manual trigger and a Clock trigger
  leading to the same node). Branches are not merged: each arrival runs the node again, only with the items that came
  through it. Cycles are not allowed.
- **Per item or all at once.** If and Set handle each item. Code runs once, with all of them. HTTP makes one request
  per item (up to 20). Message, Task, Command, Notify and Query act once per item (up to 5); with more, the node fails and asks
  you to merge the items first, in a Code node. That way no flow sends 50 messages at once.
- **The first error stops everything.** The failed node turns red, the ones that did not run turn grey, and there is
  no retry. The run keeps the error message.
- **One run at a time in each space.** Flows of the same space queue up. Different spaces run at the same time, so a
  slow HTTP call in one space does not hold the others.
- **Without a window too.** An enabled flow keeps firing with the space's window closed (the app stays in the tray, see
  the manual). A message only reaches an agent that is open: a space that was not opened since the app started has no
  live agents, and the message ends as "sem destino" (no recipient).

## The JSON format

It is what **Ctrl+C** in the editor copies, what `ork fluxo ver "Name" --json` shows, and what `ork fluxo criar` and
the MCP tools `fluxo_criar` and `fluxo_editar` take. Paste this example into the editor (open **Novo fluxo** and press
**Ctrl+V**) and it shows up ready to save:

```json
{
  "orkester": "fluxo",
  "versao": 1,
  "nome": "Run by hand notifies you",
  "nos": [
    {
      "id": "no-1",
      "nome": "Run by hand",
      "tipo": "gatilho.manual",
      "versaoDoTipo": 1,
      "posicao": [0, 0],
      "ajustes": {}
    },
    {
      "id": "no-2",
      "nome": "Build the sentence",
      "tipo": "logica.definir",
      "versaoDoTipo": 1,
      "posicao": [300, 0],
      "ajustes": {
        "campos": [{ "nome": "frase", "valor": "Ran at {{ em }}" }],
        "manterOutros": true
      }
    },
    {
      "id": "no-3",
      "nome": "Notify",
      "tipo": "orkester.avisar",
      "versaoDoTipo": 1,
      "posicao": [600, 0],
      "ajustes": { "texto": "{{ frase }}" }
    }
  ],
  "ligacoes": [
    { "de": "no-1", "saida": 0, "para": "no-2" },
    { "de": "no-2", "saida": 0, "para": "no-3" }
  ]
}
```

| Field | What it is |
|---|---|
| `orkester` | always `"fluxo"` |
| `versao` | always `1`. A flow from a newer app version is refused with a request to update |
| `nome` | the flow's name, one line, up to 80 characters |
| `nos` | the list of nodes, up to 60 |
| `nos[].id` | node id: letters, digits, `-` and `_`, up to 80. Links use the id, so renaming a node breaks nothing |
| `nos[].nome` | the name the screen shows, one line, up to 60 characters, unique in the flow (case-insensitive). It is the name the Code node's `$('Name')` uses |
| `nos[].tipo` | one of the types in [The nodes](#the-nodes) |
| `nos[].versaoDoTipo` | always `1` |
| `nos[].posicao` | `[x, y]` in the editor |
| `nos[].ajustes` | the type's settings (under each node, in [The nodes](#the-nodes)) |
| `nos[].notas` | optional free text for whoever reads the flow later, up to 2000 characters |
| `ligacoes` | up to 120. `de` and `para` are node ids; `saida` is `0`, or in the If node `0` = true and `1` = false |

What does **not** go in the JSON: whether the flow is on, its folder, who created it, the hourly cap, the allowed local network
addresses and the approval of sensitive nodes. Those belong to the app. A flow that is pasted or created through `ork` is born **off**, at the
root of the list (or in the folder asked with `--pasta` or `pasta`).

**Graph rules:** no repeated ids or names; links only between existing nodes and through an output the node has;
nothing links **into** a trigger; no repeated link and no cycle. To **turn on**, the flow needs at least one trigger.

**Cards and columns** go as `{ "id": "…", "nome": "…" }`. You can send just the name (`"Revisão"` or
`{ "nome": "Revisão" }`): the app looks it up by name, ignoring case and accents. That way a flow copied from another
space fixes itself. If the name matches nothing, or more than one, the field becomes **to choose** (*a escolher*; the
node shows a warning) and the flow does not turn on until you choose. As the target of a message, `"maestro"` means the
agent with the Maestro function that is open in the space at that moment.

## The nodes

Every node below follows the same template, in five parts: **What it does**, **Settings** (in the JSON, inside
`ajustes`), **Output** (what it emits to the next node), **Useful expressions** and **Common errors**. In the "takes
`{{ }}`" column, "yes" means the field takes [expressions](#expressions--). Cards and columns go as `{ "id", "nome" }`
or by name only (see [The JSON format](#the-json-format)).

| Group | Node | Type |
|---|---|---|
| Triggers | [Tarefa mudou de coluna](#tarefa-mudou-de-coluna--gatilhokanban) (task changed column) | `gatilho.kanban` |
| | [Entrega chegou](#entrega-chegou--gatilhoentrega) (delivery arrived) | `gatilho.entrega` |
| | [Agente parou](#agente-parou--gatilhoparou) (agent stopped) | `gatilho.parou` |
| | [Relógio](#relógio--gatilhorelogio) (clock) | `gatilho.relogio` |
| | [Manual](#manual--gatilhomanual) | `gatilho.manual` |
| Orkester | [Recado](#recado--orkesterrecado) (message) | `orkester.recado` |
| | [Tarefa](#tarefa--orkestertarefa) (task) | `orkester.tarefa` |
| | [Comando no shell](#comando-no-shell--orkestercomando) (shell command, sensitive) | `orkester.comando` |
| | [Avisar](#avisar--orkesteravisar) (notify) | `orkester.avisar` |
| | [Consultar o Orkester](#consultar-o-orkester--orkesterconsultar) (query Orkester) | `orkester.consultar` |
| Logic | [Se](#se--logicase) (if) | `logica.se` |
| | [Definir campos](#definir-campos--logicadefinir) (set fields) | `logica.definir` |
| Outside Orkester | [Código](#código--foracodigo) (code, sensitive) | `fora.codigo` |
| | [HTTP](#http--forahttp) (sensitive) | `fora.http` |

A trigger takes no incoming link: it is the start of the flow, and the item it emits is the event. The other nodes
take items and emit items.

### Tarefa mudou de coluna · `gatilho.kanban`

**What it does.** Fires when a Kanban task enters a column. A task created or moved by a flow does **not** fire this
trigger (it is one of the [guards](#guards-and-limits)).

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `paraColuna` | the column the task entered | no | (required) |
| `deColuna` | only when it came from this column | no | any origin |
| `por` | who moved it: `"usuario"` (user), `"agente"` (agent) or `"qualquer"` (anyone) | no | `"qualquer"` |

**Output.** One item with `numero`, `titulo`, `deColuna` and `paraColuna` (ids), `deColunaNome`, `paraColunaNome`,
`por` (`usuario` or `agente`), `quem` (the name of whoever moved it) and `tarefa`: the whole
[task ficha](#standard-fields-fichas) (labels, assignees, description, last comment…), or `null` if it could not be
read. Below, the ficha is shortened.

```json
{ "numero": 12, "titulo": "Review the contract", "deColuna": "fazendo", "paraColuna": "revisao",
  "deColunaNome": "Fazendo", "paraColunaNome": "Revisão", "por": "agente", "quem": "Reviewer",
  "tarefa": { "numero": 12, "ref": "#12", "coluna": { "id": "revisao", "nome": "Revisão" }, "etiquetas": ["contract"] } }
```

**Useful expressions.**
- `Task #{{ numero }} ({{ titulo }}) entered {{ paraColunaNome }}`
- `{{ quem }} moved it from {{ deColunaNome }} to {{ paraColunaNome }}`
- `{{ tarefa.ref }}: {{ tarefa.ultimoComentario.texto }}`
- In an If: `{{ tarefa.etiquetas }}` `contem` `urgent`

**Common errors.**
- "diga a coluna de destino" (say the target column) → choose `paraColuna`.
- "escolha "paraColuna" (o nome não bateu com nada deste espaço)" (the name matched nothing in this space) → the flow
  came from another space or the column was renamed: choose the column in the node panel.
- "a coluna "X" saiu do kanban" (the column left the Kanban) → it was deleted: choose another. When the column is
  deleted, the app tells you which flows used it, and the enabled ones turn off ("desligado: uma coluna saiu do kanban").
- It did not fire → the task was moved by a flow, or the `por` / `deColuna` filter did not match.

### Entrega chegou · `gatilho.entrega`

**What it does.** Fires when an agent delivers with `ork entregar`. With no filter, any delivery in the space counts.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `de` | only deliveries from this card | no | anyone |
| `para` | only those going to this card | no | anyone |
| `contem` | only when the text contains this (up to 80 characters, case-insensitive) | no | no filter |

**Output.** One item with `de` (id of whoever delivered), `deNome`, `para`, `paraNome`, `texto` (up to 1,500
characters), `quemEntregou` and `quemRecebe`: the [agent ficha](#standard-fields-fichas) on each side, or `null`
when it is you, a closed card or one from another space. Below, the fichas are shortened.

```json
{ "de": "c-7f2a", "deNome": "Reviewer", "para": "c-1b9e", "paraNome": "Maestro",
  "texto": "Reviewed the contract: two clauses to fix.",
  "quemEntregou": { "id": "c-7f2a", "nome": "Reviewer", "funcao": "Reviewer", "estado": "livre" },
  "quemRecebe": { "id": "c-1b9e", "nome": "Maestro", "funcao": "Maestro", "estado": "trabalhando" } }
```

**Useful expressions.**
- `{{ deNome }} delivered: {{ texto }}`
- In an If: `{{ texto }}` `contem` `blocked`
- `{{ deNome }} ({{ quemEntregou.funcao }}, {{ quemEntregou.modelo }}) delivered`

**Common errors.**
- ""de" não é um cartão" / ""para" não é um cartão" (is not a card) → choose a card on the canvas, or remove the filter.
- ""contém" passa de 80 letras" (over 80 characters) → shorten the filter.
- It did not fire → the result came some other way (a message is not a delivery) or a filter did not match.

### Agente parou · `gatilho.parou`

**What it does.** Fires when an agent becomes free, stops at a question or exits.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `agente` | which agent to watch | no | any Claude or Codex agent of the space (shells do not count) |
| `como` | one or more of `"parou"` (finished and is free), `"pergunta"` (question) and `"encerrou"` (exited) | no | `["pergunta"]` |

**Output.** One item with `agente` (id), `agenteNome`, `como` and `quemParou`: the
[agent ficha](#standard-fields-fichas) (role, model, floor, tasks it works on…), or `null` if it could not be read.
Below, the ficha is shortened.

```json
{ "agente": "c-7f2a", "agenteNome": "Reviewer", "como": "pergunta",
  "quemParou": { "id": "c-7f2a", "nome": "Reviewer", "funcao": "Reviewer", "estado": "pergunta", "tarefas": [12] } }
```

**Useful expressions.**
- `{{ agenteNome }} stopped at a question and is waiting for an answer.`
- In an If: `{{ como }}` `igual` `encerrou`
- `{{ agenteNome }} ({{ quemParou.funcao }}) stopped; it is on tasks {{ quemParou.tarefas }}`

**Common errors.**
- "diga parou, pergunta e/ou encerrou" → tick at least one in `como`.
- ""agente" não é um cartão" (is not a card) → choose an agent on the canvas, or leave it empty for any.
- It did not fire → the card is a shell, or the watched agent was closed.

### Relógio · `gatilho.relogio`

**What it does.** Fires every N minutes, every day or every week. What came due while the app was closed (or the flow
was off) does not fire later.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `quando` | `{ "tipo": "cada", "minutos": 30 }` (2 to 10080), `{ "tipo": "diario", "hora": 18, "minuto": 0 }` or `{ "tipo": "semanal", "dia": 1, "hora": 9, "minuto": 0 }` (`dia`: 0 = Sunday … 6 = Saturday) | no | every day at 9:00 |

Below 10 minutes, on save, the flow's hourly cap rises to fit (see [Guards and limits](#guards-and-limits)).

**Output.** One item with `em`: the date and time of the firing, in ISO format.

```json
{ "em": "2026-11-23T18:00:00.000Z" }
```

**Useful expressions.**
- `Review of {{ em }}`
- `{{ $fluxo.nome }} ran in {{ $espaco.nome }}` (see [what every expression sees](#what-every-expression-sees))

**Common errors.**
- "horário inválido (a cada N min, de 2 em diante; todo dia; ou toda semana)" (invalid schedule) → check `quando`:
  minutes 2 to 10080, hour 0 to 23, minute 0 to 59, day 0 to 6.
- It did not fire on time → the app was closed, or the flow was off: what came due then does not come back.

### Manual · `gatilho.manual`

**What it does.** Fires from the editor's **Rodar fluxo** button, from `ork fluxo rodar` or from the `fluxo_rodar`
tool. Runs what is saved, even with the flow off.

**Settings.** None.

**Output.** One item with `em` (the date and time, in ISO format).

```json
{ "em": "2026-11-23T14:03:12.000Z" }
```

**Useful expressions.**
- `Ran at {{ em }}`
- `Run {{ $execucao.id }} of {{ $fluxo.nome }}`

**Common errors.**
- "o fluxo não tem um gatilho Manual: ponha um para rodar daqui" (the flow has no Manual trigger) → add a Manual node
  and link it to the first node of the path.
- It ran the old version → the button runs what is **saved**: save first.
- With a sensitive node not yet approved → **Aprovar e rodar uma vez** shows up (see
  [Sensitive nodes](#sensitive-nodes-who-turns-them-on)).

### Recado · `orkester.recado`

**What it does.** Sends a message to an agent (Claude or Codex) of the space, or to the Maestro, through the inbox.
Acts once per item, up to 5.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `para` | the agent that receives it, or `"maestro"` (the agent with the Maestro role open in the space at that moment) | no | `"maestro"` |
| `texto` | the message, up to 2,000 characters | yes | (required) |
| `juntarEvento` | `true` adds, after the text, a summary of the incoming item ("O que aconteceu:"), with the simple fields only (text, number, yes/no; the fichas are left out) | no | `false` |
| `entregaPara` | who gets the agent's delivery, if the message is work | no | the Maestro |

The agent receives it with the header `[ork · recado do fluxo "Name"]`. Anything from the item that spans more than
one line goes in quoted (each line with `| `), and nothing from the item can imitate an Orkester header. Shells do
not receive messages: the text would run as a command (that is what the shell command node is for).

**Output.** One item per message, with `para` (id), `paraNome`, `resultado` (`na-fila`, queued, or
`sem-destino: <reason>`, no target) and `posicao` (the place in the queue).

```json
{ "para": "c-1b9e", "paraNome": "Maestro", "resultado": "na-fila", "posicao": 1 }
```

**Useful expressions.**
- `Task #{{ numero }} ({{ titulo }}) entered {{ paraColunaNome }}. Review it.`
- `{{ deNome }} delivered:\n{{ texto }}`

**Common errors.**
- `sem-destino: não há Maestro aberto neste espaço` (no Maestro open) → open an agent with the Maestro role, or
  choose an agent.
- `sem-destino: o cartão de destino não está aberto no espaço` / `… está encerrado` (not open / exited) → open the
  agent again. The node does not turn red, but the run shows as "sem destino".
- "chegaram N itens e este nó age no máximo 5 vezes" (N items arrived, this node acts at most 5 times) → merge the
  items first, in a Code node.
- "escreva o texto" / "o texto passa de 2000 letras" (write the text / over 2,000 characters) → write or shorten it.

### Tarefa · `orkester.tarefa`

**What it does.** Creates a task in the space's Kanban. In the **Com o Maestro** column, the task is created in
Demandas and delegated to the Maestro, as if you dragged it there. Acts once per item, up to 5.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `titulo` | one line, up to 120 characters | yes | (required) |
| `descricao` | up to 4,000 characters | yes | empty |
| `coluna` | which column it is created in | no | the entry column (Demandas) |

**Output.** One item per task, with `numero`, `titulo`, `coluna` (the column's **id**; empty if the node did not
choose one), `tarefa` (the created task's [ficha](#standard-fields-fichas), with the column's name; `null` if it could
not be read) and, when delegating, `para` (the Maestro's id). Below, the ficha is shortened.

```json
{ "numero": 31, "titulo": "Unblock the delivery from Reviewer", "coluna": "",
  "tarefa": { "numero": 31, "ref": "#31", "coluna": { "id": "demandas", "nome": "Demandas" } } }
```

**Useful expressions.**
- Title: `Unblock the delivery from {{ deNome }}`
- Description: `{{ texto }}`
- After the node: `Created {{ tarefa.ref }} in {{ tarefa.coluna.nome }}`

**Common errors.**
- "escreva o título" / "o título passa de 120 letras" (write the title / over 120 characters) → the title is one
  line, up to 120 characters (after expressions).
- "a coluna "X" não existe mais no kanban" (the column no longer exists) → choose another column.
- "#N criada, mas não delegada: …" (created but not delegated) → the task exists but did not go to the Maestro; read
  the reason and move it by hand.
- "chegaram N itens e este nó age no máximo 5 vezes" → merge the items first, in a Code node.

### Comando no shell · `orkester.comando`

**What it does.** Types a fixed command into a **shell** card of the space, with that shell's folder and permissions.
If the shell is busy or stopped at a question, it skips that turn (not an error: `resultado` says so). **Sensitive**:
only you turn the flow on (see [Sensitive nodes](#sensitive-nodes-who-turns-them-on)).

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `terminal` | the shell card | no | (required) |
| `comando` | one line, up to 500 characters, fixed text | **no**, on purpose: nothing from outside becomes a command | (required) |

**Output.** One item with `terminal` (id), `terminalNome` and `resultado` (`rodou`, ran, or `pulou: o terminal
estava ocupado`, skipped: busy, `pulou: o terminal estava parado numa pergunta`…).

```json
{ "terminal": "c-3d0c", "terminalNome": "Project shell", "resultado": "rodou" }
```

**Useful expressions.** None: the command is typed as it is. A `{{ path }}` in it is a missing setting (*Falta*): the flow
saves, but the node shows a warning and does not turn on. Another tool's `{{ }}` that is not a path
(`docker ps --format "{{.Names}}"`) goes through. To vary what runs, write a script in the project and always call it
with the same command.

**Common errors.**
- "{{ }} não vale no comando" (not allowed in the command) → remove the expression (see above).
- "o comando é uma linha só" (one line only) → put it on one line, or move the steps into a script.
- "o cartão shell "X" não está aberto no espaço" / "não é um shell" (not open / not a shell) → choose an open shell
  card.
- "não confirmou o comando a tempo" (did not confirm in time) → check the shell: the command may have run or been
  left typed at the prompt.

### Avisar · `orkester.avisar`

**What it does.** Shows you a notice: in the corner of the space's window or, with no window, in a Windows
notification. The text reads `Fluxo "Name" (who made the flow): …`. Acts once per item, up to 5.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `texto` | one line, up to 300 characters | yes | (required) |

**Output.** One item with `avisado`: `janela` (window) or `notificacao` (notification).

```json
{ "avisado": "janela" }
```

**Useful expressions.**
- `{{ agenteNome }} stopped at a question`
- `{{ frase }}` (a field built earlier in a Set fields node)

**Common errors.**
- "escreva o texto" / "o texto passa de 300 letras" (write the text / over 300 characters) → a notice is short, one
  line.
- "sem janela do espaço e sem notificação do sistema" (no window and no system notification) → Windows notifications
  are off for Orkester: turn them on, or keep the space's window open.
- "chegaram N itens e este nó age no máximo 5 vezes" → merge the items first, in a Code node.

### Consultar o Orkester · `orkester.consultar`

**What it does.** Reads things **from this space** and emits one item per [ficha](#standard-fields-fichas): tasks,
columns, agents, canvas cards, floors, the space, flows or runs. Read only: it changes nothing, and never reads another
space. It is not sensitive; for the data to leave the app, the flow needs HTTP or Code, which only you turn on. It runs
once per incoming item, up to 5, and the output of every run adds up, up to 100 items.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `recurso` | `tarefa` (task), `coluna` (column), `agente` (agent), `cartao` (card), `andar` (floor), `espaco` (space), `fluxo` (flow) or `execucao` (run) | no | `tarefa` |
| `operacao` | `um` (one specific ficha) or `varios` (a list, with filters) | no | `varios` |
| `limite` | how many fichas at most, 1 to 100 | no | 20 |
| the filters | they depend on the resource and the operation (table below); those that do not apply are removed on save | only in `numero`, `etiqueta`, `contem` and `nome` | none |

| Resource | `um` (required) | `varios` (all optional) |
|---|---|---|
| `tarefa` | `numero`: `12`, `#12` or `{{ numero }}` | `coluna`; `etiqueta` (label); `responsavel` (a card, or `"maestro"`); `contem` (in the title or description); `concluidas` (`true` also brings the finished ones) |
| `coluna` | `coluna` | all (no filter) |
| `agente` | `agente` (a card, or `"maestro"`) | `tipo` (`claude`, `codex`, `shell`); `estado` (`livre`, `trabalhando`, `pergunta`, `encerrado`, `fechado`); `funcao` (role) |
| `cartao` | `nome` (the exact name) | `tipo` (`nota`, `texto`, `portal`, `arquivo`, `pasta`, `imagem`, `codigo`, `banda`); `andar` (the name; the ground floor is "Térreo"); `contem` (in the name or text) |
| `andar` | `nome` | all (no filter) |
| `espaco` | this flow's (no setting; `um` only) | (none) |
| `fluxo` | `nome` (empty = this flow) | `ligados` (`true` = only the ones that are on) |
| `execucao` | (none; `varios` only) | `fluxo` (the name; empty = this flow); at most 20 |

Names, labels, roles and `contem` compare ignoring case and accents. Tasks come newest first; without `concluidas`,
only the open ones.

**Output.** One item per ficha, with the fields in [Standard fields](#standard-fields-fichas). A `varios` that finds
nothing emits 0 items (the next nodes do not run). Past the limit, or past 100 in total, the list is cut and the node
panel, in the run, shows the note ("cortado no limite do nó: 150 casaram, saíram 100", cut at the node's limit). Below,
a column ficha.

```json
{ "id": "revisao", "nome": "Revisão", "papel": "revisao", "final": false, "tarefas": 3 }
```

**Useful expressions.**
- In `numero`: `{{ numero }}` (the task that came from the trigger), to read its whole ficha
- After the node: `{{ ref }} {{ titulo }} ({{ coluna.nome }})`, `{{ responsaveis }}`
- In a Code node after it: `$input.all().length` (how many fichas came out)

**Common errors.**
- "a tarefa #N não existe neste espaço" / "o agente "X" não está neste espaço" / "nenhum cartão se chama "X" neste
  espaço" / "o fluxo "X" não existe neste espaço" (not found in this space) → `um` found nothing; check the number or
  name, or use `varios`.
- "N cartões se chamam "X": use "vários" com outro filtro" (N cards have that name) → the name is not unique; filter by
  type or floor.
- "o andar "X" não existe neste espaço (o de baixo se chama "Térreo")" / "não há Maestro aberto neste espaço" (no such
  floor / no Maestro open) → check the floor's name, or open the Maestro.
- "chegaram N itens e este nó consulta no máximo 5 vezes: junte os itens antes, no nó Código" (at most 5 queries) →
  merge first, or link the query straight to the trigger.
- A flow made by an agent is refused on save (the assignee or the queried agent is out of reach) → an agent only cites
  cards linked to it (see [Flows made by agents](#flows-made-by-agents)).

### Se · `logica.se`

**What it does.** Splits the items into two outputs: `0` (true) gets those that pass the conditions, `1` (false) the
others. Each item is handled on its own.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `condicoes` | 1 to 10, each `{ "valor", "operador", "comparar" }` | yes, in `valor` and `comparar` | one empty condition |
| `combinar` | `"e"` (all conditions) or `"ou"` (any of them) | no | `"e"` |

| Operator | Passes when |
|---|---|
| `igual`, `diferente` (equal, different) | two numbers compare as numbers (`5` equals `"5"`); everything else by exact text |
| `contem`, `nao-contem` (contains, does not contain) | on text, whether it contains `comparar`, case-insensitive; on a list, whether some element equals `comparar` by exact text (case counts there: `["Urgente"]` does not contain `urgente`) |
| `comeca`, `termina` (starts, ends) | by text, case-insensitive |
| `maior`, `menor` (greater, less) | numbers only (text that is not a number gives false) |
| `vazio`, `nao-vazio` (empty, not empty) | empty = missing, `null`, blank text, empty list or object (they ignore `comparar`) |
| `verdadeiro`, `falso` (true, false) | the value `true`/`false` or the text `true`/`false` (they ignore `comparar`) |

A `valor` that is **only** an expression (`"{{ numero }}"`) keeps its type: a number stays a number, a list stays a
list.

**Output.** The same items, unchanged, each on its output.

```json
{ "numero": 12, "titulo": "Review the contract", "paraColunaNome": "Revisão" }
```

**Useful expressions.**
- `{{ texto }}` `contem` `error`
- `{{ numero }}` `maior` `100`
- `{{ tarefa.etiquetas }}` `contem` `urgent` (on a list, compares element by element)

**Common errors.**
- "condição N: diga o valor (ex.: {{ titulo }})" (say the value) → `valor` cannot be empty.
- "condição N: operador inválido" (invalid operator) → use an operator from the table.
- No item passes → check case on a list and whether the field exists in the item (missing is empty).
- Output `1` (false) left unlinked → the items that did not pass stop there; that is expected.

### Definir campos · `logica.definir`

**What it does.** Sets or replaces fields on each item.

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `campos` | 1 to 30, each `{ "nome", "valor" }`. The name takes a path (`cliente.nome` creates the `cliente` object if missing) | yes, in `valor` (not in the name) | none |
| `manterOutros` | `true` keeps the fields the item already had; `false` leaves only the ones set here | no | `true` |

A value that is **only** an expression (`"{{ quantidade }}"`) keeps its type: a number stays a number, a list stays a
list; missing becomes `null`. Any other text becomes text.

**Output.** The items with the fields set.

```json
{ "em": "2026-11-23T14:03:12.000Z", "frase": "Ran at 2026-11-23T14:03:12.000Z" }
```

**Useful expressions.**
- `frase` = `Ran at {{ em }}`
- `quem` = `{{ deNome }}` (copies the field, with its type)
- `cliente.nome` = `{{ titulo }}`

**Common errors.**
- "defina pelo menos um campo" (set at least one field) → add a field.
- "campos: nome inválido "…"" (invalid name) → the name is letters, digits, `_` and `$`, with `.` between parts; no
  spaces.
- "no máximo 30 campos" (at most 30 fields) → split into two nodes, or build it in a Code node.

### Código · `fora.codigo`

**What it does.** Runs isolated JavaScript that gets **all** the items at once and returns a list of items. No disk,
no network, 5 seconds. **Sensitive**: only you turn the flow on. The whole API is in [The Code node](#the-code-node).

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `codigo` | JavaScript, up to 20,000 characters | no (use `$input` and `$('Name')` in the code) | `return $input.all()` |

**Output.** The items the code returned (`return`). An empty list is fine: the next nodes do not run.

```json
{ "total": 3, "lista": "#12 Login error\n#15 Slow page\n#18 Missing button" }
```

**Useful expressions.** There is no `{{ }}` inside the code. In the nodes after it, use the fields it returned:
`{{ total }}`, `{{ lista }}`.

**Common errors.**
- "erro de sintaxe no Código (linha N): …" (syntax error, line N) → fix that line.
- "o Código precisa devolver uma lista ([{ json: {...} }] ou [{...}])" (must return a list) → end with
  `return [ … ]`.
- "o nó "X" não rodou antes deste no caminho" (node X did not run before this one on the path) → `$('X')` only sees
  nodes on the path up to here; check the name.
- "fetch não existe no nó Código: …" / "o Código passou de 5 s e foi parado" (fetch does not exist / over 5 s) → for
  the internet, use the HTTP node; make the code lighter.

### HTTP · `fora.http`

**What it does.** Makes an HTTP request to an API on the internet, with a [credential](#credentials) if needed. One
request per item, up to 20. **Sensitive**: only you turn the flow on. Network, time limits and what is stored are in
[The HTTP node and the network](#the-http-node-and-the-network).

**Settings.**

| Field | What it is | takes `{{ }}` | Default |
|---|---|---|---|
| `metodo` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` or `HEAD` | no | `GET` |
| `url` | starts with `http://` or `https://`, or with an expression (`{{ base }}/v1`), up to 2,000 characters | yes | `https://` |
| `consulta` | `{ "nome", "valor" }` pairs after the `?`, up to 30. The app encodes name and value: write plain text (`a b`, not `a%20b`) | yes, in the value | none |
| `cabecalhos` | `{ "nome", "valor" }` pairs, up to 30. Protocol headers (`Host`, `Content-Length`…) belong to the app | yes, in the value | none |
| `corpo` | `{ "tipo": "nenhum" \| "json" \| "texto" \| "formulario", "valor": "…" }`, up to 20,000 characters. `GET` and `HEAD` take no body | yes, in the value | `nenhum` |
| `credencial` | the **name** of a credential saved in Configurações › Conexões › Credenciais | no | none |

**Output.** One item per request, with `status`, `cabecalhos` (the response's), `corpo` (already an object when the
response is JSON; text otherwise) and `url` (only after a redirect: the final address).

```json
{ "status": 200, "cabecalhos": { "content-type": "application/json" }, "corpo": { "ok": true } }
```

**Useful expressions.**
- URL: `https://api.example.com/tasks/{{ numero }}`
- JSON body: `{ "title": "{{ titulo }}", "number": {{ numero }} }` (inside quotes it goes in as text; outside, as a
  value)
- After the node: `{{ corpo.items[0].name }}`, `{{ status }}`

**Common errors.**
- "X respondeu 401 …" (X answered 401, or any non-2xx code) → the API refused; check the credential, the URL and the
  body.
- "X é desta máquina ou da rede local; permita este endereço…" (is on this machine or the local network; allow this
  address…) → if that is on purpose, open the node and click **Permitir X neste fluxo**
  ([The HTTP node and the network](#the-http-node-and-the-network)). "… não pode ser usado: …" (cannot be used) → that
  address is never allowed; the reason says what to use instead.
- "credencial X: só vai por https" / "não está nos domínios dela" / "credencial X não existe" (https only / not in its
  domains / does not exist) → check the URL, the credential's domains and its name.
- "chegaram N itens e o HTTP faz no máximo 20 pedidos" / "o pedido passou de 30 s" (at most 20 requests / over 30 s)
  → merge the items first; check whether the API is up.

## Standard fields (fichas)

Every Orkester thing always comes out in the same shape, the **ficha** (record), wherever it comes from. So an
expression like `{{ tarefa.coluna.nome }}` works the same in every flow. The rules for every ficha:

- **Dates** in ISO format (`2026-11-23T18:00:00.000Z`); empty (`""`) when there is none.
- **Clean, cut text**, at the size given (in characters).
- **The keys are always there**: empty, `null` or `0` when they do not apply. An expression does not need to check
  whether a field exists.
- **Never included**: credentials, Conexões keys, a terminal's command and folder, the terminal's screen, full file or
  folder paths, the query (`?`) and `#` of an address, the items and detail of runs, and the Kanban bin.

**Tarefa** (task, from the Kanban)

| Field | What it is |
|---|---|
| `numero`, `ref` | the number and `"#12"` (the app has no direct link to a task: use `ref` in a text) |
| `titulo`, `descricao` | up to 120 and 1,500 characters (the description keeps its line breaks) |
| `coluna` | `{ id, nome }` of the column it is in |
| `etiquetas` | list of texts (up to 24 characters each) |
| `responsaveis` | who works on it: list of `{ id, nome }` |
| `delegadaA` | `{ id, nome }` of whoever got the delegation, or `null` |
| `concluida`, `concluidaEm` | whether it is done, and when (`null` if not) |
| `criadaEm`, `criadaPor`, `atualizadaEm` | when it was created, the name of who created it and the last change |
| `comentarios`, `ultimoComentario` | how many comments, and the last one: `{ por, em, texto }` (text up to 500 characters), or `null` |
| `textoDeAgente` | `true` when the title or the description was written by an agent (it does not carry your authority) |

```json
{
  "numero": 12, "ref": "#12", "titulo": "Review the contract", "descricao": "Check clauses 3 and 7.",
  "coluna": { "id": "revisao", "nome": "Revisão" }, "etiquetas": ["contract"],
  "responsaveis": [{ "id": "c-7f2a", "nome": "Reviewer" }], "delegadaA": null,
  "concluida": false, "criadaEm": "2026-11-23T13:10:00.000Z", "criadaPor": "Usuário",
  "atualizadaEm": "2026-11-23T17:45:00.000Z", "concluidaEm": null, "comentarios": 2,
  "ultimoComentario": { "por": "Reviewer", "em": "2026-11-23T17:45:00.000Z", "texto": "Two clauses missing." },
  "textoDeAgente": false
}
```

**Agente** (agent, a terminal card)

| Field | What it is |
|---|---|
| `id`, `nome` | the card |
| `tipo` | `claude`, `codex` or `shell` |
| `funcao` | the role (empty if none) |
| `modelo`, `esforco` | what the process really runs (empty = the engine's default; shells have none). `esforco` goes from `low` to `max` (and `ultra` on Codex), or empty |
| `estado` | `livre` (free), `trabalhando` (working), `pergunta` (question), `encerrado` (exited) or `fechado` (the card has no process) |
| `andar` | `{ id, nome }`; on the ground floor, `{ "id": "", "nome": "Térreo" }` |
| `fila` | how many messages wait in its inbox |
| `tarefas` | the numbers of the unfinished tasks it works on |

**Coluna** (column, from the Kanban): `id`, `nome`, `papel` (`entrada`, `delegar`, `revisao` or empty), `final`
(whether it is the final column) and `tarefas` (how many tasks it holds, bin excluded).

**Cartão** (card on the canvas, except terminals, which are the agent ficha)

| Field | What it is |
|---|---|
| `id` | the card |
| `tipo` | `nota`, `texto`, `portal`, `arquivo`, `pasta`, `imagem`, `codigo` or `banda` |
| `nome` | what `ork quadro` calls it (up to 80 characters): `post-it` for a note, the start of the text, the file or folder name (no path), the portal's address (no `?`), the band's name… |
| `andar` | `{ id, nome }` (ground floor: empty id) |
| `texto` | the text of a note or a text card, up to 2,000 characters; empty for the others |
| `url` | on a portal, only the origin and path (no user, no `?` and no `#`); empty for the others |

**Andar** (floor): `id` (empty on the ground floor), `nome`, `ramo` (the git branch, or `null`), `status`
(`{ texto, estado }`, with `estado` `trabalhando`, `travado`, `revisao` or `pronto`; or `null`) and `cartoes` (how
many cards its canvas has).

**Espaço** (space): `id` and `nome`.

**Fluxo** (flow): `id`, `nome`, `ligado`, `pasta` (the folder's name on the Fluxos page; empty outside a folder),
`autoria` (who created it, as text) and `ultima` (`{ resultado, em }` of the last run, or `null`).

**Execução** (run): `id`, `fluxo` (`{ id, nome }`), `modo` (`gatilho` or `manual`), `inicio`, `ms` (how long it
took), `resultado` (`ok`, `erro`, `barrado-laco`, `barrado-taxa` or `sem-destino`), `erro` (up to 300 characters, or
`null`) and `noComErro` (the name of the node that failed, or `null`).

### Where the fichas show up

| Node | Field | Ficha |
|---|---|---|
| Tarefa mudou de coluna | `tarefa` | task |
| Entrega chegou | `quemEntregou`, `quemRecebe` | agent (`null` when it is you, a closed card or one from another space) |
| Agente parou | `quemParou` | agent |
| Tarefa (the node) | `tarefa` | the created task |

The earlier fields keep the same names (`numero`, `titulo`, `agenteNome`…): the fichas come in beside them. Clock
and Manual emit only `em`. A ficha that could not be read comes out `null`, and the flow runs the same. The fichas
are read when the run happens, not at the moment of the event: if the task changed in between, it comes out as it is
now.

### What every expression sees

Besides the item, every expression, in any node (in HTTP, also in the JSON and form bodies), sees three values of the
moment:

| Name | What it is |
|---|---|
| `$fluxo` | the [ficha of the flow](#standard-fields-fichas) that is running: `{{ $fluxo.nome }}`, `{{ $fluxo.pasta }}` |
| `$espaco` | `{ id, nome }` of the space: `{{ $espaco.nome }}` |
| `$execucao` | `{ id, modo, inicio }` of this run (`modo` is `gatilho` or `manual`): `{{ $execucao.id }}` |

They are **not fields of the item**: they do not show in the nodes' output, nor in `{{ $json }}`, nor in the Code
node (which does not see them). To carry one forward, copy it in a Set fields node (`origem` = `{{ $fluxo.nome }}`).

## Expressions `{{ }}`

An expression puts a value from the item that reached the node into the text: `Task #{{ numero }} ({{ titulo }})
entered {{ paraColunaNome }}`.

- **It is only a path**: `titulo`, `cliente.nome`, `itens[0].preco`, `["name with space"]`. Writing `$json.` in front
  is accepted and changes nothing.
- **`$fluxo`, `$espaco` and `$execucao`** work in every expression: see
  [What every expression sees](#what-every-expression-sees).
- **No math, functions or references to other nodes.** `{{ a + 1 }}` or `{{ titulo.toUpperCase() }}` are refused on
  save, with a message saying where. Logic goes in a Code node before.
- A path that does not exist becomes empty text. Objects and lists become JSON. A `{{` without `}}` stays as text.
- **Where they work:** Message text; Task title and description; Notify text; If value and compare; Set value; HTTP
  URL, query and header values and body.
- **Where they do not:** in the Command (fixed text, on purpose: nothing from outside becomes a command), in field
  names, in triggers.
- **In an HTTP JSON body**, the expression comes out escaped the right way: inside quotes (`"hi {{ nome }}"`) it goes in
  as JSON text; outside quotes (`{ "n": {{ quantidade }} }`) it goes in as a JSON value (text gets quotes, missing
  becomes `null`). The final body must be valid JSON.
- **In an HTTP form**, write one `name=value` per line (or separated by `&`). Each name and value is encoded on its own,
  so an `&` or `=` coming from the item does not create a new field.

## The Code node

JavaScript that receives **all** items at once and returns a list of items.

```js
// the items that arrived
const itens = $input.all()          // also $input.first() and $input.last()
// what an earlier node emitted, by its name
const gatilho = $('Run by hand').first()
console.log('arrived', itens.length)   // goes to the node panel, in the run
return itens.map((i) => ({ json: { ...i.json, checked: true } }))
```

- **Input:** `$input.all()`, `$input.first()`, `$input.last()` and `itens` (the same list). Each item is
  `{ json: { … } }`. They are copies: changing them changes nothing outside the code.
- **Earlier nodes:** `$('Name').all()`, `.first()` and `.last()` give the items that node emitted **on the path up to
  here**. The name of a node that did not run earlier on this path is an error.
- **Output:** `return` a list. It can be `[{ json: { … } }]` or just `[{ … }]`. The output goes through JSON:
  functions and `undefined` vanish without an error and dates become ISO text; only circular references and BigInt
  are errors. An empty list is fine: the next nodes do not run.
- **Error:** `throw new Error('reason')` turns the node red with the message.
- **`console.log`** (and `info`, `warn`, `error`): up to 50 lines and 2 KB, shown in the node panel in the run.
- You can use `await`: the code runs inside an async function.
- **Isolated:** runs in a hidden Electron window, new every time, with no disk, no network (`fetch` and friends throw
  an error telling you to use the HTTP node), no `require` and no `ork`. Credentials do not reach it either.
- **Limits:** 5 seconds, 256 MB of memory, up to 1000 items and 5 MB in and out, at most 2 Code nodes running at the
  same time in the app.

## The HTTP node and the network

The HTTP node talks to the **internet** without asking. Addresses on **your computer** or **your local network** are
different: they only work if you allow them, one by one, in each flow.

- **What the local network is.** The computer itself (`localhost`, `127.0.0.1`) and the devices in your home or
  office, whose addresses start with `192.168.`, `10.` or `172.16.` to `172.31.` (the router, a NAS, a printer, n8n
  or another service running here).
- **Why it is blocked.** Many local services take commands from anyone who reaches them, with no password, because
  they assume only someone at the computer talks to them. A flow built by an agent, or a wrong address, could change
  them. So the app refuses these addresses until you say that one, exactly that one, may be called.
- **How to allow an address.** Write the URL in the HTTP node with a fixed address and port
  (`http://localhost:5678/webhook/x`). The node shows a warning and the button **Permitir localhost:5678 neste fluxo**
  (allow localhost:5678 in this flow); until you allow it, the node shows **Falta** (missing) in the drawing. Once
  allowed, the warning becomes "localhost:5678 permitido neste fluxo" (allowed in this flow), with **Tirar permissão**
  (remove permission). The permission is for the address **and the port**: `localhost:5678` does not allow
  `localhost:5679`. The path and query may have `{{ }}`; the address and port may not.
- **Where to see what is allowed.** With at least one address allowed, the top of the editor shows **Rede local: N
  endereços** (local network: N addresses). Clicking it opens the list, with **Tirar** (remove) on each one.
- **Takes effect on save, and turning on asks again.** Allowing or removing changes the draft; it takes effect on
  **save**. In an enabled flow, any change to the list turns it off until you confirm again, and the confirmation
  shows the whole list ("Pode chamar no seu computador/rede: localhost:5678", may call on your computer/network). Only
  you change it, on the page: a `rede` sent in the JSON by an agent, `ork` or MCP is ignored (the flow stays as it
  was) and the sender gets a warning.
- **What is never allowed** (the node says why and shows no button):
  - an address that comes from an expression (`http://{{ $json.host }}/`): fixed addresses only;
  - a device name on the network (`nas`, `printer.local`, `*.lan`, `*.home`, `*.internal`): write its IP instead
    (`http://192.168.0.10:8080/`) and allow the IP. A name can change address behind the scenes; a written IP cannot;
  - `something.localhost`: use plain `localhost`;
  - `169.254.x.x` (where cloud metadata lives), IPv6 (for this machine, use `localhost`) and reserved ranges (`0.x`,
    `100.64.x`, multicast and others).
- **The app checks after resolving the name.** An internet name that points to a local address is refused, even if
  that address is allowed: allow and use the IP. The message says what to do: `localhost:5678 é desta máquina ou da
  rede local; permita este endereço no nó HTTP (botão "Permitir localhost:5678 neste fluxo")` (is on this machine or
  the local network; allow this address in the HTTP node).
- **Redirects:** up to 5, each hop checked again with the same rules: a hop to a local address only goes through if
  that address and port are allowed. When the site changes (scheme, host or port), the credential leaves that request
  for good, and so do hand-written `Authorization` and `Cookie` headers.
- **Time and size:** 30 seconds for the whole request (with hops) and a response of up to 5 MB, after decompression.
- **A non-2xx response is an error**, with the code and the start of the body in the message.
- **What stays in the run:** the response with its headers, minus `Set-Cookie`, `Set-Cookie2`, `Cookie`,
  `Authorization`, `Proxy-Authorization` and `Proxy-Authenticate`. The request that went out does not.
- **Content-Type:** set automatically from the body type (JSON, text, form), unless you write one.

## Credentials

A credential is a password, token or API key that the HTTP node carries **without the value entering the flow**.

- **Where:** Configurações › Conexões › **Credenciais** → **Guardar uma credencial** (save a credential): the name flows
  will use for it ("Quotes API"), the type, the domains and the value → **Guardar cifrada** (save encrypted).
- **Types:**
  - **Token (Bearer):** goes in `Authorization: Bearer <token>`. Paste only the token, without the word Bearer.
  - **Cabeçalho próprio** (custom header): goes in a header with the name the API asks for (e.g. `X-Api-Key`).
  - **Usuário e senha (Basic)** (user and password): goes in `Authorization`, encoded the way HTTP Basic requires.
- **Domains:** where it may go, one per line, up to 20: `api.example.com`, or `*.example.com` for subdomains. The wildcard does
  not cover `example.com` itself: if you need it, list both. No IPs,
  `localhost` or internal networks.
- **At request time**, it only goes over **https** and only to a host on the list. Otherwise the node fails and the
  request does not go out.
- **Once saved**, the screen shows only the last 4 characters (`••••abcd`; a short value shows not even that). Each
  credential's card: **Trocar o valor** (replace the value), **Editar** (name, type between token and header, domains)
  and **Apagar** (delete).
- **They work in every space.** They live in `~/.orkester/credenciais.json`, each value encrypted by the Windows vault.
  Without the vault available, the tab is read-only and saves nothing: the app never writes the value as plain text.
- **They never leave:** not to the screen, not to `ork`, not to MCP, not to the Code node. The flow, the export and the
  run only carry the **name**. Any text equal to the value that shows up in a run becomes `•••`.
- **Deleting** a credential in use does not touch the flows: their next request fails with `credencial X não existe`.
  When you delete, the app says which flows cited it. Renaming has the same effect: edit the HTTP nodes that cite the
  old name.

> **Use a credential, not a hand-written header.** A token put straight into `cabecalhos` (or into the URL) is part of
> the flow: it goes whole into Ctrl+C, into `ork fluxo ver --json`, into what an agent reads from the flow and into the
> file on disk. With a credential, none of these carries the value. The editor warns when a header or query parameter
> name looks like a secret (`token`, `api-key`, `password`…).

## Sensitive nodes: who turns them on

Code, HTTP and Shell command are **sensitive**: they run code, talk to the internet or type into a terminal. A flow with
any of them follows these rules:

- **Agents and MCP clients can create and edit, but not turn on.** The sensitive flow they save stays off, and
  `ork fluxo ligar` (or `fluxo_ligar`) on it is refused.
- **Only you turn it on, seeing the nodes.** Turning it on opens a confirmation with each sensitive node **in full**
  (the code, the URL, the command). Each one is marked: **igual ao que você aprovou** (same as you approved), **mudou**
  (changed) or **novo** (new), plus the name of the agent that created or touched it, if one did.
- **Changed after approval, it turns off.** Saving a change to a sensitive node of an enabled flow turns it off, even
  when you made the change: turn it on again to approve what changed. Name, position and notes do not count as changes.
- **Local network addresses too.** The list of addresses on your computer or network that HTTP may call is part of
  the approval: the confirmation shows it, and changing the list turns an enabled flow off until you confirm again
  ([The HTTP node and the network](#the-http-node-and-the-network)).
- **Seal.** The approval carries a seal that only the app can make. If someone edits the flow file directly on disk,
  the seal does not match: the flow does not run and is turned off with the reason "nó sensível mudou sem aprovação"
  (sensitive node changed without approval). The seal is not an absolute barrier (a program running as you on Windows
  can recreate it); it is there to catch a change that went around the app.
- **Rodar fluxo** with a sensitive node not yet approved opens the confirmation with the button **Aprovar e rodar uma
  vez** (approve and run once): it runs now and approves the nodes, but does **not** turn the flow on.

## Guards and limits

**Against loops and excess** (these apply to enabled flows that fire on their own):

| Guard | What happens |
|---|---|
| 1 minute between two firings of the same flow | an event that arrives earlier waits its turn (up to 3 waiting; the rest is dropped and counted) |
| hourly cap of the flow: 6 (default) | over it, the flow is **turned off** ("disparou demais", fired too often) and you are notified. With a Clock trigger, on save, the cap rises to what the clock needs (every 10 min needs 6; every 2 min, 30), at most 30. This version has no field on screen to change it |
| space cap: 30 firings per hour | over it, the firing is skipped and the flow stays on |
| loop | a flow message marks the agent that received it for 30 minutes. If what it does fires another flow, that counts as a chain: the chain stops at 3 flows in a row, and never passes the same flow twice ("barrado: laço", blocked: loop) |
| kanban | a task created or moved by a flow does not fire the task-changed-column trigger |

**Size:**

| What | Limit |
|---|---|
| flows per space | 100 |
| folders | 100, up to 3 levels |
| nodes / links per flow | 60 / 120 |
| one run | 50 steps, 60 seconds, 1000 items and 5 MB per list |
| items per node | Message, Task, Command, Notify and Query: 5 coming in (Query emits up to 100). HTTP: 20 |
| runs kept | the last 50 of each flow |
| input and output kept per node | ~10 KB (beyond that, "Cortado" shows; the counts stay right) |
| If conditions / Set fields | 10 / 30 |

## Flows made by agents

An agent creates and edits flows with `ork fluxo` (see [`ork.md`](ork.md#flows)); an outside client, with the `fluxo_*`
tools (see [`mcp.md`](mcp.md)). The rules:

- **Only in its own space.**
- **It only cites who it reaches.** The message target, who receives the delivery, who the trigger watches and the
  command's shell must be linked to the agent by a string or band (or have been opened by it); in a Query node, also the
  `responsavel` and `agente` it cites (checked on save). A message with no
  `entregaPara` sends the delivery back to the agent itself. This is checked on create and on edit. At every firing, the check runs again only in a
  flow with a Message node or a Task node that uses an expression: each message's target and delivery, and who the
  trigger watches. Out of reach, the flow skips that turn and stays on (an event from a card out of reach is not even
  seen); if the agent's card leaves the board and the flow has a Message node, it turns off ("cartão sumiu"). The
  command's shell is not checked again: you saw it when turning the flow on.
- **Sensitive stays off** until you turn it on (see above).
- **You get to know.** Creating, editing, turning on, turning off and deleting by an agent shows in the window corner
  ("Revisor criou o fluxo …").
- **You adopt the flow** by editing it on the page: from then on it is yours, and the reach rules stop applying.
- The skill the app installs in the agents tells them to create or turn on a flow only when you ask, and never to ask
  for or write the value of a credential.

## Recipes

The first three are the examples every space gets in the **Exemplos** folder, turned off. Deleting them does not bring
them back.

### 1. Finished task notifies the Maestro

Trigger **Tarefa mudou de coluna** (to the kanban's final column, by anyone) → **Recado** to the Maestro:
`A tarefa #{{ numero }} ({{ titulo }}) entrou em Feito. Revise se falta algo nela.`

### 2. Agent stopped at a question

Trigger **Agente parou** (`como`: question, any agent) → **Recado** to the Maestro:
`{{ agenteNome }} parou numa pergunta e está esperando resposta.`

### 3. End-of-day review

Trigger **Relógio** (every day at 18:00) → **Tarefa** `Revisar o que ficou aberto hoje` in the entry column.

### 4. A delivery with a problem becomes a task

A delivery that mentions "blocked" or "error" becomes a task with its text. The others go straight through.

```json
{
  "orkester": "fluxo",
  "versao": 1,
  "nome": "Delivery with a problem becomes a task",
  "nos": [
    { "id": "no-1", "nome": "Delivery arrived", "tipo": "gatilho.entrega", "versaoDoTipo": 1, "posicao": [0, 0],
      "ajustes": {} },
    { "id": "no-2", "nome": "Any problem?", "tipo": "logica.se", "versaoDoTipo": 1, "posicao": [300, 0],
      "ajustes": {
        "condicoes": [
          { "valor": "{{ texto }}", "operador": "contem", "comparar": "blocked" },
          { "valor": "{{ texto }}", "operador": "contem", "comparar": "error" }
        ],
        "combinar": "ou"
      } },
    { "id": "no-3", "nome": "Create the task", "tipo": "orkester.tarefa", "versaoDoTipo": 1, "posicao": [600, 0],
      "ajustes": { "titulo": "Unblock the delivery from {{ deNome }}", "descricao": "{{ texto }}" } }
  ],
  "ligacoes": [
    { "de": "no-1", "saida": 0, "para": "no-2" },
    { "de": "no-2", "saida": 0, "para": "no-3" }
  ]
}
```

Output `1` of the If node (false) is not linked: deliveries without a problem stop there.

### 5. Open GitHub issues to the Maestro (HTTP, credential and Code)

Every morning, fetch the open issues of a repository, join them into a list and send it to the Maestro.

1. In Configurações › Conexões › Credenciais, save a credential named **GitHub**, type **Token (Bearer)**, domain
   `api.github.com`, with a token of yours.
2. Paste the flow below, replace `dono/repo` with your repository and save.
3. Turn it on: since it has HTTP and Code, the confirmation shows both nodes in full.

```json
{
  "orkester": "fluxo",
  "versao": 1,
  "nome": "Open issues to the Maestro",
  "nos": [
    { "id": "no-1", "nome": "Every morning", "tipo": "gatilho.relogio", "versaoDoTipo": 1, "posicao": [0, 0],
      "ajustes": { "quando": { "tipo": "diario", "hora": 9, "minuto": 0 } } },
    { "id": "no-2", "nome": "Fetch the issues", "tipo": "fora.http", "versaoDoTipo": 1, "posicao": [300, 0],
      "ajustes": {
        "metodo": "GET",
        "url": "https://api.github.com/repos/dono/repo/issues",
        "consulta": [{ "nome": "state", "valor": "open" }, { "nome": "per_page", "valor": "20" }],
        "cabecalhos": [{ "nome": "Accept", "valor": "application/vnd.github+json" }],
        "corpo": { "tipo": "nenhum", "valor": "" },
        "credencial": "GitHub"
      } },
    { "id": "no-3", "nome": "Join into a list", "tipo": "fora.codigo", "versaoDoTipo": 1, "posicao": [600, 0],
      "ajustes": { "codigo": "const issues = $input.first().json.corpo\nif (!Array.isArray(issues) || !issues.length) return []\nconst linhas = issues.map((i) => `#${i.number} ${i.title}`)\nreturn [{ json: { total: issues.length, lista: linhas.join('\\n') } }]\n" } },
    { "id": "no-4", "nome": "Message to the Maestro", "tipo": "orkester.recado", "versaoDoTipo": 1, "posicao": [900, 0],
      "ajustes": { "para": "maestro", "texto": "There are {{ total }} open issues:\n{{ lista }}", "juntarEvento": false } }
  ],
  "ligacoes": [
    { "de": "no-1", "saida": 0, "para": "no-2" },
    { "de": "no-2", "saida": 0, "para": "no-3" },
    { "de": "no-3", "saida": 0, "para": "no-4" }
  ]
}
```

The Code node returns an empty list when there are no issues: then no message goes out. To test before turning it on,
add a **Manual** trigger linked to the same HTTP node and use **Rodar fluxo**.

### 6. Revisão summary at 18:00 (Query)

Every day at 18:00, reads the open tasks in the **Revisão** column and sends the Maestro a list with who is on each.
The Query node emits one ficha per task; the Code node merges them into one item, because the Message node acts at most
5 times. Since it has Code, only you turn it on, seeing that node. With no task in Revisão, the Query emits 0 items and
nothing is sent.

```json
{
  "orkester": "fluxo",
  "versao": 1,
  "nome": "Revisão summary at 18:00",
  "nos": [
    {
      "id": "no-1",
      "nome": "At 18:00",
      "tipo": "gatilho.relogio",
      "versaoDoTipo": 1,
      "posicao": [
        0,
        0
      ],
      "ajustes": {
        "quando": {
          "tipo": "diario",
          "hora": 18,
          "minuto": 0
        }
      }
    },
    {
      "id": "no-2",
      "nome": "Tasks in Revisão",
      "tipo": "orkester.consultar",
      "versaoDoTipo": 1,
      "posicao": [
        300,
        0
      ],
      "ajustes": {
        "recurso": "tarefa",
        "operacao": "varios",
        "coluna": "Revisão",
        "limite": 20
      }
    },
    {
      "id": "no-3",
      "nome": "Merge into a list",
      "tipo": "fora.codigo",
      "versaoDoTipo": 1,
      "posicao": [
        600,
        0
      ],
      "ajustes": {
        "codigo": "const tarefas = $input.all().map((i) => i.json)\nconst linhas = tarefas.map((t) => `${t.ref} ${t.titulo} (${t.responsaveis.map((r) => r.nome).join(', ') || 'no assignee'})`)\nreturn [{ json: { total: tarefas.length, lista: linhas.join('\\n') } }]\n"
      }
    },
    {
      "id": "no-4",
      "nome": "Message to the Maestro",
      "tipo": "orkester.recado",
      "versaoDoTipo": 1,
      "posicao": [
        900,
        0
      ],
      "ajustes": {
        "para": "maestro",
        "texto": "{{ total }} tasks are waiting for review:\n{{ lista }}",
        "juntarEvento": false
      }
    }
  ],
  "ligacoes": [
    {
      "de": "no-1",
      "saida": 0,
      "para": "no-2"
    },
    {
      "de": "no-2",
      "saida": 0,
      "para": "no-3"
    },
    {
      "de": "no-3",
      "saida": 0,
      "para": "no-4"
    }
  ]
}
```

Replace `"Revisão"` with your column's name, if it differs. To test before turning it on, add a **Manual** trigger
linked to the Query node and use **Rodar fluxo**.

## When something goes wrong

- **The flow does not turn on.** The message says what is missing: a trigger, a card or column "a escolher" (to
  choose), or the confirmation of the sensitive nodes (an agent cannot turn on a sensitive flow).
- **Rodar fluxo refuses.** It enters through the **Manual** trigger: add one. And it runs what is **saved**: save first.
- **The message ended as "sem destino"** (no recipient). The agent is not open, is a shell, or there is no Maestro
  open in the space. The node does not turn red (it ran), but the message reached no one: the run shows as
  "sem destino".
- **The flow turned itself off.** The list says why: it fired too often (over the hourly cap), one of its cards
  disappeared, one of its columns left the Kanban ("desligado: uma coluna saiu do kanban"), or a sensitive node changed
  without approval.
- **I deleted a Kanban column.** The app tells you in the window (and in the `ork` answer) which flows used the column,
  in a task-changed-column trigger or a Task node, and which were turned off: the enabled ones turn off right away.
  Open each one, choose another column and turn it on again.
- **"barrado: laço" or "barrado: excesso"** (blocked: loop / excess) in the runs: see
  [Guards and limits](#guards-and-limits).
- **"junte os itens antes, no nó Código"** (merge the items first, in a Code node). More than 5 items reached an
  Orkester action (or more than 20 reached HTTP). Put a Code node before it that merges them into one.
- **HTTP: "é desta máquina ou da rede local"** (is on this machine or the local network). The address is on your
  computer or your network. If that is on purpose, open the HTTP node, click **Permitir … neste fluxo** and save
  ([above](#the-http-node-and-the-network)). If a name points to a local address, write the IP instead of the name and
  allow the IP.
- **HTTP: "credencial X: só vai por https" or "não está nos domínios dela"** (only over https / not in its domains).
  Check the URL and the credential's domains.
- **A flow file does not open.** The list shows the files that failed to load, with the reason; they do not run. The
  app deletes nothing.
- An enabled flow that fails notifies you (in the window corner or in a notification), at most once every 10 minutes
  per flow.
