# O comando `ork`

[English](ork.md) · Português

`ork` é a mão do agente dentro do Orkester. Com ele, um agente abre outros agentes, delega, lê a tela de
quem está ligado a ele, organiza o quadro e monta o próprio time.

Duas regras valem para tudo o que está aqui:

- **Só roda dentro de um terminal do app.** Fora dele o comando recusa — ele conversa com a janela por um
  cano nomeado (ou, num sandbox que proíbe cano, um correio de arquivos) que só existe ali.
- **A corda é a permissão**, e o agente não se dá permissão: ele só liga, desliga, renomeia ou entrega
  cartão de quem **abriu** ou de quem **já está ligado** a ele. Um agente alcança quem está ligado a ele pela corda (ou na mesma banda), e
  mais ninguém. Cartões se chamam pelo nome.

O app grava este manual como skill `orkester` em `~/.claude/skills` e `~/.codex/skills`, então o agente
aprende o comando sozinho na primeira vez que precisa dele.

### Se o agente roda num sandbox

Nada a fazer: o `ork` funciona igual. O Codex é o caso que precisa de ajuda, e o app resolve sozinho: ele
roda todo comando num sandbox e recusa sair dele, então o app grava uma regra de execpolicy em
`~/.codex/rules/orkester.rules` liberando o programa `ork` — o mecanismo documentado do próprio Codex para
isso. Sem ela, um agente Codex lê o quadro e nunca fala nele. A regra alarga o sandbox do Codex para esse
comando; o arquivo diz quem escreveu e por quê, e apagá-lo devolve a pergunta. O detalhe, para quem tiver curiosidade — o comando conversa com o app
por um cano nomeado, e alguns sandboxes recusam abrir um (o Codex no Windows responde `EPERM`). Quando isso
acontece, o `ork` deixa o mesmo pedido como arquivo numa pasta própria que o app vigia, e lê a resposta de
lá. Mesmos verbos, mesmas respostas, mesmos códigos de saída; a diferença são alguns milissegundos. A pasta
fica na temporária do sistema, não guarda nada além dos pedidos em trânsito, e é apagada quando o app fecha.

Não é um jeito de furar o sandbox: o correio leva os mesmos verbos que o cano leva, e a corda continua sendo
a permissão.

Para mexer no quadro **de fora** do app — o seu Claude, o Codex, qualquer cliente MCP — veja
[`mcp.pt-BR.md`](mcp.pt-BR.md).

---

## Onde eu estou

| Comando | O que faz |
|---|---|
| `ork quem` | quem é você, quem está ligado a você e o último contexto conhecido |
| `ork orcamento` | mede quanto de janela o Claude ainda tem; o Codex declara que não expõe |
| `ork espacos` | lista todos os espaços, com janela, cartões, e marca o seu |
| `ork ajuda` | a ajuda completa, direto do app |

## Trabalhar com outros agentes

| Comando | O que faz |
|---|---|
| `ork abrir [claude\|codex\|shell]` | abre uma sessão nova ao lado, já ligada a você. Com `--funcao`, o agente é opcional |
| `ork pedir <nome> "texto"` | manda um pedido e espera terminar; devolve a tela |
| `ork entregar "texto"` | manda o resultado a quem te deu a tarefa (ou a quem te abriu); sem recibo. Também `responder`, `devolver` |
| `ork pagina responder "<página>" "texto"` | responde a uma página "+" ligada ao seu cartão (aberta: chega na hora; fechada: fica guardada até ela abrir). Também `--arquivo resposta.md`. Veja [`docs/paginas.pt-BR.md`](paginas.pt-BR.md) |
| `ork esperar <nome>` | espera o outro terminar o que está fazendo |
| `ork ver <nome>` | lê a tela dele sem mandar nada |
| `ork teclas <nome> <tecla>…` | responde menus e perguntas: `enter`, `esc`, `tab`, `shift-tab`, setas, `ctrl-c`, `y`, `n`, números |
| `ork limpar <nome>` | zera o contexto da sessão (`/clear` no Claude, `/new` no Codex) |
| `ork fechar <nome>` | fecha uma sessão que **você** abriu; o que ela abriu passa para você |
| `ork passar <nome>` | passa o seu papel inteiro a um sucessor vivo: as sessões que você abriu, todas as suas cordas (não só as dos filhos), os recados parados na sua caixa e as entregas que você esperava (um `ork entregar` sem `--para` passa a chegar a ele). Vale mesmo sem filhos. Só dentro de um espaço: é recusado, antes de mudar qualquer coisa, se o sucessor está em outro espaço ou se você tem sessões abertas em outro espaço (feche-as antes com `ork fechar`). Um recado ou uma entrega endereçado a um cartão que não existe mais vai ao Maestro do espaço, com uma linha dizendo isso. É tudo ou nada — se algo falhar, nada muda e você não deve dar `ork sair` |
| `ork sair` | fecha o próprio cartão; com `--com-as-minhas`, leva junto a árvore que você abriu |

