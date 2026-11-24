// Fluxos (1.9.6): o disco. Por espaço, em `<espaço>/fluxos/`:
//   indice.json                       { versao:1, pastas:[{id,nome,pai?}], ordem:[ids], exemplosCriados? }
//   <fluxoId>.json                    um fluxo (FluxoGravado), no máximo 100 por espaço
//   execucoes/<fluxoId>.jsonl         o resumo, uma linha por execução (as últimas 50)
//   execucoes/<fluxoId>/<execId>.json o detalhe
// Tudo o que vem do disco é não confiável e passa por `lerFluxo`. Arquivo ilegível não é sobrescrito: fica fora da
// lista (em `invalidos`) e, se um dia for regravado, antes vira uma cópia `.ruim`. Leitura com cache por mtime.
// Sem Electron: a pasta do espaço e a gravação atômica (`gravarJsonAtomico` de `main/dados.ts`) vêm de quem cria o
// disco, para a prova rodar no Node com uma pasta temporária.
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Execucao, FluxoGravado, IndiceDeFluxos, PastaDeFluxos, ResumoDaExecucao } from '../../shared/fluxos/formato'
import type { Coluna } from '../../shared/kanban'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { fluxoNovo, lerFluxo, MAX_EXECUCOES, MAX_FLUXOS, MAX_NIVEIS_DE_PASTA, MAX_PASTAS } from '../../shared/fluxos/formato.ts'
// @ts-expect-error idem
import { exemplos, PASTA_DE_EXEMPLOS } from '../../shared/fluxos/exemplos.ts'
// @ts-expect-error idem
import { linha } from '../../shared/fluxos/nos.ts'

export const MAX_NOME_DA_PASTA = 60

export interface DependenciasDoDisco {
  /** A pasta do espaço (`~/.orkester/espacos/<id>`); lança se o id não vale. */
  pastaDoEspaco: (espacoId: string) => string
  /** `main/dados.ts`: temporário + `rename`; com `guardarRuim`, copia o atual para `.ruim` antes. */
  gravarJsonAtomico: (destino: string, valor: unknown, guardarRuim: boolean) => void
  novoId?: () => string
}

export interface FluxoInvalido {
  arquivo: string
  id?: string
  motivo: string
}

export interface ListaDeFluxos {
  indice: IndiceDeFluxos
  /** Na ordem do índice; os que o índice não cita vêm depois, do mais antigo ao mais novo. */
  fluxos: FluxoGravado[]
  invalidos: FluxoInvalido[]
  /** O resumo da última execução de cada fluxo que já rodou. */
  ultimas: Record<string, ResumoDaExecucao>
  /** O `indice.json` estava ilegível: pastas vazias até a próxima gravação, que guarda o `.ruim` antes. */
  indiceRuim?: true
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string }

const ID = /^[A-Za-z0-9_-]{1,80}$/
const ARQUIVO_DE_FLUXO = /^([A-Za-z0-9_-]{1,80})\.json$/
const INDICE_VAZIO = (): IndiceDeFluxos => ({ versao: 1, pastas: [], ordem: [] })
const sim = <T>(valor: T): Resultado<T> => ({ ok: true, valor })
const nao = (motivo: string): { ok: false; motivo: string } => ({ ok: false, motivo })
const dataValida = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))

// ---------------------------------------------------------------- puro: o índice

/** Quantos níveis a pasta tem (1 = na raiz). `Infinity` se o `pai` dá volta ou não existe. */
export function nivelDaPasta(pastas: readonly PastaDeFluxos[], id: string): number {
  const porId = new Map(pastas.map((p) => [p.id, p]))
  let nivel = 0
  let atual: PastaDeFluxos | undefined = porId.get(id)
  while (atual) {
    nivel++
    if (nivel > pastas.length) return Infinity
    if (atual.pai === undefined) return nivel
    atual = porId.get(atual.pai)
  }
  return Infinity
}

/** A pasta e todas as que estão dentro dela (ids). */
export function subarvoreDaPasta(pastas: readonly PastaDeFluxos[], id: string): Set<string> {
  const dentro = new Set([id])
  for (let mudou = true; mudou; ) {
    mudou = false
    for (const p of pastas) if (p.pai !== undefined && dentro.has(p.pai) && !dentro.has(p.id)) (dentro.add(p.id), (mudou = true))
  }
  return dentro
}

