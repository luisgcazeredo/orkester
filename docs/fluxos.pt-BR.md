# Guia dos Fluxos

[English](fluxos.md) · Português

[//]: # "Guia conferido no código da 1.9.6 em 23/11/2026 e atualizado com as entregas da 1.9.7 em 24/11/2026 (nó fora.mcp: shared/fluxos/nos.ts, main/fluxos/mcp.ts, main/mcpFora/; D1, D3 e D5). Fontes (relativas a app/src/): shared/fluxos/{tipos,formato,nos,fichas,expressoes,executor,rede,credenciais,exemplos}.ts, main/fluxos/{servico,verbos,codigo,http,credenciais,alcance,selo,index,consulta}.ts, main/motorDeAutomacoes.ts, shared/automacoes.ts (travas), main/regrasDaBandeja.ts."

Um **fluxo** é uma automação desenhada em nós: um **gatilho** (uma tarefa que muda de coluna, uma entrega, um agente
que parou, a hora, ou o botão **Rodar fluxo**) seguido do que fazer (mandar um recado, criar uma tarefa, avisar
você, decidir, mexer nos dados, rodar JavaScript, chamar uma API ou uma ferramenta de um servidor MCP). Cada espaço tem os seus fluxos.

Este guia é a referência de quem monta um fluxo, à mão ou pedindo a um agente. Como usar a página (lista, pastas,
editor, execuções) está no manual, em [Página Fluxos](manual.pt-BR.md#página-fluxos).

## Índice

1. [Primeiros passos](#primeiros-passos)
2. [Como um fluxo roda](#como-um-fluxo-roda)
3. [O formato JSON](#o-formato-json)
4. [Os nós](#os-nós)
5. [Campos padrão (fichas)](#campos-padrão-fichas)
6. [Expressões `{{ }}`](#expressões--)
7. [O nó Código](#o-nó-código)
8. [O nó HTTP e a rede](#o-nó-http-e-a-rede)
9. [Credenciais](#credenciais)
10. [Nós sensíveis: quem liga](#nós-sensíveis-quem-liga)
11. [Travas e limites](#travas-e-limites)
12. [Fluxos feitos por agentes](#fluxos-feitos-por-agentes)
13. [Receitas](#receitas)
14. [Quando algo dá errado](#quando-algo-dá-errado)

## Primeiros passos

Um fluxo é um **gatilho** (o que faz ele disparar) seguido de **nós** ligados em fila, cada um fazendo uma coisa.
O caminho pela tela, do zero até um fluxo ligado:

1. **Criar.** Na página **Fluxos**, clique em **Novo fluxo**. O editor abre vazio.
2. **Primeiro nó.** Clique no **+** do meio (**Adicionar o primeiro nó**) e escolha um gatilho. Para testar à mão,
   comece pelo **Manual**.
3. **Próximos nós.** Arraste da bolinha de saída de um nó e solte no vazio: a busca abre e o nó escolhido já nasce
   ligado. Soltar em cima de outro nó liga os dois. **+ Nó**, **Tab** ou **N** também abrem a busca. Vinda de uma
   saída (ou com um nó selecionado), a busca mostra os gatilhos num grupo à parte, no fim, com a nota "gatilho entra
   solto": o gatilho escolhido nasce sem ligação, porque é o começo de um fluxo. Buscar "Manual" acha.
4. **Ajustar.** Clique duplo num nó abre o painel em três colunas: **Entrada** (o que chegou), **Ajustes** (o que
   ele faz) e **Saída** (o que sai). O botão **Documentação** do painel mostra o trecho deste guia sobre aquele nó.
5. **Testar.** Clique em **Salvar** (Ctrl+S) e depois em **Rodar fluxo**. Ele roda uma vez o que está salvo, pelo
   gatilho Manual, mesmo desligado.
6. **Ver o que aconteceu.** A execução abre no desenho: verde rodou, vermelho deu erro, cinza não rodou. A aba
   **Execuções** guarda as 50 últimas; abra um nó para ver a entrada e a saída daquela vez. Se alguma `{{ }}` veio
   vazia, a faixa de cima da execução diz qual e em que nó ("`{{ x }}` veio vazio em Recado ao Maestro").
7. **Ligar.** O interruptor **Ligado/Desligado** (no editor ou na lista) faz o fluxo disparar sozinho. Todo fluxo
   nasce desligado. Um nó **sensível** (Código, HTTP, Ferramenta MCP ou Comando no shell) pede antes a sua
   confirmação, nó por nó, e
   só você liga um fluxo que tem um deles.

Mais coisas que ajudam:

- **Pastas.** O botão **Nova**, à esquerda, cria uma pasta. Arraste um fluxo até ela.
- **Exportar e importar.** No editor, **Ctrl+C** sem nada selecionado copia o fluxo inteiro em JSON. Para trazer um,
  abra **Novo fluxo**, cole com **Ctrl+V** e salve.
- **Pedir a um agente.** Diga o que você quer ("quando uma tarefa entrar em Revisão, avise o Revisor"). O agente
  monta com `ork fluxo`, o fluxo nasce desligado e um aviso aparece no canto da janela. Confira e ligue.
- **Ctrl+K** acha um fluxo pelo nome e abre no editor.

Para começar de um exemplo pronto: [Tarefa pronta avisa o Maestro](#1-tarefa-pronta-avisa-o-maestro) e
[Entrega com problema vira tarefa](#4-entrega-com-problema-vira-tarefa).

## Como um fluxo roda

- **Itens.** O que passa de um nó para o outro é uma lista de itens. Cada item é um objeto JSON (`{ "json": { … } }`
  no disco; nos nós você só vê o que está dentro de `json`). O gatilho solta um item com os dados do evento.
- **Caminho.** O fluxo anda em profundidade a partir do gatilho que disparou, seguindo as ligações na ordem em que
  foram feitas. Um nó que recebe 0 itens não roda, e os que vêm depois dele também não.
- **Várias entradas.** Um nó pode receber ligação de mais de um nó (por exemplo, um gatilho Manual e um Relógio
  levando ao mesmo nó). Os ramos não se juntam: cada chegada roda o nó de novo, só com os itens que chegaram por ela.
  Ciclo não vale.
- **Item a item ou de uma vez.** Se e Definir tratam cada item. O Código roda uma vez só, com todos. HTTP faz um
  pedido por item (até 20), e a Ferramenta MCP, uma chamada por item (até 10 na execução inteira). Recado, Tarefa, Comando, Avisar e Consultar agem uma vez por item (até 5); com mais, o nó dá erro
  pedindo para juntar os itens antes, num nó Código. Assim nenhum fluxo manda 50 recados de uma vez.
- **O primeiro erro para tudo.** O nó que falhou fica vermelho, os que não chegaram a rodar ficam cinza, e não há
  nova tentativa. A execução guarda a mensagem do erro.
- **Uma execução por vez em cada espaço.** Fluxos do mesmo espaço entram numa fila. Espaços diferentes rodam ao
  mesmo tempo, então um HTTP lento num espaço não segura os outros.
- **Sem janela também.** Um fluxo ligado continua disparando com a janela do espaço fechada (o app fica na bandeja,
  veja o manual). O recado só chega a um agente que está aberto: um espaço que não foi aberto desde que o app subiu
  não tem agentes vivos, e o recado dá "sem destino".

## O formato JSON

É o que o **Ctrl+C** do editor copia, o que `ork fluxo ver "Nome" --json` mostra e o que `ork fluxo criar` e as
ferramentas MCP `fluxo_criar` e `fluxo_editar` recebem. Cole este exemplo no editor (abra **Novo fluxo** e aperte
**Ctrl+V**) e ele aparece pronto para salvar:

```json
{
  "orkester": "fluxo",
  "versao": 1,
  "nome": "Rodar à mão avisa você",
  "nos": [
    {
      "id": "no-1",
      "nome": "Rodar à mão",
      "tipo": "gatilho.manual",
      "versaoDoTipo": 1,
      "posicao": [0, 0],
      "ajustes": {}
    },
    {
      "id": "no-2",
      "nome": "Monta a frase",
      "tipo": "logica.definir",
      "versaoDoTipo": 1,
      "posicao": [300, 0],
      "ajustes": {
        "campos": [{ "nome": "frase", "valor": "Rodei às {{ em }}" }],
        "manterOutros": true
      }
    },
    {
      "id": "no-3",
      "nome": "Avisa",
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

| Campo | O que é |
|---|---|
| `orkester` | sempre `"fluxo"` |
| `versao` | sempre `1`. Um fluxo de uma versão mais nova do app é recusado com o pedido de atualizar |
| `nome` | o nome do fluxo, uma linha, até 80 letras |
| `nos` | a lista de nós, até 60 |
| `nos[].id` | identificador do nó: letras, números, `-` e `_`, até 80. As ligações usam o id, então renomear um nó não quebra nada |
| `nos[].nome` | o nome que a tela mostra, uma linha, até 60 letras, único no fluxo (sem diferenciar maiúsculas). É o nome que o `$('Nome')` do Código usa |
| `nos[].tipo` | um dos tipos de [Os nós](#os-nós) |
| `nos[].versaoDoTipo` | sempre `1` |
| `nos[].posicao` | `[x, y]` no editor |
| `nos[].ajustes` | os ajustes do tipo (em cada nó, em [Os nós](#os-nós)) |
| `nos[].notas` | opcional, texto livre para quem ler o fluxo depois, até 2000 letras |
| `ligacoes` | até 120. `de` e `para` são ids de nó; `saida` é `0`, ou no Se `0` = verdadeiro e `1` = falso |

O que **não** vai no JSON: se o fluxo está ligado, a pasta, quem criou, o teto por hora, os endereços da rede local permitidos e a
aprovação dos nós sensíveis. Isso é do app. Um fluxo colado ou criado pelo `ork` nasce **desligado**, na raiz da lista (ou na pasta pedida com `--pasta`
ou `pasta`).

**Regras do grafo:** ids e nomes sem repetir; ligação só entre nós que existem e por uma saída que o nó tem; nada
liga **em** um gatilho; sem ligação repetida e sem ciclo. Para **ligar**, o fluxo precisa de pelo menos um gatilho.

**Cartões e colunas** vão como `{ "id": "…", "nome": "…" }`. Pode mandar só o nome (`"Revisão"` ou
`{ "nome": "Revisão" }`): o app procura pelo nome, sem ligar para maiúsculas nem acento. Assim um fluxo copiado de
outro espaço se acerta sozinho. Se o nome não bater com nada, ou bater com mais de um, o campo fica **a escolher**
(o nó mostra um aviso) e o fluxo não liga até você escolher. No destino de um recado, `"maestro"` quer dizer o
agente com a função Maestro que estiver aberto no espaço na hora.

## Os nós

Cada nó abaixo segue o mesmo modelo, em cinco partes: **O que faz**, **Ajustes** (no JSON, dentro de `ajustes`),
**Saída** (o que ele solta para o nó seguinte), **Expressões úteis** e **Erros comuns**. Na coluna "aceita `{{ }}`",
"sim" quer dizer que o campo aceita [expressões](#expressões--). Cartões e colunas vão como `{ "id", "nome" }` ou só
pelo nome (veja [O formato JSON](#o-formato-json)).

| Grupo | Nó | Tipo |
|---|---|---|
| Gatilhos | [Tarefa mudou de coluna](#tarefa-mudou-de-coluna--gatilhokanban) | `gatilho.kanban` |
| | [Entrega chegou](#entrega-chegou--gatilhoentrega) | `gatilho.entrega` |
| | [Agente parou](#agente-parou--gatilhoparou) | `gatilho.parou` |
| | [Relógio](#relógio--gatilhorelogio) | `gatilho.relogio` |
| | [Manual](#manual--gatilhomanual) | `gatilho.manual` |
| Orkester | [Recado](#recado--orkesterrecado) | `orkester.recado` |
| | [Tarefa](#tarefa--orkestertarefa) | `orkester.tarefa` |
| | [Comando no shell](#comando-no-shell--orkestercomando) (sensível) | `orkester.comando` |
| | [Avisar](#avisar--orkesteravisar) | `orkester.avisar` |
| | [Consultar o Orkester](#consultar-o-orkester--orkesterconsultar) | `orkester.consultar` |
| Lógica | [Se](#se--logicase) | `logica.se` |
| | [Definir campos](#definir-campos--logicadefinir) | `logica.definir` |
| Fora do Orkester | [Código](#código--foracodigo) (sensível) | `fora.codigo` |
| | [HTTP](#http--forahttp) (sensível) | `fora.http` |
| | [Ferramenta MCP](#ferramenta-mcp--foramcp) (sensível) | `fora.mcp` |

Gatilho não recebe ligação: é o começo do fluxo, e o item que ele solta é o evento. Os outros nós recebem itens e
soltam itens.

### Tarefa mudou de coluna · `gatilho.kanban`

**O que faz.** Dispara quando uma tarefa do kanban entra numa coluna. Tarefa criada ou movida por um fluxo **não**
dispara este gatilho (é uma das [travas](#travas-e-limites)).

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `paraColuna` | a coluna em que a tarefa entrou | não | (obrigatório) |
| `deColuna` | só quando ela veio desta coluna | não | qualquer origem |
| `por` | quem moveu: `"usuario"`, `"agente"` ou `"qualquer"` | não | `"qualquer"` |

**Saída.** Um item com `numero`, `titulo`, `deColuna` e `paraColuna` (ids), `deColunaNome`, `paraColunaNome`, `por`
(`usuario` ou `agente`), `quem` (o nome de quem moveu) e `tarefa`: a [ficha da tarefa](#campos-padrão-fichas)
inteira (etiquetas, responsáveis, descrição, último comentário…), ou `null` se ela não pôde ser lida. Abaixo, a ficha
vai resumida.

```json
{ "numero": 12, "titulo": "Revisar o contrato", "deColuna": "fazendo", "paraColuna": "revisao",
  "deColunaNome": "Fazendo", "paraColunaNome": "Revisão", "por": "agente", "quem": "Revisor",
  "tarefa": { "numero": 12, "ref": "#12", "coluna": { "id": "revisao", "nome": "Revisão" }, "etiquetas": ["contrato"] } }
```

**Expressões úteis.**
- `A tarefa #{{ numero }} ({{ titulo }}) entrou em {{ paraColunaNome }}`
- `{{ quem }} moveu de {{ deColunaNome }} para {{ paraColunaNome }}`
- `{{ tarefa.ref }}: {{ tarefa.ultimoComentario.texto }}`
- No Se: `{{ tarefa.etiquetas }}` `contem` `urgente`

**Erros comuns.**
- "diga a coluna de destino" → escolha `paraColuna`.
- "escolha "paraColuna" (o nome não bateu com nada deste espaço)" → o fluxo veio de outro espaço ou a coluna mudou de
  nome: escolha a coluna no painel do nó.
- "a coluna "X" saiu do kanban" → a coluna foi apagada: escolha outra. Ao apagar a coluna, o app avisa quais fluxos a
  usavam, e os ligados desligam ("desligado: uma coluna saiu do kanban").
- Não disparou → a tarefa foi movida por um fluxo, ou o filtro `por` / `deColuna` não bateu.

### Entrega chegou · `gatilho.entrega`

**O que faz.** Dispara quando um agente entrega com `ork entregar`. Sem filtro, vale qualquer entrega do espaço.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `de` | só as entregas deste cartão | não | qualquer um |
| `para` | só as que vão para este cartão | não | qualquer um |
| `contem` | só quando o texto contém isto (até 80 letras, sem diferenciar maiúsculas) | não | sem filtro |

**Saída.** Um item com `de` (id de quem entregou), `deNome`, `para`, `paraNome`, `texto` (até 1500 letras),
`quemEntregou` e `quemRecebe`: a [ficha de agente](#campos-padrão-fichas) de cada lado, ou `null` quando é você, um
cartão fechado ou de outro espaço. Abaixo, as fichas vão resumidas.

```json
{ "de": "c-7f2a", "deNome": "Revisor", "para": "c-1b9e", "paraNome": "Maestro",
  "texto": "Revisei o contrato: duas cláusulas para ajustar.",
  "quemEntregou": { "id": "c-7f2a", "nome": "Revisor", "funcao": "Revisor", "estado": "livre" },
  "quemRecebe": { "id": "c-1b9e", "nome": "Maestro", "funcao": "Maestro", "estado": "trabalhando" } }
```

**Expressões úteis.**
- `{{ deNome }} entregou: {{ texto }}`
- No Se: `{{ texto }}` `contem` `bloqueado`
- `{{ deNome }} ({{ quemEntregou.funcao }}, {{ quemEntregou.modelo }}) entregou`

**Erros comuns.**
- ""de" não é um cartão" / ""para" não é um cartão" → escolha um cartão do quadro, ou tire o filtro.
- ""contém" passa de 80 letras" → encurte o filtro.
- Não disparou → a entrega foi feita por outro caminho (um recado não é entrega) ou um filtro não bateu.

### Agente parou · `gatilho.parou`

**O que faz.** Dispara quando um agente fica livre, para numa pergunta ou encerra.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `agente` | qual agente vigiar | não | qualquer agente Claude ou Codex do espaço (shell não conta) |
| `como` | um ou mais de `"parou"` (terminou e ficou livre), `"pergunta"` e `"encerrou"` | não | `["pergunta"]` |

**Saída.** Um item com `agente` (id), `agenteNome`, `como` e `quemParou`: a [ficha do agente](#campos-padrão-fichas)
(função, modelo, andar, tarefas em que trabalha…), ou `null` se ele não pôde ser lido. Abaixo, a ficha vai resumida.

```json
{ "agente": "c-7f2a", "agenteNome": "Revisor", "como": "pergunta",
  "quemParou": { "id": "c-7f2a", "nome": "Revisor", "funcao": "Revisor", "estado": "pergunta", "tarefas": [12] } }
```

**Expressões úteis.**
- `{{ agenteNome }} parou numa pergunta e está esperando resposta.`
- No Se: `{{ como }}` `igual` `encerrou`
- `{{ agenteNome }} ({{ quemParou.funcao }}) parou; está nas tarefas {{ quemParou.tarefas }}`

**Erros comuns.**
- "diga parou, pergunta e/ou encerrou" → marque pelo menos um em `como`.
- ""agente" não é um cartão" → escolha um agente do quadro, ou deixe vazio para qualquer um.
- Não disparou → o cartão é um shell, ou o agente vigiado foi fechado.

### Relógio · `gatilho.relogio`

**O que faz.** Dispara a cada N minutos, todo dia ou toda semana. O que venceu com o app fechado (ou com o fluxo
desligado) não dispara depois.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `quando` | `{ "tipo": "cada", "minutos": 30 }` (de 2 a 10080), `{ "tipo": "diario", "hora": 18, "minuto": 0 }` ou `{ "tipo": "semanal", "dia": 1, "hora": 9, "minuto": 0 }` (`dia`: 0 = domingo … 6 = sábado) | não | todo dia às 9:00 |

Abaixo de 10 minutos, ao salvar, o teto por hora do fluxo sobe para caber (veja [Travas e limites](#travas-e-limites)).

**Saída.** Um item com `em`: a data e a hora do disparo, no formato ISO.

```json
{ "em": "2026-11-23T18:00:00.000Z" }
```

**Expressões úteis.**
- `Revisão de {{ em }}`
- `{{ $fluxo.nome }} rodou em {{ $espaco.nome }}` (veja [o que toda expressão enxerga](#o-que-toda-expressão-enxerga))

**Erros comuns.**
- "horário inválido (a cada N min, de 2 em diante; todo dia; ou toda semana)" → confira `quando`: minutos de 2 a
  10080, hora de 0 a 23, minuto de 0 a 59, dia de 0 a 6.
- Não disparou na hora → o app estava fechado, ou o fluxo estava desligado: o que venceu assim não volta.

### Manual · `gatilho.manual`

**O que faz.** Dispara pelo botão **Rodar fluxo** do editor, por `ork fluxo rodar` ou pela ferramenta `fluxo_rodar`.
Roda o que está salvo, mesmo com o fluxo desligado.

**Ajustes.** Nenhum.

**Saída.** Um item com `em` (a data e a hora, no formato ISO).

```json
{ "em": "2026-11-23T14:03:12.000Z" }
```

**Expressões úteis.**
- `Rodei às {{ em }}`
- `Execução {{ $execucao.id }} de {{ $fluxo.nome }}`

**Erros comuns.**
- "o fluxo não tem um gatilho Manual: ponha um para rodar daqui" → ponha um nó Manual e ligue-o ao primeiro nó do
  caminho.
- Rodou a versão antiga → o botão roda o que está **salvo**: salve antes.
- Com nó sensível ainda não aprovado → aparece **Aprovar e rodar uma vez** (veja [Nós sensíveis](#nós-sensíveis-quem-liga)).

### Recado · `orkester.recado`

**O que faz.** Manda um recado a um agente (Claude ou Codex) do espaço, ou ao Maestro, pela caixa de entrada. Age uma
vez por item, até 5.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `para` | o agente que recebe, ou `"maestro"` (o agente com a função Maestro aberto no espaço na hora) | não | `"maestro"` |
| `texto` | o recado, até 2000 letras | sim | (obrigatório) |
| `juntarEvento` | `true` acrescenta, depois do texto, um resumo do item que chegou ("O que aconteceu:"), só com os campos simples (texto, número, sim/não; as fichas ficam de fora) | não | `false` |
| `entregaPara` | para quem vai a entrega do agente, se o recado for trabalho | não | o Maestro |

O agente recebe com o cabeçalho `[ork · recado do fluxo "Nome"]`. O que veio do item e tem mais de uma linha entra
citado (cada linha com `| `), e nada do item consegue imitar um cabeçalho do Orkester. Shell não recebe recado: o
texto seria rodado como comando (para isso existe o Comando no shell).

**Saída.** Um item por recado, com `para` (id), `paraNome`, `resultado` (`na-fila`, ou `sem-destino: <motivo>`) e
`posicao` (o lugar na fila).

```json
{ "para": "c-1b9e", "paraNome": "Maestro", "resultado": "na-fila", "posicao": 1 }
```

**Expressões úteis.**
- `A tarefa #{{ numero }} ({{ titulo }}) entrou em {{ paraColunaNome }}. Revise.`
- `{{ deNome }} entregou:\n{{ texto }}`

**Erros comuns.**
- `sem-destino: não há Maestro aberto neste espaço` → abra um agente com a função Maestro, ou escolha um agente.
- `sem-destino: o cartão de destino não está aberto no espaço` / `… está encerrado` → abra o agente de novo. O nó não
  fica vermelho, mas a execução aparece como "sem destino".
- "chegaram N itens e este nó age no máximo 5 vezes" → junte os itens antes, num Código.
- "escreva o texto" / "o texto passa de 2000 letras" → escreva ou encurte o recado.

### Tarefa · `orkester.tarefa`

**O que faz.** Cria uma tarefa no kanban do espaço. Na coluna **Com o Maestro**, a tarefa nasce em Demandas e é
delegada ao Maestro, como se você a arrastasse. Age uma vez por item, até 5.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `titulo` | uma linha, até 120 letras | sim | (obrigatório) |
| `descricao` | até 4000 letras | sim | vazia |
| `coluna` | em que coluna nasce | não | a coluna de entrada (Demandas) |

**Saída.** Um item por tarefa, com `numero`, `titulo`, `coluna` (o **id** da coluna; vazio se o nó não escolheu uma),
`tarefa` (a [ficha](#campos-padrão-fichas) da tarefa criada, já com o nome da coluna; `null` se não pôde ser lida) e,
ao delegar, `para` (o id do Maestro). Abaixo, a ficha vai resumida.

```json
{ "numero": 31, "titulo": "Destravar a entrega de Revisor", "coluna": "",
  "tarefa": { "numero": 31, "ref": "#31", "coluna": { "id": "demandas", "nome": "Demandas" } } }
```

**Expressões úteis.**
- Título: `Destravar a entrega de {{ deNome }}`
- Descrição: `{{ texto }}`
- Depois do nó: `Criei a {{ tarefa.ref }} em {{ tarefa.coluna.nome }}`

**Erros comuns.**
- "escreva o título" / "o título passa de 120 letras" → o título é uma linha, até 120 letras (depois das expressões).
- "a coluna "X" não existe mais no kanban" → escolha outra coluna.
- "#N criada, mas não delegada: …" → a tarefa existe, mas não foi para o Maestro; veja o motivo e mova à mão.
- "chegaram N itens e este nó age no máximo 5 vezes" → junte os itens antes, num Código.

### Comando no shell · `orkester.comando`

**O que faz.** Digita um comando fixo num cartão **shell** do espaço, com a pasta e as permissões daquele shell. Se o
shell está ocupado ou parado numa pergunta, pula a vez (não é erro: o `resultado` diz). **Sensível**: só você liga o fluxo (veja [Nós sensíveis](#nós-sensíveis-quem-liga)).

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `terminal` | o cartão shell | não | (obrigatório) |
| `comando` | uma linha, até 500 letras, texto fixo | **não**, de propósito: nada que vem de fora vira comando | (obrigatório) |

**Saída.** Um item com `terminal` (id), `terminalNome` e `resultado` (`rodou`, ou `pulou: o terminal estava
ocupado`, `pulou: o terminal estava parado numa pergunta`…).

```json
{ "terminal": "c-3d0c", "terminalNome": "Shell do projeto", "resultado": "rodou" }
```

**Expressões úteis.** Nenhuma: o comando é digitado como está. Um `{{ caminho }}` nele é Falta: o fluxo salva, mas o nó
mostra o triângulo e não liga. O `{{ }}` de outra ferramenta, que não é caminho (`docker ps --format "{{.Names}}"`),
passa. Para variar o que roda, faça um script no projeto e chame-o sempre com o mesmo comando.

**Erros comuns.**
- "{{ }} não vale no comando" → tire a expressão (veja acima).
- "o comando é uma linha só" → junte numa linha, ou ponha os passos num script.
- "o cartão shell "X" não está aberto no espaço" / "não é um shell" → escolha um cartão shell aberto.
- "não confirmou o comando a tempo" → confira o shell: o comando pode ter rodado ou ficado escrito no prompt.

### Avisar · `orkester.avisar`

**O que faz.** Mostra um aviso a você: no canto da janela do espaço, ou, sem janela, numa notificação do Windows. O
texto sai como `Fluxo "Nome" (quem fez o fluxo): …`. Age uma vez por item, até 5.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `texto` | uma linha, até 300 letras | sim | (obrigatório) |

**Saída.** Um item com `avisado`: `janela` ou `notificacao`.

```json
{ "avisado": "janela" }
```

**Expressões úteis.**
- `{{ agenteNome }} parou numa pergunta`
- `{{ frase }}` (um campo montado antes num Definir campos)

**Erros comuns.**
- "escreva o texto" / "o texto passa de 300 letras" → o aviso é curto, uma linha.
- "sem janela do espaço e sem notificação do sistema" → as notificações do Windows estão desligadas para o
  Orkester: ligue-as, ou deixe a janela do espaço aberta.
- "chegaram N itens e este nó age no máximo 5 vezes" → junte os itens antes, num Código.

### Consultar o Orkester · `orkester.consultar`

**O que faz.** Lê coisas **deste espaço** e solta um item por [ficha](#campos-padrão-fichas): tarefas, colunas,
agentes, cartões do quadro, andares, o espaço, fluxos ou execuções. Só leitura: não muda nada, e nunca lê outro
espaço. Não é sensível; para os dados saírem do app, o fluxo precisa de HTTP ou Código, que só você liga. Roda uma
vez por item que chega, até 5, e a saída de todas as vezes se soma, até 100 itens.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `recurso` | `tarefa`, `coluna`, `agente`, `cartao`, `andar`, `espaco`, `fluxo` ou `execucao` | não | `tarefa` |
| `operacao` | `um` (uma ficha certa) ou `varios` (uma lista, com filtros) | não | `varios` |
| `limite` | quantas fichas, no máximo, de 1 a 100 | não | 20 |
| os filtros | dependem do recurso e da operação (tabela abaixo); os que não servem para eles são tirados ao salvar | só em `numero`, `etiqueta`, `contem` e `nome` | nenhum |

| Recurso | `um` (obrigatório) | `varios` (todos opcionais) |
|---|---|---|
| `tarefa` | `numero`: `12`, `#12` ou `{{ numero }}` | `coluna`; `etiqueta`; `responsavel` (um cartão, ou `"maestro"`); `contem` (no título ou na descrição); `concluidas` (`true` traz também as concluídas) |
| `coluna` | `coluna` | todas (sem filtro) |
| `agente` | `agente` (um cartão, ou `"maestro"`) | `tipo` (`claude`, `codex`, `shell`); `estado` (`livre`, `trabalhando`, `pergunta`, `encerrado`, `fechado`); `funcao` |
| `cartao` | `nome` (o nome exato) | `tipo` (`nota`, `texto`, `portal`, `arquivo`, `pasta`, `imagem`, `codigo`, `banda`); `andar` (o nome; o de baixo é "Térreo"); `contem` (no nome ou no texto) |
| `andar` | `nome` | todos (sem filtro) |
| `espaco` | o deste fluxo (sem ajuste; só `um`) | (não tem) |
| `fluxo` | `nome` (vazio = este fluxo) | `ligados` (`true` = só os ligados) |
| `execucao` | (não tem; só `varios`) | `fluxo` (o nome; vazio = este fluxo); no máximo 20 |

Nomes, etiquetas, funções e `contem` comparam sem ligar para maiúsculas nem acento. Tarefas saem das mais novas para
as mais antigas; sem `concluidas`, só as abertas.

**Saída.** Um item por ficha, com os campos de [Campos padrão](#campos-padrão-fichas). `varios` que não acha nada
solta 0 itens (os nós seguintes não rodam). Passando do limite, ou de 100 na soma, a lista é cortada e o painel do nó,
na execução, mostra a nota ("cortado no limite do nó: 150 casaram, saíram 100"). Abaixo, uma ficha de coluna.

```json
{ "id": "revisao", "nome": "Revisão", "papel": "revisao", "final": false, "tarefas": 3 }
```

**Expressões úteis.**
- No `numero`: `{{ numero }}` (a tarefa que veio do gatilho), para ler a ficha inteira dela
- Depois do nó: `{{ ref }} {{ titulo }} ({{ coluna.nome }})`, `{{ responsaveis }}`
- Num Código depois do nó: `$input.all().length` (quantas fichas saíram)

**Erros comuns.**
- "a tarefa #N não existe neste espaço" / "o agente "X" não está neste espaço" / "nenhum cartão se chama "X" neste
  espaço" / "o fluxo "X" não existe neste espaço" → o `um` não achou; confira o número ou o nome, ou use `varios`.
- "N cartões se chamam "X": use "vários" com outro filtro" → o nome não é único; filtre por tipo ou andar.
- "o andar "X" não existe neste espaço (o de baixo se chama "Térreo")" / "não há Maestro aberto neste espaço" →
  confira o nome do andar, ou abra o Maestro.
- "chegaram N itens e este nó consulta no máximo 5 vezes: junte os itens antes, no nó Código" → junte antes, ou
  ligue o Consultar direto ao gatilho.
- Fluxo feito por agente recusado ao salvar (o responsável ou o agente consultado está fora do alcance) → o agente
  só cita cartões ligados a ele (veja [Fluxos feitos por agentes](#fluxos-feitos-por-agentes)).

### Se · `logica.se`

**O que faz.** Separa os itens em duas saídas: a `0` (verdadeiro) recebe os que passam nas condições, a `1` (falso),
os outros. Cada item é tratado sozinho.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `condicoes` | de 1 a 10, cada uma `{ "valor", "operador", "comparar" }` | sim, em `valor` e `comparar` | uma condição vazia |
| `combinar` | `"e"` (todas as condições) ou `"ou"` (qualquer uma) | não | `"e"` |

| Operador | Passa quando |
|---|---|
| `igual`, `diferente` | dois números comparam como número (`5` é igual a `"5"`); o resto, pelo texto exato |
| `contem`, `nao-contem` | num texto, se contém `comparar`, sem diferenciar maiúsculas; numa lista, se algum elemento é igual a `comparar` pelo texto exato (aí maiúsculas contam: `["Urgente"]` não contém `urgente`) |
| `comeca`, `termina` | pelo texto, sem diferenciar maiúsculas |
| `maior`, `menor` | só números (texto que não é número dá falso) |
| `vazio`, `nao-vazio` | vazio = ausente, `null`, texto em branco, lista ou objeto vazios (ignoram `comparar`) |
| `verdadeiro`, `falso` | o valor `true`/`false` ou o texto `true`/`false` (ignoram `comparar`) |

Um `valor` que é **só** uma expressão (`"{{ numero }}"`) mantém o tipo: número continua número, lista continua lista.

**Saída.** Os mesmos itens, sem mudança, cada um na sua saída.

```json
{ "numero": 12, "titulo": "Revisar o contrato", "paraColunaNome": "Revisão" }
```

**Expressões úteis.**
- `{{ texto }}` `contem` `erro`
- `{{ numero }}` `maior` `100`
- `{{ tarefa.etiquetas }}` `contem` `urgente` (numa lista, compara elemento a elemento)

**Erros comuns.**
- "condição N: diga o valor (ex.: {{ titulo }})" → o `valor` não pode ficar vazio.
- "condição N: operador inválido" → use um operador da tabela.
- Nenhum item passa → confira maiúsculas numa lista e se o campo existe no item (ausente é vazio).
- A saída `1` (falso) solta ligada → os itens que não passaram param ali; é o esperado.

### Definir campos · `logica.definir`

**O que faz.** Põe ou troca campos em cada item.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `campos` | de 1 a 30, cada um `{ "nome", "valor" }`. O nome aceita caminho (`cliente.nome` cria o objeto `cliente` se ele não existir) | sim, no `valor` (não no nome) | nenhum |
| `manterOutros` | `true` mantém os campos que o item já tinha; `false` deixa só os definidos | não | `true` |

Um valor que é **só** uma expressão (`"{{ quantidade }}"`) mantém o tipo: número continua número, lista continua
lista; ausente vira `null`. Qualquer outro texto vira texto.

**Saída.** Os itens com os campos postos.

```json
{ "em": "2026-11-23T14:03:12.000Z", "frase": "Rodei às 2026-11-23T14:03:12.000Z" }
```

**Expressões úteis.**
- `frase` = `Rodei às {{ em }}`
- `quem` = `{{ deNome }}` (copia o campo, com o tipo)
- `cliente.nome` = `{{ titulo }}`

**Erros comuns.**
- "defina pelo menos um campo" → acrescente um campo.
- "campos: nome inválido "…"" → o nome é letras, números, `_` e `$`, com `.` entre as partes; sem espaço.
- "no máximo 30 campos" → divida em dois nós, ou monte no Código.

### Código · `fora.codigo`

**O que faz.** Roda JavaScript isolado que recebe **todos** os itens de uma vez e devolve uma lista de itens. Sem
disco, sem rede, 5 segundos. **Sensível**: só você liga o fluxo. A API inteira está em [O nó Código](#o-nó-código).

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `codigo` | JavaScript, até 20.000 letras | não (use `$input` e `$('Nome')` no código) | `return $input.all()` |

**Saída.** Os itens que o código devolveu (`return`). Lista vazia vale: os nós seguintes não rodam.

```json
{ "total": 3, "lista": "#12 Erro no login\n#15 Página lenta\n#18 Botão sumiu" }
```

**Expressões úteis.** No código, não há `{{ }}`. Nos nós depois dele, use os campos que ele devolveu:
`{{ total }}`, `{{ lista }}`.

**Erros comuns.**
- "erro de sintaxe no Código (linha N): …" → corrija a linha indicada.
- "o Código precisa devolver uma lista ([{ json: {...} }] ou [{...}])" → termine com `return [ … ]`.
- "o nó "X" não rodou antes deste no caminho" → `$('X')` só vê nós do caminho até aqui; confira o nome.
- "fetch não existe no nó Código: …" / "o Código passou de 5 s e foi parado" → para a internet, use o nó HTTP; deixe
  o código mais leve.

### HTTP · `fora.http`

**O que faz.** Faz um pedido HTTP a uma API na internet, com a chave de uma [API](#credenciais) se precisar. Um pedido por
item, até 20. **Sensível**: só você liga o fluxo. Rede, prazos e o que fica guardado estão em
[O nó HTTP e a rede](#o-nó-http-e-a-rede).

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `metodo` | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` ou `HEAD` | não | `GET` |
| `url` | começa com `http://` ou `https://`, ou com uma expressão (`{{ base }}/v1`), até 2000 letras | sim | `https://` |
| `consulta` | pares `{ "nome", "valor" }` depois do `?`, até 30. O app codifica nome e valor: escreva o texto puro (`a b`, não `a%20b`) | sim, no valor | nenhum |
| `cabecalhos` | pares `{ "nome", "valor" }`, até 30. Os do próprio protocolo (`Host`, `Content-Length`…) são do app | sim, no valor | nenhum |
| `corpo` | `{ "tipo": "nenhum" \| "json" \| "texto" \| "formulario", "valor": "…" }`, até 20.000 letras. `GET` e `HEAD` não levam corpo | sim, no valor | `nenhum` |
| `credencial` | o **nome** de uma API guardada em Configurações › Conexões › APIs. Na tela, o campo se chama **API** e lista só as APIs cujos domínios cobrem o host da URL (todas, se a URL tem `{{ }}`) | não | nenhuma |

**Saída.** Um item por pedido, com `status`, `cabecalhos` (da resposta), `corpo` (já como objeto quando a resposta é
JSON; senão texto) e `url` (só quando houve redirecionamento: o endereço final).

```json
{ "status": 200, "cabecalhos": { "content-type": "application/json" }, "corpo": { "ok": true } }
```

**Expressões úteis.**
- URL: `https://api.exemplo.com/tarefas/{{ numero }}`
- Corpo JSON: `{ "titulo": "{{ titulo }}", "numero": {{ numero }} }` (dentro de aspas entra como texto; fora, como valor)
- Depois do nó: `{{ corpo.items[0].nome }}`, `{{ status }}`

**Erros comuns.**
- "X respondeu 401 …" (ou outro código que não é 2xx) → a API recusou; confira a chave da API, a URL e o corpo.
- "a API X só lê: mude em Conexões › APIs" → o método é `POST`, `PUT`, `PATCH` ou `DELETE` e a API está como **Só
  lê**. A tela já avisa em vermelho no nó; o pedido nem sai. Se o fluxo precisa escrever, mude a API para **Lê e
  escreve**.
- "X é desta máquina ou da rede local; permita este endereço…" → se é de propósito, abra o nó e clique em
  **Permitir X neste fluxo** ([O nó HTTP e a rede](#o-nó-http-e-a-rede)). "… não pode ser usado: …" → esse endereço
  nunca é permitido; o motivo diz o que usar no lugar.
- "credencial X: só vai por https" / "não está nos domínios dela" / "credencial X não existe" → confira a URL, os
  domínios da API e o nome dela (renomear uma API em Conexões › APIs quebra os nós que citam o nome antigo).
- "chegaram N itens e o HTTP faz no máximo 20 pedidos" / "o pedido passou de 30 s" → junte os itens antes; veja se
  a API está no ar.

### Ferramenta MCP · `fora.mcp`

**O que faz.** Chama uma ferramenta de um **servidor MCP de fora** (um programa que você cadastrou em Configurações ›
Conexões › MCP › **Servidores de fora**, à mão ou importado do Claude Code; veja [`mcp.pt-BR.md`](mcp.pt-BR.md#servidores-de-fora)).
Uma chamada por item, no máximo 10 por execução (somando todas as vezes que o nó roda nela). **Sensível**: só você
liga o fluxo, e a confirmação mostra o servidor, a ferramenta e os argumentos inteiros. O valor das credenciais do
servidor nunca entra no fluxo. Antes de cada chamada, o app relê a lista de ferramentas do servidor: uma ferramenta
que mudou depois do cadastro fica **bloqueada** até você rever, e se a lista não puder ser lida, a chamada é recusada.

**Ajustes.**

| Campo | O que é | aceita `{{ }}` | Padrão |
|---|---|---|---|
| `servidor` | o servidor cadastrado, `{ "id", "nome" }`. Pode vir só pelo nome (`"servidor": "n8n"`): aí ele fica **a escolher**, e você escolhe no nó antes de ligar | não | a escolher |
| `ferramenta` | o nome da ferramenta como o servidor mostra (letras, números e `_ - . /`, até 128) | não | nenhuma |
| `argumentos` | um **objeto JSON**, em texto, até 20.000 letras. Vazio vale `{}`. Lista ou valor solto são recusados | sim | `{}` |

Na tela, você escolhe o servidor e depois a ferramenta (a lista é a que o app já conhece; **Atualizar** sobe o servidor
e lê de novo). Os campos saem do esquema da ferramenta: texto, número, sim/não, escolha e lista (uma por linha) viram
campos; o resto vai num campo JSON. As descrições da ferramenta e dos campos aparecem como `o servidor diz: "…"`:
são a palavra do servidor. O formulário escreve o texto de `argumentos`, que você vê em **Ver o texto dos
argumentos**.

**Saída.** Um item por chamada: `texto` (o que a ferramenta devolveu em texto), `estruturado` (só se ela devolveu
conteúdo estruturado), `erro` (`true` quando a **ferramenta** disse que falhou) e `omitidos` (só quando ela mandou
imagem ou arquivo, que não entram). Com `erro: true` o nó não fica vermelho: o fluxo segue, e você decide num **Se**.
Os segredos do servidor saem como `•••`.

```json
{ "texto": "3 linhas lidas", "estruturado": { "linhas": 3 }, "erro": false }
```

**Expressões úteis.**
- Argumentos: `{ "planilha": "{{ id }}", "limite": {{ quantidade }} }` (dentro de aspas entra como texto escapado; fora,
  como valor JSON; vazio vira `null`)
- Depois do nó: `{{ texto }}`, `{{ estruturado.linhas }}`; num Se, `{{ erro }}` com o operador `verdadeiro` separa as
  chamadas em que a ferramenta falhou

**Erros comuns.**
- "escolha o servidor MCP no nó (o "X" não está ligado a um cadastro…)" → o agente mandou só o nome: abra o nó e
  escolha o servidor. Enquanto isso, o fluxo não liga.
- "X: … está bloqueada: reveja em Conexões › MCP" → a ferramenta mudou (nome, descrição, esquema ou anotações) desde
  que você aprovou. Abra Conexões › MCP, clique em **Rever ferramentas mudadas** e aceite; as outras ferramentas
  seguem rodando.
- "este servidor precisa de login (OAuth), que chega na 1.9.8; ou edite-o e ponha um cabeçalho com credencial" → o
  servidor HTTP entra por login (OAuth), que ainda não existe no app; ou ponha nele um cabeçalho de credencial.
- "pausado" → o servidor caiu 3 vezes em 10 minutos, ou você o pausou: **Religar** em Conexões › MCP.
- "os argumentos precisam ser um objeto JSON ({ ... })" → confira o texto em **Ver o texto dos argumentos**.
- "não deu para conferir a ferramenta X antes de chamar (…); a chamada foi recusada" → o servidor não devolveu a lista
  de ferramentas (caiu, demorou); veja o cartão dele em Conexões › MCP e rode de novo.
- "nesta execução a Ferramenta MCP já fez N chamadas…" / prazo → no máximo 10 chamadas por execução, cada uma até
  30 s, dentro dos 60 s da execução: junte os itens antes.

## Campos padrão (fichas)

Cada coisa do Orkester sai sempre no mesmo formato, a **ficha**, venha de onde vier. Assim uma expressão como
`{{ tarefa.coluna.nome }}` funciona igual em todo fluxo. As regras de toda ficha:

- **Datas** no formato ISO (`2026-11-23T18:00:00.000Z`); vazio (`""`) quando não há.
- **Texto limpo e cortado** no tamanho indicado (em letras).
- **As chaves saem sempre**: vazio, `null` ou `0` quando não se aplica. A expressão não precisa conferir se o campo
  existe.
- **Nunca saem**: credenciais, chaves de Conexões, o comando e a pasta de um terminal, a tela do terminal, caminho
  completo de arquivo ou pasta, a consulta (`?`) e o `#` de um endereço, os itens e o detalhe das execuções e a lixeira
  do kanban.

**Tarefa** (do kanban)

| Campo | O que é |
|---|---|
| `numero`, `ref` | o número e `"#12"` (o app não tem link direto para uma tarefa: use o `ref` num texto) |
| `titulo`, `descricao` | até 120 e 1500 letras (a descrição mantém as quebras de linha) |
| `coluna` | `{ id, nome }` da coluna em que ela está |
| `etiquetas` | lista de textos (até 24 letras cada) |
| `responsaveis` | quem trabalha nela: lista de `{ id, nome }` |
| `delegadaA` | `{ id, nome }` de quem recebeu a delegação, ou `null` |
| `concluida`, `concluidaEm` | se está concluída, e quando (`null` se não está) |
| `criadaEm`, `criadaPor`, `atualizadaEm` | quando foi criada, o nome de quem criou e a última mudança |
| `comentarios`, `ultimoComentario` | quantos comentários, e o último: `{ por, em, texto }` (texto até 500 letras), ou `null` |
| `textoDeAgente` | `true` quando o título ou a descrição foi escrito por um agente (não tem a sua autoridade) |

```json
{
  "numero": 12, "ref": "#12", "titulo": "Revisar o contrato", "descricao": "Conferir as cláusulas 3 e 7.",
  "coluna": { "id": "revisao", "nome": "Revisão" }, "etiquetas": ["contrato"],
  "responsaveis": [{ "id": "c-7f2a", "nome": "Revisor" }], "delegadaA": null,
  "concluida": false, "criadaEm": "2026-11-23T13:10:00.000Z", "criadaPor": "Usuário",
  "atualizadaEm": "2026-11-23T17:45:00.000Z", "concluidaEm": null, "comentarios": 2,
  "ultimoComentario": { "por": "Revisor", "em": "2026-11-23T17:45:00.000Z", "texto": "Faltam duas cláusulas." },
  "textoDeAgente": false
}
```

**Agente** (um cartão de terminal)

| Campo | O que é |
|---|---|
| `id`, `nome` | o cartão |
| `tipo` | `claude`, `codex` ou `shell` |
| `funcao` | a função (vazio se não tem) |
| `modelo`, `esforco` | o que o processo roda de fato (vazio = o padrão do motor; shell não tem). `esforco` vai de `low` a `max` (e `ultra` no Codex), ou vazio |
| `estado` | `livre`, `trabalhando`, `pergunta`, `encerrado` ou `fechado` (o cartão não tem processo) |
| `andar` | `{ id, nome }`; no térreo, `{ "id": "", "nome": "Térreo" }` |
| `fila` | quantos recados esperam na caixa de entrada dele |
| `tarefas` | os números das tarefas não concluídas em que ele trabalha |

**Coluna** (do kanban): `id`, `nome`, `papel` (`entrada`, `delegar`, `revisao` ou vazio), `final` (se é a coluna
final) e `tarefas` (quantas tarefas há nela, sem a lixeira).

**Cartão** (do quadro, menos os terminais, que são a ficha de agente)

| Campo | O que é |
|---|---|
| `id` | o cartão |
| `tipo` | `nota`, `texto`, `portal`, `arquivo`, `pasta`, `imagem`, `codigo` ou `banda` |
| `nome` | como o `ork quadro` o chama (até 80 letras): `post-it` numa nota, o começo do texto, o nome do arquivo ou da pasta (sem o caminho), o endereço do portal (sem `?`), o nome da banda… |
| `andar` | `{ id, nome }` (térreo: id vazio) |
| `texto` | o texto de uma nota ou de um cartão de texto, até 2000 letras; vazio nos outros |
| `url` | no portal, só a origem e o caminho (sem usuário, sem `?` e sem `#`); vazio nos outros |

**Andar**: `id` (vazio no térreo), `nome`, `ramo` (o ramo do git, ou `null`), `status` (`{ texto, estado }`, com
`estado` `trabalhando`, `travado`, `revisao` ou `pronto`; ou `null`) e `cartoes` (quantos cartões há no quadro dele).

**Espaço**: `id` e `nome`.

**Fluxo**: `id`, `nome`, `ligado`, `pasta` (o nome da pasta na página Fluxos; vazio fora de pasta), `autoria` (quem o
criou, em texto) e `ultima` (`{ resultado, em }` da última execução, ou `null`).

**Execução**: `id`, `fluxo` (`{ id, nome }`), `modo` (`gatilho` ou `manual`), `inicio`, `ms` (quanto durou),
`resultado` (`ok`, `erro`, `barrado-laco`, `barrado-taxa` ou `sem-destino`), `erro` (até 300 letras, ou `null`) e
`noComErro` (o nome do nó que falhou, ou `null`).

### Onde as fichas aparecem

| Nó | Campo | Ficha |
|---|---|---|
| Tarefa mudou de coluna | `tarefa` | tarefa |
| Entrega chegou | `quemEntregou`, `quemRecebe` | agente (`null` quando é você, um cartão fechado ou de outro espaço) |
| Agente parou | `quemParou` | agente |
| Tarefa (o nó) | `tarefa` | a tarefa criada |

Os campos de antes continuam com o mesmo nome (`numero`, `titulo`, `agenteNome`…): as fichas entram ao lado deles.
Relógio e Manual soltam só `em`. Uma ficha que não pôde ser lida sai `null`, e o fluxo roda igual. As fichas são
lidas na vez da execução, não no instante do evento: se a tarefa mudou entre um e outro, sai como ela está agora.

### O que toda expressão enxerga

Além do item, toda expressão, em qualquer nó (no HTTP, também no corpo JSON e no de formulário), enxerga três valores
do momento:

| Nome | O que é |
|---|---|
| `$fluxo` | a [ficha do fluxo](#campos-padrão-fichas) que está rodando: `{{ $fluxo.nome }}`, `{{ $fluxo.pasta }}` |
| `$espaco` | `{ id, nome }` do espaço: `{{ $espaco.nome }}` |
| `$execucao` | `{ id, modo, inicio }` desta execução (`modo` é `gatilho` ou `manual`): `{{ $execucao.id }}` |

Eles **não são campos do item**: não aparecem na saída dos nós, nem no `{{ $json }}`, nem no nó Código (que não os
vê). Para levá-los adiante, copie num Definir campos (`origem` = `{{ $fluxo.nome }}`).

## Expressões `{{ }}`

Uma expressão põe no texto um valor do item que chegou ao nó: `A tarefa #{{ numero }} ({{ titulo }}) entrou em
{{ paraColunaNome }}`.

- **É só um caminho**: `titulo`, `cliente.nome`, `itens[0].preco`, `["nome com espaço"]`. Escrever `$json.` na
  frente é aceito e não muda nada.
- **`$fluxo`, `$espaco` e `$execucao`** valem em toda expressão: veja
  [O que toda expressão enxerga](#o-que-toda-expressão-enxerga).
- **Não há conta, função nem referência a outro nó.** `{{ a + 1 }}` ou `{{ titulo.toUpperCase() }}` são recusados
  ao salvar, com a mensagem dizendo onde. Lógica vai num nó Código antes.
- Caminho que não existe vira texto vazio. Objeto e lista viram JSON. Um `{{` sem `}}` fica como texto. Cada `{{ }}`
  que veio vazia fica anotada no nó, e a execução aberta lista todas na faixa de cima ("`{{ x }}` veio vazio em
  <nó>"): é o jeito mais rápido de achar um campo com o nome errado.
- **Onde valem:** texto do Recado; título e descrição da Tarefa; texto do Avisar; valor e comparar do Se; valor do
  Definir; URL, valores da consulta e dos cabeçalhos e corpo do HTTP; argumentos da Ferramenta MCP (escapados como o
  corpo JSON do HTTP, logo abaixo).
- **Onde não valem:** no Comando (texto fixo, de propósito: nada de fora vira comando), nos nomes dos campos, nos
  gatilhos.
- **No corpo JSON do HTTP**, a expressão sai escapada do jeito certo: dentro de aspas (`"oi {{ nome }}"`) entra como
  texto JSON; fora de aspas (`{ "n": {{ quantidade }} }`) entra como valor JSON (texto ganha aspas, ausente vira
  `null`). O corpo final precisa ser JSON válido.
- **No formulário do HTTP**, escreva um `nome=valor` por linha (ou separados por `&`). Cada nome e valor é codificado
  sozinho, então um `&` ou `=` que vem do item não cria campo novo.

## O nó Código

JavaScript que recebe **todos** os itens de uma vez e devolve uma lista de itens.

```js
// os itens que chegaram
const itens = $input.all()          // também $input.first() e $input.last()
// o que um nó anterior soltou, pelo nome dele
const gatilho = $('Rodar à mão').first()
console.log('chegaram', itens.length)   // vai para o painel do nó, na execução
return itens.map((i) => ({ json: { ...i.json, conferido: true } }))
```

- **Entrada:** `$input.all()`, `$input.first()`, `$input.last()` e `itens` (a mesma lista). Cada item é
  `{ json: { … } }`. São cópias: mexer nelas não muda nada fora do código.
- **Nós anteriores:** `$('Nome').all()`, `.first()` e `.last()` dão os itens que esse nó soltou **no caminho até
  aqui**. Nome de um nó que não rodou antes neste caminho dá erro.
- **Saída:** `return` de uma lista. Pode ser `[{ json: { … } }]` ou só `[{ … }]`. A saída passa por JSON: função e
  `undefined` somem sem erro e data vira texto ISO; só referência circular e BigInt dão erro. Lista vazia vale: os
  nós seguintes não rodam.
- **Erro:** `throw new Error('motivo')` deixa o nó vermelho com a mensagem.
- **`console.log`** (e `info`, `warn`, `error`): até 50 linhas e 2 KB, mostrados no painel do nó na execução.
- Pode usar `await`: o código roda dentro de uma função assíncrona.
- **Isolado:** roda numa janela escondida do Electron, nova a cada vez, sem disco, sem rede (`fetch` e parecidos
  dão erro dizendo para usar o nó HTTP), sem `require` e sem `ork`. Credencial também não chega aqui.
- **Limites:** 5 segundos, 256 MB de memória, até 1000 itens e 5 MB na entrada e na saída, no máximo 2 Códigos
  rodando ao mesmo tempo no app.

## O nó HTTP e a rede

O nó HTTP fala com a **internet** sem pedir nada. Endereços do **seu computador** ou da **sua rede local** são
diferentes: só funcionam se você permitir, um por um, em cada fluxo.

- **O que é rede local.** O próprio computador (`localhost`, `127.0.0.1`) e os aparelhos da sua casa ou escritório,
  que têm endereço começando por `192.168.`, `10.` ou `172.16.` a `172.31.` (o roteador, um NAS, uma impressora, o
  n8n ou outro serviço rodando aqui).
- **Por que é bloqueado.** Muitos serviços locais aceitam comandos de quem chegar, sem senha, porque contam que só
  quem está no computador fala com eles. Um fluxo que um agente montou, ou um endereço errado, poderia mexer neles. Por
  isso o app recusa esses endereços até você dizer que aquele, exatamente aquele, pode.
- **Como permitir um endereço.** Escreva a URL no nó HTTP com o endereço fixo e a porta (`http://localhost:5678/webhook/x`).
  O nó mostra um aviso e o botão **Permitir localhost:5678 neste fluxo**; enquanto não permite, ele fica com **Falta**
  no desenho. Permitido, o aviso vira "localhost:5678 permitido neste fluxo", com **Tirar permissão**. A permissão é
  do endereço **e da porta**: `localhost:5678` não libera `localhost:5679`. O caminho e a consulta podem ter `{{ }}`;
  o endereço e a porta, não.
- **Onde ver o que está permitido.** Com algum endereço permitido, o topo do editor mostra **Rede local: N endereços**.
  Clicar abre a lista, com **Tirar** em cada um.
- **Vale ao salvar, e ligar pede de novo.** Permitir ou tirar muda o rascunho; vale ao **salvar**. Num fluxo ligado,
  qualquer mudança na lista o desliga até você confirmar de novo, e a confirmação mostra a lista inteira ("Pode chamar
  no seu computador/rede: localhost:5678"). Só você mexe nisso, pela página: o `rede` que vier no JSON de um agente,
  do `ork` ou do MCP é ignorado (o fluxo fica como estava) e quem mandou recebe um aviso.
- **O que nunca é permitido** (o nó diz o motivo e não mostra botão):
  - endereço que vem de uma expressão (`http://{{ $json.host }}/`): só endereço fixo;
  - nome de aparelho da rede (`nas`, `impressora.local`, `*.lan`, `*.home`, `*.internal`): escreva o IP dele
    (`http://192.168.0.10:8080/`) e permita o IP. Nome pode mudar de endereço por trás; o IP escrito, não;
  - `algo.localhost`: use `localhost` puro;
  - `169.254.x.x` (onde ficam os metadados da nuvem), IPv6 (para esta máquina, use `localhost`) e as faixas
    reservadas (`0.x`, `100.64.x`, multicast e outras).
- **O app confere depois de resolver o nome.** Um nome da internet que aponta para um endereço local é recusado,
  mesmo que esse endereço esteja permitido: permita e use o IP. A mensagem diz o que fazer: `localhost:5678 é desta
  máquina ou da rede local; permita este endereço no nó HTTP (botão "Permitir localhost:5678 neste fluxo")`.
- **Redirecionamento:** até 5, cada salto conferido de novo, com as mesmas regras: um salto para um endereço local só
  passa se aquele endereço e porta estão permitidos. Ao trocar de site (esquema, host ou porta), a credencial sai
  para sempre daquele pedido, e com ela os cabeçalhos `Authorization` e `Cookie` escritos à mão.
- **Prazo e tamanho:** 30 segundos para o pedido inteiro (com os saltos) e resposta de até 5 MB, já descomprimida.
- **Resposta que não é 2xx é erro**, com o código e o começo do corpo na mensagem.
- **O que fica na execução:** a resposta com os cabeçalhos, menos `Set-Cookie`, `Set-Cookie2`, `Cookie`,
  `Authorization`, `Proxy-Authorization` e `Proxy-Authenticate`. O pedido que foi não fica.
- **Content-Type:** posto sozinho conforme o tipo do corpo (JSON, texto, formulário), a não ser que você escreva um.

## Credenciais

Uma credencial é uma senha, token ou chave de API que o nó HTTP leva **sem que o valor entre no fluxo**. Desde a 1.9.7,
na tela, elas se chamam **APIs** (a aba Credenciais virou **APIs**), e os segredos dos servidores MCP ficam em
Conexões › MCP. As mesmas APIs servem às páginas "+" em que você as marcar e ao cabeçalho dos servidores MCP http.

- **Onde:** Configurações › Conexões › **APIs** → **Guardar uma API**: o nome com que fluxos e páginas vão chamá-la
  ("ClickUp"), o tipo, os domínios, o valor e **O que ela pode fazer** → **Guardar a API** (cifrada). Com ao menos uma
  API, o formulário abre pelo botão **+ Nova API**.
- **Só lê ou lê e escreve** (1.9.7): uma API **Só lê** deixa o nó HTTP fazer só `GET` e `HEAD`; com `POST`, `PUT`,
  `PATCH` ou `DELETE`, a tela avisa em vermelho e o núcleo recusa antes de sair ("a API X só lê: mude em Conexões ›
  APIs"). **Lê e escreve** aparece com selo vermelho. API nova nasce "só lê"; as guardadas na 1.9.6 contam como "lê e
  escreve", então nenhum fluxo que já rodava para. Não há permissão por fluxo: quem protege é o selo de nó sensível e
  só você ligar o fluxo. No cabeçalho de um servidor MCP http isso não vale (o MCP sempre faz POST).
- **Tipos:**
  - **Token (Bearer):** vai em `Authorization: Bearer <token>`. Cole só o token, sem a palavra Bearer.
  - **Cabeçalho próprio:** vai num cabeçalho com o nome que a API pede (ex.: `X-Api-Key`).
  - **Usuário e senha (Basic):** vai em `Authorization`, codificado como o HTTP Basic pede.
  - **Segredo, sem domínio** (1.9.7): só para a variável de ambiente de um servidor MCP de fora que roda no seu PC (a
    chave do n8n-mcp, por exemplo). Não tem domínio e **nunca vai em cabeçalho**: o nó HTTP não o lista e o app recusa
    usá-lo num pedido. Não é API: é guardado e listado em Conexões › MCP › **Segredos dos servidores**. Ao importar
    servidores do Claude Code, as variáveis secretas viram segredos.
- **No nó:** o campo **Cabeçalhos** lembra "Senha e token vão numa API (abaixo), nunca aqui."
- **Criar ali mesmo:** o nó HTTP tem o botão **Criar API**, que abre o formulário já com o host da URL nos
  domínios; a nova já fica escolhida no nó.
- **Domínios:** para onde ela pode ir, um por linha, até 20: `api.exemplo.com`, ou `*.exemplo.com` para os
  subdomínios. O curinga não cobre o próprio `exemplo.com`: se precisar dele, liste os dois. Nada de IP, `localhost` ou rede interna.
- **Na hora do pedido**, ela só vai por **https** e só para um host da lista. Fora disso, o nó dá erro e o pedido não
  sai.
- **Depois de guardada**, a tela mostra só os 4 últimos caracteres (`••••abcd`; valor curto não mostra nem isso).
  Cartão de cada uma: **Trocar o valor**, **Editar** (nome, tipo entre token e cabeçalho, domínios) e **Apagar**.
- **Valem em todos os espaços.** Ficam em `~/.orkester/credenciais.json`, cada valor cifrado pelo cofre do Windows.
  Sem o cofre disponível, a aba fica só de leitura e não guarda nada: o app nunca grava o valor em texto puro.
- **Nunca saem:** nem para a tela, nem para o `ork`, nem para o MCP, nem para o nó Código. O fluxo, a exportação e a
  execução só levam o **nome**. Qualquer texto igual ao valor que aparecer numa execução vira `•••`.
- **Apagar** uma API em uso não mexe nos fluxos: o próximo pedido deles dá `credencial X não existe`. Ao
  apagar, o app diz quem a usava: os fluxos, as páginas "+" e os servidores MCP de fora. **Renomear** tem o mesmo
  efeito nos fluxos: o formulário avisa antes, e depois de guardar o app diz quem citava o nome antigo. Edite os nós
  HTTP que citam esse nome. Dois nomes que só diferem em maiúscula, acento ou espaço não podem coexistir.

> **Use uma API, não cabeçalho escrito à mão.** Um token posto direto em `cabecalhos` (ou na URL) faz parte do
> fluxo: vai inteiro no Ctrl+C, no `ork fluxo ver --json`, no que um agente lê do fluxo e no arquivo do disco. Com
> uma API, nada disso leva o valor. O editor avisa quando o nome de um cabeçalho ou de um parâmetro da consulta tem
> cara de segredo (`token`, `api-key`, `senha`…).

## Nós sensíveis: quem liga

Código, HTTP, Ferramenta MCP e Comando no shell são **sensíveis**: rodam código, falam com a internet, chamam um
programa de fora ou digitam num terminal. Um fluxo com qualquer um deles segue estas regras:

- **Agentes e clientes MCP podem criar e editar, mas não ligar.** O fluxo sensível que eles gravam fica desligado, e
  `ork fluxo ligar` (ou `fluxo_ligar`) nele é recusado.
- **Só você liga, vendo os nós.** Ao ligar, abre uma confirmação com cada nó sensível **inteiro** (o código, a URL, o
  comando; na Ferramenta MCP, o servidor, a ferramenta e o texto inteiro dos argumentos). O servidor aparece **pelo
  cadastro** (o nome que o id tem em Conexões › MCP); em vermelho quando o nome gravado no nó é outro ("vale o do
  cadastro"), quando o id não existe ou quando o nó não tem servidor. Cada um vem marcado: **igual
  ao que você aprovou**, **mudou** ou **novo**, e com o nome do agente que o criou ou mexeu, se foi um agente. A
  confirmação abre para qualquer nó sensível do catálogo, mesmo quando a Ferramenta MCP é o único.
- **Mudou depois de aprovado, desliga.** Gravar uma mudança num nó sensível de um fluxo ligado o desliga, mesmo se foi
  você: ligue de novo para aprovar o que mudou. Nome, posição e notas não contam como mudança.
- **Endereços da rede local também.** A lista de endereços do seu computador ou da sua rede que o HTTP pode chamar
  entra na aprovação: a confirmação a mostra, e mudar a lista desliga o fluxo ligado até você confirmar de novo
  ([O nó HTTP e a rede](#o-nó-http-e-a-rede)).
- **Selo.** A aprovação vai com um selo que só o app sabe fazer. Se alguém mexer no arquivo do fluxo direto no disco,
  o selo não bate: o fluxo não roda e é desligado com o motivo "nó sensível mudou sem aprovação". O selo não é uma
  barreira absoluta (um programa rodando como você no Windows consegue refazê-lo); serve para pegar a mudança que
  passou por fora do app.
- **Rodar fluxo** com nó sensível ainda não aprovado abre a confirmação com o botão **Aprovar e rodar uma vez**: roda
  agora e aprova os nós, mas **não liga** o fluxo.

## Travas e limites

**Contra laço e excesso** (valem para fluxos ligados que disparam sozinhos):

| Trava | O que acontece |
|---|---|
| 1 minuto entre dois disparos do mesmo fluxo | o evento que chega antes espera a vez (até 3 esperando; o resto é descartado e contado) |
| teto por hora do fluxo: 6 (padrão) | passou, o fluxo é **desligado** ("disparou demais") e você é avisado. Com Relógio, ao salvar, o teto sobe até o que o relógio pede (a cada 10 min pede 6; a cada 2 min, 30), no máximo 30. Nesta versão não há campo na tela para mudá-lo |
| teto do espaço: 30 disparos por hora | passou, o disparo é pulado e o fluxo continua ligado |
| laço | um recado de fluxo marca o agente que o recebeu por 30 minutos. Se o que ele fizer disparar outro fluxo, conta como corrente: a corrente para em 3 fluxos seguidos, e nunca passa duas vezes pelo mesmo fluxo ("barrado: laço") |
| kanban | tarefa criada ou movida por fluxo não dispara o gatilho Tarefa mudou de coluna |

**Tamanho:**

| O quê | Limite |
|---|---|
| fluxos por espaço | 100 |
| pastas | 100, até 3 níveis |
| nós / ligações por fluxo | 60 / 120 |
| uma execução | 50 passos, 60 segundos, 1000 itens e 5 MB por lista |
| itens por nó | Recado, Tarefa, Comando, Avisar e Consultar: 5 na entrada (o Consultar solta até 100). HTTP: 20. Ferramenta MCP: 10 chamadas por execução, somando as chegadas (cada chamada até 30 s) |
| execuções guardadas | as 50 últimas de cada fluxo |
| entrada e saída guardadas por nó | ~10 KB (passou, aparece "Cortado"; as contagens continuam certas) |
| condições do Se / campos do Definir | 10 / 30 |

## Fluxos feitos por agentes

Um agente cria e mexe em fluxos com `ork fluxo` (veja [`ork.pt-BR.md`](ork.pt-BR.md#fluxos)); um cliente de fora,
com as ferramentas `fluxo_*` (veja [`mcp.pt-BR.md`](mcp.pt-BR.md)). As regras:

- **Só no espaço dele.**
- **Só cita quem alcança.** Destino do recado, quem recebe a entrega, quem o gatilho vigia e o shell do comando
  precisam estar ligados ao agente por corda ou banda (ou ter sido abertos por ele); no Consultar, também o
  `responsavel` e o `agente` citados (conferidos ao salvar). Recado sem `entregaPara` devolve
  a entrega ao próprio agente. Isso é conferido ao criar e ao editar. A cada disparo, a conferência volta só em fluxo
  com Recado ou com Tarefa que usa expressão: o destino e a entrega de cada recado e quem o gatilho vigia. Fora do
  alcance, o fluxo pula a vez e continua ligado (um evento de cartão fora do alcance nem é visto); se o cartão do
  agente sair do quadro e o fluxo tiver Recado, ele desliga ("cartão sumiu"). O shell do comando não é conferido de
  novo: você o viu ao ligar.
- **Sensível fica desligado** até você ligar (veja acima).
- **Você fica sabendo.** Criar, editar, ligar, desligar e apagar por agente aparece no canto da janela ("Revisor criou
  o fluxo …").
- **Você adota o fluxo** editando-o pela página: a partir daí ele é seu, e as regras de alcance deixam de valer.
- A skill que o app instala nos agentes manda criar ou ligar fluxo só quando você pedir, e nunca pedir nem escrever o
  valor de uma credencial.

## Receitas

As três primeiras são os exemplos que todo espaço ganha na pasta **Exemplos**, desligados. Apagá-los não os traz de
volta.

### 1. Tarefa pronta avisa o Maestro

Gatilho **Tarefa mudou de coluna** (para a coluna final do kanban, por qualquer um) → **Recado** ao Maestro:
`A tarefa #{{ numero }} ({{ titulo }}) entrou em Feito. Revise se falta algo nela.`

### 2. Agente parou numa pergunta

Gatilho **Agente parou** (`como`: pergunta, qualquer agente) → **Recado** ao Maestro:
`{{ agenteNome }} parou numa pergunta e está esperando resposta.`

### 3. Revisão de fim de dia

Gatilho **Relógio** (todo dia às 18:00) → **Tarefa** `Revisar o que ficou aberto hoje` na coluna de entrada.

### 4. Entrega com problema vira tarefa

Uma entrega que fala em "bloqueado" ou "erro" vira uma tarefa com o texto dela. As outras passam direto.

```json
{
  "orkester": "fluxo",
  "versao": 1,
  "nome": "Entrega com problema vira tarefa",
  "nos": [
    { "id": "no-1", "nome": "Entrega chegou", "tipo": "gatilho.entrega", "versaoDoTipo": 1, "posicao": [0, 0],
      "ajustes": {} },
    { "id": "no-2", "nome": "Tem problema?", "tipo": "logica.se", "versaoDoTipo": 1, "posicao": [300, 0],
      "ajustes": {
        "condicoes": [
          { "valor": "{{ texto }}", "operador": "contem", "comparar": "bloqueado" },
          { "valor": "{{ texto }}", "operador": "contem", "comparar": "erro" }
        ],
        "combinar": "ou"
      } },
    { "id": "no-3", "nome": "Cria a tarefa", "tipo": "orkester.tarefa", "versaoDoTipo": 1, "posicao": [600, 0],
      "ajustes": { "titulo": "Destravar a entrega de {{ deNome }}", "descricao": "{{ texto }}" } }
  ],
  "ligacoes": [
    { "de": "no-1", "saida": 0, "para": "no-2" },
    { "de": "no-2", "saida": 0, "para": "no-3" }
  ]
}
```

A saída `1` do Se (falso) não está ligada: as entregas sem problema param ali.

### 5. Issues abertas do GitHub para o Maestro (HTTP, API e Código)

Toda manhã, busca as issues abertas de um repositório, junta numa lista e manda ao Maestro.

1. Em Configurações › Conexões › APIs, guarde uma API **GitHub**, tipo **Token (Bearer)**, domínio
   `api.github.com`, com um token seu, **Só lê** (o fluxo só faz GET).
2. Cole o fluxo abaixo, troque `dono/repo` pelo seu repositório e salve.
3. Ligue: como tem HTTP e Código, a confirmação mostra os dois nós inteiros.

```json
{
  "orkester": "fluxo",
  "versao": 1,
  "nome": "Issues abertas para o Maestro",
  "nos": [
    { "id": "no-1", "nome": "Toda manhã", "tipo": "gatilho.relogio", "versaoDoTipo": 1, "posicao": [0, 0],
      "ajustes": { "quando": { "tipo": "diario", "hora": 9, "minuto": 0 } } },
    { "id": "no-2", "nome": "Busca as issues", "tipo": "fora.http", "versaoDoTipo": 1, "posicao": [300, 0],
      "ajustes": {
        "metodo": "GET",
        "url": "https://api.github.com/repos/dono/repo/issues",
        "consulta": [{ "nome": "state", "valor": "open" }, { "nome": "per_page", "valor": "20" }],
        "cabecalhos": [{ "nome": "Accept", "valor": "application/vnd.github+json" }],
        "corpo": { "tipo": "nenhum", "valor": "" },
        "credencial": "GitHub"
      } },
    { "id": "no-3", "nome": "Junta numa lista", "tipo": "fora.codigo", "versaoDoTipo": 1, "posicao": [600, 0],
      "ajustes": { "codigo": "const issues = $input.first().json.corpo\nif (!Array.isArray(issues) || !issues.length) return []\nconst linhas = issues.map((i) => `#${i.number} ${i.title}`)\nreturn [{ json: { total: issues.length, lista: linhas.join('\\n') } }]\n" } },
    { "id": "no-4", "nome": "Recado ao Maestro", "tipo": "orkester.recado", "versaoDoTipo": 1, "posicao": [900, 0],
      "ajustes": { "para": "maestro", "texto": "Há {{ total }} issues abertas:\n{{ lista }}", "juntarEvento": false } }
  ],
  "ligacoes": [
    { "de": "no-1", "saida": 0, "para": "no-2" },
    { "de": "no-2", "saida": 0, "para": "no-3" },
    { "de": "no-3", "saida": 0, "para": "no-4" }
  ]
}
```

O Código devolve lista vazia quando não há issue: aí o recado não sai. Para testar antes de ligar, ponha um gatilho
**Manual** ligado ao mesmo nó HTTP e use **Rodar fluxo**.

### 6. Resumo da Revisão às 18h (Consultar)

Todo dia às 18h, lê as tarefas abertas da coluna **Revisão** e manda ao Maestro uma lista com quem está em cada uma.
O Consultar solta uma ficha por tarefa; o Código junta tudo num item só, porque o Recado age no máximo 5 vezes. Como
tem Código, só você liga, vendo o nó. Sem tarefa na Revisão, o Consultar solta 0 itens e nada é mandado.

```json
{
  "orkester": "fluxo",
  "versao": 1,
  "nome": "Resumo da Revisão às 18h",
  "nos": [
    {
      "id": "no-1",
      "nome": "Às 18h",
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
      "nome": "Tarefas da Revisão",
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
      "nome": "Junta numa lista",
      "tipo": "fora.codigo",
      "versaoDoTipo": 1,
      "posicao": [
        600,
        0
      ],
      "ajustes": {
        "codigo": "const tarefas = $input.all().map((i) => i.json)\nconst linhas = tarefas.map((t) => `${t.ref} ${t.titulo} (${t.responsaveis.map((r) => r.nome).join(', ') || 'sem responsável'})`)\nreturn [{ json: { total: tarefas.length, lista: linhas.join('\\n') } }]\n"
      }
    },
    {
      "id": "no-4",
      "nome": "Recado ao Maestro",
      "tipo": "orkester.recado",
      "versaoDoTipo": 1,
      "posicao": [
        900,
        0
      ],
      "ajustes": {
        "para": "maestro",
        "texto": "{{ total }} tarefas esperam revisão:\n{{ lista }}",
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

Troque `"Revisão"` pelo nome da sua coluna, se for outro. Para testar antes de ligar, ponha um gatilho **Manual** ligado
ao Consultar e use **Rodar fluxo**.

### 7. Tarefas do ClickUp num recado ao Maestro (HTTP e API)

Toda manhã, lê as tarefas de uma lista do ClickUp e manda ao Maestro uma linha por tarefa, com o status. Não precisa do
MCP do ClickUp (que entra por login e só chega na 1.9.8): a API REST aceita o token pessoal.

1. No ClickUp, gere o seu token pessoal (Configurações › Apps). Em Configurações › Conexões › APIs, guarde uma
   API **ClickUp**, **Só lê**, tipo **Cabeçalho próprio**, cabeçalho `Authorization`, domínio `api.clickup.com`, com o
   token (a API do ClickUp quer o token puro nesse cabeçalho, sem "Bearer").
2. Pegue o número da lista (fica no endereço da lista, no navegador).
3. Monte: **Relógio** (diário, 9h) → **HTTP** → **Código** → **Recado** ao Maestro. Os ajustes do HTTP:

```json
{
  "metodo": "GET",
  "url": "https://api.clickup.com/api/v2/list/NUMERO-DA-LISTA/task",
  "consulta": [{ "nome": "archived", "valor": "false" }],
  "cabecalhos": [],
  "corpo": { "tipo": "nenhum", "valor": "" },
  "credencial": "ClickUp"
}
```

O Código (a resposta traz a lista em `corpo.tasks`):

```js
const tarefas = $input.first().json.corpo.tasks ?? []
if (!tarefas.length) return []
const linhas = tarefas.slice(0, 30).map((t) => `${t.name} (${t.status?.status ?? 'sem status'})`)
return [{ json: { total: tarefas.length, lista: linhas.join('\n') } }]
```

E o texto do Recado, em duas linhas: `ClickUp: {{ total }} tarefas abertas na lista.` e, embaixo, `{{ lista }}`. Ligue:
a confirmação mostra o HTTP e o Código inteiros. Para testar antes, ponha um gatilho **Manual** ligado ao HTTP e use **Rodar fluxo**.

### 8. Planilha do Google via MCP (Ferramenta MCP)

Lê um intervalo de uma planilha do Google pela ferramenta de um servidor MCP e manda o resultado ao Maestro. O login do
Google fica com o servidor MCP: escolha um servidor de planilhas que rode no seu PC (stdio) e cuide do próprio login.
O Orkester só guarda o comando e, se o servidor pedir, uma chave como **Segredo** (Conexões › MCP › Segredos dos
servidores).

1. Em Configurações › Conexões › MCP › **Servidores de fora**, cadastre o servidor (ou **Importar do Claude Code**, se
   ele já está lá). Clique em **Testar**: o app lista as ferramentas e guarda a impressão de cada uma.
2. Monte: **Manual** → **Ferramenta MCP** → **Recado** ao Maestro. No nó MCP, escolha o servidor e a ferramenta de
   leitura (o nome muda de servidor para servidor; nesta receita, `ler_planilha`). Os ajustes ficam assim:

```json
{
  "servidor": { "id": "ID-DO-CADASTRO", "nome": "Planilhas" },
  "ferramenta": "ler_planilha",
  "argumentos": "{ \"planilha\": \"ID-DA-PLANILHA\", \"intervalo\": \"A1:C20\" }"
}
```

3. No Recado: `Planilha: {{ texto }}`. Para tratar a falha da ferramenta, ponha um **Se** antes do recado com a
   condição `{{ erro }}` · `falso`: a saída verdadeiro segue para o recado.
4. **Rodar fluxo** pede a confirmação do nó sensível (servidor, ferramenta e argumentos): **Aprovar e rodar uma
   vez**. Para rodar sozinho, troque o Manual por um Relógio e ligue.

Se o servidor mudar a ferramenta depois (uma atualização dele), o nó para com "reveja em Conexões › MCP" até você
aprovar a versão nova.

## Quando algo dá errado

- **O fluxo não liga.** A mensagem diz o que falta: um gatilho, um cartão ou coluna "a escolher", ou a confirmação
  dos nós sensíveis (agente não liga fluxo sensível).
- **Rodar fluxo recusa.** Ele entra pelo gatilho **Manual**: ponha um. E roda o que está **salvo**: salve antes.
- **O recado deu "sem destino".** O agente não está aberto, é um shell, ou não há Maestro aberto no espaço. O nó não
  fica vermelho (rodou), mas o recado não chegou a ninguém: a execução aparece como "sem destino".
- **O fluxo desligou sozinho.** A lista diz o motivo: disparou demais (passou do teto por hora), um cartão dele sumiu,
  uma coluna dele saiu do kanban ("desligado: uma coluna saiu do kanban"), ou um nó sensível mudou sem aprovação.
- **Apagar uma coluna do kanban.** Pela página Kanban, apagar uma coluna que um fluxo usa (num gatilho Tarefa mudou
  de coluna ou num nó Tarefa) pede confirmação antes, com a lista dos fluxos (cada um uma vez) e **Ver o fluxo**, que
  abre o editor. Se o app não conseguir conferir, ele não apaga e pede para tentar de novo. Pelo `ork` ou pelo MCP,
  o aviso vem depois, como antes. Nos dois casos, os fluxos ligados que usavam a coluna desligam na hora: abra cada
  um, escolha outra coluna e ligue de novo.
- **Um campo saiu vazio.** Abra a execução: a faixa de cima diz qual `{{ }}` veio vazia e em que nó.
- **Ferramenta MCP: "está bloqueada: reveja em Conexões › MCP".** A ferramenta mudou desde que você aprovou. Reveja
  em Conexões › MCP › **Rever ferramentas mudadas**.
- **"barrado: laço" ou "barrado: excesso"** nas execuções: veja [Travas e limites](#travas-e-limites).
- **"junte os itens antes, no nó Código".** Chegaram mais de 5 itens a uma ação do Orkester (ou mais de 20 ao HTTP).
  Ponha um Código antes que junte os itens num só.
- **HTTP: "é desta máquina ou da rede local".** O endereço é do seu computador ou da sua rede. Se é de propósito,
  abra o nó HTTP, clique em **Permitir … neste fluxo** e salve ([acima](#o-nó-http-e-a-rede)). Se o nome aponta para
  um endereço local, escreva o IP no lugar do nome e permita o IP.
- **HTTP: "credencial X: só vai por https" ou "não está nos domínios dela".** Confira a URL e os domínios da
  API.
- **HTTP: "a API X só lê".** O nó usa um método de escrita com uma API só lê: mude a API para **Lê e escreve** em
  Conexões › APIs, ou use GET.
- **Um arquivo de fluxo não abre.** A lista mostra os arquivos que não passaram na leitura, com o motivo; eles não
  rodam. O app não apaga nada.
- Um fluxo ligado que falha avisa você (no canto da janela ou numa notificação), no máximo uma vez a cada 10 minutos
  por fluxo.
