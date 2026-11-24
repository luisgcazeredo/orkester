// Fluxos (1.9.6): o contrato. Os tipos (em `tipos.ts`, reexportados aqui), os limites, a leitura não confiável de um
// fluxo (disco, colagem, `ork`, MCP), as regras do grafo, exportar e colar, e a regra de sensível. Puro: roda no Node.
import type { CriadaPor, EditadaPor, FluxoExportado, FluxoGravado, Ligacao, MotivoDoDesligado, NoDoFluxo } from './tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { MAX_NOME, MAX_POR_HORA, MIN_POR_HORA, POR_HORA_PADRAO, porHoraDoHorario } from '../automacoes.ts'
// @ts-expect-error idem
import { CATALOGO, definicaoDe, ehGatilho, ehTipoDeNo, faltaDoNo, linha, quantasSaidas, resolverReferenciasDoNo, textoLimpo, type EspacoDasReferencias } from './nos.ts'
// @ts-expect-error idem
import { normalizarPermitidos } from './rede.ts'

export type * from './tipos'

// ---------------------------------------------------------------- limites

export const VERSAO_DO_FLUXO = 1
export const MAX_NOS = 60
export const MAX_LIGACOES = 120
export const MAX_NOME_DO_NO = 60
export const MAX_NOME_DO_FLUXO = MAX_NOME
export const MAX_NOTAS = 2000
/** Coordenada do editor, em módulo. */
export const MAX_POSICAO = 1_000_000
export { MIN_POR_HORA, MAX_POR_HORA, POR_HORA_PADRAO }

/** Disco. */
export const MAX_FLUXOS = 100
export const MAX_PASTAS = 100
export const MAX_NIVEIS_DE_PASTA = 3
export const MAX_EXECUCOES = 50
/** Quantos endereços locais um fluxo pode permitir (veredito 196). */
export const MAX_LOCAIS_PERMITIDOS = 20

/** Execução (o executor e o motor seguem estes). */
export const MAX_PASSOS = 50
export const PRAZO_DA_EXECUCAO = 60_000
export const MAX_ITENS = 1000
export const MAX_BYTES_DA_LISTA = 5 * 1024 * 1024
/** Entrada e saída de cada nó guardadas na execução até ~10 KB; passou, `cortado`. */
export const CORTE_DO_NO = 10 * 1024
/** Recado, tarefa, comando e avisar: até 5 itens ("junte os itens antes, no nó Código"). */
export const MAX_ITENS_ORKESTER = 5
export const MAX_ITENS_HTTP = 20
export const MAX_RESUMO_DO_GATILHO = 120
export const MAX_LINHAS_DE_LOG = 50
export const MAX_BYTES_DE_LOG = 2048

// ---------------------------------------------------------------- leitura

const ID = /^[A-Za-z0-9_-]{1,80}$/
const idValido = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
const dataValida = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/** Chave de unicidade do nome do nó: sem diferenciar maiúsculas (o `$('Nome')` do Código usa o nome exato). */
export const chaveDoNome = (nome: string): string => nome.normalize('NFKC').toLocaleLowerCase('pt-BR')

export type Lido<T> = { ok: true; fluxo: T } | { ok: false; motivo: string }

function noValido(bruto: unknown, i: number): NoDoFluxo | string {
  const x = objeto(bruto)
  if (!x) return `nó ${i + 1}: não é um nó`
  if (!idValido(x.id)) return `nó ${i + 1}: sem id`
  const nome = typeof x.nome === 'string' ? linha(x.nome, MAX_NOME_DO_NO + 1) : ''
  if (!nome) return `nó ${i + 1}: dê um nome`
  if (nome.length > MAX_NOME_DO_NO) return `nó "${nome.slice(0, 30)}…": o nome passa de ${MAX_NOME_DO_NO} letras`
  if (!ehTipoDeNo(x.tipo)) return `nó "${nome}": tipo desconhecido "${linha(x.tipo, 30)}"`
  if (x.versaoDoTipo !== 1) return `nó "${nome}": versão do tipo desconhecida (atualize o Orkester)`
  const p = x.posicao
  if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_POSICAO)) return `nó "${nome}": posição inválida`
  const ajustes = definicaoDe(x.tipo).validar(x.ajustes)
  if (typeof ajustes === 'string') return `nó "${nome}": ${ajustes}`
  const notas = x.notas === undefined ? '' : textoLimpo(x.notas)
  if (notas.length > MAX_NOTAS) return `nó "${nome}": as notas passam de ${MAX_NOTAS} letras`
  return { id: x.id, nome, tipo: x.tipo, versaoDoTipo: 1, posicao: [p[0], p[1]], ajustes: ajustes as Record<string, unknown>, ...(notas ? { notas } : {}) }
}

