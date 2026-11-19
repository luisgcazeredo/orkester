// Textos das páginas extras: o que cada permissão quer dizer em português claro (diálogo de aceite e Conexões),
// a diferença "pede permissão nova", os avisos da moldura. Puro (sem React, sem DOM, sem import em tempo de execução):
// a `textos.prova` roda no Node.
// Permissão é uma "ficha" de texto (shared/paginas.ts): `quadro`, `recado`, `rede:<host>`, `local:<porta><caminho>`.
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
  aviso: string
  botao: string
}

/** Título, rótulo da lista, aviso e botão do diálogo de aceite, por tipo de proposta. */
export function cabecalhoDaProposta(p: Pick<PropostaDePagina, 'tipo' | 'manifesto' | 'versaoAntes' | 'mudouFora'>): CabecalhoDaProposta {
  const nome = p.manifesto.nome
  if (p.tipo === 'nova') return { titulo: `Adicionar a página "${nome}"?`, rotulo: 'Ela poderá:', aviso: '', botao: 'Adicionar e permitir' }
  if (p.tipo === 'atualizacao')
    return {
      titulo: `Atualizar "${nome}"?`,
      rotulo: 'Permissões novas que ela pede:',
      aviso: p.versaoAntes ? `Versão ${p.versaoAntes} → ${p.manifesto.versao}.` : '',
      botao: 'Atualizar e permitir'
    }
  if (p.mudouFora)
    return {
      titulo: `"${nome}" mudou fora do Orkester`,
      rotulo: 'Permissões novas que ela pede:',
      aviso: 'A cópia desta página foi alterada por fora do Orkester (talvez por um agente). Aceite só se você sabe o que mudou.',
      botao: 'Aceitar a mudança'
    }
  return { titulo: `"${nome}" pede permissão nova`, rotulo: 'Permissões novas que ela pede:', aviso: '', botao: 'Permitir e carregar' }
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
  pede: string[]
}

export const EXEMPLOS: readonly ExemploDePagina[] = [
  {
    nome: 'resumo-do-espaco',
    titulo: 'Resumo do espaço',
    descricao: 'Mostra os agentes do espaço ao vivo, manda um recado ao agente que você ligar a ela e guarda uma nota.',
    pede: ['quadro', 'recado']
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

/** A descrição da demanda: o pedido + como entregar (pasta, manifesto, guia) + o que o agente NÃO faz. */
export function instrucoesDaDemanda(descricao: string): string {
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
    '**Como entregar:**',
    '',
    '1. Crie uma pasta nova (por exemplo `paginas/<id>/` neste espaço) com `manifesto.json` e `index.html` na raiz; JS e CSS em arquivos próprios (`app.js`, `estilo.css`): script inline não roda.',
    '2. `manifesto.json`: `{ "formato": 1, "id": "<id>", "nome": "…", "versao": "1.0.0", "descricao": "…", "icone": "lucide:LayoutDashboard", "permissoes": { "quadro": true } }`. Peça só o que a página usa: `quadro` (ver os agentes do espaço), `recado` (falar com agentes ligados a ela), `rede` (até 5 hosts https).',
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
