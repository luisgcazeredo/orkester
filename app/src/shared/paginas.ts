/**
 * Páginas "+" (1.9.5): páginas de fora que rodam dentro do Orkester, isoladas do PC. Aqui só as regras puras —
 * manifesto, árvore da pasta, caminho servível, CSP, endereços permitidos, permissões, limpeza do recado, baldes
 * de taxa e cota de dados — para o main usar e as provas conferirem sem Electron. O porquê de cada limite está no
 * desenho (.contexto/195-S1-desenho.md); o main (main/paginas.ts) é quem aplica.
 *
 * **Permissão como texto** ("ficha"): `quadro`, `recado`, `rede:<host>` e `local:<porta><caminho>`. Cada host e cada
 * caminho é uma ficha: dá para revogar um só, e um host novo no manifesto é uma permissão nova (não carrega sem aceite).
 */

export const FORMATO_DO_MANIFESTO = 1
export const FORMATO_DO_REGISTRO = 1

export const LIMITES = {
  arquivos: 200,
  bytesTotal: 5 * 1024 * 1024,
  bytesArquivo: 2 * 1024 * 1024,
  /** pastas acima do arquivo: `a/b/c/d/x.js` = 4 */
  profundidade: 4,
  paginas: 20,
  hosts: 5,
  caminhosLocais: 5,
  cordas: 10,
  icone: 32 * 1024,
  nome: 30,
  descricao: 200,
  recadoBytes: 4 * 1024,
  respostaBytes: 64 * 1024,
  filaDeRespostas: 20,
  filaDeRespostasBytes: 256 * 1024,
  dadoBytes: 256 * 1024,
  dadosBytes: 1024 * 1024,
  dadosChaves: 200,
  localBytes: 1024 * 1024,
  localMs: 5000
} as const

/** Extensão → Content-Type. Qualquer outra extensão recusa a pasta inteira. */
export const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
}

/** Ícones da barra que a página pode pedir por nome (`lucide:<Nome>`); o front-end mapeia para o componente. */
export const ICONES_LUCIDE = [
  'LayoutDashboard', 'Gauge', 'ListChecks', 'ListTodo', 'Kanban', 'Calendar', 'CalendarDays', 'Clock', 'Timer', 'Bell',
  'Inbox', 'Mail', 'MessageSquare', 'MessagesSquare', 'Notebook', 'NotebookPen', 'BookOpen', 'FileText', 'Folder',
  'Database', 'Server', 'Globe', 'ChartBar', 'ChartLine', 'ChartPie', 'Activity', 'Star', 'Sparkles', 'Rocket', 'Zap',
  'Wrench', 'Users', 'Bot', 'Terminal', 'Code', 'Package', 'Target', 'Flag', 'Compass', 'Lightbulb', 'Puzzle', 'Palette',
  'Newspaper', 'House'
] as const

export const ID_DE_PAGINA = /^[a-z][a-z0-9-]{1,31}$/
const VERSAO = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/
/** Segmento de caminho: sem ponto inicial, sem `~`, `:`, espaço, `%`; o final não pode ser ponto (o Windows o apaga). */
const SEGMENTO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const RESERVADO_NO_WINDOWS = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i
/**
 * Nome mostrado no Orkester (barra, cabeçalho do recado): sem aspas, colchetes nem `<>`, sem controle nem formato
 * (`\p{C}`: espaço de largura zero, BOM, marcas de direção, hífen suave…), sem quebra de linha Unicode e sem espaço
 * que não seja o comum. Senão "Kan\u200Bban" imita na barra o nome de uma página nativa (revisão 195, item 1).
 */
const NOME_VISIVEL = /^[^\p{C}\p{Zl}\p{Zp}"`[\]<>\\]+$/u
const ESPACO_INCOMUM = /[^\P{Zs} ]/u
const nomeVisivel = (nome: string): boolean => NOME_VISIVEL.test(nome) && !ESPACO_INCOMUM.test(nome)
const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/
const SUFIXO_LOCAL = /(^|\.)(localhost|local|lan|internal|intranet|home|corp|arpa|test|invalid|example)$/
const CAMINHO_LOCAL = /^\/(?:[A-Za-z0-9._~-]+\/?)*$/

export type TipoDePermissao = 'quadro' | 'recado' | 'rede' | 'local'

export interface PermissoesDoManifesto {
  quadro?: boolean
  recado?: boolean
  rede?: string[]
  local?: { porta: number; caminhos: string[] }
}

export interface ManifestoDePagina {
  formato: 1
  id: string
  nome: string
  versao: string
  descricao: string
  /** `lucide:<Nome>` ou caminho de um .svg/.png da pasta; vazio = a inicial do nome */
  icone: string
  permissoes: PermissoesDoManifesto
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string }

const falha = <T>(erro: string): Resultado<T> => ({ ok: false, erro })
const tipoDe = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'lista' : typeof v)
const objetoSimples = (v: unknown): v is Record<string, unknown> => tipoDe(v) === 'object'

/** Chaves fora da lista = recusa (manifesto estrito: chave a mais esconde intenção). */
function chavesSobrando(obj: Record<string, unknown>, aceitas: readonly string[]): string | null {
  return Object.keys(obj).find((k) => !aceitas.includes(k)) ?? null
}

