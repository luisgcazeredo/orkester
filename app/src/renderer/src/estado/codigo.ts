import { type ArvoreDeCodigo, type No, type NoCodigo, type NoTerminal, type Plano } from '../../../shared/modelo'
import { proximoZ } from '../../../shared/quadro/geometria'
import { ARVORE_PRINCIPAL, VISOR_ABERTO, anotarNoVisor, ehVisor, exibidoDepois, marcarApagado } from '../../../shared/quadro/visor'
import { type Posicoes } from './arranjo'
import { arrumarArvores } from './arvores'
import { acharNo, agora, novoId } from './nos'
import { estado, mudarPlano, ouvintes, pastaDoPlano, planoAtual, planoDe, registrarHistorico } from './nucleo'

/** Muda um cartão de terminal em qualquer plano (térreo ou andar), fora do desfazer. */
// ---------- cartão de código que nasce sozinho ----------

/** Pastas de agente vigiadas agora, com a função que desliga cada uma. */
const vigiasDeCodigo = new Map<string, () => void>()

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
    // arquivo que sumiu não entra na lista: só fica riscado onde já estava (e o cartão daquele arquivo relê)
    vigiasDeCodigo.set(
      pasta,
      window.ork.codigo.vigiar(pasta, (m) => (m.sumiu ? aoApagaremNaPasta(pasta, m.caminho) : void aoGravaremNaPasta(pasta, m.caminho)))
    )
  }
}

/** Tamanho de um cartão de código aberto, e do bloquinho quando ele está recolhido. */
export const ABERTO = { largura: 620, altura: 460 }
export const BLOQUINHO = { largura: 300, altura: 30 }
/** Espaço entre o agente e a coluna dele. A bolinha das ligações (ver CamadaVinculos) mora no meio dele. */
const DISTANCIA = 96
/** A árvore que todo agente tem desde sempre (vem de shared, onde a migração também a usa); as outras ele cria. */
export { ARVORE_PRINCIPAL }
/** Quanto o visor espera, sem arquivo novo, antes de passar a mostrar o mais novo (uma rajada não pisca). */
export const ESPERA_DO_VISOR = 2000
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

/** A árvore em que nascem os próximos arquivos do agente (a ativa, se ela ainda existe; senão a principal). */
export function arvoreAtivaDe(terminal: NoTerminal): string {
  const ativa = terminal.arvoreAtiva ?? ARVORE_PRINCIPAL
  return arvoresDoTerminal(terminal).some((a) => a.id === ativa) ? ativa : ARVORE_PRINCIPAL
}

type Visor = NoCodigo & { arquivos: NonNullable<NoCodigo['arquivos']> }

/** O visor de um agente numa árvore (um só por par). */
export const visorDaArvore = (plano: Plano, terminalId: string, arvoreId: string): Visor | undefined =>
  plano.nos.find((n): n is Visor => ehVisor(n) && n.terminal === terminalId && arvoreDoCodigo(n) === arvoreId)

/** Um visor vazio, ao lado do agente, no lugar da árvore. */
function novoVisor(plano: Plano, terminal: NoTerminal, arvoreId: string): NoCodigo {
  const inicio = inicioDaColuna(terminal, arvoreId)
  return {
    id: novoId(),
    x: inicio.x,
    y: inicio.y,
    ...VISOR_ABERTO,
    larguraAberta: VISOR_ABERTO.largura,
    alturaAberta: VISOR_ABERTO.altura,
    z: proximoZ(plano),
    criadoEm: agora(),
    tipo: 'codigo',
    terminal: terminal.id,
    modo: 'diff',
    automatico: true,
    arvore: arvoreId === ARVORE_PRINCIPAL ? undefined : arvoreId,
    arquivos: []
  }
}

/** Visores com espera em andamento: cada arquivo novo reinicia a espera daquele visor. */
const esperas = new Map<string, ReturnType<typeof setTimeout>>()

function agendarExibicao(visorId: string): void {
  clearTimeout(esperas.get(visorId))
  esperas.set(
    visorId,
    setTimeout(() => {
      esperas.delete(visorId)
      const no = acharNo(visorId)
      if (no?.tipo !== 'codigo' || !ehVisor(no) || !no.arquivos[0]) return
      const mostrar = exibidoDepois(no, no.arquivos[0].caminho) // fixo: continua onde estava
      if (mostrar === undefined || mostrar === no.caminho) return
      mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (n.id === visorId ? ({ ...n, caminho: mostrar } as No) : n)) }), false)
    }, ESPERA_DO_VISOR)
  )
}

/**
 * Anota arquivos no visor do agente numa árvore: eles sobem ao topo da lista na hora, e a tela troca para o mais
 * novo só depois de `ESPERA_DO_VISOR` sem gravação nova (e só se o visor está seguindo). `criar`: nasce o visor se
 * ele ainda não existe. Não rouba a seleção nem entra no desfazer: o usuário não pediu agora. Devolve se anotou.
 */
export function anotarNoVisorDoAgente(terminalId: string, arvoreId: string, caminhos: string[], criar = true): boolean {
  let visorId: string | undefined
  mudarPlano((p) => {
    const terminal = p.nos.find((n): n is NoTerminal => n.id === terminalId && n.tipo === 'terminal')
    if (!terminal || !caminhos.length) return p
    const existente = visorDaArvore(p, terminalId, arvoreId)
    if (!existente && !criar) return p
    const em = Date.now()
    let visor: NoCodigo = existente ?? novoVisor(p, terminal, arvoreId)
    caminhos.forEach((c, i) => (visor = anotarNoVisor(visor, c, em + i)))
    visorId = visor.id
    const nos = existente ? p.nos.map((n) => (n.id === visor.id ? visor : n)) : [...p.nos, visor]
    // só a criação mexe no quadro: ela empurra o que estiver no lugar do visor
    return existente ? { ...p, nos } : arrumarArvores({ ...p, nos }, terminalId)
  }, false)
  if (visorId) agendarExibicao(visorId)
  return !!visorId
}

