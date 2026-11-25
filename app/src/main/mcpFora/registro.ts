// MCP de fora (1.9.7, C2): o cadastro dos servidores MCP de terceiros, em `~/.orkester/mcp-servidores.json`, e o
// serviço que fluxos (C3a) e páginas (C5a) usam para listar e chamar ferramentas. Quem fala com o servidor é o
// cliente do C1 (`cliente.ts`); aqui ficam o arquivo, as regras do cadastro e a ponte com o cofre das credenciais.
//
// - **Só a janela cadastra:** os canais `CANAIS_MCP_FORA` passam pela guarda do `ipcSeguro`; não há verbo `ork`,
//   ferramenta do MCP do Orkester nem permissão de página para criar, editar ou remover servidor.
// - **Segredo nunca em texto no arquivo:** `envCredencial` e `cabecalhos` guardam só o ID da credencial. O valor é
//   aberto pelo cofre na hora de subir (`resolver`). O env para stdio só aceita o tipo `segredo`. O cabeçalho só aceita
//   credencial com domínio que cubra o host (nunca `segredo`), e o nome do cabeçalho tem de ser o da credencial.
// - **Impressão:** a 1ª listagem aprova todas as ferramentas. Depois, a que mudou (ou apareceu) fica bloqueada nos
//   fluxos e nas páginas até `reverFerramentas`.
// - **Pausa que sobrevive ao reinício:** a do usuário e a das 3 quedas em 10 min (evento `pausado` do cliente) vão
//   para o arquivo.
// - **O próprio Orkester** (nome `orkester`, `ORK_CHAVE` no env, o `mcp.js` do app) não é cadastrado: seria um laço.
//
// Sem import do Electron em tempo de execução (o `ipcMain` e a gravação atômica vêm de quem registra), para a prova
// rodar no Node.
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import type {
  FerramentaMcp as FerramentaDaJanela,
  PedidoDeServidorMcp,
  ResultadoDeServidorMcp,
  ResultadoDoTesteMcp,
  ResumoDeServidorMcp,
  SituacaoDoServidorMcp
} from '../../shared/api'
import type { CredencialVisivel } from '../../shared/fluxos/credenciais'
import type { DefinicaoMcpFora, FerramentaMcp, ResultadoMcp } from '../../shared/mcpFora'
import type { CofreDeCredenciais } from '../fluxos/credenciais'
import type { EventoMcpFora, OpcoesDoClienteMcp } from './cliente'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { CANAIS_MCP_FORA } from '../../shared/api.ts'
// @ts-expect-error idem
import { hostPermitido, montarCabecalho } from '../../shared/fluxos/credenciais.ts'
// @ts-expect-error idem
import { MAX_FERRAMENTAS, conferirUrlHttp, mascarar, validarDefinicao } from '../../shared/mcpFora.ts'
// @ts-expect-error idem
import { ClienteMcpFora, ErroMcpFora } from './cliente.ts'

export const MAX_SERVIDORES = 50
export const MAX_NOME_DO_SERVIDOR = 60
const MAX_ARGS = 100
const MAX_TEXTO = 4000
const MAX_VARIAVEIS = 50
const MAX_CABECALHOS = 10
const MAX_VALOR_DE_TEXTO = 8192
const MAX_DESCRICAO_GUARDADA = 4000

/** Ferramenta como fica no arquivo (a última lista que o servidor deu). */
export interface FerramentaGuardada {
  nome: string
  descricao: string
  esquema: unknown
  anotacoes?: Record<string, unknown>
  impressao: string
}

/** Um servidor no arquivo: o pedido da janela (só ids de credencial) + o que o app sabe dele. */
export type ServidorGuardado = PedidoDeServidorMcp & {
  id: string
  criadoEm: string
  editadoEm: string
  pausado?: { motivo: 'usuario' | 'quedas'; em: number }
  /** nome → impressão aceita. Ausente: nunca listou (a 1ª lista aprova todas). */
  aprovadas?: Record<string, string>
  conhecidas?: FerramentaGuardada[]
  /** HTTP importado sem cabeçalho: precisa de login (OAuth, 1.9.8). */
  precisaLogin?: boolean
  erro?: string
}

export interface ArquivoDeServidores {
  versao: 1
  itens: ServidorGuardado[]
}

export const ARQUIVO_VAZIO: ArquivoDeServidores = { versao: 1, itens: [] }

export const MENSAGEM_PRECISA_LOGIN = 'este servidor precisa de login (OAuth), que chega na 1.9.8; ou edite-o e ponha um cabeçalho com credencial'

// ---------------------------------------------------------------- regras puras

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const temControle = (s: string): boolean => /[\u0000-\u001f\u007f]/.test(s)
const texto = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length <= max && !v.includes('\0') ? v : null)

