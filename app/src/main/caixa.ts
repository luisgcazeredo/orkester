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
  encerrado: 'o processo dele está encerrado'
}

// ---------- recados ----------

export type TipoDeRecado = 'pedido' | 'entrega' | 'aviso'

export interface Recado {
  id: string
  tipo: TipoDeRecado
  /** Sessão que mandou; null = o próprio app. */
  de: string | null
  deNome: string
  para: string
  texto: string
  criadoEm: number
}

export type FimDoRecado = 'entregue' | 'incerto' | 'ficou' | 'sem-destino' | 'cancelado'

/**
 * O que vai digitado no destino. O pedido vai como veio (é o texto do agente); entrega e aviso ganham cabeçalho.
 * Num **shell**, entrega e aviso vão como comentário (`# ` em cada linha): colados crus, o PowerShell executaria
 * cada linha — inclusive as linhas da tela de outro agente que o aviso carrega.
 */
export function textoDoRecado(r: Pick<Recado, 'tipo' | 'deNome' | 'texto'>, shell = false): string {
  if (r.tipo === 'pedido') return r.texto
  const texto = r.tipo === 'entrega' ? `[ork · entrega de "${r.deNome}"]\n${r.texto}` : `[ork · aviso do Orkester]\n${r.texto}`
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
/** Se nunca o vimos trabalhar, depois disto conta como se tivesse (pedido curto demais para a rodada ver). */
const SEM_VER_TRABALHAR = 60_000

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
}

/** O que fazer com uma pendência nesta rodada. */
export function decidirPendencia(p: Pendencia, situacao: Situacao, agora: number): { pendencia: Pendencia; avisar: 'parou' | 'pergunta' | 'encerrou' | null } {
  if (situacao === 'encerrado') return { pendencia: p, avisar: 'encerrou' }
  if (situacao === 'trabalhando') return { pendencia: { ...p, trabalhou: true, paradoDesde: 0 }, avisar: null }
  const trabalhou = p.trabalhou || agora - p.desde >= SEM_VER_TRABALHAR
  if (!trabalhou) return { pendencia: p, avisar: null }
  const paradoDesde = p.paradoDesde || agora
  const limite = situacao === 'pergunta' ? PERGUNTA_PARA_AVISO : PARADO_PARA_AVISO
  if (agora - paradoDesde >= limite) return { pendencia: { ...p, trabalhou, paradoDesde }, avisar: situacao === 'pergunta' ? 'pergunta' : 'parou' }
  return { pendencia: { ...p, trabalhou, paradoDesde }, avisar: null }
}

function textoDoAviso(nome: string, motivo: 'parou' | 'pergunta' | 'encerrou', tela: string): string {
  const cabeca = {
    parou: `"${nome}" terminou o que você pediu e parou sem mandar a entrega pelo \`ork entregar\`.`,
    pergunta: `"${nome}" parou numa pergunta e espera resposta (responda com \`ork teclas\` se for seguro, ou pergunte ao usuário).`,
    encerrou: `O processo de "${nome}" terminou antes de mandar a entrega.`
  }[motivo]
  const fim = motivo === 'encerrou' ? '' : `\nLeia a tela inteira com \`ork ver "${nome}" --linhas 200\`.`
  return `${cabeca}\nÚltimas linhas da tela dele:\n${tela.trim() || '(vazia)'}${fim}`
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
  /** o destino é um shell (entrega e aviso vão como comentário) */
  shell(id: string): boolean
  tela(id: string, linhas: number): Promise<string>
  /** digita e confirma (é o `digitarPedido` do comandos.ts) */
  digitar(id: string, texto: string): Promise<ResultadoDoEnvio>
  /** a fila de um cartão mudou: avisa a janela */
  mudou(id: string, resumo: ResumoDaCaixa): void
  registrar(recado: Recado, fim: FimDoRecado): void
}

interface NaFila {
  recado: Recado
  resolver: (fim: FimDoRecado) => void
}