Opções do `ork abrir`:

```text
--espaco "Nome"     abre em outro espaço (você continua sendo o dono)
--nome N            o nome do cartão
--pasta P           a pasta em que o terminal abre
--funcao "Papel"    nasce com o prompt dessa função, na pasta dela, no preset dela (motor + nível)
--preset "Nome"     troca o preset só desta sessão ("Claude forte")
--modelo M          o modelo (veja `ork modelos`); manda sobre a função
--esforco E         o esforço (low … max; ultra só no Codex); manda sobre a função
--tarefa N          põe o agente trabalhando na tarefa #N do kanban
--pedido "texto"    o primeiro pedido, já digitado
--arquivo p.md      o primeiro pedido, lido de um arquivo
--esperar           só volta quando ele terminar
--tempo S           quantos segundos esperar
```

`ork pedir` aceita `--arquivo`, `--tarefa`, `--sem-esperar` e `--tempo`. `ork entregar` aceita `--arquivo` e `--para "Nome"`.

### A caixa de entrada

Nada que um agente manda a outro é digitado na hora. `ork pedir` e `ork entregar` põem o recado na **caixa de
entrada** do destino, e o app digita um de cada vez, só quando o destino está livre **e o usuário não está
escrevendo nele** (nenhuma tecla há 5 s e nada no campo de entrada). Assim um agente que termina não cola a
entrega no meio do que você está escrevendo. O cartão mostra um selo com quantos recados esperam e por quê; se
você limpou o campo e o selo insiste, clique nele.

Quem delega não precisa vigiar. A entrega chega no terminal de quem pediu como `[ork · entrega de "Nome"]`. Se o
agente trabalhar e parar uns 20 s sem entregar, o app avisa quem pediu com `[ork · aviso do Orkester]` e as
últimas linhas da tela dele; numa pergunta, mais cedo. Num shell, entrega e aviso entram como comentário (`# `),
para o PowerShell não executar nada.

## Montar o time

| Comando | O que faz |
|---|---|
| `ork funcoes` | lista os papéis guardados, para usar em `ork abrir --funcao` |
| `ork banda` | lista as bandas do andar e quem está dentro de cada uma |
| `ork banda criar "Nome" <cartão>…` | põe uma moldura em volta desses agentes: todos passam a se falar |
| `ork modelos` | os modelos de Claude e Codex, os esforços que cada um aceita e os padrões |
| `ork modelo <cartão> [<modelo>] [--esforco nível]` | troca o modelo e/ou o esforço de um cartão que você abriu, com ele livre; o cartão reabre e a conversa continua |
| `ork trocar <cartão> <claude\|codex\|shell>` | troca o agente de um cartão que você abriu; lugar, nome e cordas ficam |
| `ork partitura` | lista os times salvos |
| `ork partitura usar "Nome"` | sobe esse time ao seu lado, ligado a você |
| `ork partitura salvar "Nome" [cartão]…` | guarda como partitura esses cartões, ou o andar inteiro |
| `ork catalogo importar <pasta>` | transforma as fichas `.md` de uma pasta em funções (abaixo) |

### Fichas de time

Um time escrito fora do app — à mão, por outro agente, copiado de outro projeto — é uma pasta de arquivos
Markdown, um por papel. Cada um tem um cabeçalho entre linhas `---` e um corpo, que vira o prompt da função:

```markdown
---
nome: Revisor
motor: Codex
nivel: forte
pasta: app
---
Você revisa toda mudança antes do push. …
```

