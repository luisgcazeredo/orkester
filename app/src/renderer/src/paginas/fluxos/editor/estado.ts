// Editor de Fluxos: o estado do rascunho. Um reducer puro (sem DOM, sem React): nós, ligações, seleção, câmera e
// desfazer até 50 passos; a `estado.prova` roda no Node. O rascunho vive só na memória: quem grava é o botão Salvar
// (a tela compara com o que veio do disco por `estaSujo`). As regras do grafo são as de `validarGrafo` (formato.ts),
// as mesmas que o main aplica ao gravar; o editor só recusa mais cedo.
import type { Camera } from '../../../../../shared/modelo'
import type { FluxoExportado, Ligacao, NoDoFluxo, TipoDeNo } from '../../../../../shared/fluxos/tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { chaveDoNome, colarNoFluxo, MAX_LIGACOES, MAX_NOME_DO_NO, MAX_NOS, nomeLivre, proximoIdDeNo, validarGrafo } from '../../../../../shared/fluxos/formato.ts'
// @ts-expect-error idem
import { CATALOGO, quantasSaidas } from '../../../../../shared/fluxos/nos.ts'

export const MAX_PASSOS_DE_DESFAZER = 50

/** O que o desfazer guarda. Os arrays são trocados, nunca editados: os passos dividem o que não mudou. */
export interface Instantaneo {
  nome: string
  nos: readonly NoDoFluxo[]
  ligacoes: readonly Ligacao[]
}

export interface EstadoDoEditor extends Instantaneo {
  /** Ids dos nós selecionados. Selecionar não entra no desfazer nem suja o rascunho. */
  selecao: readonly string[]
  /** A câmera também fica de fora do desfazer. */
  camera: Camera
  passado: readonly Instantaneo[]
  futuro: readonly Instantaneo[]
  /** O que foi gravado por último (para `estaSujo`). */
  salvo: Instantaneo
  /** Chave da última ação que pode juntar com a próxima no mesmo passo (arrastar, digitar); `null` = nenhuma. */
  juntando: string | null
}

export type AcaoDoEditor =
  /** Põe um fluxo no editor (abrir, ou recarregar depois de salvar): zera seleção e desfazer, e o rascunho fica limpo. */
  | { tipo: 'carregar'; fluxo: Pick<FluxoExportado, 'nome' | 'nos' | 'ligacoes'>; camera?: Camera }
  /** Depois de gravar: `de` (o que foi enviado) passa a valer como o salvo; sem `de`, o rascunho de agora. O desfazer continua. */
  | { tipo: 'marcarSalvo'; de?: Instantaneo }
  | { tipo: 'renomearFluxo'; nome: string }
  /** Nó novo de `tipo` em `posicao`, já selecionado. Com `ligarDe`, nasce ligado àquela saída (um passo só). */
  | { tipo: 'adicionarNo'; no: TipoDeNo; posicao: [number, number]; id?: string; ligarDe?: { no: string; saida: number } }
  /** `posicoes`: a posição nova de cada nó. `gesto`: durante o arrasto, os eventos viram um passo só até `fimDoGesto`. */
  | { tipo: 'mover'; posicoes: Readonly<Record<string, [number, number]>>; gesto?: boolean }
  | { tipo: 'fimDoGesto' }
  | { tipo: 'ligar'; de: string; saida: number; para: string }
  | { tipo: 'desligar'; de: string; saida: number; para: string }
  /** Apaga os nós e leva junto toda ligação que entra ou sai deles. */
  | { tipo: 'apagar'; ids: readonly string[] }
  | { tipo: 'renomearNo'; id: string; nome: string }
  /** Troca os ajustes e/ou as notas de um nó (o formulário). Digitar seguido no mesmo nó é um passo só. */
  | { tipo: 'ajustar'; id: string; ajustes?: Record<string, unknown>; notas?: string }
  /** Cola nós de fora (ou do Ctrl+C), com `deslocar` somado à posição para não cair em cima dos originais. */
  | { tipo: 'colar'; nos: readonly NoDoFluxo[]; ligacoes: readonly Ligacao[]; deslocar?: [number, number] }
  | { tipo: 'selecionar'; ids: readonly string[]; somar?: boolean }
  | { tipo: 'selecionarTudo' }
  | { tipo: 'camera'; camera: Camera }
  | { tipo: 'desfazer' }
  | { tipo: 'refazer' }

