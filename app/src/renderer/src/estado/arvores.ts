import { type ArvoreDeCodigo, type No, type NoCodigo, type Plano } from '../../../shared/modelo'
import { empurrarParaBaixo } from '../../../shared/quadro/empurrar'
import { manterBandas } from '../../../shared/quadro/bandas'
import { VISOR_ABERTO, ehVisor, juntarNoVisor, tirarDoVisor } from '../../../shared/quadro/visor'
import { caixaDoNo } from '../quadro/geometria'
import {
  ABERTO,
  ARVORE_PRINCIPAL,
  anotarNoVisorDoAgente,
  arvoreDoCodigo,
  arvoresDoTerminal,
  BLOQUINHO,
  ENTRE_ARVORES,
  garantirVisor,
  inicioDaColuna,
  visorDaArvore
} from './codigo'
import { acharNo, atualizarNo, novoId } from './nos'
import { estado, mudarPlano, pastaDoPlano, planoAtual, registrarHistorico } from './nucleo'
import { mudarTerminal } from './terminais'

// ---------- árvores de código de um agente ----------

/**
 * Cria uma árvore de código no agente e passa a usá-la para os próximos arquivos. O nome é o que aparece na
 * bolinha e é por ele que o agente fala dela ("leia os arquivos da árvore Backend").
 */
export function criarArvore(terminalId: string, nome: string): ArvoreDeCodigo | null {
  const terminal = acharNo(terminalId)
  if (terminal?.tipo !== 'terminal') return null
  const limpo = nome.trim().slice(0, 40)
  if (!limpo) return null
  const jaTem = arvoresDoTerminal(terminal).find((a) => a.nome.toLowerCase() === limpo.toLowerCase())
  if (jaTem) {
    usarArvore(terminalId, jaTem.id)
    return jaTem
  }
  // nasce abaixo de tudo o que o agente já tem à direita, para nenhuma árvore cobrir a outra
  const plano = planoAtual()
  const fundo = Math.max(
    terminal.y,
    ...(plano?.nos ?? [])
      .filter((n) => n.tipo === 'codigo' && n.terminal === terminalId && n.automatico)
      .map((n) => n.y + n.altura)
  )
  const nova: ArvoreDeCodigo = { id: novoId(), nome: limpo, desloc: { x: 0, y: fundo + ENTRE_ARVORES - terminal.y } }
  mudarTerminal(terminalId, (n) => ({ ...n, arvores: [...(n.arvores ?? []), nova], arvoreAtiva: nova.id }))
  garantirVisor(terminalId, nova.id)
  return nova
}

/** Em qual árvore nascem os próximos arquivos deste agente. A árvore ganha o visor (vazio) se ainda não tinha. */
export function usarArvore(terminalId: string, arvoreId: string): void {
  mudarTerminal(terminalId, (n) => ({ ...n, arvoreAtiva: arvoreId === ARVORE_PRINCIPAL ? undefined : arvoreId }))
  garantirVisor(terminalId, arvoreId)
}

export function renomearArvore(terminalId: string, arvoreId: string, nome: string): void {
  const limpo = nome.trim().slice(0, 40)
  if (!limpo) return
  mudarTerminal(terminalId, (n) => {
    const lista = n.arvores ?? []
    // a principal pode não estar na lista: entra só para guardar o nome (o deslocamento dela fica no agente)
    const arvores = lista.some((a) => a.id === arvoreId)
      ? lista.map((a) => (a.id === arvoreId ? { ...a, nome: limpo } : a))
      : [...lista, { id: arvoreId, nome: limpo }]
    return { ...n, arvores }
  })
}

/**
 * Tira a árvore do agente; a lista do visor dela se junta à da principal (sem repetir), para nada sumir sem você
 * mandar. A principal sem visor herda o da árvore desfeita.
 */
export function desfazerArvore(terminalId: string, arvoreId: string): void {
  if (arvoreId === ARVORE_PRINCIPAL) return
  const terminal = acharNo(terminalId)
  if (terminal?.tipo !== 'terminal') return
  registrarHistorico()
  mudarPlano((p) => {
    const visor = visorDaArvore(p, terminalId, arvoreId)
    const principal = visorDaArvore(p, terminalId, ARVORE_PRINCIPAL)
    let nos = p.nos.map((n) => {
      if (n.id === terminalId && n.tipo === 'terminal') {
        return {
          ...n,
          arvores: (n.arvores ?? []).filter((a) => a.id !== arvoreId),
          arvoreAtiva: n.arvoreAtiva === arvoreId ? undefined : n.arvoreAtiva
        } as No
      }
      return n.tipo === 'codigo' && n.terminal === terminalId && n.arvore === arvoreId ? ({ ...n, arvore: undefined } as No) : n
    })
    if (visor && principal) {
      nos = nos
        .filter((n) => n.id !== visor.id)
        .map((n) => (n.id === principal.id ? (juntarNoVisor(principal, visor.arquivos) as No) : n))
    }
    return arrumarArvores({ ...p, nos }, terminalId)
  }, false)
}

