// Editor de Fluxos: a geometria do desenho. Puro (sem DOM, sem React, sem loja): a `geometria.prova` roda no Node.
// Tudo em coordenadas do quadro do fluxo; a câmera (`telaParaQuadro`, `zoomEm`) faz a ponte com a tela.
//
// As funções de câmera e de caixa (`telaParaQuadro`, `zoomEm`, `caixaEntre`, `seTocam`, `uniao`, `enquadrar`) são as do
// `quadro/geometria.ts`, reescritas aqui de propósito: aquele arquivo guarda o tamanho da tela e a posição do mouse do
// quadro em variáveis do módulo e reexporta sem extensão, então não carrega no Node (a prova) e não deve ser dividido
// com o editor. O quadro não é tocado. Sugestão para depois: mover essas 6 funções para `shared/`.
import type { Camera } from '../../../../../shared/modelo'
import type { NoDoFluxo, TipoDeNo } from '../../../../../shared/fluxos/tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { ehGatilho, quantasSaidas } from '../../../../../shared/fluxos/nos.ts'

export interface Ponto {
  x: number
  y: number
}

export interface Caixa {
  x: number
  y: number
  largura: number
  altura: number
}

// ---------------------------------------------------------------- medidas do desenho

export const LARGURA_DO_NO = 200
/** Altura do nó de uma saída; cada saída a mais soma `ALTURA_POR_SAIDA`. */
export const ALTURA_BASE = 56
export const ALTURA_POR_SAIDA = 24
/** Raio da porta na tela, em pixels (o acerto do clique é maior que a bolinha desenhada). */
export const RAIO_DA_PORTA = 12
export const GRADE = 20
export const ZOOM_MIN = 0.2
export const ZOOM_MAX = 2

/** Largura e altura do nó. A altura cresce com o número de saídas (o Se tem 2). */
export function medidasDoNo(tipo: TipoDeNo): { largura: number; altura: number } {
  const saidas = Math.max(1, quantasSaidas(tipo))
  return { largura: LARGURA_DO_NO, altura: ALTURA_BASE + (saidas - 1) * ALTURA_POR_SAIDA }
}

type NoParaDesenhar = Pick<NoDoFluxo, 'tipo' | 'posicao'>

export function caixaDoNoDoFluxo(no: NoParaDesenhar): Caixa {
  const { largura, altura } = medidasDoNo(no.tipo)
  return { x: no.posicao[0], y: no.posicao[1], largura, altura }
}

// ---------------------------------------------------------------- portas

/** Gatilho não recebe ligação, então não tem porta de entrada. */
export const temEntrada = (tipo: TipoDeNo): boolean => !ehGatilho(tipo)

/** A porta de entrada: no meio do lado esquerdo. `null` para gatilho. */
export function portaDeEntrada(no: NoParaDesenhar): Ponto | null {
  if (!temEntrada(no.tipo)) return null
  const c = caixaDoNoDoFluxo(no)
  return { x: c.x, y: c.y + c.altura / 2 }
}

/** A porta da saída `saida` (0, 1…): no lado direito, as saídas repartidas em partes iguais da altura. `null` se não existe. */
export function portaDeSaida(no: NoParaDesenhar, saida: number): Ponto | null {
  const n = quantasSaidas(no.tipo)
  if (!Number.isInteger(saida) || saida < 0 || saida >= n) return null
  const c = caixaDoNoDoFluxo(no)
  return { x: c.x + c.largura, y: c.y + (c.altura * (saida + 1)) / (n + 1) }
}

/** Todas as portas de saída do nó, na ordem. */
export const portasDeSaida = (no: NoParaDesenhar): Ponto[] =>
  Array.from({ length: quantasSaidas(no.tipo) }, (_, i) => portaDeSaida(no, i)!)

// ---------------------------------------------------------------- curvas

/**
 * A curva de uma ligação: sai da porta de saída para a direita e entra na de entrada pela esquerda. Se o destino está
 * atrás, as alças crescem e a curva dá a volta em vez de cruzar o nó.
 */
