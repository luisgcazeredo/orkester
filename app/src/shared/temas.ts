// Os temas do app, definidos uma vez. O id é o que vai gravado nas preferências (`tema`) e vira a classe
// `tema-<id>` na raiz do app; as cores de cada tema moram em `renderer/src/estilos/tokens.css` (bloco
// `.tema-<id>`). Tema novo = uma entrada aqui + um bloco lá (e, se o terminal precisar, uma em `temaXterm.ts`).
export interface DefinicaoDeTema {
  id: string
  rotulo: string
}

/** O registro: a única lista de temas. O tipo `Tema` sai daqui, então tema novo é só uma entrada. */
export const TEMAS = [
  { id: 'escuro', rotulo: 'escuro' },
  { id: 'claro', rotulo: 'claro' }
] as const satisfies readonly DefinicaoDeTema[]

/** O id de um tema registrado ('escuro' | 'claro'). Os valores já gravados continuam válidos. */
export type Tema = (typeof TEMAS)[number]['id']

/** O tema de fábrica. */
export const TEMA_PADRAO: Tema = 'escuro'

/** O id é de um tema que existe? É o que a gravação das preferências exige. */
export function temaValido(id: unknown): id is Tema {
  return typeof id === 'string' && TEMAS.some((t) => t.id === id)
}

/** A classe que o app usa para aplicar o tema. */
export const classeDoTema = (id: Tema): string => `tema-${id}`
