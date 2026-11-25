// Fluxos (1.9.6): as credenciais do nó HTTP, a parte pura (plano §4). São GLOBAIS (valem em todos os espaços, como a
// página Conexões) e moram em `~/.orkester/credenciais.json`, cada valor cifrado pelo cofre do sistema (o `safeStorage`
// do Electron, posto pelo main em `main/fluxos/credenciais.ts`). Aqui: validar o que a tela manda, montar o arquivo,
// conferir o arquivo lido do disco e decidir se um pedido pode levar a credencial.
//
// Regras: o valor nunca volta para a tela (depois de salvo, só os 4 últimos caracteres, em `fim`); não há verbo de `ork`
// nem ferramenta MCP para credencial; fluxo, exportação e execução só levam o NOME. Na hora do pedido, a credencial só
// vai por `https` e só para um host da lista `dominios` dela (nome exato ou `*.dominio`, que vale para os subdomínios).
// Apagar uma credencial em uso não mexe nos fluxos: o próximo pedido dá "credencial X não existe".

export type TipoDeCredencial = 'cabecalho' | 'bearer' | 'basic' | 'segredo'
/** Os tipos que vão num cabeçalho HTTP (o formulário do nó HTTP e do aceite de página oferece só estes). */
export const TIPOS_DE_CREDENCIAL: readonly TipoDeCredencial[] = ['cabecalho', 'bearer', 'basic']
/**
 * (1.9.7) `segredo`: um valor cifrado SEM domínio, para variável de ambiente de servidor MCP stdio (a chave do n8n-mcp,
 * por exemplo). Nunca vai em cabeçalho nem em pedido HTTP (`conferirDestino` recusa). Na tela, só a partir da C4.
 */
export const TIPOS_TODOS: readonly TipoDeCredencial[] = ['cabecalho', 'bearer', 'basic', 'segredo']

/** O mesmo teto do nome de credencial no nó HTTP (`shared/fluxos/nos.ts`, `MAX_NOME` das automações). */
export const MAX_NOME_DA_CREDENCIAL = 80
export const MAX_CREDENCIAIS = 100
export const MAX_DOMINIOS = 20
export const MAX_VALOR = 8192
/** Igual ao `MIN_SEGREDO` do executor: valor mais curto não seria trocado por `•••` nas execuções. */
export const MIN_VALOR = 4
/** Valor mais curto que isto não mostra nem o fim (mostrar 4 de 6 seria mostrar quase tudo). */
export const MIN_PARA_MOSTRAR_FIM = 8

/** Como fica no disco. `cifrado` é o `safeStorage.encryptString(valor)` em base64. */
export interface CredencialGuardada {
  id: string
  nome: string
  tipo: TipoDeCredencial
  /** Só no tipo `cabecalho`: o nome do cabeçalho (ex.: `X-Api-Key`). */
  cabecalho?: string
  /** Vazio só no tipo `segredo` (que não tem domínio). */
  dominios: string[]
  /**
   * (1.9.7) `true`: a API só lê (GET e HEAD) e vale como teto para páginas e para o nó HTTP. Ausente = "lê e escreve"
   * (como toda credencial da 1.9.6). Nunca existe em `segredo`.
   */
  soLeitura?: true
  /** Os 4 últimos caracteres do valor ('' se o valor é curto). */
  fim: string
  cifrado: string
  criadaEm: string
  editadaEm: string
}

/** O que sai do main: tudo menos o `cifrado`. É a única forma que a tela, o IPC e as provas veem. */
export type CredencialVisivel = Omit<CredencialGuardada, 'cifrado'>

export interface ArquivoDeCredenciais {
  versao: 1
  itens: CredencialGuardada[]
}

export const ARQUIVO_VAZIO: ArquivoDeCredenciais = { versao: 1, itens: [] }

export interface ListaDeCredenciais {
  itens: CredencialVisivel[]
  /** `false`: o cofre do sistema não está disponível; criar e trocar valor são recusados. */
  cifraDisponivel: boolean
}

