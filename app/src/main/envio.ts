/**
 * Decide se um pedido digitado **saiu** do campo de entrada (compositor) do agente depois do Enter.
 *
 * Por que não basta "a tela mudou" nem "está trabalhando": o eco da própria colagem e o redesenho do
 * compositor mexem na tela e renovam `ultimaSaida` mesmo quando o Enter foi engolido. Isso deu confirmação
 * falsa de envio.
 *
 * Por que a POSIÇÃO e não "o texto aparece nas últimas linhas": depois de enviado, o pedido continua na tela,
 * como histórico (eco `> texto`). O compositor fica sempre no pé da tela; o histórico sobe. Então:
 * mesmo lugar (a contar do pé) que antes do Enter = continua no compositor; sumiu = saiu; em outro lugar
 * = pode ser histórico ou o compositor que ganhou uma linha de rodapé — isso não é prova de nada.
 */

const LINHAS_OLHADAS = 12

/** Marcas que os agentes põem no lugar de uma colagem grande. */
const COLAGEM_RESUMIDA = /\[(pasted|colado|image)[^\]\n]*\]/i

const limpar = (t: string): string => t.replace(/[│║┃╭╮╰╯─]/g, ' ').replace(/\s+/g, ' ').trim()

/** Fim do pedido, em minúsculas e sem quebras: é o que mais provavelmente aparece inteiro numa linha. */
export function marcaDoPedido(texto: string): string {
  return limpar(texto).slice(-24).toLowerCase()
}

/**
 * Distância, contada a partir do pé da tela (0 = última linha com texto), da última linha que mostra o
 * pedido (o fim dele, ou a marca de colagem resumida). -1 se não aparece.
 */
export function distanciaDoPedido(tela: string, marca: string): number {
  const linhas = tela.split('\n').map((l) => limpar(l).toLowerCase()).filter(Boolean).slice(-LINHAS_OLHADAS)
  for (let i = linhas.length - 1; i >= 0; i--) {
    const achou = (marca.length >= 4 && linhas[i].includes(marca)) || COLAGEM_RESUMIDA.test(linhas[i])
    if (achou) return linhas.length - 1 - i
  }
  return -1
}

export type EvidenciaDeEnvio = 'saiu' | 'ficou' | 'indeterminado'

/**
 * - 'ficou': o pedido continua onde estava, no compositor. Nunca vira 'saiu', nem com agente "trabalhando".
 * - 'saiu': sumiu da tela; ou o agente passou a trabalhar agora sem o pedido continuar no lugar; ou apareceu
 *   uma pergunta nova e o pedido não continua no lugar.
 * - 'indeterminado': não dá para separar compositor de histórico. Não confirma, e quem chama não deve
 *   tratar como "não enviado" a ponto de mandar de novo.
 */
export function evidenciaDeEnvio(p: {
  texto: string
  antes: string
  depois: string
  ocupadoAntes: boolean
  ocupadoDepois: boolean
  perguntaNova: boolean
}): EvidenciaDeEnvio {
  const marca = marcaDoPedido(p.texto)
  const antes = distanciaDoPedido(p.antes, marca)
  const depois = distanciaDoPedido(p.depois, marca)

  if (depois === -1) {
    // Sumiu. Sem ter visto o pedido antes, só aceita se há outro sinal de que o agente o recebeu.
    if (antes !== -1) return 'saiu'
    return p.perguntaNova || (!p.ocupadoAntes && p.ocupadoDepois) ? 'saiu' : 'indeterminado'
  }
  // Ainda aparece. Se está onde estava no compositor, ficou, qualquer que seja o resto.
  if (antes !== -1 && depois === antes) return 'ficou'
  // Aparece em outro lugar, ou não foi visto antes: histórico ou compositor deslocado. Só o agente ter
  // começado a trabalhar agora (e não estar assim antes) é prova de que recebeu.
  if (!p.ocupadoAntes && p.ocupadoDepois && antes !== -1) return 'saiu'
  return 'indeterminado'
}

