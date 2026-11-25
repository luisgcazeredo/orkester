// MCP de fora (1.9.7, C2): importar os servidores MCP do Claude Code. Lê SÓ o `mcpServers` do `~/.claude.json` (o do
// usuário, no topo, e o de cada projeto, em `projects.<caminho>.mcpServers`) ou de um `.mcp.json` que o usuário escolhe.
//
// - Nada do arquivo vai para disco, tela ou log, fora o que vira servidor: o resto do `~/.claude.json` (histórico,
//   contas) nem é guardado. A leitura fica em memória, atrás de um token de uso único que vale 10 min.
// - `env` e `headers` são tratados como segredo: na importação, cada valor vira uma credencial cifrada (env → tipo
//   Segredo; `Authorization: Bearer x` → bearer; outro cabeçalho → tipo cabeçalho, com o domínio da URL). O texto
//   puro nunca é gravado. A janela vê só os NOMES (`secretos`).
// - O próprio Orkester (nome `orkester`, `ORK_CHAVE`, o `mcp.js` do app) não é oferecido: seria um laço.
// - HTTP sem cabeçalho (o `clickup` de hoje, que entra por OAuth) é importado como "precisa de login (1.9.8)".
// - SSE (transporte antigo) e o que não se entende ficam em `avisos`, sem valores.
import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LeituraDaImportacaoMcp, PedidoDeServidorMcp, ResultadoDaImportacaoMcp, ServidorParaImportar } from '../../shared/api'
import type { CofreDeCredenciais } from '../fluxos/credenciais'
import type { ImportadorMcp, RegistroMcpFora } from './registro'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { MAX_NOME_DA_CREDENCIAL, MIN_VALOR } from '../../shared/fluxos/credenciais.ts'
// @ts-expect-error idem
import { conferirUrlHttp, segredoNaUrl, segredoNosArgumentos } from '../../shared/mcpFora.ts'
// @ts-expect-error idem
import { MAX_NOME_DO_SERVIDOR, ehOProprioOrkester } from './registro.ts'

/** O `~/.claude.json` pode ser grande (histórico); acima disto a leitura é recusada. */
const MAX_ARQUIVO = 50 * 1024 * 1024
const VALIDADE_DO_TOKEN_MS = 10 * 60_000
const MAX_CANDIDATOS = 200

