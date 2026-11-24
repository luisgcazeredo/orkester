// Fechar a janela: o que a janela respondeu ao `app:vai-fechar` e o que o main pergunta antes de fechar. Puro (prova em
// fecharJanela.prova.mts); o diálogo de verdade é o `dialog.showMessageBox` do main/index.ts.
import type { RespostaAoFechar } from '../shared/api'

export type Fechamento = { tipo: 'pode' } | { tipo: 'falhou' } | { tipo: 'rascunho-de-fluxo'; nome?: string }

const MAX_NOME = 80

/**
 * A resposta crua da janela. `false` = tentou salvar e falhou (o caminho antigo); o objeto com motivo
 * `rascunho-de-fluxo` = há um rascunho no editor de Fluxos; qualquer outra coisa (true, nada, o prazo de 5 s) = pode.
 */
export function lerRespostaAoFechar(r: RespostaAoFechar | unknown): Fechamento {
  if (r === false) return { tipo: 'falhou' }
  if (r && typeof r === 'object' && (r as { motivo?: unknown }).motivo === 'rascunho-de-fluxo') {
    const nome = (r as { nome?: unknown }).nome
    const limpo = typeof nome === 'string' ? nome.replace(/\s+/g, ' ').trim().slice(0, MAX_NOME) : ''
    return limpo ? { tipo: 'rascunho-de-fluxo', nome: limpo } : { tipo: 'rascunho-de-fluxo' }
  }
  return { tipo: 'pode' }
}

export type AcaoAoFechar = 'tentar' | 'fechar' | 'ficar'

export interface PerguntaAoFechar {
  mensagem: string
  detalhe: string
  botoes: { texto: string; acao: AcaoAoFechar }[]
  /** Índice do botão do Esc / do X do diálogo. O padrão (Enter) é sempre o 1º. */
  cancelar: number
}

/** `null` = fecha sem perguntar. */
export function perguntaAoFechar(f: Fechamento): PerguntaAoFechar | null {
  if (f.tipo === 'pode') return null
  if (f.tipo === 'rascunho-de-fluxo') {
    return {
      mensagem: f.nome ? `O fluxo "${f.nome}" tem mudanças não salvas.` : 'Um fluxo tem mudanças não salvas.',
      detalhe: 'Se fechar agora, as mudanças do editor de Fluxos se perdem.',
      botoes: [
        { texto: 'Voltar ao editor', acao: 'ficar' },
        { texto: 'Fechar sem salvar', acao: 'fechar' }
      ],
      cancelar: 0
    }
  }
  return {
    mensagem: 'Não consegui salvar as últimas mudanças.',
    detalhe: 'Se fechar agora, o que mudou desde o último salvamento se perde.',
    botoes: [
      { texto: 'Tentar de novo', acao: 'tentar' },
      { texto: 'Fechar sem salvar', acao: 'fechar' },
      { texto: 'Cancelar', acao: 'ficar' }
    ],
    cancelar: 2
  }
}
