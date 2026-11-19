/**
 * A caixa de entrada de cada cartão: nada que um agente manda a outro é digitado na hora.
 *
 * Por que existe (12/11/2026): o `ork pedir` digitava o pedido no terminal do outro no instante em que era
 * chamado. Três coisas deram errado com o time de verdade:
 *  1. O usuário escrevia no Maestro, um agente terminou e "entregou" — a colagem entrou no meio do que ele
 *     escrevia e o Enter mandou os dois textos juntos, cortados.
 *  2. Pedido digitado em quem estava trabalhando dependia de o agente aceitar fila do lado dele.
 *  3. Um agente terminava o que o Maestro pediu e ninguém avisava o Maestro: o usuário tinha de dizer "ele já
 *     terminou, pode continuar".
 *
 * A regra agora: todo recado (pedido, entrega, aviso) entra na fila do destino, e o app entrega **um de cada
 * vez**, só quando o destino está livre e o usuário não está escrevendo nele. E quem recebeu um pedido de um
 * agente e parou sem devolver nada faz o app avisar quem pediu (ver `Pendencia`).
 *
 * Este arquivo não conhece Electron nem processo: tudo o que ele precisa do mundo vem em `DependenciasDaCaixa`,
 * para as provas rodarem com `node --test`.
 */
import type { ResultadoDoEnvio } from './envio'
import type { MotivoDaFila, ResumoDaCaixa } from '../shared/api'

// ---------- o usuário escrevendo ----------

/** Sem tecla do usuário por este tempo, ele não está mais "digitando" naquele cartão. */
export const SILENCIO_DO_USUARIO = 5000
/** Duas teclas Esc sozinhas dentro deste intervalo: o Claude Code limpa o campo de entrada. */
const ESC_DUPLO = 1200

/** O que o app sabe do que o usuário digitou num cartão. `rascunho` é uma contagem aproximada de letras no campo. */
export interface EntradaDoUsuario {
  ultimaTecla: number
  rascunho: number
  ultimoEsc: number
}

export const entradaVazia = (): EntradaDoUsuario => ({ ultimaTecla: 0, rascunho: 0, ultimoEsc: 0 })

