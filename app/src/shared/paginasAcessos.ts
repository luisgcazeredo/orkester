/**
 * Páginas "+" (1.9.7): as APIs e os MCPs que a página enxerga. Regras puras (sem Node nem Electron) para o main, a
 * prova e a tela. Plano: `.contexto/plano-197-apis-mcp-por-pagina.md`, seções 1, 2, 3 e 5.
 *
 * Em uma frase: a permissão mora no registro da página (`PaginaRegistrada.acessos`, por id da API ou do servidor), só
 * o Luís concede (aceite e cartão), o manifesto só sugere (pré-marca e preenche `atende`), e a página chama pelo nome
 * da API/servidor (sem caixa, acento e espaço) ou por um nome de `atende`.
 */
import type { AcessoApi, AcessoMcp, AcessosDaPagina, ApiDisponivelParaPagina, PropostaDePagina, SugestaoDePagina, UsoDaPagina } from './api'
import type { ManifestoDePagina, PaginaRegistrada, Resultado } from './paginas'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { hostPermitido, nomeNormalizado } from './fluxos/credenciais.ts'
// @ts-expect-error idem
import { ID_LIGADO, NOME_DE_ENCAIXE, NOME_DE_FERRAMENTA } from './paginas.ts'

/** Até 10 APIs e 5 servidores por página; até 20 ferramentas por servidor. */
export const LIMITES_DE_ACESSO = { apis: 10, servidores: 5, ferramentas: 20, atende: 5 } as const

/** Página que pede `rede` ou `local` não enxerga API nem MCP (o que vem da conta do Luís não pode ter outra saída). */
export const MOTIVO_SEM_ACESSOS = 'esta página usa a rede direta: não pode enxergar APIs nem MCPs'

/** Uma API como o main a conhece (do cofre, sem o valor e sem `segredo`, que não é API). */
export interface ApiConhecida {
  id: string
  nome: string
  dominios: string[]
  soLeitura?: boolean
}

/** Um servidor MCP de fora como o main o conhece; `ferramentas` (as conhecidas) só para o rótulo de perigo. */
export interface ServidorConhecido {
  id: string
  nome: string
  /** importado e ainda sem login: não é escolhível (o aceite e o cartão recusam) */
  precisaLogin?: boolean
  ferramentas?: Array<{ nome: string; dizQueSoLe: boolean }>
}

const falha = <T>(erro: string): Resultado<T> => ({ ok: false, erro })
const objetoSimples = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const curto = (s: string): string => s.slice(0, 80)

/** O nome como a página chama: sem caixa, acento e espaço (`"Eco de teste"` = `"ecodeteste"`). */
export const normalizar = (nome: string): string => nomeNormalizado(nome)

// ---------------------------------------------------------------- manifesto → sugestões

/** O motivo de a página não poder enxergar APIs nem MCPs (pede `rede` ou `local`), ou undefined. */
export function bloqueioDasFichas(pedidas: readonly string[]): string | undefined {
  return pedidas.some((f) => f.startsWith('rede:') || f.startsWith('local:')) ? MOTIVO_SEM_ACESSOS : undefined
}

/** `api`/`mcp` do manifesto como sugestões (nunca concedem nada). */
export function sugestoesDe(m: Pick<ManifestoDePagina, 'permissoes'>): SugestaoDePagina[] {
  return [
    ...(m.permissoes.api ?? []).map((e) => ({ tipo: 'api' as const, encaixe: e.encaixe, hosts: [...e.hosts], escrita: e.escrita === true })),
    ...(m.permissoes.mcp ?? []).map((e) => ({ tipo: 'mcp' as const, encaixe: e.encaixe, ferramentas: [...e.ferramentas] }))
  ]
}

/**
 * Quem pode atender uma sugestão (ids). `api`: nome igual (normalizado) ou domínios que cobrem todos os hosts
 * sugeridos. `mcp`: nome igual; sem isso, o único servidor marcado. Uma só = a tela pré-marca e preenche `atende`.
 */
export function candidatasDaSugestao(
  s: SugestaoDePagina,
  apis: readonly ApiConhecida[],
  servidores: readonly ServidorConhecido[],
  servidoresMarcados: readonly string[] = []
): string[] {
  const n = normalizar(s.encaixe)
  if (s.tipo === 'api') {
    return apis.filter((a) => normalizar(a.nome) === n || (s.hosts.length > 0 && s.hosts.every((h) => hostPermitido(h, a.dominios)))).map((a) => a.id)
  }
  const porNome = servidores.filter((x) => normalizar(x.nome) === n).map((x) => x.id)
  if (porNome.length) return porNome
  const marcados = servidoresMarcados.filter((id) => servidores.some((x) => x.id === id))
  return marcados.length === 1 ? [...marcados] : []
}

