import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Agente } from '../shared/modelo'
import { MAX_FICHAS, lerFicha, type FichaDeCatalogo } from '../shared/catalogo'
import type { PedidoNoQuadro } from '../shared/quadro/agente'
import { criarEspacoDoAgente, resumosDosEspacos } from './dados'
import { arquivoAcompanhado } from './codigo'
import { AJUDA } from './manual'
import { type NomeDeVerbo } from './verbos'
import { encerrarAgora, escreverNoProcesso, esperarSessao, sessoesCriadasPor, telaDe, type Sessao } from './terminais'
import { esperar, janelaDoEspaco, abrirJanelaPronta, pedirAJanela } from './quadroDoAgente'
import { situacao, contextoRestante, textoDoContexto, aguardarFim, aguardarPronto, recusarSeEmPergunta, digitarPedido, avisoDeEnvio, registrar, caixa, porNaCaixa, textoNaFila, quemRecebeDe, ligadosA, acharEntre, tempoDe, resultado, contaSessoes, descendentesDe, transferirSessoes } from './espera'

/**
 * A pasta que o agente pediu em `--pasta`, resolvida **a partir da pasta dele**.
 *
 * Antes era usada como veio, e um `--pasta mural` era procurado na pasta do app — não na do agente. Ele
 * recusou quatro vezes com "a pasta não existe: mural", com a pasta existindo ao lado de quem pediu
 * (visto em 10/11/2026). O agente trabalha dentro de uma pasta; caminho relativo dele é relativo a ela.
 */
function pastaPedida(eu: Sessao, pedida: unknown): string | undefined {
  if (typeof pedida !== 'string' || !pedida.trim()) return undefined
  const caminho = resolve(eu.espec.pasta, pedida.trim())
  if (!existsSync(caminho) || !statSync(caminho).isDirectory()) {
    throw new Error(`a pasta não existe: ${pedida} (procurei em ${caminho})`)
  }
  return caminho
}

const TECLAS: Record<string, string> = {
  enter: '\r',
  esc: '\x1b',
  tab: '\t',
  'shift-tab': '\x1b[Z',
  cima: '\x1b[A',
  up: '\x1b[A',
  baixo: '\x1b[B',
  down: '\x1b[B',
  direita: '\x1b[C',
  right: '\x1b[C',
  esquerda: '\x1b[D',
  left: '\x1b[D',
  'ctrl-c': '\x03',
  'ctrl-d': '\x04',
  backspace: '\x7f',
  espaco: ' ',
  space: ' '
}

export function agenteDe(texto: string | undefined): Agente | null {
  const t = (texto ?? '').toLowerCase()
  if (t === 'claude') return 'claude'
  if (t === 'codex') return 'codex'
  if (t === 'shell' || t === 'powershell') return 'shell'
  return null
}

/** O MSYS do Git Bash troca `/context` por `.../Programs/Git/context` antes de chamar o ork. */
export function desfazerConversaoDoGitBash(texto: string): string {
  const achou = texto.match(/^(?:[A-Za-z]:)?(?:[\\/][^\\/\r\n]+)*[\\/]Programs[\\/]Git[\\/]([^\\/\s]+)$/i)
  return achou ? `/${achou[1]}` : texto
}

export function espacoPorNome(nome: string | undefined) {
  if (!nome?.trim()) throw new Error('diga o nome do espaço (veja `ork espacos`)')
  const procurado = nome.trim().toLocaleLowerCase('pt-BR')
  const achados = resumosDosEspacos().filter((e) => e.nome.trim().toLocaleLowerCase('pt-BR') === procurado)
  if (achados.length === 1) return achados[0]
  if (achados.length > 1) throw new Error(`há mais de um espaço chamado "${nome}"; renomeie um deles pelo quadro`)
  throw new Error(`não existe espaço chamado "${nome}". Veja ork espacos.`)
}

export interface Pedido {
  cracha?: unknown
  /** Chave de usuário: um cliente MCP falando pelo cano (ver shared/chaves.ts). */
  chave?: unknown
  comando?: unknown
  posicionais?: unknown
  opcoes?: unknown
  texto?: unknown
}

export interface ResultadoDoComando {
  saida: string
  /** Só é executado depois que a resposta saiu pelo pipe do próprio terminal. */
  sair?: Sessao[]
}

