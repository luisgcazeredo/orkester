// Editor de Fluxos: copiar e colar. Puro (sem DOM): a `colar.prova` roda no Node.
//
// Copiar (Ctrl+C) põe na área de transferência o JSON de `exportar` (nome, nós e ligações, sem id do fluxo, ligado,
// pasta nem autor): texto puro, o mesmo que o agente lê e escreve pelo `ork fluxo`. Colar (Ctrl+V) aceita esse JSON
// vindo de qualquer lugar. Os nós entram no rascunho com id e nome novos quando colidem (`colarNoFluxo`, no reducer).
//
// O contrato recusa nó incompleto (o padrão de um nó novo não passa no validador), mas o editor guarda rascunho: um
// Ctrl+C de um nó ainda sem texto precisa colar de volta. Por isso a colagem tem duas leituras: a estrita
// (`lerExportado`) e, se ela recusar só por causa dos ajustes, a tolerante, que guarda a estrutura (ids, nomes, tipos,
// posições, ligações) e põe nos ajustes só o que tem a forma do padrão do tipo. Quem confere tudo é o Salvar.
import type { Ligacao, NoDoFluxo, TipoDeNo } from '../../../../../shared/fluxos/tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { exportar, lerExportado, MAX_LIGACOES, MAX_NOME_DO_NO, MAX_NOS, MAX_POSICAO, validarGrafo } from '../../../../../shared/fluxos/formato.ts'
// @ts-expect-error idem
import { CATALOGO, ehTipoDeNo, faltaDoNo, linha, resolverReferenciasDoNo } from '../../../../../shared/fluxos/nos.ts'
// @ts-expect-error idem
import { caixaDoNoDoFluxo } from './geometria.ts'

/** Acima disto nem tenta ler (1 MB): não é um fluxo de 60 nós. */
export const MAX_TEXTO_COLADO = 1_000_000

export interface EspacoParaResolver {
  cartoes: readonly { id: string; nome: string }[]
  colunas: readonly { id: string; nome: string }[]
}

export type Colagem =
  | {
      ok: true
      nome: string
      nos: NoDoFluxo[]
      ligacoes: Ligacao[]
      /** Quantos nós colados ficam com Falta (`faltaDoNo`, depois de acertar cartões e colunas): o aviso de colar conta. */
      incompletos: number
      /** Veio um fluxo inteiro (sem a marca `trecho` do Ctrl+C de parte dos nós): só ele dá o nome a um fluxo novo e vazio. */
      inteiro: boolean
    }
  | { ok: false; motivo: string }

const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const ID = /^[A-Za-z0-9_-]{1,80}$/
const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Uma referência `{ id, nome }` de texto (a forma que o editor sabe mostrar). */
const ehReferencia = (v: unknown): boolean => {
  const o = objeto(v)
  return !!o && typeof o.id === 'string' && typeof o.nome === 'string'
}

/**
 * Ajustes que o editor consegue mostrar, mesmo que o Salvar ainda vá recusar: o padrão do tipo, trocado campo a campo
 * pelo que veio com a mesma forma (texto por texto, lista por lista de objetos, referência por referência). Campos
 * opcionais que o padrão não tem (coluna de origem, "entregar para"…) entram se forem texto ou referência.
 */
export function ajustesTolerantes(tipo: TipoDeNo, bruto: unknown): Record<string, unknown> {
  const padrao = CATALOGO[tipo].padrao() as Record<string, unknown>
  const x = objeto(bruto)
  if (!x) return padrao
  const saida: Record<string, unknown> = { ...padrao }
  for (const [chave, valor] of Object.entries(x)) {
    if (chave === '__proto__' || chave === 'constructor' || chave === 'prototype') continue
    const p = padrao[chave]
    if (p === undefined) {
      if (typeof valor === 'string' || typeof valor === 'boolean' || ehReferencia(valor)) saida[chave] = copia(valor)
      continue
    }
    if (Array.isArray(p)) {
      if (Array.isArray(valor)) saida[chave] = copia(valor.filter((i) => typeof i === 'string' || objeto(i)))
    } else if (ehReferencia(p)) {
      if (ehReferencia(valor)) saida[chave] = { id: (valor as { id: string }).id, nome: (valor as { nome: string }).nome }
    } else if (objeto(p)) {
      const o = objeto(valor)
      if (o) saida[chave] = copia({ ...p, ...Object.fromEntries(Object.entries(o).filter(([k, v]) => typeof v === typeof (p as Record<string, unknown>)[k])) })
    } else if (typeof valor === typeof p) saida[chave] = valor
  }
  return saida
}

