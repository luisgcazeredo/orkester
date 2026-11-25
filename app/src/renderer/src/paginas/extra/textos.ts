// Textos das páginas extras: o que cada permissão quer dizer em português claro (diálogo de aceite e Conexões),
// a diferença "pede permissão nova", os avisos da moldura, e (1.9.7) as APIs e os MCPs que a página enxerga. Puro (sem
// React, sem DOM): a `textos.prova` roda no Node. A regra de "quem atende a sugestão" é a do main (`candidatasDaSugestao`).
// Permissão é uma "ficha" de texto (shared/paginas.ts): `quadro`, `recado`, `rede:<host>`, `local:<porta><caminho>`. APIs
// e MCPs NÃO são fichas: moram nos `acessos` da página, que só o Luís marca (aceite e cartão).
import type { AcessoApi, AcessoMcp, AcessosDaPagina, FerramentaMcp, PedidoDaPagina, ResumoDeServidorMcp, SugestaoDePagina, UsoDaPagina } from '../../../../shared/api'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { candidatasDaSugestao, LIMITES_DE_ACESSO } from '../../../../shared/paginasAcessos.ts'
// @ts-expect-error idem
import { descricaoCurta, rotuloDaFerramenta } from '../conexoes/regrasDeServidores.ts'
import type { IconeDePagina, PaginaInstalada, PropostaDePagina } from './contrato'

export interface ItemDePermissao {
  /** A ficha, como o main a guarda e espera em `revogar`/`permitirDeNovo`. */
  ficha: string
  /** Nome curto (lista de Conexões, aviso "pede nova"). */
  rotulo: string
  /** A frase do diálogo de aceite. */
  texto: string
  /** `local` (lê algo deste PC) e ficha desconhecida: mostradas em vermelho. */
  perigo: boolean
}

/** O que toda página tem e não tem, peça ela o que pedir. */
export const SEMPRE: readonly string[] = [
  'guarda até 1 MB próprio',
  'não pode: ler arquivos, abrir programas, câmera/microfone, baixar, abrir janelas'
]

function juntar(partes: string[]): string {
  if (partes.length <= 1) return partes.join('')
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
}

/** A frase de uma ficha. Ficha que a tela não conhece aparece crua e em vermelho (nunca some do aceite). */
export function itemDePermissao(ficha: string): ItemDePermissao {
  if (ficha === 'quadro')
    return { ficha, rotulo: 'ver o quadro', texto: 'ver nomes e situação dos agentes deste espaço (nada da tela deles, nada dos seus arquivos)', perigo: false }
  if (ficha === 'recado')
    return { ficha, rotulo: 'mandar recados', texto: 'mandar recados aos agentes que você ligar a ela — eles podem trabalhar a partir disso', perigo: false }
  if (ficha.startsWith('rede:')) {
    const host = ficha.slice(5)
    return { ficha, rotulo: `falar com ${host}`, texto: `falar com ${host}: o que ela mostra pode vir de lá e o que ela guarda pode ir para lá`, perigo: false }
  }
  const local = /^local:(\d{1,5})(\/.*)$/.exec(ficha)
  if (local) {
    const endereco = `127.0.0.1:${local[1]}${local[2]}…`
    return { ficha, rotulo: `ler ${endereco}`, texto: `ler ${endereco} deste PC, só leitura`, perigo: true }
  }
  return { ficha, rotulo: `"${ficha}"`, texto: `permissão que o Orkester não reconhece: "${ficha}"`, perigo: true }
}

/** As fichas na ordem em que vieram (o main já as põe em quadro, recado, rede, local). */
export function itensDePermissao(fichas: readonly string[] | undefined): ItemDePermissao[] {
  return (fichas ?? []).map(itemDePermissao)
}

/** A frase da moldura quando a página não carrega até o usuário rever. Vazia: nada pendente. */
export function textoDePendencia(pendente: PaginaInstalada['pendente']): string {
  if (!pendente) return ''
  if (pendente.motivo === 'mudou-fora') return 'A página mudou fora do Orkester.'
  const novas = itensDePermissao(pendente.novas)
  return novas.length ? `Pede permissão nova: ${juntar(novas.map((i) => i.rotulo))}.` : 'Pede para ser revista.'
}

export interface CabecalhoDaProposta {
  titulo: string
  rotulo: string
  /** A linha que fecha o rótulo quando não há permissão (na mesma linha do rótulo, ou sozinha em `atualizacao`/`rever`). */
  vazio: string
  aviso: string
  botao: string
}

