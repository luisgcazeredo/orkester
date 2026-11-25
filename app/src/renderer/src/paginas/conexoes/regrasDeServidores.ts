// Conexões › MCP › Servidores de fora (1.9.7, C4): as regras puras da tela (situação em português, o comando inteiro à
// vista, o formulário de cadastro e o que ele manda, o rótulo de cada ferramenta). Sem React e sem DOM: a
// `regrasDeServidores.prova` roda no Node. A validação de verdade é do main (`main/mcpFora/registro.ts`); aqui só se
// repete o mínimo para dizer em português o que falta antes da viagem.
import type { FerramentaMcp, PedidoDeServidorMcp, ResumoDeServidorMcp, ServidorParaImportar, SituacaoDoServidorMcp } from '../../../../shared/api'
import type { CredencialVisivel } from '../../../../shared/fluxos/credenciais'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { hostPermitido, montarCabecalho } from '../../../../shared/fluxos/credenciais.ts'

export type Tom = 'vivo' | 'atencao' | 'perigo' | 'neutro'

/** O aviso do servidor local: ele roda com tudo o que o seu usuário do Windows pode. */
export const AVISO_DO_STDIO = 'Roda no seu PC com os seus poderes: o mesmo que você faria digitando este comando no terminal. Cadastre só programa em que você confia.'

export const AVISO_DE_LOGIN = 'Precisa de login (chega na 1.9.8)'

/** Situação do servidor → selo (tom e texto). */
export function seloDoServidor(s: Pick<ResumoDeServidorMcp, 'situacao' | 'pausado'>): { tom: Tom; texto: string } {
  const tabela: Record<SituacaoDoServidorMcp, { tom: Tom; texto: string }> = {
    parado: { tom: 'neutro', texto: 'Parado (sobe quando alguém usa)' },
    subindo: { tom: 'atencao', texto: 'Subindo…' },
    vivo: { tom: 'vivo', texto: 'Ligado' },
    pausado: { tom: 'neutro', texto: 'Pausado' },
    'precisa-login': { tom: 'atencao', texto: AVISO_DE_LOGIN },
    erro: { tom: 'perigo', texto: 'Com erro' }
  }
  if (s.situacao === 'pausado' && s.pausado?.motivo === 'quedas') return { tom: 'perigo', texto: 'Pausado (3 quedas em 10 minutos)' }
  return tabela[s.situacao] ?? { tom: 'neutro', texto: s.situacao }
}

/** Um argumento como o terminal o mostraria: com aspas se tiver espaço ou aspas. */
const argumentoParaMostrar = (a: string): string => (a === '' || /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)

/** O comando inteiro, numa linha, como vai rodar. */
export const comandoInteiro = (comando: string, args: readonly string[]): string => [comando, ...args].map(argumentoParaMostrar).join(' ')

/** Os argumentos de um texto de várias linhas (um por linha; linha vazia é ignorada). */
export const argsDoTexto = (texto: string): string[] => texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

// ---------------------------------------------------------------- o formulário de cadastro

export interface LinhaDeVariavel {
  nome: string
  /** `texto`: valor à vista (não secreto); `segredo`: uma credencial do tipo Segredo, escolhida por id. */
  modo: 'texto' | 'segredo'
  valor: string
  credencialId: string
}

export interface LinhaDeCabecalho {
  /** o id da credencial; o NOME do cabeçalho vem dela */
  credencialId: string
}

export interface FormularioDeServidor {
  transporte: 'stdio' | 'http'
  nome: string
  comando: string
  /** um argumento por linha */
  args: string
  pasta: string
  variaveis: LinhaDeVariavel[]
  url: string
  cabecalhos: LinhaDeCabecalho[]
}

export const FORMULARIO_DE_SERVIDOR_VAZIO: FormularioDeServidor = {
  transporte: 'stdio', nome: '', comando: '', args: '', pasta: '', variaveis: [], url: '', cabecalhos: []
}

