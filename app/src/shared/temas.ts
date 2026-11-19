// Os temas do app, definidos uma vez. Um tema na tela é uma BASE (escuro, claro, OLED) com uma COR DE DESTAQUE
// (azul, vermelho, verde…), escolhidas à parte (1.9.4). O id da base é o que vai gravado nas preferências (`tema`)
// e vira a classe `tema-<id>` na raiz do app; o destaque vai em `destaque` e vira `destaque-<id>`. As cores moram em
// `renderer/src/estilos/tokens.css`: um bloco `.tema-<id>` por base e um `.destaque-<id>` (com os ajustes
// `.tema-<base>.destaque-<id>`) por destaque. Base nova = uma entrada aqui + um bloco lá + uma em `temaXterm.ts`;
// destaque novo = uma entrada aqui + os blocos lá. A prova `temas.prova.mts` confere os dois lados e o contraste.
export interface DefinicaoDeTema {
  id: string
  rotulo: string
  /** Base escura (o sol/lua vai dela para o Claro, e do Claro volta para o Escuro). */
  escuro: boolean
  /** Uma linha para o cartão da base. */
  descricao: string
}

/** O registro: a única lista de bases. O tipo `Tema` sai daqui, então base nova é só uma entrada. */
export const TEMAS = [
  { id: 'escuro', rotulo: 'Escuro', escuro: true, descricao: 'Grafite com um fio de azul: o de sempre.' },
  { id: 'claro', rotulo: 'Claro', escuro: false, descricao: 'Fundo claro, para ambiente iluminado.' },
  { id: 'oled', rotulo: 'OLED', escuro: true, descricao: 'Preto puro: fundo e terminal #000, bordas sutis.' }
] as const satisfies readonly DefinicaoDeTema[]

/** O id de uma base registrada ('escuro' | 'claro' | 'oled'). Os valores já gravados continuam válidos. */
export type Tema = (typeof TEMAS)[number]['id']

/** A base de fábrica. */
export const TEMA_PADRAO: Tema = 'escuro'

/** O id é de uma base que existe? É o que a gravação das preferências exige. */
export function temaValido(id: unknown): id is Tema {
  return typeof id === 'string' && TEMAS.some((t) => t.id === id)
}

/** A classe que o app usa para aplicar a base. */
export const classeDoTema = (id: Tema): string => `tema-${id}`

/** A base é escura? (Base desconhecida conta como escura, como o padrão.) */
export const temaEscuro = (id: Tema): boolean => TEMAS.find((t) => t.id === id)?.escuro ?? true

/** Para onde o botão sol/lua leva: das escuras ao Claro, do Claro ao Escuro. */
export const temaOposto = (id: Tema): Tema => (temaEscuro(id) ? 'claro' : 'escuro')

export interface DefinicaoDeDestaque {
  id: string
  rotulo: string
}

/**
 * As cores de destaque, na ordem das bolinhas. Os tons de cada uma (destaque, claro, forte e texto sobre o
 * destaque) são ajustados POR BASE em tokens.css, com contraste AA conferido pela prova.
 */
export const DESTAQUES = [
  { id: 'azul', rotulo: 'Azul' },
  { id: 'vermelho', rotulo: 'Vermelho' },
  { id: 'verde', rotulo: 'Verde' },
  { id: 'roxo', rotulo: 'Roxo' },
  { id: 'laranja', rotulo: 'Laranja' },
  { id: 'rosa', rotulo: 'Rosa' },
  { id: 'ciano', rotulo: 'Ciano' }
] as const satisfies readonly DefinicaoDeDestaque[]

export type Destaque = (typeof DESTAQUES)[number]['id']

/** O destaque de fábrica: o azul da marca. Preferência antiga (sem o campo) fica com ele. */
export const DESTAQUE_PADRAO: Destaque = 'azul'

export function destaqueValido(id: unknown): id is Destaque {
  return typeof id === 'string' && DESTAQUES.some((d) => d.id === id)
}

/** A classe do destaque na raiz do app. Sem preferência (ou com uma que não existe mais), o padrão. */
export const classeDoDestaque = (id: unknown): string => `destaque-${destaqueValido(id) ? id : DESTAQUE_PADRAO}`

/** Os tokens que cada destaque define (em cada base). */
export const TOKENS_DO_DESTAQUE = ['--destaque', '--destaque-claro', '--destaque-forte', '--texto-sobre-destaque'] as const
