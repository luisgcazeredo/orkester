// Temas do usuário e plugins de CSS (1.9.3): o arquivo `~/.orkester/temas.json`, as mudanças que a janela pede
// e o CSS que sai dele. Puro de propósito (o processo principal grava, a prova roda no Node).
//
// Um tema do usuário é um tema de fábrica (a `base`) com algumas cores trocadas: só os tokens que a pessoa mudou
// ficam gravados, o resto vem da base. O arquivo é lido como NÃO confiável: tudo passa de novo pela validação, e o
// que não passa cai (o resto do arquivo segue valendo).
// Node executa as provas TypeScript diretamente e precisa da extensão nos imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { blocosValidos, validarCssDePlugin, type BlocoCss } from './cssPlugin.ts'
// @ts-expect-error idem.
import { temaValido, type Tema } from './temas.ts'

/** Os tokens que o editor mostra, agrupados. Todos são cor cheia (#rrggbb) nos dois temas de fábrica. */
export const GRUPOS_DE_TOKENS = [
  { id: 'fundo', rotulo: 'Fundo', tokens: [['--quadro-fundo', 'Quadro'], ['--grade', 'Grade'], ['--painel', 'Painel'], ['--painel-alto', 'Painel alto'], ['--lateral-fundo', 'Lateral'], ['--cartao', 'Cartão']] },
  { id: 'bordas', rotulo: 'Bordas', tokens: [['--borda', 'Borda'], ['--borda-suave', 'Borda suave'], ['--corda', 'Corda']] },
  { id: 'texto', rotulo: 'Texto', tokens: [['--texto', 'Texto'], ['--texto-suave', 'Texto suave']] },
  { id: 'destaque', rotulo: 'Destaque', tokens: [['--destaque', 'Destaque'], ['--destaque-claro', 'Destaque claro'], ['--destaque-forte', 'Destaque forte']] },
  { id: 'estados', rotulo: 'Perigo e estados', tokens: [['--perigo', 'Perigo'], ['--atencao', 'Atenção'], ['--vivo', 'Vivo']] },
  { id: 'terminal', rotulo: 'Terminal', tokens: [['--terminal-cabecalho', 'Cabeçalho'], ['--terminal-corpo', 'Corpo'], ['--terminal-texto', 'Texto']] }
] as const satisfies ReadonlyArray<{ id: string; rotulo: string; tokens: ReadonlyArray<readonly [string, string]> }>

export type TokenEditavel = (typeof GRUPOS_DE_TOKENS)[number]['tokens'][number][0]
export const TOKENS_EDITAVEIS: readonly TokenEditavel[] = GRUPOS_DE_TOKENS.flatMap((g) => g.tokens.map(([t]) => t))
const EDITAVEIS = new Set<string>(TOKENS_EDITAVEIS)

export interface TemaDoUsuario {
  id: string
  nome: string
  /** O tema de fábrica de onde as cores não trocadas vêm (e cuja classe fica na raiz). */
  base: Tema
  /** Só as cores trocadas: token → #rrggbb (minúsculo). */
  cores: Partial<Record<TokenEditavel, string>>
}

export interface PluginCss {
  id: string
  nome: string
  ligado: boolean
  /** As declarações aceitas pela validação. O texto colado não é guardado: o CSS aplicado é re-gerado daqui. */
  blocos: BlocoCss[]
}

export interface ArquivoDeTemas {
  versao: 1
  /** O tema do usuário em uso, ou null (vale o tema de fábrica das preferências). */
  ativo: string | null
  temas: TemaDoUsuario[]
  /** Na ordem de aplicação: o de baixo vence. */
  plugins: PluginCss[]
}

export const ARQUIVO_DE_TEMAS_VAZIO: ArquivoDeTemas = { versao: 1, ativo: null, temas: [], plugins: [] }

export const TEMAS_MAXIMOS = 50
export const PLUGINS_MAXIMOS = 30
const NOME_MAXIMO = 60
const ID = /^[a-z0-9-]{1,40}$/
const HEX = /^#[0-9a-f]{6}$/

/** `#abc` ou `#aabbcc` (qualquer caixa) vira `#aabbcc`; o resto, null. */
export function normalizarHex(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const v = valor.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
  return HEX.test(v) ? v : null
}

function nomeValido(nome: unknown): string | null {
  if (typeof nome !== 'string') return null
  const limpo = nome.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return limpo && limpo.length <= NOME_MAXIMO ? limpo : null
}

