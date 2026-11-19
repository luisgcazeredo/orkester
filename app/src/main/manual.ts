// O manual do `ork` para os agentes. Vira a skill `orkester` do Claude Code e do Codex (gravada pelo app
// ao abrir) e a resposta de `ork ajuda`. Texto nosso; atualizar junto com comandos.ts.
import { tabelaDeComandos } from './verbos'

export const AJUDA = `ork — fala com o Orkester de dentro de um terminal do app

${tabelaDeComandos()}

  <nome> é o nome do cartão (ou o começo dele). --tempo em segundos (padrão 100, máx. 3600).
  Só fala com quem está ligado a você por uma corda, ou com quem você mesmo abriu. Quem abre no mesmo espaço já nasce
  ligado; em outro espaço não ganha corda, mas continua acessível pelo dono. O número de contexto vem da tela do cliente
  e pode não dar para ler. No Git Bash, comando de barra precisa de \`MSYS2_ARG_CONV_EXCL='*'\` ou de \`--arquivo\`.`

export const SKILL = `---
name: orkester
description: Use dentro de um terminal do Orkester (a variável de ambiente ORK_PIPE existe) para fazer engenharia de contexto — abrir uma sessão nova de agente (Claude, Codex ou shell) com um contexto limpo e focado, delegar uma parte do trabalho, conversar com os agentes ligados a você pela corda, ler a tela deles, zerar o contexto de uma sessão ou fechar as sessões que você abriu — e para organizar o quadro: ler o que há nele, ler um cartão inteiro, mover, arrumar em grade, renomear, ligar dois agentes, anotar, apagar o que não tem processo e agrupar cartões — para juntar agentes numa banda (grupo em que todos se falam), trocar o agente de um cartão que você abriu, e subir um time salvo (partitura) com as funções e as cordas dele, ou guardar o time que está no quadro — e para ler e mexer no kanban do espaço (criar, pegar, mover, atribuir e comentar tarefas). Comando: ork. Fora do app não funciona.
---

# Orkester: o comando \`ork\`

Você está num cartão de terminal do Orkester, um quadro onde cada agente é um terminal. O comando \`ork\`
(já no PATH) fala com o app. Confira com \`echo $ORK_PIPE\` (bash) ou \`$env:ORK_PIPE\` (PowerShell): vazio = você não
está no app, e nada daqui vale.

## Para que serve: engenharia de contexto

Seu contexto é caro e fica poluído com o tempo. Em vez de carregar tudo numa conversa só:

- **Tarefa focada → sessão nova.** Abra uma sessão limpa com só o que ela precisa saber. Escreva o contexto num
  arquivo (objetivo, arquivos relevantes, restrições, o que entregar e em que formato) e mande ler:
  \`ork abrir claude --nome "Revisor" --arquivo .contexto/revisor.md --esperar --tempo 300\`
- **Revisão por outro modelo.** Quem fez não revisa o próprio trabalho: abra um Codex para revisar o que um Claude fez,
  e vice-versa.
- **Sessão que já cumpriu o papel → feche** (\`ork fechar\`) ou **zere** (\`ork limpar\`) antes de dar outra tarefa.
- **Resultado longo → arquivo.** Peça para a sessão gravar o resultado num arquivo e responder só o caminho e um
  resumo de poucas linhas; a tela devolvida pelo \`ork\` é curta.
- **Decida pelo orçamento.** Consulte \`ork orcamento\` antes de continuar uma frente longa. No Claude livre, ele
  mede sob demanda com \`/context\`; ocupado, mostra a última medição com a hora. O Codex não expõe contexto. Com pouco contexto, em
  vez de seguir até ser compactado, grave o estado num arquivo e abra uma sessão nova com só o que ela precisa. O número
  é lido do rodapé do cliente e pode faltar; nesse caso, não invente um número.
- **Frente inteira → espaço novo.** \`ork janela --novo "Nome"\` separa uma frente de trabalho inteira, com o seu
  quadro e suas sessões; não abra um espaço novo para cada tarefinha.

## Passar o bastão e trabalhar em paralelo

- **Contexto ficando inútil:** quando muita conversa já não serve, ou o \`ork orcamento\` estiver baixo, grave num
  arquivo o que foi feito, falta fazer, decisões e arquivos importantes. Abra o sucessor com \`ork abrir ... --arquivo
  esse-arquivo.md\`, confirme que ele subiu e entendeu, passe para ele o que você abriu com \`ork passar\` e só então
  use \`ork sair\`.
- **Só apague o antigo se ele não for mais trabalhar.** Se ainda há algo que só ele sabe ou faz, ele fica. Na dúvida,
  mantenha os dois e avise o usuário.
- **Subterminais paralelos:** abra frentes independentes com \`--sem-esperar\`; cada uma devolve com
  \`ork entregar\` (ou o Orkester avisa quando parar sem entregar), e você pode conferir com \`ork ver\`; cada uma recebe somente o contexto da sua parte. Dois agentes não editam o mesmo arquivo, e resultado
  longo vai para arquivo.
- O contexto vem do rodapé do cliente e pode faltar. Sem número, decida pelo que percebe da conversa, sem chutar.

## Comandos

${'```'}
${AJUDA.split('\n').slice(2).join('\n')}
${'```'}

