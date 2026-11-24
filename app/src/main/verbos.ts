/** Registro puro do protocolo do ork: pode ser usado pelo main, pelo CLI e pelas provas sem Electron. */
type TipoDeOpcao = 'texto' | 'numero' | 'bandeira'

interface ArgumentoDoVerbo {
  nome: string
  obrigatorio?: boolean
  resto?: boolean
}

interface OpcaoDoVerbo {
  nome: string
  tipo: TipoDeOpcao
  minimo?: number
  maximo?: number
}

export interface Verbo {
  nome: string
  aliases: string[]
  posicionais: ArgumentoDoVerbo[]
  opcoes: OpcaoDoVerbo[]
  descricao: string
  /** Bloco já alinhado para preservar a ajuda existente palavra por palavra. */
  ajuda: string
}

const texto = (nome: string): OpcaoDoVerbo => ({ nome, tipo: 'texto' })
const numero = (nome: string, minimo: number, maximo: number): OpcaoDoVerbo => ({ nome, tipo: 'numero', minimo, maximo })
const bandeira = (nome: string): OpcaoDoVerbo => ({ nome, tipo: 'bandeira' })
/** Coordenada do quadro: cabe folgado o maior quadro que alguém arruma à mão, e nada de infinito. */
const lugar = (nome: string): OpcaoDoVerbo => numero(nome, -1_000_000, 1_000_000)
const obrigatorio = (nome: string): ArgumentoDoVerbo => ({ nome, obrigatorio: true })