/** As cores que valem: só tokens do editor, só #rrggbb. As outras caem em silêncio (arquivo não confiável). */
function coresValidas(cores: unknown): TemaDoUsuario['cores'] {
  const saida: Record<string, string> = {}
  if (!cores || typeof cores !== 'object' || Array.isArray(cores)) return saida
  for (const [token, valor] of Object.entries(cores)) {
    const hex = normalizarHex(valor)
    if (EDITAVEIS.has(token) && hex) saida[token] = hex
  }
  return saida
}

function temaLido(t: unknown): TemaDoUsuario | null {
  const x = t as Partial<TemaDoUsuario> | null
  const nome = nomeValido(x?.nome)
  // id de tema de fábrica (`escuro`, `claro`) no arquivo mexido à mão colidiria com ele na tela: cai
  if (!x || typeof x.id !== 'string' || !ID.test(x.id) || temaValido(x.id) || !nome || !temaValido(x.base)) return null
  return { id: x.id, nome, base: x.base, cores: coresValidas(x.cores) }
}

function pluginLido(p: unknown): PluginCss | null {
  const x = p as Partial<PluginCss> | null
  const nome = nomeValido(x?.nome)
  const blocos = blocosValidos(x?.blocos)
  if (!x || typeof x.id !== 'string' || !ID.test(x.id) || !nome || !blocos) return null
  return { id: x.id, nome, ligado: x.ligado === true, blocos }
}

/** Lê o arquivo (já com `JSON.parse`) como não confiável: o que não é válido cai, o resto vale. */
export function lerArquivoDeTemas(json: unknown): ArquivoDeTemas {
  const x = json as Partial<ArquivoDeTemas> | null
  if (!x || typeof x !== 'object' || x.versao !== 1) return { ...ARQUIVO_DE_TEMAS_VAZIO }
  const unicos = <T extends { id: string }>(lista: Array<T | null>, teto: number): T[] => {
    const vistos = new Set<string>()
    return lista.filter((i): i is T => !!i && !vistos.has(i.id) && !!vistos.add(i.id)).slice(0, teto)
  }
  const temas = unicos(Array.isArray(x.temas) ? x.temas.map(temaLido) : [], TEMAS_MAXIMOS)
  const plugins = unicos(Array.isArray(x.plugins) ? x.plugins.map(pluginLido) : [], PLUGINS_MAXIMOS)
  const ativo = typeof x.ativo === 'string' && temas.some((t) => t.id === x.ativo) ? x.ativo : null
  return { versao: 1, ativo, temas, plugins }
}

/** O que a janela pode pedir. Cada pedido é validado aqui; o processo principal só lê, aplica e grava. */
export type OperacaoDeTemas =
  /** Sem `id`: tema novo (o id é gerado). Com `id`: troca o que existe. */
  | { tipo: 'salvarTema'; tema: { id?: string; nome: string; base: Tema; cores: TemaDoUsuario['cores'] } }
  | { tipo: 'apagarTema'; id: string }
  | { tipo: 'usar'; id: string | null }
  /** O texto passa pela validação do plugin; recusado, volta o motivo. */
  | { tipo: 'adicionarPlugin'; nome: string; texto: string }
  | { tipo: 'ligarPlugin'; id: string; ligado: boolean }
  | { tipo: 'moverPlugin'; id: string; passo: -1 | 1 }
  | { tipo: 'apagarPlugin'; id: string }

export type ResultadoDeTemas = { ok: true; arquivo: ArquivoDeTemas; id?: string } | { ok: false; erro: string }

const erro = (texto: string): ResultadoDeTemas => ({ ok: false, erro: texto })

/** Id novo que passa na regra e não colide com tema de fábrica nem com os já usados; algumas tentativas, depois null. */
function idLivre(usados: ReadonlyArray<{ id: string }>, novoId: () => string): string | null {
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const id = novoId()
    if (ID.test(id) && !temaValido(id) && !usados.some((x) => x.id === id)) return id
  }
  return null
}

