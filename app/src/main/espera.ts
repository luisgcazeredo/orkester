import { webContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { CANAIS } from '../shared/api'
import type { ResultadoDaRotina } from '../shared/modelo'
import { PASTA_DADOS, resumosDosEspacos } from './dados'
import { donoDe } from './janelas'
import { extrairLeituraDeContexto, extrairLeituraDoRodape } from './contexto'
import { agenteSaiuParaOShell, confirmarEnvio, DIALOGO, emSegundoPlano, lerProntidao, marcaNoCampo, retomarEnvio, registroDoEnvio, resultadoDaRotina, type ResultadoDoEnvio } from './envio'
import { criarCaixa, janelaDeDialogo, motivoDeEspera, tirarCitacoes, TEXTO_DO_MOTIVO, type FimDoRecado, type MotivoDeEspera, type TipoDeRecado } from './caixa'
import { aceitaColagem, cordasDoEspaco, encerrarAgora, fechadoDeProposito, marcarFechamento, escreverNoProcesso, sessaoPorId, sessoesCriadasPor, sessoesDoEspaco, telaDe, type Sessao } from './terminais'
import { esperar, abrirJanelaPronta, pedirAJanela } from './quadroDoAgente'
import { emitir } from './eventosDeAutomacao'
import { escolherMaestro } from '../shared/kanban'

const TEMPO_PADRAO = 100
const TEMPO_MAX = 3600
/** O que aparece na tela de quem está ocupado (Claude Code e Codex). */
const OCUPADO = /esc to interrupt|esc para interromper/i
/** Um shell esperando comando (PowerShell, cmd, bash, o >>> do Python). */
const PROMPT_LIVRE = /(^PS .*>|[>$#])\s*$/

// ---------- estado e espera ----------

/** `pergunta`: parado num diálogo, esperando alguém responder (nada deve ser digitado nele por engano). */
type Situacao = 'encerrado' | 'trabalhando' | 'pergunta' | 'livre'

/**
 * Poucas linhas podem deixar passar uma pergunta verdadeira e fazer o ork digitar em cima dela (foi assim que
 * o Codex atualizou sem querer em 28/10); linhas demais tratam uma citação velha como pergunta e travam à toa.
 */
function ultimasLinhasComTexto(tela: string, quantidade = 6): string {
  return janelaDeDialogo(tela, quantidade)
}

/** O app abriu um agente neste cartão e a tela agora termina no prompt do PowerShell: o agente saiu. */
function saiuParaOShell(s: Sessao, tela: string): boolean {
  return !!s.lancouAgente && s.espec.agente !== 'shell' && agenteSaiuParaOShell(tela)
}

export function situacaoNaTela(s: Sessao, tela: string): Situacao {
  if (!s.processo) return 'encerrado'
  // a pergunta vem antes de "teve saída agora": uma pergunta que acabou de aparecer não pode receber texto
  if (s.espec.agente !== 'shell' && DIALOGO.test(ultimasLinhasComTexto(tela))) return 'pergunta'
  if (Date.now() - s.ultimaSaida < 1200) return 'trabalhando'
  // o agente saiu para o PowerShell (1.5.3): para o app ele está encerrado, e nada é colado nem apertado num shell
  if (saiuParaOShell(s, tela)) return 'encerrado'
  // shell: livre só com o prompt no fim (um comando quieto, como um Start-Sleep, ainda está rodando)
  if (s.espec.agente === 'shell') return PROMPT_LIVRE.test(tela.split('\n').pop() ?? '') ? 'livre' : 'trabalhando'
  return OCUPADO.test(tirarCitacoes(tela)) ? 'trabalhando' : 'livre'
}

export async function situacao(s: Sessao): Promise<Situacao> {
  return situacaoNaTela(s, await telaDe(s, 20))
}

export { extrairContextoRestante } from './contexto'

type LeituraDoContexto = { contexto: number | null; medidoEm?: number; agora: boolean; codex: boolean }
// A chave fraca acompanha a própria sessão: quando o cartão é removido pelo terminal, seu cache não fica retido.
const ultimosContextos = new WeakMap<Sessao, { contexto: number; medidoEm: number }>()

function ultimoContexto(s: Sessao, codex = false): LeituraDoContexto {
  const ultimo = ultimosContextos.get(s)
  return ultimo
    ? { contexto: ultimo.contexto, medidoEm: ultimo.medidoEm, agora: false, codex }
    : { contexto: null, agora: false, codex }
}

function guardarContexto(s: Sessao, contexto: number): LeituraDoContexto {
  const medidoEm = Date.now()
  ultimosContextos.set(s, { contexto, medidoEm })
  return { contexto, medidoEm, agora: true, codex: false }
}

/** Leitura sem digitar nada. A saída de `/context` só vale quando foi medida por este processo. */
export function contextoNaTela(s: Sessao, tela: string): LeituraDoContexto {
  if (s.espec.agente === 'codex') return ultimoContexto(s, true)
  const leitura = extrairLeituraDoRodape(tela)
  if (leitura) return guardarContexto(s, leitura.percentual)
  return ultimoContexto(s)
}

/**
 * No Claude, `/context` é a única fonte real de contexto. Só o `ork orcamento` pede essa medição, e apenas se o
 * terminal estiver livre; `quem` e o painel ficam no último valor bom para não poluir conversas em segundo plano.
 */
async function medirContextoDoClaude(s: Sessao, telaAntes: string, cancelado: () => boolean): Promise<number | null> {
  const limite = Date.now() + 10_000
  while (Date.now() < limite && !cancelado()) {
    const tela = await telaDe(s, 80)
    // Só aceitamos o `/context` que acabou de chegar; uma saída antiga ainda no histórico não reinicia a hora.
    if (tela !== telaAntes) {
      const leitura = extrairLeituraDeContexto(tela)
      if (leitura?.origem === 'comando-claude') return leitura.percentual
    }
    await esperar(100)
  }
  return null
}

export async function contextoRestante(s: Sessao, medir = false, cancelado: () => boolean = () => false): Promise<LeituraDoContexto> {
  const tela = await telaDe(s, 80)
  const passivo = contextoNaTela(s, tela)
  if (passivo.agora || !medir || s.espec.agente !== 'claude') return passivo
  if (situacaoNaTela(s, tela) !== 'livre') return passivo

  await digitarPedido(s, '/context')
  const medicao = await medirContextoDoClaude(s, tela, cancelado)
  return medicao !== null ? guardarContexto(s, medicao) : ultimoContexto(s)
}

export const textoDoContexto = (leitura: LeituraDoContexto): string => {
  if (leitura.codex) return 'contexto: o Codex não expõe contexto'
  if (leitura.contexto === null) return 'contexto: não deu para ler'
  if (leitura.agora) return `contexto: ${leitura.contexto}% restante`
  const quando = new Date(leitura.medidoEm!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `contexto: ${leitura.contexto}% restante (medido às ${quando})`
}

/** Espera começar (até 8 s) e depois sossegar (livre ou numa pergunta) por 2,5 s seguidos. false = o tempo acabou antes. */
export async function aguardarFim(s: Sessao, ms: number, cancelado: () => boolean): Promise<boolean> {
  const limite = Date.now() + ms
  for (const comeco = Date.now() + Math.min(8000, ms); Date.now() < comeco && !cancelado(); await esperar(250)) {
    if ((await situacao(s)) === 'trabalhando') break
  }
  let paradoDesde = 0
  while (Date.now() < limite && !cancelado()) {
    const agora = await situacao(s)
    if (agora === 'encerrado') return true
    if (agora === 'trabalhando') {
      paradoDesde = 0
    } else {
      paradoDesde ||= Date.now()
      if (Date.now() - paradoDesde >= 2500) return true
    }
    await esperar(250)
  }
  return false
}

/** Sessão recém-aberta: espera o agente desenhar a tela dele e sossegar, ou parar numa pergunta. */
export async function aguardarPronto(
  s: Sessao,
  ms: number,
  cancelado: () => boolean
): Promise<'pronto' | 'confirmar' | 'desconhecido' | 'tempo' | 'encerrado' | 'saiu'> {
  // Codex (1.5.3): o pulo da oferta de atualização termina ANTES de olhar a ficha. Em paralelo, a ficha podia cair na
  // oferta, e colar nela **instala o Codex**. O pulo recria a TUI: o resto da espera (tela parada e estável) cobre isso.
  // o prazo conta desde a chamada, incluindo a espera do pulo (ela não soma por cima dos `ms`)
  const limite = Date.now() + ms
  if (s.espec.agente === 'codex' && s.puloDaAtualizacao) {
    await Promise.race([s.puloDaAtualizacao, esperar(Math.min(ms, 45_000))])
  }
  let anterior: string | null = null
  for (; Date.now() < limite && !cancelado(); await esperar(300)) {
    if (!s.processo) return 'encerrado'
    const quieto = Date.now() - s.ultimaSaida
    // agente: 3 s de tela parada. O Claude Code 2.1.322 desenha a tela de pronto antes de ligar a entrada, e
    // o que chega nessa janela fica guardado e aparece tarde (12/11/2026). Shell responde na hora.
    if (Date.now() - s.iniciadoEm < 2000 || quieto < (s.espec.agente === 'shell' ? 1500 : 3000)) {
      anterior = null
      continue
    }
    if (s.espec.agente === 'shell') return 'pronto'
    const tela = await telaDe(s, 40)
    // a leitura da tela (saiu para o shell, diálogo, TUI pronta e estável, tela desconhecida) é pura: ver `lerProntidao`
    const leitura = lerProntidao({ agente: s.espec.agente, lancouAgente: !!s.lancouAgente, tela, emDialogo: DIALOGO.test(ultimasLinhasComTexto(tela)), anterior, quietoMs: quieto })
    anterior = leitura.anterior
    if (leitura.estado !== 'esperar') return leitura.estado
  }
  return 'tempo'
}

/** Nada é digitado num terminal parado numa pergunta: devolve a tela para quem pediu decidir. */
export async function recusarSeEmPergunta(s: Sessao): Promise<void> {
  if ((await situacao(s)) !== 'pergunta') return
  throw new Error(
    `"${s.espec.nome}" está parado numa pergunta (confiança na pasta, permissão, atualização…) e nada foi digitado. ` +
      `Responda com \`ork teclas "${s.espec.nome}" …\` se for seguro, ou pergunte ao usuário. Tela:\n${await telaDe(s, 25)}`
  )
}

/**
 * Digita o pedido e confirma que ele **saiu**. Quem chamou tem de contar a quem pediu quando não saiu: voltar
 * calado é o que fez um pedido sumir na tela do Codex em 09/11/2026 — o Maestro achou que tinha falado, e do
 * outro lado ninguém tinha ouvido. `saiu`: confirmado. `ficou`: escrito no compositor (ou nem chegou), NÃO
 * enviado. `incerto`: pode ter saído; não reenvie sem ver a tela.
 */
/** `sinal` (opcional): abortado, nenhuma tecla a mais sai e a promessa rejeita com `EnvioCancelado` (ver envio.ts). */
export async function digitarPedido(s: Sessao, texto: string, sinal?: AbortSignal): Promise<ResultadoDoEnvio> {
  const limpo = texto.replace(/\r\n?/g, '\n').trimEnd()
  const escreverColagem = (): void => {
    if (s.espec.agente !== 'shell' && aceitaColagem(s)) {
      escreverNoProcesso(s, `\x1b[200~${limpo.replace(/\x1b\[20[01]~/g, '')}\x1b[201~`)
    } else {
      escreverNoProcesso(s, s.espec.agente === 'shell' ? limpo.replace(/\n/g, '\r') : limpo.replace(/\n/g, ' '))
    }
  }
  // O Enter vai separado da colagem e só depois de ela aparecer (a espera fixa de 250 ms perdeu pedido no Codex
  // em 09/11/2026). Quem espera, aperta e confirma é `confirmarEnvio`, em `envio.ts`, que tem prova.
  return confirmarEnvio({
    texto: limpo,
    shell: s.espec.agente === 'shell',
    escreverColagem,
    escrever: (dados) => escreverNoProcesso(s, dados),
    // 24 linhas: o campo de entrada com um texto longo (Codex) ocupa várias, e o sinal dele fica no alto
    tela: () => telaDe(s, 24),
    emPergunta: async () => (await situacao(s)) === 'pergunta',
    esperar,
    ocupado: (tela) => OCUPADO.test(tela),
    // o usuário começou a escrever no campo durante as esperas: nenhum Enter (mandaria o rascunho dele)
    interromper: () => motivoDeEspera('livre', s.usuario, Date.now()) !== null,
    sinal
  })
}

/** O que dizer a quem pediu quando o envio não foi confirmado. `incerto` não manda reenviar às cegas. */
export async function avisoDeEnvio(s: Sessao, r: 'ficou' | 'incerto', linhas: number): Promise<string> {
  const nome = s.espec.nome
  const quadro = `Tela agora:\n${await telaDe(s, linhas)}`
  if (r === 'incerto') {
    return (
      `não consegui confirmar se o pedido saiu em "${nome}": não separo o campo de entrada do histórico na tela. ` +
      `Ele PODE ter sido enviado — veja com \`ork ver "${nome}"\` antes de mandar de novo, para não duplicar.\n${quadro}`
    )
  }
  return (
    `o pedido NÃO foi enviado a "${nome}": ficou escrito no campo de entrada (ou nem chegou lá) e o Enter não ` +
    `o mandou. Veja com \`ork ver "${nome}"\`, resolva o que estiver em cima com \`ork teclas\` e mande de novo.\n${quadro}`
  )
}

/**
 * Digita num cartão por conta do app (é o que as rotinas usam). **Só digita se o terminal estiver livre:**
 * ocupado, parado numa pergunta ou com o processo encerrado, pula a vez e diz por quê. Escrever no meio do
 * trabalho de um agente — ou em cima de uma pergunta — é exatamente o que uma tarefa do Windows faria.
 */
export async function dispararNoTerminal(id: string, texto: string, sinal?: AbortSignal): Promise<ResultadoDaRotina> {
  const s = sessaoPorId(id)
  if (!s || s.fim) return 'sem-cartao'
  const agora = await situacao(s)
  if (agora !== 'livre') return agora === 'encerrado' ? 'encerrado' : agora === 'pergunta' ? 'pergunta' : 'ocupado'
  // o usuário escrevendo nesse cartão (ou com texto no campo) também é "ocupado": a rotina não cola por cima
  if (motivoDeEspera(agora, s.usuario, Date.now())) return 'ocupado'
  // `incerto` não vira `nao-enviou`: a rotina repetiria e duplicaria o pedido. Fica anotado no registro.
  if (sinal?.aborted) return 'nao-enviou'
  const envio = await digitarPedido(s, texto, sinal)
  registrar(s, null, registroDoEnvio('rotina', envio).comando, texto)
  return resultadoDaRotina(envio)
}

export function registrar(de: Sessao, para: Sessao | null, comando: string, texto = ''): void {
  try {
    const pasta = join(PASTA_DADOS, 'registro')
    mkdirSync(pasta, { recursive: true })
    const quando = new Date()
    const dia = `${quando.getFullYear()}-${String(quando.getMonth() + 1).padStart(2, '0')}-${String(quando.getDate()).padStart(2, '0')}`
    const linha = { quando: quando.toISOString(), espaco: de.espacoId, de: de.espec.nome, para: para?.espec.nome ?? null, comando, texto: texto.slice(0, 4000) }
    appendFileSync(join(pasta, `${dia}.jsonl`), `${JSON.stringify(linha)}\n`, 'utf8')
  } catch {
    // registro é extra: não atrapalha o comando
  }
}

// ---------- a caixa de entrada ----------

/**
 * Nada que um agente manda a outro é digitado na hora: entra na caixa do destino, e o app digita um de cada
 * vez, com o destino livre e sem o usuário escrevendo nele. O porquê está em `caixa.ts`.
 */
export const caixa = criarCaixa({
  agora: () => Date.now(),
  novoId: () => randomUUID(),
  situacao: async (id) => {
    const s = sessaoPorId(id)
    return s && !s.fim ? situacao(s) : null
  },
  usuario: (id) => sessaoPorId(id)?.usuario ?? { ultimaTecla: 0, rascunho: 0, ultimoEsc: 0 },
  nome: (id) => {
    const s = sessaoPorId(id)
    return s && !s.fim ? s.espec.nome : null
  },
  segundoPlano: async (id) => {
    const s = sessaoPorId(id)
    // o rodapé do Claude Code ("1 shell", "still running"): livre para digitar, mas só esperando o comando dele
    return !!s?.processo && s.espec.agente === 'claude' && emSegundoPlano(await telaDe(s, 6))
  },
  fechadoDeProposito,
  espacoDe: (id) => sessaoPorId(id)?.espacoId ?? null,
  // a mesma regra do kanban (`maestroDo`), sem importar o kanban (ele importa a caixa daqui)
  maestroDe: (espacoId) =>
    escolherMaestro(
      sessoesDoEspaco(espacoId).map((s) => ({
        id: s.id,
        nome: s.espec.nome,
        funcao: s.espec.funcao,
        criadoPor: s.espec.criadoPor,
        agente: s.espec.agente,
        vivo: !!s.processo && !s.fim
      }))
    )?.id ?? null,
  shell: (id) => sessaoPorId(id)?.espec.agente === 'shell',
  tela: async (id, linhas) => {
    const s = sessaoPorId(id)
    return s ? telaDe(s, linhas) : ''
  },
  digitar: async (id, texto) => {
    const s = sessaoPorId(id)
    if (!s?.processo) return 'ficou'
    // o destino pode ter caído numa pergunta entre a olhada da caixa e agora: não digita em cima dela
    if ((await situacao(s)) === 'pergunta') return 'ficou'
    return digitarPedido(s, texto)
  },
  retomar: async (id, texto) => {
    const s = sessaoPorId(id)
    if (!s?.processo) return 'sem-marca'
    return retomarEnvio({
      texto: texto.replace(/\r\n?/g, '\n').trimEnd(),
      shell: s.espec.agente === 'shell',
      escrever: (dados) => escreverNoProcesso(s, dados),
      tela: () => telaDe(s, 24),
      emPergunta: async () => (await situacao(s)) === 'pergunta',
      esperar,
      ocupado: (tela) => OCUPADO.test(tela),
      // o usuário voltou a escrever no campo (ou o destino ficou ocupado/numa pergunta): nenhum Enter a mais
      interromper: () => motivoDeEspera('livre', s.usuario, Date.now()) !== null || Date.now() - s.ultimaSaida < 1200
    })
  },
  marcaNoCampo: async (id, texto) => {
    const s = sessaoPorId(id)
    return !!s?.processo && marcaNoCampo(await telaDe(s, 24), texto.replace(/\r\n?/g, '\n').trimEnd())
  },
  mudou: (id, resumo) => {
    const s = sessaoPorId(id)
    const dono = s ? donoDe(s.espacoId) : undefined
    const janela = dono !== undefined ? webContents.fromId(dono) : undefined
    if (janela && !janela.isDestroyed()) janela.send(CANAIS.caixa, id, resumo)
  },
  registrar: (recado, fim, tela) => {
    const para = sessaoPorId(recado.para) ?? null
    const de = recado.de ? sessaoPorId(recado.de) : undefined
    // `ficou`/`incerto`: junto do recado vão as últimas linhas do destino (o registro corta em 4000 letras)
    const texto = tela === undefined ? recado.texto : `${recado.texto.slice(0, 2400)}\n[tela do destino]\n${tela.slice(-1400)}`
    if (para) registrar(de ?? para, para, `caixa-${recado.tipo}-${fim}`, texto)
    // automações (1.9.6): "entrega chegou", no espaço de quem recebeu. A cadeia (se veio de automação) o motor acha.
    if (para && recado.tipo === 'entrega' && (fim === 'entregue' || fim === 'incerto')) {
      emitir(para.espacoId, { tipo: 'entrega', de: recado.de, deNome: recado.deNome, para: para.id, paraNome: para.espec.nome, texto: recado.texto.slice(0, 1500) })
    }
  }
})

/** Espera a caixa digitar o recado, até `ms`. null = continua na fila (o app entrega sozinho depois). */
export async function porNaCaixa(
  eu: Sessao,
  alvo: Sessao,
  tipo: TipoDeRecado,
  texto: string,
  ms: number,
  cancelado: () => boolean
): Promise<{ fim: FimDoRecado | null; posicao: number; motivo: MotivoDeEspera | null }> {
  const { posicao, fim } = caixa.enfileirar({ tipo, de: eu.id, deNome: eu.espec.nome, para: alvo.id, texto })
  let chegou: FimDoRecado | null = null
  void fim.then((f) => (chegou = f))
  void caixa.rodada()
  for (const limite = Date.now() + ms; !chegou && Date.now() < limite && !cancelado(); await esperar(150)) {
    // a rodada do relógio é de segundo em segundo; aqui, quem está esperando apressa
    void caixa.rodada()
  }
  return { fim: chegou, posicao, motivo: chegou ? null : await caixa.motivoAgora(alvo.id) }
}

/** O que dizer a quem mandou quando o recado ficou na fila. */
export function textoNaFila(alvo: Sessao, posicao: number, motivo: MotivoDeEspera | null, oQue: 'pedido' | 'entrega'): string {
  const porque = motivo ? TEXTO_DO_MOTIVO[motivo] : 'a vez dele ainda não chegou'
  const artigo = oQue === 'pedido' ? 'O pedido' : 'A entrega'
  return (
    `${artigo} está na caixa de entrada de "${alvo.espec.nome}" (${posicao}º da fila; agora: ${porque}). ` +
    `O Orkester digita sozinho quando ele ficar livre e o usuário não estiver escrevendo nele. NÃO mande de novo.`
  )
}

/** Quem pode receber uma entrega minha: os ligados, quem me abriu e quem me deu a tarefa pela caixa. */
export function quemRecebeDe(eu: Sessao): Sessao[] {
  const extras = [eu.espec.criadoPor, caixa.pendenciaDe(eu.id)?.de]
    .map((id) => (id ? sessaoPorId(id) : undefined))
    .filter((s): s is Sessao => !!s && !s.fim)
  return [...new Map([...ligadosA(eu), ...extras].map((s) => [s.id, s])).values()]
}

// ---------- quem fala com quem ----------

/** Quem está ligado a mim por corda, mais quem eu abri, mesmo se estiver em outro espaço. */
export function ligadosA(eu: Sessao): Sessao[] {
  const ids = new Set<string>()
  for (const [a, b] of cordasDoEspaco(eu.espacoId)) {
    if (a === eu.id) ids.add(b)
    if (b === eu.id) ids.add(a)
  }
  const porCorda = sessoesDoEspaco(eu.espacoId).filter((s) => s.id !== eu.id && ids.has(s.id))
  const meus = sessoesCriadasPor(eu.id)
  return [...new Map([...porCorda, ...meus].map((s) => [s.id, s])).values()]
}

export function acharEntre(lista: Sessao[], nome: string | undefined): Sessao {
  if (!nome) throw new Error('diga com quem: o nome do cartão (veja `ork quem`)')
  const procurado = nome.trim().toLowerCase()
  const exatos = lista.filter((s) => s.espec.nome.toLowerCase() === procurado || s.id === procurado)
  const candidatos = exatos.length ? exatos : lista.filter((s) => s.espec.nome.toLowerCase().startsWith(procurado))
  if (candidatos.length === 1) return candidatos[0]
  const nomes = lista.map((s) => `"${s.espec.nome}"`).join(', ') || 'ninguém'
  if (candidatos.length > 1) throw new Error(`mais de um cartão com "${nome}": ${candidatos.map((s) => `"${s.espec.nome}"`).join(', ')}`)
  throw new Error(`ninguém ligado a você se chama "${nome}". Ligados: ${nomes}`)
}

export function tempoDe(opcoes: Record<string, unknown>): number {
  const n = Number(opcoes.tempo ?? TEMPO_PADRAO)
  return Number.isFinite(n) && n > 0 ? Math.min(n, TEMPO_MAX) : TEMPO_PADRAO
}

export async function resultado(s: Sessao, segundos: number, cancelado: () => boolean, quemEspera?: Sessao): Promise<string> {
  // quem está esperando o fim vai ver a tela: enquanto isso, a caixa não manda o aviso de "parou"
  const soltar = caixa.vigiar(s.id)
  let terminou: boolean
  try {
    terminou = await aguardarFim(s, segundos * 1000, cancelado)
  } finally {
    soltar()
  }
  if (terminou && quemEspera && caixa.pendenciaDe(s.id)?.de === quemEspera.id) caixa.fecharPendencia(s.id)
  const tela = await telaDe(s, 60)
  if (terminou && (await situacao(s)) === 'pergunta') {
    return `"${s.espec.nome}" parou numa pergunta e espera resposta (responda com \`ork teclas\` se for seguro, ou pergunte ao usuário). Tela:\n${tela}`
  }
  if (terminou) return `"${s.espec.nome}" terminou. Tela:\n${tela}`
  return `"${s.espec.nome}" ainda está trabalhando depois de ${segundos} s. Use \`ork esperar "${s.espec.nome}"\` depois. Tela agora:\n${tela}`
}

/** Fecha cartões pelo mesmo pedido que o `ork fechar`; só roda depois de responder ao terminal que pediu saída. */
export async function fecharCartoesDepoisDaResposta(sessoes: Sessao[]): Promise<void> {
  for (const s of sessoes) {
    const desmarcar = marcarFechamento(s.id)
    try {
      await abrirJanelaPronta(s.espacoId)
      const r = await pedirAJanela({ tipo: 'fechar', espacoId: s.espacoId, id: s.id })
      if (r.ok) encerrarAgora(s.id)
      else desmarcar() // recusado: o cartão segue vivo, a próxima saída dele avisa
    } catch {
      desmarcar()
      // A resposta já saiu: não há cliente esperando este detalhe. O cartão continua visível para o usuário recuperar.
    }
  }
}

/** Todos os filhos vivos, em qualquer profundidade; propriedade ruim não pode prender o fechamento num ciclo. */
/** "1 sessão" / "2 sessões": o app fala português com os agentes. */
export const contaSessoes = (n: number): string => `${n} ${n === 1 ? 'sessão' : 'sessões'}`

export function descendentesDe(id: string): Sessao[] {
  const vistos = new Set([id])
  const descendentes: Sessao[] = []
  const fila = [id]
  while (fila.length) {
    const criador = fila.shift()!
    for (const filho of sessoesCriadasPor(criador)) {
      if (vistos.has(filho.id)) continue
      vistos.add(filho.id)
      descendentes.push(filho)
      fila.push(filho.id)
    }
  }
  return descendentes
}

const nomeDoEspaco = (id: string): string => resumosDosEspacos().find((espaco) => espaco.id === id)?.nome ?? id

/**
 * A loja é quem grava propriedade e cordas. Centralizar a passagem mantém `fechar` e `passar` com o mesmo bastão,
 * inclusive quando os cartões estão em janelas diferentes. É o `ork fechar`: passa só os filhos. O `ork passar` é
 * `passarPapel`, logo abaixo.
 */
export async function transferirSessoes(antigo: Sessao, sucessor: Sessao, transferidas: Sessao[]): Promise<void> {
  if (!transferidas.length) return
  const porEspaco = new Map<string, Sessao[]>()
  for (const s of transferidas) porEspaco.set(s.espacoId, [...(porEspaco.get(s.espacoId) ?? []), s])
  const sucessorEraDoAntigo = sucessor.espec.criadoPor === antigo.id
  if (sucessorEraDoAntigo && !porEspaco.has(sucessor.espacoId)) porEspaco.set(sucessor.espacoId, [])
  // Reservar todas as janelas antes de mudar qualquer cartão reduz a chance de uma passagem pela metade.
  for (const espacoId of porEspaco.keys()) await abrirJanelaPronta(espacoId)
  const concluidos: Array<[string, Sessao[]]> = []
  try {
    for (const [espacoId, sessoes] of porEspaco) {
      const r = await pedirAJanela({
        tipo: 'passar',
        espacoId,
        ids: sessoes.map((s) => s.id),
        sucessor: sucessor.id,
        novoCriador: sucessor.id,
        antigo: antigo.id,
        ...(sucessorEraDoAntigo && espacoId === sucessor.espacoId ? { donoDoSucessor: null } : {})
      })
      if (!r.ok) throw new Error(r.erro)
      concluidos.push([espacoId, sessoes])
    }
  } catch (erro) {
    const causa = erro instanceof Error ? erro.message : String(erro)
    const voltaram: string[] = []
    const presos: Array<[string, Sessao[]]> = []
    // Cada janela já foi reservada. Mesmo assim, anotar o desfazer que falhar evita dizer que nada mudou.
    for (const [espacoId, sessoes] of concluidos.reverse()) {
      try {
        const r = await pedirAJanela({
          tipo: 'passar',
          espacoId,
          ids: sessoes.map((s) => s.id),
          sucessor: sucessor.id,
          novoCriador: antigo.id,
          antigo: sucessor.id,
          ...(sucessorEraDoAntigo && espacoId === sucessor.espacoId ? { donoDoSucessor: antigo.id } : {})
        })
        if (r.ok) voltaram.push(nomeDoEspaco(espacoId))
        else presos.push([espacoId, sessoes])
      } catch {
        presos.push([espacoId, sessoes])
      }
    }
    if (presos.length) {
      // Sem confirmação do desfazer, conservamos o dono novo no main para não devolver ao antigo um acesso divergente da loja.
      for (const [, sessoes] of presos) for (const s of sessoes) s.espec = { ...s.espec, criadoPor: sucessor.id }
      if (sucessorEraDoAntigo && presos.some(([espacoId]) => espacoId === sucessor.espacoId)) {
        sucessor.espec = { ...sucessor.espec, criadoPor: undefined }
      }
      const ficaram = presos.map(([espacoId]) => nomeDoEspaco(espacoId))
      const detalhe = `falhou: ${causa}; voltaram: ${voltaram.join(', ') || 'nenhum'}; ficaram com o sucessor: ${ficaram.join(', ')}`
      registrar(antigo, sucessor, 'passar parcial', detalhe)
      throw new Error(
        `a passagem falhou: ${causa}. Voltaram: ${voltaram.join(', ') || 'nenhum'}. ` +
          `A propriedade no(s) espaço(s) ${ficaram.join(', ')} ficou com "${sucessor.espec.nome}".`
      )
    }
    registrar(antigo, sucessor, 'passar desfeito', `falhou: ${causa}; voltaram: ${voltaram.join(', ') || 'nenhum'}`)
    throw new Error(`não passei nada: ${causa}. Voltei: ${voltaram.join(', ') || 'nenhum'}.`)
  }
  for (const s of transferidas) s.espec = { ...s.espec, criadoPor: sucessor.id }
  if (sucessorEraDoAntigo) sucessor.espec = { ...sucessor.espec, criadoPor: undefined }
}

/**
 * `ork passar` (1.9.6): passa o papel inteiro — os filhos, todas as cordas do antigo e a caixa dele (filas e quem
 * espera entrega), mesmo sem filhos. Só dentro de um espaço (`recusaDaPassagem`, conferida antes, por quem chama):
 * assim o quadro é UMA transformação na janela do espaço, que aplica tudo ou nada, e a caixa (só memória, síncrona)
 * muda depois de ela confirmar. Falhou: nada mudou, e o antigo não deve sair.
 */
export async function passarPapel(antigo: Sessao, sucessor: Sessao, filhos: Sessao[]): Promise<{ recados: number; pendencias: number }> {
  const fora = [sucessor, ...filhos].filter((s) => s.espacoId !== antigo.espacoId)
  if (fora.length) throw new Error(`não passei nada: ${fora.map((s) => `"${s.espec.nome}"`).join(', ')} em outro espaço`)
  const sucessorEraDoAntigo = sucessor.espec.criadoPor === antigo.id
  await abrirJanelaPronta(antigo.espacoId)
  const r = await pedirAJanela({
    tipo: 'passar',
    espacoId: antigo.espacoId,
    ids: filhos.map((s) => s.id),
    sucessor: sucessor.id,
    novoCriador: sucessor.id,
    antigo: antigo.id,
    ...(sucessorEraDoAntigo ? { donoDoSucessor: null } : {}),
    papel: true
  })
  if (!r.ok) throw new Error(`não passei nada: ${r.erro}`)
  for (const s of filhos) s.espec = { ...s.espec, criadoPor: sucessor.id }
  if (sucessorEraDoAntigo) sucessor.espec = { ...sucessor.espec, criadoPor: undefined }
  return caixa.passar(antigo.id, sucessor.id)
}
