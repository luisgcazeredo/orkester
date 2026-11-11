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

1. No Orkester, clique na engrenagem no canto de cima, à direita (ou procure **Configurações** na paleta).
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
| `abrir_cartao` | `funcao?`, `agente?` (`claude` · `codex` · `shell`), `preset?`, `nome?`, `pasta?`, `espaco?` | Abre uma sessão nova. Com `funcao`, motor e nível vêm do preset do papel; sem ela, `agente` é obrigatório. `preset` força um pelo nome ("Claude forte"). `pasta` é relativa à pasta do espaço. |
| `partituras` | `espaco?` | Lista os times salvos (partituras), com agentes, funções e cordas. |
| `subir_partitura` | `nome`, `espaco?` | Sobe um time salvo no andar à mostra. Nome que não existe é recusado com a lista dos que existem. |
| `importar_catalogo` | `pasta`, `espaco?` | Transforma as fichas `.md` de uma pasta em funções — o mesmo formato do `ork catalogo importar`, descrito em [`ork.pt-BR.md`](ork.pt-BR.md). Atualiza pelo nome em vez de duplicar; nunca apaga. |

As respostas são texto puro, o mesmo que o `ork` imprime. Uma recusa volta como erro da ferramenta
(`isError: true`), com o texto dizendo por quê — o cliente vê e pode se corrigir.

## Erros

| Mensagem | Quer dizer |
|---|---|
| `o Orkester não está aberto nesta máquina` | O app está fechado (ou é de antes da 1.3). Abra. |
| `falta a chave` | Falta `ORK_CHAVE` na configuração do servidor. |
| `chave inválida ou revogada` | Chave errada, ou revogada em Configurações. Gere outra. |
| `o Orkester fechou desde a última vez` | O app fechou depois que o cliente se ligou. Abra de novo; não precisa reiniciar o cliente. |
| `o Orkester não respondeu em 30 s` | O app está aberto, mas travado. |

## O que a chave é e o que não é

- **É:** intenção (nada de fora do quadro chega nele sem uma), um nome, revogação que vale na próxima chamada
  e um registro — Configurações mostra quando cada chave foi criada e usada pela última vez. A chave revogada é
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