interface ContextoDoVerbo {
  eu: Sessao
  pos: string[]
  opcoes: Record<string, string | number | true>
  texto: string
  cancelado: () => boolean
}

type HandlerDoVerbo = (ctx: ContextoDoVerbo) => Promise<ResultadoDoComando>

/** Opção numérica já validada pelo registro (faixa inclusive); ausente fica indefinida. */
const comoNumero = (valor: string | number | true | undefined): number | undefined => (typeof valor === 'number' ? valor : undefined)

/** Leva ao quadro o que o agente pediu. A janela dona do espaço é que aplica, e registra no desfazer. */
async function mexerNoQuadro(eu: Sessao, pedido: Omit<PedidoNoQuadro, 'eu' | 'onde'>): Promise<ResultadoDoComando> {
  await abrirJanelaPronta(eu.espacoId)
  const r = await pedirAJanela({ tipo: 'quadro', espacoId: eu.espacoId, id: eu.id, pedido })
  if (!r.ok) throw new Error(r.erro)
  return { saida: r.texto ?? 'Pronto.' }
}

/**
 * Um handler por verbo, com o nome vindo do registro: o `Record<NomeDeVerbo, …>` não compila se um verbo novo
 * entrar em `verbos.ts` e ninguém escrever o corpo dele. Argumentos e opções já chegam validados.
 */
