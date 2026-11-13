import { type ArvoreDeCodigo, type No, type NoCodigo, type NoTerminal } from '../../../shared/modelo'
import { proximoZ } from '../../../shared/quadro/geometria'
import { type Posicoes } from './arranjo'
import { arrumarArvores, arrumarColuna } from './arvores'
import { acharNo, agora, novoId } from './nos'
import { estado, mudarPlano, ouvintes, pastaDoPlano, planoAtual, planoDe, registrarHistorico } from './nucleo'

/** Muda um cartão de terminal em qualquer plano (térreo ou andar), fora do desfazer. */
// ---------- cartão de código que nasce sozinho ----------

/** Pastas de agente vigiadas agora, com a função que desliga cada uma. */
const vigiasDeCodigo = new Map<string, () => void>()
/** Uma gravação em rajada não deve criar dois cartões: a criação é uma por vez. */
let criandoCodigo = false

/**
 * Pastas que o processo principal recusou vigiar (a do usuário, raiz de disco, pasta de sistema). Guardado
 * aqui para o menu do agente poder dizer por que o cartão de código não nasce sozinho ali — sem isto, a
 * funcionalidade some em silêncio e parece defeito.
 */
const vigiavelPorPasta = new Map<string, boolean>()

/** `undefined` enquanto a resposta não chegou. */
export const pastaEhVigiavel = (pasta: string): boolean | undefined => vigiavelPorPasta.get(pasta)

function conferirSeVigiavel(pasta: string): void {
  if (vigiavelPorPasta.has(pasta)) return
  void window.ork.codigo.vigiavel(pasta).then((pode) => {
    if (vigiavelPorPasta.get(pasta) === pode) return
    vigiavelPorPasta.set(pasta, pode)
    ouvintes.forEach((o) => o()) // o menu do agente mostra o motivo; nada no quadro mudou
  })
}

/**
 * Vigia a pasta de cada agente do plano à mostra. É o que faz o cartão de código aparecer sozinho — sem
 * isso, só havia vigia quando já existia um cartão, e o primeiro nunca nascia.
 */
export function ajustarVigiasDeCodigo(): void {
  const e = estado.espaco
  const pastas = new Set<string>()
  if (e) {
    for (const n of planoDe(e).nos) if (n.tipo === 'terminal') pastas.add(n.pasta || pastaDoPlano(e))
  }
  // pasta grande demais (a do usuário, a raiz de um disco) não é vigiada: quem recusa é o processo principal,
  // que conhece a pasta do usuário (ver pastaVigiavel em shared/arquivos.ts). A assinatura é feita do mesmo
  // jeito e não chega aviso nenhum; a resposta do conferir é só para o menu poder dizer o motivo.
  for (const pasta of pastas) conferirSeVigiavel(pasta)
  for (const [pasta, desligar] of [...vigiasDeCodigo]) {
    if (pastas.has(pasta)) continue
    desligar()
    vigiasDeCodigo.delete(pasta)
  }
  for (const pasta of pastas) {
    if (vigiasDeCodigo.has(pasta)) continue
    // arquivo que sumiu não abre cartão: só faz o cartão daquele arquivo reler (ver nos/Codigo.tsx)
    vigiasDeCodigo.set(pasta, window.ork.codigo.vigiar(pasta, (m) => !m.sumiu && void aoGravaremNaPasta(pasta, m.caminho)))
  }
}

/** Tamanho de um cartão de código aberto, e do bloquinho quando ele está recolhido. */
export const ABERTO = { largura: 620, altura: 460 }
export const BLOQUINHO = { largura: 300, altura: 30 }
/** Espaço entre o agente e a coluna dele. A bolinha das ligações (ver CamadaVinculos) mora no meio dele. */
const DISTANCIA = 96
/** Quantos arquivos de um agente ficam em cada árvore. Passando disso, os mais velhos saem. */
export const MAX_NA_COLUNA = 12
/** A árvore que todo agente tem desde sempre; as outras ele cria. */
export const ARVORE_PRINCIPAL = 'principal'
/** Espaço entre o fim de uma árvore e o começo da próxima. */
export const ENTRE_ARVORES = 60

/** As árvores de um agente, sempre começando pela principal. */
export function arvoresDoTerminal(terminal: NoTerminal): ArvoreDeCodigo[] {
  const lista = terminal.arvores ?? []
  // a principal não mora na lista (ela existe desde sempre); só o nome dela, quando o usuário dá um
  const principal = { id: ARVORE_PRINCIPAL, nome: lista.find((a) => a.id === ARVORE_PRINCIPAL)?.nome ?? '', desloc: terminal.codigoDesloc }
  return [principal, ...lista.filter((a) => a.id !== ARVORE_PRINCIPAL)]
}