export const VERBOS = [
  { nome: 'ajuda', aliases: ['help'], posicionais: [{ nome: 'comando' }], opcoes: [], descricao: 'mostra esta ajuda (ou só a de um comando)', ajuda: '' },
  { nome: 'quem', aliases: [], posicionais: [], opcoes: [], descricao: 'quem é você, seus ligados e o último contexto conhecido', ajuda: '  ork quem                           quem é você, seus ligados e o último contexto conhecido' },
  { nome: 'orcamento', aliases: [], posicionais: [], opcoes: [], descricao: 'mede o contexto do Claude livre; Codex declara que não expõe', ajuda: '  ork orcamento                      mede o contexto do Claude livre; Codex declara que não expõe' },
  { nome: 'espacos', aliases: [], posicionais: [], opcoes: [], descricao: 'lista todos os espaços, janela, cartões e marca o seu', ajuda: '  ork espacos                        lista todos os espaços, janela, cartões e marca o seu' },
  {
    nome: 'janela', aliases: [], posicionais: [{ nome: 'nome do espaço' }], opcoes: [texto('novo'), texto('pasta')],
    descricao: 'abre o espaço numa janela (ou traz a que já está aberta)',
    ajuda: '  ork janela <nome do espaço>        abre o espaço numa janela (ou traz a que já está aberta)\n  ork janela --novo "Nome" [--pasta P]\n                                       cria um espaço e abre uma janela nele'
  },
  {
    nome: 'abrir', aliases: [], posicionais: [{ nome: 'claude|codex|shell' }],
    // `--sem-esperar` é o normal aqui (o `abrir` só espera com `--esperar`), mas existe porque é assim que
    // se diz no `ork pedir`: o agente que aprendeu lá escreve igual aqui, e recusar por isso é pedantismo
    opcoes: [texto('espaco'), texto('nome'), texto('pasta'), texto('funcao'), texto('preset'), texto('modelo'), texto('esforco'), texto('pedido'), texto('arquivo'), texto('tarefa'), bandeira('esperar'), bandeira('sem-esperar'), numero('tempo', 1, 3600)],
    descricao: 'abre uma sessão nova; em outro espaço, você continua sendo o dono',
    ajuda: '  ork abrir [claude|codex|shell] [--espaco "Nome"] [--nome N] [--pasta P] [--funcao "Papel"] [--preset "Claude Code"] [--modelo opus] [--esforco high] [--pedido "texto" | --arquivo pedido.md] [--tarefa N] [--esperar] [--tempo S]\n                                       abre uma sessão nova; com --funcao, o motor, o modelo e o esforço saem da função;\n                                       --modelo/--esforco mandam sobre ela (veja `ork modelos`); --tarefa N põe o agente\n                                       trabalhando na tarefa #N do kanban do seu espaço e cita a tarefa no pedido'
  },
  {
    nome: 'pedir', aliases: [], posicionais: [obrigatorio('nome'), { nome: 'texto', resto: true }],
    opcoes: [texto('arquivo'), texto('tarefa'), bandeira('sem-esperar'), numero('tempo', 1, 3600)],
    descricao: 'manda um pedido e espera ele terminar (devolve a tela)',
    ajuda: '  ork pedir <nome> "texto" | --arquivo pedido.md [--tarefa N] [--sem-esperar] [--tempo S]\n                                      manda um pedido e espera ele terminar (devolve a tela); o pedido\n                                      entra na caixa de entrada dele e só é digitado com ele livre;\n                                      --tarefa N põe ele trabalhando na tarefa #N do kanban e cita a tarefa no pedido'
  },
  {
    nome: 'entregar', aliases: ['responder', 'devolver'], posicionais: [{ nome: 'texto', resto: true }],
    opcoes: [texto('arquivo'), texto('para')],
    descricao: 'manda o resultado a quem te deu a tarefa (entra na caixa de entrada dele)',
    ajuda: '  ork entregar "texto" | --arquivo entrega.md [--para "Nome"]\n                                      manda o resultado a quem te deu a tarefa (ou a quem te abriu);\n                                      entra na caixa de entrada dele, sem recibo a esperar'
  },
  { nome: 'esperar', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [numero('tempo', 1, 3600)], descricao: 'espera terminar o que está fazendo', ajuda: '  ork esperar <nome> [--tempo S]     espera terminar o que está fazendo' },
  { nome: 'ver', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [numero('linhas', 1, 2000)], descricao: 'lê a tela sem mandar nada', ajuda: '  ork ver <nome> [--linhas N]        lê a tela sem mandar nada' },
  { nome: 'teclas', aliases: [], posicionais: [obrigatorio('nome'), { nome: 'tecla', obrigatorio: true, resto: true }], opcoes: [], descricao: 'envia teclas nomeadas ao cartão', ajuda: '  ork teclas <nome> <tecla>...       enter, esc, tab, shift-tab, cima, baixo, esquerda, direita, ctrl-c, espaco, 1, 2, y, n…' },
  {
    nome: 'arvore', aliases: ['arvores'], posicionais: [{ nome: 'nova|usar|mostrar|dar|desfazer' }, { nome: 'nome ou arquivos', resto: true }],
    opcoes: [texto('arvore')],
    descricao: 'as árvores de código do seu cartão: separe os arquivos por assunto',
    ajuda: '  ork arvore                         lista as árvores de código do seu cartão (e qual está em uso)\n  ork arvore nova "Nome"             cria uma árvore e passa a usá-la para os próximos arquivos\n  ork arvore usar "Nome"             passa a usar uma árvore que já existe\n  ork arvore mostrar <arquivo>... [--arvore "Nome"]\n                                      abre esses arquivos como cartões na árvore\n  ork arvore dar "Agente" <arquivo>...\n                                      entrega esses cartões de código para outro agente do quadro\n  ork arvore desfazer "Nome"         desfaz a árvore; os arquivos dela voltam para a principal'
  },
  { nome: 'quadro', aliases: [], posicionais: [], opcoes: [], descricao: 'lê o quadro: cada cartão com número, nome, lugar e tamanho, e as cordas', ajuda: '  ork quadro                         lê o quadro: cada cartão com número, nome, lugar e tamanho, e as cordas' },
  { nome: 'ler', aliases: [], posicionais: [{ nome: 'cartão', obrigatorio: true, resto: true }], opcoes: [], descricao: 'lê um cartão inteiro (a anotação que o quadro mostra cortada)', ajuda: '  ork ler <cartão>                   lê um cartão inteiro: a anotação que o `ork quadro` mostra cortada' },
  { nome: 'apagar', aliases: [], posicionais: [{ nome: 'cartão', obrigatorio: true, resto: true }], opcoes: [], descricao: 'apaga cartões sem processo (anotação, post-it, banda…); Ctrl+Z desfaz', ajuda: '  ork apagar <cartão>...             apaga cartões sem processo (anotação, post-it, banda…); agente é `ork fechar`' },
  {
    nome: 'mover', aliases: [], posicionais: [{ nome: 'cartão', obrigatorio: true, resto: true }],
    opcoes: [lugar('x'), lugar('y'), lugar('dx'), lugar('dy')],
    descricao: 'põe cartões num lugar (--x/--y) ou anda com eles (--dx/--dy)',
    ajuda: '  ork mover <cartão>... [--x N --y N] [--dx N --dy N]\n                                      põe cartões num lugar, ou anda com eles de onde estão'
  },
  {
    nome: 'arrumar', aliases: [], posicionais: [{ nome: 'cartão', resto: true }],
    opcoes: [numero('colunas', 1, 12), numero('vao', 0, 400)],
    descricao: 'põe os cartões em grade, sem sair do canto onde já estavam',
    ajuda: '  ork arrumar [cartão]... [--colunas N] [--vao N]\n                                      põe os cartões (ou só esses) em grade, a partir do canto onde já estavam'
  },
  {
    nome: 'nome', aliases: [], posicionais: [obrigatorio('cartão'), { nome: 'nome novo', obrigatorio: true, resto: true }], opcoes: [],
    descricao: 'renomeia um cartão de agente (o nome é como todos falam dele)',
    ajuda: '  ork nome <cartão> "Nome novo"      renomeia um cartão de agente; é o nome que o `ork` passa a usar'
  },
  { nome: 'ligar', aliases: [], posicionais: [obrigatorio('cartão'), obrigatorio('cartão')], opcoes: [], descricao: 'desenha a corda entre dois agentes (eles passam a poder se falar)', ajuda: '  ork ligar <cartão> <cartão>        desenha a corda entre dois agentes: eles passam a poder se falar' },
  { nome: 'desligar', aliases: [], posicionais: [obrigatorio('cartão'), obrigatorio('cartão')], opcoes: [], descricao: 'tira a corda entre dois agentes', ajuda: '  ork desligar <cartão> <cartão>     tira a corda entre dois agentes' },
  {
    nome: 'anotar', aliases: [], posicionais: [{ nome: 'texto', obrigatorio: true, resto: true }], opcoes: [lugar('x'), lugar('y')],
    descricao: 'escreve um texto no quadro, abaixo do seu cartão',
    ajuda: '  ork anotar "texto" [--x N --y N]   escreve um texto no quadro (abaixo do seu cartão, se você não disser onde)'
  },
  {
    nome: 'juntar', aliases: [], posicionais: [{ nome: 'cartão', obrigatorio: true, resto: true }], opcoes: [bandeira('soltar')],
    descricao: 'agrupa cartões (andam juntos); --soltar desfaz',
    ajuda: '  ork juntar <cartão>... [--soltar]  agrupa cartões para andarem juntos no quadro; --soltar desfaz o grupo'
  },
  {
    nome: 'trocar', aliases: [], posicionais: [obrigatorio('cartão'), obrigatorio('claude|codex|shell')], opcoes: [],
    descricao: 'troca o agente de um cartão que você abriu (o cartão fica, o agente muda)',
    ajuda: '  ork trocar <cartão> <claude|codex|shell>\n                                      troca o agente de um cartão que você abriu: lugar, nome e cordas ficam'
  },
  {
    nome: 'banda', aliases: ['bandas'], posicionais: [{ nome: 'criar' }, { nome: 'nome' }, { nome: 'cartão', resto: true }], opcoes: [],
    descricao: 'bandas (grupos de agentes): quem está dentro da moldura fala com todos os de dentro',
    ajuda: '  ork banda                          lista as bandas do andar, com quem está dentro de cada uma\n  ork banda criar "Nome" <cartão>...  põe uma moldura em volta desses agentes: todos passam a se falar'
  },
  {
    nome: 'partitura', aliases: ['partituras'], posicionais: [{ nome: 'usar|salvar' }, { nome: 'nome' }, { nome: 'cartão', resto: true }], opcoes: [],
    descricao: 'times salvos: lista, sobe um time no quadro ou guarda o que está nele',
    ajuda: '  ork partitura                      lista os times salvos (agentes, funções, cordas e recados)\n  ork partitura usar "Nome"          sobe esse time ao seu lado, ligado a você\n  ork partitura salvar "Nome" [cartão]...\n                                      guarda como partitura os cartões (ou o andar à mostra todo)'
  },
  {
    // `--espaco` é declarado só para o agente ouvir um "não" claro (ele só mexe no kanban do próprio espaço);
    // pela chave de usuário ele sai antes da validação e escolhe o espaço, como nos outros verbos
    nome: 'kanban', aliases: [], posicionais: [{ nome: 'ver|criar|mover|editar|atribuir|pegar|soltar|comentar|apagar|coluna' }, { nome: 'argumentos', resto: true }],
    opcoes: [texto('coluna'), texto('para'), texto('etiqueta'), texto('titulo'), texto('descricao'), texto('arquivo'), texto('posicao'), bandeira('confirmar'), texto('espaco')],
    descricao: 'as tarefas do espaço: ver, criar, pegar, soltar, mover, comentar',
    ajuda:
      '  ork kanban [ver] [--coluna C] [--para Nome|eu|ninguem] [--etiqueta e]\n                                      as tarefas do espaço, por coluna, com quem trabalha em cada uma\n                                      (`ork kanban ver 12` mostra uma inteira; --para: quem está nela)\n' +
      '  ork kanban criar "Título" [--descricao T | --arquivo f.md] [--coluna C] [--para Nome] [--etiqueta a,b]\n                                      sem --coluna, nasce em Fazendo (Demandas é do usuário)\n' +
      '  ork kanban pegar <n>                         você entra na lista de quem trabalha nela; de Demandas ou\n                                      Com o Maestro ela vai para Fazendo, senão fica onde está\n' +
      '  ork kanban soltar <n> [Nome]                 você sai da lista (tirar outro: só o Maestro e o usuário)\n' +
      '  ork kanban mover <n> "Coluna" [--posicao topo|fim|N]\n                                      Com o Maestro é do usuário; Feito, do usuário e do Maestro\n' +
      '  ork kanban editar <n> [--titulo T] [--descricao T | --arquivo f.md] [--etiqueta +a,-b]\n' +
      '  ork kanban atribuir <n> Nome|eu|ninguem      põe na lista e avisa o agente na caixa dele (ninguem esvazia)\n' +
      '  ork kanban comentar <n> "texto" | --arquivo f.md\n' +
      '  ork kanban apagar <n> --confirmar            vai para a lixeira (a página recupera)\n' +
      '  ork kanban coluna criar "Nome" | renomear "Velho" "Novo" | apagar "Nome"'
  },
  {
    // `--espaco` é declarado só para o agente ouvir um "não" claro; pela chave ele sai antes da validação
    nome: 'fluxo', aliases: ['fluxos'], posicionais: [{ nome: 'listar|ver|criar|editar|ligar|desligar|rodar|execucoes|apagar' }, { nome: 'nome', resto: true }],
    opcoes: [texto('arquivo'), texto('pasta'), bandeira('json'), bandeira('confirmar'), numero('n', 1, 50), texto('espaco')],
    descricao: 'os fluxos do espaço: ver, criar, editar, ligar, rodar',
    ajuda:
      '  ork fluxo [listar]                   os fluxos do espaço: ligado ou não, gatilhos, a última execução\n' +
      '  ork fluxo ver "Nome" [--json]        um fluxo inteiro: nós e ligações (--json: o formato de criar e editar)\n' +
      '  ork fluxo criar --arquivo f.json [--pasta "P"]\n                                      cria desligado; o nome vai no JSON\n' +
      '  ork fluxo editar "Nome" --arquivo f.json\n                                      troca nome, nós e ligações (com Código, HTTP ou comando, desliga)\n' +
      '  ork fluxo ligar|desligar "Nome"      com Código, HTTP ou comando, só o usuário liga, pela página\n' +
      '  ork fluxo rodar "Nome"               roda agora pelo gatilho Manual e mostra cada nó\n' +
      '  ork fluxo execucoes "Nome" [--n 10]  as últimas execuções\n' +
      '  ork fluxo apagar "Nome" --confirmar  apaga o fluxo e as execuções dele'
  },
  {
    nome: 'pagina', aliases: ['página'], posicionais: [obrigatorio('responder'), obrigatorio('página'), { nome: 'texto', resto: true }],
    opcoes: [texto('arquivo')],
    descricao: 'responde a uma página "+" ligada ao seu cartão',
    ajuda: '  ork pagina responder "<página>" "texto" | --arquivo resposta.md\n                                      responde a uma página "+" ligada ao seu cartão (aberta: chega na hora;\n                                      fechada: fica guardada até ela abrir)'
  },
  { nome: 'modelos', aliases: [], posicionais: [], opcoes: [texto('espaco')], descricao: 'lista os modelos de cada motor, com os esforços que aceitam', ajuda: '  ork modelos                        lista os modelos de Claude e Codex, os esforços de cada um e os padrões; use em `ork abrir --modelo X --esforco Y`' },
  {
    nome: 'modelo', aliases: [], posicionais: [obrigatorio('cartão'), { nome: 'modelo' }], opcoes: [texto('esforco'), texto('espaco')],
    descricao: 'troca o modelo e/ou o esforço de um cartão livre, mantendo a conversa',
    ajuda: '  ork modelo <cartão> [<modelo>] [--esforco nível]\n                                      troca o modelo e/ou o esforço de um cartão que você abriu (só com ele livre);\n                                      o cartão reabre e a conversa continua'
  },
  { nome: 'funcoes', aliases: ['funcao'], posicionais: [], opcoes: [], descricao: 'lista as funções (papéis) que o usuário guardou', ajuda: '  ork funcoes                        lista as funções (papéis) guardadas, para usar em `ork abrir --funcao`' },
  {
    nome: 'catalogo', aliases: ['catálogo'], posicionais: [obrigatorio('importar'), { nome: 'pasta' }], opcoes: [],
    descricao: 'transforma as fichas de um time (.md) em funções',
    ajuda: '  ork catalogo importar <pasta>      lê as fichas .md da pasta (nome, motor, nível, pasta no cabeçalho)\n                                       e as transforma em funções, criando as novas e atualizando as que já existem'
  },
  { nome: 'limpar', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [], descricao: 'zera o contexto da sessão', ajuda: '  ork limpar <nome>                  zera o contexto da sessão (/clear no Claude, /new no Codex)' },
  { nome: 'fechar', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [], descricao: 'fecha uma sessão que você abriu', ajuda: '  ork fechar <nome>                  fecha uma sessão que você abriu; o que ela abriu passa para você' },
  {
    nome: 'passar', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [],
    descricao: 'passa o seu papel ao sucessor vivo: sessões que você abriu, cordas e caixa de entrada',
    ajuda: '  ork passar <nome>                  passa o seu papel ao sucessor vivo (aberto por você ou ligado): as sessões que\n                                      abriu, todas as suas cordas, os recados parados na sua caixa e as entregas que\n                                      esperava (sem --para, elas chegam a ele). Vale mesmo sem filhos; falhou, nada muda.\n                                      Só dentro do seu espaço: sucessor ou sessão sua em outro espaço é recusado'
  },
  {
    nome: 'sair', aliases: [], posicionais: [], opcoes: [texto('motivo'), bandeira('com-as-minhas')],
    descricao: 'fecha seu cartão; com as minhas, fecha toda a árvore de sessões que você abriu',
    ajuda: '  ork sair [--motivo "texto"] [--com-as-minhas]\n                                      fecha seu cartão; com as minhas, fecha toda a árvore de sessões que você abriu'
  }
]  as const satisfies readonly Verbo[]