/** Nome, comando, argumentos e ambiente apontam para o próprio Orkester? (seria um laço: fica de fora). */
export function ehOProprioOrkester(nome: string, comando = '', args: readonly string[] = [], nomesDoEnv: readonly string[] = []): boolean {
  if (nome.trim().toLowerCase() === 'orkester') return true
  if (nomesDoEnv.some((n) => n.toUpperCase() === 'ORK_CHAVE')) return true
  return [comando, ...args].some((p) => /[\\/]\.orkester[\\/]/i.test(p) || /[\\/]cli[\\/]mcp\.js$/i.test(p))
}

/** O nome do cabeçalho em que a credencial vai (o de `montarCabecalho`, sem abrir o valor). */
export const cabecalhoDaCredencial = (c: Pick<CredencialVisivel, 'tipo' | 'cabecalho'>): string => montarCabecalho(c, 'x').cabecalho.nome

function mapaDeTextos(bruto: unknown, rotulo: string): { mapa: Record<string, string> } | { erro: string } {
  if (bruto === undefined) return { mapa: {} }
  if (!ehObjeto(bruto)) return { erro: `${rotulo}: precisa ser nome → valor` }
  const saida: Record<string, string> = {}
  for (const [k, v] of Object.entries(bruto)) {
    const t = texto(v, MAX_VALOR_DE_TEXTO)
    if (t === null) return { erro: `${rotulo} ${k}: o valor precisa ser um texto` }
    saida[k] = t
  }
  return { mapa: saida }
}

/**
 * Confere e normaliza o pedido da janela. `credenciais`: as do cofre (só metadados), para conferir os ids; `null` na
 * leitura do arquivo (credencial apagada não apaga o servidor: o erro aparece ao subir).
 */
export function validarPedido(
  bruto: unknown,
  outros: readonly Pick<ServidorGuardado, 'nome'>[],
  credenciais: readonly CredencialVisivel[] | null
): PedidoDeServidorMcp | { erro: string } {
  if (!ehObjeto(bruto)) return { erro: 'pedido inválido' }
  const nome = typeof bruto.nome === 'string' ? bruto.nome.trim() : ''
  if (!nome) return { erro: 'dê um nome ao servidor' }
  if (nome.length > MAX_NOME_DO_SERVIDOR) return { erro: `nome com até ${MAX_NOME_DO_SERVIDOR} caracteres` }
  if (temControle(nome)) return { erro: 'o nome não pode ter quebra de linha' }
  if (outros.some((o) => o.nome.toLowerCase() === nome.toLowerCase())) return { erro: `já existe um servidor "${nome}"` }
  const credencial = (id: string, rotulo: string): CredencialVisivel | { erro: string } | null => {
    if (typeof id !== 'string' || !id || id.length > 80) return { erro: `${rotulo}: escolha uma credencial` }
    if (!credenciais) return null
    return credenciais.find((c) => c.id === id) ?? { erro: `${rotulo}: a credencial escolhida não existe mais` }
  }

  if (bruto.transporte === 'stdio') {
    const comando = texto(bruto.comando, MAX_TEXTO)?.trim() ?? ''
    if (!comando || temControle(comando)) return { erro: 'diga o comando (uma linha)' }
    if (!Array.isArray(bruto.args) || bruto.args.length > MAX_ARGS) return { erro: `os argumentos são uma lista de até ${MAX_ARGS} textos` }
    const args: string[] = []
    for (const a of bruto.args) {
      const t = texto(a, MAX_TEXTO)
      if (t === null || /[\r\n]/.test(t)) return { erro: 'cada argumento é um texto de uma linha' }
      args.push(t)
    }
    let pasta: string | undefined
    if (bruto.pasta !== undefined && bruto.pasta !== '') {
      const p = texto(bruto.pasta, MAX_TEXTO)?.trim()
      if (!p || temControle(p)) return { erro: 'a pasta de trabalho não vale' }
      pasta = p
    }
    const lidoTexto = mapaDeTextos(bruto.envTexto, 'variável')
    if ('erro' in lidoTexto) return lidoTexto
    const lidoCredencial = mapaDeTextos(bruto.envCredencial, 'variável')
    if ('erro' in lidoCredencial) return lidoCredencial
    const envTexto = lidoTexto.mapa
    const envCredencial = lidoCredencial.mapa
    const nomes = [...Object.keys(envTexto), ...Object.keys(envCredencial)]
    if (nomes.length > MAX_VARIAVEIS) return { erro: `no máximo ${MAX_VARIAVEIS} variáveis` }
    const repetida = nomes.find((n, i) => nomes.findIndex((m) => m.toUpperCase() === n.toUpperCase()) !== i)
    if (repetida) return { erro: `a variável ${repetida} aparece duas vezes` }
    // nomes de variável, ORK_* e comando: as regras do cliente, com valores de mentira
    const env = Object.fromEntries(nomes.map((n) => [n, 'x']))
    const invalida = validarDefinicao({ tipo: 'stdio', comando, args, env, ...(pasta ? { pasta } : {}) })
    if (invalida) return { erro: invalida }
    for (const [variavel, id] of Object.entries(envCredencial)) {
      const c = credencial(id, `variável ${variavel}`)
      if (c && 'erro' in c) return c
      if (c && c.tipo !== 'segredo') return { erro: `variável ${variavel}: só uma credencial do tipo Segredo vai para o ambiente (${c.nome} é ${c.tipo})` }
    }
    if (ehOProprioOrkester(nome, comando, args, nomes)) return { erro: 'o próprio Orkester não entra como servidor de fora (seria um laço)' }
    return {
      transporte: 'stdio',
      nome,
      comando,
      args,
      ...(pasta ? { pasta } : {}),
      ...(Object.keys(envTexto).length ? { envTexto } : {}),
      ...(Object.keys(envCredencial).length ? { envCredencial } : {})
    }
  }

  if (bruto.transporte === 'http') {
    const url = conferirUrlHttp(bruto.url)
    if ('erro' in url) return url
    const lidos = mapaDeTextos(bruto.cabecalhos, 'cabeçalho')
    if ('erro' in lidos) return lidos
    const cabecalhos = lidos.mapa
    if (Object.keys(cabecalhos).length > MAX_CABECALHOS) return { erro: `no máximo ${MAX_CABECALHOS} cabeçalhos` }
    const nomes = Object.keys(cabecalhos)
    const repetido = nomes.find((n, i) => nomes.findIndex((m) => m.toLowerCase() === n.toLowerCase()) !== i)
    if (repetido) return { erro: `o cabeçalho ${repetido} aparece duas vezes` }
    const invalida = validarDefinicao({ tipo: 'http', url: url.href, cabecalhos: Object.fromEntries(nomes.map((n) => [n, 'x'])) })
    if (invalida) return { erro: invalida }
    for (const [cabecalho, id] of Object.entries(cabecalhos)) {
      const c = credencial(id, `cabeçalho ${cabecalho}`)
      if (c && 'erro' in c) return c
      if (!c) continue
      if (c.tipo === 'segredo') return { erro: `cabeçalho ${cabecalho}: credencial do tipo Segredo não vai em cabeçalho` }
      const esperado = cabecalhoDaCredencial(c)
      if (esperado.toLowerCase() !== cabecalho.toLowerCase()) return { erro: `cabeçalho ${cabecalho}: a credencial ${c.nome} vai no cabeçalho ${esperado}` }
      if (!hostPermitido(url.hostname, c.dominios)) return { erro: `cabeçalho ${cabecalho}: ${url.hostname} não está nos domínios da credencial ${c.nome} (${c.dominios.join(', ')})` }
    }
    return { transporte: 'http', nome, url: url.href, ...(nomes.length ? { cabecalhos } : {}) }
  }
  return { erro: 'transporte: stdio ou http' }
}