/**
 * As regras do grafo. `null` = vale; senão o motivo. Ids e nomes únicos; ligação entre nós que existem, por uma saída
 * que existe, sem ligação repetida; gatilho sem entrada; um nó pode ter **várias entradas** (sem juntar ramos: cada
 * chegada roda o nó com os itens dela); e nenhum ciclo (nem entre nós soltos, sem gatilho). Até 60 nós e 120 ligações.
 */
export function validarGrafo(nos: readonly NoDoFluxo[], ligacoes: readonly Ligacao[]): string | null {
  if (nos.length > MAX_NOS) return `no máximo ${MAX_NOS} nós`
  if (ligacoes.length > MAX_LIGACOES) return `no máximo ${MAX_LIGACOES} ligações`
  const porId = new Map<string, NoDoFluxo>()
  const nomes = new Set<string>()
  for (const n of nos) {
    if (porId.has(n.id)) return `id de nó repetido: "${n.id}"`
    porId.set(n.id, n)
    const chave = chaveDoNome(n.nome)
    if (nomes.has(chave)) return `nome de nó repetido: "${n.nome}"`
    nomes.add(chave)
  }
  const filhos = new Map<string, string[]>()
  const vistas = new Set<string>()
  for (const l of ligacoes) {
    const de = porId.get(l.de)
    const para = porId.get(l.para)
    if (!de || !para) return `ligação para um nó que não existe ("${!de ? l.de : l.para}")`
    if (!Number.isInteger(l.saida) || l.saida < 0 || l.saida >= quantasSaidas(de.tipo)) return `"${de.nome}" não tem a saída ${l.saida}`
    if (ehGatilho(para.tipo)) return `o gatilho "${para.nome}" não recebe ligação`
    const chave = `${l.de}|${l.saida}|${l.para}`
    if (vistas.has(chave)) return `ligação repetida de "${de.nome}" para "${para.nome}"`
    vistas.add(chave)
    filhos.set(l.de, [...(filhos.get(l.de) ?? []), l.para])
  }
  // várias entradas valem (cada chegada roda o nó com os itens dela); ciclo não: busca em profundidade com 3 cores
  const cor = new Map<string, 1 | 2>()
  const ciclo = (id: string): string | null => {
    cor.set(id, 1)
    for (const f of filhos.get(id) ?? []) {
      if (cor.get(f) === 1) return f
      if (!cor.has(f)) {
        const achou = ciclo(f)
        if (achou) return achou
      }
    }
    cor.set(id, 2)
    return null
  }
  for (const n of nos) {
    if (cor.has(n.id)) continue
    const achou = ciclo(n.id)
    if (achou) return `ciclo passando por "${porId.get(achou)!.nome}"`
  }
  return null
}

function ligacaoValida(bruto: unknown, i: number): Ligacao | string {
  const x = objeto(bruto)
  if (!x || !idValido(x.de) || !idValido(x.para)) return `ligação ${i + 1} inválida`
  const saida = x.saida === undefined ? 0 : x.saida
  if (!Number.isInteger(saida)) return `ligação ${i + 1}: saída inválida`
  return { de: x.de, saida: saida as number, para: x.para }
}

