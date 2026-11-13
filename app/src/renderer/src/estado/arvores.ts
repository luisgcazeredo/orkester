import { type ArvoreDeCodigo, type No, type NoCodigo, type Plano } from '../../../shared/modelo'
import { empurrarParaBaixo } from '../../../shared/quadro/empurrar'
import { manterBandas } from '../../../shared/quadro/bandas'
import { caixaDoNo } from '../quadro/geometria'
import { ABERTO, ARVORE_PRINCIPAL, arvoreDoCodigo, arvoresDoTerminal, BLOQUINHO, criarCodigoDoArquivo, ENTRE_ARVORES, inicioDaColuna, MAX_NA_COLUNA } from './codigo'
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
  return nova
}

/** Em qual árvore nascem os próximos arquivos deste agente. */
export function usarArvore(terminalId: string, arvoreId: string): void {
  mudarTerminal(terminalId, (n) => ({ ...n, arvoreAtiva: arvoreId === ARVORE_PRINCIPAL ? undefined : arvoreId }))
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

/** Tira a árvore do agente; os cartões dela voltam para a principal, para nada sumir sem você mandar. */
export function desfazerArvore(terminalId: string, arvoreId: string): void {
  if (arvoreId === ARVORE_PRINCIPAL) return
  const terminal = acharNo(terminalId)
  if (terminal?.tipo !== 'terminal') return
  registrarHistorico()
  mudarPlano((p) => {
    const com = {
      ...p,
      nos: p.nos.map((n) => {
        if (n.id === terminalId && n.tipo === 'terminal') {
          return {
            ...n,
            arvores: (n.arvores ?? []).filter((a) => a.id !== arvoreId),
            arvoreAtiva: n.arvoreAtiva === arvoreId ? undefined : n.arvoreAtiva
          } as No
        }
        return n.tipo === 'codigo' && n.terminal === terminalId && n.arvore === arvoreId
          ? ({ ...n, arvore: undefined, ordem: undefined } as No)
          : n
      })
    }
    return arrumarArvores(com, terminalId)
  }, false)
}

/**
 * Abre (ou traz para a árvore pedida) o cartão de um arquivo. É o que o agente usa para montar a árvore que
 * outro agente vai ler.
 */
export function mostrarArquivoNaArvore(terminalId: string, caminho: string, arvoreId?: string): boolean {
  const terminal = acharNo(terminalId)
  const plano = planoAtual()
  if (!plano || terminal?.tipo !== 'terminal') return false
  const arvores = arvoresDoTerminal(terminal)
  const alvo = arvores.some((a) => a.id === arvoreId) ? arvoreId! : terminal.arvoreAtiva ?? ARVORE_PRINCIPAL
  const jaTem = plano.nos.find(
    (n): n is NoCodigo => n.tipo === 'codigo' && n.terminal === terminalId && n.caminho === caminho
  )
  if (jaTem) {
    // o cartão já existe: ele muda de árvore em vez de nascer repetido
    mudarPlano((pl) => {
      const com = {
        ...pl,
        nos: pl.nos.map((n) =>
          n.id === jaTem.id
            ? ({ ...n, arvore: alvo === ARVORE_PRINCIPAL ? undefined : alvo, automatico: true, ordem: undefined } as No)
            : n
        )
      }
      return arrumarArvores(com, terminalId)
    }, false)
    return true
  }
  return !!criarCodigoDoArquivo(terminal, caminho, alvo)
}

/** Fecha os cartões de código que saíram da coluna deste agente. Os da coluna ficam. */
export function fecharCodigosSoltos(terminalId: string): void {
  const plano = planoAtual()
  if (!plano) return
  const soltos = plano.nos.filter((n) => n.tipo === 'codigo' && n.terminal === terminalId && !n.automatico)
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
  mudarPlano(
    (p) => ({ ...p, nos: p.nos.map((n) => (n.id === id ? ({ ...n, automatico: false, ordem: undefined } as No) : n)) }),
    false
  )
}

/** Quantos cartões de código de um agente estão fora da coluna (para o menu oferecer trazer de volta). */
export function contarCodigosSoltos(terminalId: string): number {
  const plano = planoAtual()
  return plano ? plano.nos.filter((n) => n.tipo === 'codigo' && n.terminal === terminalId && !n.automatico).length : 0
}

/** Arruma todas as árvores de um agente (quando a ação não é de uma só). */
export function arrumarArvores(plano: Plano, terminalId: string): Plano {
  const terminal = plano.nos.find((n) => n.id === terminalId)
  if (terminal?.tipo !== 'terminal') return plano
  return arvoresDoTerminal(terminal).reduce((p, a) => arrumarColuna(p, terminalId, a.id), plano)
}

/** Fim do arrasto pela bolinha: a árvore se realinha e empurra o que tiver ficado embaixo dela. */
export function assentarColuna(terminalId: string, arvoreId: string): void {
  mudarPlano((p) => arrumarColuna(p, terminalId, arvoreId), false)
}

/**
 * Arruma a coluna de um agente, do arquivo mais novo para o mais velho. Só mexe nos cartões que o app criou
 * e o usuário não tirou dele (ver automatico).
 *
 * `chegou` é o cartão do arquivo que acabou de ser gravado: ele abre e **o arquivo anterior** vira
 * bloquinho. Os outros ficam como estão — um bloquinho que você abriu para ler continua aberto, porque
 * abrir para ler não é arrumar o quadro; a coluna só desloca os de baixo para caber.
 */
export function arrumarColuna(plano: Plano, terminalId: string, arvoreId: string, chegou?: string): Plano {
  const terminal = plano.nos.find((n) => n.id === terminalId)
  if (terminal?.tipo !== 'terminal') return plano
  const meus = plano.nos
    .filter(
      (n): n is NoCodigo =>
        n.tipo === 'codigo' && n.automatico === true && n.terminal === terminalId && arvoreDoCodigo(n) === arvoreId
    )
    // a ordem é a que o usuário deixou (campo ordem); sem ela, o mais novo primeiro. O que acabou de
    // chegar vai para o topo.
    .sort((a, b) => {
      const pa = a.id === chegou ? -1 : a.ordem ?? Number.MAX_SAFE_INTEGER
      const pb = b.id === chegou ? -1 : b.ordem ?? Number.MAX_SAFE_INTEGER
      return pa - pb || b.criadoEm.localeCompare(a.criadoEm)
    })
  // passando do limite, saem do quadro só os que estão recolhidos: cartão que você deixou aberto está
  // sendo lido agora, e sumir no meio do trabalho do agente era o pior jeito de respeitar um limite
  const excedentes = meus.slice(MAX_NA_COLUNA)
  const sobrando = new Set(excedentes.filter((n) => n.recolhido).map((n) => n.id))
  const naColuna = [...meus.slice(0, MAX_NA_COLUNA), ...excedentes.filter((n) => !n.recolhido)]
  // o que era o arquivo da vez até agora é o que se recolhe quando chega um novo
  const anterior = chegou ? meus[1]?.id : undefined
  const inicio = inicioDaColuna(terminal, arvoreId)
  const x = inicio.x
  let y = inicio.y
  const ajustes = new Map<string, Partial<NoCodigo>>()
  for (const cartao of naColuna) {
    const recolhido = cartao.id === chegou ? false : cartao.id === anterior ? true : !!cartao.recolhido
    const larguraAberta = cartao.larguraAberta ?? (cartao.recolhido ? ABERTO.largura : cartao.largura)
    const alturaAberta = cartao.alturaAberta ?? (cartao.recolhido ? ABERTO.altura : cartao.altura)
    const largura = recolhido ? BLOQUINHO.largura : larguraAberta
    const altura = recolhido ? BLOQUINHO.altura : alturaAberta
    ajustes.set(cartao.id, { x, y, largura, altura, recolhido, larguraAberta, alturaAberta, ordem: ajustes.size })
    y += altura + 12
  }
  const arrumado = {
    ...plano,
    nos: plano.nos
      .filter((n) => !sobrando.has(n.id))
      .map((n) => (ajustes.has(n.id) ? ({ ...n, ...ajustes.get(n.id) } as No) : n))
  }
  // a coluna cresceu e empurrou os vizinhos: a moldura de uma banda acompanha quem já estava dentro dela,
  // senão o app desmancha, sozinho, um time que o usuário montou
  return manterBandas(plano, afastarDaColuna(arrumado, terminalId, new Set(ajustes.keys())))
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
  const larguraAberta = cartao.larguraAberta ?? (cartao.recolhido ? ABERTO.largura : cartao.largura)
  const alturaAberta = cartao.alturaAberta ?? (cartao.recolhido ? ABERTO.altura : cartao.altura)
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
    return cartao.automatico && cartao.terminal ? arrumarColuna(com, cartao.terminal, arvoreDoCodigo(cartao)) : com
  }, false)
}

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
    const larguraAberta = cartao.larguraAberta ?? (cartao.recolhido ? ABERTO.largura : cartao.largura)
    const alturaAberta = cartao.alturaAberta ?? (cartao.recolhido ? ABERTO.altura : cartao.altura)
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
