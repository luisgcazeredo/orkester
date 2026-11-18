// Parte pura do Leitor (sem DOM nem React): a árvore de pastas a partir da lista plana e a busca por nome.
// Roda no Node na prova.

export interface NoPasta {
  tipo: 'pasta'
  nome: string
  /** Caminho relativo à raiz, com `/`. */
  caminho: string
  filhos: NoDaArvore[]
}
export interface NoArquivo {
  tipo: 'arquivo'
  nome: string
  caminho: string
}
export type NoDaArvore = NoPasta | NoArquivo

/** Lista plana de caminhos relativos (`a/b.md`) vira árvore: pastas primeiro, cada grupo em ordem alfabética. */
export function montarArvore(arquivos: readonly string[]): NoDaArvore[] {
  const topo: NoDaArvore[] = []
  const pastas = new Map<string, NoPasta>()
  for (const caminho of arquivos) {
    const partes = caminho.split('/').filter(Boolean)
    if (!partes.length) continue
    let nivel = topo
    let acumulado = ''
    for (let i = 0; i < partes.length - 1; i++) {
      acumulado = acumulado ? `${acumulado}/${partes[i]}` : partes[i]
      let pasta = pastas.get(acumulado)
      if (!pasta) {
        pasta = { tipo: 'pasta', nome: partes[i], caminho: acumulado, filhos: [] }
        pastas.set(acumulado, pasta)
        nivel.push(pasta)
      }
      nivel = pasta.filhos
    }
    nivel.push({ tipo: 'arquivo', nome: partes[partes.length - 1], caminho: partes.join('/') })
  }
  ordenar(topo)
  return topo
}

function ordenar(nivel: NoDaArvore[]): void {
  nivel.sort((a, b) => (a.tipo === b.tipo ? a.nome.localeCompare(b.nome, 'pt-BR') : a.tipo === 'pasta' ? -1 : 1))
  for (const no of nivel) if (no.tipo === 'pasta') ordenar(no.filhos)
}

/** Sem acento nem caixa, para comparar o que o usuário digitou com o nome. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Busca por nome: cada palavra digitada precisa aparecer no caminho (sem acento nem caixa). Quem casa no NOME do
 * arquivo vem antes de quem casa só na pasta. Termo vazio: lista vazia (a tela mostra a árvore).
 */
export function buscarPorNome(arquivos: readonly string[], termo: string): string[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean)
  if (!palavras.length) return []
  const achados: Array<{ caminho: string; noNome: boolean }> = []
  for (const caminho of arquivos) {
    const todo = normalizar(caminho)
    if (!palavras.every((p) => todo.includes(p))) continue
    const nome = normalizar(caminho.slice(caminho.lastIndexOf('/') + 1))
    achados.push({ caminho, noNome: palavras.every((p) => nome.includes(p)) })
  }
  return achados.sort((a, b) => Number(b.noNome) - Number(a.noNome) || a.caminho.localeCompare(b.caminho, 'pt-BR')).map((a) => a.caminho)
}

/** As pastas pai de um arquivo (`a/b/c.md` → `a`, `a/b`), para abrir a árvore até ele. */
export function paisDe(caminho: string): string[] {
  const partes = caminho.split('/')
  const pais: string[] = []
  for (let i = 1; i < partes.length; i++) pais.push(partes.slice(0, i).join('/'))
  return pais
}

/** Nome para mostrar de uma pasta: o último trecho do caminho, com `\` ou `/`. */
export function nomeDaPasta(caminho: string): string {
  const partes = caminho.replace(/[\\/]+$/, '').split(/[\\/]/)
  return partes[partes.length - 1] || caminho
}

/** Mesma pasta, ignorando barra do fim, tipo de barra e caixa (Windows). */
export function mesmaPasta(a: string, b: string): boolean {
  const chave = (c: string): string => c.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return chave(a) === chave(b)
}

/** Junta a raiz e um caminho relativo da lista (com `/`) num caminho absoluto. */
export function caminhoAbsoluto(raiz: string, relativo: string): string {
  return `${raiz.replace(/[\\/]+$/, '')}/${relativo}`
}

/**
 * O caminho relativo (da lista) do arquivo aberto. `caminho` é o real devolvido pelo principal e `raiz` a pasta que
 * o Leitor mostra. Primeiro tira o prefixo da raiz (exato, assim `a.md` e `z/a.md` não se confundem); se o real
 * não começa pela raiz (junção, caixa), cai no MAIS LONGO que casa pelo fim. Sem achado: null.
 */
export function relativoAberto(raiz: string, caminho: string, arquivos: readonly string[]): string | null {
  const norm = (c: string): string => c.replace(/\\/g, '/').toLowerCase()
  const alvo = norm(caminho)
  const prefixo = `${norm(raiz).replace(/\/+$/, '')}/`
  if (alvo.startsWith(prefixo)) {
    const resto = alvo.slice(prefixo.length)
    return arquivos.find((a) => a.toLowerCase() === resto) ?? null
  }
  let melhor: string | null = null
  for (const a of arquivos) if (alvo.endsWith(`/${a.toLowerCase()}`) && (!melhor || a.length > melhor.length)) melhor = a
  return melhor
}

/**
 * As raízes que o Leitor lista: as pastas de TODOS os espaços (o Leitor é geral, não do espaço aberto) e depois as
 * fixadas, sem repetir pasta. Só as fixadas podem ser desafixadas.
 */
export function juntarRaizes(pastasDosEspacos: readonly string[], fixadas: readonly string[]): Array<{ caminho: string; fixada: boolean }> {
  const lista: Array<{ caminho: string; fixada: boolean }> = []
  for (const p of pastasDosEspacos) if (p && !lista.some((r) => mesmaPasta(r.caminho, p))) lista.push({ caminho: p, fixada: false })
  for (const p of fixadas) if (!lista.some((r) => mesmaPasta(r.caminho, p))) lista.push({ caminho: p, fixada: true })
  return lista
}