/** Nome, nós e ligações (o que a exportação e o gravado têm em comum). */
function lerCorpo(x: Record<string, unknown>): Lido<FluxoExportado> {
  const nao = (motivo: string): Lido<never> => ({ ok: false, motivo })
  if (x.orkester !== 'fluxo') return nao('não é um fluxo do Orkester')
  if (typeof x.versao === 'number' && x.versao > VERSAO_DO_FLUXO) return nao('fluxo de uma versão mais nova do Orkester; atualize o app')
  if (x.versao !== VERSAO_DO_FLUXO) return nao('versão do fluxo inválida')
  const nome = typeof x.nome === 'string' ? linha(x.nome, MAX_NOME_DO_FLUXO + 1) : ''
  if (!nome) return nao('dê um nome ao fluxo (uma linha)')
  if (nome.length > MAX_NOME_DO_FLUXO) return nao(`o nome passa de ${MAX_NOME_DO_FLUXO} letras`)
  if (!Array.isArray(x.nos)) return nao('falta a lista de nós')
  if (x.nos.length > MAX_NOS) return nao(`no máximo ${MAX_NOS} nós`)
  const ligacoesBrutas = x.ligacoes === undefined ? [] : x.ligacoes
  if (!Array.isArray(ligacoesBrutas)) return nao('as ligações precisam ser uma lista')
  if (ligacoesBrutas.length > MAX_LIGACOES) return nao(`no máximo ${MAX_LIGACOES} ligações`)
  const nos: NoDoFluxo[] = []
  for (const [i, b] of x.nos.entries()) {
    const n = noValido(b, i)
    if (typeof n === 'string') return nao(n)
    nos.push(n)
  }
  const ligacoes: Ligacao[] = []
  for (const [i, b] of ligacoesBrutas.entries()) {
    const l = ligacaoValida(b, i)
    if (typeof l === 'string') return nao(l)
    ligacoes.push(l)
  }
  const grafo = validarGrafo(nos, ligacoes)
  if (grafo) return nao(grafo)
  return { ok: true, fluxo: { orkester: 'fluxo', versao: 1, nome, nos, ligacoes } }
}

/** O que foi colado ou mandado pelo `ork`/MCP, sem o que é do disco (campos a mais caem). */
export function lerExportado(bruto: unknown): Lido<FluxoExportado> {
  const x = objeto(bruto)
  return x ? lerCorpo(x) : { ok: false, motivo: 'não é um fluxo do Orkester' }
}

function autor(v: unknown, comData: boolean): CriadaPor | EditadaPor | null {
  const c = objeto(v)
  const nome = linha(c?.nome, MAX_NOME)
  if (!c || !nome || (c.id !== undefined && !idValido(c.id)) || (comData && !dataValida(c.em))) return null
  return { ...(c.id ? { id: c.id as string } : {}), nome, ...(comData ? { em: c.em as string } : {}) }
}

/** O teto por hora que os relógios do fluxo exigem não cabe? (o "a cada N min" dispara ⌈60/N⌉ numa hora). */
export function faltaNoTeto(fluxo: Pick<FluxoGravado, 'nos' | 'limite'>): string | null {
  for (const n of fluxo.nos) {
    if (n.tipo !== 'gatilho.relogio') continue
    const quando = (n.ajustes as { quando: Parameters<typeof porHoraDoHorario>[0] }).quando
    const precisa = porHoraDoHorario(quando)
    if (precisa > fluxo.limite.porHora) return `"${n.nome}" dispara ${precisa} vezes por hora: suba o teto do fluxo para ${precisa} (vai até ${MAX_POR_HORA}) ou aumente o intervalo`
  }
  return null
}

/**
 * Um fluxo do disco (não confiável). Devolve o fluxo normalizado (campos a mais caem, textos limpos) ou o motivo.
 * Não confere se dá para **ligar** (gatilho, "a escolher"): isso é `faltaParaLigar`, no ligar e no motor.
 */