/** A árvore de um cartão. Cartão sem árvore é da principal — é assim que os quadros antigos continuam certos. */
export const arvoreDoCodigo = (no: NoCodigo): string => no.arvore ?? ARVORE_PRINCIPAL

/**
 * Gravaram um arquivo na pasta de um agente: nasce um cartão **para aquele arquivo** ao lado dele, e o do
 * arquivo anterior se recolhe num bloquinho com o nome — como os ramos de um mapa mental. Um cartão por
 * arquivo, não um cartão que troca de conteúdo, porque o que interessa é o histórico do que foi mexido.
 */
async function aoGravaremNaPasta(pasta: string, caminho: string): Promise<void> {
  const e = estado.espaco
  if (!e || criandoCodigo) return
  const plano = planoDe(e)
  const daPasta = plano.nos.filter((n): n is NoTerminal => n.tipo === 'terminal' && (n.pasta || pastaDoPlano(e)) === pasta)
  if (!daPasta.length) return
  const ids = new Set(daPasta.map((n) => n.id))
  const cartoes = plano.nos.filter((n): n is NoCodigo => n.tipo === 'codigo' && !!n.terminal && ids.has(n.terminal))
  if (cartoes.some((c) => c.caminho === caminho)) return // já há cartão deste arquivo: ele mesmo relê
  // cartão ainda sem arquivo (recém-aberto à mão, ou vindo da versão que trocava de conteúdo): ele vira o
  // cartão deste arquivo. Sem isto, um cartão desses trocaria de conteúdo para sempre e nenhum outro nasceria
  const semArquivo = cartoes.find((c) => !c.caminho)
  if (semArquivo) {
    // ao adotar, o app assume o cartão (automatico): senão ele fica de fora da coluna e nunca se recolhe
    // quando o arquivo seguinte abre o próximo cartão
    mudarPlano(
      (p) => ({ ...p, nos: p.nos.map((n) => (n.id === semArquivo.id ? ({ ...n, caminho, automatico: true } as No) : n)) }),
      false
    )
    return
  }
  const candidatos = daPasta.filter((n) => n.codigoSozinho !== false)
  if (!candidatos.length) return
  criandoCodigo = true
  try {
    // De quem é o arquivo novo? Vigiar a pasta não diz quem gravou, então o melhor palpite é **quem está
    // trabalhando agora**, arquivo a arquivo.
    //
    // Até 10/11/2026 o dono era "quem já tem cartão nesta pasta", e o primeiro cartão decidia para sempre.
    // Com um time inteiro na mesma pasta isso ruiu: o maestro gravou o CONTRATO.md primeiro e **todos** os
    // arquivos dos outros três foram parar na coluna dele — a coluna cresceu, empurrou os colegas para
    // fora da banda e o quadro deixou de contar quem mexeu em quê. Com vários trabalhando ao mesmo tempo o
    // palpite ainda pode errar; para isso existe o `ork arvore dar`, que corrige com certeza.
    const situacoes = await window.ork.terminal.contextos(e.id).catch(() => [])
    const como = new Map(situacoes.map((s) => [s.id, s.situacao]))
    let dono = candidatos.find((n) => como.get(n.id) === 'trabalhando')
    if (!dono) {
      // ninguém trabalhando: fica com quem já tem coluna nesta pasta, que é o de antes
      dono = candidatos.find((n) => cartoes.some((c) => c.terminal === n.id))
    }
    // nem trabalhando nem com coluna: o primeiro que ainda está vivo
    dono ??= candidatos.find((n) => como.get(n.id) !== 'encerrado') ?? candidatos[0]
    // o quadro pode ter mudado enquanto a resposta vinha
    const agoraNo = acharNo(dono.id)
    if (agoraNo?.tipo === 'terminal') criarCodigoDoArquivo(agoraNo, caminho)
  } finally {
    criandoCodigo = false
  }
}

/**
 * Cartão para um arquivo, ao lado do agente. Não rouba a seleção nem entra no desfazer: o usuário não pediu
 * agora, e tirar o teclado dele no meio de uma frase seria pior do que não mostrar o código.
 */
export function criarCodigoDoArquivo(terminal: NoTerminal, caminho: string, arvoreId?: string): string | null {
  const plano = planoAtual()
  if (!plano) return null
  const arvores = arvoresDoTerminal(terminal)
  const arvore = (arvoreId ?? terminal.arvoreAtiva ?? ARVORE_PRINCIPAL) as string
  const minha = arvores.some((a) => a.id === arvore) ? arvore : ARVORE_PRINCIPAL
  const inicio = inicioDaColuna(terminal, minha)
  const no: NoCodigo = {
    id: novoId(),
    x: inicio.x,
    y: inicio.y,
    ...ABERTO,
    z: proximoZ(plano),
    criadoEm: agora(),
    tipo: 'codigo',
    terminal: terminal.id,
    caminho,
    modo: 'diff',
    automatico: true,
    arvore: minha === ARVORE_PRINCIPAL ? undefined : minha
  }
  mudarPlano((p) => arrumarColuna({ ...p, nos: [...p.nos, no] }, terminal.id, minha, no.id), false)
  return no.id
}

