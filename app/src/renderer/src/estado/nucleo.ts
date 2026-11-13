import { useSyncExternalStore } from 'react'
import { type Andar, type Espaco, type PincelDesenho, type Plano, type Preferencias, PRESETS_PADRAO, type ResumoEspaco } from '../../../shared/modelo'
import { ajustarVigiasDeCodigo } from './codigo'
import { COR_DO_TRACO_PADRAO } from './coresDeDados'
import { TEMA_PADRAO } from '../../../shared/temas'
import { chaveDoAviso, existeTerminal } from './espacos'
import { sincronizarRotinas } from './rotinas'
import { fechadosPorAgente, sincronizarTerminais } from './terminais'

export type Ferramenta = 'selecionar' | 'postit' | 'texto' | 'desenho'

/** Um item do quadro. */
export interface Alvo {
  tipo: 'no' | 'corda' | 'desenho'
  id: string
}

/** O que está selecionado: cartões e traços (vários de uma vez) ou uma ligação. */
export interface Selecao {
  nos: string[]
  desenhos: string[]
  corda: string | null
}

export const NADA: Selecao = { nos: [], desenhos: [], corda: null }

export const quantosSelecionados = (s: Selecao): number => s.nos.length + s.desenhos.length + (s.corda ? 1 : 0)

export interface EstadoUI {
  carregado: boolean
  espacos: ResumoEspaco[]
  espaco: Espaco | null
  notas: Record<string, string>
  preferencias: Preferencias
  lateralAberta: boolean
  ferramenta: Ferramenta
  estiloDesenho: { ferramenta: PincelDesenho; cor: string }
  selecao: Selecao
  /** Nó em edição de texto (post-it ou texto). */
  editando: string | null
  miniMapa: boolean
  erroAoSalvar: string | null
  /** Cartões cujo primeiro pedido NÃO foi confirmado, por id (o selo no cabeçalho do cartão lê daqui). */
  avisosDoPrimeiroPedido: Record<string, StatusDoAviso>
  /** Vista de andares (a pilha em perspectiva) aberta. */
  vistaAndares: boolean
  /** Espaços abertos em outras janelas (esta não pode abrir: traz a outra para a frente). */
  emOutrasJanelas: string[]
  /** Explorador de arquivos da direita: aberto, as pastas que ele mostra e as que estão abertas nele. */
  explorador: { aberto: boolean; raizes: string[]; expandidas: string[] }
  /** Página da casca em tela (id do registro em casca/paginas). Só em memória; o único escritor é irParaPagina. */
  paginaAtiva: string
}

/** `ficou`: escrito no campo e não enviado. `incerto`: pode ter saído. `nao-pronto`/`sem-sessao`: nada foi digitado. `erro`: o canal com o processo principal falhou. */
export type StatusDoAviso = 'ficou' | 'incerto' | 'nao-pronto' | 'sem-sessao' | 'erro'

export let estado: EstadoUI = {
  carregado: false,
  espacos: [],
  espaco: null,
  notas: {},
  preferencias: { versao: 1, tema: TEMA_PADRAO, presets: PRESETS_PADRAO, corPostItPadrao: 'amarelo' },
  lateralAberta: true,
  ferramenta: 'selecionar',
  estiloDesenho: { ferramenta: 'lapis', cor: COR_DO_TRACO_PADRAO },
  selecao: NADA,
  editando: null,
  miniMapa: false,
  erroAoSalvar: null,
  avisosDoPrimeiroPedido: {},
  vistaAndares: false,
  emOutrasJanelas: [],
  explorador: { aberto: false, raizes: [], expandidas: [] },
  paginaAtiva: 'quadro'
}

export const ouvintes = new Set<() => void>()

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function lerEstado(): EstadoUI {
  return estado
}

/** O seletor deve devolver um pedaço do estado (não um objeto novo a cada chamada). */
export function usarLoja<T>(seletor: (e: EstadoUI) => T): T {
  return useSyncExternalStore(inscrever, () => seletor(estado))
}

/** Desiste do salvamento agendado (o espaço vai ser apagado). */
export function cancelarSalvamentoPendente(): void {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
}

/** Esquece a chave do último registro do histórico (o próximo registro não se junta ao anterior). */
export function zerarUltimaChave(): void {
  ultimaChave = null
}

export function definir(parcial: Partial<EstadoUI>): void {
  estado = { ...estado, ...parcial }
  if ('espaco' in parcial) {
    esquecerAvisosDeCartoesApagados()
    sincronizarTerminais()
    sincronizarRotinas()
    ajustarVigiasDeCodigo()
  }
  ouvintes.forEach((o) => o())
}

/** Escreve só a página ativa da casca (o único chamador é irParaPagina, em casca/paginas). */
export function escreverPaginaAtiva(id: string): void {
  definir({ paginaAtiva: id })
}