export function lerFluxo(bruto: unknown): Lido<FluxoGravado> {
  const x = objeto(bruto)
  const nao = (motivo: string): Lido<never> => ({ ok: false, motivo })
  if (!x) return nao('não é um fluxo do Orkester')
  const corpo = lerCorpo(x)
  if (!corpo.ok) return corpo
  if (!idValido(x.id)) return nao('sem id')
  if (typeof x.ligado !== 'boolean') return nao('"ligado" não é sim/não')
  if (x.pasta !== undefined && !idValido(x.pasta)) return nao('pasta inválida')
  if (!dataValida(x.criadoEm)) return nao('data de criação inválida')
  const criadoPor = x.criadoPor === undefined ? undefined : autor(x.criadoPor, false)
  if (criadoPor === null) return nao('"criado por" inválido')
  const editadoPor = x.editadoPor === undefined ? undefined : (autor(x.editadoPor, true) as EditadaPor | null)
  if (editadoPor === null) return nao('"editado por" inválido')
  const porHora = objeto(x.limite)?.porHora
  if (!Number.isInteger(porHora) || (porHora as number) < MIN_POR_HORA || (porHora as number) > MAX_POR_HORA) return nao(`limite por hora: de ${MIN_POR_HORA} a ${MAX_POR_HORA}`)
  // rede: a lista de endereços locais permitidos (veredito 196). O formato antigo (`internaLiberada`, a rede inteira)
  // NUNCA vira permissão: lista vazia e fluxo desligado (o selo antigo também deixa de conferir: reaprovação).
  let locais: string[] = []
  let redeAntiga = false
  if (x.rede !== undefined) {
    const r = objeto(x.rede)
    if (r && Array.isArray(r.locaisPermitidos) && r.locaisPermitidos.length <= MAX_LOCAIS_PERMITIDOS) locais = normalizarPermitidos(r.locaisPermitidos)
    else if (r && 'internaLiberada' in r && !('locaisPermitidos' in r)) redeAntiga = true
    else return nao('"rede" inválida')
  }
  let aprovado: FluxoGravado['aprovado']
  if (x.aprovado !== undefined) {
    const a = objeto(x.aprovado)
    const nos = objeto(a?.nos)
    if (!a || !nos || !dataValida(a.em) || typeof a.selo !== 'string' || !a.selo || a.selo.length > 256) return nao('"aprovado" inválido')
    if (!Object.entries(nos).every(([k, v]) => idValido(k) && typeof v === 'string' && /^[0-9a-f]{16,128}$/i.test(v))) return nao('"aprovado" inválido')
    aprovado = { em: a.em as string, nos: { ...(nos as Record<string, string>) }, selo: a.selo }
  }
  let desligadoPor: FluxoGravado['desligadoPor']
  if (x.desligadoPor !== undefined) {
    const d = objeto(x.desligadoPor)
    const motivos: MotivoDoDesligado[] = ['excesso', 'cartao-sumiu', 'mudou-sem-aprovacao', 'coluna-sumiu']
    if (!d || !motivos.includes(d.motivo as MotivoDoDesligado) || !dataValida(d.em)) return nao('"desligado por" inválido')
    desligadoPor = { motivo: d.motivo as MotivoDoDesligado, em: d.em as string }
  }
  const fluxo: FluxoGravado = {
    ...corpo.fluxo,
    id: x.id,
    ligado: redeAntiga ? false : x.ligado,
    ...(x.pasta ? { pasta: x.pasta as string } : {}),
    criadoEm: x.criadoEm,
    ...(criadoPor ? { criadoPor } : {}),
    ...(editadoPor ? { editadoPor } : {}),
    limite: { porHora: porHora as number },
    ...(locais.length ? { rede: { locaisPermitidos: locais } } : {}),
    ...(aprovado ? { aprovado } : {}),
    ...(desligadoPor ? { desligadoPor } : {})
  }
  const teto = faltaNoTeto(fluxo)
  return teto ? nao(teto) : { ok: true, fluxo }
}

// ---------------------------------------------------------------- ligar e sensível

/**
 * Dá para ligar? `null` = dá. Precisa de pelo menos 1 gatilho e de nenhum nó com Falta (`faltaDoNo`: ajuste incompleto,
 * cartão ou coluna "a escolher"; com `espaco`, também coluna ou cartão que saiu dele).
 */