export function curvaDaLigacao(de: Ponto, para: Ponto): string {
  const dx = para.x - de.x
  const alca = Math.max(40, Math.abs(dx) / 2)
  return `M ${de.x} ${de.y} C ${de.x + alca} ${de.y}, ${para.x - alca} ${para.y}, ${para.x} ${para.y}`
}

/** A curva de uma ligação já feita; `null` se algum dos dois nós ou a saída não existe. */
export function curvaEntreNos(de: NoParaDesenhar | undefined, saida: number, para: NoParaDesenhar | undefined): string | null {
  const a = de ? portaDeSaida(de, saida) : null
  const b = para ? portaDeEntrada(para) : null
  return a && b ? curvaDaLigacao(a, b) : null
}

// ---------------------------------------------------------------- acerto do clique

/** O raio de acerto da porta em coordenadas do quadro: o da tela dividido pelo zoom (perto do nó, no zoom baixo, ainda acerta). */
export const raioNoQuadro = (zoom: number, raioNaTela = RAIO_DA_PORTA): number => raioNaTela / Math.max(zoom, ZOOM_MIN)

const distancia = (a: Ponto, b: Ponto): number => Math.hypot(a.x - b.x, a.y - b.y)

export interface PortaDeSaidaAcertada {
  no: string
  saida: number
}

/**
 * A porta de saída sob `ponto` (a mais perto, dentro de `raio`); `null` se nenhuma. Se dois nós se sobrepõem, vale o de
 * cima (o último da lista).
 */
export function portaDeSaidaEm(nos: readonly (NoParaDesenhar & { id: string })[], ponto: Ponto, raio: number): PortaDeSaidaAcertada | null {
  let melhor: (PortaDeSaidaAcertada & { d: number }) | null = null
  for (let i = nos.length - 1; i >= 0; i--) {
    const no = nos[i]
    const portas = portasDeSaida(no)
    for (let s = 0; s < portas.length; s++) {
      const d = distancia(ponto, portas[s])
      if (d <= raio && (melhor === null || d < melhor.d)) melhor = { no: no.id, saida: s, d }
    }
  }
  return melhor ? { no: melhor.no, saida: melhor.saida } : null
}

/** O nó (de cima) cuja caixa contém o ponto; `null` se for o vazio. */
export function noEm(nos: readonly (NoParaDesenhar & { id: string })[], ponto: Ponto): string | null {
  for (let i = nos.length - 1; i >= 0; i--) {
    const c = caixaDoNoDoFluxo(nos[i])
    if (ponto.x >= c.x && ponto.x <= c.x + c.largura && ponto.y >= c.y && ponto.y <= c.y + c.altura) return nos[i].id
  }
  return null
}

/**
 * Onde soltar uma ligação que veio de uma saída: a porta de entrada mais perto dentro de `raio`, ou então o corpo de um
 * nó que tem entrada (soltar em cima do nó liga na entrada dele). Sem acerto, ou em gatilho, `null`: soltar no vazio
 * abre a busca de nós (a tela decide). O nó de origem é ignorado.
 */
export function alvoDaLigacao(nos: readonly (NoParaDesenhar & { id: string })[], ponto: Ponto, raio: number, origem?: string): string | null {
  let melhor: { id: string; d: number } | null = null
  for (let i = nos.length - 1; i >= 0; i--) {
    const no = nos[i]
    if (no.id === origem) continue
    const porta = portaDeEntrada(no)
    if (!porta) continue
    const d = distancia(ponto, porta)
    if (d <= raio && (melhor === null || d < melhor.d)) melhor = { id: no.id, d }
  }
  if (melhor) return melhor.id
  const corpo = noEm(nos, ponto)
  if (corpo === null || corpo === origem) return null
  const no = nos.find((n) => n.id === corpo)
  return no && temEntrada(no.tipo) ? corpo : null
}

/** Ids dos nós cuja caixa toca a `area` (o retângulo de seleção). */
export const nosNaArea = (nos: readonly (NoParaDesenhar & { id: string })[], area: Caixa): string[] =>
  nos.filter((n) => seTocam(caixaDoNoDoFluxo(n), area)).map((n) => n.id)

// ---------------------------------------------------------------- câmera e caixas (as puras do quadro)

export function telaParaQuadro(p: Ponto, camera: Camera): Ponto {
  return { x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom }
}

