// R7-EXCECAO: cores que são DADO, não tema.
//
// Estas cores são gravadas dentro do quadro (`cor` do cartão, do texto e do traço) ou comparadas com o que já
// está gravado (`TOM_DO_POSTIT`). O valor guardado é o hex literal, igual nos dois temas, e planos salvos
// antes da R7 têm esse mesmo texto. Trocar por `var(--x)` mudaria o que vai para o disco e quebraria a
// comparação. Por isso ficam literais, e só aqui: quem usa importa deste arquivo. A varredura de cor da
// R7 (`.contexto/R7-varredura.mjs`) aceita este arquivo como exceção e mais nenhum além de `estilos/tokens.css`
// e `terminal/temaXterm.ts`.
import type { CorPostIt } from '../../../shared/modelo'

/** A cor do traço quando o espaço é novo. */
export const COR_DO_TRACO_PADRAO = '#FF3B30'

/** O menu "Cor" do cartão, do texto e do desenho. `null` é "sem cor". */
export const CORES_DE_CARTAO: Array<{ cor: string | null; nome: string }> = [
  { cor: null, nome: 'Sem cor' },
  { cor: '#007AFF', nome: 'Azul' },
  { cor: '#AF52DE', nome: 'Roxo' },
  { cor: '#FF2D55', nome: 'Rosa' },
  { cor: '#FF3B30', nome: 'Vermelho' },
  { cor: '#FF9500', nome: 'Laranja' },
  { cor: '#FFCC00', nome: 'Amarelo' },
  { cor: '#34C759', nome: 'Verde' },
  { cor: '#8E8E93', nome: 'Cinza' }
]

/** As amostras da barra de ferramentas de desenho. */
export const CORES_DE_DESENHO = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#8E8E93']

/** Tom de post-it que corresponde a cada cor de cartão (as que não têm tom deixam o post-it como está). */
export const TOM_DO_POSTIT: Record<string, CorPostIt> = {
  '#007AFF': 'azul',
  '#AF52DE': 'roxo',
  '#FF2D55': 'rosa',
  '#FF3B30': 'rosa',
  '#FF9500': 'amarelo',
  '#FFCC00': 'amarelo',
  '#34C759': 'verde'
}