// ---------------------------------------------------------------- conferir o que o Luís marcou

export interface ContextoDosAcessos {
  apis: readonly ApiConhecida[]
  servidores: readonly ServidorConhecido[]
  /** a página pede `rede`/`local`: nenhum acesso vale */
  bloqueio?: string
}

function lerAtende(v: unknown, onde: string): Resultado<string[] | undefined> {
  if (v === undefined) return { ok: true, valor: undefined }
  if (!Array.isArray(v) || v.length > LIMITES_DE_ACESSO.atende || v.some((x) => typeof x !== 'string' || !NOME_DE_ENCAIXE.test(x))) {
    return falha(`${onde}: "atende" é uma lista de até ${LIMITES_DE_ACESSO.atende} nomes do manifesto`)
  }
  const unicos = [...new Set(v as string[])]
  return { ok: true, valor: unicos.length ? unicos : undefined }
}

/**
 * Os acessos que vêm da janela (aceite ou cartão), conferidos: forma estrita, até 10 APIs, 5 servidores e 20
 * ferramentas; cada id existe; escrita só se a API permite; um nome de `atende` só numa API/servidor; nada se a
 * página usa `rede`/`local`. Ausente = nenhum.
 */
export function conferirAcessos(bruto: unknown, ctx: ContextoDosAcessos): Resultado<AcessosDaPagina> {
  if (bruto === undefined || bruto === null) return { ok: true, valor: {} }
  if (!objetoSimples(bruto) || Object.keys(bruto).some((k) => k !== 'api' && k !== 'mcp')) return falha('acessos inválidos: use { api?: [...], mcp?: [...] }')
  const api: AcessoApi[] = []
  const mcp: AcessoMcp[] = []
  if (bruto.api !== undefined) {
    if (!Array.isArray(bruto.api) || bruto.api.length > LIMITES_DE_ACESSO.apis) return falha(`acessos inválidos: até ${LIMITES_DE_ACESSO.apis} APIs`)
    for (const a of bruto.api) {
      if (!objetoSimples(a) || Object.keys(a).some((k) => !['apiId', 'escrita', 'atende'].includes(k))) return falha('acessos inválidos: cada API é { apiId, escrita, atende? }')
      if (typeof a.apiId !== 'string' || !ID_LIGADO.test(a.apiId)) return falha('acessos inválidos: id de API')
      if (a.escrita !== undefined && typeof a.escrita !== 'boolean') return falha('acessos inválidos: "escrita" é true ou false')
      const conhecida = ctx.apis.find((x) => x.id === a.apiId)
      if (!conhecida) return falha('uma API marcada não existe mais: desmarque e marque de novo')
      if (api.some((x) => x.apiId === a.apiId)) return falha(`a API ${curto(conhecida.nome)} aparece duas vezes`)
      if (a.escrita === true && conhecida.soLeitura) return falha(`a API ${curto(conhecida.nome)} só lê: a página não pode escrever nela (mude em Conexões › APIs)`)
      const atende = lerAtende(a.atende, `API ${curto(conhecida.nome)}`)
      if (!atende.ok) return atende
      api.push({ apiId: a.apiId, escrita: a.escrita === true, ...(atende.valor ? { atende: atende.valor } : {}) })
    }
  }
  if (bruto.mcp !== undefined) {
    if (!Array.isArray(bruto.mcp) || bruto.mcp.length > LIMITES_DE_ACESSO.servidores) return falha(`acessos inválidos: até ${LIMITES_DE_ACESSO.servidores} servidores MCP`)
    for (const s of bruto.mcp) {
      if (!objetoSimples(s) || Object.keys(s).some((k) => !['servidorId', 'ferramentas', 'atende'].includes(k))) return falha('acessos inválidos: cada servidor é { servidorId, ferramentas, atende? }')
      if (typeof s.servidorId !== 'string' || !ID_LIGADO.test(s.servidorId)) return falha('acessos inválidos: id de servidor')
      const conhecido = ctx.servidores.find((x) => x.id === s.servidorId)
      if (!conhecido) return falha('um servidor MCP marcado não existe mais: desmarque e marque de novo')
      if (conhecido.precisaLogin) return falha(`o servidor ${curto(conhecido.nome)} precisa de login: termine em Conexões › MCP antes de marcar`)
      if (mcp.some((x) => x.servidorId === s.servidorId)) return falha(`o servidor ${curto(conhecido.nome)} aparece duas vezes`)
      const f = s.ferramentas
      if (!Array.isArray(f) || f.length > LIMITES_DE_ACESSO.ferramentas || f.some((x) => typeof x !== 'string' || !NOME_DE_FERRAMENTA.test(x))) {
        return falha(`servidor ${curto(conhecido.nome)}: até ${LIMITES_DE_ACESSO.ferramentas} ferramentas, por nome`)
      }
      const atende = lerAtende(s.atende, `servidor ${curto(conhecido.nome)}`)
      if (!atende.ok) return atende
      mcp.push({ servidorId: s.servidorId, ferramentas: [...new Set(f as string[])], ...(atende.valor ? { atende: atende.valor } : {}) })
    }
  }
  // um nome do manifesto é atendido por uma só API/servidor (senão `pedir("eco")` não sabe qual)
  const vistos = new Set<string>()
  for (const nome of [...api, ...mcp].flatMap((x) => x.atende ?? [])) {
    if (vistos.has(nome)) return falha(`marque só uma para "${nome}"`)
    vistos.add(nome)
  }
  if (ctx.bloqueio && (api.length || mcp.length)) return falha(ctx.bloqueio)
  return { ok: true, valor: { ...(api.length ? { api } : {}), ...(mcp.length ? { mcp } : {}) } }
}