// ---------- plano à mostra (térreo ou andar) ----------

/** O plano à mostra: o próprio espaço (térreo) ou o andar ativo. Mesmo objeto enquanto não muda. */
export function planoDe(espaco: Espaco): Plano {
  return (espaco.andarAtivo && espaco.andares.find((a) => a.id === espaco.andarAtivo)) || espaco
}

export function planoAtual(): Plano | null {
  return estado.espaco ? planoDe(estado.espaco) : null
}

/** Andar à mostra, ou null no térreo. */
export function andarAtual(): Andar | null {
  const e = estado.espaco
  return (e?.andarAtivo && e.andares.find((a) => a.id === e.andarAtivo)) || null
}

/** Pasta onde os terminais do plano à mostra abrem: a do andar (worktree) ou a do projeto. */
export function pastaDoPlano(espaco: Espaco): string {
  const andar = espaco.andarAtivo ? espaco.andares.find((a) => a.id === espaco.andarAtivo) : null
  return andar?.git?.pasta ?? espaco.pasta
}

function comPlano(espaco: Espaco, plano: Plano): Espaco {
  if (!espaco.andarAtivo) return { ...espaco, ...plano }
  return { ...espaco, andares: espaco.andares.map((a) => (a.id === espaco.andarAtivo ? { ...a, ...plano } : a)) }
}

// ---------- salvar ----------

let temporizador: ReturnType<typeof setTimeout> | null = null
export let salvando: Promise<void> = Promise.resolve()

export function agendarSalvar(): void {
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(() => void salvarAgora(), 600)
}

/** Salva o que estiver pendente. Diz se deu certo (false = o arquivo em disco ficou como estava). */
export function salvarAgora(): Promise<boolean> {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  const { espaco, notas } = estado
  if (!espaco) return salvando.then(() => estado.erroAoSalvar === null)
  // a fila nunca fica presa: uma falha é registrada e o próximo salvamento tenta de novo
  salvando = salvando.then(async () => {
    try {
      const resumo = await window.ork.dados.salvarEspaco({ espaco, notas })
      definir({ erroAoSalvar: null, espacos: estado.espacos.map((e) => (e.id === resumo.id ? resumo : e)) })
    } catch (erro) {
      definir({ erroAoSalvar: String(erro) })
    }
  })
  return salvando.then(() => estado.erroAoSalvar === null)
}

/** Antes de fechar a janela: salva o pendente e diz se deu certo. */
export function salvarParaFechar(): Promise<boolean> {
  return salvarAgora()
}

// ---------- desfazer e refazer (um histórico por plano: térreo e cada andar) ----------

/** Só o conteúdo do plano e o texto dos post-its dele: desfazer num andar não mexe no térreo, e vice-versa. */
interface Instantaneo {
  plano: Plano
  notas: Record<string, string>
}

const LIMITE_HISTORICO = 100
export const historicos = new Map<string, { desfazer: Instantaneo[]; refazer: Instantaneo[] }>()
let ultimaChave: string | null = null
let ultimoRegistro = 0

const idDoPlano = (espaco: Espaco): string => espaco.andarAtivo ?? 'terreo'

function pilhasDoPlano(): { desfazer: Instantaneo[]; refazer: Instantaneo[] } {
  const id = idDoPlano(estado.espaco!)
  let pilhas = historicos.get(id)
  if (!pilhas) historicos.set(id, (pilhas = { desfazer: [], refazer: [] }))
  return pilhas
}

export function zerarHistorico(): void {
  historicos.clear()
  ultimaChave = null
}

function notasDoPlano(plano: Plano, notas: Record<string, string>): Record<string, string> {
  const doPlano: Record<string, string> = {}
  for (const n of plano.nos) if (n.tipo === 'postit') doPlano[n.arquivo] = notas[n.arquivo] ?? ''
  return doPlano
}

function instantaneoAtual(): Instantaneo {
  const { camera, nos, cordas, desenhos } = planoDe(estado.espaco!)
  const plano = { camera, nos, cordas, desenhos }
  return { plano, notas: notasDoPlano(plano, estado.notas) }
}

/**
 * Guarda o plano de antes de uma mudança. Mudanças seguidas com a mesma `chave` (arrastar, digitar,
 * redimensionar) viram um passo só; sem chave, cada mudança é um passo.
 */
export function registrarHistorico(chave?: string): void {
  if (!estado.espaco) return
  const agora = Date.now()
  const chaveCompleta = chave ? `${idDoPlano(estado.espaco)}|${chave}` : null
  if (chaveCompleta && chaveCompleta === ultimaChave && agora - ultimoRegistro < 1000) {
    ultimoRegistro = agora
    return
  }
  const pilhas = pilhasDoPlano()
  pilhas.desfazer.push(instantaneoAtual())
  if (pilhas.desfazer.length > LIMITE_HISTORICO) pilhas.desfazer.shift()
  pilhas.refazer = []
  ultimaChave = chaveCompleta
  ultimoRegistro = agora
}

