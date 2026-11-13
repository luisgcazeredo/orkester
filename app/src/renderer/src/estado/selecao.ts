import { type Camera, type Desenho, type No, type Plano } from '../../../shared/modelo'
import { enquadrar, lerViewport } from '../quadro/geometria'
import { irParaAndar } from './andares'
import { trazerParaFrente } from './nos'
import { type Alvo, definir, estado, type EstadoUI, type Ferramenta, mudarPlano, NADA, planoAtual, type Selecao } from './nucleo'

// ---------- ferramentas e seleção ----------

export function escolherFerramenta(ferramenta: Ferramenta): void {
  definir({ ferramenta, editando: null })
}

export function definirEstiloDesenho(estilo: Partial<EstadoUI['estiloDesenho']>): void {
  definir({ estiloDesenho: { ...estado.estiloDesenho, ...estilo }, ferramenta: 'desenho' })
}

function contem(s: Selecao, alvo: Alvo): boolean {
  if (alvo.tipo === 'corda') return s.corda === alvo.id
  return (alvo.tipo === 'no' ? s.nos : s.desenhos).includes(alvo.id)
}

export function estaSelecionado(alvo: Alvo): boolean {
  return contem(estado.selecao, alvo)
}

function grupoDo(plano: Plano, alvo: Alvo): string | undefined {
  if (alvo.tipo === 'no') return plano.nos.find((n) => n.id === alvo.id)?.grupo
  if (alvo.tipo === 'desenho') return plano.desenhos.find((d) => d.id === alvo.id)?.grupo
  return undefined
}

/** Grupos que têm algum item na seleção. */
export function gruposDa(plano: Plano, s: Selecao): Set<string> {
  const itens = [...plano.nos.filter((n) => s.nos.includes(n.id)), ...plano.desenhos.filter((d) => s.desenhos.includes(d.id))]
  return new Set(itens.flatMap((i) => (i.grupo ? [i.grupo] : [])))
}

/** A seleção mais os outros itens dos grupos que ela toca. */
function comGrupos(plano: Plano, s: Selecao): Selecao {
  const grupos = gruposDa(plano, s)
  if (!grupos.size) return s
  const entra = (i: { id: string; grupo?: string }, ids: string[]): boolean => ids.includes(i.id) || (!!i.grupo && grupos.has(i.grupo))
  return {
    nos: plano.nos.filter((n) => entra(n, s.nos)).map((n) => n.id),
    desenhos: plano.desenhos.filter((d) => entra(d, s.desenhos)).map((d) => d.id),
    corda: null
  }
}

const juntar = (a: Selecao, b: Selecao): Selecao => ({
  nos: [...new Set([...a.nos, ...b.nos])],
  desenhos: [...new Set([...a.desenhos, ...b.desenhos])],
  corda: null
})

function definirSelecao(selecao: Selecao, paraFrente = false): void {
  if (paraFrente) trazerParaFrente(selecao.nos)
  definir({ selecao, editando: estado.editando && selecao.nos.includes(estado.editando) ? estado.editando : null })
}

/**
 * Muda a seleção. Um item de grupo traz o grupo inteiro, a não ser com `sozinho`.
 * `somar` (Shift ou Ctrl): põe o item (com o grupo) na seleção, ou tira se já estava.
 */
export function selecionar(alvo: Alvo | null, opcoes: { somar?: boolean; sozinho?: boolean } = {}): void {
  const plano = planoAtual()
  if (!alvo || !plano) return definirSelecao(NADA)
  if (alvo.tipo === 'corda') return definirSelecao({ ...NADA, corda: alvo.id })
  const item: Selecao = alvo.tipo === 'no' ? { ...NADA, nos: [alvo.id] } : { ...NADA, desenhos: [alvo.id] }
  const novos = opcoes.sozinho ? item : comGrupos(plano, item)
  if (!opcoes.somar) return definirSelecao(novos, true)
  const atual = estado.selecao
  if (!contem(atual, alvo)) return definirSelecao(juntar(atual, novos))
  definirSelecao({
    nos: atual.nos.filter((id) => !novos.nos.includes(id)),
    desenhos: atual.desenhos.filter((id) => !novos.desenhos.includes(id)),
    corda: null
  })
}