export function faltaParaLigar(fluxo: Pick<FluxoExportado, 'nos'>, espaco?: Partial<EspacoDasReferencias>): string | null {
  if (!fluxo.nos.some((n) => ehGatilho(n.tipo))) return 'o fluxo precisa de pelo menos 1 gatilho'
  for (const n of fluxo.nos) {
    const falta = faltaDoNo(n, espaco)
    if (falta) return `"${n.nome}": ${falta}`
  }
  return null
}

/** Código, HTTP ou comando. */
export const noSensivel = (no: Pick<NoDoFluxo, 'tipo'>): boolean => CATALOGO[no.tipo].sensivel
export const nosSensiveis = <N extends Pick<NoDoFluxo, 'tipo'>>(fluxo: { nos: readonly N[] }): N[] => fluxo.nos.filter(noSensivel)
/** O fluxo tem Código, HTTP ou comando: o agente cria e edita, mas só o usuário liga. */
export const ehSensivel = (fluxo: { nos: readonly Pick<NoDoFluxo, 'tipo'>[] }): boolean => fluxo.nos.some(noSensivel)

/** JSON com as chaves em ordem (igual para o mesmo conteúdo, venha na ordem que vier). */
export function jsonCanonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/**
 * O que o usuário aprova num nó sensível: tipo, versão e ajustes (o nome, a posição e as notas não contam). O main
 * guarda o hash disto em `aprovado.nos`; o nó cuja assinatura mudou aparece marcado na confirmação.
 */
export const assinaturaDoNo = (no: Pick<NoDoFluxo, 'tipo' | 'versaoDoTipo' | 'ajustes'>): string => jsonCanonico({ tipo: no.tipo, versaoDoTipo: no.versaoDoTipo, ajustes: no.ajustes })

/**
 * O que a confirmação de ligar mostrou: a assinatura de cada nó sensível, por id (JSON canônico). A tela manda isto como
 * `mostrado`; o main recalcula do disco e recusa se for outro (um agente mexeu no meio da confirmação).
 */
export const assinaturaDoMostrado = (fluxo: { nos: readonly NoDoFluxo[]; rede?: { locaisPermitidos?: readonly string[] } }): string => {
  const nos = Object.fromEntries(fluxo.nos.filter(noSensivel).map((n) => [n.id, assinaturaDoNo(n)]))
  // os endereços locais permitidos entram no que se confirma (veredito 196); sem nenhum, a assinatura é a de antes
  const locais = locaisDoFluxo(fluxo)
  return jsonCanonico(locais.length ? { nos, rede: { locaisPermitidos: locais } } : nos)
}

/** Os endereços locais permitidos do fluxo, canônicos e em ordem (o que o selo e a confirmação assinam). */
export const locaisDoFluxo = (fluxo: { rede?: { locaisPermitidos?: readonly string[] } }): string[] =>
  normalizarPermitidos(fluxo.rede?.locaisPermitidos ?? [])

// ---------------------------------------------------------------- exportar e colar

/** Só o que vai no Ctrl+C: nome, nós e ligações. Com `selecao`, só esses nós e as ligações entre eles. */
export function exportar(fluxo: FluxoExportado, selecao?: readonly string[]): FluxoExportado {
  const sel = selecao ? new Set(selecao) : null
  const nos = sel ? fluxo.nos.filter((n) => sel.has(n.id)) : fluxo.nos
  const ligacoes = sel ? fluxo.ligacoes.filter((l) => sel.has(l.de) && sel.has(l.para)) : fluxo.ligacoes
  return JSON.parse(JSON.stringify({ orkester: 'fluxo', versao: 1, nome: fluxo.nome, nos, ligacoes })) as FluxoExportado
}

/** O primeiro `no-N` que ninguém usa. */
export function proximoIdDeNo(usados: ReadonlySet<string>): string {
  for (let i = 1; ; i++) if (!usados.has(`no-${i}`)) return `no-${i}`
}