/**
 * Arruma a coluna de um agente: o arquivo mais novo aberto, os outros recolhidos em bloquinhos, do mais novo
 * para o mais velho. Só mexe nos cartões que o app criou e o usuário não tocou (campo automatico) — depois que
 * você mexe num cartão, ele é seu e fica onde está.
 */
/**
 * Onde uma árvore de um agente começa: ao lado dele, uma abaixo da outra, mais o quanto o usuário arrastou
 * aquela árvore pela bolinha.
 */
export function inicioDaColuna(terminal: NoTerminal, arvoreId: string): { x: number; y: number } {
  const arvores = arvoresDoTerminal(terminal)
  const minha = arvores.find((a) => a.id === arvoreId) ?? arvores[0]
  // cada árvore guarda onde foi posta (ao nascer, abaixo do que o agente já tinha; depois, onde você a
  // arrastou). Sem isso — árvore de quadro antigo — vale uma escadinha, só para não ficarem uma sobre a outra.
  const quantas = Math.max(0, arvores.findIndex((a) => a.id === minha.id))
  const desloc = minha.desloc ?? { x: 0, y: quantas * ENTRE_ARVORES }
  return { x: terminal.x + terminal.largura + DISTANCIA + desloc.x, y: terminal.y + desloc.y }
}

/**
 * Arrasto pela bolinha: a coluna inteira anda e **continua sendo do app** — quem guarda o deslocamento é o
 * agente, então o próximo arquivo que ele gravar nasce onde você pôs a coluna, e não de volta ao lado dele.
 */
export function moverColuna(
  terminalId: string,
  arvoreId: string,
  originais: Posicoes,
  dx: number,
  dy: number,
  chave: string
): void {
  const plano = planoAtual()
  const terminal = plano?.nos.find((n) => n.id === terminalId)
  if (!plano || terminal?.tipo !== 'terminal' || !originais.nos.length) return
  dx = Math.round(dx)
  dy = Math.round(dy)
  // o cartão mais alto marca onde a árvore começa; o deslocamento é a distância dele até o lugar padrão
  const topo = originais.nos.reduce((a, b) => (b.y < a.y ? b : a))
  const parado = inicioDaColuna({ ...terminal, codigoDesloc: undefined, arvores: semDesloc(terminal) }, arvoreId)
  const desloc = { x: topo.x + dx - parado.x, y: topo.y + dy - parado.y }
  const por = new Map(originais.nos.map((o) => [o.id, o]))
  mudarPlano(
    (p) => ({
      ...p,
      nos: p.nos.map((n) => {
        if (n.id === terminalId) return guardarDesloc(n as NoTerminal, arvoreId, desloc)
        const o = por.get(n.id)
        return o ? ({ ...n, x: o.x + dx, y: o.y + dy } as No) : n
      })
    }),
    chave
  )
}

/** As árvores do agente sem nenhum deslocamento: serve para saber onde uma delas ficaria parada. */
const semDesloc = (terminal: NoTerminal): ArvoreDeCodigo[] =>
  (terminal.arvores ?? []).map((a) => ({ ...a, desloc: undefined }))

/** Grava o deslocamento na árvore certa: a principal guarda no próprio agente, as outras na lista. */
function guardarDesloc(terminal: NoTerminal, arvoreId: string, desloc: { x: number; y: number }): No {
  if (arvoreId === ARVORE_PRINCIPAL) return { ...terminal, codigoDesloc: desloc } as No
  const arvores = (terminal.arvores ?? []).map((a) => (a.id === arvoreId ? { ...a, desloc } : a))
  return { ...terminal, arvores } as No
}

/** A partir de quanto, longe do lugar da coluna, largar um cartão quer dizer "tire este daqui". */
const LONGE = 260

/**
 * Fim de um arrasto (ou de um redimensionamento) que pegou cartões de árvore de agente. Onde o cartão foi
 * largado decide tudo:
 *
 * - na coluna da **própria** árvore: volta para a fila, na altura em que você soltou (é assim que se reordena);
 * - na coluna de **outra** árvore do mesmo agente: muda de árvore, também na altura em que você soltou;
 * - **longe** de todas (mais de LONGE na horizontal): sai das árvores e fica onde você deixou.
 */