const CAMERA_PADRAO: Camera = { x: 0, y: 0, zoom: 1 }

export function estadoInicial(fluxo?: Pick<FluxoExportado, 'nome' | 'nos' | 'ligacoes'>, camera: Camera = CAMERA_PADRAO): EstadoDoEditor {
  const base: Instantaneo = { nome: fluxo?.nome ?? '', nos: fluxo?.nos ?? [], ligacoes: fluxo?.ligacoes ?? [] }
  return { ...base, selecao: [], camera, passado: [], futuro: [], salvo: base, juntando: null }
}

/** Há mudança que ainda não foi gravada? Desfazer até o salvo volta a limpo (os arrays voltam a ser os mesmos). */
export const estaSujo = (e: EstadoDoEditor): boolean => e.nome !== e.salvo.nome || e.nos !== e.salvo.nos || e.ligacoes !== e.salvo.ligacoes

/** O rascunho no formato de gravar e de exportar. */
export const comoFluxo = (e: EstadoDoEditor): FluxoExportado => ({ orkester: 'fluxo', versao: 1, nome: e.nome, nos: [...e.nos], ligacoes: [...e.ligacoes] })

// ---------------------------------------------------------------- o que se pode fazer (motivo da recusa, ou `null`)

/** Por que `de.saida → para` não pode ser feita agora; `null` = pode. A tela mostra o motivo. */
export function recusaDeLigar(e: Pick<EstadoDoEditor, 'nos' | 'ligacoes'>, de: string, saida: number, para: string): string | null {
  const origem = e.nos.find((n) => n.id === de)
  const destino = e.nos.find((n) => n.id === para)
  if (!origem || !destino) return 'esse nó não existe mais'
  if (de === para) return 'um nó não liga nele mesmo'
  if (!Number.isInteger(saida) || saida < 0 || saida >= quantasSaidas(origem.tipo)) return `"${origem.nome}" não tem essa saída`
  if (e.ligacoes.length >= MAX_LIGACOES) return `no máximo ${MAX_LIGACOES} ligações`
  return validarGrafo(e.nos, [...e.ligacoes, { de, saida, para }])
}

/** Por que não cabe mais um nó; `null` = cabe. */
export const recusaDeAdicionar = (e: Pick<EstadoDoEditor, 'nos'>): string | null => (e.nos.length >= MAX_NOS ? `no máximo ${MAX_NOS} nós` : null)

/** O nome do nó é válido? Uma linha, até 60 letras, único no fluxo (sem diferenciar maiúsculas). */
export function recusaDeNome(e: Pick<EstadoDoEditor, 'nos'>, id: string, nome: string): string | null {
  const limpo = nome.trim()
  if (!limpo) return 'dê um nome ao nó'
  if (/[\r\n]/.test(limpo)) return 'o nome é de uma linha só'
  if (limpo.length > MAX_NOME_DO_NO) return `o nome passa de ${MAX_NOME_DO_NO} letras`
  const chave = chaveDoNome(limpo)
  return e.nos.some((n) => n.id !== id && chaveDoNome(n.nome) === chave) ? `já existe um nó chamado "${limpo}"` : null
}

// ---------------------------------------------------------------- reducer

const snapshot = (e: EstadoDoEditor): Instantaneo => ({ nome: e.nome, nos: e.nos, ligacoes: e.ligacoes })

/**
 * Aplica uma mudança de conteúdo guardando o passo anterior para o desfazer. Com a mesma `juntar` da ação anterior, não
 * guarda outro passo (arrastar e digitar viram um passo só).
 */