export const HANDLERS: Record<NomeDeVerbo, HandlerDoVerbo> = {
  ajuda: async () => ({ saida: AJUDA }),

  espacos: async ({ eu }) => {
    const linhas = resumosDosEspacos().map((espaco) => {
      const meu = espaco.id === eu.espacoId ? ' · seu espaço' : ''
      return `${meu ? '*' : ' '} "${espaco.nome}" · ${janelaDoEspaco(espaco.id) ? 'janela aberta' : 'sem janela'} · ${espaco.terminais} cartões${meu}`
    })
    return { saida: linhas.join('\n') || 'Não há espaços.' }
  },

  janela: async ({ eu, pos, opcoes }) => {
    if (opcoes.novo) {
      const nome = typeof opcoes.novo === 'string' ? opcoes.novo.trim() : ''
      if (!nome) throw new Error('diga o nome: ork janela --novo "Nome" [--pasta P]')
      const pasta = pastaPedida(eu, opcoes.pasta) ?? eu.espec.pasta
      if (!(existsSync(pasta) && statSync(pasta).isDirectory())) throw new Error(`a pasta não existe: ${pasta}`)
      const espaco = criarEspacoDoAgente(nome, pasta)
      await abrirJanelaPronta(espaco.id)
      return { saida: `Criei o espaço "${espaco.nome}" e abri uma janela nele.` }
    }
    if (opcoes.pasta) throw new Error('`--pasta` só vale com `ork janela --novo "Nome"`')
    const espaco = espacoPorNome(pos[0])
    const { jaEstavaAberta } = await abrirJanelaPronta(espaco.id)
    return {
      saida: jaEstavaAberta
        ? `O espaço "${espaco.nome}" já estava aberto; trouxe a janela para a frente.`
        : `Abri uma janela no espaço "${espaco.nome}".`
    }
  },

  quem: async ({ eu }) => {
    const ligados = ligadosA(eu)
    const linhas = await Promise.all(
      ligados.map(
        async (s) =>
          `  "${s.espec.nome}" · ${s.espec.agente}${s.espec.funcao ? ` · função ${s.espec.funcao}` : ''} · ${await situacao(s)} · ${textoDoContexto(await contextoRestante(s))}${
            s.espec.criadoPor === eu.id ? ' · aberto por você' : ''
          }`
      )
    )
    const filhos = sessoesCriadasPor(eu.id).length
    return {
      saida: [
        `Você é "${eu.espec.nome}" (${eu.espec.agente})${eu.espec.funcao ? ` · função ${eu.espec.funcao}` : ''} · pasta ${eu.espec.pasta} · ${textoDoContexto(await contextoRestante(eu))}`,
        'Ligados a você:',
        ...(linhas.length ? linhas : ['  ninguém (o usuário liga cartões com uma corda; quem você abre continua acessível mesmo em outro espaço)']),
        `Você abriu ${contaSessoes(filhos)}.`
      ].join('\n')
    }
  },

  orcamento: async ({ eu, cancelado }) => ({ saida: textoDoContexto(await contextoRestante(eu, true, cancelado)) }),

  abrir: async ({ eu, pos, opcoes, texto, cancelado }) => {
    // o agente deixou de ser obrigatório na 1.2.5: com `--funcao`, quem diz o motor (e o nível) é o
    // preset da função. Dito à toa, continua valendo e mandando.
    const agente = agenteDe(pos[0])
    const funcaoPedida = typeof opcoes.funcao === 'string' ? opcoes.funcao.trim() : ''
    if (pos[0] && !agente) throw new Error(`não existe o agente "${pos[0]}"; use claude, codex ou shell`)
    if (!agente && !funcaoPedida && !opcoes.preset) {
      throw new Error('diga qual agente: ork abrir claude|codex|shell, ou use --funcao "Papel"')
    }
    const pasta = pastaPedida(eu, opcoes.pasta)
    const nome = typeof opcoes.nome === 'string' ? opcoes.nome.trim().slice(0, 80) || undefined : undefined
    const preset = typeof opcoes.preset === 'string' ? opcoes.preset.trim() || undefined : undefined
    const funcao = typeof opcoes.funcao === 'string' ? opcoes.funcao.trim() || undefined : undefined
    // o primeiro pedido pode vir do --pedido, da função, ou dos dois
    let pedidoInicial = texto
    const espaco = typeof opcoes.espaco === 'string' ? espacoPorNome(opcoes.espaco) : { id: eu.espacoId, nome: '' }
    let novo: Sessao | undefined
    {
      await abrirJanelaPronta(espaco.id)
      const r = await pedirAJanela({ tipo: 'abrir', espacoId: espaco.id, criador: eu.id, agente: agente ?? undefined, preset, nome, pasta, funcao })
      if (!r.ok) throw new Error(r.erro)
      // o prompt da função é o primeiro pedido; com --pedido junto, a função vem antes e o pedido depois
      if (r.texto) pedidoInicial = [r.texto, pedidoInicial].filter(Boolean).join('\n\n')
      novo = r.id ? await esperarSessao(r.id, 5000) : undefined
    }
    if (!novo) throw new Error('o cartão foi criado, mas o processo não abriu')
    registrar(eu, novo, 'abrir', pedidoInicial)
    const aberto =
      novo.espacoId === eu.espacoId
        ? `Abri "${novo.espec.nome}" (${agente}), ligado a você.`
        : `Abri "${novo.espec.nome}" (${agente}) no espaço "${espaco.nome}"; você pode falar com ele porque o abriu.`
    if (!pedidoInicial) return { saida: `${aberto} Mande o primeiro pedido com: ork pedir "${novo.espec.nome}" "…"` }
    const comecouEsperar = Date.now()
    const pronto = await aguardarPronto(novo, 90_000, cancelado)
    if (pronto !== 'pronto') {
      const motivo = {
        confirmar:
          'Ele parou numa pergunta (confiar na pasta? servidores MCP? atualização?). O pedido NÃO foi enviado: responda com `ork teclas` se for seguro, ou pergunte ao usuário, e depois use `ork pedir`.',
        desconhecido:
          'Ele parou numa tela que eu não sei ler (um aviso, um menu, uma versão nova do agente). O pedido NÃO foi enviado, de propósito: digitar em cima do que não reconheço já perdeu pedido antes. Veja com `ork ver`, resolva com `ork teclas` se for seguro, e mande com `ork pedir`.',
        tempo: `Ele não ficou pronto em ${Math.round((Date.now() - comecouEsperar) / 1000)} s; o pedido NÃO foi enviado. Veja com \`ork ver\` e use \`ork pedir\` depois.`,
        encerrado: 'O processo terminou antes de ficar pronto; o pedido NÃO foi enviado.',
        saiu: `O ${novo.espec.agente === 'codex' ? 'Codex' : 'Claude'} saiu e o cartão voltou ao PowerShell; o pedido NÃO foi enviado, e nenhum Enter foi apertado no shell. Veja com \`ork ver\` e abra o agente de novo.`
      }[pronto]
      return { saida: `${aberto}\n${motivo}\nTela agora:\n${await telaDe(novo, 30)}` }
    }
    // cartão recém-aberto: ninguém escreveu nele ainda, então o primeiro pedido vai direto, sem caixa
    const envio = await digitarPedido(novo, pedidoInicial)
    if (envio !== 'saiu') return { saida: `${aberto}\n${await avisoDeEnvio(novo, envio, 30)}` }
    // daqui em diante, se ele parar sem `ork entregar`, o app avisa você
    caixa.abrirPendencia(eu.id, novo.id)
    if (!opcoes.esperar || opcoes['sem-esperar']) {
      return {
        saida: `${aberto} Pedido enviado. Quando terminar, ele manda a entrega com \`ork entregar\`; se parar sem mandar, o Orkester avisa você aqui. Não precisa vigiar.`
      }
    }
    return { saida: `${aberto}\n${await resultado(novo, tempoDe(opcoes), cancelado, eu)}` }
  },

  pedir: async ({ eu, pos, opcoes, texto, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    if (!texto.trim()) throw new Error('falta o pedido: ork pedir <nome> "texto" (ou --arquivo pedido.md)')
    if (!alvo.processo) throw new Error(`"${alvo.espec.nome}" está encerrado`)
    await recusarSeEmPergunta(alvo)
    // num agente, o pedido entra na fila dele; num shell rodando um comando, cairia no meio desse comando
    // (com texto do usuário na linha, o shell também parece ocupado: aí não é comando rodando, e o pedido
    // espera na caixa até ele limpar a linha)
    const noShell = alvo.espec.agente === 'shell' ? await situacao(alvo) : null
    // só o texto ainda não enviado conta: tecla recente com Enter no fim é um comando que o usuário rodou,
    // e esse shell está mesmo ocupado
    const doUsuario = noShell === 'trabalhando' && alvo.usuario.rascunho > 0
    if (noShell === 'trabalhando' && !doUsuario) {
      throw new Error(`"${alvo.espec.nome}" está rodando um comando; espere terminar (\`ork esperar "${alvo.espec.nome}"\`) e mande de novo`)
    }
    registrar(eu, alvo, 'pedir', texto)
    // o pedido entra na caixa de entrada dele: só é digitado com ele livre e sem o usuário escrevendo nele
    const comeco = Date.now()
    const segundos = tempoDe(opcoes)
    const espera = opcoes['sem-esperar'] ? 10_000 : segundos * 1000
    const { fim, posicao, motivo } = await porNaCaixa(eu, alvo, 'pedido', texto, espera, cancelado)
    if (fim === null) return { saida: textoNaFila(alvo, posicao, motivo, 'pedido') }
    if (fim === 'sem-destino') throw new Error(`"${alvo.espec.nome}" foi encerrado antes de o pedido entrar; nada foi digitado`)
    if (fim === 'ficou' || fim === 'incerto') throw new Error(await avisoDeEnvio(alvo, fim === 'ficou' ? 'ficou' : 'incerto', 25))
    if (fim === 'cancelado') throw new Error('cancelado')
    if (opcoes['sem-esperar']) {
      return {
        saida: `Pedido enviado para "${alvo.espec.nome}". Quando terminar, ele manda a entrega com \`ork entregar\`; se parar sem mandar, o Orkester avisa você aqui.`
      }
    }
    const resto = Math.max(1, segundos - Math.round((Date.now() - comeco) / 1000))
    return { saida: await resultado(alvo, resto, cancelado, eu) }
  },

  entregar: async ({ eu, opcoes, texto, cancelado }) => {
    if (!texto.trim()) throw new Error('falta a entrega: ork entregar "texto" (ou --arquivo entrega.md)')
    const possiveis = quemRecebeDe(eu)
    let destino: Sessao | undefined
    if (typeof opcoes.para === 'string') {
      destino = acharEntre(possiveis, opcoes.para)
    } else {
      // sem --para: quem deu a tarefa (pela caixa) e, sem isso, quem abriu este cartão
      const quemPediu = caixa.pendenciaDe(eu.id)?.de ?? eu.espec.criadoPor
      destino = possiveis.find((s) => s.id === quemPediu)
    }
    if (!destino) {
      const nomes = possiveis.map((s) => `"${s.espec.nome}"`).join(', ') || 'ninguém'
      throw new Error(`não sei a quem entregar: ninguém te deu tarefa pelo ork e você não foi aberto por um agente. Use --para "Nome" (ao seu alcance: ${nomes})`)
    }
    if (!destino.processo) throw new Error(`"${destino.espec.nome}" está encerrado; a entrega não tem para onde ir. Deixe-a num arquivo e diga o caminho na tela.`)
    // entregou: o app não precisa mais avisar ninguém que você parou
    if (caixa.pendenciaDe(eu.id)?.de === destino.id) caixa.fecharPendencia(eu.id)
    registrar(eu, destino, 'entregar', texto)
    const { fim, posicao, motivo } = await porNaCaixa(eu, destino, 'entrega', texto, 8000, cancelado)
    if (fim === null) {
      return { saida: `${textoNaFila(destino, posicao, motivo, 'entrega')} Você pode encerrar o seu trabalho: não há recibo a esperar.` }
    }
    if (fim === 'entregue') return { saida: `Entrega feita a "${destino.espec.nome}". Não há recibo a esperar: o Orkester confirmou que ela entrou.` }
    if (fim === 'incerto') {
      return { saida: `A entrega foi digitada em "${destino.espec.nome}", mas não deu para confirmar que saiu do campo de entrada. NÃO mande de novo; se precisar, confira com \`ork ver "${destino.espec.nome}"\`.` }
    }
    if (fim === 'ficou') throw new Error(await avisoDeEnvio(destino, 'ficou', 25))
    throw new Error(`"${destino.espec.nome}" foi encerrado antes de a entrega entrar`)
  },

  esperar: async ({ eu, pos, opcoes, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    return { saida: await resultado(alvo, tempoDe(opcoes), cancelado, eu) }
  },

  ver: async ({ eu, pos, opcoes }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    const linhas = Math.min(2000, Math.max(1, Number(opcoes.linhas) || 50))
    return { saida: `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, linhas)}` }
  },

  teclas: async ({ eu, pos }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    const teclas = pos.slice(1)
    if (!teclas.length) throw new Error('quais teclas? ex.: ork teclas <nome> enter (veja `ork ajuda`)')
    const sequencias = teclas.map((t) => {
      const s = TECLAS[t.toLowerCase()] ?? (t.length === 1 ? t : null)
      if (s === null) throw new Error(`tecla desconhecida: ${t}`)
      return s
    })
    registrar(eu, alvo, 'teclas', teclas.join(' '))
    // respondeu à parada do agente: o próximo aviso dele volta a valer (no máximo um por parada)
    caixa.reabrirPendencia(eu.id, alvo.id)
    for (const s of sequencias) {
      escreverNoProcesso(alvo, s)
      await esperar(120)
    }
    await esperar(800)
    return { saida: `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, 30)}` }
  },

  limpar: async ({ eu, pos, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    if (!alvo.processo) throw new Error(`"${alvo.espec.nome}" está encerrado`)
    if ((await situacao(alvo)) === 'trabalhando') throw new Error(`"${alvo.espec.nome}" está trabalhando; espere terminar antes de limpar`)
    await recusarSeEmPergunta(alvo)
    registrar(eu, alvo, 'limpar')
    const comandoLimpar =
      alvo.espec.agente === 'claude' ? '/clear' : alvo.espec.agente === 'codex' ? '/new' : process.platform === 'win32' ? 'Clear-Host' : 'clear'
    escreverNoProcesso(alvo, comandoLimpar)
    await esperar(400)
    escreverNoProcesso(alvo, '\r')
    await aguardarFim(alvo, 15_000, cancelado)
    return { saida: `Contexto de "${alvo.espec.nome}" zerado.` }
  },

  /**
   * Os sete verbos com que o agente mexe no quadro. Todos vão pelo mesmo recado, porque quem decide o que
   * acontece é a janela dona do espaço (e lá isso entra no desfazer do usuário).
   */
  quadro: async ({ eu }) => mexerNoQuadro(eu, { acao: 'ler' }),

  mover: async ({ eu, pos, opcoes }) =>
    mexerNoQuadro(eu, {
      acao: 'mover',
      alvos: pos,
      x: comoNumero(opcoes.x),
      y: comoNumero(opcoes.y),
      dx: comoNumero(opcoes.dx),
      dy: comoNumero(opcoes.dy)
    }),

  arrumar: async ({ eu, pos, opcoes }) =>
    mexerNoQuadro(eu, { acao: 'arrumar', alvos: pos, colunas: comoNumero(opcoes.colunas), vao: comoNumero(opcoes.vao) }),

  ler: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'ler-cartao', alvos: [pos.join(' ')] }),

  apagar: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'apagar', alvos: pos }),

  nome: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'nome', alvos: pos.slice(0, 1), texto: pos.slice(1).join(' ') }),

  ligar: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'ligar', alvos: pos }),

  desligar: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'desligar', alvos: pos }),

  anotar: async ({ eu, pos, opcoes }) =>
    mexerNoQuadro(eu, { acao: 'anotar', texto: pos.join(' '), x: comoNumero(opcoes.x), y: comoNumero(opcoes.y) }),

  juntar: async ({ eu, pos, opcoes }) => mexerNoQuadro(eu, { acao: 'juntar', alvos: pos, soltar: opcoes.soltar === true }),

  /**
   * Troca o agente de um cartão **que ele abriu**: o cartão fica (lugar, nome, cordas, árvore de código) e o
   * agente muda. Só o que ele abriu, pela mesma razão do `ork fechar`: trocar encerra o processo, e ninguém
   * encerra o trabalho de outro — nem o seu próprio, que mataria o comando no meio.
   */
  trocar: async ({ eu, pos }) => {
    const agente = (pos[1] ?? '').toLowerCase()
    if (agente !== 'claude' && agente !== 'codex' && agente !== 'shell') {
      throw new Error('diga o agente: ork trocar <cartão> <claude|codex|shell>')
    }
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({ tipo: 'trocar', espacoId: eu.espacoId, id: eu.id, alvo: pos[0], agente })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Pronto.' }
  },

  /** Bandas: grupo de agentes como moldura no quadro. Quem sabe o que está dentro dela é a janela. */
  banda: async ({ eu, pos }) => {
    const pedida = (pos[0] ?? 'lista').toLowerCase()
    const acao = pedida === 'lista' ? 'lista' : pedida === 'criar' ? 'criar' : null
    if (!acao) throw new Error(`não conheço \`ork banda ${pos[0]}\`. Use: criar, ou nada para listar.`)
    const nome = (pos[1] ?? '').trim()
    if (acao === 'criar' && !nome) throw new Error('diga o nome: ork banda criar "Nome" <cartão>...')
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({ tipo: 'banda', espacoId: eu.espacoId, id: eu.id, acao, nome, alvos: pos.slice(2).filter(Boolean) })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Pronto.' }
  },

  /**
   * Partituras: times salvos. `usar` sobe o time ao lado de quem pediu, já ligado a ele; `salvar` guarda o
   * que está no quadro. Quem guarda as partituras é a janela, dona das preferências.
   */
  partitura: async ({ eu, pos }) => {
    const acoes = ['lista', 'usar', 'salvar'] as const
    const pedida = (pos[0] ?? 'lista').toLowerCase()
    const acao = acoes.find((a) => a === pedida)
    if (!acao) throw new Error(`não conheço \`ork partitura ${pos[0]}\`. Use: usar, salvar, ou nada para listar.`)
    const nome = (pos[1] ?? '').trim()
    if (acao !== 'lista' && !nome) throw new Error(`diga o nome: ork partitura ${acao} "Nome"`)
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({
      tipo: 'partitura',
      espacoId: eu.espacoId,
      id: eu.id,
      acao,
      nome,
      alvos: pos.slice(2).filter(Boolean)
    })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Pronto.' }
  },

  /** As funções (papéis) que o usuário guardou. Quem sabe quais existem é a janela, dona das preferências. */
  /**
   * Fichas de time (.md) viram funções. O time costuma ser escrito fora do app — à mão, por outra sessão
   * de agente, ou copiado de outro projeto — e até a 1.2.5 instalar isso só dava mexendo no arquivo de
   * preferências com o app fechado.
   *
   * Aqui só a leitura dos arquivos: a decisão do que cada ficha vira está em `shared/catalogo.ts`, e as
   * preferências são da janela, que faz a junção.
   */
  catalogo: async ({ eu, pos }) => {
    if (String(pos[0] ?? '').toLowerCase() !== 'importar') throw new Error('diga o que fazer: ork catalogo importar <pasta>')
    const pasta = pastaPedida(eu, pos[1])
    if (!pasta) throw new Error('diga a pasta das fichas: ork catalogo importar <pasta>')
    const { fichas, pulados } = lerFichasDaPasta(pasta)
    const r = await pedirAJanela({ tipo: 'catalogo', espacoId: eu.espacoId, id: eu.id, fichas })
    if (!r.ok) throw new Error(r.erro)
    const sobras = pulados.length ? ['', 'Arquivos pulados (sem cabeçalho de ficha):', ...pulados.map((p) => `  ${p}`)] : []
    return { saida: [r.texto ?? '', ...sobras].join(String.fromCharCode(10)).trim() }
  },

  funcoes: async ({ eu }) => {
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({ tipo: 'funcoes', espacoId: eu.espacoId })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Nenhuma função guardada.' }
  },

  /**
   * As árvores de código do próprio cartão. Servem para o agente separar os arquivos por frente de trabalho
   * e depois falar delas pelo nome ("leia os arquivos da árvore Backend").
   */
  arvore: async ({ eu, pos, opcoes }) => {
    const acoes = ['lista', 'nova', 'usar', 'mostrar', 'dar', 'desfazer'] as const
    const pedida = (pos[0] ?? 'lista').toLowerCase()
    const acao = acoes.find((a) => a === pedida)
    if (!acao) throw new Error(`não conheço \`ork arvore ${pos[0]}\`. Use: ${acoes.join(', ')}.`)
    const resto = pos.slice(1).filter(Boolean)
    const daOpcao = typeof opcoes.arvore === 'string' ? opcoes.arvore.trim() : ''
    // `dar` leva o nome de um agente, não de uma árvore: `ork arvore dar "Agente" <arquivo>...`
    if (acao === 'dar') {
      const paraQuem = (resto[0] ?? '').trim()
      const quais = resto.slice(1)
      if (!paraQuem || !quais.length) throw new Error('diga para quem e o quê: ork arvore dar "Agente" <arquivo>...')
      await abrirJanelaPronta(eu.espacoId)
      const entrega = await pedirAJanela({
        tipo: 'arvore',
        espacoId: eu.espacoId,
        id: eu.id,
        acao,
        nome: paraQuem,
        arquivos: quais.map((a) => resolve(eu.espec.pasta, a))
      })
      if (!entrega.ok) throw new Error(entrega.erro)
      return { saida: entrega.texto ?? 'Pronto.' }
    }
    const nome = acao === 'mostrar' ? daOpcao : resto.join(' ').trim() || daOpcao
    if ((acao === 'nova' || acao === 'usar' || acao === 'desfazer') && !nome) {
      throw new Error(`diga o nome: ork arvore ${acao} "Nome"`)
    }
    // os arquivos vão em caminho absoluto: a janela só mostra o que está numa pasta do quadro
    const arquivos = acao === 'mostrar' ? resto.map((a) => resolve(eu.espec.pasta, a)) : []
    if (acao === 'mostrar') {
      if (!arquivos.length) throw new Error('diga os arquivos: ork arvore mostrar <arquivo>... [--arvore "Nome"]')
      const sumido = arquivos.find((a) => !existsSync(a))
      if (sumido) throw new Error(`esse arquivo não existe: ${sumido}`)
      const ignorado = arquivos.find((a) => !arquivoAcompanhado(eu.espec.pasta, a))
      if (ignorado) {
        throw new Error(`o Orkester não mostra esse arquivo (segredo, binário, recado ou barrado por .orkignore): ${ignorado}`)
      }
    }
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({ tipo: 'arvore', espacoId: eu.espacoId, id: eu.id, acao, nome, arquivos })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Pronto.' }
  },

  fechar: async ({ eu, pos }) => {
    const meus = sessoesCriadasPor(eu.id)
    const alvo = acharEntre(meus, pos[0])
    const herdadas = sessoesCriadasPor(alvo.id)
    // Fechar não mata trabalho em andamento: os filhos passam para quem fechou, como numa passagem de bastão.
    await transferirSessoes(alvo, eu, herdadas)
    await abrirJanelaPronta(alvo.espacoId)
    const r = await pedirAJanela({ tipo: 'fechar', espacoId: alvo.espacoId, id: alvo.id })
    if (!r.ok) throw new Error(r.erro)
    registrar(eu, alvo, 'fechar')
    encerrarAgora(alvo.id)
    return {
      saida: herdadas.length
        ? `Fechei "${alvo.espec.nome}". ${herdadas.length === 1 ? 'A sessão' : `As ${herdadas.length} sessões`} que ela tinha aberto agora ${
            herdadas.length === 1 ? 'é sua' : 'são suas'
          }.`
        : `Fechei "${alvo.espec.nome}".`
    }
  },

  passar: async ({ eu, pos }) => {
    const sucessor = acharEntre(ligadosA(eu), pos[0])
    if (sucessor.id === eu.id) throw new Error('você não pode passar sessões para si mesmo')
    if (!sucessor.processo) throw new Error(`"${sucessor.espec.nome}" está encerrado; escolha uma sessão viva`)
    const transferidas = sessoesCriadasPor(eu.id).filter((s) => s.id !== sucessor.id)
    if (!transferidas.length) return { saida: `Não havia outras sessões para passar a "${sucessor.espec.nome}".` }
    await transferirSessoes(eu, sucessor, transferidas)
    registrar(eu, sucessor, 'passar', contaSessoes(transferidas.length))
    return { saida: `Passei ${contaSessoes(transferidas.length)} para "${sucessor.espec.nome}".` }
  },

  sair: async ({ eu, opcoes }) => {
    const minhas = sessoesCriadasPor(eu.id)
    if (minhas.length && !opcoes['com-as-minhas']) {
      throw new Error(
        `você ainda tem ${contaSessoes(minhas.length)} aberta${minhas.length === 1 ? '' : 's'}; use \`ork passar <nome>\` primeiro, ou \`ork sair --com-as-minhas\` para fechar todas junto`
      )
    }
    const motivo = typeof opcoes.motivo === 'string' ? opcoes.motivo : ''
    const comAsMinhas = opcoes['com-as-minhas'] ? descendentesDe(eu.id) : []
    registrar(eu, null, 'sair', motivo)
    return {
      saida: comAsMinhas.length
        ? `Vou fechar seu cartão e ${contaSessoes(comAsMinhas.length)} sua${comAsMinhas.length === 1 ? '' : 's'}.`
        : 'Vou fechar seu cartão.',
      sair: [...comAsMinhas, eu]
    }
  }
}

