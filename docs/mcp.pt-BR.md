# O servidor MCP

[English](mcp.md) · Português

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
| `kanban_criar` | `titulo`, `descricao?`, `coluna?`, `responsavel?`, `etiquetas?`, `espaco?` | Cria uma tarefa e devolve o número (#N). Sem `coluna`, o usuário cria em Demandas e um agente em Fazendo. |
| `kanban_mover` | `numero`, `coluna`, `posicao?` (`topo` · `fim` · N), `espaco?` | Leva a tarefa para outra coluna. Para Com o Maestro é delegar (só o usuário); a coluna final é do usuário e do Maestro. |
| `kanban_editar` | `numero`, `titulo?`, `descricao?`, `etiquetas?`, `espaco?` | Troca título, descrição ou etiquetas (`+a,-b` põe e tira). |
| `kanban_atribuir` | `numero`, `responsavel`, `espaco?` | Põe um agente na lista de quem trabalha na tarefa e o avisa na caixa de entrada (`ninguem` esvazia). |
| `kanban_soltar` | `numero`, `quem?`, `espaco?` | Tira um agente da lista. |
| `kanban_comentar` | `numero`, `texto`, `espaco?` | Comenta na tarefa. |
| `kanban_apagar` | `numero`, `confirmar: true`, `espaco?` | Manda a tarefa para a lixeira (a página Kanban recupera). |
| `fluxo_ver` | `nome?`, `json?`, `espaco?` | Sem `nome`, os fluxos do espaço: ligado ou não, gatilhos e a última execução. Com `nome`, um fluxo inteiro; com `json: true`, o JSON que `fluxo_criar` e `fluxo_editar` recebem. Credencial aparece só pelo nome. |
| `fluxo_criar` | `fluxo`, `pasta?`, `espaco?` | Cria um fluxo a partir do JSON (objeto ou texto; cartões e colunas podem ir só pelo nome). Nasce desligado. `pasta` é uma pasta que já existe na página Fluxos. |
| `fluxo_editar` | `nome`, `fluxo`, `espaco?` | Troca o nome, os nós e as ligações pelo JSON mandado. |
| `fluxo_ligar` | `nome`, `espaco?` | Liga o fluxo. Recusa o que tem Código, HTTP ou comando e o que ainda tem cartão ou coluna a escolher. |
| `fluxo_desligar` | `nome`, `espaco?` | Desliga o fluxo; nada mais muda nele. |
| `fluxo_rodar` | `nome`, `espaco?` | Roda uma vez, agora, pelo gatilho Manual, e devolve o que cada nó fez. Recusa sem gatilho Manual, ou com Código, HTTP ou comando ainda não aprovado. |
| `fluxo_execucoes` | `nome`, `n?` (1–50, padrão 10), `espaco?` | As últimas execuções, com o resultado, o tempo e o nó que deu erro. |
| `fluxo_apagar` | `nome`, `confirmar: true`, `espaco?` | Apaga o fluxo e as execuções dele, para sempre. |

O kanban age **como quem chama**: de um terminal do Orkester, como aquele agente (as mesmas regras do `ork kanban`,
só o espaço dele, o nome dele no histórico — não mande `espaco`); de fora, como você.

Os fluxos também agem como quem chama, com as regras do `ork fluxo` ([`ork.pt-BR.md`](ork.pt-BR.md#fluxos)). Com uma
diferença: **um fluxo com Código, HTTP ou comando não liga pelo MCP, nem com a sua chave.** O cliente cria e edita, o
fluxo fica desligado, e você liga pela página Fluxos, vendo esses nós. Os endereços locais permitidos (`rede.locaisPermitidos`) também só mudam pela página (um `rede` no JSON é ignorado, com aviso). Não há ferramenta para
credenciais. O formato e
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