- Só `nome` é obrigatório. `pasta` é relativa à pasta do espaço.
- `motor` diz o motor. **"Codex e Claude"** (ou "Codex, Claude") cria **duas** funções, uma por motor, com o
  motor no nome; **"Shell com Claude"**, sem separador, é um cartão só, descrito em prosa.
- `nivel` casa com um preset daquele motor pelo nome: `forte`, `medio` ou `rapido` no nome do preset. Sem
  preset naquele nível, cai no primeiro do motor, e o relatório avisa.
- Importar de novo **atualiza pelo nome** em vez de duplicar, e **nunca apaga** função: a pasta pode ser
  parte do time, não ele inteiro. Arquivo sem cabeçalho é pulado e aparece no relatório.

## Mexer no quadro

| Comando | O que faz |
|---|---|
| `ork quadro` | lê o quadro: cada cartão com número, nome, lugar e tamanho, e as cordas |
| `ork mover <cartão>… --x N --y N` | põe cartões num lugar; com `--dx/--dy`, anda com eles de onde estão |
| `ork arrumar [cartão]… --colunas N` | põe os cartões em grade, a partir do canto onde já estavam |
| `ork nome <cartão> "Nome novo"` | renomeia um cartão de agente |
| `ork ligar <cartão> <cartão>` | desenha a corda: os dois passam a poder se falar (só entre cartões ao seu alcance) |
| `ork desligar <cartão> <cartão>` | tira a corda |
| `ork anotar "texto"` | escreve um texto no quadro, abaixo do seu cartão |
| `ork juntar <cartão>… [--soltar]` | agrupa cartões para andarem juntos |
| `ork ler <cartão>` | lê um cartão inteiro (a lista corta o texto em 60 letras) |
| `ork apagar <cartão>…` | tira do quadro o que não tem processo atrás; agente é `ork fechar`. Ctrl+Z desfaz |
| `ork janela "Espaço"` | abre um espaço numa janela; `--novo "Nome"` cria o espaço antes |

Tudo o que o agente faz no quadro:

- **entra no desfazer** do usuário — um Ctrl+Z desfaz;
- **nunca apaga nada**;
- **não toca** em cartão travado nem em cartão de código;
- **só alcança o andar à mostra**.

## Árvores de código

Cada cartão de agente tem árvores de arquivos ao lado — uma por frente de trabalho. Os arquivos que ele
grava nascem sozinhos ali, com o diff do git.

| Comando | O que faz |
|---|---|
| `ork arvore` | lista as árvores do seu cartão e diz qual está em uso |
| `ork arvore nova "Nome"` | cria uma árvore e passa a usá-la para os próximos arquivos |
| `ork arvore usar "Nome"` | passa a usar uma árvore que já existe |
| `ork arvore mostrar <arquivo>…` | abre esses arquivos como cartões; `--arvore "Nome"` escolhe onde |
| `ork arvore dar "Agente" <arquivo>…` | entrega esses cartões de código a outro agente do quadro |
| `ork arvore desfazer "Nome"` | desfaz a árvore; os arquivos dela voltam para a principal |

## Kanban

O kanban do espaço (o mesmo da página Kanban). Um agente só alcança o kanban do próprio espaço, e o nome dele fica
no histórico de cada tarefa.

| Comando | O que faz |
|---|---|
| `ork kanban [ver] [--coluna C] [--para Nome\|eu\|ninguem] [--etiqueta e]` | as tarefas por coluna, com quem trabalha em cada uma; `ork kanban ver 12` mostra a #12 inteira |
| `ork kanban criar "Título" [--descricao T \| --arquivo f.md] [--coluna C] [--para Nome] [--etiqueta a,b]` | cria uma tarefa; sem `--coluna`, nasce em Fazendo (Demandas é do usuário) |
| `ork kanban pegar <n>` | você entra na lista de quem trabalha nela; de Demandas ou Com o Maestro ela vai para Fazendo |
| `ork kanban soltar <n> [Nome]` | você sai da lista (tirar outro: só o Maestro e o usuário) |
| `ork kanban mover <n> "Coluna" [--posicao topo\|fim\|N]` | muda de coluna; Com o Maestro é do usuário, a coluna final do usuário e do Maestro |
| `ork kanban editar <n> [--titulo T] [--descricao T \| --arquivo f.md] [--etiqueta +a,-b]` | troca título, descrição ou etiquetas |
| `ork kanban atribuir <n> Nome\|eu\|ninguem` | põe na lista e avisa o agente na caixa dele (`ninguem` esvazia) |
| `ork kanban comentar <n> "texto"` | comenta (também `--arquivo f.md`) |
| `ork kanban apagar <n> --confirmar` | manda para a lixeira (a página recupera) |
| `ork kanban coluna criar "Nome"` | também `renomear "Velho" "Novo"` e `apagar "Nome"` |