function aplicarInstantaneo(i: Instantaneo): void {
  // desfazer mexe no conteúdo, não na vista: câmera, página aberta no portal e pastas abertas ficam como estão
  const atual = planoDe(estado.espaco!)
  const vista = new Map(atual.nos.map((n) => [n.id, n] as const))
  // o que os agentes fizeram não entra no desfazer do usuário: sessão aberta por agente fica, a fechada não volta
  const naEpoca = new Set(i.plano.nos.map((n) => n.id))
  const doAgente = atual.nos.filter((n) => n.tipo === 'terminal' && n.criadoPor && !naEpoca.has(n.id))
  const idsDoAgente = new Set(doAgente.map((n) => n.id))
  const nos = [
    ...i.plano.nos
      .filter((n) => !fechadosPorAgente.has(n.id))
      .map((n) => {
        const agoraNo = vista.get(n.id)
        if (n.tipo === 'portal' && agoraNo?.tipo === 'portal') return { ...n, url: agoraNo.url }
        if (n.tipo === 'pasta' && agoraNo?.tipo === 'pasta') return { ...n, expandidas: agoraNo.expandidas }
        // a conversa do agente é descoberta depois: a cópia antiga não a apaga
        if (n.tipo === 'terminal' && agoraNo?.tipo === 'terminal') return { ...n, sessao: agoraNo.sessao ?? n.sessao }
        return n
      }),
    ...doAgente
  ]
  const existe = new Set(nos.map((n) => n.id))
  const plano: Plano = {
    ...i.plano,
    camera: atual.camera,
    nos,
    cordas: [
      ...i.plano.cordas.filter((c) => existe.has(c.de) && existe.has(c.para)),
      ...atual.cordas.filter((c) => (idsDoAgente.has(c.de) || idsDoAgente.has(c.para)) && existe.has(c.de) && existe.has(c.para))
    ]
  }
  // post-its deste plano voltam ao texto da época; post-its de outros planos não são tocados
  const notas = { ...estado.notas }
  for (const arquivo of Object.keys(notasDoPlano(atual, estado.notas))) if (!(arquivo in i.notas)) delete notas[arquivo]
  Object.assign(notas, i.notas)
  definir({ espaco: comPlano(estado.espaco!, plano), notas, selecao: NADA, editando: null })
  ultimaChave = null
  agendarSalvar()
}

export function desfazer(): void {
  if (!estado.espaco) return
  const pilhas = pilhasDoPlano()
  const anterior = pilhas.desfazer.pop()
  if (!anterior) return
  pilhas.refazer.push(instantaneoAtual())
  aplicarInstantaneo(anterior)
}

export function refazer(): void {
  if (!estado.espaco) return
  const pilhas = pilhasDoPlano()
  const proximo = pilhas.refazer.pop()
  if (!proximo) return
  pilhas.desfazer.push(instantaneoAtual())
  aplicarInstantaneo(proximo)
}

/** `chave`: agrupa no histórico (ver registrarHistorico); `false`: não entra no histórico (câmera, z, vista). */
export function mudarEspaco(mudar: (espaco: Espaco) => Espaco, chave?: string | false): void {
  if (!estado.espaco) return
  if (chave !== false) registrarHistorico(chave)
  definir({ espaco: mudar(estado.espaco) })
  agendarSalvar()
}

/** Muda só o plano à mostra (térreo ou andar). */
export function mudarPlano(mudar: (plano: Plano) => Plano, chave?: string | false): void {
  mudarEspaco((e) => comPlano(e, mudar(planoDe(e))), chave)
}

/**
 * Cartão apagado (em qualquer andar) do espaço aberto: o aviso dele sai do mapa. Os avisos de outros espaços
 * ficam como estão e voltam a valer (ou são podados) quando o espaço reabrir. Sem avisos, não custa nada.
 */
function esquecerAvisosDeCartoesApagados(): void {
  const chaves = Object.keys(estado.avisosDoPrimeiroPedido)
  if (!chaves.length || !estado.espaco) return
  const prefixo = chaveDoAviso(estado.espaco.id, '')
  const vivos = chaves.filter((c) => !c.startsWith(prefixo) || existeTerminal(c.slice(prefixo.length)))
  if (vivos.length === chaves.length) return
  estado = { ...estado, avisosDoPrimeiroPedido: Object.fromEntries(vivos.map((c) => [c, estado.avisosDoPrimeiroPedido[c]])) }
}