export function assentarCodigos(ids: string[]): void {
  const plano = planoAtual()
  if (!plano) return
  const movidos = new Set(ids)
  // cartão que andou junto com o agente dele não se assenta: a árvore inteira andou, nada mudou de lugar
  const meus = plano.nos.filter(
    (n): n is NoCodigo => n.tipo === 'codigo' && !!n.automatico && !!n.terminal && movidos.has(n.id) && !movidos.has(n.terminal)
  )
  if (!meus.length) return
  const terminais = [...new Set(meus.map((n) => n.terminal!))]
  mudarPlano((p) => {
    let saida = p
    for (const terminalId of terminais) {
      const terminal = saida.nos.find((n) => n.id === terminalId)
      if (terminal?.tipo !== 'terminal') continue
      const arvores = arvoresDoTerminal(terminal)
      const largados = new Set(meus.filter((n) => n.terminal === terminalId).map((n) => n.id))
      const codigos = (arvoreId: string, semOsLargados: boolean): NoCodigo[] =>
        saida.nos.filter(
          (n): n is NoCodigo =>
            n.tipo === 'codigo' &&
            !!n.automatico &&
            n.terminal === terminalId &&
            arvoreDoCodigo(n) === arvoreId &&
            (!semOsLargados || !largados.has(n.id))
        )
      // onde cada árvore está agora, sem contar o que acabou de ser largado
      const caixas = arvores.map((a) => {
        const inicio = inicioDaColuna(terminal, a.id)
        const outros = codigos(a.id, true)
        return {
          id: a.id,
          x: inicio.x,
          topo: Math.min(inicio.y, ...outros.map((n) => n.y)),
          baixo: Math.max(inicio.y + BLOQUINHO.altura, ...outros.map((n) => n.y + n.altura))
        }
      })
      const destino = new Map<string, string | null>()
      for (const id of largados) {
        const cartao = saida.nos.find((n) => n.id === id)
        if (cartao?.tipo !== 'codigo') continue
        // o ponto que conta é o alto do cartão (onde fica o nome), não o meio de um cartão grande
        const altura = cartao.y + Math.min(cartao.altura / 2, 40)
        const perto = caixas
          .map((c) => ({
            c,
            dx: Math.abs(cartao.x - c.x),
            dy: altura < c.topo ? c.topo - altura : altura > c.baixo ? altura - c.baixo : 0
          }))
          .sort((a, b) => a.dy - b.dy || a.dx - b.dx)[0]
        destino.set(id, perto && perto.dx <= LONGE ? perto.c.id : null)
      }
      saida = {
        ...saida,
        nos: saida.nos.map((n) => {
          if (!destino.has(n.id)) return n
          const alvo = destino.get(n.id)!
          return alvo === null
            ? ({ ...n, automatico: false, ordem: undefined } as No)
            : ({ ...n, arvore: alvo === ARVORE_PRINCIPAL ? undefined : alvo, ordem: undefined } as No)
        })
      }
      // a ordem de cada árvore passa a ser a ordem em que os cartões ficaram na tela
      for (const a of arvores) {
        const ordem = new Map(
          codigos(a.id, false)
            .sort((x, y) => x.y - y.y)
            .map((n, i) => [n.id, i])
        )
        saida = { ...saida, nos: saida.nos.map((n) => (ordem.has(n.id) ? ({ ...n, ordem: ordem.get(n.id) } as No) : n)) }
        saida = arrumarColuna(saida, terminalId, a.id)
      }
    }
    return saida
  }, false)
}

/** Traz de volta para a coluna do agente os cartões de código que saíram dela. */
export function juntarCodigosDoTerminal(terminalId: string): void {
  const plano = planoAtual()
  if (!plano) return
  const fora = plano.nos.filter((n) => n.tipo === 'codigo' && n.terminal === terminalId && !n.automatico)
  if (!fora.length) return
  const ids = new Set(fora.map((n) => n.id))
  registrarHistorico()
  mudarPlano((p) => {
    // os que voltam entram embaixo dos que já estavam na coluna, na ordem em que estão no quadro
    const maior = Math.max(
      -1,
      ...p.nos
        .filter((n): n is NoCodigo => n.tipo === 'codigo' && n.terminal === terminalId && !!n.automatico)
        .map((n) => n.ordem ?? -1)
    )
    const voltando = p.nos.filter((n) => ids.has(n.id)).sort((a, b) => a.y - b.y)
    const nova = new Map(voltando.map((n, i) => [n.id, maior + 1 + i]))
    // cada um volta para a árvore em que estava
    const com = {
      ...p,
      nos: p.nos.map((n) => (ids.has(n.id) ? ({ ...n, automatico: true, ordem: nova.get(n.id) } as No) : n))
    }
    return arrumarArvores(com, terminalId)
  }, false)
}