/** O que a tela manda para criar. O valor vai só neste sentido (tela → main) e só nesta hora. */
export interface PedidoDeCredencial {
  nome: string
  tipo: TipoDeCredencial
  cabecalho?: string
  dominios: string[]
  /** (1.9.7) `true`: só lê (GET, HEAD). Ausente ou `false`: lê e escreve. */
  soLeitura?: boolean
  /** `bearer` e `cabecalho`: o token. `basic`: `usuario:senha`. `segredo`: o valor da variável. */
  valor: string
}

/** Editar não troca o valor (isso é `trocarValor`). Campo ausente fica como está. */
export type MudancasDaCredencial = Partial<Pick<PedidoDeCredencial, 'nome' | 'tipo' | 'cabecalho' | 'dominios' | 'soLeitura'>>

/**
 * `usadaEm` (1.9.7): só no `editar` com nome novo, quem citava o nome antigo (fluxos pelo nome, páginas e servidores),
 * para a tela avisar que eles param até serem ajustados.
 */
export type ResultadoDaCredencial = { ok: true; credencial: CredencialVisivel; usadaEm?: string[] } | { erro: string }
/** `usadaEm`: fluxos que citam a credencial pelo nome (não são mexidos; o próximo pedido deles dá erro claro). */
export type ResultadoDoApagar = { ok: true; usadaEm: string[] } | { erro: string }

/** O que o main põe no pedido HTTP, e os textos que a execução precisa trocar por `•••`. */
export interface CredencialParaPedido {
  cabecalho: { nome: string; valor: string }
  ocultar: string[]
}

// ---------------------------------------------------------------- validação

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const temControle = (s: string): boolean => /[\u0000-\u001f\u007f]/.test(s)

/** Nome de cabeçalho HTTP (token da RFC 9110). */
const TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/
/** Cabeçalhos que a credencial não pode ocupar: são do próprio protocolo. */
const CABECALHOS_PROIBIDOS = new Set([
  'host', 'content-length', 'transfer-encoding', 'connection', 'upgrade', 'te', 'trailer', 'keep-alive', 'expect',
  'proxy-authorization', 'proxy-connection'
])

const ROTULO = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/

/**
 * Normaliza e confere um domínio: minúsculas, sem ponto final, IDN em punycode. Aceita `api.exemplo.com` e
 * `*.exemplo.com` (o curinga vale para os subdomínios e precisa de pelo menos 2 rótulos depois dele). Recusa esquema,
 * caminho, porta, IP e `localhost`.
 */
export function dominioValido(bruto: unknown): string | { erro: string } {
  const pedido = typeof bruto === 'string' ? bruto.trim().toLowerCase().replace(/\.$/, '') : ''
  const ajuda = 'só o nome, como api.exemplo.com ou *.exemplo.com (sem https://, caminho nem porta)'
  if (!pedido) return { erro: `domínio vazio: ${ajuda}` }
  const curinga = pedido.startsWith('*.')
  const resto = curinga ? pedido.slice(2) : pedido
  if (!resto || /[/:?#@\s*\\]/.test(resto)) return { erro: `domínio "${pedido.slice(0, 80)}": ${ajuda}` }
  let host: string
  try {
    host = new URL(`https://${resto}/`).hostname.replace(/\.$/, '')
  } catch {
    return { erro: `domínio "${pedido.slice(0, 80)}": ${ajuda}` }
  }
  const rotulos = host.split('.')
  if (host.length > 253 || !rotulos.every((r) => ROTULO.test(r))) return { erro: `domínio "${pedido.slice(0, 80)}": ${ajuda}` }
  if (!/[a-z]/.test(rotulos[rotulos.length - 1])) return { erro: `domínio "${pedido.slice(0, 80)}": IP não vale, ${ajuda}` }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return { erro: `domínio "${pedido.slice(0, 80)}": endereço desta máquina ou da rede local não leva credencial` }
  }
  if (rotulos.length < 2) return { erro: `domínio "${pedido}": ${curinga ? 'curinga largo demais, ' : ''}${ajuda}` }
  return curinga ? `*.${host}` : host
}

/** Os domínios do tipo: `segredo` não tem (lista ausente ou vazia); os outros precisam de pelo menos 1. */
function dominiosDoTipo(tipo: TipoDeCredencial, bruto: unknown): string[] | { erro: string } {
  if (tipo !== 'segredo') return dominiosValidos(bruto)
  if (bruto === undefined || (Array.isArray(bruto) && !bruto.length)) return []
  return { erro: 'credencial do tipo segredo não tem domínio: ela só vai para variável de ambiente de servidor MCP' }
}

function dominiosValidos(bruto: unknown): string[] | { erro: string } {
  if (!Array.isArray(bruto) || !bruto.length) return { erro: 'diga pelo menos 1 domínio para onde a credencial pode ir' }
  if (bruto.length > MAX_DOMINIOS) return { erro: `no máximo ${MAX_DOMINIOS} domínios por credencial` }
  const saida: string[] = []
  for (const d of bruto) {
    const r = dominioValido(d)
    if (typeof r !== 'string') return r
    if (!saida.includes(r)) saida.push(r)
  }
  return saida
}

/**
 * (1.9.7) O nome como a página e o nome do encaixe se comparam: sem caixa, sem acento e sem espaço
 * (`"Click Up"` = `"clickup"` = `"Clíckup"`).
 */
export function nomeNormalizado(nome: string): string {
  return nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, '')
}