/** A leitura tolerante: estrutura certa, ajustes do jeito que der. `string` = o que está errado na estrutura. */
function lerTolerante(x: Record<string, unknown>): { nome: string; nos: NoDoFluxo[]; ligacoes: Ligacao[]; incompletos: number } | string {
  if (x.orkester !== 'fluxo' || x.versao !== 1) return 'não é um fluxo do Orkester'
  if (!Array.isArray(x.nos)) return 'falta a lista de nós'
  if (x.nos.length > MAX_NOS) return `no máximo ${MAX_NOS} nós`
  const brutas = x.ligacoes === undefined ? [] : x.ligacoes
  if (!Array.isArray(brutas)) return 'as ligações precisam ser uma lista'
  if (brutas.length > MAX_LIGACOES) return `no máximo ${MAX_LIGACOES} ligações`
  const nos: NoDoFluxo[] = []
  let incompletos = 0
  for (const [i, b] of x.nos.entries()) {
    const n = objeto(b)
    if (!n || typeof n.id !== 'string' || !ID.test(n.id)) return `nó ${i + 1}: sem id`
    const nome = linha(n.nome, MAX_NOME_DO_NO)
    if (!nome) return `nó ${i + 1}: sem nome`
    if (!ehTipoDeNo(n.tipo)) return `nó "${nome}": tipo desconhecido`
    const p = n.posicao
    const posicao: [number, number] =
      Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_POSICAO) ? [p[0], p[1]] : [i * 260, 0]
    const validado = CATALOGO[n.tipo].validar(n.ajustes)
    const completo = typeof validado !== 'string'
    if (!completo) incompletos++
    const notas = typeof n.notas === 'string' && n.notas.trim() ? n.notas.trim().slice(0, 2000) : undefined
    nos.push({ id: n.id, nome, tipo: n.tipo, versaoDoTipo: 1, posicao, ajustes: completo ? (validado as Record<string, unknown>) : ajustesTolerantes(n.tipo, n.ajustes), ...(notas ? { notas } : {}) })
  }
  const ligacoes: Ligacao[] = []
  for (const [i, b] of brutas.entries()) {
    const l = objeto(b)
    const saida = l?.saida === undefined ? 0 : l.saida
    if (!l || typeof l.de !== 'string' || typeof l.para !== 'string' || !Number.isInteger(saida)) return `ligação ${i + 1} inválida`
    ligacoes.push({ de: l.de, saida: saida as number, para: l.para })
  }
  const grafo = validarGrafo(nos, ligacoes)
  if (grafo) return grafo
  const nome = linha(x.nome, 80) || 'Colado'
  return { nome, nos, ligacoes, incompletos }
}

/**
 * O texto da área de transferência como nós para colar; ou o motivo, e nada muda. Com `espaco`, os cartões e colunas
 * são acertados contra este espaço (pelo id; senão pelo nome; senão ficam "a escolher").
 */
export function lerColagem(texto: string, espaco?: EspacoParaResolver): Colagem {
  const t = texto.trim()
  if (!t) return { ok: false, motivo: 'a área de transferência está vazia' }
  if (t.length > MAX_TEXTO_COLADO) return { ok: false, motivo: 'o texto colado é grande demais para um fluxo' }
  let bruto: unknown
  try {
    bruto = JSON.parse(t)
  } catch {
    return { ok: false, motivo: 'isto não é um fluxo: copie nós de um fluxo do Orkester (Ctrl+C) ou o JSON de "ork fluxo ver --json"' }
  }
  const resolver = (nos: NoDoFluxo[]): NoDoFluxo[] => (espaco ? nos.map((n) => resolverReferenciasDoNo(n, espaco)) : nos)
  // a mesma regra da Falta no nó (validador e "a escolher"); o id que sumiu não sobra, porque o resolver já o acertou
  const comFalta = (nos: NoDoFluxo[]): number => nos.filter((n) => faltaDoNo(n) !== null).length
  const x = objeto(bruto)
  // o Ctrl+C de parte dos nós marca `trecho` (o leitor do formato descarta o campo); JSON de fora não tem a marca
  const inteiro = x?.[TRECHO] !== true
  const estrito = lerExportado(bruto)
  if (estrito.ok) {
    const nos = resolver(estrito.fluxo.nos)
    return { ok: true, nome: estrito.fluxo.nome, nos, ligacoes: estrito.fluxo.ligacoes, incompletos: comFalta(nos), inteiro }
  }
  // cabeçalho errado (não é fluxo, versão mais nova): o motivo da leitura estrita é o certo
  if (!x || x.orkester !== 'fluxo' || x.versao !== 1) return { ok: false, motivo: estrito.motivo }
  const tolerante = lerTolerante(x)
  if (typeof tolerante === 'string') return { ok: false, motivo: tolerante }
  if (!tolerante.nos.length) return { ok: false, motivo: 'o fluxo colado não tem nós' }
  const nos = resolver(tolerante.nos)
  return { ok: true, nome: tolerante.nome, nos, ligacoes: tolerante.ligacoes, incompletos: comFalta(nos), inteiro }
}