export const NOVA_VARIAVEL: LinhaDeVariavel = { nome: '', modo: 'segredo', valor: '', credencialId: '' }

/** O formulário de um servidor já cadastrado (editar). */
export function formularioDoServidor(s: ResumoDeServidorMcp): FormularioDeServidor {
  if (s.transporte === 'stdio') {
    return {
      ...FORMULARIO_DE_SERVIDOR_VAZIO,
      transporte: 'stdio',
      nome: s.nome,
      comando: s.comando,
      args: s.args.join('\n'),
      pasta: s.pasta ?? '',
      variaveis: [
        ...Object.entries(s.envTexto ?? {}).map(([nome, valor]) => ({ nome, modo: 'texto' as const, valor, credencialId: '' })),
        ...Object.entries(s.envCredencial ?? {}).map(([nome, credencialId]) => ({ nome, modo: 'segredo' as const, valor: '', credencialId }))
      ]
    }
  }
  return {
    ...FORMULARIO_DE_SERVIDOR_VAZIO,
    transporte: 'http',
    nome: s.nome,
    url: s.url,
    cabecalhos: Object.values(s.cabecalhos ?? {}).map((credencialId) => ({ credencialId }))
  }
}

/** O que falta para cadastrar (a primeira coisa) ou o pedido pronto. O main revalida tudo. */
export function pedidoDoFormulario(f: FormularioDeServidor, credenciais: readonly CredencialVisivel[] | null | undefined): PedidoDeServidorMcp | { erro: string } {
  const nome = f.nome.trim()
  if (!nome) return { erro: 'Falta: dê um nome ao servidor.' }
  if (f.transporte === 'http') {
    const url = f.url.trim()
    if (!url) return { erro: 'Falta: a URL do servidor (https://…).' }
    const cabecalhos: Record<string, string> = {}
    for (const linha of f.cabecalhos) {
      if (!linha.credencialId) return { erro: 'Falta: escolha a API de cada cabeçalho (ou tire a linha).' }
      const c = credenciais?.find((x) => x.id === linha.credencialId)
      if (!c) return { erro: 'Uma API escolhida não existe mais: escolha outra.' }
      const nomeDoCabecalho = cabecalhoDaCredencial(c)
      if (nomeDoCabecalho.toLowerCase() in minusculas(cabecalhos)) return { erro: `O cabeçalho ${nomeDoCabecalho} aparece duas vezes.` }
      cabecalhos[nomeDoCabecalho] = c.id
    }
    return { transporte: 'http', nome, url, ...(Object.keys(cabecalhos).length ? { cabecalhos } : {}) }
  }
  const comando = f.comando.trim()
  if (!comando) return { erro: 'Falta: o comando (ex.: npx).' }
  const envTexto: Record<string, string> = {}
  const envCredencial: Record<string, string> = {}
  const vistos = new Set<string>()
  for (const v of f.variaveis) {
    const n = v.nome.trim()
    if (!n) return { erro: 'Falta: dê o nome de cada variável (ou tire a linha).' }
    if (vistos.has(n.toUpperCase())) return { erro: `A variável ${n} aparece duas vezes.` }
    vistos.add(n.toUpperCase())
    if (v.modo === 'segredo') {
      if (!v.credencialId) return { erro: `Falta: escolha o segredo da variável ${n}.` }
      envCredencial[n] = v.credencialId
    } else {
      envTexto[n] = v.valor
    }
  }
  const pasta = f.pasta.trim()
  return {
    transporte: 'stdio',
    nome,
    comando,
    args: argsDoTexto(f.args),
    ...(pasta ? { pasta } : {}),
    ...(Object.keys(envTexto).length ? { envTexto } : {}),
    ...(Object.keys(envCredencial).length ? { envCredencial } : {})
  }
}

const minusculas = (o: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]))

/** O nome do cabeçalho em que a credencial vai (`Authorization` para token e Basic). */
export const cabecalhoDaCredencial = (c: Pick<CredencialVisivel, 'tipo' | 'cabecalho'>): string => montarCabecalho(c, 'x').cabecalho.nome