/** Host aceito em `rede`: nome DNS exato, minúsculo, sem IP, sem curinga, sem nome de rede local. */
export function hostValido(host: unknown): host is string {
  return typeof host === 'string' && HOST.test(host) && !SUFIXO_LOCAL.test(host) && !/^[0-9.]+$/.test(host)
}

/** Caminho aceito em `local.caminhos`: exato (`/api/dados`) ou prefixo terminado em `/` (`/api/`). */
export function caminhoLocalValido(caminho: unknown): caminho is string {
  return (
    typeof caminho === 'string' &&
    caminho.length <= 128 &&
    CAMINHO_LOCAL.test(caminho) &&
    !caminho.split('/').some((s) => s === '.' || s === '..') &&
    !caminho.includes('//')
  )
}

export function validarManifesto(bruto: unknown): Resultado<ManifestoDePagina> {
  if (!objetoSimples(bruto)) return falha('o manifesto não é um objeto JSON')
  const sobra = chavesSobrando(bruto, ['formato', 'id', 'nome', 'versao', 'descricao', 'icone', 'permissoes'])
  if (sobra) return falha(`chave desconhecida no manifesto: "${sobra.slice(0, 40)}"`)
  if (bruto.formato !== FORMATO_DO_MANIFESTO) return falha(`"formato" precisa ser ${FORMATO_DO_MANIFESTO}`)
  if (typeof bruto.id !== 'string' || !ID_DE_PAGINA.test(bruto.id)) return falha('"id": de 2 a 32 letras minúsculas, números e hífen, começando por letra')
  const nome = bruto.nome
  if (typeof nome !== 'string' || !nome.trim() || nome.length > LIMITES.nome || nome !== nome.trim() || !nomeVisivel(nome)) {
    return falha(`"nome": de 1 a ${LIMITES.nome} caracteres, sem aspas, colchetes, "<>", caracteres invisíveis nem espaço que não seja o comum`)
  }
  if (typeof bruto.versao !== 'string' || !VERSAO.test(bruto.versao)) return falha('"versao": no formato 1.0.0')
  const descricao = bruto.descricao ?? ''
  if (typeof descricao !== 'string' || descricao.length > LIMITES.descricao || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(descricao)) {
    return falha(`"descricao": texto de até ${LIMITES.descricao} caracteres`)
  }
  const icone = bruto.icone ?? ''
  if (typeof icone !== 'string') return falha('"icone": texto')
  if (icone.startsWith('lucide:')) {
    if (!(ICONES_LUCIDE as readonly string[]).includes(icone.slice(7))) return falha(`"icone": "${icone.slice(0, 40)}" não está na lista de ícones aceitos`)
  } else if (icone && (!caminhoNaPastaValido(icone) || !/\.(svg|png)$/i.test(icone))) {
    return falha('"icone": `lucide:<Nome>` ou um arquivo .svg/.png da própria pasta')
  }
  const permissoes = bruto.permissoes ?? {}
  if (!objetoSimples(permissoes)) return falha('"permissoes" precisa ser um objeto')
  const sobraP = chavesSobrando(permissoes, ['quadro', 'recado', 'rede', 'local'])
  if (sobraP) return falha(`permissão desconhecida: "${sobraP.slice(0, 40)}"`)
  for (const k of ['quadro', 'recado'] as const) {
    if (permissoes[k] !== undefined && typeof permissoes[k] !== 'boolean') return falha(`"permissoes.${k}" é true ou false`)
  }
  const saida: PermissoesDoManifesto = {}
  if (permissoes.quadro) saida.quadro = true
  if (permissoes.recado) saida.recado = true
  if (permissoes.rede !== undefined) {
    const rede = permissoes.rede
    if (!Array.isArray(rede)) return falha('"permissoes.rede" é uma lista de hosts')
    if (rede.length > LIMITES.hosts) return falha(`"permissoes.rede": no máximo ${LIMITES.hosts} hosts`)
    const ruim = rede.find((h) => !hostValido(h))
    if (ruim !== undefined) {
      return falha(`"permissoes.rede": "${String(ruim).slice(0, 60)}" não vale (só nome exato em minúsculas, sem curinga, IP, porta, "http", localhost ou rede local)`)
    }
    if (new Set(rede).size !== rede.length) return falha('"permissoes.rede": host repetido')
    if (rede.length) saida.rede = [...(rede as string[])]
  }
  if (permissoes.local !== undefined) {
    const local = permissoes.local
    if (!objetoSimples(local)) return falha('"permissoes.local" é { "porta": N, "caminhos": [...] }')
    const sobraL = chavesSobrando(local, ['porta', 'caminhos'])
    if (sobraL) return falha(`chave desconhecida em "permissoes.local": "${sobraL.slice(0, 40)}"`)
    if (!Number.isInteger(local.porta) || (local.porta as number) < 1 || (local.porta as number) > 65535) return falha('"permissoes.local.porta": número de 1 a 65535')
    const caminhos = local.caminhos
    if (!Array.isArray(caminhos) || !caminhos.length || caminhos.length > LIMITES.caminhosLocais) {
      return falha(`"permissoes.local.caminhos": de 1 a ${LIMITES.caminhosLocais} caminhos`)
    }
    const ruim = caminhos.find((c) => !caminhoLocalValido(c))
    if (ruim !== undefined) return falha(`"permissoes.local.caminhos": "${String(ruim).slice(0, 60)}" não vale (começa com "/", sem ".." nem "//")`)
    saida.local = { porta: local.porta as number, caminhos: [...new Set(caminhos as string[])] }
  }
  // o que a página lê do PC não pode ter por onde sair
  if (saida.local && saida.rede) return falha('"local" e "rede" não andam juntos: uma página que lê deste PC não fala com a internet')
  return {
    ok: true,
    valor: { formato: 1, id: bruto.id, nome, versao: bruto.versao, descricao, icone, permissoes: saida }
  }
}