/**
 * Mostra arquivos no visor da árvore pedida (a em uso, se não disser). É o que o agente usa para montar a árvore
 * que outro agente vai ler. O arquivo que já estava no visor de outra árvore do mesmo agente muda de árvore em
 * vez de aparecer repetido.
 */
export function mostrarArquivoNaArvore(terminalId: string, caminho: string, arvoreId?: string): boolean {
  const terminal = acharNo(terminalId)
  const plano = planoAtual()
  if (!plano || terminal?.tipo !== 'terminal') return false
  const arvores = arvoresDoTerminal(terminal)
  const alvo = arvores.some((a) => a.id === arvoreId) ? arvoreId! : terminal.arvoreAtiva ?? ARVORE_PRINCIPAL
  const emOutra = plano.nos.some(
    (n) => ehVisor(n) && n.terminal === terminalId && arvoreDoCodigo(n) !== alvo && n.arquivos.some((a) => a.caminho === caminho)
  )
  if (emOutra) {
    mudarPlano(
      (p) => ({
        ...p,
        nos: p.nos.map((n) =>
          n.tipo === 'codigo' && ehVisor(n) && n.terminal === terminalId && arvoreDoCodigo(n) !== alvo ? (tirarDoVisor(n, [caminho]) as No) : n
        )
      }),
      false
    )
  }
  return anotarNoVisorDoAgente(terminalId, alvo, [caminho])
}

/**
 * Entrega arquivos a outro agente: eles saem da lista de quem deu (de qualquer árvore) e entram no topo do visor
 * **principal** de quem recebe, que nasce se faltar. Devolve quantos arquivos passaram.
 */
export function entregarArquivos(origemId: string, destinoId: string, caminhos: string[]): number {
  const plano = planoAtual()
  if (!plano) return 0
  const meus = plano.nos.filter((n) => ehVisor(n) && n.terminal === origemId)
  const entregues = caminhos.filter((c) => meus.some((v) => ehVisor(v) && v.arquivos.some((a) => a.caminho === c)))
  if (!entregues.length) return 0
  registrarHistorico()
  mudarPlano(
    (p) => ({
      ...p,
      nos: p.nos.map((n) => (n.tipo === 'codigo' && ehVisor(n) && n.terminal === origemId ? (tirarDoVisor(n, entregues) as No) : n))
    }),
    false
  )
  anotarNoVisorDoAgente(destinoId, ARVORE_PRINCIPAL, entregues)
  return entregues.length
}

/**
 * Fecha só os cartões soltos que **não** são visor (um arquivo aberto à mão). Visor nunca se fecha por aqui: ele é a
 * lista do agente. O item de menu que chama isto some na B2c.
 */
export function fecharCodigosSoltos(terminalId: string): void {
  const plano = planoAtual()
  if (!plano) return
  const soltos = plano.nos.filter((n) => n.tipo === 'codigo' && n.terminal === terminalId && !n.automatico && !ehVisor(n))
  if (!soltos.length) return
  const ids = new Set(soltos.map((n) => n.id))
  registrarHistorico()
  mudarPlano((p) => ({ ...p, nos: p.nos.filter((n) => !ids.has(n.id)) }), false)
}

/** Tira um cartão da coluna do agente: daí em diante ele fica onde o usuário o deixar. */
export function soltarCodigoDaColuna(id: string): void {
  const no = acharNo(id)
  if (no?.tipo !== 'codigo' || !no.automatico) return
  registrarHistorico()
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (n.id === id ? ({ ...n, automatico: false } as No) : n)) }), false)
}

/** Quantos cartões de código de um agente estão fora da coluna (para o menu oferecer trazer de volta). */
export function contarCodigosSoltos(terminalId: string): number {
  const plano = planoAtual()
  return plano ? plano.nos.filter((n) => n.tipo === 'codigo' && n.terminal === terminalId && !n.automatico).length : 0
}

/**
 * Arruma as árvores de um agente: um visor por árvore, empilhados na ordem das árvores. Cada um começa onde a
 * árvore dele manda (ao lado do agente, mais o que o usuário arrastou pela bolinha) e nunca mais alto que o fim
 * do visor de cima mais `ENTRE_ARVORES`. Só mexe nos visores do app (campo automatico): depois que você tira um
 * da coluna, ele fica onde está.
 */