export type ResultadoDoEnvio = 'saiu' | 'ficou' | 'incerto'

export type DependenciasDoEnvio = {
  texto: string
  shell: boolean
  /** escreve a colagem no processo; só é chamada DEPOIS de a tela de referência ter sido lida */
  escreverColagem: () => void
  /** escreve o Enter no processo */
  escrever: (dados: string) => void
  /** últimas linhas da tela */
  tela: () => Promise<string>
  /** há um diálogo esperando resposta? */
  emPergunta: () => Promise<boolean>
  esperar: (ms: number) => Promise<void>
  ocupado: (tela: string) => boolean
  prazoDaColagemMs?: number
  prazoDoEnterMs?: number
}

/**
 * Escreve a colagem, espera ela aparecer, aperta Enter e confirma que o pedido saiu.
 * Sem sinal de que a colagem chegou, **não aperta Enter** (devolve 'ficou').
 */
export async function confirmarEnvio(d: DependenciasDoEnvio): Promise<ResultadoDoEnvio> {
  // A tela de referência vem ANTES de a colagem ser escrita: o PTY pode renderizar o texto antes da primeira
  // leitura, e aí "a tela mudou" nunca seria visto (e o Enter nunca iria).
  const antesDaColagem = await d.tela()
  d.escreverColagem()
  await d.esperar(120)
  let chegou = false
  for (const limite = Date.now() + (d.prazoDaColagemMs ?? 1500); Date.now() < limite; await d.esperar(100)) {
    if ((await d.tela()) !== antesDaColagem) {
      chegou = true
      break
    }
  }
  if (!chegou) return 'ficou'

  let ultima: ResultadoDoEnvio = 'incerto'
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const antes = await d.tela()
    const perguntavaAntes = await d.emPergunta()
    d.escrever('\r')
    ultima = 'incerto'
    for (const limite = Date.now() + (d.prazoDoEnterMs ?? 2000); Date.now() < limite; await d.esperar(100)) {
      const emPergunta = await d.emPergunta()
      const depois = await d.tela()
      // shell: responde na hora, então a tela mudar basta (o eco do comando é a prova)
      if (d.shell) {
        if (emPergunta || depois !== antes) return 'saiu'
        ultima = 'ficou'
        continue
      }
      const prova = evidenciaDeEnvio({
        texto: d.texto,
        antes,
        depois,
        ocupadoAntes: d.ocupado(antes),
        ocupadoDepois: d.ocupado(depois),
        perguntaNova: emPergunta && !perguntavaAntes
      })
      if (prova === 'saiu') return 'saiu'
      ultima = prova === 'ficou' ? 'ficou' : 'incerto'
    }
  }
  return ultima
}

/**
 * Resultado de uma rotina a partir do envio. `incerto` conta como `rodou`: o texto pode ter saído, e
 * `nao-enviou` faria a rotina repetir e duplicar o pedido. Só `ficou` (comprovadamente não saiu) é `nao-enviou`.
 * O `incerto` fica anotado no registro (ver `registroDoEnvio`).
 */
export function resultadoDaRotina(r: ResultadoDoEnvio): 'rodou' | 'nao-enviou' {
  return r === 'ficou' ? 'nao-enviou' : 'rodou'
}

/** O que anotar no registro depois de um envio sem usuário na linha (rotina, primeiro pedido de um cartão). */
export function registroDoEnvio(origem: 'rotina' | 'primeiro-pedido', r: ResultadoDoEnvio): { comando: string; alerta: string | null } {
  if (r === 'saiu') return { comando: origem, alerta: null }
  if (r === 'incerto') {
    return { comando: `${origem}-incerto`, alerta: `${origem}: não deu para confirmar o envio; pode ter saído, não repetir sem ver a tela` }
  }
  return { comando: `${origem}-nao-enviado`, alerta: `${origem}: o texto ficou escrito no campo de entrada e NÃO foi enviado` }
}