/**
 * As fichas de uma pasta. Usada pelo `ork catalogo importar` do agente e pelo do usuário (a chave): ler
 * arquivo é do processo principal, e ter duas cópias disto seria ter duas regras diferentes de qual
 * arquivo conta como ficha.
 */
export function lerFichasDaPasta(pasta: string): { fichas: FichaDeCatalogo[]; pulados: string[] } {
  if (!existsSync(pasta) || !statSync(pasta).isDirectory()) throw new Error(`a pasta não existe: ${pasta}`)
  const arquivos = readdirSync(pasta).filter((a) => a.toLowerCase().endsWith('.md')).sort()
  if (!arquivos.length) throw new Error(`não há nenhum .md em ${pasta}`)
  if (arquivos.length > MAX_FICHAS) throw new Error(`${arquivos.length} arquivos .md em ${pasta}; o teto é ${MAX_FICHAS}`)
  const fichas: FichaDeCatalogo[] = []
  const pulados: string[] = []
  for (const arquivo of arquivos) {
    let bruto: string
    try {
      bruto = readFileSync(join(pasta, arquivo), 'utf8')
    } catch (erro) {
      pulados.push(`${arquivo}: não deu para ler (${erro instanceof Error ? erro.message : erro})`)
      continue
    }
    const lida = lerFicha(arquivo, bruto)
    if ('erro' in lida) pulados.push(lida.erro)
    else fichas.push(lida.ficha)
  }
  if (!fichas.length) {
    throw new Error([`nenhuma ficha válida em ${pasta}`, ...pulados.map((p) => `  ${p}`)].join(String.fromCharCode(10)))
  }
  return { fichas, pulados }
}