/** O host da URL digitada, se for uma URL; senão vazio (o formulário ainda está sendo escrito). */
export function hostDaUrl(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** Credenciais que podem ir num cabeçalho deste servidor: não são Segredo e têm domínio que cobre o host. */
export const credenciaisParaCabecalho = <C extends Pick<CredencialVisivel, 'tipo' | 'dominios'>>(credenciais: readonly C[] | null | undefined, url: string): C[] => {
  const host = hostDaUrl(url)
  return host ? (credenciais ?? []).filter((c) => c.tipo !== 'segredo' && hostPermitido(host, c.dominios)) : []
}

/** Credenciais do tipo Segredo (as únicas que vão para variável de ambiente). */
export const segredosDisponiveis = <C extends Pick<CredencialVisivel, 'tipo'>>(credenciais: readonly C[] | null | undefined): C[] => (credenciais ?? []).filter((c) => c.tipo === 'segredo')

// ---------------------------------------------------------------- ferramentas

/** O rótulo de uma ferramenta: o que o servidor DIZ (palavra dele, não garantia) ou "pode mudar coisas" (sem anotação conta como mudar). */
export function rotuloDaFerramenta(f: Pick<FerramentaMcp, 'anotacoes'>): { texto: string; perigo: boolean } {
  return f.anotacoes?.readOnlyHint === true ? { texto: 'diz que só lê (palavra do servidor)', perigo: false } : { texto: 'pode mudar coisas', perigo: true }
}

/** Descrição curta para a lista (uma linha, até `max` letras). */
export function descricaoCurta(texto: string, max = 160): string {
  const linha = texto.replace(/\s+/g, ' ').trim()
  return [...linha].length > max ? `${[...linha].slice(0, max - 1).join('').trimEnd()}…` : linha
}

/**
 * O que o servidor diz de uma ferramenta, marcado como DELE: entre aspas e com "o servidor diz:", para não se passar por um
 * rótulo do Orkester (a descrição é texto livre de terceiro). Vazio se ele não disse nada.
 */
export const descricaoDoServidor = (descricao: string): string => (descricao.trim() ? `o servidor diz: “${descricao.trim()}”` : '')

/** A frase do aviso de ferramentas mudadas. */
export function textoDasMudadas(mudadas: readonly string[]): string {
  const lista = mudadas.length > 5 ? `${mudadas.slice(0, 5).join(', ')} e mais ${mudadas.length - 5}` : mudadas.join(', ')
  const uma = mudadas.length === 1
  return `${uma ? 'Esta ferramenta mudou' : 'Estas ferramentas mudaram'} desde a última revisão: ${lista}. ${uma ? 'Ela fica bloqueada' : 'Elas ficam bloqueadas'} nos fluxos e nas páginas até você rever.`
}

// ---------------------------------------------------------------- importar

/** Uma linha da lista de importação: já marcada se não existe um com o nome (e não precisa de login). */
export const marcadoNaImportacao = (s: Pick<ServidorParaImportar, 'jaExiste'>): boolean => !s.jaExiste

/** O que a importação vai fazer com os segredos, em português. */
export function textoDosSecretos(secretos: readonly string[]): string {
  if (!secretos.length) return ''
  return `${secretos.length === 1 ? 'Vira segredo cifrado' : 'Viram segredos cifrados'}: ${secretos.join(', ')}.`
}

/** O nome do que o servidor cita (ou "segredo apagado" / "API apagada", conforme `qual`) para mostrar no cartão. */
export function nomeDaCredencial(id: string, credenciais: readonly Pick<CredencialVisivel, 'id' | 'nome'>[] | null | undefined, qual: 'API' | 'segredo' = 'API'): { nome: string; existe: boolean } {
  const c = credenciais?.find((x) => x.id === id)
  return c ? { nome: c.nome, existe: true } : { nome: qual === 'API' ? 'API apagada' : 'segredo apagado', existe: false }
}