/** Vários de uma vez (retângulo de seleção), sempre com os grupos inteiros. */
export function selecionarVarios(nos: string[], desenhos: string[], somar = false): void {
  const plano = planoAtual()
  if (!plano) return
  const novos = comGrupos(plano, { nos, desenhos, corda: null })
  definirSelecao(somar ? juntar(estado.selecao, novos) : novos)
}

export function selecionarTudo(): void {
  const plano = planoAtual()
  if (plano) definirSelecao({ nos: plano.nos.map((n) => n.id), desenhos: plano.desenhos.map((d) => d.id), corda: null })
}

/** O item, se a seleção é exatamente um cartão ou um traço. */
function itemUnico(s: Selecao): Alvo | null {
  if (s.corda || s.nos.length + s.desenhos.length !== 1) return null
  return s.nos.length ? { tipo: 'no', id: s.nos[0] } : { tipo: 'desenho', id: s.desenhos[0] }
}

/**
 * Clique sem Shift num item, como no Canva: seleciona o grupo inteiro; quem já está "dentro" do grupo
 * (com um item dele selecionado) pega o item clicado. Item já selecionado não muda nada: arrastar leva todos.
 */
export function selecionarPeloClique(alvo: Alvo): void {
  const plano = planoAtual()
  if (!plano || estaSelecionado(alvo)) return
  const grupo = grupoDo(plano, alvo)
  const unico = itemUnico(estado.selecao)
  selecionar(alvo, { sozinho: !!grupo && !!unico && grupoDo(plano, unico) === grupo })
}

/** Soltou sem arrastar num item que estava selecionado junto com outros: fica só ele (entra no grupo). */
export function focarItem(alvo: Alvo): void {
  const s = estado.selecao
  if (s.nos.length + s.desenhos.length > 1 && contem(s, alvo)) selecionar(alvo, { sozinho: true })
}

export interface InfoSelecao {
  nos: No[]
  desenhos: Desenho[]
  itens: number
  /** A seleção é exatamente um grupo inteiro. */
  umGrupo: boolean
  /** Algum item selecionado está num grupo. */
  temGrupo: boolean
  /** Peças para alinhar e distribuir: cada grupo conta como uma. */
  pecas: number
  /** Todos os cartões selecionados estão travados. */
  travados: boolean
}

export function infoDaSelecao(): InfoSelecao {
  const plano = planoAtual()
  const s = estado.selecao
  const nos = plano?.nos.filter((n) => s.nos.includes(n.id)) ?? []
  const desenhos = plano?.desenhos.filter((d) => s.desenhos.includes(d.id)) ?? []
  const itens = [...nos, ...desenhos]
  const grupos = new Set(itens.map((i) => i.grupo ?? `solto:${i.id}`))
  return {
    nos,
    desenhos,
    itens: itens.length,
    umGrupo: itens.length > 1 && grupos.size === 1 && !!itens[0].grupo,
    temGrupo: itens.some((i) => i.grupo),
    pecas: grupos.size,
    travados: nos.length > 0 && nos.every((n) => n.travado)
  }
}

export function editar(id: string | null): void {
  definir({ editando: id, selecao: id ? { ...NADA, nos: [id] } : estado.selecao })
}

export function alternarMiniMapa(): void {
  definir({ miniMapa: !estado.miniMapa })
}

// ---------- câmera ----------

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 2

export function definirCamera(camera: Camera): void {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom))
  mudarPlano((p) => ({ ...p, camera: { ...camera, zoom } }), false)
}

/** Seleciona e traz um cartão para a tela, inclusive se ele mora em outro andar deste espaço. */
export function enquadrarNo(id: string): void {
  const e = estado.espaco
  if (!e) return
  const andar = e.andares.find((a) => a.nos.some((n) => n.id === id))
  if (andar) irParaAndar(andar.id)
  else if (e.nos.some((n) => n.id === id)) irParaAndar(null)
  else return
  const no = planoAtual()?.nos.find((n) => n.id === id)
  if (!no) return
  const cam = planoAtual()!.camera
  const { largura, altura } = lerViewport()
  const zoom = Math.max(cam.zoom, 0.5)
  definirCamera(
    no.largura * zoom > largura * 0.9 || no.altura * zoom > altura * 0.9
      ? enquadrar({ x: no.x, y: no.y, largura: no.largura, altura: no.altura }, 60)
      : { zoom, x: largura / 2 - (no.x + no.largura / 2) * zoom, y: altura / 2 - (no.y + no.altura / 2) * zoom }
  )
  selecionar({ tipo: 'no', id }, { sozinho: true })
}