/** Aplica um pedido ao arquivo (sem mexer no de entrada). `novoId` gera o id de tema ou plugin novo. */
export function aplicarOperacao(arquivo: ArquivoDeTemas, op: unknown, novoId: () => string): ResultadoDeTemas {
  const o = op as OperacaoDeTemas | null
  const a: ArquivoDeTemas = { ...arquivo, temas: [...arquivo.temas], plugins: [...arquivo.plugins] }
  const ok = (id?: string): ResultadoDeTemas => ({ ok: true, arquivo: a, ...(id ? { id } : {}) })
  const idOk = (id: unknown): id is string => typeof id === 'string' && ID.test(id)
  switch (o?.tipo) {
    case 'salvarTema': {
      const t = o.tema
      const nome = nomeValido(t?.nome)
      if (!nome) return erro(`o nome do tema precisa ter de 1 a ${NOME_MAXIMO} caracteres`)
      if (!temaValido(t.base)) return erro('a base do tema não existe')
      if (!t.cores || typeof t.cores !== 'object') return erro('cores inválidas')
      for (const [token, valor] of Object.entries(t.cores)) {
        if (!EDITAVEIS.has(token)) return erro(`o token ${token} não é editável`)
        if (!normalizarHex(valor)) return erro(`${token}: cor inválida (use #rrggbb)`)
      }
      const cores = coresValidas(t.cores)
      if (t.id === undefined) {
        if (a.temas.length >= TEMAS_MAXIMOS) return erro(`no máximo ${TEMAS_MAXIMOS} temas`)
        const id = idLivre(a.temas, novoId)
        if (!id) return erro('não consegui gerar um id livre para o tema')
        a.temas.push({ id, nome, base: t.base, cores })
        return ok(id)
      }
      const i = a.temas.findIndex((x) => x.id === t.id)
      if (i < 0) return erro('esse tema não existe mais')
      a.temas[i] = { id: t.id, nome, base: t.base, cores }
      return ok(t.id)
    }
    case 'apagarTema': {
      if (!a.temas.some((x) => x.id === o.id)) return erro('esse tema não existe mais')
      a.temas = a.temas.filter((x) => x.id !== o.id)
      if (a.ativo === o.id) a.ativo = null
      return ok()
    }
    case 'usar': {
      if (o.id !== null && !(idOk(o.id) && a.temas.some((x) => x.id === o.id))) return erro('esse tema não existe mais')
      a.ativo = o.id
      return ok()
    }
    case 'adicionarPlugin': {
      const nome = nomeValido(o.nome)
      if (!nome) return erro(`o nome do plugin precisa ter de 1 a ${NOME_MAXIMO} caracteres`)
      if (a.plugins.length >= PLUGINS_MAXIMOS) return erro(`no máximo ${PLUGINS_MAXIMOS} plugins`)
      const r = validarCssDePlugin(o.texto)
      if (!r.ok) return erro(r.motivo)
      const id = idLivre(a.plugins, novoId)
      if (!id) return erro('não consegui gerar um id livre para o plugin')
      a.plugins.push({ id, nome, ligado: true, blocos: r.blocos })
      return ok(id)
    }
    case 'ligarPlugin': {
      const i = a.plugins.findIndex((x) => x.id === o.id)
      if (i < 0) return erro('esse plugin não existe mais')
      a.plugins[i] = { ...a.plugins[i], ligado: o.ligado === true }
      return ok()
    }
    case 'moverPlugin': {
      const i = a.plugins.findIndex((x) => x.id === o.id)
      if (i < 0) return erro('esse plugin não existe mais')
      if (o.passo !== -1 && o.passo !== 1) return erro('passo inválido')
      const j = i + o.passo
      if (j < 0 || j >= a.plugins.length) return ok()
      ;[a.plugins[i], a.plugins[j]] = [a.plugins[j], a.plugins[i]]
      return ok()
    }
    case 'apagarPlugin': {
      if (!a.plugins.some((x) => x.id === o.id)) return erro('esse plugin não existe mais')
      a.plugins = a.plugins.filter((x) => x.id !== o.id)
      return ok()
    }
    default:
      return erro('pedido desconhecido')
  }
}

/**
 * O CSS do tema do usuário em uso: só as cores trocadas, re-geradas do que passou pela validação. O seletor
 * `.app.app.app.tema-<base>` fica um degrau acima dos plugins (ver `cssDosPlugins`) e só vale enquanto a base
 * é o tema das preferências — trocar para o outro tema de fábrica (o botão sol/lua) mostra o de fábrica.
 */
export function cssDoTemaDoUsuario(tema: Pick<TemaDoUsuario, 'base' | 'cores'> | null | undefined): string {
  if (!tema || !temaValido(tema.base)) return ''
  const cores = coresValidas(tema.cores)
  const linhas = Object.entries(cores).map(([token, hex]) => `  ${token}: ${hex};`)
  return linhas.length ? `.app.app.app.tema-${tema.base} {\n${linhas.join('\n')}\n}` : ''
}
