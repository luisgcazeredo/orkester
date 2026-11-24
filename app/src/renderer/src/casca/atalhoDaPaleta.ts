/**
 * Ctrl+K fora do quadro. O quadro tem o atalho dele (`quadro/atalhos.ts`, com as regras de foco do quadro); nas outras
 * páginas (Fluxos, Rotinas, Agentes, Kanban, Leitor, Configurações e as extras) ninguém o tratava, e a Paleta só abria com
 * o foco no quadro. Puro (sem DOM e sem loja): a `atalhoDaPaleta.prova` roda no Node.
 */
export interface TeclaDaPaleta {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

export interface ContextoDaPaleta {
  /** A página ativa da casca. */
  pagina: string
  /** Um menu de contexto aberto. */
  menuAberto: boolean
  /** Uma janela de confirmação (`.dialogo-fundo`) aberta: inclui a própria Paleta, então Ctrl+K não a reabre. */
  dialogoAberto: boolean
}

/** `true`: este Ctrl+K abre a Paleta (e deve levar `preventDefault`). */
export function ehAtalhoDaPaleta(e: TeclaDaPaleta, c: ContextoDaPaleta): boolean {
  if (c.pagina === 'quadro') return false
  if (c.menuAberto || c.dialogoAberto) return false
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false
  return e.key.toLowerCase() === 'k'
}