// ---------------------------------------------------------------- permissões como fichas

export function permissoesPedidas(m: Pick<ManifestoDePagina, 'permissoes'>): string[] {
  const p = m.permissoes
  return [
    ...(p.quadro ? ['quadro'] : []),
    ...(p.recado ? ['recado'] : []),
    ...(p.rede ?? []).map((h) => `rede:${h}`),
    ...(p.local ? p.local.caminhos.map((c) => `local:${p.local!.porta}${c}`) : [])
  ]
}

export interface FichaLida {
  tipo: TipoDePermissao
  host?: string
  porta?: number
  caminho?: string
}

/** Lê uma ficha de permissão (`rede:api.x.com`, `local:7788/api/`). null = ficha que não existe. */
export function lerPermissao(ficha: string): FichaLida | null {
  if (ficha === 'quadro' || ficha === 'recado') return { tipo: ficha }
  if (ficha.startsWith('rede:')) return hostValido(ficha.slice(5)) ? { tipo: 'rede', host: ficha.slice(5) } : null
  const local = /^local:(\d{1,5})(\/.*)$/.exec(ficha)
  if (local && Number(local[1]) >= 1 && Number(local[1]) <= 65535 && caminhoLocalValido(local[2])) {
    return { tipo: 'local', porta: Number(local[1]), caminho: local[2] }
  }
  return null
}

/** O que o manifesto pede e o usuário ainda não decidiu (nem aceitou, nem revogou). Tem algo ⇒ não carrega. */
export function novasPermissoes(pedidas: readonly string[], aceitas: readonly string[], recusadas: readonly string[]): string[] {
  return pedidas.filter((p) => !aceitas.includes(p) && !recusadas.includes(p))
}

/** O que vale agora: pedido, aceito e não revogado. */
export function permissoesEfetivas(pedidas: readonly string[], aceitas: readonly string[], recusadas: readonly string[]): string[] {
  return pedidas.filter((p) => aceitas.includes(p) && !recusadas.includes(p))
}

export const hostsDe = (efetivas: readonly string[]): string[] => efetivas.filter((f) => f.startsWith('rede:')).map((f) => f.slice(5))

// ---------------------------------------------------------------- a árvore da pasta

export interface EntradaDaArvore {
  /** relativo à pasta, com `/` */
  caminho: string
  tipo: 'arquivo' | 'pasta' | 'link' | 'outro'
  bytes: number
}

export function segmentoValido(s: string): boolean {
  return SEGMENTO.test(s) && !s.endsWith('.') && !RESERVADO_NO_WINDOWS.test(s)
}

/** Caminho relativo da pasta da página (o do ícone, o de cada arquivo): segmentos válidos, sem `..`. */
export function caminhoNaPastaValido(caminho: string): boolean {
  const partes = caminho.split('/')
  return partes.length <= LIMITES.profundidade + 1 && partes.every(segmentoValido)
}

export const extensaoDe = (caminho: string): string => {
  const ponto = caminho.lastIndexOf('.')
  return ponto > caminho.lastIndexOf('/') ? caminho.slice(ponto).toLowerCase() : ''
}

/**
 * Confere a pasta inteira antes de qualquer cópia ou carga: link, tipo estranho, nome, extensão, profundidade,
 * quantidade e tamanho. O primeiro problema recusa a pasta toda, dizendo qual arquivo.
 */