function ferramentaGuardadaValida(b: unknown): FerramentaGuardada | null {
  if (!ehObjeto(b) || typeof b.nome !== 'string' || !b.nome || b.nome.length > 128) return null
  if (typeof b.descricao !== 'string' || typeof b.impressao !== 'string' || !/^[0-9a-f]{64}$/.test(b.impressao)) return null
  return { nome: b.nome, descricao: b.descricao, esquema: b.esquema ?? null, ...(ehObjeto(b.anotacoes) ? { anotacoes: b.anotacoes } : {}), impressao: b.impressao }
}

/** Confere o arquivo do disco item a item. `ruim`: algo ficou de fora (quem gravar por cima guarda antes um `.ruim`). */
export function lerArquivoDeServidores(bruto: unknown): { arquivo: ArquivoDeServidores; ruim: boolean } {
  if (!ehObjeto(bruto) || bruto.versao !== 1 || !Array.isArray(bruto.itens)) return { arquivo: ARQUIVO_VAZIO, ruim: true }
  const itens: ServidorGuardado[] = []
  let ruim = bruto.itens.length > MAX_SERVIDORES
  for (const b of bruto.itens.slice(0, MAX_SERVIDORES)) {
    if (!ehObjeto(b) || typeof b.id !== 'string' || !b.id || b.id.length > 80 || itens.some((i) => i.id === b.id)) {
      ruim = true
      continue
    }
    const pedido = validarPedido(b, itens, null)
    if ('erro' in pedido || typeof b.criadoEm !== 'string' || typeof b.editadoEm !== 'string') {
      ruim = true
      continue
    }
    const item: ServidorGuardado = { ...pedido, id: b.id, criadoEm: b.criadoEm, editadoEm: b.editadoEm }
    if (ehObjeto(b.pausado) && (b.pausado.motivo === 'usuario' || b.pausado.motivo === 'quedas') && typeof b.pausado.em === 'number') {
      item.pausado = { motivo: b.pausado.motivo, em: b.pausado.em }
    }
    if (ehObjeto(b.aprovadas)) {
      item.aprovadas = Object.fromEntries(Object.entries(b.aprovadas).filter(([, v]) => typeof v === 'string').slice(0, MAX_FERRAMENTAS)) as Record<string, string>
    }
    if (Array.isArray(b.conhecidas)) {
      item.conhecidas = b.conhecidas.slice(0, MAX_FERRAMENTAS).map(ferramentaGuardadaValida).filter((f): f is FerramentaGuardada => !!f)
    }
    if (b.precisaLogin === true && pedido.transporte === 'http') item.precisaLogin = true
    if (typeof b.erro === 'string' && b.erro) item.erro = b.erro.slice(0, 300)
    itens.push(item)
  }
  return { arquivo: { versao: 1, itens }, ruim }
}

