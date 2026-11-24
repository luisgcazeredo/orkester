// Aviso de fluxo no canto da janela: a decisão de quanto tempo ele fica. Puro (sem React e sem DOM): a `avisos.prova`
// roda no Node. As frases e o TIPO chegam prontos do main (`aoMudar(espacoId, aviso, tipo)`): `tipo: 'erro'` é a falha de
// um fluxo ligado e o fluxo que o motor desligou; qualquer outro aviso (inclusive o texto de um nó Avisar do usuário,
// que pode dizer o que quiser) não tem tipo e é comum. O texto nunca decide.
import type { TipoDeAvisoDeFluxo } from '../../../../shared/api'

/** Quanto um aviso comum fica à vista, em ms. */
export const DURACAO_DO_AVISO_MS = 7000

/** No máximo isto de avisos na pilha: o mais velho sai quando chega outro. */
export const MAXIMO_DE_AVISOS = 3

/** Aviso de erro: fica até o usuário fechar, porque quem vê a bandeja não está olhando a tela quando ele chega. */
export const ehAvisoDeErro = (tipo?: TipoDeAvisoDeFluxo): boolean => tipo === 'erro'

/** Por quanto tempo o aviso fica: `null` = até ser fechado (erro); senão, alguns segundos. */
export const duracaoDoAviso = (tipo?: TipoDeAvisoDeFluxo): number | null => (ehAvisoDeErro(tipo) ? null : DURACAO_DO_AVISO_MS)

/** A distância do aviso à borda esquerda quando a barra de páginas ocupa `larguraDaBarra` px: ele começa depois dela. */
export const esquerdaDoAviso = (larguraDaBarra: number): number => Math.round((Number.isFinite(larguraDaBarra) && larguraDaBarra > 0 ? larguraDaBarra : 0) + 16)