/** Onde entra (canto de cima à esquerda, no quadro) um nó de uma saída centrado num ponto da tela: o "+" do fluxo vazio. */
export function noCentradoNaTela(centro: Ponto, camera: Camera): Ponto {
  const q = telaParaQuadro(centro, camera)
  return { x: q.x - LARGURA_DO_NO / 2, y: q.y - ALTURA_BASE / 2 }
}

export function quadroParaTela(p: Ponto, camera: Camera): Ponto {
  return { x: p.x * camera.zoom + camera.x, y: p.y * camera.zoom + camera.y }
}

export const limitarZoom = (zoom: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))

/** Câmera nova com `zoom` (limitado), mantendo parado o ponto da tela `ancora`. */
export function zoomEm(camera: Camera, zoom: number, ancora: Ponto): Camera {
  const z = limitarZoom(zoom)
  const noQuadro = telaParaQuadro(ancora, camera)
  return { zoom: z, x: ancora.x - noQuadro.x * z, y: ancora.y - noQuadro.y * z }
}

export function seTocam(a: Caixa, b: Caixa): boolean {
  return a.x <= b.x + b.largura && b.x <= a.x + a.largura && a.y <= b.y + b.altura && b.y <= a.y + a.altura
}

/** Caixa entre dois pontos, em qualquer direção (retângulo de seleção). */
export function caixaEntre(a: Ponto, b: Ponto): Caixa {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), largura: Math.abs(b.x - a.x), altura: Math.abs(b.y - a.y) }
}

export function uniao(caixas: readonly Caixa[]): Caixa | null {
  if (caixas.length === 0) return null
  const x = Math.min(...caixas.map((c) => c.x))
  const y = Math.min(...caixas.map((c) => c.y))
  const fimX = Math.max(...caixas.map((c) => c.x + c.largura))
  const fimY = Math.max(...caixas.map((c) => c.y + c.altura))
  return { x, y, largura: fimX - x, altura: fimY - y }
}

/** Câmera que mostra a caixa inteira, com folga, sem passar de 100% (o tamanho da tela vem de quem chama, não de variável do módulo). */
export function enquadrar(caixa: Caixa, tela: { largura: number; altura: number }, folga = 80): Camera {
  const zoom = limitarZoom(
    Math.min(1, Math.min((tela.largura - folga * 2) / Math.max(caixa.largura, 1), (tela.altura - folga * 2) / Math.max(caixa.altura, 1)))
  )
  return {
    zoom,
    x: tela.largura / 2 - (caixa.x + caixa.largura / 2) * zoom,
    y: tela.altura / 2 - (caixa.y + caixa.altura / 2) * zoom
  }
}

/** Enquadra todos os nós (ou, sem nós, a câmera de partida). */
export function enquadrarNos(nos: readonly NoParaDesenhar[], tela: { largura: number; altura: number }): Camera {
  const todos = uniao(nos.map(caixaDoNoDoFluxo))
  return todos ? enquadrar(todos, tela) : CAMERA_INICIAL
}

export const CAMERA_INICIAL: Camera = { x: 0, y: 0, zoom: 1 }

/** Encaixa um valor na grade. */
export const naGrade = (valor: number, passo = GRADE): number => Math.round(valor / passo) * passo

/**
 * Câmera que deixa a `caixa` inteira dentro da `tela` (a faixa da área que não está coberta, ex.: acima do painel do
 * nó). Já à vista: devolve a mesma câmera (mesma referência). Senão, centraliza a caixa na faixa, no mesmo zoom.
 */
export function trazerAVista(caixa: Caixa, camera: Camera, tela: { largura: number; altura: number }): Camera {
  const a = quadroParaTela(caixa, camera)
  const largura = caixa.largura * camera.zoom
  const altura = caixa.altura * camera.zoom
  if (a.x >= 0 && a.y >= 0 && a.x + largura <= tela.largura && a.y + altura <= tela.altura) return camera
  return { ...camera, x: tela.largura / 2 - (caixa.x + caixa.largura / 2) * camera.zoom, y: tela.altura / 2 - (caixa.y + caixa.altura / 2) * camera.zoom }
}