/** Um servidor achado, com os valores (só em memória, até o `importar`). */
interface Candidato {
  publico: ServidorParaImportar
  pedido: PedidoDeServidorMcp
  /** variável → valor (vira credencial Segredo) */
  env: Record<string, string>
  /** cabeçalho → valor (vira credencial com o domínio da URL) */
  headers: Record<string, string>
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const comAspas = (t: string): string => (/[\s"]/.test(t) ? `"${t.replace(/"/g, '\\"')}"` : t)

function textos(bruto: unknown): Record<string, string> {
  const saida: Record<string, string> = {}
  if (!ehObjeto(bruto)) return saida
  for (const [k, v] of Object.entries(bruto)) if (typeof v === 'string') saida[k] = v
  return saida
}

/**
 * Uma entrada de `mcpServers` → candidato, ou o motivo de não oferecer (sem valores). `null`: o próprio Orkester
 * (fica de fora em silêncio).
 */
function candidatoDe(nome: string, bruto: unknown): Omit<Candidato, 'publico'> & { resumo: string; precisaLogin: boolean } | { aviso: string } | null {
  if (!ehObjeto(bruto)) return { aviso: `${nome}: formato que o Orkester não entende` }
  const tipo = typeof bruto.type === 'string' ? bruto.type.toLowerCase() : undefined
  const env = textos(bruto.env)
  if (tipo === 'sse') return { aviso: `${nome}: usa SSE, o transporte antigo do MCP; o Orkester fala stdio e http` }
  if (typeof bruto.command === 'string' && (tipo === undefined || tipo === 'stdio')) {
    const args = Array.isArray(bruto.args) ? bruto.args.filter((a): a is string => typeof a === 'string') : []
    if (Array.isArray(bruto.args) && args.length !== bruto.args.length) return { aviso: `${nome}: argumentos que não são texto` }
    if (ehOProprioOrkester(nome, bruto.command, args, Object.keys(env))) return null
    // Revisão C (achado 2): chave nos argumentos ia ficar em texto no cadastro e à vista na tela: não oferece
    const segredo = segredoNosArgumentos(args)
    if (segredo) return { aviso: `${nome}: há uma chave nos argumentos (${segredo}); mova a chave para uma variável de ambiente (env) do servidor e importe de novo` }
    const pasta = typeof bruto.cwd === 'string' && bruto.cwd.trim() ? bruto.cwd.trim() : undefined
    return {
      pedido: { transporte: 'stdio', nome: nome.slice(0, MAX_NOME_DO_SERVIDOR), comando: bruto.command, args, ...(pasta ? { pasta } : {}) },
      env,
      headers: {},
      resumo: [bruto.command, ...args].map(comAspas).join(' '),
      precisaLogin: false
    }
  }
  if (typeof bruto.url === 'string' && (tipo === undefined || tipo === 'http' || tipo === 'streamable-http')) {
    if (ehOProprioOrkester(nome)) return null
    const url = conferirUrlHttp(bruto.url)
    if ('erro' in url) return { aviso: `${nome}: ${url.erro}` }
    if (segredoNaUrl(bruto.url)) return { aviso: `${nome}: a URL leva senha ou chave; mova a chave para um cabeçalho (headers) e importe de novo` }
    const headers = textos(bruto.headers)
    return {
      pedido: { transporte: 'http', nome: nome.slice(0, MAX_NOME_DO_SERVIDOR), url: url.href },
      env: {},
      headers,
      resumo: url.href,
      precisaLogin: !Object.keys(headers).length
    }
  }
  return { aviso: `${nome}: não tem command (stdio) nem url (http)` }
}

/**
 * O JSON lido → candidatos e avisos. `claude`: o `mcpServers` do topo ("usuário") e o de cada projeto (o caminho do
 * projeto); `arquivo`: o `mcpServers` do topo (o caminho do arquivo). Nada além de `mcpServers` é olhado.
 */
export function lerMcpServers(json: unknown, origem: { de: 'claude' } | { de: 'arquivo'; caminho: string }, jaCadastrados: readonly string[] = []):
  { candidatos: Candidato[]; avisos: string[] } {
  const blocos: { onde: string; servidores: unknown }[] = []
  if (ehObjeto(json)) {
    if (origem.de === 'claude') {
      blocos.push({ onde: 'usuário', servidores: json.mcpServers })
      if (ehObjeto(json.projects)) {
        for (const [caminho, projeto] of Object.entries(json.projects)) if (ehObjeto(projeto)) blocos.push({ onde: caminho, servidores: projeto.mcpServers })
      }
    } else {
      blocos.push({ onde: origem.caminho, servidores: json.mcpServers })
    }
  }
  const candidatos: Candidato[] = []
  const avisos: string[] = []
  const existentes = new Set(jaCadastrados.map((n) => n.toLowerCase()))
  blocos.forEach(({ onde, servidores }, i) => {
    if (!ehObjeto(servidores)) return
    for (const [nome, bruto] of Object.entries(servidores)) {
      if (candidatos.length >= MAX_CANDIDATOS) return
      const c = candidatoDe(nome, bruto)
      if (c === null) continue
      if ('aviso' in c) {
        avisos.push(c.aviso)
        continue
      }
      const secretos = [...Object.keys(c.env), ...Object.keys(c.headers)]
      candidatos.push({
        pedido: c.pedido,
        env: c.env,
        headers: c.headers,
        publico: {
          chave: `${i}:${nome}`,
          nome: c.pedido.nome,
          onde,
          transporte: c.pedido.transporte,
          resumo: c.resumo,
          secretos,
          ...(c.precisaLogin ? { precisaLogin: true } : {}),
          ...(existentes.has(c.pedido.nome.toLowerCase()) ? { jaExiste: true } : {})
        }
      })
    }
  })
  return { candidatos, avisos }
}

/** Um nome que ainda não existe na lista: `nome`, `nome (2)`, `nome (3)`… (cortado no teto). */
export function nomeLivre(nome: string, usados: readonly string[], max: number): string {
  const ocupados = new Set(usados.map((n) => n.toLowerCase()))
  const base = nome.slice(0, max)
  if (!ocupados.has(base.toLowerCase())) return base
  for (let n = 2; ; n++) {
    const sufixo = ` (${n})`
    const tentativa = `${nome.slice(0, max - sufixo.length)}${sufixo}`
    if (!ocupados.has(tentativa.toLowerCase())) return tentativa
  }
}

export interface DependenciasDaImportacao {
  registro: Pick<RegistroMcpFora, 'criarImportado' | 'nomes'>
  cofre: () => Pick<CofreDeCredenciais, 'criar' | 'apagar' | 'listar'>
  /** O `~/.claude.json` (a prova põe um falso). */
  caminhoDoClaude?: string
  /** O diálogo do sistema para escolher um `.mcp.json`; null = cancelou. */
  escolherArquivo: () => Promise<string | null>
  agora?: () => number
}

/** O importador (cabe em `ImportadorMcp`, o que `registrarMcpFora` pede). */
export interface Importador extends ImportadorMcp {
  lerImportacao(origem: unknown): Promise<LeituraDaImportacaoMcp>
  importar(token: unknown, chaves: unknown): Promise<ResultadoDaImportacaoMcp>
}

export function criarImportador(dep: DependenciasDaImportacao): Importador {
  const agora = dep.agora ?? Date.now
  /** Uma leitura por vez: a nova substitui a anterior. */
  let pendente: { token: string; expira: number; candidatos: Candidato[]; avisos: string[] } | null = null

  async function lerJson(caminho: string): Promise<unknown | { erro: string }> {
    try {
      const info = await stat(caminho)
      if (info.size > MAX_ARQUIVO) return { erro: `o arquivo passa de ${MAX_ARQUIVO / 1024 / 1024} MB` }
      return { json: JSON.parse(await readFile(caminho, 'utf8')) }
    } catch (e) {
      const codigo = (e as NodeJS.ErrnoException).code
      // nunca o conteúdo do arquivo na mensagem (o erro do JSON.parse cita um trecho)
      if (codigo === 'ENOENT') return { erro: `não achei ${caminho}` }
      if (e instanceof SyntaxError) return { erro: `${caminho} não é um JSON válido` }
      return { erro: `não consegui ler ${caminho}` }
    }
  }

  /** Cria as credenciais de um servidor; falhou uma, apaga as que já criou e devolve o erro. */
  function criarCredenciais(c: Candidato, usados: string[], avisos: string[]): { pedido: PedidoDeServidorMcp; criadas: string[] } | { erro: string } {
    const cofre = dep.cofre()
    const criadas: string[] = []
    const desfazer = (erro: string): { erro: string } => {
      for (const id of criadas) cofre.apagar(id)
      return { erro }
    }
    const nova = (rotulo: string, pedido: Record<string, unknown>): string | { erro: string } => {
      const nome = nomeLivre(`${c.pedido.nome} · ${rotulo}`, usados, MAX_NOME_DA_CREDENCIAL)
      const r = cofre.criar({ ...pedido, nome })
      if ('erro' in r) return { erro: `${c.pedido.nome}: ${rotulo}: ${r.erro}` }
      usados.push(nome)
      criadas.push(r.credencial.id)
      return r.credencial.id
    }
    const valorDeVariavel = (v: string): boolean => /\$\{[^}]*\}/.test(v)

    if (c.pedido.transporte === 'stdio') {
      const envCredencial: Record<string, string> = {}
      for (const [variavel, valor] of Object.entries(c.env)) {
        if (/^ork_/i.test(variavel)) {
          avisos.push(`${c.pedido.nome}: a variável ${variavel} é do Orkester e ficou de fora`)
          continue
        }
        if (valor.trim().length < MIN_VALOR) {
          avisos.push(`${c.pedido.nome}: a variável ${variavel} tem valor curto demais para um segredo e ficou de fora; defina-a em Conexões › MCP`)
          continue
        }
        if (valorDeVariavel(valor)) avisos.push(`${c.pedido.nome}: a variável ${variavel} usa \${…} do Claude Code; o Orkester guardou o texto como está, confira em Conexões`)
        const id = nova(variavel, { tipo: 'segredo', dominios: [], valor })
        if (typeof id !== 'string') return desfazer(id.erro)
        envCredencial[variavel] = id
      }
      return { pedido: { ...c.pedido, ...(Object.keys(envCredencial).length ? { envCredencial } : {}) }, criadas }
    }

    const host = new URL(c.pedido.url).hostname
    const cabecalhos: Record<string, string> = {}
    for (const [cabecalho, valor] of Object.entries(c.headers)) {
      const bearer = /^bearer\s+(.+)$/i.exec(valor.trim())
      const id =
        cabecalho.toLowerCase() === 'authorization' && bearer
          ? nova(cabecalho, { tipo: 'bearer', dominios: [host], valor: bearer[1], soLeitura: true })
          : nova(cabecalho, { tipo: 'cabecalho', cabecalho, dominios: [host], valor, soLeitura: true })
      if (typeof id !== 'string') return desfazer(id.erro)
      cabecalhos[bearer && cabecalho.toLowerCase() === 'authorization' ? 'Authorization' : cabecalho] = id
    }
    return { pedido: { ...c.pedido, ...(Object.keys(cabecalhos).length ? { cabecalhos } : {}) }, criadas }
  }

  return {
    async lerImportacao(origem: unknown): Promise<LeituraDaImportacaoMcp> {
      if (!ehObjeto(origem) || (origem.de !== 'claude' && origem.de !== 'arquivo')) return { ok: false, erro: 'origem: claude ou arquivo' }
      let caminho: string
      if (origem.de === 'claude') caminho = dep.caminhoDoClaude ?? join(homedir(), '.claude.json')
      else {
        const escolhido = await dep.escolherArquivo()
        if (!escolhido) return { ok: false, erro: 'cancelado', cancelado: true }
        caminho = escolhido
      }
      const lido = await lerJson(caminho)
      if (ehObjeto(lido) && typeof lido.erro === 'string') return { ok: false, erro: lido.erro }
      const json = (lido as { json: unknown }).json
      const { candidatos, avisos } = lerMcpServers(json, origem.de === 'claude' ? { de: 'claude' } : { de: 'arquivo', caminho }, dep.registro.nomes())
      if (!candidatos.length) {
        pendente = null
        return { ok: false, erro: ['nenhum servidor MCP para importar nesse arquivo', ...avisos].join(' · ') }
      }
      pendente = { token: randomUUID(), expira: agora() + VALIDADE_DO_TOKEN_MS, candidatos, avisos }
      return { ok: true, token: pendente.token, servidores: candidatos.map((c) => c.publico) }
    },

    async importar(token: unknown, chaves: unknown): Promise<ResultadoDaImportacaoMcp> {
      const leitura = pendente
      if (!leitura || typeof token !== 'string' || token !== leitura.token) return { ok: false, erro: 'essa leitura não vale mais: importe de novo' }
      pendente = null
      if (agora() > leitura.expira) return { ok: false, erro: 'a leitura passou de 10 minutos: importe de novo' }
      if (!Array.isArray(chaves) || chaves.some((c) => typeof c !== 'string')) return { ok: false, erro: 'chaves: uma lista de textos' }
      const escolhidos = leitura.candidatos.filter((c) => chaves.includes(c.publico.chave))
      if (!escolhidos.length) return { ok: false, erro: 'escolha pelo menos um servidor' }
      const avisos = [...leitura.avisos]
      const criados: string[] = []
      const nomesDeServidor = [...dep.registro.nomes()]
      const nomesDeCredencial = dep.cofre().listar().itens.map((c) => c.nome)
      for (const c of escolhidos) {
        const nome = nomeLivre(c.pedido.nome, nomesDeServidor, MAX_NOME_DO_SERVIDOR)
        const credenciais = criarCredenciais({ ...c, pedido: { ...c.pedido, nome } }, nomesDeCredencial, avisos)
        if ('erro' in credenciais) {
          avisos.push(credenciais.erro)
          continue
        }
        const r = dep.registro.criarImportado(credenciais.pedido, !!c.publico.precisaLogin)
        if (!r.ok) {
          for (const id of credenciais.criadas) dep.cofre().apagar(id)
          avisos.push(`${nome}: ${r.erro}`)
          continue
        }
        nomesDeServidor.push(nome)
        criados.push(nome)
        if (nome !== c.pedido.nome) avisos.push(`${c.pedido.nome} já existia: o importado ficou como "${nome}"`)
        if (c.publico.precisaLogin) avisos.push(`${nome}: precisa de login (OAuth), que chega na 1.9.8`)
      }
      return { ok: true, criados, avisos }
    }
  }
}