/** O nome de cada verbo como tipo: o Record de handlers nao compila se faltar um. */
export type NomeDeVerbo = (typeof VERBOS)[number]["nome"]

export function verboPorNome(nome: string): Verbo | undefined {
  const normalizado = nome.toLowerCase()
  return VERBOS.find((verbo) => verbo.nome === normalizado || (verbo.aliases as readonly string[]).includes(normalizado))
}

export function opcaoExigeValor(comando: string, opcao: string): boolean {
  const verbo = verboPorNome(comando)
  return verbo?.opcoes.find((x) => x.nome === opcao)?.tipo !== 'bandeira'
}

interface ChamadaValidada {
  verbo: Verbo
  posicionais: string[]
  opcoes: Record<string, string | number | true>
}

/** Valida a parte estrutural do protocolo sem mexer em texto livre nem em processos. */
export function validarChamada(comando: string, posicionais: string[], opcoes: Record<string, unknown>): ChamadaValidada {
  const verbo = verboPorNome(comando)
  if (!verbo) throw new Error(`comando desconhecido: ${comando}. Veja \`ork ajuda\`.`)

  const pos = posicionais.filter((valor): valor is string => typeof valor === 'string')
  let indice = 0
  for (const argumento of verbo.posicionais) {
    if (argumento.resto) {
      if (argumento.obrigatorio && indice >= pos.length) throw new Error(`falta ${argumento.nome}: ork ${verbo.nome} ${verbo.posicionais.map((x) => `<${x.nome}>`).join(' ')}`)
      indice = pos.length
      break
    }
    if (argumento.obrigatorio && indice >= pos.length) throw new Error(`falta ${argumento.nome}: ork ${verbo.nome} ${verbo.posicionais.map((x) => `<${x.nome}>`).join(' ')}`)
    if (indice < pos.length) indice++
  }
  if (indice < pos.length) throw new Error(`argumento a mais: ${pos[indice]}. Veja \`ork ajuda\`.`)

  const validas = new Map(verbo.opcoes.map((opcao) => [opcao.nome, opcao]))
  const resultado: Record<string, string | number | true> = {}
  for (const [nome, valor] of Object.entries(opcoes)) {
    const opcao = validas.get(nome)
    if (!opcao) throw new Error(`opção desconhecida: --${nome}. Veja \`ork ajuda\`.`)
    if (opcao.tipo === 'bandeira') {
      if (valor !== true) throw new Error(`--${nome} não recebe valor`)
      resultado[nome] = true
      continue
    }
    if (typeof valor !== 'string' || !valor.trim()) throw new Error(`falta o valor de --${nome}`)
    if (opcao.tipo === 'texto') {
      resultado[nome] = valor
      continue
    }
    const numeroLido = Number(valor)
    if (!Number.isFinite(numeroLido) || numeroLido < opcao.minimo! || numeroLido > opcao.maximo!) {
      throw new Error(`--${nome} deve ser um número entre ${opcao.minimo} e ${opcao.maximo}`)
    }
    resultado[nome] = numeroLido
  }
  return { verbo, posicionais: pos, opcoes: resultado }
}

export function tabelaDeComandos(): string {
  return VERBOS.filter((verbo) => verbo.ajuda).map((verbo) => verbo.ajuda).join('\n')
}