function mudar(e: EstadoDoEditor, parte: Partial<Instantaneo>, extra: Partial<EstadoDoEditor> = {}, juntar: string | null = null): EstadoDoEditor {
  const igual = (parte.nome === undefined || parte.nome === e.nome) && (parte.nos === undefined || parte.nos === e.nos) && (parte.ligacoes === undefined || parte.ligacoes === e.ligacoes)
  if (igual && Object.keys(extra).length === 0) return e
  const guarda = juntar !== null && e.juntando === juntar ? e.passado : [...e.passado, snapshot(e)].slice(-MAX_PASSOS_DE_DESFAZER)
  return { ...e, ...parte, ...extra, passado: guarda, futuro: [], juntando: juntar }
}

/** Tira da seleção o que não existe mais. */
const selecaoValida = (selecao: readonly string[], nos: readonly NoDoFluxo[]): readonly string[] => {
  const ids = new Set(nos.map((n) => n.id))
  const ficou = selecao.filter((id) => ids.has(id))
  return ficou.length === selecao.length ? selecao : ficou
}

function copiarAjustes<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

export function reduzir(e: EstadoDoEditor, a: AcaoDoEditor): EstadoDoEditor {
  switch (a.tipo) {
    case 'carregar':
      return estadoInicial(a.fluxo, a.camera ?? e.camera)

    case 'marcarSalvo':
      return { ...e, salvo: a.de ? { nome: a.de.nome, nos: a.de.nos, ligacoes: a.de.ligacoes } : snapshot(e) }

    case 'renomearFluxo': {
      const nome = a.nome.replace(/[\r\n]+/g, ' ')
      return nome === e.nome ? e : mudar(e, { nome }, {}, 'renomearFluxo')
    }

    case 'adicionarNo': {
      if (recusaDeAdicionar(e)) return e
      const def = CATALOGO[a.no]
      if (!def) return e
      const usados = new Set<string>(e.nos.map((n) => n.id))
      const id = a.id && !usados.has(a.id) ? a.id : proximoIdDeNo(usados)
      const no: NoDoFluxo = {
        id,
        nome: nomeLivre(def.rotulo, new Set(e.nos.map((n) => chaveDoNome(n.nome)))),
        tipo: a.no,
        versaoDoTipo: 1,
        posicao: [a.posicao[0], a.posicao[1]],
        ajustes: copiarAjustes(def.padrao() as Record<string, unknown>)
      }
      const nos = [...e.nos, no]
      let ligacoes: readonly Ligacao[] = e.ligacoes
      if (a.ligarDe) {
        const nova: Ligacao = { de: a.ligarDe.no, saida: a.ligarDe.saida, para: id }
        // o nó entra, mas só se a ligação pedida valer; senão nada muda (a tela já tinha conferido a origem)
        if (recusaDeLigar({ nos, ligacoes: e.ligacoes }, nova.de, nova.saida, nova.para)) return e
        ligacoes = [...e.ligacoes, nova]
      }
      return mudar(e, { nos, ligacoes }, { selecao: [id] })
    }

    case 'mover': {
      const ids = Object.keys(a.posicoes)
      let mudou = false
      const nos = e.nos.map((n) => {
        const p = a.posicoes[n.id]
        if (!p || (p[0] === n.posicao[0] && p[1] === n.posicao[1])) return n
        mudou = true
        return { ...n, posicao: [p[0], p[1]] as [number, number] }
      })
      if (!mudou) return e
      return mudar(e, { nos }, {}, a.gesto ? `mover:${ids.sort().join(',')}` : null)
    }

    case 'fimDoGesto':
      return e.juntando === null ? e : { ...e, juntando: null }

    case 'ligar': {
      if (recusaDeLigar(e, a.de, a.saida, a.para)) return e
      return mudar(e, { ligacoes: [...e.ligacoes, { de: a.de, saida: a.saida, para: a.para }] })
    }

    case 'desligar': {
      const ligacoes = e.ligacoes.filter((l) => !(l.de === a.de && l.saida === a.saida && l.para === a.para))
      return ligacoes.length === e.ligacoes.length ? e : mudar(e, { ligacoes })
    }

    case 'apagar': {
      const fora = new Set(a.ids)
      const nos = e.nos.filter((n) => !fora.has(n.id))
      if (nos.length === e.nos.length) return e
      const ligacoes = e.ligacoes.filter((l) => !fora.has(l.de) && !fora.has(l.para))
      return mudar(e, { nos, ligacoes }, { selecao: selecaoValida(e.selecao, nos) })
    }

    case 'renomearNo': {
      if (recusaDeNome(e, a.id, a.nome)) return e
      const nome = a.nome.trim()
      const no = e.nos.find((n) => n.id === a.id)
      if (!no || no.nome === nome) return e
      return mudar(e, { nos: e.nos.map((n) => (n.id === a.id ? { ...n, nome } : n)) })
    }

    case 'ajustar': {
      const no = e.nos.find((n) => n.id === a.id)
      if (!no) return e
      // sem cortar espaços: é o que a pessoa está digitando (o main limpa ao gravar); só a nota toda em branco some
      const notas = a.notas === undefined ? no.notas : a.notas.trim() ? a.notas : undefined
      if ((a.ajustes === undefined || a.ajustes === no.ajustes) && notas === no.notas) return e
      const novo: NoDoFluxo = { ...no, ajustes: a.ajustes ?? no.ajustes }
      if (notas === undefined) delete novo.notas
      else novo.notas = notas
      return mudar(e, { nos: e.nos.map((n) => (n.id === a.id ? novo : n)) }, {}, `ajustar:${a.id}`)
    }

    case 'colar': {
      const [dx, dy] = a.deslocar ?? [0, 0]
      const colado = {
        nos: a.nos.map((n) => ({ ...copiarAjustes(n), posicao: [n.posicao[0] + dx, n.posicao[1] + dy] as [number, number] })),
        ligacoes: a.ligacoes.map((l) => ({ ...l }))
      }
      if (colado.nos.length === 0) return e
      const r = colarNoFluxo({ nos: [...e.nos], ligacoes: [...e.ligacoes] }, { nos: colado.nos, ligacoes: colado.ligacoes })
      if (typeof r === 'string') return e
      const novos = colado.nos.map((n) => r.ids[n.id])
      return mudar(e, { nos: r.nos, ligacoes: r.ligacoes }, { selecao: novos })
    }

    case 'selecionar': {
      const existentes = new Set(e.nos.map((n) => n.id))
      const pedidos = a.ids.filter((id) => existentes.has(id))
      const selecao = a.somar ? [...new Set([...e.selecao, ...pedidos])] : pedidos
      const igual = selecao.length === e.selecao.length && selecao.every((id, i) => id === e.selecao[i])
      return igual ? e : { ...e, selecao, juntando: null }
    }

    case 'selecionarTudo':
      return { ...e, selecao: e.nos.map((n) => n.id), juntando: null }

    case 'camera':
      return { ...e, camera: a.camera }

    case 'desfazer': {
      const anterior = e.passado[e.passado.length - 1]
      if (!anterior) return e
      const nos = anterior.nos
      return { ...e, ...anterior, selecao: selecaoValida(e.selecao, nos), passado: e.passado.slice(0, -1), futuro: [...e.futuro, snapshot(e)].slice(-MAX_PASSOS_DE_DESFAZER), juntando: null }
    }

    case 'refazer': {
      const proximo = e.futuro[e.futuro.length - 1]
      if (!proximo) return e
      return { ...e, ...proximo, selecao: selecaoValida(e.selecao, proximo.nos), futuro: e.futuro.slice(0, -1), passado: [...e.passado, snapshot(e)].slice(-MAX_PASSOS_DE_DESFAZER), juntando: null }
    }
  }
}

export const podeDesfazer = (e: EstadoDoEditor): boolean => e.passado.length > 0
export const podeRefazer = (e: EstadoDoEditor): boolean => e.futuro.length > 0