function nomeValido(bruto: unknown, outros: readonly CredencialGuardada[]): string | { erro: string } {
  const nome = typeof bruto === 'string' ? bruto.trim() : ''
  if (!nome) return { erro: 'dê um nome à credencial' }
  if (nome.length > MAX_NOME_DA_CREDENCIAL) return { erro: `nome com até ${MAX_NOME_DA_CREDENCIAL} caracteres` }
  if (temControle(nome)) return { erro: 'o nome não pode ter quebra de linha nem caractere de controle' }
  if (!nomeNormalizado(nome)) return { erro: 'dê um nome à credencial' }
  const igual = outros.find((c) => nomeNormalizado(c.nome) === nomeNormalizado(nome))
  if (igual) {
    return { erro: igual.nome.toLowerCase() === nome.toLowerCase() ? `já existe uma credencial "${nome}"` : `já existe "${igual.nome}", que tem o mesmo nome sem contar caixa, acento e espaço` }
  }
  return nome
}

function tipoECabecalho(tipo: unknown, cabecalho: unknown): { tipo: TipoDeCredencial; cabecalho?: string } | { erro: string } {
  if (typeof tipo !== 'string' || !TIPOS_TODOS.includes(tipo as TipoDeCredencial)) {
    return { erro: 'tipo: cabecalho, bearer, basic ou segredo' }
  }
  if (tipo !== 'cabecalho') return { tipo: tipo as TipoDeCredencial }
  const nome = typeof cabecalho === 'string' ? cabecalho.trim() : ''
  if (!TOKEN.test(nome)) return { erro: 'cabeçalho: diga o nome dele, como X-Api-Key (letras, números e - _ .)' }
  if (CABECALHOS_PROIBIDOS.has(nome.toLowerCase())) return { erro: `o cabeçalho "${nome}" é do próprio HTTP e não leva credencial` }
  return { tipo: 'cabecalho', cabecalho: nome }
}

/** (1.9.7) O campo `soLeitura` de um pedido: ausente/`false` = lê e escreve; `true` não vale em `segredo`. */
function soLeituraValido(bruto: unknown, tipo: TipoDeCredencial): boolean | { erro: string } {
  if (bruto === undefined || bruto === false) return false
  if (bruto !== true) return { erro: 'só lê: verdadeiro ou falso' }
  if (tipo === 'segredo') return { erro: 'credencial do tipo segredo não faz pedido HTTP, então não tem "só lê"' }
  return true
}

/** Confere o valor. Volta o valor aparado (as pontas em branco de quem colou não fazem parte do segredo). */
export function valorValido(bruto: unknown, tipo: TipoDeCredencial): string | { erro: string } {
  const valor = typeof bruto === 'string' ? bruto.trim() : ''
  if (!valor) return { erro: 'o valor está vazio' }
  if (valor.length < MIN_VALOR) return { erro: `o valor precisa de pelo menos ${MIN_VALOR} caracteres` }
  if (valor.length > MAX_VALOR) return { erro: `o valor passa de ${MAX_VALOR} caracteres` }
  if (temControle(valor)) return { erro: 'o valor não pode ter quebra de linha nem caractere de controle' }
  if (tipo === 'basic' && !/^[^:]+:.+$/.test(valor)) return { erro: 'no tipo basic o valor é usuario:senha' }
  if (tipo === 'bearer' && /^bearer\s/i.test(valor)) return { erro: 'cole só o token, sem a palavra Bearer' }
  return valor
}