export function arrumarArvores(plano: Plano, terminalId: string): Plano {
  const terminal = plano.nos.find((n) => n.id === terminalId)
  if (terminal?.tipo !== 'terminal') return plano
  const ajustes = new Map<string, Partial<NoCodigo>>()
  let piso = -Infinity
  for (const a of arvoresDoTerminal(terminal)) {
    const visor = plano.nos.find(
      (n): n is NoCodigo => n.tipo === 'codigo' && n.automatico === true && n.terminal === terminalId && arvoreDoCodigo(n) === a.id && ehVisor(n)
    )
    if (!visor) continue
    const inicio = inicioDaColuna(terminal, a.id)
    const y = Math.max(inicio.y, piso)
    const recolhido = !!visor.recolhido
    const larguraAberta = visor.larguraAberta ?? (recolhido ? VISOR_ABERTO.largura : visor.largura)
    const alturaAberta = visor.alturaAberta ?? (recolhido ? VISOR_ABERTO.altura : visor.altura)
    const largura = recolhido ? BLOQUINHO.largura : larguraAberta
    const altura = recolhido ? BLOQUINHO.altura : alturaAberta
    ajustes.set(visor.id, { x: inicio.x, y, largura, altura, recolhido, larguraAberta, alturaAberta })
    piso = y + altura + ENTRE_ARVORES
  }
  if (!ajustes.size) return plano
  const arrumado = { ...plano, nos: plano.nos.map((n) => (ajustes.has(n.id) ? ({ ...n, ...ajustes.get(n.id) } as No) : n)) }
  // a coluna cresceu e empurrou os vizinhos: a moldura de uma banda acompanha quem já estava dentro dela,
  // senão o app desmancha, sozinho, um time que o usuário montou
  return manterBandas(plano, afastarDaColuna(arrumado, terminalId, new Set(ajustes.keys())))
}

/** Fim do arrasto pela bolinha: as árvores se realinham e empurram o que tiver ficado embaixo delas. */
export function assentarColuna(terminalId: string, _arvoreId?: string): void {
  mudarPlano((p) => arrumarArvores(p, terminalId), false)
}

/**
 * A coluna cresceu: o que ela cobriria desce o mínimo para sair de baixo dela, em cascata. É o que um mapa
 * mental faz — abrir um ramo empurra os vizinhos em vez de passar por cima deles.
 *
 * O agente dono fica parado (a coluna sai dele) e nada sobe, para o quadro continuar reconhecível.
 *
 * Os cartões de código que saíram desta coluna também ficam parados: eles são do usuário, que os pôs ali, e
 * empurrá-los os fazia descer um pouco a cada arquivo novo, até sumirem lá embaixo.
 */
function afastarDaColuna(plano: Plano, terminalId: string, daColuna: Set<string>): Plano {
  const fixos = plano.nos.filter((n) => daColuna.has(n.id)).map(caixaDoNo)
  const meuCodigo = (n: No): boolean => n.tipo === 'codigo' && n.terminal === terminalId
  const moveis = plano.nos
    .filter((n) => !daColuna.has(n.id) && n.id !== terminalId && !meuCodigo(n))
    .map((n) => ({ id: n.id, ...caixaDoNo(n) }))
  const mudou = empurrarParaBaixo(fixos, moveis)
  if (!mudou.size) return plano
  return { ...plano, nos: plano.nos.map((n) => (mudou.has(n.id) ? ({ ...n, y: mudou.get(n.id)! } as No) : n)) }
}

/**
 * Abre ou recolhe um cartão de código. Abrir para ler não tira o cartão das mãos do app (ao contrário de
 * mover ou redimensionar): a coluna é arrumada de novo, para o que está embaixo descer e nada se sobrepor.
 */
export function alternarRecolhidoDoCodigo(id: string): void {
  const plano = planoAtual()
  const cartao = plano?.nos.find((n) => n.id === id)
  if (!plano || cartao?.tipo !== 'codigo') return
  const larguraAberta = cartao.larguraAberta ?? (cartao.recolhido ? abertoDe(cartao).largura : cartao.largura)
  const alturaAberta = cartao.alturaAberta ?? (cartao.recolhido ? abertoDe(cartao).altura : cartao.altura)
  const recolhido = !cartao.recolhido
  const mudanca: Partial<NoCodigo> = {
    recolhido,
    larguraAberta,
    alturaAberta,
    largura: recolhido ? BLOQUINHO.largura : larguraAberta,
    altura: recolhido ? BLOQUINHO.altura : alturaAberta
  }
  registrarHistorico()
  mudarPlano((p) => {
    const com = { ...p, nos: p.nos.map((n) => (n.id === id ? ({ ...n, ...mudanca } as No) : n)) }
    return cartao.automatico && cartao.terminal ? arrumarArvores(com, cartao.terminal) : com
  }, false)
}