// ---------------------------------------------------------------- aceite (o merge que mora no registro)

/** O que o aceite usa da proposta guardada no main. */
export type PropostaParaAceite = Pick<PropostaDePagina, 'tipo' | 'manifesto' | 'icone' | 'origem' | 'pedidas' | 'novas'> & { hash: string }

const vazio = (a: AcessosDaPagina | undefined): boolean => !a || (!a.api?.length && !a.mcp?.length)

/**
 * A página depois do aceite. `acessos` (já conferidos):
 * - `nova`: os do aceite (sugestão sozinha não concede nada);
 * - `atualizacao`/`rever`: ausentes = os de antes, intactos; presentes = os do aceite;
 * - a versão aceita pede `rede`/`local`: nenhum (o diálogo avisou).
 * As fichas seguem como antes: novas aceitas; aceitas e revogadas que o manifesto ainda pede ficam. `ligacoes` (1.9.7
 * em obra) não passam.
 */
export function paginaDepoisDoAceite(
  existente: PaginaRegistrada | undefined,
  prop: PropostaParaAceite,
  acessos: AcessosDaPagina | undefined,
  agora: number
): PaginaRegistrada {
  const base = {
    nome: prop.manifesto.nome,
    versao: prop.manifesto.versao,
    descricao: prop.manifesto.descricao,
    icone: prop.icone,
    hash: prop.hash,
    pedidas: [...prop.pedidas],
    atualizadaEm: agora
  }
  const bloqueio = bloqueioDasFichas(prop.pedidas)
  if (!existente || prop.tipo === 'nova') {
    return {
      id: prop.manifesto.id,
      ...base,
      origem: prop.origem,
      aceitas: [...prop.novas],
      recusadas: [],
      cordas: [],
      quedas: [],
      instaladaEm: agora,
      ...(!bloqueio && !vazio(acessos) ? { acessos } : {})
    }
  }
  const { acessos: antes, ...resto } = existente
  const depois = bloqueio ? undefined : acessos !== undefined ? acessos : antes
  return {
    ...resto,
    ...base,
    aceitas: [...new Set([...existente.aceitas.filter((a) => prop.pedidas.includes(a)), ...prop.novas])],
    recusadas: existente.recusadas.filter((x) => prop.pedidas.includes(x)),
    ...(!vazio(depois) ? { acessos: depois } : {})
  }
}

// ---------------------------------------------------------------- na hora da chamada

/** O que a página chamou não está entre o que ela enxerga. */
export const naoEnxergaApi = (nome: string): string => `a página não enxerga a API "${curto(nome)}": marque em Conexões › Páginas`
export const naoEnxergaMcp = (nome: string): string => `a página não enxerga o servidor MCP "${curto(nome)}": marque em Conexões › Páginas`

/**
 * Resolve o nome que a página mandou: (1) a API concedida de nome igual (normalizado); (2) a concedida com `atende`
 * contendo o nome. Dois iguais (nomes que colidem, de antes da regra) = erro, nunca escolha. API apagada = erro claro.
 */