export function validarArvore(entradas: readonly EntradaDaArvore[]): Resultado<{ arquivos: number; bytes: number }> {
  let arquivos = 0
  let bytes = 0
  for (const e of entradas) {
    const nome = e.caminho.slice(0, 120)
    if (e.tipo === 'link') return falha(`"${nome}" é um atalho (link ou junção): páginas não podem ter links`)
    if (e.tipo === 'outro') return falha(`"${nome}" não é arquivo nem pasta`)
    const partes = e.caminho.split('/')
    const ruim = partes.find((s) => !segmentoValido(s))
    if (ruim !== undefined) return falha(`"${nome}": o nome "${ruim.slice(0, 64)}" não vale (letras, números, ".", "_", "-"; sem ponto no começo nem no fim; sem nomes reservados do Windows)`)
    const nivel = e.tipo === 'pasta' ? partes.length : partes.length - 1
    if (nivel > LIMITES.profundidade) return falha(`"${nome}": pastas demais uma dentro da outra (máximo ${LIMITES.profundidade})`)
    if (e.tipo === 'pasta') continue
    if (!MIME[extensaoDe(e.caminho)]) return falha(`"${nome}": tipo de arquivo não aceito (aceitos: ${Object.keys(MIME).join(' ')})`)
    if (e.bytes > LIMITES.bytesArquivo) return falha(`"${nome}" passa de ${LIMITES.bytesArquivo / 1024 / 1024} MB`)
    arquivos++
    bytes += e.bytes
    if (arquivos > LIMITES.arquivos) return falha(`a pasta tem mais de ${LIMITES.arquivos} arquivos`)
    if (bytes > LIMITES.bytesTotal) return falha(`a pasta passa de ${LIMITES.bytesTotal / 1024 / 1024} MB no total`)
  }
  const tem = (c: string): boolean => entradas.some((e) => e.tipo === 'arquivo' && e.caminho === c)
  if (!tem('manifesto.json')) return falha('falta o manifesto.json na raiz da pasta')
  if (!tem('index.html')) return falha('falta o index.html na raiz da pasta')
  return { ok: true, valor: { arquivos, bytes } }
}

// ---------------------------------------------------------------- servir

/**
 * A chave do mapa em memória para um pedido `ork-pagina://<id>/...`, ou null (404). Lê a URL **crua**: barra
 * codificada (`%2f`, `%5c`) recusa antes de decodificar; decodifica uma vez; cada segmento tem de ser válido —
 * o que já barra `..`, `.`, segmento vazio (`//`), `\`, `:`, NUL e `%` que sobrou de codificação dupla.
 */
