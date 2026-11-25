# MCP no Orkester

[English](mcp.md) · Português

O MCP aparece no Orkester de dois jeitos, e esta página trata dos dois:

- **O MCP do Orkester (servidor):** o seu Claude Code, o Codex ou outro cliente lê o quadro e põe trabalho nele. É
  tudo daqui até [Como funciona](#como-funciona).
- **Servidores de fora (cliente, 1.9.7):** o Orkester usa as ferramentas de outro servidor MCP (o n8n-mcp, um de
  planilhas…) nos fluxos e nas páginas "+". Está em [Servidores de fora](#servidores-de-fora).

O `ork` é para os agentes **dentro** do quadro. O servidor MCP é para tudo o que está **fora** dele — o seu
Claude Code, o Claude Desktop, o Codex, qualquer cliente MCP — ler o quadro e pôr trabalho nele, com uma chave
que você gera no app.

Duas regras valem para tudo abaixo:

- **O Orkester precisa estar aberto.** O servidor não mexe nos seus quadros em disco; ele pede ao app que está
  rodando, pelo mesmo cano e pela mesma validação do `ork`. App fechado → toda ferramenta responde "o Orkester
  não está aberto".
- **A chave age como você, não como um agente.** O que ela abre chega sem dono e sem corda, igual a um cartão
  que você cria com a mão. A corda é permissão *entre agentes*; não vale para você no seu próprio quadro.

## Ligar um cliente

1. No Orkester, clique na engrenagem no pé da barra de páginas, à esquerda, e vá em **Configurações › Conexões**, aba **Chaves**; ou procure **Conexões (Configurações)** na paleta (Ctrl+K).
2. Dê à chave o nome de quem vai usá-la — "Claude Code", "notebook" — e clique em **Gerar chave**.
3. Escolha a aba do seu cliente, clique em **Copiar** e cole. Abra uma sessão **nova** do cliente: as
   ferramentas são carregadas quando a sessão começa.

A chave aparece **uma vez**. O Orkester guarda só uma impressão digital SHA-256 dela; perdeu, gere outra e
revogue a antiga na mesma tela.

O que o app gera, por cliente (os seus caminhos serão outros):

**Claude Code** — uma linha no terminal, vale para todos os projetos (`-s user`):

```text
claude mcp add orkester -s user -e ORK_CHAVE=ork_… -- "C:\Program Files\nodejs\node.exe" "C:\Users\voce\.orkester\bin\cli\mcp.js"
```

**Claude Desktop / o `.mcp.json` de um projeto** — vai dentro de `mcpServers`:

```json
{
  "mcpServers": {
    "orkester": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\voce\\.orkester\\bin\\cli\\mcp.js"],
      "env": { "ORK_CHAVE": "ork_…" }
    }
  }
}
```

**Codex** — no fim do `~/.codex/config.toml`:

```toml
[mcp_servers.orkester]
command = 'C:\Program Files\nodejs\node.exe'
args = ['C:\Users\voce\.orkester\bin\cli\mcp.js']
env = { ORK_CHAVE = 'ork_…' }
```

O servidor é um arquivo só, `mcp.js`, que o app copia para `~/.orkester/bin/cli/` toda vez que abre. Roda em
qualquer Node. Sem Node na máquina, o comando gerado o roda com o Node que vem dentro do `Orkester.exe`
(`ELECTRON_RUN_AS_NODE=1` no `env`); para o cliente não muda nada.

### Variáveis

| Variável | | |
|---|---|---|
| `ORK_CHAVE` | obrigatória | a chave, `ork_` seguido de 64 caracteres hexadecimais |
| `ORK_DADOS` | opcional | a pasta de dados do Orkester, se não for `~/.orkester` |

## Ferramentas

Uma ferramenta por ação, em vez de uma genérica "rodar comando": o cliente libera ou pergunta **pelo nome da
ferramenta**, então ler o quadro pode ficar liberado e abrir um agente continuar pedindo o seu OK.

Toda ferramenta aceita `espaco` (nome do espaço), opcional. Sem ele, vale o único espaço aberto numa janela;
com vários abertos, ela recusa e diz quais são.

| Ferramenta | Parâmetros | O que faz |
|---|---|---|
| `espacos` | — | Lista os espaços, com quantos cartões cada um tem e se está aberto numa janela. |
| `quadro` | `espaco?` | Lê o andar à mostra: cartões numerados, com lugar e situação. |
| `funcoes` | `espaco?` | Lista os papéis guardados, que o `abrir_cartao` usa pelo nome. |
| `ver_cartao` | `cartao`, `linhas?` (1–2000, padrão 50), `espaco?` | Lê a tela de um agente agora, e se ele está livre, trabalhando ou numa pergunta. `cartao` é o nome do cartão ou o começo dele. |
| `abrir_cartao` | `funcao?`, `agente?` (`claude` · `codex` · `shell`), `preset?`, `nome?`, `pasta?`, `modelo?`, `esforco?`, `tarefa?`, `espaco?` | Abre uma sessão nova. Com `funcao`, motor, modelo e esforço vêm do papel; sem ela, `agente` é obrigatório. `preset` força um pelo nome ("Claude forte"); `modelo` e `esforco` (`low` … `max`; `ultra` só no Codex) mandam sobre o papel. `tarefa` (o N de #N) põe o agente trabalhando nessa tarefa do kanban. `pasta` é relativa à pasta do espaço. |
| `modelos` | `espaco?` | Os modelos de Claude e Codex, os esforços que cada um aceita e os padrões. |
| `trocar_modelo` | `cartao`, `modelo?`, `esforco?`, `espaco?` | Troca o modelo e/ou o esforço de um agente livre: o cartão reabre e a conversa continua. Ocupado, recusa. |
| `partituras` | `espaco?` | Lista os times salvos (partituras), com agentes, funções e cordas. |
| `subir_partitura` | `nome`, `espaco?` | Sobe um time salvo no andar à mostra. Nome que não existe é recusado com a lista dos que existem. |
| `importar_catalogo` | `pasta`, `espaco?` | Transforma as fichas `.md` de uma pasta em funções — o mesmo formato do `ork catalogo importar`, descrito em [`ork.pt-BR.md`](ork.pt-BR.md). Atualiza pelo nome em vez de duplicar; nunca apaga. |
| `kanban` | `numero?`, `coluna?`, `responsavel?`, `etiqueta?`, `espaco?` | As tarefas por coluna, com número, etiquetas e quem trabalha em cada uma. Com `numero`, a tarefa inteira. |
| `kanban_criar` | `titulo`, `descricao?`, `coluna?`, `responsavel?`, `etiquetas?`, `pasta?`, `espaco?` | Cria uma tarefa e devolve o número (#N). Sem `coluna`, o usuário cria em Demandas e um agente em Fazendo. Com `pasta` (até 40 letras), ela já nasce numa pasta da coluna. |
| `kanban_mover` | `numero`, `coluna`, `posicao?` (`topo` · `fim` · N), `espaco?` | Leva a tarefa para outra coluna. Para Com o Maestro é delegar (só o usuário); a coluna final é do usuário e do Maestro. |
| `kanban_editar` | `numero`, `titulo?`, `descricao?`, `etiquetas?`, `pasta?`, `espaco?` | Troca título, descrição, etiquetas (`+a,-b` põe e tira) ou pasta (`""` tira a tarefa da pasta). |
| `kanban_atribuir` | `numero`, `responsavel`, `espaco?` | Põe um agente na lista de quem trabalha na tarefa e o avisa na caixa de entrada (`ninguem` esvazia). |
| `kanban_soltar` | `numero`, `quem?`, `espaco?` | Tira um agente da lista. |
| `kanban_comentar` | `numero`, `texto`, `espaco?` | Comenta na tarefa. |
| `kanban_apagar` | `numero`, `confirmar: true`, `espaco?` | Manda a tarefa para a lixeira (a página Kanban recupera). |
| `fluxo_ver` | `nome?`, `json?`, `espaco?` | Sem `nome`, os fluxos do espaço: ligado ou não, gatilhos e a última execução. Com `nome`, um fluxo inteiro; com `json: true`, o JSON que `fluxo_criar` e `fluxo_editar` recebem. Credencial aparece só pelo nome. |
| `fluxo_criar` | `fluxo`, `pasta?`, `espaco?` | Cria um fluxo a partir do JSON (objeto ou texto; cartões e colunas podem ir só pelo nome). Nasce desligado. `pasta` é uma pasta que já existe na página Fluxos. |
| `fluxo_editar` | `nome`, `fluxo`, `espaco?` | Troca o nome, os nós e as ligações pelo JSON mandado. |
| `fluxo_ligar` | `nome`, `espaco?` | Liga o fluxo. Recusa o que tem nó sensível (Código, HTTP, Ferramenta MCP ou comando) e o que ainda tem cartão, coluna ou servidor a escolher. |
| `fluxo_desligar` | `nome`, `espaco?` | Desliga o fluxo; nada mais muda nele. |
| `fluxo_rodar` | `nome`, `espaco?` | Roda uma vez, agora, pelo gatilho Manual, e devolve o que cada nó fez. Recusa sem gatilho Manual, ou com nó sensível (Código, HTTP, Ferramenta MCP ou comando) ainda não aprovado. |
| `fluxo_execucoes` | `nome`, `n?` (1–50, padrão 10), `espaco?` | As últimas execuções, com o resultado, o tempo e o nó que deu erro. |
| `fluxo_apagar` | `nome`, `confirmar: true`, `espaco?` | Apaga o fluxo e as execuções dele, para sempre. |

O kanban age **como quem chama**: de um terminal do Orkester, como aquele agente (as mesmas regras do `ork kanban`,
só o espaço dele, o nome dele no histórico — não mande `espaco`); de fora, como você. Organizar em massa (aplicar
pastas a muitas tarefas de uma vez) não tem ferramenta: é só pelo menu ⋯ da coluna na página Kanban, que tem Desfazer.

Os fluxos também agem como quem chama, com as regras do `ork fluxo` ([`ork.pt-BR.md`](ork.pt-BR.md#fluxos)). Com uma
diferença: **um fluxo com Código, HTTP, Ferramenta MCP ou comando não liga pelo MCP, nem com a sua chave.** O cliente cria e edita, o
fluxo fica desligado, e você liga pela página Fluxos, vendo esses nós. Os endereços locais permitidos (`rede.locaisPermitidos`) também só mudam pela página (um `rede` no JSON é ignorado, com aviso). Não há ferramenta para
credenciais nem para os servidores de fora. O formato e
os nós estão em [`fluxos.pt-BR.md`](fluxos.pt-BR.md).

As respostas são texto puro, o mesmo que o `ork` imprime. Uma recusa volta como erro da ferramenta
(`isError: true`), com o texto dizendo por quê — o cliente vê e pode se corrigir.

## Erros

| Mensagem | Quer dizer |
|---|---|
| `o Orkester não está aberto nesta máquina` | O app está fechado (ou é de antes da 1.3). Abra. |
| `falta a chave` | Falta `ORK_CHAVE` na configuração do servidor. |
| `chave inválida ou revogada` | Chave errada, ou revogada em Configurações › Conexões. Gere outra. |
| `o Orkester fechou desde a última vez` | O app fechou depois que o cliente se ligou. Abra de novo; não precisa reiniciar o cliente. |
| `o Orkester não respondeu em 30 s` | O app está aberto, mas travado. |

## O que a chave é e o que não é

- **É:** intenção (nada de fora do quadro chega nele sem uma), um nome, revogação que vale na próxima chamada
  e um registro — Configurações › Conexões mostra quando cada chave foi criada e usada pela última vez. A chave revogada é
  marcada, não apagada, para o registro de quem teve acesso continuar existindo.
- **Não é:** uma fronteira contra programas que já rodam como você. Qualquer coisa que rode no seu usuário já
  lê `~/.orkester`. A chave serve para saber quem fez o quê e cortar o acesso, não para barrar programa mal-
  intencionado na sua máquina.

## Como funciona

Enquanto roda, o app escreve o endereço do cano dele em `~/.orkester/cano.json` e apaga o arquivo ao sair — o
endereço muda a cada execução, e um cliente MCP não herda o ambiente do app como o terminal de um cartão
herda. O servidor lê esse endereço, manda o mesmo pedido que o `ork` mandaria, com `chave` onde o `ork` manda
o crachá, e devolve a resposta. A permissão é decidida no app, nunca no servidor: o servidor roda do lado de
quem chama.

Código: [`app/src/mcp/orkester.ts`](../app/src/mcp/orkester.ts) (o servidor),
[`app/src/shared/chaves.ts`](../app/src/shared/chaves.ts) (as chaves e as configurações geradas).

## Servidores de fora

Desde a 1.9.7 o Orkester também é **cliente** MCP: você cadastra servidores de outros (o n8n-mcp, um de planilhas, um
seu) e usa as ferramentas deles no nó [Ferramenta MCP](fluxos.pt-BR.md#ferramenta-mcp--foramcp) dos fluxos e nas
páginas "+" em que você marcar o servidor ([o que a página enxerga](#o-que-a-página-enxerga)). Fica em
Configurações › Conexões › aba **MCP**, na parte
**Servidores de fora** (a parte de cima, **Ligar programas ao Orkester**, é a das chaves, como antes).

### Cadastrar

**Adicionar servidor** abre o formulário. Há dois tipos:

- **stdio (um programa no seu PC):** o comando, os argumentos, a pasta (opcional) e as variáveis de ambiente. O comando
  aparece **inteiro** no cartão, com o aviso "roda no seu PC com os seus poderes": só cadastre o que você confia. Cada
  variável é texto à vista ou um **Segredo** (cifrado, sem domínio; **Criar segredo** ali mesmo; veja
  [Segredos dos servidores](#segredos-dos-servidores)). O
  servidor recebe só o ambiente mínimo e o que você declarou: as variáveis do Orkester (`ORK_PIPE`, `ORK_CHAVE`…)
  nunca chegam a ele, e declarar uma `ORK_*` é recusado.
- **http (um servidor na internet):** a URL e os cabeçalhos. Só **https**, e o host tem de ser um nome (não IP, nem
  `localhost`, nem `.local`); o IP é conferido antes de conectar. O cabeçalho vem de uma API de Conexões › **APIs**
  (Token, Basic ou Cabeçalho próprio) cujo domínio cubra o host; nunca de um Segredo. O "só lê" da API não vale aqui:
  o MCP sempre faz POST, e o que muda coisas é escolhido por ferramenta. Um servidor que roda no seu PC entra por
  stdio.

Os servidores ficam em `~/.orkester/mcp-servidores.json`, só com os ids dos segredos e das APIs (nenhum valor). Valem em todos
os espaços. Não há verbo `ork` nem ferramenta MCP para mexer neles: só a janela do app.

### Importar do Claude Code

**Importar do Claude Code** lê os `mcpServers` do seu `~/.claude.json` (os do usuário e os de cada projeto);
**Importar de um arquivo…** lê um `.mcp.json` que você escolher. Nada além de `mcpServers` é lido.

- A lista mostra cada servidor com o comando ou a URL inteiros, o que vai virar segredo ou API cifrada e se ele já
  existe.
  Vêm marcados os que ainda não existem; você escolhe.
- As variáveis de ambiente viram **Segredos** (em Segredos dos servidores). O cabeçalho `Authorization: Bearer …` vira
  uma API **Token** com o domínio da URL; outro cabeçalho vira uma API **Cabeçalho próprio** (as duas aparecem em
  Conexões › APIs), as duas **Só lê**: mude em Conexões › APIs se precisar escrever. O texto puro nunca é gravado.
- O próprio Orkester não é oferecido.
- Fica de fora, com aviso: servidor SSE, HTTP para `localhost`, variável cujo valor tem menos de 4 letras. Valor com `${…}` (a
  expansão do Claude Code) entra como texto literal, com aviso.
- **Chave nos argumentos ou na URL:** um servidor que traz uma chave nos argumentos de linha de comando (um
  `--api-key …`, um token com cara de token) ou na URL (senha, chave na consulta) **não é oferecido**. O aviso diz onde
  ela está (por exemplo, "argumento 4, o valor de --api-key"), nunca o valor: mova a chave para uma variável de
  ambiente do servidor (stdio) ou para um cabeçalho (http) e importe de novo. Os outros argumentos entram como estão,
  à vista.
- Um servidor HTTP sem cabeçalho (o do ClickUp, por exemplo, que entra por login) fica com o selo **Precisa de login
  (chega na 1.9.8)**: o login OAuth de MCP ainda não existe no app. Editar e pôr um cabeçalho de uma API tira o selo.

### Testar, impressão e Rever

- **Testar** sobe o servidor e lista as ferramentas, sem chamar nenhuma. Cada uma mostra "diz que só lê (palavra do
  servidor)" quando o servidor a anota como leitura; sem anotação, ela aparece em vermelho, "pode mudar coisas".
- O app guarda uma **impressão** de cada ferramenta (nome, descrição, esquema e anotações). A primeira lista é aprovada
  inteira.
- Se a impressão muda depois (o servidor foi atualizado, ou uma ferramenta nova apareceu), **só aquela ferramenta
  para**, nos fluxos e nas páginas, até você rever. O cartão mostra o aviso em vermelho e o botão **Rever ferramentas
  mudadas**: leia o que cada uma diz agora e **Aceitar**. O app aprova só a versão que você viu: se alguma mudou de
  novo depois que você abriu, nenhuma é aprovada ("mudou de novo depois que você abriu; releia antes de aceitar") e o
  painel é relido. Isso protege contra uma ferramenta "de leitura" que passa a apagar.
- O app também relê a lista do servidor **antes de cada chamada** (nos fluxos e nas páginas), mesmo que o servidor não
  avise que mudou. Se a lista não puder ser lida, a chamada é recusada.

### Como o app roda os servidores

- **stdio:** sobe na primeira chamada e é reusado; fecha depois de 5 minutos parado. No máximo 6 vivos ao mesmo tempo
  (o mais antigo parado fecha para dar lugar). Ao fechar e ao sair do app, a árvore inteira do processo é encerrada,
  e o app confere na lista de processos do Windows que ela morreu. Se sobrar algum, o cartão avisa ("fechou, mas N
  processo(s) seguem vivos", com os pids); se não der para conferir, ele diz isso em vez de dizer que fechou. Fechar
  leva 1 ou 2 segundos a mais por isso.
- **Prazos:** 30 s por chamada, 60 s na primeira subida. Resultado até 2 MB, só texto e conteúdo estruturado (imagem e
  arquivo ficam de fora e são contados).
- **Quedas:** 3 quedas em 10 minutos deixam o servidor **Pausado** (vale mesmo depois de reiniciar o app). **Pausar** e
  **Religar** também estão no cartão; religar zera as quedas. **Editar** derruba a conexão viva; **Remover** pede
  confirmação.
- **Segredos:** o valor dos segredos e da API do servidor volta como `•••` nos resultados, nas execuções e nas
  mensagens de erro.
- **Apagar um segredo ou uma API** usada por um servidor não apaga o servidor: a próxima subida dá erro ("não existe
  mais") e o cartão fica em erro. O aviso de apagar lista os servidores que o usam.

### Segredos dos servidores

Desde a 1.9.7, os segredos (o valor de uma variável de ambiente que um servidor stdio lê, como a chave do n8n-mcp)
ficam em Conexões › MCP, na parte **Segredos dos servidores**, e não mais na lista de APIs (um segredo não é API).

- **Guardar o valor de uma variável de ambiente** abre o formulário: nome e valor. Também dá para criar no próprio
  formulário do servidor, com **Criar segredo**.
- Não tem domínio e **nunca vai em cabeçalho nem em pedido HTTP**: o nó HTTP não o lista e o app recusa usá-lo num
  pedido.
- O cartão é o mesmo das APIs: **Trocar o valor**, **Editar** (o nome) e **Apagar**. O servidor cita o segredo pelo
  id, então renomear não o quebra.
- Mesmo cofre e mesmo arquivo das APIs (`~/.orkester/credenciais.json`, cada valor cifrado pelo cofre do Windows).
  Depois de guardado, a tela mostra só os 4 últimos caracteres.

### O que a página enxerga

Uma página "+" só usa um servidor de fora se **você** marcar, no aceite ou no cartão dela em Conexões › Páginas, na
seção **MCPs que esta página enxerga**. O manifesto da página só sugere (`mcp: [{ encaixe,
ferramentas }]`); a sugestão pré-marca e nunca concede.

- **Por ferramenta.** Marcar o servidor abre as ferramentas dele, cada uma com caixa e o rótulo "diz que só lê
  (palavra do servidor)" ou, em vermelho, "pode mudar coisas". Nenhuma vem marcada, salvo as sugeridas; há **marcar as
  que dizem só ler** e **marcar todas**. Até 5 servidores e 20 ferramentas por servidor.
- Um servidor que **precisa de login** aparece desligado: não dá para marcar. Se ele passar a precisar de login
  depois de marcado, a chamada da página é recusada: "o servidor X precisa de login: termine em Conexões › MCP antes de
  marcar".
- A página chama pelo nome do servidor (ou pelo nome do manifesto), sem contar maiúsculas, acentos e espaços:
  `orkPagina.mcp.disponiveis()`, `mcp.ferramentas(nome)` e `mcp.chamar(nome, ferramenta, argumentos)`. Ferramenta não
  marcada é recusada antes de chegar ao servidor.
- A página **não vê** a configuração do servidor, o comando, os segredos nem as ferramentas que você não marcou.
- As regras de impressão valem igual: ferramenta mudada fica de fora até você rever aqui.
- Uma página com `rede` ou `local` não enxerga servidor nenhum.

Detalhes no [guia das páginas](paginas.pt-BR.md#apis-e-mcps-que-a-página-enxerga).

### O que ainda não dá (1.9.8)

- Login OAuth de MCP HTTP (é o que destrava o MCP do ClickUp).
- MCP HTTP num servidor deste PC (use stdio).
- wss com chave de API.

Código: [`app/src/main/mcpFora/`](../app/src/main/mcpFora/) (cliente, cadastro e importação),
[`app/src/shared/mcpFora.ts`](../app/src/shared/mcpFora.ts) (regras puras).