`ork abrir --tarefa N` e `ork pedir --tarefa N` põem o agente trabalhando na tarefa #N e citam a tarefa no pedido.

O `--arquivo` pode vir com BOM do UTF-8 (o `Set-Content -Encoding utf8` do Windows PowerShell grava um): o `ork` tira ao ler, em todos os comandos.

## Fluxos

Os fluxos do espaço (os mesmos da página Fluxos): automações em nós, com um gatilho e o que fazer depois. O formato
JSON, os ajustes de cada nó e as regras estão em [`fluxos.pt-BR.md`](fluxos.pt-BR.md). Um agente só alcança os fluxos
do próprio espaço. O fluxo é achado pelo nome (sem diferenciar maiúsculas) ou pelo começo dele.

| Comando | O que faz |
|---|---|
| `ork fluxo [listar]` | os fluxos do espaço: ligado ou não, gatilhos, pasta, a última execução e os que não abrem |
| `ork fluxo ver "Nome" [--json]` | um fluxo inteiro: nós e ligações; `--json` devolve o JSON que `criar` e `editar` recebem |
| `ork fluxo criar --arquivo f.json [--pasta "P"]` | cria a partir do JSON (o nome vai dentro dele); nasce desligado; `--pasta` é uma pasta que já existe |
| `ork fluxo editar "Nome" --arquivo f.json` | troca o nome, os nós e as ligações pelo JSON |
| `ork fluxo ligar "Nome"` / `ork fluxo desligar "Nome"` | liga ou desliga |
| `ork fluxo rodar "Nome"` | roda agora, pelo gatilho Manual, e mostra o que cada nó fez |
| `ork fluxo execucoes "Nome" [--n 10]` | as últimas execuções: resultado, tempo e o nó que deu erro |
| `ork fluxo apagar "Nome" --confirmar` | apaga o fluxo e as execuções dele, para sempre |

Regras para o agente:

- **Código, HTTP ou Comando no shell:** o fluxo nasce (ou fica, ao editar) desligado, e `ligar` é recusado. Só o
  usuário liga, pela página, vendo esses nós. O `rodar` também recusa enquanto esses nós não foram aprovados por ele.
- **Alcance:** o fluxo só cita cartões que o agente alcança (corda, banda ou quem ele abriu): destino do recado,
  quem recebe a entrega, quem o gatilho vigia e o shell do comando. Recado sem `entregaPara` devolve a entrega ao
  próprio agente. A cada disparo, recado e gatilho são conferidos de novo (o shell do comando, não: o usuário o viu
  ao ligar); fora do alcance, o fluxo pula a vez, e sem o cartão do agente um fluxo com recado desliga.
- **Rede local:** os endereços locais permitidos (`rede.locaisPermitidos`) só mudam pela página, pelo usuário. Um `rede` no JSON de agente é ignorado, o fluxo fica
  como estava e a resposta traz um aviso.
- **Credencial:** o nó HTTP cita só o nome de uma credencial que o usuário guardou. Não há comando para ler ou criar
  credencial.
- Criar, editar, ligar, desligar e apagar por agente aparecem no canto da janela do usuário.

---

## Exemplo: delegar e esperar

```powershell
# abre um revisor com papel definido e um primeiro pedido, e espera a resposta
ork abrir codex --nome "Revisor" --funcao "Revisor" --pedido "Leia src/main/janelas.ts e aponte riscos" --esperar

# lê o que ele respondeu
ork ver "Revisor" --linhas 40

# ele parou numa pergunta de menu: responde
ork teclas "Revisor" enter

# terminou: fecha
ork fechar "Revisor"
```