/** Título, rótulo da lista, aviso e botão do diálogo de aceite, por tipo de proposta. */
export function cabecalhoDaProposta(p: Pick<PropostaDePagina, 'tipo' | 'manifesto' | 'versaoAntes' | 'mudouFora'>): CabecalhoDaProposta {
  const nome = p.manifesto.nome
  if (p.tipo === 'nova') return { titulo: `Adicionar a página "${nome}"?`, rotulo: 'Permissões que o manifesto pede:', vazio: 'nenhuma além do básico:', aviso: '', botao: 'Adicionar e permitir' }
  if (p.tipo === 'atualizacao')
    return {
      titulo: `Atualizar "${nome}"?`,
      rotulo: 'Permissões novas que ela pede:',
      vazio: 'nenhuma permissão nova.',
      aviso: p.versaoAntes ? `Versão ${p.versaoAntes} → ${p.manifesto.versao}.` : '',
      botao: 'Atualizar e permitir'
    }
  if (p.mudouFora)
    return {
      titulo: `"${nome}" mudou fora do Orkester`,
      rotulo: 'Permissões novas que ela pede:',
      vazio: 'nenhuma permissão nova.',
      aviso: 'A cópia desta página foi alterada por fora do Orkester (talvez por um agente). Aceite só se você sabe o que mudou.',
      botao: 'Aceitar a mudança'
    }
  return { titulo: `"${nome}" pede permissão nova`, rotulo: 'Permissões novas que ela pede:', vazio: 'nenhuma permissão nova.', aviso: '', botao: 'Permitir e carregar' }
}

/** Tamanho legível: "830 B", "12 KB", "1,2 MB". */
export function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

const QUEDAS: Record<string, string> = {
  travou: 'travou',
  memoria: 'estourou memória',
  cpu: 'usou CPU demais',
  caiu: 'caiu sozinha'
}

/** "travou", "estourou memória"… — o motivo vem do main (`pagina-caiu`, `ultimaQueda`). */
export function motivoDaQueda(motivo: string): string {
  return Object.hasOwn(QUEDAS, motivo) ? QUEDAS[motivo] : 'parou'
}

/** "A página X travou e foi fechada." */
export function textoDaQueda(nome: string, motivo: string): string {
  return `A página "${nome}" ${motivoDaQueda(motivo)} e foi fechada.`
}

export function textoDeDesligada(motivo: string): string {
  return motivo === 'quedas' ? 'Desligada depois de 3 quedas em 10 minutos.' : 'Desligada por você.'
}

/** O aviso ao ligar a chave geral (§4). */
export const AVISO_DA_CHAVE =
  'Páginas próprias rodam código de fora dentro do Orkester, isoladas do seu PC. Só adicione páginas que você ou seu time escreveram.'

export type IconeNaTela = { tipo: 'lucide'; nome: string } | { tipo: 'imagem'; src: string } | { tipo: 'inicial'; letra: string }