/** As ferramentas para a janela, com `bloqueada` (impressão diferente da aceita, ou nova depois da 1ª lista). */
/** O pedido de `reverFerramentas`: `{ nome, impressao }[]`, sem repetir, pelo menos um. */
export function lerRevistas(v: unknown): { revistas: { nome: string; impressao: string }[] } | { erro: string } {
  if (!Array.isArray(v) || !v.length || v.length > MAX_FERRAMENTAS) return { erro: 'mande as ferramentas revistas: [{ nome, impressao }]' }
  const revistas: { nome: string; impressao: string }[] = []
  const vistos = new Set<string>()
  for (const x of v) {
    if (!x || typeof x !== 'object' || typeof x.nome !== 'string' || typeof x.impressao !== 'string' || !x.nome || !/^[0-9a-f]{64}$/.test(x.impressao)) {
      return { erro: 'cada ferramenta revista: { nome, impressao } como a tela mostrou' }
    }
    if (vistos.has(x.nome)) continue
    vistos.add(x.nome)
    revistas.push({ nome: x.nome, impressao: x.impressao })
  }
  return { revistas }
}

export function ferramentasParaJanela(item: Pick<ServidorGuardado, 'conhecidas' | 'aprovadas'>): FerramentaDaJanela[] {
  return (item.conhecidas ?? []).map((f) => ({
    nome: f.nome,
    descricao: f.descricao,
    esquema: f.esquema,
    ...(f.anotacoes ? { anotacoes: f.anotacoes } : {}),
    impressao: f.impressao,
    bloqueada: !item.aprovadas || item.aprovadas[f.nome] !== f.impressao
  }))
}

const guardar = (f: FerramentaMcp): FerramentaGuardada => ({
  nome: f.nome,
  descricao: f.descricao.slice(0, MAX_DESCRICAO_GUARDADA),
  esquema: f.esquemaEntrada,
  ...(f.anotacoes ? { anotacoes: { ...f.anotacoes } } : {}),
  impressao: f.impressao
})

/** Troca os segredos por ••• em todo texto de um valor (o estruturado do resultado). */
export function mascararFundo(valor: unknown, segredos: readonly string[]): unknown {
  if (!segredos.length) return valor
  if (typeof valor === 'string') return mascarar(valor, segredos)
  if (Array.isArray(valor)) return valor.map((v) => mascararFundo(v, segredos))
  if (ehObjeto(valor)) return Object.fromEntries(Object.entries(valor).map(([k, v]) => [mascarar(k, segredos), mascararFundo(v, segredos)]))
  return valor
}

// ---------------------------------------------------------------- o serviço

export interface DependenciasDoRegistro {
  /** A pasta de dados (`PASTA_DADOS`); o arquivo é `mcp-servidores.json` dentro dela. */
  pasta: string
  /** O cofre das credenciais (função: o `main/fluxos/index.ts` o cria, e assim não há ciclo de import). */
  cofre: () => Pick<CofreDeCredenciais, 'listar' | 'segredoPorId' | 'paraPedidoPorId'>
  gravarJsonAtomico: (destino: string, valor: unknown, guardarRuim: boolean) => void
  /** Avisa as janelas que a lista mudou (situação, pausa, ferramentas). Opcional. */
  mudou?: () => void
  /** Pasta de trabalho padrão do stdio (a do usuário). */
  pastaPadrao?: string
  /** Só para as provas: prazos, ambiente e rede do cliente. */
  cliente?: Omit<OpcoesDoClienteMcp, 'resolver' | 'aoEvento'>
  novoId?: () => string
  agora?: () => number
}

export interface OpcoesDoUso {
  sinal?: AbortSignal
}

