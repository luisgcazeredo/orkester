// Organizar o kanban em pastas (1.9.7, a versão simples decidida em 25/11): as regras olham as etiquetas e põem cada
// tarefa SEM pasta numa pasta. São duas: `versao` (a etiqueta com cara de versão) e `etiquetas` (todas ou uma só).
// Puro (sem disco nem tela), e nada aqui grava: devolve a operação `organizar` que a página manda pelo canal
// `kanban.aplicar` (só do usuário). O resultado traz `antes`, e o Desfazer é `organizar` com `mudancasParaDesfazer(antes)`.
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { ehVersao, LIMITES_DO_KANBAN, normalizar, versaoDasEtiquetas, type ArquivoDoKanban, type MudancaDeOrganizar, type Tarefa } from './kanban.ts'

export { ehVersao }

/** O que o menu ⋯ da coluna pede: por versão, por etiquetas (todas) ou por uma etiqueta só. */
export type PedidoDeOrganizar = { regra: 'versao' } | { regra: 'etiquetas'; etiqueta?: string }

/** A operação `organizar` pronta para o `kanban.aplicar`. Sempre `soSemPasta`: nada automático mexe em quem tem pasta. */
export interface OperacaoDeOrganizar {
  tipo: 'organizar'
  mudancas: MudancaDeOrganizar[]
  soSemPasta: true
  /** Só a da 1ª abertura: grava a marca `organizadoInicial` na mesma gravação. */
  inicial?: true
}

export interface Organizacao {
  operacao: OperacaoDeOrganizar
  /** Quantas tarefas vão para cada pasta, da maior para a menor (empate: alfabética). */
  resumo: { pasta: string; quantas: number }[]
}

export interface EtiquetaDaColuna {
  /** A grafia que vale (a primeira vista na coluna; outra caixa ou acento conta junto). */
  etiqueta: string
  /** Em quantas tarefas da coluna ela está (com ou sem pasta). */
  quantas: number
  /** Em quantas dessas ela está numa tarefa SEM pasta: é o que o menu promete e o que de fato muda (0 = "já em pastas"). */
  semPasta: number
  versao: boolean
}

const ordemDeNome = (a: string, b: string): number => normalizar(a).localeCompare(normalizar(b)) || a.localeCompare(b)

/**
 * As etiquetas em uso na coluna (todas as tarefas dela), da mais usada para a menos; no empate, a alfabética. É o
 * submenu "Juntar numa pasta ▸" (que mostra `semPasta`), e "Organizar por versão" só aparece se alguma tem `versao`.
 */
export function etiquetasDaColuna(tarefas: readonly Tarefa[], coluna: string): EtiquetaDaColuna[] {
  const vistas = new Map<string, EtiquetaDaColuna>()
  for (const t of tarefas) {
    if (t.coluna !== coluna) continue
    // a mesma etiqueta duas vezes na tarefa (outra caixa) conta uma
    for (const chave of new Set(t.etiquetas.map(normalizar))) {
      const e = t.etiquetas.find((x) => normalizar(x) === chave)!.trim()
      const ja = vistas.get(chave)
      const solta = t.pasta ? 0 : 1
      if (ja) {
        ja.quantas++
        ja.semPasta += solta
      } else vistas.set(chave, { etiqueta: e, quantas: 1, semPasta: solta, versao: ehVersao(e) })
    }
  }
  return [...vistas.values()].sort((a, b) => b.quantas - a.quantas || ordemDeNome(a.etiqueta, b.etiqueta))
}

/**
 * A pasta de uma tarefa pela regra; undefined = a regra não a alcança. Várias etiquetas: 1) a de versão; 2) a mais
 * usada na coluna (dá menos pastas, e maiores); 3) no empate, a alfabética. A tarefa vai para UMA pasta só.
 */
function etiquetaEscolhida(t: Tarefa, pedido: PedidoDeOrganizar, uso: ReadonlyMap<string, number>): string | undefined {
  if (pedido.regra === 'versao') return versaoDasEtiquetas(t.etiquetas)
  const uma = pedido.etiqueta?.trim()
  if (uma) return t.etiquetas.find((e) => normalizar(e) === normalizar(uma))?.trim()
  const versao = versaoDasEtiquetas(t.etiquetas)
  if (versao) return versao
  return [...t.etiquetas].map((e) => e.trim()).filter(Boolean).sort((a, b) => (uso.get(normalizar(b)) ?? 0) - (uso.get(normalizar(a)) ?? 0) || ordemDeNome(a, b))[0]
}

/**
 * Organiza as tarefas SEM pasta de uma coluna (`coluna` = o id). Não muda nada: devolve a operação e o resumo. O nome
 * da pasta segue a grafia de uma pasta que já existe no kanban (sem caixa nem acento) e, senão, a da etiqueta na
 * coluna: `Cliente-A` e `cliente-a` caem na mesma pasta.
 */
export function organizarColuna(arquivo: Pick<ArquivoDoKanban, 'tarefas'>, coluna: string, pedido: PedidoDeOrganizar): Organizacao {
  const naColuna = etiquetasDaColuna(arquivo.tarefas, coluna)
  const uso = new Map(naColuna.map((e) => [normalizar(e.etiqueta), e.quantas]))
  // a grafia de uma pasta que já existe (a primeira, como o `pastaOuErro`) vence a da etiqueta
  const grafia = new Map<string, string>()
  for (const t of arquivo.tarefas) if (t.pasta && !grafia.has(normalizar(t.pasta))) grafia.set(normalizar(t.pasta), t.pasta)
  for (const e of naColuna) if (!grafia.has(normalizar(e.etiqueta))) grafia.set(normalizar(e.etiqueta), e.etiqueta)
  const mudancas: MudancaDeOrganizar[] = []
  const contagem = new Map<string, number>()
  for (const t of [...arquivo.tarefas].sort((a, b) => a.numero - b.numero)) {
    if (t.coluna !== coluna || t.pasta) continue
    const e = etiquetaEscolhida(t, pedido, uso)
    if (!e) continue
    const pasta = (grafia.get(normalizar(e)) ?? e).slice(0, LIMITES_DO_KANBAN.pasta).trim()
    if (!pasta) continue
    mudancas.push({ numero: t.numero, pasta })
    contagem.set(pasta, (contagem.get(pasta) ?? 0) + 1)
  }
  const resumo = [...contagem].map(([pasta, quantas]) => ({ pasta, quantas })).sort((a, b) => b.quantas - a.quantas || ordemDeNome(a.pasta, b.pasta))
  return { operacao: { tipo: 'organizar', mudancas, soSemPasta: true }, resumo }
}

/**
 * A 1ª abertura da página na 1.9.7, uma vez por espaço: "por versão" na coluna final. null = a marca
 * `organizadoInicial` já está no arquivo (não manda nada). Sem marca, SEMPRE devolve a operação, mesmo sem mudança
 * (espaço sem versões, ou com o automático desligado): é ela que grava a marca, e a página só avisa se `antes` vier
 * com alguma tarefa.
 */
export function organizacaoInicial(arquivo: Pick<ArquivoDoKanban, 'colunas' | 'tarefas' | 'organizarAuto' | 'organizadoInicial'>): OperacaoDeOrganizar | null {
  if (arquivo.organizadoInicial) return null
  const final = arquivo.colunas.find((c) => c.final)
  // o automático desligado pelo usuário vale também para a arrumação das antigas
  const mudancas = final && arquivo.organizarAuto !== false ? organizarColuna(arquivo, final.id, { regra: 'versao' }).operacao.mudancas : []
  return { tipo: 'organizar', mudancas, soSemPasta: true, inicial: true }
}