export interface Caixa {
  /** Põe o recado na fila do destino. A promessa resolve quando ele foi digitado (ou não pôde ser). */
  enfileirar(r: Omit<Recado, 'id' | 'criadoEm'>): { id: string; posicao: number; fim: Promise<FimDoRecado> }
  /** Uma passada: entrega o que pode e confere as pendências. O app chama de segundo em segundo. */
  rodada(): Promise<void>
  resumo(id: string): ResumoDaCaixa
  motivoAgora(id: string): Promise<MotivoDeEspera | null>
  abrirPendencia(de: string, para: string): void
  fecharPendencia(para: string): void
  pendenciaDe(para: string): Pendencia | undefined
  /** quem pediu está esperando o fim agora mesmo (`ork pedir`/`ork esperar`): sem aviso enquanto isso */
  vigiar(para: string): () => void
  /** a sessão saiu do app: os recados para ela não têm mais destino */
  esquecer(id: string): void
}

export function criarCaixa(d: DependenciasDaCaixa): Caixa {
  const filas = new Map<string, NaFila[]>()
  const entregando = new Set<string>()
  const pendencias = new Map<string, Pendencia>()
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

  const terminar = (id: string, item: NaFila, fim: FimDoRecado): void => {
    const fila = filas.get(id) ?? []
    const resto = fila.filter((x) => x !== item)
    if (resto.length) filas.set(id, resto)
    else filas.delete(id)
    d.registrar(item.recado, fim)
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

  const tentarEntregar = async (id: string): Promise<void> => {
    const primeiro = filas.get(id)?.[0]
    if (!primeiro || entregando.has(id)) return
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
    entregando.add(id)
    try {
      const r = await d.digitar(id, textoDoRecado(primeiro.recado, d.shell(id)))
      ultimaEntrega.set(id, d.agora())
      // `ficou`: o texto está no campo e o Enter não o mandou. Não se tenta de novo (duplicaria): quem
      // mandou fica sabendo, e o texto continua lá para o usuário ver.
      const fim: FimDoRecado = r === 'saiu' ? 'entregue' : r === 'incerto' ? 'incerto' : 'ficou'
      if (fim !== 'ficou' && primeiro.recado.tipo === 'pedido' && primeiro.recado.de) abrirPendencia(primeiro.recado.de, id)
      if (primeiro.recado.tipo === 'entrega' && primeiro.recado.de) {
        // a entrega chegou: quem a mandou cumpriu o pedido
        if (pendencias.get(primeiro.recado.de)?.de === id) pendencias.delete(primeiro.recado.de)
      }
      terminar(id, primeiro, fim)
    } finally {
      entregando.delete(id)
    }
  }

  const abrirPendencia = (de: string, para: string): void => {
    pendencias.set(para, { de, para, desde: d.agora(), trabalhou: false, paradoDesde: 0 })
  }

  const conferirPendencias = async (): Promise<void> => {
    for (const p of [...pendencias.values()]) {
      if ((vigias.get(p.para) ?? 0) > 0) continue
      if (d.nome(p.de) === null) {
        pendencias.delete(p.para)
        continue
      }
      const situacao = (await d.situacao(p.para)) ?? 'encerrado'
      const { pendencia, avisar } = decidirPendencia(p, situacao, d.agora())
      if (!avisar) {
        if (pendencias.get(p.para) === p) pendencias.set(p.para, pendencia)
        continue
      }
      pendencias.delete(p.para)
      const nome = d.nome(p.para) ?? 'o agente'
      const tela = avisar === 'encerrou' ? '' : await d.tela(p.para, 15)
      enfileirar({ tipo: 'aviso', de: null, deNome: 'Orkester', para: p.de, texto: textoDoAviso(nome, avisar, tela) })
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
    fecharPendencia: (para) => void pendencias.delete(para),
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
    esquecer(id) {
      for (const item of [...(filas.get(id) ?? [])]) terminar(id, item, 'sem-destino')
      pendencias.delete(id)
      for (const p of [...pendencias.values()]) if (p.de === id) pendencias.delete(p.para)
      ultimoResumo.delete(id)
      motivos.delete(id)
    }
  }
}
