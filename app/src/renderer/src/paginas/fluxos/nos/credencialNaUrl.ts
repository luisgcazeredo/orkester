// Nó HTTP: as conferências puras do formulário. A credencial escolhida vai para o host da URL? O nome de cabeçalho ou de
// parâmetro parece segredo digitado direto no fluxo? Sem React e sem DOM: a `credencialNaUrl.prova` roda no Node. A
// decisão final é do main, na hora do pedido (`conferirDestino`, a mesma função); a tela só avisa mais cedo.
import type { CredencialVisivel } from '../../../../../shared/fluxos/credenciais'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { conferirDestino, credencialNaoExiste } from '../../../../../shared/fluxos/credenciais.ts'

export type ConferenciaDaCredencial = { estado: 'ok' | 'aviso' | 'erro'; texto: string }

/** O host escrito na URL (antes de `/`, `?` e `#`), sem usuário e porta; `''` se não dá para saber. */
function hostEscrito(url: string): string {
  const semEsquema = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const autoridade = semEsquema.split(/[/?#]/)[0] ?? ''
  return autoridade.slice(autoridade.lastIndexOf('@') + 1)
}

/**
 * A credencial `nome`, com a URL como está escrita agora. `lista` = as credenciais globais já lidas (`null` = ainda
 * lendo: não diz nada). Sem credencial escolhida, `null`.
 */
export function conferirCredencialNaUrl(nome: string, url: string, lista: readonly CredencialVisivel[] | null): ConferenciaDaCredencial | null {
  const pedida = nome.trim()
  if (!pedida || !lista) return null
  const c = lista.find((x) => x.nome.toLowerCase() === pedida.toLowerCase())
  if (!c) return { estado: 'erro', texto: `${credencialNaoExiste(pedida)}. Escolha outra, ou crie esta em Configurações › Conexões › Credenciais.` }
  const alvo = url.trim()
  const dominios = c.dominios.join(', ')
  if (!alvo) return { estado: 'aviso', texto: `Escreva a URL para conferir o domínio. Esta credencial só vai para: ${dominios}.` }
  if (hostEscrito(alvo).includes('{{')) {
    return { estado: 'aviso', texto: `O endereço muda com o item, então o domínio só é conferido na hora do pedido: a credencial só vai se ele for um destes: ${dominios}.` }
  }
  const motivo = conferirDestino(c, alvo)
  if (motivo) return { estado: 'erro', texto: `${motivo}. O pedido vai falhar.` }
  return { estado: 'ok', texto: `Vai para ${hostEscrito(alvo)}: domínio permitido (${dominios}).` }
}

const PARECE_SEGREDO = /authorization|api[-_ ]?key|apikey|token|secret|senha|password|passwd|cookie|bearer/i

/** O nome do cabeçalho ou do parâmetro sugere um segredo, que ficaria gravado no fluxo e na execução. */
export const pareceSegredo = (nome: string): boolean => PARECE_SEGREDO.test(nome)

/** Os nomes de uma lista que parecem segredo (sem repetir). */
export const nomesComCaraDeSegredo = (pares: readonly { nome: string }[]): string[] => [...new Set(pares.map((p) => p.nome.trim()).filter((n) => n && pareceSegredo(n)))]
