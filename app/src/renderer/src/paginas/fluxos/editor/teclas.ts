// Editor de Fluxos: os atalhos de teclado. A decisão é pura (tecla + contexto → ação), como `quadro/atalhos.ts`; a
// `teclas.prova` roda no Node. Copiar e colar não passam por aqui: vão pelos eventos `copy` e `paste` do navegador.

export interface Tecla {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface ContextoDasTeclas {
  /** Foco num campo de texto (nome, formulário do nó, busca). */
  digitando: boolean
  /** Espaço de outra janela: só olhar. */
  editavel: boolean
  temSelecao: boolean
  /** Uma ligação marcada (clicada). */
  temLigacao: boolean
  /** Exatamente um nó selecionado. */
  umNo: boolean
  /** A escolha de nó, o renomear ou o popup do nó está aberto: as teclas do quadro não valem (Esc e Ctrl valem). */
  camadaAberta: boolean
}

export type AcaoDaTecla =
  | 'apagar'
  | 'desfazer'
  | 'refazer'
  | 'selecionarTudo'
  | 'renomear'
  | 'salvar'
  | 'buscar'
  | 'fechar'
  | 'abrirPainel'
  | 'enquadrar'

export function decidirTecla(t: Tecla, c: ContextoDasTeclas): AcaoDaTecla | null {
  const ctrl = t.ctrlKey || t.metaKey
  const k = t.key.length === 1 ? t.key.toLowerCase() : t.key
  // Ctrl+S salva até com o foco num campo (é o que se espera de um editor)
  if (ctrl && !t.altKey && k === 's') return c.editavel ? 'salvar' : null
  if (k === 'Escape') return 'fechar'
  if (c.digitando) return null
  if (ctrl && !t.altKey) {
    if (k === 'z') return c.editavel ? (t.shiftKey ? 'refazer' : 'desfazer') : null
    if (k === 'y') return c.editavel ? 'refazer' : null
    if (k === 'a') return 'selecionarTudo'
    return null
  }
  if (t.altKey) return null
  if (c.camadaAberta) return null
  if (k === 'Delete' || k === 'Backspace') return c.editavel && (c.temSelecao || c.temLigacao) ? 'apagar' : null
  if (k === 'F2') return c.editavel && c.umNo ? 'renomear' : null
  if (k === 'Enter') return c.umNo ? 'abrirPainel' : null
  if (k === 'Tab' || (k === 'n' && !t.shiftKey)) return c.editavel ? 'buscar' : null
  if (k === '1') return 'enquadrar'
  return null
}
