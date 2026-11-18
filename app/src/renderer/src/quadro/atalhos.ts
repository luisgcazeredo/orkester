/**
 * Atalhos de teclado da página `quadro`. A decisão (`decidir`) é uma função pura: tecla + contexto → ação, sem DOM nem
 * loja; a `atalhos.prova` a roda no Node. Este arquivo não importa nada do app em tempo de execução: quem sabe
 * "o que é" cada ação (loja, zoom, paleta…) entrega isso a `criarAtalhos`, que só liga decisão e execução ao `keydown`.
 */

export interface TeclaEv {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export type FerramentaAtalho = 'selecionar' | 'postit' | 'texto' | 'desenho'

export interface Contexto {
  /** Página ativa da casca: só `quadro` tem esses atalhos. */
  pagina: string
  /** Foco num campo de texto (post-it, texto, input…). */
  digitando: boolean
  menuAberto: boolean
  /** Janela de confirmação (`.dialogo-fundo`) aberta. */
  dialogoAberto: boolean
  /** Há um terminal selecionado sozinho com o teclado dele. */
  terminalComTeclado: boolean
  /** No meio de um arrasto ou desenho. */
  emGesto: boolean
  /** Uma camada do quadro é dona do teclado: Vista dos andares e Menu do Terminal abertos; Explorador, Mini mapa e Lateral com o foco dentro. */
  camadaAberta: boolean
}

export type Acao =
  | { tipo: 'devolverFoco' }
  | { tipo: 'cancelarGesto' }
  | { tipo: 'fecharCamada' }
  | { tipo: 'zoom'; fator: number | 'inicial' }
  | { tipo: 'enquadrarTudo' }
  | { tipo: 'desfazer' }
  | { tipo: 'refazer' }
  | { tipo: 'duplicar' }
  | { tipo: 'selecionarTudo' }
  | { tipo: 'agrupar' }
  | { tipo: 'desagrupar' }
  | { tipo: 'copiar'; recortar: boolean }
  | { tipo: 'colar' }
  | { tipo: 'paleta' }
  | { tipo: 'novaJanela' }
  | { tipo: 'alternarExplorador' }
  | { tipo: 'empurrar'; dx: number; dy: number }
  | { tipo: 'mostrarAtalhos' }
  | { tipo: 'apagar' }
  | { tipo: 'escape' }
  | { tipo: 'borracha' }
  | { tipo: 'ferramenta'; ferramenta: FerramentaAtalho }

/** `prevenir`: o `keydown` leva `preventDefault()` (era o que o App fazia, tecla a tecla). */
export interface Decisao {
  acao: Acao
  prevenir: boolean
}

const SETAS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
const FERRAMENTAS: Record<string, FerramentaAtalho> = { v: 'selecionar', n: 'postit', t: 'texto', d: 'desenho' }

const com = (acao: Acao): Decisao => ({ acao, prevenir: true })
const sem = (acao: Acao): Decisao => ({ acao, prevenir: false })

/** `null`: a tecla não é atalho agora (o evento segue como está). A ordem das regras é a que o App tinha. */
export function decidir(e: TeclaEv, c: Contexto): Decisao | null {
  if (c.pagina !== 'quadro') return null
  // escrevendo num post-it, texto ou campo, com um menu ou uma janela de confirmação aberta: o teclado é deles
  if (c.digitando || c.menuAberto || c.dialogoAberto) return null
  // rede de segurança: se o foco escapou do terminal ativo, devolve e deixa a tecla para ele, em vez de
  // virar atalho do quadro — `d` trocava de ferramenta e Delete apagava o cartão em que ele ia escrever
  if (c.terminalComTeclado) return sem({ tipo: 'devolverFoco' })
  // no meio de um arrasto ou desenho, atalho nenhum mexe no quadro (desfazer no meio quebraria o histórico);
  // Esc cancela o gesto
  if (c.emGesto) return e.key === 'Escape' ? sem({ tipo: 'cancelarGesto' }) : null
  const ctrl = e.ctrlKey || e.metaKey
  const tecla = e.key.toLowerCase()
  if (ctrl && (e.key === '=' || e.key === '+')) return com({ tipo: 'zoom', fator: 1.2 })
  if (ctrl && e.key === '-') return com({ tipo: 'zoom', fator: 1 / 1.2 })
  if (ctrl && e.key === '0') return com({ tipo: 'zoom', fator: 'inicial' })
  if (ctrl && e.key === '1') return com({ tipo: 'enquadrarTudo' })
  if (ctrl && tecla === 'z') return com({ tipo: e.shiftKey ? 'refazer' : 'desfazer' })
  if (ctrl && tecla === 'y') return com({ tipo: 'refazer' })
  if (ctrl && tecla === 'd') return com({ tipo: 'duplicar' })
  if (ctrl && tecla === 'a') return com({ tipo: 'selecionarTudo' })
  if (ctrl && tecla === 'g') return com({ tipo: e.shiftKey ? 'desagrupar' : 'agrupar' })
  if (ctrl && tecla === 'c') return com({ tipo: 'copiar', recortar: false })
  if (ctrl && tecla === 'x') return com({ tipo: 'copiar', recortar: true })
  if (ctrl && tecla === 'v') return com({ tipo: 'colar' })
  if (ctrl && tecla === 'k') return com({ tipo: 'paleta' })
  if (ctrl && e.shiftKey && tecla === 'n') return com({ tipo: 'novaJanela' })
  if (ctrl && e.shiftKey && tecla === 'e') return com({ tipo: 'alternarExplorador' })
  if (ctrl || e.altKey) return null
  // camada aberta: Esc a fecha e as teclas simples (n, v, t, d, e, setas, Delete, ?) não mexem no quadro
  if (c.camadaAberta) return e.key === 'Escape' ? sem({ tipo: 'fecharCamada' }) : null
  const seta = SETAS[e.key]
  if (seta) {
    const passo = e.shiftKey ? 10 : 1
    return com({ tipo: 'empurrar', dx: seta[0] * passo, dy: seta[1] * passo })
  }
  if (e.key === '?') return sem({ tipo: 'mostrarAtalhos' })
  if (e.key === 'Delete' || e.key === 'Backspace') return sem({ tipo: 'apagar' })
  if (e.key === 'Escape') return sem({ tipo: 'escape' })
  if (tecla === 'e') return sem({ tipo: 'borracha' })
  const ferramenta = FERRAMENTAS[tecla]
  return ferramenta ? sem({ tipo: 'ferramenta', ferramenta }) : null
}

/** O que cada ação faz de verdade: a loja, o zoom, a paleta… (entregue pelo App). */
export interface Executores {
  devolverFoco: () => void
  cancelarGesto: () => void
  fecharCamada: () => void
  zoom: (fator: number | 'inicial') => void
  enquadrarTudo: () => void
  desfazer: () => void
  refazer: () => void
  duplicar: () => void
  selecionarTudo: () => void
  agrupar: () => void
  desagrupar: () => void
  copiar: (recortar: boolean) => void
  colar: () => void
  paleta: () => void
  novaJanela: () => void
  alternarExplorador: () => void
  empurrar: (dx: number, dy: number) => void
  mostrarAtalhos: () => void
  apagar: () => void
  escape: () => void
  borracha: () => void
  ferramenta: (f: FerramentaAtalho) => void
}

export function executar(a: Acao, x: Executores): void {
  switch (a.tipo) {
    case 'devolverFoco': return x.devolverFoco()
    case 'cancelarGesto': return x.cancelarGesto()
    case 'fecharCamada': return x.fecharCamada()
    case 'zoom': return x.zoom(a.fator)
    case 'enquadrarTudo': return x.enquadrarTudo()
    case 'desfazer': return x.desfazer()
    case 'refazer': return x.refazer()
    case 'duplicar': return x.duplicar()
    case 'selecionarTudo': return x.selecionarTudo()
    case 'agrupar': return x.agrupar()
    case 'desagrupar': return x.desagrupar()
    case 'copiar': return x.copiar(a.recortar)
    case 'colar': return x.colar()
    case 'paleta': return x.paleta()
    case 'novaJanela': return x.novaJanela()
    case 'alternarExplorador': return x.alternarExplorador()
    case 'empurrar': return x.empurrar(a.dx, a.dy)
    case 'mostrarAtalhos': return x.mostrarAtalhos()
    case 'apagar': return x.apagar()
    case 'escape': return x.escape()
    case 'borracha': return x.borracha()
    case 'ferramenta': return x.ferramenta(a.ferramenta)
  }
}

/** A ligação ao `keydown`: lê o contexto no momento da tecla, decide e executa. */
export function criarAtalhos(lerContexto: () => Contexto, executores: Executores): (e: KeyboardEvent) => void {
  return (e) => {
    const d = decidir(e, lerContexto())
    if (!d) return
    if (d.prevenir) e.preventDefault()
    executar(d.acao, executores)
  }
}