/** `nome`, ou `nome 2`, `nome 3`… o primeiro que não está em `usados` (chaves de `chaveDoNome`). */
export function nomeLivre(nome: string, usados: ReadonlySet<string>): string {
  if (!usados.has(chaveDoNome(nome))) return nome
  for (let i = 2; ; i++) {
    const sufixo = ` ${i}`
    const candidato = `${nome.slice(0, MAX_NOME_DO_NO - sufixo.length)}${sufixo}`
    if (!usados.has(chaveDoNome(candidato))) return candidato
  }
}

/**
 * Cola nós (de um Ctrl+C) num fluxo: id que colide é renumerado (e as ligações coladas acompanham); nome que colide
 * ganha ` 2`, ` 3`…; ligações e posições vêm como estavam. Passou de 60 nós ou 120 ligações: o motivo, e nada muda.
 * Devolve nós e ligações novos e o mapa id colado → id final.
 */
export function colarNoFluxo(
  alvo: Pick<FluxoExportado, 'nos' | 'ligacoes'>,
  colado: Pick<FluxoExportado, 'nos' | 'ligacoes'>
): { nos: NoDoFluxo[]; ligacoes: Ligacao[]; ids: Record<string, string> } | string {
  if (alvo.nos.length + colado.nos.length > MAX_NOS) return `o fluxo passaria de ${MAX_NOS} nós`
  if (alvo.ligacoes.length + colado.ligacoes.length > MAX_LIGACOES) return `o fluxo passaria de ${MAX_LIGACOES} ligações`
  const ids = new Set(alvo.nos.map((n) => n.id))
  const nomes = new Set(alvo.nos.map((n) => chaveDoNome(n.nome)))
  const mapa: Record<string, string> = {}
  const novos: NoDoFluxo[] = []
  for (const n of colado.nos) {
    const id = ids.has(n.id) ? proximoIdDeNo(new Set([...ids, ...colado.nos.map((c) => c.id)])) : n.id
    ids.add(id)
    mapa[n.id] = id
    const nome = nomeLivre(n.nome, nomes)
    nomes.add(chaveDoNome(nome))
    novos.push({ ...JSON.parse(JSON.stringify(n)), id, nome })
  }
  const ligacoes = colado.ligacoes.filter((l) => mapa[l.de] && mapa[l.para]).map((l) => ({ de: mapa[l.de], saida: l.saida, para: mapa[l.para] }))
  const resultado = { nos: [...alvo.nos, ...novos], ligacoes: [...alvo.ligacoes, ...ligacoes] }
  const grafo = validarGrafo(resultado.nos, resultado.ligacoes)
  return grafo ?? { ...resultado, ids: mapa }
}

/**
 * Um fluxo inteiro colado (ou criado pelo `ork`/MCP) vira um fluxo novo: **desligado**, na raiz, com o id, a data e
 * o autor de agora e o teto padrão (ou o que os relógios dele exigem). Ligar é sempre um passo à parte.
 */
export function fluxoNovo(colado: FluxoExportado, ctx: { id: string; agora: Date; autor: CriadaPor }): FluxoGravado {
  const base = exportar(colado)
  const precisa = Math.max(POR_HORA_PADRAO, ...base.nos.filter((n) => n.tipo === 'gatilho.relogio').map((n) => porHoraDoHorario((n.ajustes as { quando: Parameters<typeof porHoraDoHorario>[0] }).quando)))
  return { ...base, id: ctx.id, ligado: false, criadoEm: ctx.agora.toISOString(), criadoPor: { ...ctx.autor }, limite: { porHora: Math.min(MAX_POR_HORA, precisa) } }
}

/**
 * O fluxo com cartões e colunas resolvidos contra este espaço (pelo id; senão pelo nome; senão "a escolher").
 * Para um fluxo colado de outro espaço, ou mandado pelo agente só com nomes.
 */
export function resolverReferencias<F extends Pick<FluxoExportado, 'nos'>>(
  fluxo: F,
  espaco: { cartoes: readonly { id: string; nome: string }[]; colunas: readonly { id: string; nome: string }[] }
): F {
  return { ...fluxo, nos: fluxo.nos.map((n) => resolverReferenciasDoNo(n, espaco)) }
}