export function criarRegistroMcpFora(dep: DependenciasDoRegistro) {
  const arquivo = join(dep.pasta, 'mcp-servidores.json')
  const novoId = dep.novoId ?? randomUUID
  const agora = dep.agora ?? Date.now
  /** Os textos a mascarar de cada servidor, da última subida (o resultado das ferramentas passa por eles). */
  const segredos = new Map<string, string[]>()

  function ler(): { arquivo: ArquivoDeServidores; ruim: boolean } {
    if (!existsSync(arquivo)) return { arquivo: ARQUIVO_VAZIO, ruim: false }
    try {
      return lerArquivoDeServidores(JSON.parse(readFileSync(arquivo, 'utf8')))
    } catch {
      return { arquivo: ARQUIVO_VAZIO, ruim: true }
    }
  }

  function gravar(op: (a: ArquivoDeServidores) => ArquivoDeServidores | { erro: string }): { ok: true } | { erro: string } {
    try {
      const lido = ler()
      const feito = op(lido.arquivo)
      if ('erro' in feito) return feito
      dep.gravarJsonAtomico(arquivo, feito, lido.ruim)
      dep.mudou?.()
      return { ok: true }
    } catch (e) {
      return { erro: `não consegui gravar os servidores (${e instanceof Error ? e.name : 'erro'})` }
    }
  }

  const item = (id: unknown): ServidorGuardado | undefined => (typeof id === 'string' ? ler().arquivo.itens.find((s) => s.id === id) : undefined)

  function mudarItem(id: string, fn: (s: ServidorGuardado) => ServidorGuardado): void {
    gravar((a) => (a.itens.some((s) => s.id === id) ? { versao: 1, itens: a.itens.map((s) => (s.id === id ? fn(s) : s)) } : a))
  }

  /** O cadastro → a definição do cliente, com os valores abertos pelo cofre (só aqui, na hora de subir). */
  function resolver(id: string): DefinicaoMcpFora {
    const s = item(id)
    if (!s) throw new Error('o servidor não existe mais')
    const cofre = dep.cofre()
    if (s.transporte === 'stdio') {
      const env: Record<string, string> = { ...(s.envTexto ?? {}) }
      const ocultar: string[] = []
      for (const [variavel, credId] of Object.entries(s.envCredencial ?? {})) {
        const r = cofre.segredoPorId(credId)
        if ('erro' in r) throw new Error(`variável ${variavel}: ${r.erro}`)
        env[variavel] = r.valor
        ocultar.push(r.valor)
      }
      segredos.set(id, ocultar)
      return { tipo: 'stdio', comando: s.comando, args: s.args, env, pasta: s.pasta || dep.pastaPadrao || homedir() }
    }
    const cabecalhos: Record<string, string> = {}
    const ocultar: string[] = []
    for (const [nome, credId] of Object.entries(s.cabecalhos ?? {})) {
      const r = cofre.paraPedidoPorId(credId, s.url)
      if ('erro' in r) throw new Error(`cabeçalho ${nome}: ${r.erro}`)
      cabecalhos[r.cabecalho.nome] = r.cabecalho.valor
      ocultar.push(...r.ocultar)
    }
    segredos.set(id, ocultar)
    return { tipo: 'http', url: s.url, cabecalhos }
  }

  function aoEvento(e: EventoMcpFora): void {
    if (e.tipo === 'pausado') {
      mudarItem(e.id, (s) => ({ ...s, pausado: { motivo: 'quedas', em: agora() } }))
      return
    }
    if (e.tipo === 'subiu') {
      mudarItem(e.id, ({ erro: _erro, ...s }) => s)
      return
    }
    if (e.tipo === 'sobrou') {
      // Revisão C (achado 1): fechar não matou a árvore toda (ou não deu para conferir): a situação mostra
      const msg = e.pids.length
        ? `fechou, mas ${e.pids.length} processo(s) do servidor seguem vivos (pid ${e.pids.join(', ')}): feche no Gerenciador de Tarefas`
        : 'fechou, mas não deu para conferir se os processos do servidor morreram (o sistema não deixou listar)'
      if (item(e.id)) anotarErro(e.id, new Error(msg))
      return
    }
    dep.mudou?.()
  }

  const cliente = new ClienteMcpFora({ ...(dep.cliente ?? {}), resolver: async (id: string) => resolver(id), aoEvento })

  const anotarErro = (id: string, e: unknown): void => {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
    mudarItem(id, (s) => ({ ...s, erro: mascarar(msg, segredos.get(id) ?? []) }))
  }

  /** Lista pelo cliente e grava as conhecidas; a 1ª lista aprova todas. */
  async function listarDoServidor(id: string): Promise<ServidorGuardado> {
    const fs = await cliente.ferramentas(id)
    let atualizado: ServidorGuardado | undefined
    mudarItem(id, (s) => {
      const conhecidas = fs.map(guardar)
      const aprovadas = s.aprovadas ?? Object.fromEntries(conhecidas.map((f) => [f.nome, f.impressao]))
      atualizado = { ...s, conhecidas, aprovadas }
      return atualizado
    })
    if (!atualizado) throw new ErroMcpFora('definicao', 'o servidor não existe mais')
    return atualizado
  }

  /** Antes de subir: existe, não está pausado, não precisa de login. */
  function conferirUso(id: unknown): ServidorGuardado {
    const s = item(id)
    if (!s) throw new ErroMcpFora('nao-existe', 'servidor MCP não existe (foi removido em Conexões › MCP)')
    if (s.pausado) {
      throw new ErroMcpFora('pausado', s.pausado.motivo === 'quedas'
        ? `o servidor ${s.nome} caiu 3 vezes em 10 minutos e está pausado: retome em Conexões › MCP`
        : `o servidor ${s.nome} está pausado em Conexões › MCP`)
    }
    if (s.precisaLogin) throw new ErroMcpFora('precisa-login', `${s.nome}: ${MENSAGEM_PRECISA_LOGIN}`)
    return s
  }

  function situacao(s: ServidorGuardado, vivos: ReadonlySet<string>): SituacaoDoServidorMcp {
    if (s.precisaLogin) return 'precisa-login'
    if (s.pausado) return 'pausado'
    if (vivos.has(s.id)) return 'vivo'
    if (s.erro) return 'erro'
    return 'parado'
  }

  function resumo(s: ServidorGuardado, vivos: ReadonlySet<string>): ResumoDeServidorMcp {
    const { editadoEm: _e, aprovadas: _a, conhecidas: _c, precisaLogin: _p, erro, pausado, ...pedido } = s
    const mudadas = ferramentasParaJanela(s).filter((f) => f.bloqueada && s.aprovadas).map((f) => f.nome)
    return { ...(pedido as PedidoDeServidorMcp & { id: string; criadoEm: string }), situacao: situacao(s, vivos), mudadas, ...(pausado ? { pausado } : {}), ...(erro ? { erro } : {}) }
  }

  const credenciaisVisiveis = (): CredencialVisivel[] => dep.cofre().listar().itens

  const falha = (e: unknown): { ok: false; erro: string } => ({ ok: false, erro: e instanceof Error ? e.message : String(e) })

  function criarInterno(pedidoBruto: unknown, extra: Partial<Pick<ServidorGuardado, 'precisaLogin'>> = {}): ResultadoDeServidorMcp {
    let id = ''
    const r = gravar((a) => {
      if (a.itens.length >= MAX_SERVIDORES) return { erro: `no máximo ${MAX_SERVIDORES} servidores` }
      const pedido = validarPedido(pedidoBruto, a.itens, credenciaisVisiveis())
      if ('erro' in pedido) return pedido
      id = novoId()
      const quando = new Date(agora()).toISOString()
      const novo: ServidorGuardado = { ...pedido, id, criadoEm: quando, editadoEm: quando, ...(extra.precisaLogin && pedido.transporte === 'http' ? { precisaLogin: true } : {}) }
      return { versao: 1, itens: [...a.itens, novo] }
    })
    return 'erro' in r ? { ok: false, erro: r.erro } : { ok: true, id }
  }

  return {
    // ------------------------------------------------------------ janela (CANAIS_MCP_FORA)

    listar(): ResumoDeServidorMcp[] {
      const vivos = new Set(cliente.estado().filter((e) => e.vivo).map((e) => e.id))
      return ler().arquivo.itens.map((s) => resumo(s, vivos)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    },

    criar(pedido: unknown): ResultadoDeServidorMcp {
      return criarInterno(pedido)
    },

    /** Para a importação: igual a `criar`, e o HTTP sem cabeçalho fica "precisa de login". */
    criarImportado(pedido: PedidoDeServidorMcp, precisaLogin: boolean): ResultadoDeServidorMcp {
      return criarInterno(pedido, { precisaLogin })
    },

    async editar(id: unknown, pedidoBruto: unknown): Promise<ResultadoDeServidorMcp> {
      const r = gravar((a) => {
        const atual = a.itens.find((s) => s.id === id)
        if (!atual) return { erro: 'esse servidor não existe mais' }
        const pedido = validarPedido(pedidoBruto, a.itens.filter((s) => s.id !== atual.id), credenciaisVisiveis())
        if ('erro' in pedido) return pedido
        // o login pendente só fica se segue http sem cabeçalho; o erro antigo sai (a definição mudou)
        const aindaLogin = atual.precisaLogin && pedido.transporte === 'http' && !pedido.cabecalhos
        const novo: ServidorGuardado = {
          ...pedido,
          id: atual.id,
          criadoEm: atual.criadoEm,
          editadoEm: new Date(agora()).toISOString(),
          ...(atual.pausado ? { pausado: atual.pausado } : {}),
          ...(atual.aprovadas ? { aprovadas: atual.aprovadas } : {}),
          ...(atual.conhecidas ? { conhecidas: atual.conhecidas } : {}),
          ...(aindaLogin ? { precisaLogin: true } : {})
        }
        return { versao: 1, itens: a.itens.map((s) => (s.id === atual.id ? novo : s)) }
      })
      if ('erro' in r) return { ok: false, erro: r.erro }
      // a definição mudou: a conexão antiga cai (a próxima chamada sobe com a nova)
      await cliente.fechar(String(id))
      return { ok: true, id: String(id) }
    },

    async remover(id: unknown): Promise<ResultadoDeServidorMcp> {
      const r = gravar((a) => (a.itens.some((s) => s.id === id) ? { versao: 1, itens: a.itens.filter((s) => s.id !== id) } : { erro: 'esse servidor não existe mais' }))
      if ('erro' in r) return { ok: false, erro: r.erro }
      await cliente.fechar(String(id))
      cliente.retomar(String(id))
      segredos.delete(String(id))
      return { ok: true }
    },

    async pausar(id: unknown, pausar: unknown): Promise<ResultadoDeServidorMcp> {
      const s = item(id)
      if (!s) return { ok: false, erro: 'esse servidor não existe mais' }
      if (pausar === true) {
        mudarItem(s.id, (x) => ({ ...x, pausado: { motivo: 'usuario', em: agora() } }))
        await cliente.fechar(s.id)
      } else {
        cliente.retomar(s.id)
        mudarItem(s.id, ({ pausado: _p, erro: _e, ...x }) => x)
      }
      return { ok: true, id: s.id }
    },

    /** Sobe (se preciso) e lista as ferramentas; não chama nenhuma. */
    async testar(id: unknown): Promise<ResultadoDoTesteMcp> {
      try {
        const s = conferirUso(id)
        return { ok: true, ferramentas: ferramentasParaJanela(await listarDoServidor(s.id)) }
      } catch (e) {
        if (typeof id === 'string' && item(id) && !(e instanceof ErroMcpFora && ['pausado', 'precisa-login', 'nao-existe'].includes(e.codigo))) anotarErro(id, e)
        return falha(e)
      }
    },

    /** As conhecidas (da última lista), sem subir nada. */
    ferramentas(id: unknown): FerramentaDaJanela[] {
      const s = item(id)
      return s ? ferramentasParaJanela(s) : []
    },

    /**
     * (Revisão C-telas §2) Aceita SÓ o que o usuário viu: cada `{ nome, impressao }` é aprovado se a impressão atual
     * ainda é a mostrada. Se uma mudou de novo (ou sumiu), nada é aprovado: "mudou de novo, releia".
     */
    reverFerramentas(id: unknown, vistas: unknown): ResultadoDeServidorMcp {
      const s = item(id)
      if (!s) return { ok: false, erro: 'esse servidor não existe mais' }
      const lista = lerRevistas(vistas)
      if ('erro' in lista) return { ok: false, erro: lista.erro }
      const atuais = new Map((s.conhecidas ?? []).map((f) => [f.nome, f.impressao]))
      const mudaram = lista.revistas.filter((v) => atuais.get(v.nome) !== v.impressao).map((v) => v.nome)
      if (mudaram.length) return { ok: false, erro: `${mudaram.join(', ')} mudou de novo depois que você abriu; releia antes de aceitar` }
      mudarItem(s.id, (x) => {
        const aprovadas = { ...(x.aprovadas ?? {}) }
        for (const v of lista.revistas) aprovadas[v.nome] = v.impressao
        return { ...x, aprovadas }
      })
      return { ok: true, id: s.id }
    },

    // ------------------------------------------------------------ fluxos (C3a) e páginas (C5a)

    existe(id: unknown): boolean {
      return !!item(id)
    },

    /** Resumo de um (nome, situação), para mensagens e o aceite. */
    resumo(id: unknown): ResumoDeServidorMcp | null {
      const s = item(id)
      if (!s) return null
      return resumo(s, new Set(cliente.estado().filter((e) => e.vivo).map((e) => e.id)))
    },

    /**
     * As ferramentas para usar (sobe se preciso e relista): com `bloqueada`. Falha: `ErroMcpFora` (códigos do cliente
     * mais `nao-existe` e `precisa-login`).
     */
    async ferramentasParaUso(id: string): Promise<FerramentaDaJanela[]> {
      conferirUso(id)
      try {
        return ferramentasParaJanela(await listarDoServidor(id))
      } catch (e) {
        if (e instanceof ErroMcpFora && (e.codigo === 'subida' || e.codigo === 'definicao')) anotarErro(id, e)
        throw e
      }
    },

    /**
     * Chama uma ferramenta APROVADA. Bloqueada (mudou ou é nova) → `ErroMcpFora('ferramenta-mudou')`, com "reveja em
     * Conexões". O resultado volta com os segredos do servidor trocados por •••.
     */
    async chamar(id: string, ferramenta: string, argumentos: Record<string, unknown> = {}, opcoes: OpcoesDoUso = {}): Promise<ResultadoMcp> {
      let s = conferirUso(id)
      if (!s.aprovadas) {
        try {
          s = await listarDoServidor(id)
        } catch (e) {
          if (e instanceof ErroMcpFora && (e.codigo === 'subida' || e.codigo === 'definicao')) anotarErro(id, e)
          throw e
        }
      }
      const aprovada = s.aprovadas?.[ferramenta]
      if (!aprovada) {
        const conhecida = (s.conhecidas ?? []).some((f) => f.nome === ferramenta)
        if (conhecida) throw new ErroMcpFora('ferramenta-mudou', `a ferramenta ${ferramenta} de ${s.nome} é nova desde a última revisão e está bloqueada: reveja em Conexões › MCP`)
        throw new ErroMcpFora('ferramenta-sumiu', `o servidor ${s.nome} não tem a ferramenta ${ferramenta}`)
      }
      try {
        const r = await cliente.chamar(id, ferramenta, argumentos, { impressaoEsperada: aprovada, sinal: opcoes.sinal })
        const ocultar = segredos.get(id) ?? []
        const saida: ResultadoMcp = { ...r, texto: mascarar(r.texto, ocultar) }
        if (r.estruturado !== undefined) saida.estruturado = mascararFundo(r.estruturado, ocultar)
        return saida
      } catch (e) {
        if (e instanceof ErroMcpFora && (e.codigo === 'ferramenta-mudou' || e.codigo === 'ferramenta-sumiu')) {
          // grava a lista nova: a tela mostra a mudada em "Rever ferramentas"
          await listarDoServidor(id).catch(() => {})
          if (e.codigo === 'ferramenta-mudou') throw new ErroMcpFora('ferramenta-mudou', `a ferramenta ${ferramenta} de ${s.nome} mudou desde a última revisão e está bloqueada: reveja em Conexões › MCP`)
        }
        if (e instanceof ErroMcpFora && (e.codigo === 'subida' || e.codigo === 'definicao')) anotarErro(id, e)
        throw e
      }
    },

    /** Os textos a trocar por ••• deste servidor (da última subida), para quem guarda argumentos e saídas. */
    segredosDe(id: string): string[] {
      return [...(segredos.get(id) ?? [])]
    },

    /** Para o aviso ao apagar credencial: "Servidor MCP <nome>" dos que a citam. */
    usandoCredencial(credencialId: string): string[] {
      return ler()
        .arquivo.itens.filter((s) =>
          s.transporte === 'stdio' ? Object.values(s.envCredencial ?? {}).includes(credencialId) : Object.values(s.cabecalhos ?? {}).includes(credencialId)
        )
        .map((s) => `Servidor MCP ${s.nome}`)
    },

    /** Os nomes cadastrados (para a importação marcar `jaExiste` e não repetir). */
    nomes(): string[] {
      return ler().arquivo.itens.map((s) => s.nome)
    },

    /** Na saída do app: mata as árvores dos stdio já, síncrono. */
    encerrarTudoJa(): void {
      cliente.encerrarTudoJa()
    },

    encerrarTudo(): Promise<void> {
      return cliente.encerrarTudo()
    }
  }
}

export type RegistroMcpFora = ReturnType<typeof criarRegistroMcpFora>

/** A parte da importação que a janela chama (`importar.ts`). */
export interface ImportadorMcp {
  lerImportacao(origem: unknown): Promise<unknown>
  importar(token: unknown, chaves: unknown): Promise<unknown>
}

/**
 * Os canais da aba Conexões › MCP. Só a janela do app chega aqui (o `ipcSeguro` recusa portal e página "+"); não há
 * verbo `ork` nem ferramenta MCP que chame isto.
 */
export function registrarMcpFora(ipc: Pick<IpcMain, 'handle'>, registro: RegistroMcpFora, importador: ImportadorMcp): void {
  const seguro = <T>(f: () => T | Promise<T>) => async (): Promise<T | { ok: false; erro: string }> => {
    try {
      return await f()
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : 'erro' }
    }
  }
  ipc.handle(CANAIS_MCP_FORA.listar, () => registro.listar())
  ipc.handle(CANAIS_MCP_FORA.criar, (_e, pedido: unknown) => seguro(() => registro.criar(pedido))())
  ipc.handle(CANAIS_MCP_FORA.editar, (_e, id: unknown, pedido: unknown) => seguro(() => registro.editar(id, pedido))())
  ipc.handle(CANAIS_MCP_FORA.remover, (_e, id: unknown) => seguro(() => registro.remover(id))())
  ipc.handle(CANAIS_MCP_FORA.pausar, (_e, id: unknown, pausar: unknown) => seguro(() => registro.pausar(id, pausar))())
  ipc.handle(CANAIS_MCP_FORA.testar, (_e, id: unknown) => seguro(() => registro.testar(id))())
  ipc.handle(CANAIS_MCP_FORA.ferramentas, (_e, id: unknown) => registro.ferramentas(id))
  ipc.handle(CANAIS_MCP_FORA.reverFerramentas, (_e, id: unknown, vistas: unknown) => seguro(() => registro.reverFerramentas(id, vistas))())
  ipc.handle(CANAIS_MCP_FORA.lerImportacao, (_e, origem: unknown) => seguro(() => importador.lerImportacao(origem))())
  ipc.handle(CANAIS_MCP_FORA.importar, (_e, token: unknown, chaves: unknown) => seguro(() => importador.importar(token, chaves))())
}