// Só imagem embutida (o main já leu o arquivo): nenhum endereço de fora vira `<img src>` na janela do app.
const IMAGEM_EMBUTIDA = /^data:image\/(png|svg\+xml|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/

export const inicialDe = (nome: string): string => [...nome.trim()][0]?.toUpperCase() ?? '?'

/** Como desenhar o ícone: lucide (o componente confere a lista), imagem embutida, ou a inicial do nome. */
export function resolverIcone(icone: IconeDePagina | null | undefined, nome: string): IconeNaTela {
  if (icone?.tipo === 'lucide') return { tipo: 'lucide', nome: icone.nome }
  if (icone?.tipo === 'imagem' && IMAGEM_EMBUTIDA.test(icone.dataUrl)) return { tipo: 'imagem', src: icone.dataUrl }
  return { tipo: 'inicial', letra: inicialDe(nome) }
}

export interface LinhaDePermissao extends ItemDePermissao {
  recusada: boolean
}

/** Conexões: na ordem do pedido, as aceitas (com Revogar) e as revogadas (com Permitir de novo). As ainda não decididas ficam na pendência. */
export function linhasDePermissao(p: Pick<PaginaInstalada, 'pedidas' | 'aceitas' | 'recusadas'>): LinhaDePermissao[] {
  return p.pedidas
    .filter((f) => p.recusadas.includes(f) || p.aceitas.includes(f))
    .map((f) => ({ ...itemDePermissao(f), recusada: p.recusadas.includes(f) }))
}

// ---------- APIs e MCPs que a página enxerga (1.9.7, F1): aceite, cartão em Conexões, moldura ----------
// O Luís marca, por página, as APIs (com "também escreve" só se a API deixa) e os servidores MCP (por ferramenta). O
// manifesto só SUGERE (`SugestaoDePagina`): candidata única vem pré-marcada e com `atende`, para `pedir("eco")` achar a
// API. Sem sugestão, nada vem marcado. A regra de quem é candidata é a do main (`candidatasDaSugestao`).

/** Uma API como a tela a conhece (o `CredencialVisivel` serve; o Segredo não é API e fica de fora). */
export interface ApiDaTela {
  id: string
  nome: string
  dominios: string[]
  soLeitura?: boolean
}

/** Só o que a tela precisa saber de um servidor (o de `mcpFora.listar()`). */
export type ServidorParaEscolher = Pick<ResumoDeServidorMcp, 'id' | 'nome' | 'situacao'>

/** Um servidor que espera login (1.9.8) não dá para usar: fica na lista, mas não pode ser marcado. */
export const servidorEscolhivel = (s: Pick<ServidorParaEscolher, 'situacao'>): boolean => s.situacao !== 'precisa-login'

/** O nome do servidor com a situação que importa para escolher. */
export function rotuloDoServidor(s: ServidorParaEscolher): string {
  if (s.situacao === 'precisa-login') return `${s.nome} (precisa de login: ainda não dá para usar)`
  if (s.situacao === 'pausado') return `${s.nome} (pausado)`
  return s.nome
}

/** Uma lista de hosts em português: "a.com", "a.com e b.com". */
export const listaDeHosts = (hosts: readonly string[]): string => juntar([...hosts])

const escolhiveis = <S extends ServidorParaEscolher>(servidores: readonly S[]): S[] => servidores.filter(servidorEscolhivel)
const unicos = <T>(xs: readonly T[]): T[] => [...new Set(xs)]
const comAtende = <A extends { atende?: string[] }>(x: A, nomes: readonly string[]): A => {
  const todos = unicos([...(x.atende ?? []), ...nomes])
  const { atende: _velho, ...resto } = x
  return (todos.length ? { ...resto, atende: todos } : resto) as A
}

/** Os nomes do manifesto que esta API/servidor atende ao ser marcado: as sugestões que a têm como candidata. */
export function sugestoesQueAtende(
  id: string,
  tipo: 'api' | 'mcp',
  sugestoes: readonly SugestaoDePagina[],
  apis: readonly ApiDaTela[],
  servidores: readonly ServidorParaEscolher[],
  servidoresMarcados: readonly string[] = []
): string[] {
  return sugestoes.filter((s) => s.tipo === tipo && candidatasDaSugestao(s, apis, escolhiveis(servidores), servidoresMarcados).includes(id)).map((s) => s.encaixe)
}

const ferramentasSugeridas = (sugestoes: readonly SugestaoDePagina[], encaixes: readonly string[]): string[] =>
  unicos(sugestoes.flatMap((s) => (s.tipo === 'mcp' && encaixes.includes(s.encaixe) ? s.ferramentas : []))).slice(0, LIMITES_DE_ACESSO.ferramentas)

/**
 * A pré-marcação do aceite: parte do que a página já enxerga (`acessosAntes`) e, para cada sugestão ainda sem quem
 * atenda, marca a candidata ÚNICA com `atende` (API: só lendo, a escrita nunca vem da sugestão; MCP: as ferramentas
 * sugeridas). Duas candidatas ou nenhuma: nada. Uma API que já estava marcada ganha só o `atende` (a escrita dela não
 * sobe sozinha). Página com `rede`/`local` (`semAcessos`): nenhum.
 */
export function acessosIniciais(
  sugestoes: readonly SugestaoDePagina[] | undefined,
  antes: AcessosDaPagina | undefined,
  apis: readonly ApiDaTela[],
  servidores: readonly ServidorParaEscolher[],
  semAcessos?: string
): AcessosDaPagina {
  if (semAcessos) return {}
  let api: AcessoApi[] = (antes?.api ?? []).map((x) => ({ ...x }))
  let mcp: AcessoMcp[] = (antes?.mcp ?? []).map((x) => ({ ...x, ferramentas: [...x.ferramentas] }))
  for (const s of sugestoes ?? []) {
    if ([...api, ...mcp].some((x) => x.atende?.includes(s.encaixe))) continue
    const c = candidatasDaSugestao(s, apis, escolhiveis(servidores), mcp.map((x) => x.servidorId))
    if (c.length !== 1) continue
    const id = c[0]
    if (s.tipo === 'api') {
      const alvo = apis.find((a) => a.id === id)
      const ja = api.find((x) => x.apiId === id)
      if (ja) api = api.map((x) => (x === ja ? comAtende(x, [s.encaixe]) : x))
      else if (alvo && api.length < LIMITES_DE_ACESSO.apis) api = [...api, { apiId: id, escrita: false, atende: [s.encaixe] }]
    } else {
      const ja = mcp.find((x) => x.servidorId === id)
      if (ja) mcp = mcp.map((x) => (x === ja ? comAtende(x, [s.encaixe]) : x))
      else if (mcp.length < LIMITES_DE_ACESSO.servidores) mcp = [...mcp, { servidorId: id, ferramentas: s.ferramentas.slice(0, LIMITES_DE_ACESSO.ferramentas), atende: [s.encaixe] }]
    }
  }
  return { ...(api.length ? { api } : {}), ...(mcp.length ? { mcp } : {}) }
}

const limpar = (a: AcessosDaPagina): AcessosDaPagina => ({ ...(a.api?.length ? { api: a.api } : {}), ...(a.mcp?.length ? { mcp: a.mcp } : {}) })

/**
 * Marca uma API à mão. Atende as sugestões que a têm como candidata. Nasce só lendo: o manifesto é de terceiros e nunca
 * pré-marca "também escreve" (R5 · S1); quem liga a escrita é o usuário, na caixa vermelha.
 */
export function marcarApi(a: AcessosDaPagina, apiId: string, sugestoes: readonly SugestaoDePagina[], apis: readonly ApiDaTela[], servidores: readonly ServidorParaEscolher[]): AcessosDaPagina {
  const alvo = apis.find((x) => x.id === apiId)
  if (!alvo || a.api?.some((x) => x.apiId === apiId)) return a
  const atende = sugestoesQueAtende(apiId, 'api', sugestoes, apis, servidores)
  const novo: AcessoApi = { apiId, escrita: false, ...(atende.length ? { atende } : {}) }
  return limpar({ ...a, api: [...(a.api ?? []), novo] })
}

export const desmarcarApi = (a: AcessosDaPagina, apiId: string): AcessosDaPagina => limpar({ ...a, api: (a.api ?? []).filter((x) => x.apiId !== apiId) })

/** "Também escreve": só liga se a API deixa (API só lê, ou apagada, fica só leitura). */
export function mudarEscrita(a: AcessosDaPagina, apiId: string, escrita: boolean, apis: readonly ApiDaTela[]): AcessosDaPagina {
  const alvo = apis.find((x) => x.id === apiId)
  const pode = !!alvo && !alvo.soLeitura
  return { ...a, api: (a.api ?? []).map((x) => (x.apiId === apiId ? { ...x, escrita: escrita && pode } : x)) }
}

/** Marca um servidor (não o que espera login). Vêm marcadas só as ferramentas que o manifesto sugere para ele. */
export function marcarServidor(a: AcessosDaPagina, servidorId: string, sugestoes: readonly SugestaoDePagina[], apis: readonly ApiDaTela[], servidores: readonly ServidorParaEscolher[]): AcessosDaPagina {
  const alvo = servidores.find((s) => s.id === servidorId)
  if (!alvo || !servidorEscolhivel(alvo) || a.mcp?.some((x) => x.servidorId === servidorId)) return a
  const marcados = [...(a.mcp ?? []).map((x) => x.servidorId), servidorId]
  const atende = sugestoesQueAtende(servidorId, 'mcp', sugestoes, apis, servidores, marcados)
  const novo: AcessoMcp = { servidorId, ferramentas: ferramentasSugeridas(sugestoes, atende), ...(atende.length ? { atende } : {}) }
  return limpar({ ...a, mcp: [...(a.mcp ?? []), novo] })
}

export const desmarcarServidor = (a: AcessosDaPagina, servidorId: string): AcessosDaPagina => limpar({ ...a, mcp: (a.mcp ?? []).filter((x) => x.servidorId !== servidorId) })

/** Marca ou desmarca ferramentas de um servidor marcado (até 20). */
export function mudarFerramentas(a: AcessosDaPagina, servidorId: string, nomes: readonly string[], marcar: boolean): AcessosDaPagina {
  return {
    ...a,
    mcp: (a.mcp ?? []).map((x) => {
      if (x.servidorId !== servidorId) return x
      const ferramentas = marcar ? unicos([...x.ferramentas, ...nomes]).slice(0, LIMITES_DE_ACESSO.ferramentas) : x.ferramentas.filter((f) => !nomes.includes(f))
      return { ...x, ferramentas }
    })
  }
}

const nomesAtendidos = (a: AcessosDaPagina | undefined): string[] => [...(a?.api ?? []), ...(a?.mcp ?? [])].flatMap((x) => x.atende ?? [])

/** Nomes do manifesto atendidos por mais de uma API/servidor: Aceitar e Guardar desligam. */
export function conflitosDeAtende(a: AcessosDaPagina): string[] {
  const vistos = new Set<string>()
  const repetidos = new Set<string>()
  for (const n of nomesAtendidos(a)) (vistos.has(n) ? repetidos : vistos).add(n)
  return [...repetidos]
}

/** As sugestões sem ninguém marcado para atender: aviso âmbar, Aceitar segue ligado. */
export const sugestoesSemAtendimento = (sugestoes: readonly SugestaoDePagina[] | undefined, a: AcessosDaPagina): SugestaoDePagina[] =>
  (sugestoes ?? []).filter((s) => !nomesAtendidos(a).includes(s.encaixe))

export const textoDoConflito = (nome: string): string => `marque só uma para "${nome}"`
export const avisoSemAtendimento = (nome: string): string => `a página vai receber erro ao chamar "${nome}"`
export const textoDoAtende = (atende: readonly string[]): string => `a página chama de ${juntar(atende.map((n) => `"${n}"`))}`

/**
 * O que impede Aceitar/Guardar (a primeira coisa), ou ''. `lendo`: servidores marcados cujas ferramentas ainda não
 * voltaram (ninguém concede sem ver o rótulo de cada uma).
 */
export function faltaNosAcessos(a: AcessosDaPagina, lendo: readonly string[] = []): string {
  const conflito = conflitosDeAtende(a)[0]
  if (conflito) return textoDoConflito(conflito)
  if ((a.api?.length ?? 0) > LIMITES_DE_ACESSO.apis) return `no máximo ${LIMITES_DE_ACESSO.apis} APIs por página`
  if ((a.mcp?.length ?? 0) > LIMITES_DE_ACESSO.servidores) return `no máximo ${LIMITES_DE_ACESSO.servidores} servidores MCP por página`
  if (lendo.length) return `lendo as ferramentas de ${juntar([...lendo])}: espere para ver o que cada uma faz`
  return ''
}

/**
 * O que vai ao main. Ferramenta que o servidor (já listado) não tem sai; se ele nunca listou, fica a marcada. Ids e
 * nomes, nada mais.
 */
export function acessosParaEnviar(a: AcessosDaPagina, conhecidas: Readonly<Record<string, readonly FerramentaMcp[] | undefined>>): AcessosDaPagina {
  const mcp = (a.mcp ?? []).map((x) => {
    const lista = conhecidas[x.servidorId]
    return lista?.length ? { ...x, ferramentas: x.ferramentas.filter((f) => lista.some((c) => c.nome === f)) } : x
  })
  return limpar({ api: a.api, mcp })
}

/** Mesmos acessos? (o cartão só liga Guardar quando algo mudou) */
export const mesmosAcessos = (a: AcessosDaPagina | undefined, b: AcessosDaPagina | undefined): boolean => JSON.stringify(limpar(a ?? {})) === JSON.stringify(limpar(b ?? {}))

/**
 * Atualizar/rever sem diálogo: nenhuma ficha nova, nada mudou fora e toda sugestão já atendida pelo que a página
 * enxerga (o `aceitar(token)` sem acessos mantém os de antes). Página que passou a pedir `rede`/`local` e tinha acessos
 * abre o diálogo (eles vão sair).
 */
export function aceiteSemDialogo(p: Pick<PropostaDePagina, 'tipo' | 'novas' | 'mudouFora' | 'sugestoes' | 'acessosAntes' | 'semAcessos'>): boolean {
  if (p.tipo === 'nova' || p.mudouFora || p.novas.length) return false
  const tinha = !!(p.acessosAntes?.api?.length || p.acessosAntes?.mcp?.length)
  if (p.semAcessos) return !tinha
  const atendidos = nomesAtendidos(p.acessosAntes)
  return (p.sugestoes ?? []).every((s) => atendidos.includes(s.encaixe))
}

/** O aviso de uma página que lê o quadro E escreve numa API: o que ela lê pode sair por ali. Vazio: sem risco. */
export function avisoQuadroEscrita(pedidas: readonly string[], a: AcessosDaPagina, apis: readonly ApiDaTela[]): string {
  const nomes = (a.api ?? []).filter((x) => x.escrita).map((x) => apis.find((y) => y.id === x.apiId)).filter((y): y is ApiDaTela => !!y && !y.soLeitura).map((y) => `"${y.nome}"`)
  if (!pedidas.includes('quadro') || !nomes.length) return ''
  return `O que ela lê do quadro pode ir para ${juntar(nomes)}.`
}

/** A sugerida que o servidor (que já listou as dele) não tem: sem caixa, fora da conta, não vai ao main. */
export const ROTULO_DA_FERRAMENTA_QUE_FALTA = 'a página pede, mas o servidor não tem: fica de fora'

/**
 * Quantas das marcadas contam no "N de até 20": as que o servidor tem. Se ele já listou, a que ele não tem não conta
 * (não vai ao main); se nunca listou, todas contam (ficam, como no envio).
 */
export const contarFerramentas = (marcadas: readonly string[], conhecidas: readonly FerramentaMcp[] | null | undefined): number =>
  conhecidas?.length ? marcadas.filter((n) => conhecidas.some((f) => f.nome === n)).length : marcadas.length

/** Sob as caixas de "Pedir a um agente": marcar ali não libera a API nem o MCP para a página. */
export const NOTA_DO_PEDIDO = 'O agente recebe só os nomes, nunca a chave. Quem libera é você, no aceite.'

/** O selo da API no aceite e no cartão: o TETO da API (cinza); a escrita da página é a caixa "também escreve". */
export const seloDoTeto = (soLeitura: boolean | undefined): string => (soLeitura ? 'teto: só lê' : 'teto: lê e escreve')

/** A página sugeriu escrever (`escrita: true`) numa sugestão que esta API atende: nota cinza ao lado da caixa. */
export const paginaSugereEscrever = (sugestoes: readonly SugestaoDePagina[], atende: readonly string[] | undefined): boolean =>
  sugestoes.some((s) => s.tipo === 'api' && s.escrita && !!atende?.includes(s.encaixe))

export interface FerramentaNaTela {
  nome: string
  /** o que o servidor diz que ela faz (curto); vazio se não informou */
  descricao: string
  rotulo: string
  /** vermelho: "pode mudar coisas" e a que o servidor nunca listou */
  perigo: boolean
  /** cinza: sugerida pelo manifesto, mas o servidor (que já listou as dele) não tem */
  falta: boolean
}

/**
 * As ferramentas de um servidor marcado: as que ele listou (palavra dele: "diz que só lê" ou, em vermelho, "pode mudar
 * coisas") e as sugeridas/marcadas que ele não tem: cinza "o servidor não tem" ou, se ele nunca listou nada, vermelho
 * "o servidor ainda não listou". `null` = ainda lendo.
 */
export function ferramentasDoServidor(conhecidas: readonly FerramentaMcp[] | null | undefined, outras: readonly string[]): FerramentaNaTela[] | null {
  if (!conhecidas) return null
  const daLista = conhecidas.map((f) => {
    const r = rotuloDaFerramenta(f)
    return { nome: f.nome, descricao: descricaoCurta(f.descricao ?? '', 220), rotulo: r.texto, perigo: r.perigo, falta: false }
  })
  const vazia = conhecidas.length === 0
  const resto = unicos(outras.filter((n) => !conhecidas.some((f) => f.nome === n))).map((nome) =>
    vazia ? { nome, descricao: '', rotulo: 'o servidor ainda não listou', perigo: true, falta: false } : { nome, descricao: '', rotulo: ROTULO_DA_FERRAMENTA_QUE_FALTA, perigo: false, falta: true }
  )
  return [...daLista, ...resto]
}

/** As que o servidor diz que só leem (o botão "marcar as que dizem só ler"). */
export const ferramentasQueDizemSoLer = (conhecidas: readonly FerramentaMcp[] | null | undefined): string[] =>
  (conhecidas ?? []).filter((f) => !rotuloDaFerramenta(f).perigo).map((f) => f.nome)

/** A moldura: "usa: ClickUp, Eco de teste", vermelho se há escrita ou ferramenta que pode mudar coisas; vazio se nada. */
export function textoDeUso(usos: readonly UsoDaPagina[] | undefined): { texto: string; perigo: boolean; detalhe: string } {
  const lista = usos ?? []
  if (!lista.length) return { texto: '', perigo: false, detalhe: '' }
  const nome = (u: UsoDaPagina): string => (u.sumiu ? `${u.nome} (sumiu)` : u.nome)
  return {
    texto: `usa: ${lista.map(nome).join(', ')}`,
    perigo: lista.some((u) => u.perigo),
    detalhe: lista
      .map((u) => `${nome(u)}: ${u.tipo === 'api' ? (u.perigo ? 'API, lê e escreve' : 'API, só lê') : u.perigo ? 'servidor MCP, pode mudar coisas' : 'servidor MCP, ferramentas que dizem só ler'}`)
      .join('\n')
  }
}

/** Registro de pedidos: o que aconteceu com um pedido (sem corpo nem cabeçalho). */
export function textoDoPedidoDaPagina(p: Pick<PedidoDaPagina, 'status' | 'erro'>): string {
  if (p.status === null) return p.erro ? `não saiu: ${p.erro}` : 'não saiu'
  return p.erro ? `${p.status} · ${p.erro}` : String(p.status)
}

// ---------- painel do "+" (1.9.5, S6): guia curto, exemplos e o pedido a um agente ----------

/** O "+" com a chave desligada: o que é e por que vem desligado (2 frases). */
export const TEXTO_DESLIGADAS =
  'Páginas próprias são telas feitas por você ou pelo seu time que ganham um ícone nesta barra. Elas vêm desligadas porque rodam código de fora do Orkester — isolado do seu PC, mas de fora.'

export const O_QUE_E =
  'Uma página "+" é uma pasta com uma tela (index.html) e um manifesto.json, que diz o nome dela e o que ela pede. Ela abre aqui dentro do Orkester.'

export interface PassoDoGuia {
  titulo: string
  texto: string
}

export const PASSOS_DO_GUIA: readonly PassoDoGuia[] = [
  { titulo: 'Escolha', texto: 'um exemplo pronto, uma pasta sua, ou peça a um agente para criar.' },
  { titulo: 'Aceite as permissões', texto: 'o Orkester lê a pasta sem rodar nada e mostra o que ela pede.' },
  { titulo: 'Use pela barra', texto: 'um ícone novo aparece aqui na esquerda.' }
]

/** O que uma página pode (cada item só se ela pedir e você aceitar, menos o 1 MB). */
export const PODE: readonly string[] = [
  'ver nomes e situação dos agentes do espaço',
  'mandar recados aos agentes que você ligar a ela',
  'falar com os sites que ela declarar',
  'usar as APIs e os servidores MCP que você marcar para ela (o app leva a chave; a página nunca a vê)',
  'guardar até 1 MB de dados próprios'
]

export const NAO_PODE: readonly string[] = [
  'ler seus arquivos ou abrir programas',
  'ver a tela dos terminais',
  'usar câmera ou microfone, baixar arquivos, abrir janelas'
]

/** Os exemplos que vão embutidos no app (o main só aceita estes nomes; o aceite mostra o manifesto de verdade). */
export interface ExemploDePagina {
  nome: string
  titulo: string
  descricao: string
  /** fichas (`quadro`, `recado`…) */
  pede: string[]
  /** (1.9.7) o que o manifesto sugere de API/MCP, em português (só sugestão: quem marca é você, no aceite) */
  sugere?: string[]
}

export const EXEMPLOS: readonly ExemploDePagina[] = [
  {
    nome: 'resumo-do-espaco',
    titulo: 'Resumo do espaço',
    descricao: 'Mostra os agentes do espaço ao vivo, manda um recado ao agente que você ligar a ela e guarda uma nota.',
    pede: ['quadro', 'recado']
  },
  {
    nome: 'eco-de-api',
    titulo: 'Eco de API',
    descricao:
      'Testa o pedido a uma API pelo Orkester com o httpbin.org, um serviço público de teste: lê, escreve (ele devolve o que recebeu), mostra o token trocado por ••• e um redirecionamento que o app não segue. Você cria uma API de teste com um valor inventado.',
    pede: [],
    sugere: ['uma API sua para httpbin.org, que lê e escreve']
  }
]

const TITULO_MAXIMO = 120
const PREFIXO_DA_DEMANDA = 'Criar página: '

/** "Criar página: <o começo da descrição>", numa linha e dentro do limite do kanban (120). */
export function tituloDaDemanda(descricao: string): string {
  const linha = descricao.replace(/\s+/g, ' ').trim()
  const cabe = TITULO_MAXIMO - PREFIXO_DA_DEMANDA.length
  const corpo = [...linha].length > cabe ? `${[...linha].slice(0, cabe - 1).join('').trimEnd()}…` : linha
  return PREFIXO_DA_DEMANDA + corpo
}

/** Teto da descrição que a pessoa escreve (a demanda inteira tem de caber nos 8 KB do kanban). */
export const DESCRICAO_MAXIMA = 2000

/** (1.9.7) As APIs e os MCPs que a página vai usar, marcados no "Pedir a um agente". Só nome, domínios e ferramentas. */
export interface EscolhaDaDemanda {
  apis: ReadonlyArray<{ nome: string; dominios: readonly string[]; soLeitura?: boolean }>
  mcps: ReadonlyArray<{ nome: string; ferramentas: readonly string[] }>
}

const limiteDeTexto = (s: string, max: number): string => ([...s].length > max ? `${[...s].slice(0, max - 1).join('')}…` : s)

/**
 * As linhas "vai usar" da demanda. Monta campo a campo (nunca espalha o objeto): id, fim da chave e valor não entram
 * nem se vierem junto. Até 10 APIs e 5 servidores, nomes e listas cortados para caber nos 8 KB do kanban.
 */
export function linhasDaEscolha(e: EscolhaDaDemanda | undefined): string[] {
  if (!e || (!e.apis.length && !e.mcps.length)) return []
  const nome = (n: string): string => limiteDeTexto(n.replace(/\s+/g, ' ').trim(), 80)
  const apis = e.apis.slice(0, LIMITES_DE_ACESSO.apis).map((a) => `- API "${nome(a.nome)}": domínios ${a.dominios.slice(0, 5).join(', ')}; ${a.soLeitura ? 'só lê (GET, HEAD)' : 'lê e escreve'}`)
  const mcps = e.mcps.slice(0, LIMITES_DE_ACESSO.servidores).map((m) => {
    const fs = m.ferramentas.slice(0, LIMITES_DE_ACESSO.ferramentas).map((f) => limiteDeTexto(f, 128))
    return `- MCP "${nome(m.nome)}": ${fs.length ? `ferramentas ${fs.join(', ')}` : 'ferramentas a escolher (prefira as de leitura)'}`
  })
  return ['**Vai usar** (o usuário marca no aceite; sugira estes nomes no manifesto):', '', ...apis, ...mcps, '']
}

/** O teto da descrição de uma tarefa do kanban (8 KB). */
const TETO_DA_DEMANDA = 8 * 1024
const bytes = (s: string): number => new TextEncoder().encode(s).length

/**
 * A descrição da demanda: o pedido + o que ela vai usar + como entregar (pasta, manifesto, guia) + o que o agente NÃO
 * faz. A seção "vai usar" entra linha a linha só até caber nos 8 KB do kanban; o que sobra vira "e mais N".
 */
export function instrucoesDaDemanda(descricao: string, escolha?: EscolhaDaDemanda): string {
  const sem = montarDemanda(descricao, [])
  const linhas = linhasDaEscolha(escolha)
  if (!linhas.length) return sem
  const cabem: string[] = []
  let usado = bytes(sem) + 64
  const itens = linhas.slice(2, -1)
  for (const [i, l] of itens.entries()) {
    const resto = itens.length - i
    if (usado + bytes(l) + 1 > TETO_DA_DEMANDA) {
      cabem.push(`- e mais ${resto}`)
      break
    }
    cabem.push(l)
    usado += bytes(l) + 1
  }
  return montarDemanda(descricao, [...linhas.slice(0, 2), ...cabem, ''])
}

function montarDemanda(descricao: string, vaiUsar: readonly string[]): string {
  const pedido = [...descricao.trim()].slice(0, DESCRICAO_MAXIMA).join('')
  return [
    'Pedido pelo botão "+" do Orkester: uma página própria nova.',
    '',
    '**O que a página deve fazer:**',
    '',
    pedido
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n'),
    '',
    ...vaiUsar,
    '**Como entregar:**',
    '',
    '1. Crie uma pasta nova (por exemplo `paginas/<id>/` neste espaço) com `manifesto.json` e `index.html` na raiz; JS e CSS em arquivos próprios (`app.js`, `estilo.css`): script inline não roda.',
    '2. `manifesto.json`: `{ "formato": 1, "id": "<id>", "nome": "…", "versao": "1.0.0", "descricao": "…", "icone": "lucide:LayoutDashboard", "permissoes": { "quadro": true } }`. Peça só o que a página usa: `quadro` (ver os agentes do espaço), `recado` (falar com agentes ligados a ela), `rede` (até 5 hosts https). APIs e MCPs não se pedem: o usuário marca, no aceite, quais a página enxerga.',
    '   - **APIs** (a página nunca vê a chave nem monta URL): sugira no manifesto `"api": [{ "encaixe": "clickup", "hosts": ["api.clickup.com"], "escrita": false }]` (só sugestão: pré-marca a API no aceite; `encaixe` em minúsculas, de preferência o nome da API; `escrita: true` só se a página precisa de POST, PUT, PATCH ou DELETE). Não combina com `rede` nem `local`. Na página: `await orkPagina.api.disponiveis()` lista `{ nome, dominios, escrita, atende }` e `await orkPagina.api.pedir("ClickUp", { metodo: "GET", caminho: "/v2/team", consulta: { limite: 10 } })` devolve `{ status, tipo, corpo }` (`corpo` é texto: faça `JSON.parse` se for JSON; erro 4xx/5xx volta como resposta, não como exceção). O nome é o da API (sem diferença de maiúscula, acento e espaço) ou o `encaixe` sugerido. `host` opcional, dentro dos domínios da API. O `caminho` começa com `/` e não leva `?`, `#`, `..` nem espaço cru (a consulta vai em `consulta`). Sem escrita, só GET e HEAD. Limites: 60 pedidos por minuto, 20 s e 2 MB por resposta. Se vier "a página não enxerga a API", mostre ao usuário que marque em Conexões › Páginas: não peça, não invente nem escreva segredo na página.',
    '   - **MCPs** (ferramentas de um servidor que o usuário cadastrou em Conexões › MCP): sugira `"mcp": [{ "encaixe": "tarefas", "ferramentas": ["list_tasks", "get_task"] }]` (1 a 20 ferramentas, de preferência as de leitura; não combina com `rede` nem `local`). Na página: `await orkPagina.mcp.disponiveis()`, `await orkPagina.mcp.ferramentas("ClickUp")` lista as liberadas e `await orkPagina.mcp.chamar("ClickUp", "list_tasks", { lista: "x" })` devolve `{ texto, estruturado?, erro }` (`erro: true` é falha da ferramenta, não exceção). Ferramenta fora da lista é recusada; segredo do servidor nunca chega à página. Mesmo balde de 60 chamadas por minuto. O usuário escolhe o servidor e as ferramentas no aceite.',
    '3. Siga o guia de páginas do Orkester (`docs/paginas.md` no repositório do Orkester; no app: "+" → Guia completo): limites da pasta (até 200 arquivos, 5 MB, extensões fixas), a API `window.orkPagina` e o que é bloqueado.',
    '4. Não instale nem aceite a página: isso é só do usuário, pelo "+" → "Escolher pasta…". Ao terminar, diga o caminho da pasta.'
  ].join('\n')
}

/** O que a tela diz depois do pedido (sem Maestro, a demanda fica em Demandas e a tela explica como seguir). */
export function textoDoPedido(numero: number, maestro: string | null, erroAoDelegar = ''): string {
  if (maestro) return `Pronto: a demanda #${numero} está com o Maestro "${maestro}". Quando ele disser o caminho da pasta, volte aqui e use "Escolher pasta…".`
  const porque = erroAoDelegar ? ` (${erroAoDelegar})` : ': não há Maestro aberto neste espaço'
  return `A demanda #${numero} ficou em Demandas no Kanban${porque}. Abra um agente com a função Maestro e arraste a #${numero} para "Com o Maestro".`
}