/**
 * O `indice.json` lido como não confiável. Pasta inválida, com pai que não existe, em ciclo ou abaixo do 3º nível
 * cai (os fluxos dela aparecem na raiz); acima de 100, o resto cai. `null` = não é um índice (ilegível).
 */
export function lerIndice(json: unknown): IndiceDeFluxos | null {
  const x = json as Partial<Record<keyof IndiceDeFluxos, unknown>> | null
  if (!x || typeof x !== 'object' || Array.isArray(x) || x.versao !== 1) return null
  const brutas = Array.isArray(x.pastas) ? x.pastas : []
  const candidatas: PastaDeFluxos[] = []
  const ids = new Set<string>()
  for (const b of brutas.slice(0, MAX_PASTAS)) {
    const p = b as Partial<PastaDeFluxos> | null
    const nome = linha(p?.nome, MAX_NOME_DA_PASTA)
    if (!p || typeof p.id !== 'string' || !ID.test(p.id) || ids.has(p.id) || !nome || (p.pai !== undefined && (typeof p.pai !== 'string' || !ID.test(p.pai)))) continue
    ids.add(p.id)
    candidatas.push({ id: p.id, nome, ...(p.pai !== undefined ? { pai: p.pai } : {}) })
  }
  const pastas = candidatas.filter((p) => nivelDaPasta(candidatas, p.id) <= MAX_NIVEIS_DE_PASTA)
  const ordem = Array.isArray(x.ordem) ? [...new Set(x.ordem.filter((i): i is string => typeof i === 'string' && ID.test(i)))] : []
  return { versao: 1, pastas, ordem, ...(x.exemplosCriados === true ? { exemplosCriados: true } : {}) }
}

/** Uma linha do `.jsonl` de execuções; `null` = linha ruim (é pulada). */
export function lerResumo(texto: string): ResumoDaExecucao | null {
  let x: Record<string, unknown>
  try {
    x = JSON.parse(texto)
  } catch {
    return null
  }
  if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !ID.test(x.id) || !dataValida(x.inicio) || typeof x.resultado !== 'string') return null
  return x as unknown as ResumoDaExecucao
}

/** O resumo de uma execução (a linha do `.jsonl`): o primeiro nó com erro, se houver. */
export function resumoDe(e: Execucao): ResumoDaExecucao {
  const comErro = e.caminho.find((id) => e.nos[id]?.estado === 'erro')
  return {
    id: e.id,
    modo: e.modo,
    gatilho: e.gatilho,
    inicio: e.inicio,
    ms: e.ms,
    resultado: e.resultado,
    ...(e.detalhe ? { detalhe: e.detalhe } : {}),
    ...(comErro ? { noComErro: comErro, ...(e.nos[comErro].erro ? { erro: e.nos[comErro].erro } : {}) } : {})
  }
}

// ---------------------------------------------------------------- o disco

export interface DiscoDeFluxos {
  listar(espaco: string): ListaDeFluxos
  ler(espaco: string, id: string): FluxoGravado | null
  /** Grava um fluxo já montado (autor, datas): valida de novo, recusa pasta que não existe e o 101º. */
  gravar(espaco: string, fluxo: FluxoGravado): Resultado<FluxoGravado>
  /** Apaga o fluxo e as execuções dele. */
  apagar(espaco: string, id: string): Resultado<true>
  mover(espaco: string, id: string, pasta: string | null): Resultado<FluxoGravado>
  criarPasta(espaco: string, nome: string, pai?: string): Resultado<PastaDeFluxos>
  renomearPasta(espaco: string, id: string, nome: string): Resultado<PastaDeFluxos>
  /** Apaga a pasta e as de dentro; os fluxos delas sobem para a raiz. */
  apagarPasta(espaco: string, id: string): Resultado<{ subiram: string[] }>
  marcarExemplosCriados(espaco: string): void
  /**
   * Os 3 exemplos, uma vez por espaço: desligados, na pasta "Exemplos" (a que já existe na raiz, ou uma nova). Depois
   * marca `exemplosCriados`: rodar de novo, ou apagá-los, não os traz de volta. Devolve os criados agora.
   */
  criarExemplos(espaco: string, colunas: readonly Pick<Coluna, 'id' | 'nome' | 'final' | 'papel'>[], agora?: Date): FluxoGravado[]
  /** Grava o detalhe e acrescenta o resumo; passou de 50, poda as mais antigas (resumo e detalhe). */
  gravarExecucao(espaco: string, execucao: Execucao): void
  /** As últimas execuções do fluxo, da mais nova para a mais antiga. */
  execucoes(espaco: string, fluxoId: string, limite?: number): ResumoDaExecucao[]
  execucao(espaco: string, fluxoId: string, execId: string): Execucao | null
  /** Esquece o cache (espaço apagado). */
  esquecer(espaco: string): void
}