/** Visor vazio do agente na árvore (para `ork arvore nova/usar`), se ainda não houver. */
export function garantirVisor(terminalId: string, arvoreId: string): void {
  mudarPlano((p) => {
    const terminal = p.nos.find((n): n is NoTerminal => n.id === terminalId && n.tipo === 'terminal')
    if (!terminal || visorDaArvore(p, terminalId, arvoreId)) return p
    return arrumarArvores({ ...p, nos: [...p.nos, novoVisor(p, terminal, arvoreId)] }, terminalId)
  }, false)
}

/**
 * Gravaram um arquivo na pasta de um agente: ele sobe ao topo da lista do visor **do dono**, na árvore em uso.
 * Um visor por agente e árvore, e não um cartão por arquivo: o histórico do que foi mexido é a lista.
 */
async function aoGravaremNaPasta(pasta: string, caminho: string): Promise<void> {
  const e = estado.espaco
  if (!e) return
  const plano = planoDe(e)
  const daPasta = plano.nos.filter((n): n is NoTerminal => n.tipo === 'terminal' && (n.pasta || pastaDoPlano(e)) === pasta)
  if (!daPasta.length) return
  const ids = new Set(daPasta.map((n) => n.id))
  const visores = plano.nos.filter((n): n is Visor => ehVisor(n) && !!n.terminal && ids.has(n.terminal))
  // o arquivo já está na lista de alguém: ele só sobe lá (quem já o tinha continua dono dele)
  const jaEm = visores.filter((v) => v.arquivos.some((a) => a.caminho === caminho))
  if (jaEm.length) {
    for (const v of jaEm) anotarNoVisorDoAgente(v.terminal!, arvoreDoCodigo(v), [caminho], false)
    return
  }
  // `codigoSozinho === false` não deixa o visor **nascer**; visor que já existe continua recebendo
  const temVisor = (n: NoTerminal): boolean => visores.some((v) => v.terminal === n.id)
  const candidatos = daPasta.filter((n) => n.codigoSozinho !== false || temVisor(n))
  if (!candidatos.length) return
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
  // ninguém trabalhando: fica com quem já tem visor nesta pasta, que é o de antes
  dono ??= candidatos.find(temVisor)
  // nem trabalhando nem com visor: o primeiro que ainda está vivo
  dono ??= candidatos.find((n) => como.get(n.id) !== 'encerrado') ?? candidatos[0]
  // o quadro pode ter mudado enquanto a resposta vinha
  const agoraNo = acharNo(dono.id)
  if (agoraNo?.tipo !== 'terminal') return
  const arvore = arvoreAtivaDe(agoraNo)
  const atual = planoAtual()
  if (!atual) return
  if (!visorDaArvore(atual, agoraNo.id, arvore) && agoraNo.codigoSozinho === false) return
  anotarNoVisorDoAgente(agoraNo.id, arvore, [caminho])
}

/** O arquivo sumiu do disco: fica na lista, riscado, nos visores que o tinham. */
function aoApagaremNaPasta(pasta: string, caminho: string): void {
  const e = estado.espaco
  if (!e) return
  const plano = planoDe(e)
  const ids = new Set(plano.nos.filter((n) => n.tipo === 'terminal' && (n.pasta || pastaDoPlano(e)) === pasta).map((n) => n.id))
  const dele = new Set(
    plano.nos.filter((n) => n.tipo === 'codigo' && ehVisor(n) && !!n.terminal && ids.has(n.terminal) && marcarApagado(n, caminho) !== n).map((n) => n.id)
  )
  if (!dele.size) return
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (dele.has(n.id) && n.tipo === 'codigo' ? marcarApagado(n, caminho) : n)) }), false)
}

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
 * Fim de um arrasto (ou de um redimensionamento) que pegou visores de agente. Onde o visor foi largado decide:
 *
 * - perto da coluna da própria árvore: volta ao lugar dela (a coluna se arruma de novo);
 * - **longe** (mais de LONGE na horizontal): sai da coluna e fica onde você deixou. Ele continua sendo do agente e
 *   recebendo arquivos (senão nasceria um 2º visor); `juntarCodigosDoTerminal` devolve à coluna.
 */
export function assentarCodigos(ids: string[]): void {
  const plano = planoAtual()
  if (!plano) return
  const movidos = new Set(ids)
  // visor que andou junto com o agente dele não se assenta: a árvore inteira andou, nada mudou de lugar
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
      const longe = new Set(
        meus
          .filter((n) => n.terminal === terminalId && Math.abs(n.x - inicioDaColuna(terminal, arvoreDoCodigo(n)).x) > LONGE)
          .map((n) => n.id)
      )
      if (longe.size) {
        saida = { ...saida, nos: saida.nos.map((n) => (longe.has(n.id) ? ({ ...n, automatico: false } as No) : n)) }
      }
      saida = arrumarArvores(saida, terminalId)
    }
    return saida
  }, false)
}

/** Traz de volta para a coluna do agente os visores que saíram dela. */
export function juntarCodigosDoTerminal(terminalId: string): void {
  const plano = planoAtual()
  if (!plano) return
  const fora = plano.nos.filter((n) => ehVisor(n) && n.terminal === terminalId && !n.automatico)
  if (!fora.length) return
  const ids = new Set(fora.map((n) => n.id))
  registrarHistorico()
  mudarPlano(
    (p) => arrumarArvores({ ...p, nos: p.nos.map((n) => (ids.has(n.id) ? ({ ...n, automatico: true } as No) : n)) }, terminalId),
    false
  )
}