/** O tamanho de um cartão de código aberto: o do visor, ou o do cartão de um arquivo. */
const abertoDe = (no: NoCodigo): { largura: number; altura: number } => (ehVisor(no) ? VISOR_ABERTO : ABERTO)

/** Cartões de código de um agente (de uma árvore só, se você disser qual), do mais novo para o mais velho. */
function codigosDoTerminal(plano: Plano, terminalId: string, arvoreId?: string): NoCodigo[] {
  return plano.nos
    .filter(
      (n): n is NoCodigo =>
        n.tipo === 'codigo' && n.terminal === terminalId && (!arvoreId || arvoreDoCodigo(n) === arvoreId)
    )
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

/** Quantos cartões de código um agente tem, e quantos estão recolhidos (para o menu do cartão dele). */
export function contarCodigos(terminalId: string, arvoreId?: string): { total: number; recolhidos: number } {
  const plano = planoAtual()
  if (!plano) return { total: 0, recolhidos: 0 }
  const meus = codigosDoTerminal(plano, terminalId, arvoreId)
  return { total: meus.length, recolhidos: meus.filter((n) => n.recolhido).length }
}

export function recolherCodigosDoTerminal(terminalId: string, recolher: boolean, arvoreId?: string): void {
  const plano = planoAtual()
  if (!plano) return
  const meus = codigosDoTerminal(plano, terminalId, arvoreId)
  if (!meus.length) return
  registrarHistorico()
  const ajustes = new Map<string, Partial<NoCodigo>>()
  for (const cartao of meus) {
    if (!!cartao.recolhido === recolher) continue
    const larguraAberta = cartao.larguraAberta ?? (cartao.recolhido ? abertoDe(cartao).largura : cartao.largura)
    const alturaAberta = cartao.alturaAberta ?? (cartao.recolhido ? abertoDe(cartao).altura : cartao.altura)
    ajustes.set(cartao.id, {
      recolhido: recolher,
      larguraAberta,
      alturaAberta,
      largura: recolher ? BLOQUINHO.largura : larguraAberta,
      altura: recolher ? BLOQUINHO.altura : alturaAberta
    })
  }
  mudarPlano((p) => {
    const com = { ...p, nos: p.nos.map((n) => (ajustes.has(n.id) ? ({ ...n, ...ajustes.get(n.id) } as No) : n)) }
    return arrumarArvores(com, terminalId)
  }, false)
}

/**
 * Fecha todos os cartões de código de um agente e desliga o automático da pasta dele. É o gesto de "não
 * quero isto aqui": fechar um cartão só fecha aquele arquivo, e o próximo que o agente mexer abre de novo.
 */
export function fecharCodigosDoTerminal(terminalId: string): void {
  const espaco = estado.espaco
  const plano = planoAtual()
  if (!espaco || !plano) return
  const meus = new Set(codigosDoTerminal(plano, terminalId).map((n) => n.id))
  const alvo = plano.nos.find((n) => n.id === terminalId)
  if (alvo?.tipo !== 'terminal') return
  const pastaDoAgente = alvo.pasta || pastaDoPlano(espaco)
  registrarHistorico()
  mudarPlano(
    (p) => ({
      ...p,
      nos: p.nos
        .filter((n) => !meus.has(n.id))
        .map((n) => (n.tipo === 'terminal' && (n.pasta || pastaDoPlano(espaco)) === pastaDoAgente ? { ...n, codigoSozinho: false } : n))
    }),
    false
  )
}

/** Ligar ou desligar o cartão de código automático de um agente. */
export function alternarCodigoSozinho(id: string): void {
  const no = acharNo(id)
  if (no?.tipo !== 'terminal') return
  atualizarNo(id, { codigoSozinho: no.codigoSozinho === false } as Partial<No>, false)
}

/** Quantos arquivos há nas listas dos visores de um agente (de uma árvore só, se você disser qual). */
export function contarArquivos(terminalId: string, arvoreId?: string): number {
  const plano = planoAtual()
  if (!plano) return 0
  return codigosDoTerminal(plano, terminalId, arvoreId).reduce((t, n) => t + (ehVisor(n) ? n.arquivos.length : 0), 0)
}
