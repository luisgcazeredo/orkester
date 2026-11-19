// Páginas extras ("+"): o lado da tela do contrato S2↔S3. Os tipos são os de shared/api.ts e shared/paginas.ts
// (a S2 é a dona); aqui ficam só os nomes curtos e o que a tela monta sozinha (endereço, partição, id na casca).
// Sem import em tempo de execução: a prova de textos roda no Node e importa este arquivo.
export type {
  ApiPaginas, PropostaDePagina, RespostaDaProposta, ResultadoDePaginas, ResumoDePagina as PaginaInstalada
} from '../../../../shared/api'
export type { IconeDePagina, MotivoDeQueda } from '../../../../shared/paginas'

/** Endereço e partição do webview: fixos, montados aqui (o main recusa qualquer outro no `will-attach-webview`). */
export const enderecoDaPagina = (id: string): string => `ork-pagina://${id}/index.html`
/** Em memória (decisão 3a): sem `persist:`. */
export const particaoDaPagina = (id: string): string => `pagina-${id}`
/** Id da página extra no registro da casca: prefixado para nunca colidir com uma nativa. */
export const idNaCasca = (id: string): string => `extra:${id}`

/** Erro que volta do main (`Error` do IPC, ou `{ok:false, erro}` no resultado): texto curto para a tela. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof Error) return e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
  if (e && typeof e === 'object' && typeof (e as { erro?: unknown }).erro === 'string') return (e as { erro: string }).erro
  return String(e)
}

/** `{ok:false, erro}` vira exceção: as ações da tela tratam erro num lugar só. */
export function exigirOk<T>(r: T): T {
  if (r && typeof r === 'object' && (r as { ok?: unknown }).ok === false) throw r
  return r
}