/** Os 4 últimos caracteres, ou nada se o valor é curto. */
export function fimDoValor(valor: string): string {
  return valor.length >= MIN_PARA_MOSTRAR_FIM ? valor.slice(-4) : ''
}

// ---------------------------------------------------------------- operações sobre o arquivo

/** O que o main injeta: a cifra (o cofre do sistema), o relógio e o sorteio do id. */
export interface AmbienteDasCredenciais {
  cifrar: (valor: string) => string
  novoId: () => string
  agora: () => string
}

export const visivel = ({ cifrado: _cifrado, ...resto }: CredencialGuardada): CredencialVisivel => ({ ...resto, dominios: [...resto.dominios] })

export function paraMostrar(arquivo: ArquivoDeCredenciais): CredencialVisivel[] {
  return arquivo.itens.map(visivel).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function criarCredencial(
  arquivo: ArquivoDeCredenciais,
  pedido: unknown,
  amb: AmbienteDasCredenciais
): { arquivo: ArquivoDeCredenciais; credencial: CredencialGuardada } | { erro: string } {
  if (!ehObjeto(pedido)) return { erro: 'pedido inválido' }
  if (arquivo.itens.length >= MAX_CREDENCIAIS) return { erro: `no máximo ${MAX_CREDENCIAIS} credenciais` }
  const nome = nomeValido(pedido.nome, arquivo.itens)
  if (typeof nome !== 'string') return nome
  const tc = tipoECabecalho(pedido.tipo, pedido.cabecalho)
  if ('erro' in tc) return tc
  const dominios = dominiosDoTipo(tc.tipo, pedido.dominios)
  if ('erro' in dominios) return dominios
  const soLeitura = soLeituraValido(pedido.soLeitura, tc.tipo)
  if (typeof soLeitura !== 'boolean') return soLeitura
  const valor = valorValido(pedido.valor, tc.tipo)
  if (typeof valor !== 'string') return valor
  const agora = amb.agora()
  const credencial: CredencialGuardada = {
    id: amb.novoId(),
    nome,
    tipo: tc.tipo,
    ...(tc.cabecalho ? { cabecalho: tc.cabecalho } : {}),
    dominios,
    ...(soLeitura ? { soLeitura: true as const } : {}),
    fim: fimDoValor(valor),
    cifrado: amb.cifrar(valor),
    criadaEm: agora,
    editadaEm: agora
  }
  return { arquivo: { versao: 1, itens: [...arquivo.itens, credencial] }, credencial }
}

function trocarItem(arquivo: ArquivoDeCredenciais, id: unknown, novo: (c: CredencialGuardada) => CredencialGuardada | { erro: string }):
  { arquivo: ArquivoDeCredenciais; credencial: CredencialGuardada } | { erro: string } {
  const atual = arquivo.itens.find((c) => c.id === id)
  if (!atual) return { erro: 'essa credencial não existe mais' }
  const feito = novo(atual)
  if ('erro' in feito) return feito
  return { arquivo: { versao: 1, itens: arquivo.itens.map((c) => (c.id === atual.id ? feito : c)) }, credencial: feito }
}

/** Troca só o valor (cifra de novo e recalcula o `fim`). Nome, tipo e domínios ficam. */
export function trocarValorDaCredencial(arquivo: ArquivoDeCredenciais, id: unknown, valorBruto: unknown, amb: AmbienteDasCredenciais) {
  return trocarItem(arquivo, id, (atual) => {
    const valor = valorValido(valorBruto, atual.tipo)
    if (typeof valor !== 'string') return { erro: valor.erro }
    return { ...atual, fim: fimDoValor(valor), cifrado: amb.cifrar(valor), editadaEm: amb.agora() }
  })
}

/**
 * Nome, tipo, cabeçalho e domínios. Trocar o tipo de/para `basic` muda a forma do valor: aí pede `trocarValor`
 * (o valor velho não é aberto aqui para conferir).
 */
export function editarCredencial(arquivo: ArquivoDeCredenciais, id: unknown, mudancas: unknown, amb: Pick<AmbienteDasCredenciais, 'agora'>) {
  return trocarItem(arquivo, id, (atual) => {
    if (!ehObjeto(mudancas)) return { erro: 'pedido inválido' }
    const nome = 'nome' in mudancas ? nomeValido(mudancas.nome, arquivo.itens.filter((c) => c.id !== atual.id)) : atual.nome
    if (typeof nome !== 'string') return nome
    const tipoPedido = 'tipo' in mudancas ? mudancas.tipo : atual.tipo
    const cabecalhoPedido = 'cabecalho' in mudancas ? mudancas.cabecalho : atual.cabecalho
    const tc = tipoECabecalho(tipoPedido, cabecalhoPedido)
    if ('erro' in tc) return tc
    if ((tc.tipo === 'basic') !== (atual.tipo === 'basic')) {
      return { erro: 'para trocar de/para basic, apague e crie de novo (o valor muda de forma)' }
    }
    if ((tc.tipo === 'segredo') !== (atual.tipo === 'segredo')) {
      return { erro: 'para trocar de/para segredo, apague e crie de novo (segredo não vai em cabeçalho)' }
    }
    const dominios = 'dominios' in mudancas ? dominiosDoTipo(tc.tipo, mudancas.dominios) : atual.dominios
    if ('erro' in dominios) return dominios
    const soLeitura = 'soLeitura' in mudancas ? soLeituraValido(mudancas.soLeitura, tc.tipo) : atual.soLeitura === true
    if (typeof soLeitura !== 'boolean') return soLeitura
    const { cabecalho: _velho, soLeitura: _antes, ...semCabecalho } = atual
    return {
      ...semCabecalho,
      nome,
      tipo: tc.tipo,
      ...(tc.cabecalho ? { cabecalho: tc.cabecalho } : {}),
      dominios,
      ...(soLeitura ? { soLeitura: true as const } : {}),
      editadaEm: amb.agora()
    }
  })
}

export function apagarCredencial(arquivo: ArquivoDeCredenciais, id: unknown):
  { arquivo: ArquivoDeCredenciais; credencial: CredencialGuardada } | { erro: string } {
  const atual = arquivo.itens.find((c) => c.id === id)
  if (!atual) return { erro: 'essa credencial não existe mais' }
  return { arquivo: { versao: 1, itens: arquivo.itens.filter((c) => c.id !== atual.id) }, credencial: atual }
}

// ---------------------------------------------------------------- arquivo lido do disco (não confiável)

function itemValido(bruto: unknown): CredencialGuardada | null {
  if (!ehObjeto(bruto)) return null
  const { id, nome, tipo, cabecalho, dominios, soLeitura, fim, cifrado, criadaEm, editadaEm } = bruto
  if (typeof id !== 'string' || !id || id.length > 80) return null
  if (typeof nome !== 'string' || !nome.trim() || nome.length > MAX_NOME_DA_CREDENCIAL || temControle(nome)) return null
  const tc = tipoECabecalho(tipo, cabecalho)
  if ('erro' in tc) return null
  const ds = dominiosDoTipo(tc.tipo, dominios)
  if ('erro' in ds) return null
  if (typeof fim !== 'string' || fim.length > 4 || temControle(fim)) return null
  if (typeof cifrado !== 'string' || !cifrado || !/^[A-Za-z0-9+/]+=*$/.test(cifrado)) return null
  if (typeof criadaEm !== 'string' || typeof editadaEm !== 'string') return null
  // só `true` vale (e nunca em segredo); qualquer outra coisa, ou a falta do campo (arquivo da 1.9.6), é "lê e escreve"
  const soLe = soLeitura === true && tc.tipo !== 'segredo'
  return { id, nome, tipo: tc.tipo, ...(tc.cabecalho ? { cabecalho: tc.cabecalho } : {}), dominios: ds, ...(soLe ? { soLeitura: true as const } : {}), fim, cifrado, criadaEm, editadaEm }
}

/**
 * Confere o arquivo do disco item a item. `ruim`: algo foi deixado de fora (ou o arquivo inteiro não vale); quem
 * gravar por cima guarda antes uma cópia `.ruim`.
 */
export function lerArquivoDeCredenciais(bruto: unknown): { arquivo: ArquivoDeCredenciais; ruim: boolean } {
  if (!ehObjeto(bruto) || bruto.versao !== 1 || !Array.isArray(bruto.itens)) return { arquivo: ARQUIVO_VAZIO, ruim: true }
  const itens: CredencialGuardada[] = []
  let ruim = false
  for (const b of bruto.itens.slice(0, MAX_CREDENCIAIS)) {
    const c = itemValido(b)
    if (!c || itens.some((o) => o.id === c.id || o.nome.toLowerCase() === c.nome.toLowerCase())) ruim = true
    else itens.push(c)
  }
  if (bruto.itens.length > MAX_CREDENCIAIS) ruim = true
  return { arquivo: { versao: 1, itens }, ruim }
}

// ---------------------------------------------------------------- na hora do pedido

/** O host bate com a lista? Nome exato, ou `*.dominio` para os subdomínios (o próprio `dominio` precisa estar listado). */
export function hostPermitido(host: string, dominios: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (!h) return false
  return dominios.some((d) => (d.startsWith('*.') ? h.endsWith(d.slice(1)) && h.length > d.length - 1 : h === d))
}

/**
 * A credencial pode ir neste pedido? Só por `https` e só para um host da lista dela. O erro diz o porquê sem citar
 * nada do valor.
 */
export function conferirDestino(credencial: Pick<CredencialGuardada, 'nome' | 'dominios'> & { tipo?: TipoDeCredencial }, url: string): string | null {
  if (credencial.tipo === 'segredo') return `credencial ${credencial.nome}: é do tipo segredo e não vai em cabeçalho nem em pedido HTTP`
  let alvo: URL
  try {
    alvo = new URL(url)
  } catch {
    return `credencial ${credencial.nome}: o endereço do pedido não vale`
  }
  if (alvo.protocol !== 'https:') return `credencial ${credencial.nome}: só vai por https`
  if (!hostPermitido(alvo.hostname, credencial.dominios)) {
    return `credencial ${credencial.nome}: ${alvo.hostname} não está nos domínios dela (${credencial.dominios.join(', ')})`
  }
  return null
}

/** Os métodos que uma API "só lê" aceita. */
const METODOS_DE_LEITURA: readonly string[] = ['GET', 'HEAD']

/**
 * (1.9.7) A API "só lê" aceita este método? `null` = pode; senão, o motivo (nunca cita o valor). Sem método (quem não
 * sabe qual vai usar, como o cabeçalho de servidor MCP, que sempre faz POST e protege por ferramenta) não confere.
 */
export function conferirMetodo(credencial: Pick<CredencialGuardada, 'nome' | 'soLeitura'>, metodo?: string): string | null {
  if (!credencial.soLeitura || metodo === undefined) return null
  if (METODOS_DE_LEITURA.includes(metodo.trim().toUpperCase())) return null
  return `a API ${credencial.nome} só lê: mude em Conexões › APIs`
}

const base64Utf8 = (s: string): string => {
  let binario = ''
  for (const b of new TextEncoder().encode(s)) binario += String.fromCharCode(b)
  return btoa(binario)
}

/**
 * Monta o cabeçalho com o valor já aberto pelo main, e a lista do que a execução troca por `•••`: o valor, a forma
 * que vai no fio (`Bearer x`, o base64 do basic) e, no basic, a senha sozinha.
 */
export function montarCabecalho(credencial: Pick<CredencialGuardada, 'tipo' | 'cabecalho'>, valor: string): CredencialParaPedido {
  if (credencial.tipo === 'bearer') {
    return { cabecalho: { nome: 'Authorization', valor: `Bearer ${valor}` }, ocultar: [valor, `Bearer ${valor}`] }
  }
  if (credencial.tipo === 'basic') {
    const codificado = base64Utf8(valor)
    const senha = valor.slice(valor.indexOf(':') + 1)
    return { cabecalho: { nome: 'Authorization', valor: `Basic ${codificado}` }, ocultar: [valor, codificado, senha] }
  }
  return { cabecalho: { nome: credencial.cabecalho ?? '', valor }, ocultar: [valor] }
}

/** Erro padrão de quem cita pelo nome uma credencial que foi apagada (ou renomeada). */
export const credencialNaoExiste = (nome: string): string => `credencial ${nome} não existe (ela foi apagada ou renomeada em Conexões)`