- \`ork pedir\` põe o pedido na **caixa de entrada** do outro e espera ele terminar; devolve as últimas linhas da
  tela. Se o tempo acabar, ele continua trabalhando: use \`ork esperar\` (ou \`ork ver\`) depois.
- **Caixa de entrada:** nada é digitado na hora no terminal de outro agente. O Orkester digita um recado de cada vez,
  só quando o destino está livre **e o usuário não está escrevendo nele** (assim nada corta o que ele escreve). Se a
  resposta disser que o pedido "está na caixa de entrada", ele **vai** ser entregue: não mande de novo.

## Entregar o resultado: \`ork entregar\`

Terminou uma tarefa que um agente te deu (ou foi aberto por um agente)? Mande o resultado com
\`ork entregar "resumo curto"\` ou \`ork entregar --arquivo entrega.md\`. Vai para quem te deu a tarefa (sem
\`--para\`, é quem pediu por último ou quem te abriu) e entra na caixa de entrada dele. **Não há recibo a esperar:**
o Orkester confirma que entrou, ou diz que está na fila e entrega sozinho. Depois de entregar, pode parar.

Se você parar sem entregar, o Orkester avisa quem te deu a tarefa (com as últimas linhas da sua tela) depois de uns
20 s parado; numa pergunta, mais cedo. Quem delega **não precisa vigiar** com \`ork esperar\`: o resultado (ou o
aviso) chega sozinho no terminal dele, como uma mensagem que começa com \`[ork · entrega de "Nome"]\` ou
\`[ork · aviso do Orkester]\`.
- Texto com aspas, \`%\`, \`!\` ou várias linhas: grave num arquivo e use \`--arquivo\`.
- **Git Bash e comandos de barra:** ele pode converter \`/context\` em um caminho. Rode
  \`MSYS2_ARG_CONV_EXCL='*' ork pedir "Nome" "/context"\`, ou grave o comando num arquivo e use \`--arquivo\`.
- Ajuste \`--tempo\` ao limite da sua ferramenta de terminal (no Claude Code, o padrão da ferramenta é 2 min;
  passe um timeout maior nela ou rode em segundo plano). No Codex, use \`--tempo\` curto e repita \`ork esperar\`.
- Modelo e esforço: \`ork abrir claude --modelo sonnet --esforco high\` (confira os nomes com \`ork modelos\`). Modelo fora
  da lista abre com aviso; esforço que o motor não tem é recusado (\`ultra\` só no Codex). Sem os dois, vale o da
  função, o do preset ou o padrão do motor. Para trocar depois, num cartão que você abriu e que está livre:
  \`ork modelo "Nome" sonnet --esforco high\` (o cartão reabre e a conversa continua; ocupado, recusa).
- \`ork abrir\` sem \`--pedido\` só abre; o agente pode levar alguns segundos para ficar pronto.
- Quem está parado numa pergunta (confiar na pasta, servidores MCP, permissão de ferramenta, atualização) aparece como
  \`pergunta\` no \`ork quem\`, e o \`ork\` não digita pedido nenhum em cima dela: devolve a tela. Responda com
  \`ork teclas\` só se for seguro (veja onde está o cursor antes do \`enter\`); na dúvida, pergunte ao usuário.

## Mostrar o código que você está mexendo

O quadro abre sozinho um cartão para cada arquivo que você grava na sua pasta, ligado ao seu cartão por um ramo
que sai de uma bolinha — é a sua **árvore de código**. Você pode ter várias, cada uma com um nome, para separar
frentes de trabalho e depois falar delas pelo nome com o usuário ou com outro agente ("leia os arquivos da
árvore Backend"):

\`\`\`
ork arvore                          # as suas árvores e qual está em uso
ork arvore nova "Backend"           # cria e passa a usar: os próximos arquivos nascem nela
ork arvore usar "principal"         # volta a usar outra
ork arvore mostrar src/api.ts src/db.ts --arvore "Backend"
ork arvore dar "Revisor" src/api.ts # entrega o cartão desse arquivo a outro agente do quadro
ork arvore desfazer "Backend"       # os arquivos dela voltam para a principal
\`\`\`

Use antes de começar uma frente nova, para o usuário enxergar o trabalho separado. Arquivo com cara de segredo
(\`.env\`, chave, credencial) nunca vira cartão, e o \`mostrar\` só aceita arquivo de uma pasta que está no quadro.

**Num time que divide a mesma pasta, o dono do cartão é um palpite.** O app vigia a pasta, não o processo:
ele dá o arquivo novo a quem estiver trabalhando naquele instante, e com dois gravando ao mesmo tempo pode
errar. Se um arquivo seu foi parar na coluna de outro, ou o contrário, acerte com \`ork arvore dar\` — e se você
é o maestro, entregue os cartões de quem você fechou ao próximo que for mexer naquilo. O cartão nunca some: é
o histórico do trabalho, e o usuário lê quando quiser.

## Organizar o quadro você mesmo

O quadro é o lugar onde o usuário acompanha o trabalho, e você pode arrumá-lo. Comece sempre por
\`ork quadro\`: ele lista cada cartão com um número, o tipo, o nome, o tamanho e o lugar, as cordas e quem é
você. Depois fale dos cartões pelo nome (o começo basta) ou pelo \`#número\`:

\`\`\`
ork quadro                            # o que existe, com nome, lugar e tamanho
ork mover "Revisor" --x 1200 --y 0    # põe o cartão nesse lugar
ork mover "Revisor" --dx 0 --dy 600   # ou anda com ele de onde está
ork arrumar --colunas 3               # tudo o que está solto, em grade, no mesmo canto
ork arrumar "Revisor" "Testes"        # ou só esses
ork nome "Claude Code 2" "Revisor"    # renomeia: é o nome que o ork passa a usar
ork ligar "Revisor" "Testes"          # a corda: os dois passam a poder se falar (os dois ao seu alcance)
ork desligar "Revisor" "Testes"
ork anotar "Falta o teste do empurrão"   # um texto no quadro, abaixo do seu cartão
ork ler "Falta o teste"               # o cartão inteiro (a lista corta o texto em 60 letras)
ork apagar "Falta o teste"            # tira do quadro o que não tem processo (Ctrl+Z desfaz)
ork juntar "Revisor" "Testes"         # andam juntos daqui para frente (--soltar desfaz)
\`\`\`

O que isto **não** faz, de propósito:

- **Não apaga agente.** O \`ork apagar\` tira do quadro o que não tem processo atrás (anotação, post-it,
  banda, imagem, portal); um terminal, não — para fechar uma sessão que você abriu, use \`ork fechar\`.
  Apague o que é seu: a sua anotação velha, a banda que você criou. O que é do usuário é dele.
- **Não mexe em cartão travado** nem em **cartão de código**: a árvore de arquivos é arrumada pelo app, e o
  cartão que o usuário tirou dela ficou onde ele quis. O \`ork\` diz quando deixou algo como estava.
- **Só alcança o andar à mostra** da janela daquele espaço, e só pelo nome — você não conhece id de nada.
- **Você não se dá permissão.** Ligar, desligar, renomear e entregar cartão valem para quem você **abriu**
  ou para quem **já está ligado** a você. Precisa falar com outro agente? Peça ao usuário, ou a quem abriu
  aquele cartão — a corda é a permissão, e ela não se estende sozinha.

Tudo o que você fizer aqui entra no **desfazer do usuário**: um Ctrl+Z volta o quadro inteiro. Mesmo assim,
arrumar o quadro é coisa que se faz com parcimônia — o lugar onde o usuário deixou um cartão costuma querer
dizer algo. Mover o que é seu (os seus subagentes, as suas anotações) é de boa educação; reorganizar o quadro
todo sem ele pedir, não.

## Banda: um grupo de agentes

Uma **banda** é uma moldura no quadro. Quem está **dentro** dela fala com todos os outros de dentro, e a
corda desenhada na banda vale para cada um deles — é o que evita seis cordas à mão num time de quatro.

\`\`\`
ork banda                           # as bandas deste andar, quem está dentro e onde está a moldura
ork banda criar "Revisores" "Revisor" "Prova"   # moldura em volta deles: passam a se falar
\`\`\`

- **Não há lista de membros:** quem está dentro da moldura é do time. Para pôr alguém, mova o cartão para
  dentro dela (\`ork banda\` diz as coordenadas da moldura, e \`ork mover\` leva o cartão); para tirar, mova
  para fora. O que está na tela é sempre a verdade.
- A corda continua sendo a permissão. A banda só poupa trabalho: ela gera as cordas por você.

## Trocar o agente de um cartão

\`\`\`
ork trocar "Revisor" codex          # o cartão fica, o agente muda
\`\`\`

O lugar, o nome, a função, as cordas, a banda e a árvore de código ficam; a conversa anterior não vem (é
outro agente), e a função do cartão é entregue de novo ao que entrou. **Só nos cartões que você abriu** —
nem no seu (isso encerraria você no meio deste comando), nem nos do usuário: trocar encerra um processo, e
ninguém encerra o trabalho de outro.

## Subir um time salvo: partituras

Uma **partitura** é um time guardado — os agentes com as funções e os comandos deles, os recados e as
cordas entre eles. Subir uma é a forma rápida de montar a mesa inteira em vez de abrir um cartão por vez:

\`\`\`
ork partitura                       # os times salvos, com quantos agentes e que funções
ork partitura usar "Time de revisão"   # sobe o time ao seu lado, já ligado a você
ork partitura salvar "Time de revisão" # guarda o que está no andar à mostra como partitura
ork partitura salvar "Dupla" "Main" "Revisor"   # ou só esses cartões
\`\`\`

- Os cartões que você sobe assim **são seus**: nascem ligados a você por corda e você pode fechá-los com
  \`ork fechar\`.
- **A pasta não é salva de propósito**: cada cartão abre na pasta do espaço (ou na da função). A partitura
  é o time, não o projeto — é por isso que o mesmo time serve em qualquer lugar.
- **O prompt vem da função de hoje**, não de uma cópia do dia em que se salvou. Função apagada depois:
  o cartão sobe com o nome do papel e sem primeiro pedido, e a resposta diz isso em vez de inventar.
- O time que **você** sobe fica **fora do desfazer** do usuário, como o \`ork abrir\`: são sessões vivas, e um
  Ctrl+Z não mata agente no meio do trabalho. Quem fecha é você, com \`ork fechar\`. (Mover, arrumar, renomear
  e anotar continuam entrando no desfazer: aquilo é arrumação, isto é gente trabalhando.)

## Instalar um time escrito em arquivos: catálogo

Um time costuma ser escrito **fora do app** — à mão, por outra sessão de agente, ou copiado de outro projeto.
Cada papel é um \`.md\` com cabeçalho e corpo; o corpo vira o prompt da função.

\`\`\`
---
nome: Revisor
motor: Codex
nivel: forte
---
Você é o Revisor. Revisa o que os construtores escreveram...
\`\`\`

\`\`\`bash
ork catalogo importar time     # lê as fichas .md da pasta e as transforma em funções
ork funcoes                    # confere o que entrou
ork abrir --funcao "Revisor"   # e o cartão nasce no motor e no nível da ficha
\`\`\`

- \`nome\` é obrigatório; \`motor\` (claude, codex ou shell), \`nivel\` (forte, médio, rápido) e \`pasta\` são opcionais.
- **Motor e nível viram preset.** O casamento é pelo nome do preset ("Claude forte"), e o relatório avisa quando
  não achou o nível pedido e caiu no primeiro daquele motor.
- **"Codex e Claude" faz dois assentos** — duas funções, uma por motor, com o motor no nome. É assim que se
  escreve um papel que existe duas vezes. Já "Shell com Claude" é descrição de um cartão só.
- **Importar de novo atualiza**, achando a função pelo nome; nada é apagado, porque a pasta pode ser um pedaço do
  time e não o time inteiro. Arquivo sem cabeçalho é pulado e aparece no relatório.
- Ficha de \`shell\` não leva prompt: shell não é agente, e o que fosse digitado viraria comando.

## Kanban do espaço: as tarefas

Cada espaço tem um kanban (a página Kanban no app). O item dele é **tarefa**, com número curto (\`#12\`): é por
ele que você fala dela. Cartão continua sendo o do agente no quadro.

\`\`\`
ork kanban                               # as tarefas por coluna, com quem trabalha em cada uma e se está livre
ork kanban ver 12                        # uma tarefa inteira: descrição, delegação e últimos comentários
ork kanban ver --para eu                 # só as em que você está (ou --para "Nome", --para ninguem, --etiqueta e)
ork kanban criar "Revisar o login" --para "Revisor" --etiqueta back --arquivo tarefa.md
ork kanban pegar 12                      # você entra na lista (cabem vários); de Demandas vai para Fazendo
ork kanban soltar 12                     # você sai da lista
ork kanban mover 12 "Revisão"            # coluna pelo nome, sem caixa nem acento
ork kanban comentar 12 "Feito o teste; falta o caso X"
ork kanban atribuir 12 "Testador"        # põe na lista e avisa (ninguem esvazia)
ork kanban apagar 12 --confirmar         # vai para a lixeira; a página recupera
\`\`\`

- **Colunas:** Demandas (do usuário: sem \`--coluna\`, a sua tarefa nasce em Fazendo), Com o Maestro (só o usuário
  põe ali: é delegar), Fazendo, Revisão, Feito. **Feito** é do usuário e do agente de função Maestro; os outros
  levam a Revisão e comentam o que fizeram.
- **Atribuir só avisa:** o agente recebe \`[ork · kanban] Tarefa #12 ... atribuída a você\` na caixa de entrada
  (quando estiver livre). Não é pedido de trabalho: quem pede trabalho continua sendo o \`ork pedir\`.
- Só o kanban do **seu** espaço; quem trabalha é agente Claude ou Codex (shell não pega tarefa).
- Descrição e comentário longos: \`--arquivo\`. Detalhe grande vai num arquivo do projeto, e a tarefa cita o caminho.

### Demandas do usuário (para o Maestro)

- A demanda chega como \`[ork · demanda #N do kanban]\`: o usuário a arrastou para Com o Maestro.
- Distribua com \`ork pedir\`/\`ork abrir\` pondo \`#N\` no pedido, e mande quem for trabalhar rodar \`ork kanban pegar N\` ao começar.
- Quem termina faz \`ork kanban comentar N "o que foi feito e onde"\` e depois \`ork kanban mover N Revisão\`.
- A resposta ao usuário é o kanban, não \`ork entregar\`.
- Feito: o app deixa você mover, mas quando pode é regra do seu time (a sua função); na dúvida, deixe em Revisão.

## Regras de convívio

- Só fala com quem está ligado a você por uma corda (o usuário desenha as cordas no quadro), ou com quem você mesmo
  abriu. Quem você abre no mesmo espaço já nasce ligado; em outro espaço não há corda, mas você continua falando com ele
  por ser o dono. Você só fecha as sessões que você mesmo abriu. Não há teto de quantas você abre: o freio é o do
  quadro (400 cartões no andar), então abra o que a tarefa pede e feche o que não serve mais.
- A corda é regra de convívio, não fronteira de segurança: todos os agentes rodam como o mesmo usuário do Windows.
- Não reenvie um pedido que ainda não respondeu e não interrompa quem está trabalhando (\`ctrl-c\`, \`esc\`) sem motivo.
- Dois agentes não editam o mesmo arquivo ao mesmo tempo: divida o trabalho por arquivo ou por pasta.
- **Responder de volta:** ao delegar algo longo, peça que o outro termine com
  \`ork pedir "<seu nome>" "<resultado ou caminho do arquivo>"\` (\`ork quem\` diz o seu nome). O resultado chega
  inteiro mesmo que a sua espera tenha acabado.
- **Windows:** redirecionar a saida do ork para arquivo no PowerShell estraga os acentos (ele decodifica a
  saida de programa nativo pela pagina de codigo OEM). Leia a resposta na tela, ou rode
  [Console]::OutputEncoding = [Text.Encoding]::UTF8 antes e grave com Out-File -Encoding utf8.
- Tudo o que vai pelo \`ork\` fica registrado no app.
`