export function criarDiscoDeFluxos(dep: DependenciasDoDisco): DiscoDeFluxos {
  const novoId = dep.novoId ?? randomUUID
  /** Cache por caminho: mtime + tamanho do arquivo e o que se leu dele. */
  const cache = new Map<string, { mtime: number; tamanho: number; valor: unknown }>()

  const pasta = (espaco: string): string => join(dep.pastaDoEspaco(espaco), 'fluxos')
  const pastaDeExecucoes = (espaco: string): string => join(pasta(espaco), 'execucoes')
  const exigirId = (id: string, oQue: string): void => {
    if (!ID.test(id)) throw new Error(`id de ${oQue} inválido`)
  }

  /** Lê o arquivo (com cache por mtime) e passa por `ler`; `undefined` = não existe. */
  function lerComCache<T>(caminho: string, ler: (texto: string) => T): T | undefined {
    let s: { mtimeMs: number; size: number }
    try {
      s = statSync(caminho)
    } catch {
      cache.delete(caminho)
      return undefined
    }
    const guardado = cache.get(caminho)
    if (guardado && guardado.mtime === s.mtimeMs && guardado.tamanho === s.size) return guardado.valor as T
    let texto: string
    try {
      texto = readFileSync(caminho, 'utf8')
    } catch {
      return undefined
    }
    const valor = ler(texto)
    cache.set(caminho, { mtime: s.mtimeMs, tamanho: s.size, valor })
    return valor
  }

  const jsonOuRuim = (texto: string): { json: unknown } | { ruim: true } => {
    try {
      return { json: JSON.parse(texto) }
    } catch {
      return { ruim: true }
    }
  }

  /** O índice e se o arquivo estava ilegível (ou não era um índice). */
  function lerIndiceDoEspaco(espaco: string): { indice: IndiceDeFluxos; ruim: boolean } {
    const lido = lerComCache(join(pasta(espaco), 'indice.json'), (t) => {
      const j = jsonOuRuim(t)
      const indice = 'json' in j ? lerIndice(j.json) : null
      return indice ? { indice, ruim: false } : { indice: INDICE_VAZIO(), ruim: true }
    })
    if (!lido) return { indice: INDICE_VAZIO(), ruim: false }
    return { indice: structuredClone(lido.indice), ruim: lido.ruim }
  }

  function gravarIndice(espaco: string, mudar: (i: IndiceDeFluxos) => void): IndiceDeFluxos {
    const { indice, ruim } = lerIndiceDoEspaco(espaco)
    mudar(indice)
    mkdirSync(pasta(espaco), { recursive: true })
    dep.gravarJsonAtomico(join(pasta(espaco), 'indice.json'), indice, ruim)
    return indice
  }

  type FluxoLido = { ok: true; fluxo: FluxoGravado } | { ok: false; motivo: string; ruim?: true }
  function lerArquivoDeFluxo(caminho: string, id: string): FluxoLido | undefined {
    return lerComCache<FluxoLido>(caminho, (t) => {
      const j = jsonOuRuim(t)
      if (!('json' in j)) return { ok: false, motivo: 'arquivo ilegível (não é JSON)', ruim: true }
      const r = lerFluxo(j.json)
      if (!r.ok) return r
      if (r.fluxo.id !== id) return { ok: false, motivo: `o id do fluxo ("${r.fluxo.id}") não bate com o nome do arquivo` }
      return r
    })
  }

  function ultimaLinha(espaco: string, fluxoId: string): ResumoDaExecucao | undefined {
    const linhas = lerComCache(join(pastaDeExecucoes(espaco), `${fluxoId}.jsonl`), (t) => t.split('\n').filter(Boolean))
    for (let i = (linhas?.length ?? 0) - 1; i >= 0; i--) {
      const r = lerResumo(linhas![i])
      if (r) return r
    }
    return undefined
  }

  /** Os `<id>.json` da pasta (válidos ou não; o índice fica de fora). */
  function arquivosDeFluxo(espaco: string): { arquivo: string; id: string }[] {
    let nomes: string[] = []
    try {
      nomes = readdirSync(pasta(espaco))
    } catch {
      // sem pasta ainda: nenhum fluxo
    }
    return nomes.flatMap((arquivo) => {
      const m = arquivo.match(ARQUIVO_DE_FLUXO)
      return m && arquivo !== 'indice.json' ? [{ arquivo, id: m[1] }] : []
    })
  }

  function listar(espaco: string): ListaDeFluxos {
    const { indice, ruim } = lerIndiceDoEspaco(espaco)
    const fluxos: FluxoGravado[] = []
    const invalidos: FluxoInvalido[] = []
    const pastas = new Set(indice.pastas.map((p) => p.id))
    for (const { arquivo, id } of arquivosDeFluxo(espaco)) {
      const r = lerArquivoDeFluxo(join(pasta(espaco), arquivo), id)
      if (!r) continue
      if (!r.ok) {
        invalidos.push({ arquivo, id, motivo: r.motivo })
        continue
      }
      const f = structuredClone(r.fluxo)
      // pasta que sumiu (índice ruim ou editado à mão): o fluxo aparece na raiz
      if (f.pasta !== undefined && !pastas.has(f.pasta)) delete f.pasta
      fluxos.push(f)
    }
    const posicao = new Map(indice.ordem.map((id, i) => [id, i]))
    fluxos.sort((a, b) => (posicao.get(a.id) ?? Infinity) - (posicao.get(b.id) ?? Infinity) || a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id))
    const ultimas: Record<string, ResumoDaExecucao> = {}
    for (const f of fluxos) {
      const u = ultimaLinha(espaco, f.id)
      if (u) ultimas[f.id] = u
    }
    return { indice, fluxos, invalidos, ultimas, ...(ruim ? { indiceRuim: true } : {}) }
  }

  function ler(espaco: string, id: string): FluxoGravado | null {
    if (!ID.test(id)) return null
    const r = lerArquivoDeFluxo(join(pasta(espaco), `${id}.json`), id)
    return r?.ok ? structuredClone(r.fluxo) : null
  }

  function gravar(espaco: string, fluxo: FluxoGravado): Resultado<FluxoGravado> {
    const r = lerFluxo(fluxo)
    if (!r.ok) return nao(r.motivo)
    const f = r.fluxo
    const { indice } = lerIndiceDoEspaco(espaco)
    if (f.pasta !== undefined && !indice.pastas.some((p) => p.id === f.pasta)) return nao('essa pasta não existe')
    const caminho = join(pasta(espaco), `${f.id}.json`)
    const existente = lerArquivoDeFluxo(caminho, f.id)
    if (!existente && arquivosDeFluxo(espaco).length >= MAX_FLUXOS) return nao(`no máximo ${MAX_FLUXOS} fluxos por espaço`)
    mkdirSync(pasta(espaco), { recursive: true })
    dep.gravarJsonAtomico(caminho, f, !!existente && !existente.ok && existente.ruim === true)
    if (!indice.ordem.includes(f.id)) gravarIndice(espaco, (i) => i.ordem.push(f.id))
    return sim(f)
  }

  function apagar(espaco: string, id: string): Resultado<true> {
    if (!ID.test(id)) return nao('id inválido')
    const caminho = join(pasta(espaco), `${id}.json`)
    if (!existsSync(caminho)) return nao('esse fluxo não existe')
    rmSync(caminho, { force: true })
    cache.delete(caminho)
    rmSync(join(pastaDeExecucoes(espaco), `${id}.jsonl`), { force: true })
    rmSync(join(pastaDeExecucoes(espaco), id), { recursive: true, force: true })
    const { indice } = lerIndiceDoEspaco(espaco)
    if (indice.ordem.includes(id)) gravarIndice(espaco, (i) => (i.ordem = i.ordem.filter((x) => x !== id)))
    return sim(true)
  }

  function mover(espaco: string, id: string, destino: string | null): Resultado<FluxoGravado> {
    const f = ler(espaco, id)
    if (!f) return nao('esse fluxo não existe')
    const { pasta: _, ...semPasta } = f
    return gravar(espaco, destino === null ? semPasta : { ...semPasta, pasta: destino })
  }

  const nomeDaPasta = (nome: string): string | { erro: string } => {
    const n = linha(nome, MAX_NOME_DA_PASTA + 1)
    if (!n) return { erro: 'dê um nome à pasta' }
    if (n.length > MAX_NOME_DA_PASTA) return { erro: `o nome passa de ${MAX_NOME_DA_PASTA} letras` }
    return n
  }
  const mesmoNome = (a: string, b: string): boolean => a.toLocaleLowerCase('pt-BR') === b.toLocaleLowerCase('pt-BR')

  function criarPasta(espaco: string, nome: string, pai?: string): Resultado<PastaDeFluxos> {
    const n = nomeDaPasta(nome)
    if (typeof n !== 'string') return nao(n.erro)
    const { indice } = lerIndiceDoEspaco(espaco)
    if (indice.pastas.length >= MAX_PASTAS) return nao(`no máximo ${MAX_PASTAS} pastas`)
    if (pai !== undefined) {
      if (!indice.pastas.some((p) => p.id === pai)) return nao('a pasta de cima não existe')
      if (nivelDaPasta(indice.pastas, pai) >= MAX_NIVEIS_DE_PASTA) return nao(`no máximo ${MAX_NIVEIS_DE_PASTA} níveis de pasta`)
    }
    if (indice.pastas.some((p) => p.pai === pai && mesmoNome(p.nome, n))) return nao(`já há uma pasta "${n}" aqui`)
    const nova: PastaDeFluxos = { id: novoId(), nome: n, ...(pai !== undefined ? { pai } : {}) }
    gravarIndice(espaco, (i) => i.pastas.push(nova))
    return sim(nova)
  }

  function renomearPasta(espaco: string, id: string, nome: string): Resultado<PastaDeFluxos> {
    const n = nomeDaPasta(nome)
    if (typeof n !== 'string') return nao(n.erro)
    const { indice } = lerIndiceDoEspaco(espaco)
    const p = indice.pastas.find((x) => x.id === id)
    if (!p) return nao('essa pasta não existe')
    if (indice.pastas.some((x) => x.id !== id && x.pai === p.pai && mesmoNome(x.nome, n))) return nao(`já há uma pasta "${n}" aqui`)
    const renomeada = { ...p, nome: n }
    gravarIndice(espaco, (i) => (i.pastas = i.pastas.map((x) => (x.id === id ? renomeada : x))))
    return sim(renomeada)
  }

  function apagarPasta(espaco: string, id: string): Resultado<{ subiram: string[] }> {
    const { indice } = lerIndiceDoEspaco(espaco)
    if (!indice.pastas.some((p) => p.id === id)) return nao('essa pasta não existe')
    const sai = subarvoreDaPasta(indice.pastas, id)
    const subiram: string[] = []
    // primeiro os fluxos sobem (se algo falhar aqui, a pasta continua e nada some da lista)
    for (const f of listar(espaco).fluxos) {
      if (f.pasta === undefined || !sai.has(f.pasta)) continue
      const { pasta: _, ...semPasta } = f
      const r = gravar(espaco, semPasta)
      if (!r.ok) return nao(`não consegui tirar "${f.nome}" da pasta: ${r.motivo}`)
      subiram.push(f.id)
    }
    gravarIndice(espaco, (i) => (i.pastas = i.pastas.filter((p) => !sai.has(p.id))))
    return sim({ subiram })
  }

  function marcarExemplosCriados(espaco: string): void {
    gravarIndice(espaco, (i) => (i.exemplosCriados = true))
  }

  function criarExemplos(espaco: string, colunas: readonly Pick<Coluna, 'id' | 'nome' | 'final' | 'papel'>[], agora = new Date()): FluxoGravado[] {
    const { indice } = lerIndiceDoEspaco(espaco)
    if (indice.exemplosCriados) return []
    const existente = indice.pastas.find((p) => p.pai === undefined && mesmoNome(p.nome, PASTA_DE_EXEMPLOS))
    const pastaDosExemplos = existente ?? (() => {
      const r = criarPasta(espaco, PASTA_DE_EXEMPLOS)
      return r.ok ? r.valor : undefined
    })()
    // um exemplo que já está lá com o mesmo nome (a marca não chegou a ser gravada da outra vez) não se repete
    const jaHa = new Set(listar(espaco).fluxos.filter((f) => f.pasta === pastaDosExemplos?.id).map((f) => f.nome.toLocaleLowerCase('pt-BR')))
    const criados: FluxoGravado[] = []
    for (const e of exemplos(colunas)) {
      if (jaHa.has(e.nome.toLocaleLowerCase('pt-BR'))) continue
      const { criadoPor: _, ...novo } = fluxoNovo(e, { id: novoId(), agora, autor: { nome: PASTA_DE_EXEMPLOS } })
      const r = gravar(espaco, pastaDosExemplos ? { ...novo, pasta: pastaDosExemplos.id } : novo)
      // não coube (100 fluxos): fica sem esse exemplo, sem erro
      if (r.ok) criados.push(r.valor)
    }
    marcarExemplosCriados(espaco)
    return criados
  }

  /** Texto (o `.jsonl`) gravado como o `gravarJsonAtomico`: temporário + `rename`. */
  function gravarTextoAtomico(destino: string, texto: string): void {
    const temporario = `${destino}.${process.pid}.tmp`
    try {
      writeFileSync(temporario, texto, 'utf8')
      renameSync(temporario, destino)
    } catch (e) {
      rmSync(temporario, { force: true })
      throw e
    }
  }

  function gravarExecucao(espaco: string, e: Execucao): void {
    exigirId(e.fluxo, 'fluxo')
    exigirId(e.id, 'execução')
    const raiz = pastaDeExecucoes(espaco)
    const detalhes = join(raiz, e.fluxo)
    mkdirSync(detalhes, { recursive: true })
    dep.gravarJsonAtomico(join(detalhes, `${e.id}.json`), e, false)
    const resumos = join(raiz, `${e.fluxo}.jsonl`)
    appendFileSync(resumos, `${JSON.stringify(resumoDe(e))}\n`, 'utf8')
    // poda: ficam as últimas 50 linhas boas, e só os detalhes delas
    const linhas = readFileSync(resumos, 'utf8').split('\n').filter(Boolean)
    const boas = linhas.map((l) => ({ l, r: lerResumo(l) })).filter((x) => x.r)
    if (boas.length <= MAX_EXECUCOES && boas.length === linhas.length) return
    const ficam = boas.slice(-MAX_EXECUCOES)
    gravarTextoAtomico(resumos, ficam.map((x) => `${x.l}\n`).join(''))
    const manter = new Set(ficam.map((x) => `${x.r!.id}.json`))
    for (const arquivo of readdirSync(detalhes)) if (!manter.has(arquivo)) rmSync(join(detalhes, arquivo), { force: true })
  }

  function execucoes(espaco: string, fluxoId: string, limite = MAX_EXECUCOES): ResumoDaExecucao[] {
    if (!ID.test(fluxoId)) return []
    const linhas = lerComCache(join(pastaDeExecucoes(espaco), `${fluxoId}.jsonl`), (t) => t.split('\n').filter(Boolean)) ?? []
    const lidas: ResumoDaExecucao[] = []
    for (let i = linhas.length - 1; i >= 0 && lidas.length < Math.max(0, limite); i--) {
      const r = lerResumo(linhas[i])
      if (r) lidas.push(r)
    }
    return lidas
  }

  function execucao(espaco: string, fluxoId: string, execId: string): Execucao | null {
    if (!ID.test(fluxoId) || !ID.test(execId)) return null
    try {
      const e = JSON.parse(readFileSync(join(pastaDeExecucoes(espaco), fluxoId, `${execId}.json`), 'utf8')) as Execucao
      return e && typeof e === 'object' && e.id === execId && e.fluxo === fluxoId && e.nos && typeof e.nos === 'object' && Array.isArray(e.caminho) ? e : null
    } catch {
      return null
    }
  }

  function esquecer(espaco: string): void {
    const prefixo = pasta(espaco)
    for (const k of [...cache.keys()]) if (k.startsWith(prefixo)) cache.delete(k)
  }

  return { listar, ler, gravar, apagar, mover, criarPasta, renomearPasta, apagarPasta, marcarExemplosCriados, criarExemplos, gravarExecucao, execucoes, execucao, esquecer }
}
