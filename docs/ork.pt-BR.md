# O comando `ork`

[English](ork.md) · Português

`ork` é a mão do agente dentro do Orkester. Com ele, um agente abre outros agentes, delega, lê a tela de
quem está ligado a ele, organiza o quadro e monta o próprio time.

Duas regras valem para tudo o que está aqui:

- **Só roda dentro de um terminal do app.** Fora dele o comando recusa — ele conversa com a janela por um
  cano nomeado (ou, num sandbox que proíbe cano, um correio de arquivos) que só existe ali.
- **A corda é a permissão.** Um agente alcança quem está ligado a ele pela corda (ou na mesma banda), e
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
| `ork abrir <claude\|codex\|shell>` | abre uma sessão nova ao lado, já ligada a você |
| `ork pedir <nome> "texto"` | manda um pedido e espera terminar; devolve a tela |
| `ork esperar <nome>` | espera o outro terminar o que está fazendo |
| `ork ver <nome>` | lê a tela dele sem mandar nada |
| `ork teclas <nome> <tecla>…` | responde menus e perguntas: `enter`, `esc`, `tab`, `shift-tab`, setas, `ctrl-c`, `y`, `n`, números |
| `ork limpar <nome>` | zera o contexto da sessão (`/clear` no Claude, `/new` no Codex) |
| `ork fechar <nome>` | fecha uma sessão que **você** abriu; o que ela abriu passa para você |
| `ork passar <nome>` | entrega a um sucessor vivo as sessões que você abriu |
| `ork sair` | fecha o próprio cartão; com `--com-as-minhas`, leva junto a árvore que você abriu |

Opções do `ork abrir`:

```text
--espaco "Nome"     abre em outro espaço (você continua sendo o dono)
--nome N            o nome do cartão
--pasta P           a pasta em que o terminal abre
--funcao "Papel"    nasce com o prompt dessa função
--pedido "texto"    o primeiro pedido, já digitado
--arquivo p.md      o primeiro pedido, lido de um arquivo
--esperar           só volta quando ele terminar
--tempo S           quantos segundos esperar
```

`ork pedir` aceita `--arquivo`, `--sem-esperar` e `--tempo`.

**Limite:** cada agente abre no máximo 8 sessões.

## Montar o time

| Comando | O que faz |
|---|---|
| `ork funcoes` | lista os papéis guardados, para usar em `ork abrir --funcao` |
| `ork banda` | lista as bandas do andar e quem está dentro de cada uma |
| `ork banda criar "Nome" <cartão>…` | põe uma moldura em volta desses agentes: todos passam a se falar |
| `ork trocar <cartão> <claude\|codex\|shell>` | troca o agente de um cartão que você abriu; lugar, nome e cordas ficam |
| `ork partitura` | lista os times salvos |
| `ork partitura usar "Nome"` | sobe esse time ao seu lado, ligado a você |
| `ork partitura salvar "Nome" [cartão]…` | guarda como partitura esses cartões, ou o andar inteiro |

## Mexer no quadro

| Comando | O que faz |
|---|---|
| `ork quadro` | lê o quadro: cada cartão com número, nome, lugar e tamanho, e as cordas |
| `ork mover <cartão>… --x N --y N` | põe cartões num lugar; com `--dx/--dy`, anda com eles de onde estão |
| `ork arrumar [cartão]… --colunas N` | põe os cartões em grade, a partir do canto onde já estavam |
| `ork nome <cartão> "Nome novo"` | renomeia um cartão de agente |
| `ork ligar <cartão> <cartão>` | desenha a corda: os dois passam a poder se falar |
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

---

## Exemplo: delegar e esperar

```powershell
# abre um revisor com papel definido e um primeiro pedido, e espera a resposta
ork abrir codex --nome "Revisor" --funcao "Revisor" --pedido "Leia src/main/janelas.ts e aponte riscos" --esperar

# lê o que ele respondeu
ork ver "Revisor" --linhas 40

# ele parou numa pergunta de menu: responde
ork teclas "Revisor" enter

# terminou: fecha e devolve a vaga
ork fechar "Revisor"
```