const COLAGEM = /\x1b\[200~([\s\S]*?)(?:\x1b\[201~|$)/g
/** Sequências que o terminal manda sozinho (foco, mouse, resposta a pergunta do programa) ou que são setas. */
const SEQUENCIA = /\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1bO[@-~]|\x1bP[^\x1b]*\x1b\\/g

/**
 * Lê o que a janela mandou para o processo (o que o usuário digitou ou colou) e devolve a entrada nova.
 * Não precisa ser exato, precisa errar para o lado seguro: na dúvida, há rascunho e o recado espera.
 * Resposta automática do terminal (foco, mouse, posição do cursor) não é o usuário e não conta.
 */
export function lerEntradaDoUsuario(antes: EntradaDoUsuario, dados: string, agora: number): EntradaDoUsuario {
  let rascunho = antes.rascunho
  let ultimoEsc = antes.ultimoEsc
  let humano = false

  // colagem do usuário: o conteúdo inteiro entra no campo
  let resto = dados.replace(COLAGEM, (_tudo, colado: string) => {
    humano = true
    rascunho += Math.max(1, colado.length)
    return ''
  })
  // Alt+Enter (nova linha no campo) e Alt+Backspace (apaga palavra) antes de tirar as sequências
  resto = resto.replace(/\x1b\r/g, () => {
    humano = true
    rascunho += 1
    return ''
  })
  resto = resto.replace(/\x1b\x7f/g, () => {
    humano = true
    rascunho = Math.max(0, rascunho - 6)
    return ''
  })
  resto = resto.replace(SEQUENCIA, '')

  for (const letra of resto) {
    const codigo = letra.codePointAt(0)!
    if (letra === '\x1b') {
      humano = true
      if (ultimoEsc > 0 && agora - ultimoEsc < ESC_DUPLO) {
        rascunho = 0
        ultimoEsc = 0
      } else {
        ultimoEsc = agora
      }
      continue
    }
    humano = true
    if (letra === '\r' || letra === '\x03' || letra === '\x15') rascunho = 0 // Enter, Ctrl+C, Ctrl+U
    else if (letra === '\x7f' || letra === '\b') rascunho = Math.max(0, rascunho - 1)
    else if (letra === '\x17') rascunho = Math.max(0, rascunho - 6) // Ctrl+W
    else if (codigo >= 0x20) rascunho += 1
  }
  if (!humano) return antes
  return { ultimaTecla: agora, rascunho, ultimoEsc }
}

// ---------- quando dá para entregar ----------

export type Situacao = 'encerrado' | 'trabalhando' | 'pergunta' | 'livre'
export type MotivoDeEspera = MotivoDaFila

/** null = pode entregar agora. Senão, o motivo de esperar (é o que aparece no cartão e para quem mandou). */
export function motivoDeEspera(situacao: Situacao, usuario: EntradaDoUsuario, agora: number): MotivoDeEspera | null {
  if (situacao === 'encerrado') return 'encerrado'
  if (situacao === 'pergunta') return 'pergunta'
  // o usuário vem antes de "trabalhando": se ele está escrevendo, é isso que o cartão deve dizer
  if (agora - usuario.ultimaTecla < SILENCIO_DO_USUARIO) return 'digitando'
  if (usuario.rascunho > 0) return 'rascunho'
  if (situacao === 'trabalhando') return 'trabalhando'
  return null
}

export const TEXTO_DO_MOTIVO: Record<MotivoDeEspera, string> = {
  trabalhando: 'ele está trabalhando',
  pergunta: 'ele está parado numa pergunta',
  digitando: 'o usuário está escrevendo nele',
  rascunho: 'há texto do usuário no campo de entrada, ainda não enviado',
  'recado-antigo': 'um recado antigo, que o app deu por perdido, ainda está no campo de entrada',
  encerrado: 'o processo dele está encerrado'
}

// ---------- recados ----------

/**
 * `kanban` (1.9.4): "a tarefa #12 foi atribuída a você". Tratado como aviso (sem pendência, sem recibo, atrás de
 * entregas e pedidos), mas com tipo e cabeçalho próprios: `aviso` significa "um filho parou" para o time.
 */
export type TipoDeRecado = 'pedido' | 'entrega' | 'aviso' | 'kanban'

/** Avisos esperam a vez: entregas e pedidos passam na frente deles na mesma fila. */
const ehAviso = (tipo: TipoDeRecado): boolean => tipo === 'aviso' || tipo === 'kanban'

export interface Recado {
  id: string
  tipo: TipoDeRecado
  /** Sessão que mandou; null = o próprio app. */
  de: string | null
  deNome: string
  para: string
  texto: string
  criadoEm: number
  /**
   * Só nos avisos de "parou"/"pergunta" (1.5.3): o agente de que o aviso fala. O aviso mora na fila de **quem pediu**,
   * não na do agente, e envelhece: se o agente some ou volta a trabalhar, o aviso é velho e é cancelado.
   */
  sobre?: string
}

export type FimDoRecado = 'entregue' | 'incerto' | 'ficou' | 'sem-destino' | 'cancelado'

/**
 * O que vai digitado no destino. O pedido vai como veio (é o texto do agente); entrega e aviso ganham cabeçalho.
 * Num **shell**, entrega e aviso vão como comentário (`# ` em cada linha): colados crus, o PowerShell executaria
 * cada linha — inclusive as linhas da tela de outro agente que o aviso carrega.
 */
export function textoDoRecado(r: Pick<Recado, 'tipo' | 'deNome' | 'texto'>, shell = false): string {
  if (r.tipo === 'pedido') return r.texto
  const cabecalho = r.tipo === 'entrega' ? `[ork · entrega de "${r.deNome}"]` : r.tipo === 'kanban' ? '[ork · kanban]' : '[ork · aviso do Orkester]'
  const texto = `${cabecalho}\n${r.texto}`
  if (!shell) return texto
  return texto
    .split('\n')
    .map((linha) => `# ${linha}`)
    .join('\n')
}

// ---------- quem pediu e ainda não recebeu nada ----------

/** Parado (livre) por este tempo depois de ter trabalhado, sem `ork entregar`: o app avisa quem pediu. */
export const PARADO_PARA_AVISO = 20_000
/** Numa pergunta, o aviso sai mais cedo: alguém precisa responder. */
const PERGUNTA_PARA_AVISO = 8000
/** Com comando em segundo plano no rodapé, o tempo parado não conta; passado isto, avisa mesmo assim. */
export const SEGUNDO_PLANO_PARA_AVISO = 10 * 60_000
/** O agente precisa ser visto trabalhando por este tempo seguido para um aviso sobre ele ser dado por velho. */
const TRABALHANDO_PARA_VELHO = 3000
/** Se nunca o vimos trabalhar, depois disto conta como se tivesse (pedido curto demais para a rodada ver). */
const SEM_VER_TRABALHAR = 60_000
/** O rodapé de segundo plano precisa ficar fora por isto para o relógio dele zerar (ele pisca entre uma rodada e outra). */
const FORA_DO_SEGUNDO_PLANO = 5000

/**
 * "Fulano pediu a Beltrano e Beltrano ainda não devolveu." Aberta quando um pedido de agente é entregue;
 * fechada por `ork entregar`, por quem pediu ter esperado o fim (`ork pedir` sem `--sem-esperar`, `ork esperar`)
 * ou pelo aviso automático. Uma por destino: o pedido mais novo manda.
 */
interface Pendencia {
  de: string
  para: string
  desde: number
  trabalhou: boolean
  paradoDesde: number
  /** desde quando o agente está livre só esperando um comando em segundo plano (0 = não está) */
  segundoPlanoDesde?: number
  /** desde quando o rodapé de segundo plano sumiu (0 = está lá); piscar por poucos segundos não zera o relógio dele */
  foraDoSegundoPlanoDesde?: number
}

/** O que fazer com uma pendência nesta rodada. */
export function decidirPendencia(
  p: Pendencia,
  situacao: Situacao,
  agora: number,
  /** o rodapé do agente diz que há comando em segundo plano: ele está esperando, não parado */
  emSegundoPlano = false,
  /** o cartão foi fechado pelo `ork fechar`, pelo MCP ou pelo botão: fechamento pedido não é saída inesperada */
  fechadoDeProposito = false
): { pendencia: Pendencia; avisar: 'parou' | 'pergunta' | 'encerrou' | 'segundo-plano' | null; descartar?: boolean } {
  if (situacao === 'encerrado') return fechadoDeProposito ? { pendencia: p, avisar: null, descartar: true } : { pendencia: p, avisar: 'encerrou' }
  if (situacao === 'trabalhando') return { pendencia: { ...p, trabalhou: true, paradoDesde: 0, segundoPlanoDesde: 0, foraDoSegundoPlanoDesde: 0 }, avisar: null }
  const trabalhou = p.trabalhou || agora - p.desde >= SEM_VER_TRABALHAR
  if (!trabalhou) return { pendencia: p, avisar: null }
  if (situacao === 'livre' && emSegundoPlano) {
    // esperando o comando dele: o relógio de "parou" não anda; mas um comando que nunca acaba não esconde o agente para sempre
    const segundoPlanoDesde = p.segundoPlanoDesde || agora
    const parada = { ...p, trabalhou, paradoDesde: 0, segundoPlanoDesde, foraDoSegundoPlanoDesde: 0 }
    return { pendencia: parada, avisar: agora - segundoPlanoDesde >= SEGUNDO_PLANO_PARA_AVISO ? 'segundo-plano' : null }
  }
  if (p.segundoPlanoDesde) {
    const fora = p.foraDoSegundoPlanoDesde || agora
    p = agora - fora >= FORA_DO_SEGUNDO_PLANO ? { ...p, segundoPlanoDesde: 0, foraDoSegundoPlanoDesde: 0 } : { ...p, foraDoSegundoPlanoDesde: fora }
  }
  const paradoDesde = p.paradoDesde || agora
  const limite = situacao === 'pergunta' ? PERGUNTA_PARA_AVISO : PARADO_PARA_AVISO
  if (agora - paradoDesde >= limite) return { pendencia: { ...p, trabalhou, paradoDesde }, avisar: situacao === 'pergunta' ? 'pergunta' : 'parou' }
  return { pendencia: { ...p, trabalhou, paradoDesde }, avisar: null }
}

/**
 * "Fechado de propósito" vale para UM processo, não para o id do cartão (revisão 1.9.3). O id volta: Ctrl+Z
 * restaura o cartão com o mesmo id, `ork modelo`/troca/reabrir sobem outro processo nele. Por isso a marca guarda
 * a geração do processo que foi mandado fechar e cai quando nasce outro no mesmo id ou quando o fechamento é
 * recusado; a saída real do processo seguinte volta a avisar.
 */
export class FechamentosDeProposito {
  private readonly marcas = new Map<string, number>()
  /** Pedido de fechar o processo `geracao` do cartão `id` (antes de pedir à janela, para a caixa não ver a saída antes). */
  marcar(id: string, geracao: number): void {
    this.marcas.set(id, geracao)
  }
  /** A janela recusou (ou o pedido falhou): o cartão segue vivo, e a próxima saída dele é de verdade. */
  desmarcar(id: string, geracao: number): void {
    if (this.marcas.get(id) === geracao) this.marcas.delete(id)
  }
  /** Nasceu sessão ou processo novo neste id: a marca era do anterior. */
  nasceu(id: string): void {
    this.marcas.delete(id)
  }
  /** `geracaoAtual` é a do processo que o cartão tem agora; sem sessão (já encerrada), vale a marca que ficou. */
  vale(id: string, geracaoAtual: number | undefined): boolean {
    const marcada = this.marcas.get(id)
    return marcada !== undefined && (geracaoAtual === undefined || marcada === geracaoAtual)
  }
}

export function textoDoAviso(nome: string, motivo: 'parou' | 'pergunta' | 'encerrou' | 'segundo-plano', tela: string): string {
  const cabeca = {
    parou: `"${nome}" terminou o que você pediu e parou sem mandar a entrega pelo \`ork entregar\`.`,
    pergunta: `"${nome}" parou numa pergunta e espera resposta (responda com \`ork teclas\` se for seguro, ou pergunte ao usuário).`,
    encerrou: `"${nome}" saiu (o processo terminou, ou o agente voltou ao shell) antes de mandar a entrega.`,
    'segundo-plano': `"${nome}" está há 10 min parado com um comando em segundo plano e não mandou a entrega pelo \`ork entregar\`. Pode ser só um comando longo: veja se ele ainda anda.`
  }[motivo]
  const fim = motivo === 'encerrou' ? '' : `\nLeia a tela inteira com \`ork ver "${nome}" --linhas 200\`.`
  return `${cabeca}\nÚltimas linhas da tela dele:\n${citarTela(tela)}${fim}`
}

/**
 * A tela de outro agente, citada com `| ` em cada linha (1.5.1): sem isso, o `› 1. Yes` e o "Press enter to
 * confirm" que ela traz seriam lidos pelo app como o campo de entrada e como diálogo do próprio destino.
 */
const LINHA_CITADA = /^\s*\|(\s|$)/

/** A tela sem as linhas citadas por `citarTela`: o que o app lê como sinal do próprio agente não inclui a fala de outro. */
export function tirarCitacoes(tela: string): string {
  return tela
    .split('\n')
    .filter((l) => !LINHA_CITADA.test(l))
    .join('\n')
}

/**
 * Linhas que são eco de comando ou saída de ferramenta, não diálogo do agente (13/11/2026: um `grep "Skip|Update now"`
 * do próprio agente, com o resultado na tela, foi lido como "parou numa pergunta"). Só vale para a leitura de DIALOGO.
 */
const ECO_DE_FERRAMENTA = [
  /^\s*[●⏺⎿$]/, // cabeçalho/resultado de ferramenta (Claude), prompt de shell
  /^\s*PS [^>]*>/,
  /\b(grep|rg|Select-String|findstr|sed|awk)\b/i, // o comando
  /['"][^'"\n]*\|[^'"\n]*['"]/, // padrão entre aspas com alternativas
  /^\s*\d+[:\-]\s/, // saída com número de linha
  /[\w./\\-]+\.(ts|tsx|mts|mjs|js|json|md|toml|rules|txt):\d*/i // referência a arquivo
]

/** A tela sem citações nem eco de ferramenta: o que sobra pode ser um diálogo de verdade. */
export function semEcoDeFerramenta(tela: string): string {
  return tirarCitacoes(tela)
    .split('\n')
    .filter((l) => !ECO_DE_FERRAMENTA.some((re) => re.test(l)))
    .join('\n')
}

/**
 * As últimas `quantidade` linhas com texto, e só DEPOIS o filtro de eco. Filtrar antes puxaria para a janela
 * citações antigas (um "update available" de várias chamadas de ferramenta atrás) que o corte existe para evitar.
 */
export function janelaDeDialogo(tela: string, quantidade = 6): string {
  const janela = tela
    .split('\n')
    .filter((linha) => linha.trim())
    .slice(-quantidade)
    .join('\n')
  return semEcoDeFerramenta(janela)
}

export function citarTela(tela: string): string {
  const linhas = tela.trim() ? tela.trim().split('\n') : ['(vazia)']
  return linhas.map((l) => `| ${l}`).join('\n')
}

// ---------- a caixa ----------

/** Depois de digitar um recado, o próximo para o mesmo cartão espera pelo menos isto (o agente começar a mostrar trabalho). */
export const ESPERA_ENTRE_RECADOS = 4000

export type { ResumoDaCaixa }

interface DependenciasDaCaixa {
  agora(): number
  novoId(): string
  /** null = a sessão não existe mais */
  situacao(id: string): Promise<Situacao | null>
  usuario(id: string): EntradaDoUsuario
  nome(id: string): string | null
  /** O rodapé do agente diz que há comando em segundo plano (Claude: `1 shell`). Opcional. */
  segundoPlano?(id: string): Promise<boolean>
  /** O cartão foi fechado de propósito (`ork fechar`, MCP, botão do cartão): a saída dele não é avisada. Opcional. */
  fechadoDeProposito?(id: string): boolean
  /** o destino é um shell (entrega e aviso vão como comentário) */
  shell(id: string): boolean
  tela(id: string, linhas: number): Promise<string>
  /** digita e confirma (é o `digitarPedido` do comandos.ts) */
  digitar(id: string, texto: string): Promise<ResultadoDoEnvio>
  /**
   * Retoma um recado que deu `ficou`: aperta Enter **só** se a marca dele está no campo de entrada (é o
   * `retomarEnvio` do envio.ts). `sem-marca` = nada foi apertado. Quem chama já viu o destino livre e sem rascunho.
   */
  retomar(id: string, texto: string): Promise<ResultadoDoEnvio | 'sem-marca'>
  /** O texto deste recado ainda está no campo de entrada do destino (um recado desistido não pode receber outro por cima). */
  marcaNoCampo(id: string, texto: string): Promise<boolean>
  /** a fila de um cartão mudou: avisa a janela */
  mudou(id: string, resumo: ResumoDaCaixa): void
  /** `tela`: últimas linhas do destino, quando o resultado é `ficou` ou `incerto` (para entender depois) */
  registrar(recado: Recado, fim: FimDoRecado, tela?: string): void
}

/** `ficou` fica esperando a colagem aparecer para apertar Enter; sem nada neste tempo, avisa quem mandou. */
export const RETOMADA_ESPERA = 180_000
/** Entre uma retomada que não resolveu e a seguinte. */
const RETOMADA_INTERVALO = 10_000

interface NaFila {
  recado: Recado
  resolver: (fim: FimDoRecado) => void
}

/** Um recado que deu `ficou` e espera a hora segura de apertar o Enter. */
interface Retomada {
  item: NaFila
  desde: number
  proxima: number
}

export interface Caixa {
  /** Põe o recado na fila do destino. A promessa resolve quando ele foi digitado (ou não pôde ser). */
  enfileirar(r: Omit<Recado, 'id' | 'criadoEm'>): { id: string; posicao: number; fim: Promise<FimDoRecado> }
  /** Uma passada: entrega o que pode e confere as pendências. O app chama de segundo em segundo. */
  rodada(): Promise<void>
  resumo(id: string): ResumoDaCaixa
  motivoAgora(id: string): Promise<MotivoDeEspera | null>
  abrirPendencia(de: string, para: string): void
  /**
   * `de` escreveu em `para` (ex.: `ork teclas`) depois de um aviso que apagou a pendência: reabre, para o
   * próximo parar também avisar. No máximo um aviso por parada (a pendência só se arma de novo vendo-o trabalhar).
   */
  reabrirPendencia(de: string, para: string): void
  fecharPendencia(para: string): void
  pendenciaDe(para: string): Pendencia | undefined
  /** quem pediu está esperando o fim agora mesmo (`ork pedir`/`ork esperar`): sem aviso enquanto isso */
  vigiar(para: string): () => void
  /** o usuário clicou em "liberar": o recado antigo desistido deixa de segurar a fila */
  liberar(id: string): void
  /** a sessão saiu do app: os recados para ela não têm mais destino */
  esquecer(id: string): void
  /**
   * Tira da fila de `para` o recado `id` que ainda não foi digitado (fim `cancelado`). false = já saiu da fila,
   * está sendo digitado agora ou ficou no campo à espera do Enter (retomada): para quem pediu, já chegou.
   */
  cancelar(para: string, id: string): boolean
}

export function criarCaixa(d: DependenciasDaCaixa): Caixa {
  const filas = new Map<string, NaFila[]>()
  const entregando = new Set<string>()
  /** o recado que está sendo digitado agora, por destino (não se cancela no meio) */
  const digitando = new Map<string, NaFila>()
  const pendencias = new Map<string, Pendencia>()
  /** a pendência que o último aviso apagou, por destino */
  const ultimaPendencia = new Map<string, Pendencia>()
  const retomadas = new Map<string, Retomada>()
  /**
   * o texto do recado que desistiu por destino: enquanto ele estiver **no campo reconhecido**, nada é colado por
   * cima (sem prazo: colar depois dele manda os dois numa mensagem só). O eco no histórico, que travava a fila na
   * 1.5.1, já não conta: `campoNaTela` não o toma por campo. O clique em "liberar" também o solta.
   */
  const desistidos = new Map<string, string>()
  const vigias = new Map<string, number>()
  const ultimoResumo = new Map<string, string>()
  const motivos = new Map<string, MotivoDeEspera | null>()
  const ultimaEntrega = new Map<string, number>()
  let rodando = false

  const resumo = (id: string): ResumoDaCaixa => {
    const fila = filas.get(id) ?? []
    return { fila: fila.length, motivo: fila.length ? motivos.get(id) ?? null : null, de: fila.map((x) => x.recado.deNome) }
  }

  const avisarSeMudou = (id: string): void => {
    const r = resumo(id)
    const chave = JSON.stringify(r)
    if (ultimoResumo.get(id) === chave) return
    ultimoResumo.set(id, chave)
    d.mudou(id, r)
  }

  const terminar = (id: string, item: NaFila, fim: FimDoRecado, tela?: string): void => {
    const fila = filas.get(id) ?? []
    const resto = fila.filter((x) => x !== item)
    if (resto.length) filas.set(id, resto)
    else filas.delete(id)
    d.registrar(item.recado, fim, tela)
    item.resolver(fim)
    avisarSeMudou(id)
  }

  const motivoAgora = async (id: string): Promise<MotivoDeEspera | null> => {
    const situacao = await d.situacao(id)
    const motivo = motivoDeEspera(situacao ?? 'encerrado', d.usuario(id), d.agora())
    // recém-entregue: o agente ainda pode não ter começado a mostrar que está trabalhando
    if (!motivo && d.agora() - (ultimaEntrega.get(id) ?? 0) < ESPERA_ENTRE_RECADOS) return 'trabalhando'
    return motivo
  }

  /** O recado chegou (ou pode ter chegado): quem pediu passa a esperar a entrega; quem entregou cumpriu o pedido. */
  const concluir = (id: string, item: NaFila, fim: FimDoRecado, tela?: string): void => {
    if (fim !== 'ficou' && item.recado.tipo === 'pedido' && item.recado.de) abrirPendencia(item.recado.de, id)
    if (item.recado.tipo === 'entrega' && item.recado.de) {
      // a entrega chegou: quem a mandou cumpriu o pedido
      if (pendencias.get(item.recado.de)?.de === id) {
        pendencias.delete(item.recado.de)
        ultimaPendencia.delete(item.recado.de)
      }
    }
    terminar(id, item, fim, tela)
  }

  /**
   * `ficou` não consome o recado (1.5.1): o texto está, ou vai aparecer, no campo do destino. Cada rodada confere se
   * já dá para apertar o Enter — destino livre, o usuário sem rascunho nem digitando, e a marca do recado no
   * campo (isso o `retomar` confere). Passado `RETOMADA_ESPERA` sem nada, avisa quem mandou.
   */
  const retomarRecado = async (id: string, ret: Retomada): Promise<void> => {
    const situacao = await d.situacao(id)
    if (situacao === null || situacao === 'encerrado') {
      retomadas.delete(id)
      for (const item of [...(filas.get(id) ?? [])]) terminar(id, item, 'sem-destino')
      return
    }
    const motivo = motivoDeEspera(situacao, d.usuario(id), d.agora())
    motivos.set(id, motivo)
    if (!motivo && d.agora() >= ret.proxima) {
      entregando.add(id)
      try {
        const r = await d.retomar(id, textoDoRecado(ret.item.recado, d.shell(id)))
        if (r === 'saiu' || r === 'incerto') {
          retomadas.delete(id)
          ultimaEntrega.set(id, d.agora())
          const fim: FimDoRecado = r === 'saiu' ? 'entregue' : 'incerto'
          concluir(id, ret.item, fim, fim === 'incerto' ? await d.tela(id, 15) : undefined)
          return
        }
        ret.proxima = d.agora() + RETOMADA_INTERVALO
      } finally {
        entregando.delete(id)
      }
    }
    if (d.agora() - ret.desde < RETOMADA_ESPERA) return avisarSeMudou(id)
    retomadas.delete(id)
    const tela = await d.tela(id, 15)
    const nome = d.nome(id) ?? 'o destino'
    const { recado } = ret.item
    terminar(id, ret.item, 'ficou', tela)
    desistidos.set(id, textoDoRecado(recado, d.shell(id)))
    if (recado.de && d.nome(recado.de) !== null) {
      enfileirar({
        tipo: 'aviso',
        de: null,
        deNome: 'Orkester',
        para: recado.de,
        texto:
          `O recado para "${nome}" NÃO foi enviado: ficou escrito no campo de entrada dele (ou nem apareceu) e, em ${RETOMADA_ESPERA / 60_000} min, ` +
          `o app não achou o momento seguro de apertar Enter (ele ocupado, ou com texto do usuário no campo).\n` +
          `Últimas linhas da tela dele:\n${citarTela(tela)}\nVeja com \`ork ver "${nome}"\` antes de mandar de novo, para não duplicar.`
      })
    }
  }

  /** desde quando o agente de um aviso é visto trabalhando, por recado */
  const trabalhandoDesde = new Map<string, number>()

  /**
   * Avisos que falam de um agente que sumiu, ou que voltou a trabalhar de vez (visto assim por 3 s seguidos: um eco
   * na tela por um instante não basta), são velhos: cancelados, sem digitar. Um aviso já digitado (retomada) não volta atrás.
   */
  const cancelarAvisosVelhos = async (id: string): Promise<void> => {
    for (const item of [...(filas.get(id) ?? [])]) {
      const sobre = item.recado.sobre
      if (!sobre || retomadas.get(id)?.item === item) continue
      const situacao = await d.situacao(sobre)
      if (situacao === 'trabalhando') {
        const desde = trabalhandoDesde.get(item.recado.id) ?? d.agora()
        trabalhandoDesde.set(item.recado.id, desde)
        if (d.agora() - desde < TRABALHANDO_PARA_VELHO) continue
      } else if (situacao !== null || d.nome(sobre) !== null) {
        trabalhandoDesde.delete(item.recado.id)
        continue
      }
      trabalhandoDesde.delete(item.recado.id)
      terminar(id, item, 'cancelado')
      // voltou a trabalhar: quem pediu ainda espera a entrega, então a pendência volta (já o vimos trabalhar)
      if (situacao === 'trabalhando') {
        const ultima = ultimaPendencia.get(sobre)
        if (ultima && ultima.de === id && !pendencias.has(sobre)) {
          ultimaPendencia.delete(sobre)
          pendencias.set(sobre, { ...ultima, desde: d.agora(), trabalhou: true, paradoDesde: 0, segundoPlanoDesde: 0 })
        }
      }
    }
  }

  /** O próximo da fila: a retomada em curso primeiro; depois entregas e pedidos passam na frente de avisos. */
  const proximoDaFila = (id: string): NaFila | undefined => {
    const fila = filas.get(id) ?? []
    const ret = retomadas.get(id)
    if (ret && fila.includes(ret.item)) return ret.item
    return fila.find((x) => !ehAviso(x.recado.tipo)) ?? fila[0]
  }

  const tentarEntregar = async (id: string): Promise<void> => {
    if (entregando.has(id)) return
    await cancelarAvisosVelhos(id)
    const primeiro = proximoDaFila(id)
    if (!primeiro) return
    const desistido = desistidos.get(id)
    if (desistido !== undefined) {
      if (await d.marcaNoCampo(id, desistido)) {
        motivos.set(id, 'recado-antigo')
        return avisarSeMudou(id)
      }
      desistidos.delete(id)
    }
    const ret = retomadas.get(id)
    if (ret) {
      if (ret.item === primeiro) return retomarRecado(id, ret)
      retomadas.delete(id)
    }
    if ((await d.situacao(id)) === null) {
      for (const item of [...(filas.get(id) ?? [])]) terminar(id, item, 'sem-destino')
      return
    }
    const motivo = await motivoAgora(id)
    motivos.set(id, motivo)
    if (motivo === 'encerrado') {
      for (const item of [...(filas.get(id) ?? [])]) terminar(id, item, 'sem-destino')
      return
    }
    if (motivo) return avisarSeMudou(id)
    // cancelado enquanto se olhava o destino (`cancelar`): não digita
    if (!filas.get(id)?.includes(primeiro)) return avisarSeMudou(id)
    entregando.add(id)
    digitando.set(id, primeiro)
    try {
      const r = await d.digitar(id, textoDoRecado(primeiro.recado, d.shell(id)))
      ultimaEntrega.set(id, d.agora())
      // `ficou`: o texto está (ou vai aparecer) no campo e o Enter não o mandou. Não se cola de novo (duplicaria) e
      // o recado NÃO é consumido: fica à espera, e `retomarRecado` aperta o Enter quando for seguro. Num shell
      // não há campo para conferir: o `ficou` encerra como antes.
      if (r === 'ficou' && !d.shell(id)) {
        const agora = d.agora()
        retomadas.set(id, { item: primeiro, desde: agora, proxima: agora })
        d.registrar(primeiro.recado, 'ficou', await d.tela(id, 15))
        avisarSeMudou(id)
        return
      }
      const fim: FimDoRecado = r === 'saiu' ? 'entregue' : r === 'incerto' ? 'incerto' : 'ficou'
      concluir(id, primeiro, fim, fim === 'entregue' ? undefined : await d.tela(id, 15))
    } finally {
      entregando.delete(id)
      digitando.delete(id)
    }
  }

  const abrirPendencia = (de: string, para: string): void => {
    ultimaPendencia.delete(para)
    pendencias.set(para, { de, para, desde: d.agora(), trabalhou: false, paradoDesde: 0 })
  }

  const reabrirPendencia = (de: string, para: string): void => {
    if (pendencias.has(para)) return
    const ultima = ultimaPendencia.get(para)
    if (!ultima || ultima.de !== de) return
    ultimaPendencia.delete(para)
    pendencias.set(para, { ...ultima, desde: d.agora(), trabalhou: false, paradoDesde: 0 })
  }

  const conferirPendencias = async (): Promise<void> => {
    for (const p of [...pendencias.values()]) {
      if ((vigias.get(p.para) ?? 0) > 0) continue
      if (d.nome(p.de) === null) {
        pendencias.delete(p.para)
        continue
      }
      const situacao = (await d.situacao(p.para)) ?? 'encerrado'
      const segundoPlano = situacao === 'livre' && d.segundoPlano ? await d.segundoPlano(p.para) : false
      const { pendencia, avisar, descartar } = decidirPendencia(p, situacao, d.agora(), segundoPlano, d.fechadoDeProposito?.(p.para) ?? false)
      if (descartar) {
        pendencias.delete(p.para)
        ultimaPendencia.delete(p.para)
        continue
      }
      if (!avisar) {
        if (pendencias.get(p.para) === p) pendencias.set(p.para, pendencia)
        continue
      }
      pendencias.delete(p.para)
      // lembrada só para `reabrirPendencia`: quem responder a esta parada (`ork teclas`) rearma o aviso da próxima
      if (avisar === 'encerrou') ultimaPendencia.delete(p.para)
      else ultimaPendencia.set(p.para, p)
      const nome = d.nome(p.para) ?? 'o agente'
      const tela = avisar === 'encerrou' ? '' : await d.tela(p.para, 15)
      // `encerrou` não envelhece: é o fato de o agente ter saído, e quem pediu precisa saber mesmo com o cartão já fechado
      enfileirar({ tipo: 'aviso', de: null, deNome: 'Orkester', para: p.de, texto: textoDoAviso(nome, avisar, tela), sobre: avisar === 'encerrou' ? undefined : p.para })
    }
  }

  const enfileirar: Caixa['enfileirar'] = (r) => {
    const recado: Recado = { ...r, id: d.novoId(), criadoEm: d.agora() }
    let resolver!: (fim: FimDoRecado) => void
    const fim = new Promise<FimDoRecado>((ok) => (resolver = ok))
    const fila = filas.get(r.para) ?? []
    fila.push({ recado, resolver })
    filas.set(r.para, fila)
    avisarSeMudou(r.para)
    return { id: recado.id, posicao: fila.length, fim }
  }

  return {
    enfileirar,
    async rodada() {
      if (rodando) return
      rodando = true
      try {
        await Promise.all([...filas.keys()].map((id) => tentarEntregar(id)))
        await conferirPendencias()
        // um aviso recém-posto já pode sair nesta mesma passada
        await Promise.all([...filas.keys()].map((id) => tentarEntregar(id)))
      } finally {
        rodando = false
      }
    },
    resumo,
    motivoAgora,
    abrirPendencia,
    reabrirPendencia,
    fecharPendencia: (para) => {
      pendencias.delete(para)
      ultimaPendencia.delete(para)
    },
    pendenciaDe: (para) => pendencias.get(para),
    vigiar(para) {
      vigias.set(para, (vigias.get(para) ?? 0) + 1)
      let solto = false
      return () => {
        if (solto) return
        solto = true
        const n = (vigias.get(para) ?? 1) - 1
        if (n > 0) vigias.set(para, n)
        else vigias.delete(para)
      }
    },
    liberar(id) {
      desistidos.delete(id)
    },
    cancelar(para, id) {
      const item = filas.get(para)?.find((x) => x.recado.id === id)
      if (!item || digitando.get(para) === item || retomadas.get(para)?.item === item) return false
      terminar(para, item, 'cancelado')
      return true
    },
    esquecer(id) {
      for (const item of [...(filas.get(id) ?? [])]) terminar(id, item, 'sem-destino')
      // os avisos que FALAM deste agente moram na fila de outros cartões (de quem pediu): o agente sumiu, eles são velhos
      for (const [outro, fila] of [...filas.entries()]) {
        for (const item of [...fila]) {
          if (item.recado.sobre === id && retomadas.get(outro)?.item !== item) terminar(outro, item, 'cancelado')
        }
      }
      retomadas.delete(id)
      desistidos.delete(id)
      pendencias.delete(id)
      ultimaPendencia.delete(id)
      for (const p of [...pendencias.values()]) if (p.de === id) pendencias.delete(p.para)
      for (const p of [...ultimaPendencia.values()]) if (p.de === id) ultimaPendencia.delete(p.para)
      ultimoResumo.delete(id)
      motivos.delete(id)
    }
  }
}