export function caminhoServivel(url: string, id: string): string | null {
  const base = `ork-pagina://${id}/`
  if (!url.startsWith(base)) return null
  const cru = url.slice(base.length).split(/[?#]/)[0]
  if (/%(2f|5c|00)/i.test(cru) || cru.includes('\\')) return null
  let caminho: string
  try {
    caminho = decodeURIComponent(cru)
  } catch {
    return null
  }
  if (caminho === '') return 'index.html'
  return caminhoNaPastaValido(caminho) ? caminho : null
}

const origemDe = (id: string): string => `ork-pagina://${id}`

/**
 * A CSP de toda resposta da página. O `<meta>` da página só consegue apertar, nunca afrouxar.
 *
 * `sandbox allow-scripts allow-forms`, sem `allow-same-origin` (revisão 195, decisão A do Maestro): a página roda com
 * origem opaca (`null`), e todo iframe dela ganha outra origem opaca. Assim a página não alcança o global de um
 * iframe `about:blank` (onde o Electron não roda preload), e o WebRTC de lá fica fora do alcance. `allow-forms` só deixa
 * o evento `submit` disparar (o `form-action 'none'` segue barrando o envio). Custo: localStorage, IndexedDB e cookies
 * não abrem (o armazenamento é o orkPagina.dados), e o `Origin` dos pedidos aos hosts de `rede` é `null`.
 */
export function cspDaPagina(id: string, hosts: readonly string[]): string {
  const O = origemDe(id)
  const https = hosts.map((h) => ` https://${h}`).join('')
  const wss = hosts.map((h) => ` wss://${h}`).join('')
  return [
    "default-src 'none'",
    `script-src ${O}`,
    `style-src ${O} 'unsafe-inline'`,
    `img-src ${O} data: blob:${https}`,
    `font-src ${O} data:`,
    `connect-src ${O}${https}${wss}`,
    `media-src ${O} blob:`,
    "worker-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    'sandbox allow-scripts allow-forms'
  ].join('; ')
}

export const POLITICA_DE_PERMISSOES =
  'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=(), bluetooth=(), clipboard-read=(), clipboard-write=(), display-capture=(), payment=(), fullscreen=()'

/** Cabeçalhos fixos de toda resposta do protocolo da página. */
export function cabecalhosDaPagina(id: string, hosts: readonly string[], caminho: string): Record<string, string> {
  return {
    'Content-Type': MIME[extensaoDe(caminho)] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': POLITICA_DE_PERMISSOES,
    'Content-Security-Policy': cspDaPagina(id, hosts),
    // a página tem origem opaca: fonte, módulo e fetch dos próprios arquivos viram pedido de outra origem. Só a
    // sessão desta página serve este id, então "*" não abre nada para fora dela
    'Access-Control-Allow-Origin': '*'
  }
}

/**
 * O que a sessão da página pode pedir (webRequest): o próprio id, os hosts aceitos por https/wss na porta padrão,
 * `data:`/`blob:` (não saem do processo) e `devtools:`. O resto cai: `file:`, `http:`, outro id, `ork-imagem:`, IP.
 */
export function urlPermitida(endereco: string, id: string, hosts: readonly string[]): boolean {
  let url: URL
  try {
    url = new URL(endereco)
  } catch {
    return false
  }
  if (url.protocol === 'ork-pagina:') return endereco.startsWith(`ork-pagina://${id}/`) || endereco === `ork-pagina://${id}`
  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'devtools:') return true
  if (url.protocol !== 'https:' && url.protocol !== 'wss:') return false
  if (url.username || url.password || url.port) return false
  return hosts.includes(url.hostname)
}

/** Navegação da página (will-navigate, will-redirect, iframe): só dentro do próprio id. */
export const navegacaoPermitida = (endereco: string, id: string): boolean => endereco.startsWith(`ork-pagina://${id}/`)

/**
 * O caminho que a página pediu em `local.ler`, conferido contra as fichas `local:` efetivas. Devolve a URL
 * (`http://127.0.0.1:<porta><caminho>`) ou o motivo da recusa. Só caminho exato ou dentro de um prefixo com `/`.
 */
export function urlLocal(caminho: unknown, efetivas: readonly string[]): Resultado<string> {
  if (typeof caminho !== 'string' || !caminho.startsWith('/') || caminho.length > 1024) return falha('caminho inválido: comece com "/"')
  if (/[\u0000-\u001f\u007f\\#]|%(2e|2f|5c|00)/i.test(caminho) || caminho.includes('//')) return falha('caminho inválido')
  const [so] = caminho.split('?')
  if (so.split('/').some((s) => s === '.' || s === '..')) return falha('caminho inválido')
  const locais = efetivas.map(lerPermissao).filter((f): f is FichaLida => f?.tipo === 'local')
  if (!locais.length) return falha('a página não tem a permissão "local"')
  const porta = locais[0].porta!
  let url: URL
  try {
    url = new URL(`http://127.0.0.1:${porta}${caminho}`)
  } catch {
    return falha('caminho inválido')
  }
  const pathname = url.pathname
  const aceito = locais.some((f) => (f.caminho!.endsWith('/') ? pathname.startsWith(f.caminho!) : pathname === f.caminho))
  if (!aceito) return falha(`o caminho "${pathname.slice(0, 80)}" não está entre os aceitos`)
  return { ok: true, valor: url.href }
}

// ---------------------------------------------------------------- recado

/** O prefixo de cada linha do recado da página: o mesmo `| ` do texto de tarefa no pedido do kanban. */
export const CITACAO_DO_RECADO = '| '

/**
 * O texto que a página manda ao agente, antes de ir à caixa. A ordem importa (revisão 195, item 1):
 *  1. NFKC: `［ork` (largura total) vira `[ork` e os espaços de compatibilidade viram espaço comum, antes de conferir;
 *  2. saem os invisíveis de formato (`\p{Cf}`: largura zero, BOM, WJ, marcas e isolamentos de direção, hífen suave,
 *     etiquetas) e as metades soltas de surrogate;
 *  3. saem os marcadores de colagem `ESC[200~`/`ESC[201~` e todo caractere de controle, menos quebra de linha e tab;
 *     `\r`, U+2028 e U+2029 viram quebra de linha de verdade; qualquer outro espaço Unicode vira espaço comum;
 *  4. `[ork` em qualquer posição vira `(ork`;
 *  5. **toda linha ganha `| ` na frente** (como no kanban): nenhuma linha do recado começa como cabeçalho do Orkester.
 * Só espaço e linha em branco: devolve `''` (o main recusa como recado vazio).
 */
export function limparTextoDoRecado(texto: string): string {
  const limpo = texto
    .normalize('NFKC')
    .replace(/[\p{Cf}\p{Cs}]/gu, '')
    .replace(/\x1b\[20[01]~/g, '')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')
    .replace(/\p{Zs}/gu, ' ')
    .replace(/\[(ork)/gi, '($1')
    .replace(/^\s*\n/, '')
    .trimEnd()
  if (!limpo.trim()) return ''
  return limpo
    .split('\n')
    .map((l) => `${CITACAO_DO_RECADO}${l}`.trimEnd())
    .join('\n')
}

export const bytesDe = (texto: string): number => new TextEncoder().encode(texto).length

// ---------------------------------------------------------------- taxa

/**
 * Balde de fichas com relógio injetado: `capacidade` fichas que voltam aos poucos, todas em `periodoMs`. Por chave
 * (um balde para cada agente, por exemplo); chave omitida = o balde único.
 */
export function criarBalde(capacidade: number, periodoMs: number, agora: () => number): { tirar(chave?: string): boolean } {
  const baldes = new Map<string, { fichas: number; em: number }>()
  return {
    tirar(chave = '') {
      const t = agora()
      const b = baldes.get(chave) ?? { fichas: capacidade, em: t }
      b.fichas = Math.min(capacidade, b.fichas + ((t - b.em) * capacidade) / periodoMs)
      b.em = t
      baldes.set(chave, b)
      if (baldes.size > 1000) baldes.delete(baldes.keys().next().value!)
      if (b.fichas < 1) return false
      b.fichas -= 1
      return true
    }
  }
}

// ---------------------------------------------------------------- dados da página

/** Começa por letra ou número: `__proto__`, `_x` e afins não são chave. */
export const CHAVE_DE_DADO = /^[a-z0-9][a-z0-9._-]{0,63}$/

/**
 * Grava `k = v` nos dados da página, se couber na cota: chave válida, valor JSON até 256 KB, total até 1 MB, até 200
 * chaves. O valor passa por JSON ida e volta (o que não é JSON — função, Map, ciclo — não entra).
 */
export function gravarDado(atual: Readonly<Record<string, unknown>>, k: unknown, v: unknown): Resultado<Record<string, unknown>> {
  if (typeof k !== 'string' || !CHAVE_DE_DADO.test(k)) return falha('chave inválida: de 1 a 64 letras minúsculas, números, ".", "_" ou "-", começando por letra ou número')
  let texto: string | undefined
  try {
    texto = JSON.stringify(v)
  } catch {
    return falha('o valor não é JSON')
  }
  if (texto === undefined) return falha('o valor não é JSON')
  if (bytesDe(texto) > LIMITES.dadoBytes) return falha(`o valor passa de ${LIMITES.dadoBytes / 1024} KB`)
  const novo: Record<string, unknown> = { ...atual, [k]: JSON.parse(texto) }
  if (Object.keys(novo).length > LIMITES.dadosChaves) return falha(`no máximo ${LIMITES.dadosChaves} chaves`)
  if (bytesDe(JSON.stringify(novo)) > LIMITES.dadosBytes) return falha(`os dados da página passariam de ${LIMITES.dadosBytes / 1024 / 1024} MB`)
  return { ok: true, valor: novo }
}

/** Dados lidos do disco (não confiáveis): só chaves válidas; quebrado = vazio. */
export function lerDados(bruto: unknown): Record<string, unknown> {
  if (!objetoSimples(bruto)) return {}
  return Object.fromEntries(Object.entries(bruto).filter(([k]) => CHAVE_DE_DADO.test(k)).slice(0, LIMITES.dadosChaves))
}

// ---------------------------------------------------------------- descarga dos dados no disco

/** Entre duas escritas dos dados da mesma página, no mínimo isto. */
export const DESCARGA_MIN_MS = 2000
/** E no máximo isto escrito por minuto por página: depois de escrever 1 MB, a próxima escrita espera 1 minuto. */
export const DESCARGA_BYTES_POR_MINUTO = 1024 * 1024

export interface RelogioDaDescarga {
  agora(): number
  agendar(fn: () => void, ms: number): unknown
  cancelar(marca: unknown): void
}

/** O que a escrita em curso deve fazer ao terminar: seguir, largar o temporário (a saída já gravou) ou apagar (página removida). */
export type SituacaoDaEscrita = 'vale' | 'largar' | 'apagar'

export type EscritaDeDados = (id: string, texto: string, situacao: () => SituacaoDaEscrita) => Promise<void>

export interface DescargaDeDados {
  /** Dados novos de `id`: vão ao disco no próximo horário livre; o que chegar antes disso substitui (o último ganha). */
  marcar(id: string, dados: Readonly<Record<string, unknown>>): void
  /** A página fechou: grava já o que está pendente de `id`, sem esperar o intervalo. */
  ja(id: string): void
  /** Página removida: nada pendente de `id` vai mais ao disco, e a escrita em curso apaga o que pôs. */
  esquecer(id: string): void
  /** Saída do app: grava síncrono o último de cada página que ainda não está no disco; depois disso, nada mais. */
  encerrar(escreverSincrono: (id: string, texto: string) => void): void
  /** Páginas com algo ainda fora do disco. */
  pendentes(): string[]
}

/**
 * Dados da página vão ao disco **fora do thread do main e com taxa** (revisão 195, item 4): `marcar` só guarda o
 * objeto (o JSON é feito na hora de escrever), uma escrita por página de cada vez, no mínimo `DESCARGA_MIN_MS` entre
 * duas e no máximo `DESCARGA_BYTES_POR_MINUTO`. Quem grava 10 vezes por segundo gera uma escrita a cada 2 s (ou a
 * cada minuto, se o JSON tiver 1 MB), sempre com o último valor. Escrita que falha não se repete sozinha: fica
 * pendente para o próximo `marcar`, `ja` ou `encerrar` (sem laço de retentativa).
 */
export function criarDescarga(escrever: EscritaDeDados, relogio: RelogioDaDescarga): DescargaDeDados {
  interface Estado {
    ultimo?: Readonly<Record<string, unknown>>
    noDisco?: Readonly<Record<string, unknown>>
    escrevendo: boolean
    marca?: unknown
    livreEm: number
    ja: boolean
    falhou: boolean
  }
  const estados = new Map<string, Estado>()
  let encerrada = false

  const pendente = (e: Estado): boolean => e.ultimo !== undefined && e.ultimo !== e.noDisco

  function agendar(id: string, e: Estado): void {
    if (encerrada || e.escrevendo || e.marca !== undefined || !pendente(e) || e.falhou) return
    const espera = e.ja ? 0 : Math.max(0, e.livreEm - relogio.agora())
    e.marca = relogio.agendar(() => {
      e.marca = undefined
      void descer(id, e)
    }, espera)
  }

  async function descer(id: string, e: Estado): Promise<void> {
    if (encerrada || e.escrevendo || estados.get(id) !== e || !pendente(e)) return
    const dados = e.ultimo!
    const texto = JSON.stringify(dados)
    const inicio = relogio.agora()
    e.escrevendo = true
    e.ja = false
    try {
      await escrever(id, texto, () => (estados.get(id) !== e ? 'apagar' : encerrada ? 'largar' : 'vale'))
      // depois de `encerrar`, quem vale no disco é o que a saída gravou
      if (!encerrada) e.noDisco = dados
    } catch {
      e.falhou = true
    } finally {
      e.escrevendo = false
      e.livreEm = inicio + Math.max(DESCARGA_MIN_MS, Math.ceil((texto.length * 60_000) / DESCARGA_BYTES_POR_MINUTO))
      if (estados.get(id) === e) agendar(id, e)
    }
  }

  return {
    marcar(id, dados) {
      const e = estados.get(id) ?? { escrevendo: false, livreEm: 0, ja: false, falhou: false }
      estados.set(id, e)
      e.ultimo = dados
      e.falhou = false
      agendar(id, e)
    },
    ja(id) {
      const e = estados.get(id)
      if (!e) return
      e.ja = true
      e.falhou = false
      if (e.marca !== undefined) relogio.cancelar(e.marca)
      e.marca = undefined
      agendar(id, e)
    },
    esquecer(id) {
      const e = estados.get(id)
      if (e?.marca !== undefined) relogio.cancelar(e.marca)
      estados.delete(id)
    },
    encerrar(escreverSincrono) {
      if (encerrada) return
      encerrada = true
      for (const [id, e] of estados) {
        if (e.marca !== undefined) relogio.cancelar(e.marca)
        e.marca = undefined
        if (!pendente(e)) continue
        try {
          escreverSincrono(id, JSON.stringify(e.ultimo))
          e.noDisco = e.ultimo
        } catch {
          // disco recusou na saída: o que estava no arquivo antes continua lá
        }
      }
    },
    pendentes: () => [...estados].filter(([, e]) => pendente(e)).map(([id]) => id)
  }
}

// ---------------------------------------------------------------- o registro (paginas.json)

export type IconeDePagina = { tipo: 'lucide'; nome: string } | { tipo: 'imagem'; dataUrl: string }

export interface CordaDePagina {
  espacoId: string
  cartaoId: string
}

export interface QuedaDePagina {
  motivo: MotivoDeQueda
  em: number
}

export type MotivoDeQueda = 'travou' | 'memoria' | 'cpu' | 'caiu'

export interface PaginaRegistrada {
  id: string
  nome: string
  versao: string
  descricao: string
  icone: IconeDePagina | null
  /** pasta de onde foi copiada (o "Atualizar da pasta" relê dela) */
  origem: string
  /** sha256 da árvore aceita */
  hash: string
  pedidas: string[]
  aceitas: string[]
  recusadas: string[]
  cordas: CordaDePagina[]
  desligada?: { motivo: 'usuario' | 'quedas'; em: number }
  quedas: QuedaDePagina[]
  instaladaEm: number
  atualizadaEm: number
}

export interface RegistroDePaginas {
  formato: 1
  /** a chave geral "Páginas próprias (experimental)", desligada de fábrica */
  ligadas: boolean
  paginas: PaginaRegistrada[]
}

export const registroVazio = (): RegistroDePaginas => ({ formato: FORMATO_DO_REGISTRO, ligadas: false, paginas: [] })

const listaDeTextos = (v: unknown, max: number): string[] | null =>
  Array.isArray(v) && v.length <= max && v.every((x) => typeof x === 'string' && x.length <= 300) ? (v as string[]) : null

const UUID = /^[0-9a-f-]{36}$/

function lerIcone(v: unknown): IconeDePagina | null {
  if (!objetoSimples(v)) return null
  if (v.tipo === 'lucide' && (ICONES_LUCIDE as readonly string[]).includes(String(v.nome))) return { tipo: 'lucide', nome: String(v.nome) }
  if (v.tipo === 'imagem' && typeof v.dataUrl === 'string' && /^data:image\/(svg\+xml|png);base64,[A-Za-z0-9+/=]+$/.test(v.dataUrl) && v.dataUrl.length < LIMITES.icone * 2) {
    return { tipo: 'imagem', dataUrl: v.dataUrl }
  }
  return null
}

function lerPagina(v: unknown): PaginaRegistrada | null {
  if (!objetoSimples(v)) return null
  const pedidas = listaDeTextos(v.pedidas, 20)
  const aceitas = listaDeTextos(v.aceitas, 20)
  const recusadas = listaDeTextos(v.recusadas, 20)
  if (typeof v.id !== 'string' || !ID_DE_PAGINA.test(v.id)) return null
  if (typeof v.nome !== 'string' || !v.nome || v.nome.length > LIMITES.nome || !nomeVisivel(v.nome)) return null
  if (typeof v.versao !== 'string' || !VERSAO.test(v.versao)) return null
  if (typeof v.origem !== 'string' || typeof v.hash !== 'string' || !/^[0-9a-f]{64}$/.test(v.hash)) return null
  if (!pedidas || !aceitas || !recusadas || [...pedidas, ...aceitas, ...recusadas].some((f) => !lerPermissao(f))) return null
  const cordas = Array.isArray(v.cordas)
    ? v.cordas
        .filter((c): c is CordaDePagina => objetoSimples(c) && UUID.test(String(c.espacoId)) && typeof c.cartaoId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(c.cartaoId))
        .slice(0, LIMITES.cordas)
        .map((c) => ({ espacoId: c.espacoId, cartaoId: c.cartaoId }))
    : []
  const quedas = Array.isArray(v.quedas)
    ? v.quedas
        .filter((q): q is QuedaDePagina => objetoSimples(q) && ['travou', 'memoria', 'cpu', 'caiu'].includes(String(q.motivo)) && Number.isFinite(q.em))
        .slice(-10)
        .map((q) => ({ motivo: q.motivo, em: q.em }))
    : []
  const motivoDesligada = objetoSimples(v.desligada) ? v.desligada.motivo : undefined
  const desligada: PaginaRegistrada['desligada'] =
    objetoSimples(v.desligada) && (motivoDesligada === 'usuario' || motivoDesligada === 'quedas') && Number.isFinite(v.desligada.em)
      ? { motivo: motivoDesligada, em: v.desligada.em as number }
      : undefined
  return {
    id: v.id,
    nome: v.nome,
    versao: v.versao,
    descricao: typeof v.descricao === 'string' ? v.descricao.slice(0, LIMITES.descricao) : '',
    icone: lerIcone(v.icone),
    origem: v.origem,
    hash: v.hash,
    pedidas,
    aceitas,
    recusadas,
    cordas,
    ...(desligada ? { desligada } : {}),
    quedas,
    instaladaEm: Number.isFinite(v.instaladaEm) ? (v.instaladaEm as number) : 0,
    atualizadaEm: Number.isFinite(v.atualizadaEm) ? (v.atualizadaEm as number) : 0
  }
}

export type RegistroLido =
  | { estado: 'ok'; registro: RegistroDePaginas; descartadas: number }
  /** JSON quebrado ou não é registro: começa vazio e o main guarda uma cópia `.ruim` */
  | { estado: 'ruim'; registro: RegistroDePaginas }
  /** de uma versão mais nova do app: lê nada e não grava por cima (tudo desligado) */
  | { estado: 'versao-maior'; registro: RegistroDePaginas }

/** Registro lido do disco: não confiável. Página com campo inválido sai (e é contada); o resto continua. */
export function lerRegistro(texto: string | null): RegistroLido {
  if (texto === null) return { estado: 'ok', registro: registroVazio(), descartadas: 0 }
  let bruto: unknown
  try {
    bruto = JSON.parse(texto)
  } catch {
    return { estado: 'ruim', registro: registroVazio() }
  }
  if (!objetoSimples(bruto) || typeof bruto.formato !== 'number' || !Array.isArray(bruto.paginas)) return { estado: 'ruim', registro: registroVazio() }
  if (bruto.formato > FORMATO_DO_REGISTRO) return { estado: 'versao-maior', registro: registroVazio() }
  if (bruto.formato !== FORMATO_DO_REGISTRO) return { estado: 'ruim', registro: registroVazio() }
  const paginas: PaginaRegistrada[] = []
  let descartadas = 0
  for (const p of bruto.paginas.slice(0, LIMITES.paginas * 2)) {
    const lida = lerPagina(p)
    if (!lida || paginas.some((x) => x.id === lida.id) || paginas.length >= LIMITES.paginas) descartadas++
    else paginas.push(lida)
  }
  return { estado: 'ok', registro: { formato: 1, ligadas: bruto.ligadas === true, paginas }, descartadas }
}

// ---------------------------------------------------------------- quedas

export const QUEDAS_PARA_DESLIGAR = 3
export const JANELA_DE_QUEDAS = 10 * 60_000

/** Anota a queda; 3 em 10 min desligam a página até o usuário religar. */
export function anotarQueda(p: PaginaRegistrada, motivo: MotivoDeQueda, agora: number): PaginaRegistrada {
  const quedas = [...p.quedas, { motivo, em: agora }].slice(-10)
  const recentes = quedas.filter((q) => agora - q.em <= JANELA_DE_QUEDAS)
  return recentes.length >= QUEDAS_PARA_DESLIGAR && !p.desligada ? { ...p, quedas, desligada: { motivo: 'quedas', em: agora } } : { ...p, quedas }
}

// ---------------------------------------------------------------- resposta de agente

/** `ork pagina responder <nome|id>`: acha a página (id exato, ou nome sem caixa) e confere a corda. */
export function decidirResposta(
  paginas: readonly PaginaRegistrada[],
  quem: string,
  eu: { espacoId: string; id: string }
): Resultado<PaginaRegistrada> {
  const alvo = quem.trim()
  const p = paginas.find((x) => x.id === alvo) ?? paginas.find((x) => x.nome.toLocaleLowerCase('pt-BR') === alvo.toLocaleLowerCase('pt-BR'))
  if (!p) return falha(`não existe página "${alvo.slice(0, 40)}". As páginas: ${paginas.map((x) => `"${x.nome}"`).join(', ') || 'nenhuma'}`)
  if (!p.cordas.some((c) => c.espacoId === eu.espacoId && c.cartaoId === eu.id)) return falha(`Você não está ligado à página "${p.nome}".`)
  return { ok: true, valor: p }
}