/**
 * O nome que o fluxo de destino ganha ao colar, ou `null` (fica o que está). Só um fluxo **inteiro** colado num fluxo
 * novo (ainda não salvo), vazio e com o nome padrão leva o nome junto; nós soltos de outro fluxo não (senão a lista
 * fica com dois fluxos de nome igual).
 */
export function nomeAoColar(c: { nome: string; inteiro: boolean }, destino: { salvo: boolean; nos: number; nome: string }, nomeDoNovo: string): string | null {
  const nome = c.nome.trim()
  return c.inteiro && !destino.salvo && destino.nos === 0 && destino.nome === nomeDoNovo && !!nome && nome !== nomeDoNovo ? nome : null
}

/** A marca do Ctrl+C de parte dos nós: colado num fluxo novo, um trecho não leva o nome do fluxo de origem. */
const TRECHO = 'trecho'

/**
 * O texto do Ctrl+C: os nós selecionados (ou todos) e as ligações entre eles. Sem seleção, ou com todos os nós
 * selecionados, é o fluxo inteiro; com só parte deles, vai marcado como `trecho`.
 */
export function textoParaCopiar(fluxo: { nome: string; nos: readonly NoDoFluxo[]; ligacoes: readonly Ligacao[] }, selecao?: readonly string[]): string {
  const exportado = exportar({ orkester: 'fluxo', versao: 1, nome: fluxo.nome || 'Fluxo', nos: [...fluxo.nos], ligacoes: [...fluxo.ligacoes] }, selecao)
  const parte = exportado.nos.length < fluxo.nos.length
  return JSON.stringify(parte ? { ...exportado, [TRECHO]: true } : exportado, null, 2)
}

/** Quanto somar às posições coladas para o canto de cima à esquerda delas cair em `alvo` (na grade de `passo`). */
export function deslocamentoParaColar(nos: readonly Pick<NoDoFluxo, 'posicao'>[], alvo: { x: number; y: number }, passo = 20): [number, number] {
  if (!nos.length) return [0, 0]
  const x = Math.min(...nos.map((n) => n.posicao[0]))
  const y = Math.min(...nos.map((n) => n.posicao[1]))
  const g = (v: number): number => Math.round(v / passo) * passo
  return [g(alvo.x - x), g(alvo.y - y)]
}

type NoComCaixa = Pick<NoDoFluxo, 'tipo' | 'posicao'>
type CaixaSimples = { x: number; y: number; largura: number; altura: number }
const cruzam = (a: CaixaSimples, b: CaixaSimples): boolean => a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura

/**
 * A cópia que cairia em cima de nós que já estão no desenho anda +passo,+passo até não encostar em nenhum (no máximo
 * `max` passos; depois disso fica onde parou). Colar o mesmo fluxo 2 vezes não esconde mais o original.
 */
export function deslocamentoLivre(colados: readonly NoComCaixa[], existentes: readonly NoComCaixa[], deslocar: [number, number], passo = 40, max = 60): [number, number] {
  const fixas: CaixaSimples[] = existentes.map((n) => caixaDoNoDoFluxo(n))
  let [dx, dy] = deslocar
  for (let i = 0; i < max; i++) {
    const encosta = colados.some((n) => {
      const c = caixaDoNoDoFluxo({ tipo: n.tipo, posicao: [n.posicao[0] + dx, n.posicao[1] + dy] })
      return fixas.some((f) => cruzam(c, f))
    })
    if (!encosta) break
    dx += passo
    dy += passo
  }
  return [dx, dy]
}