function resolver<A extends { atende?: string[] }, C extends { id: string; nome: string }>(
  concedidos: readonly A[],
  idDe: (a: A) => string,
  conhecidos: readonly C[],
  nome: unknown,
  textos: { nao: (n: string) => string; sumiu: (n: string) => string; ambiguo: (n: string) => string }
): Resultado<{ acesso: A; alvo: C }> {
  if (typeof nome !== 'string' || !normalizar(nome)) return falha('nome inválido')
  const n = normalizar(nome)
  const pares = concedidos.map((acesso) => ({ acesso, alvo: conhecidos.find((c) => c.id === idDe(acesso)) }))
  const vivos = pares.filter((p): p is { acesso: A; alvo: C } => !!p.alvo)
  const porNome = vivos.filter((p) => normalizar(p.alvo.nome) === n)
  if (porNome.length === 1) return { ok: true, valor: porNome[0] }
  if (porNome.length > 1) return falha(textos.ambiguo(nome))
  const atende = (p: { acesso: A }): boolean => (p.acesso.atende ?? []).some((a) => normalizar(a) === n)
  const porAtende = vivos.filter(atende)
  if (porAtende.length === 1) return { ok: true, valor: porAtende[0] }
  if (porAtende.length > 1) return falha(textos.ambiguo(nome))
  if (pares.some((p) => !p.alvo && atende(p))) return falha(textos.sumiu(nome))
  return falha(textos.nao(nome))
}

export function resolverApi(acessos: AcessosDaPagina | undefined, apis: readonly ApiConhecida[], nome: unknown): Resultado<{ acesso: AcessoApi; alvo: ApiConhecida }> {
  return resolver(acessos?.api ?? [], (a) => a.apiId, apis, nome, {
    nao: naoEnxergaApi,
    sumiu: (n) => `a API que atendia "${curto(n)}" foi apagada: marque outra em Conexões › Páginas`,
    ambiguo: (n) => `"${curto(n)}" serve a mais de uma API que a página enxerga: renomeie uma em Conexões › APIs`
  })
}

export function resolverMcp(acessos: AcessosDaPagina | undefined, servidores: readonly ServidorConhecido[], nome: unknown): Resultado<{ acesso: AcessoMcp; alvo: ServidorConhecido }> {
  return resolver(acessos?.mcp ?? [], (a) => a.servidorId, servidores, nome, {
    nao: naoEnxergaMcp,
    sumiu: (n) => `o servidor MCP que atendia "${curto(n)}" foi apagado: marque outro em Conexões › Páginas`,
    ambiguo: (n) => `"${curto(n)}" serve a mais de um servidor que a página enxerga: renomeie um em Conexões › MCP`
  })
}

/** A escrita que vale: a da página E a da API. */
export const escritaEfetiva = (acesso: AcessoApi, api: ApiConhecida): boolean => acesso.escrita && !api.soLeitura

/** `orkPagina.api.disponiveis()`: nome, domínios, escrita e `atende`. Nunca id, fim da chave ou valor. Apagada some. */
export function apisDisponiveis(acessos: AcessosDaPagina | undefined, apis: readonly ApiConhecida[]): ApiDisponivelParaPagina[] {
  const saida: ApiDisponivelParaPagina[] = []
  for (const a of acessos?.api ?? []) {
    const api = apis.find((x) => x.id === a.apiId)
    if (api) saida.push({ nome: api.nome, dominios: [...api.dominios], escrita: escritaEfetiva(a, api), ...(a.atende?.length ? { atende: [...a.atende] } : {}) })
  }
  return saida
}

/** O que a moldura e o cartão mostram: nome, perigo (escrita, ou ferramenta sem "diz que só lê") e `sumiu`. */
export function usosDe(acessos: AcessosDaPagina | undefined, apis: readonly ApiConhecida[], servidores: readonly ServidorConhecido[]): UsoDaPagina[] {
  const usos: UsoDaPagina[] = []
  for (const a of acessos?.api ?? []) {
    const api = apis.find((x) => x.id === a.apiId)
    usos.push(api ? { tipo: 'api', id: a.apiId, nome: api.nome, perigo: escritaEfetiva(a, api) } : { tipo: 'api', id: a.apiId, nome: '(API apagada)', perigo: a.escrita, sumiu: true })
  }
  for (const s of acessos?.mcp ?? []) {
    const srv = servidores.find((x) => x.id === s.servidorId)
    if (!srv) {
      usos.push({ tipo: 'mcp', id: s.servidorId, nome: '(servidor apagado)', perigo: s.ferramentas.length > 0, sumiu: true })
      continue
    }
    // ferramenta que o servidor não diz que só lê (ou que ele não tem mais na lista conhecida) é perigo
    const perigo = s.ferramentas.some((f) => !srv.ferramentas?.find((x) => x.nome === f)?.dizQueSoLe)
    usos.push({ tipo: 'mcp', id: s.servidorId, nome: srv.nome, perigo })
  }
  return usos
}
