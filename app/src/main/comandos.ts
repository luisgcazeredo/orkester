import { ipcMain, webContents } from 'electron'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Socket } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { CANAIS, CANAIS_AGENTES, CANAIS_CHAVES, primeiroPedidoDoCartao, type PedidoDoAgente, type ResultadoDoPrimeiroPedido, type RespostaAoAgente, type ResumoContextoTerminal } from '../shared/api'
import type { Agente, ResultadoDaRotina, ResumoEspaco } from '../shared/modelo'
import { MAX_FICHAS, lerFicha, type FichaDeCatalogo } from '../shared/catalogo'
import type { ChaveGuardada, ComandoDoMcp } from '../shared/chaves'
import { usuarioPorChave } from './chaves'
import { nodeServe } from '../shared/node-do-sistema'
import type { PedidoNoQuadro } from '../shared/quadro/agente'
import { criarEspacoDoAgente, PASTA_DADOS, resumosDosEspacos } from './dados'
import { abrirJanela, donoDe } from './janelas'
import { abrirCorreio, pastaDoCorreio } from './correio'
import { AJUDA, SKILL } from './manual'
import { extrairLeituraDeContexto, extrairLeituraDoRodape } from './contexto'
import { confirmarEnvio, registroDoEnvio, resultadoDaRotina, type ResultadoDoEnvio } from './envio'
import { validarChamada, type NomeDeVerbo } from './verbos'
import { criarCaixa, motivoDeEspera, TEXTO_DO_MOTIVO, type FimDoRecado, type MotivoDeEspera, type TipoDeRecado } from './caixa'
import {
  aceitaColagem,
  cordasDoEspaco,
  encerrarAgora,
  escreverNoProcesso,
  esperarSessao,
  esquecerRascunho,
  sessaoPorCracha,
  sessaoPorId,
  sessoesCriadasPor,
  sessoesDoEspaco,
  telaDe,
  type Sessao
} from './terminais'

// O `ork`: a linha de comando dos agentes. Cada terminal do app ganha no ambiente o endereço de um pipe local
// (ORK_PIPE) e um crachá próprio (ORK_CRACHA), e a pasta com o `ork` no PATH. O `ork` (src/cli/ork.ts) manda uma
// linha JSON e recebe uma de volta. A corda entre dois terminais é a permissão: sem corda, não há conversa.
// O nome do crachá não tem KEY, TOKEN nem SECRET: o Codex tira essas variáveis do ambiente dos comandos.
// A corda é regra de convívio, não fronteira de segurança: todos os agentes rodam como o mesmo usuário do Windows e
// um pode ler o ambiente (e o crachá) de outro. O crachá muda a cada processo e deixa de valer quando ele sai.

const AUTOTESTE = process.argv.includes('--autoteste')
const PIPE =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\orkester-${randomBytes(12).toString('hex')}`
    : join(tmpdir(), `orkester-${randomBytes(12).toString('hex')}.sock`)
const PASTA_BIN = join(PASTA_DADOS, 'bin')
const MAX_PEDIDO = 512 * 1024
const MAX_CONEXOES = 128
const TEMPO_PADRAO = 100
const TEMPO_MAX = 3600
/** O que aparece na tela de quem está ocupado (Claude Code e Codex). */
const OCUPADO = /esc to interrupt|esc para interromper/i
/**
 * Rodapés e perguntas de diálogo (confiança na pasta, servidores MCP, permissão de ferramenta, atualização,
 * sim/não). Olhando só o fim da tela: o texto da conversa pode citar essas palavras.
 */
const DIALOGO =
  /enter to confirm|esc to cancel|esc to reject|enter continue|press enter to continue|update now|update available|new version available|atualiza[çc][ãa]o dispon[íi]vel|trust this folder|do you trust|do you want to proceed|\(y\/n\)|\[y\/n\]/i
/** Agente desenhado e esperando o primeiro pedido (Claude Code e Codex). */
const PRONTO = /for shortcuts|context left|ask codex|try "write a test for <filepath>"|auto mode on \(shift\+tab to cycle\)/i
/** A última linha é o prompt do PowerShell: o agente nem abriu, ou já saiu. */
const PROMPT_DO_SHELL = /^PS .*>\s*$/
/** Um shell esperando comando (PowerShell, cmd, bash, o >>> do Python). */
const PROMPT_LIVRE = /(^PS .*>|[>$#])\s*$/

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** O cli.js como o app o tem: fora do app.asar (asarUnpack), dentro da pasta de instalação. */
function cliDoApp(): string {
  return join(__dirname, 'cli.js').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}

/** Onde o `ork` lê o CLI: a cópia que mora junto dos dados. Ver `shared/node-do-sistema.ts` para o porquê. */
function caminhoDoCli(): string {
  return join(PASTA_BIN, 'cli', 'cli.js')
}

/**
 * Copia o CLI (e os `chunks/` que o bundler separa) da pasta de instalação para `~/.orkester/bin/cli`.
 *
 * O sandbox do Codex nega a pasta de instalação inteira, e a pasta de dados não. São uns 30 KB; copiar a
 * cada abertura mantém a cópia casada com a versão do app, o que importa porque o CLI e o app conversam
 * por um protocolo que muda junto.
 */
function copiarCli(): void {
  try {
    const destino = join(PASTA_BIN, 'cli')
    mkdirSync(destino, { recursive: true })
    cpSync(cliDoApp(), join(destino, 'cli.js'))
    // o servidor MCP mora junto: o cliente de fora o chama pelo Node do sistema, fora da pasta de instalação
    const mcp = join(dirname(cliDoApp()), 'mcp.js')
    if (existsSync(mcp)) cpSync(mcp, join(destino, 'mcp.js'))
    const chunks = join(dirname(cliDoApp()), 'chunks')
    if (existsSync(chunks)) cpSync(chunks, join(destino, 'chunks'), { recursive: true })
  } catch (erro) {
    console.error('não consegui copiar o ork para a pasta de dados', erro)
  }
}

/**
 * O Node do sistema, se houver e se servir — é com ele que o `ork` roda, para o agente sandboxed
 * conseguir usá-lo. Sem Node, volta para o Electron do app, que funciona para quem não está num sandbox.
 */
function nodeDoSistema(): string | null {
  try {
    const versao = execFileSync('node', ['-v'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()
    if (!nodeServe(versao)) return null
    return execFileSync('node', ['-p', 'process.execPath'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim()
  } catch {
    return null
  }
}

/**
 * A pasta que o agente pediu em `--pasta`, resolvida **a partir da pasta dele**.
 *
 * Antes era usada como veio, e um `--pasta mural` era procurado na pasta do app — não na do agente. Ele
 * recusou quatro vezes com "a pasta não existe: mural", com a pasta existindo ao lado de quem pediu
 * (visto em 10/11/2026). O agente trabalha dentro de uma pasta; caminho relativo dele é relativo a ela.
 */
function pastaPedida(eu: Sessao, pedida: unknown): string | undefined {
  if (typeof pedida !== 'string' || !pedida.trim()) return undefined
  const caminho = resolve(eu.espec.pasta, pedida.trim())
  if (!existsSync(caminho) || !statSync(caminho).isDirectory()) {
    throw new Error(`a pasta não existe: ${pedida} (procurei em ${caminho})`)
  }
  return caminho
}

/** Variáveis que cada terminal ganha para o `ork` funcionar. */
export function ambienteDoComando(s: Sessao): { pastaBin: string; variaveis: Record<string, string> } {
  return {
    pastaBin: PASTA_BIN,
    variaveis: { ORK_PIPE: PIPE, ORK_CORREIO: pastaDoCorreio(), ORK_CRACHA: s.cracha, ORK_TERMINAL: s.espec.nome, ORK_NODE: process.execPath, ORK_CLI: caminhoDoCli() }
  }
}

function gravarSeMudou(caminho: string, conteudo: string): void {
  try {
    if (existsSync(caminho) && readFileSync(caminho, 'utf8') === conteudo) return
    writeFileSync(caminho, conteudo, 'utf8')
  } catch (erro) {
    console.error('não consegui gravar', caminho, erro)
  }
}

/** O `ork` no PATH dos terminais: um .cmd (PowerShell e cmd) e um script sh (o Git Bash do Claude Code). */
function instalarComando(): void {
  mkdirSync(PASTA_BIN, { recursive: true })
  copiarCli()
  // o Node do sistema é escolhido aqui, uma vez, e gravado no atalho: decidir isso dentro de um .cmd
  // seria frágil, e o atalho tem de ser burro
  const node = nodeDoSistema()
  gravarSeMudou(
    join(PASTA_BIN, 'ork.cmd'),
    [
      '@echo off',
      'rem Orkester: o comando dos agentes (so funciona dentro de um terminal do app)',
      'if not defined ORK_PIPE (echo ork: so funciona dentro de um terminal do Orkester 1>&2 & exit /b 2)',
      'setlocal',
      'set ELECTRON_RUN_AS_NODE=1',
      node ? `"${node}" "%ORK_CLI%" %*` : '"%ORK_NODE%" "%ORK_CLI%" %*',
      'exit /b %ERRORLEVEL%',
      ''
    ].join('\r\n')
  )
  gravarSeMudou(
    join(PASTA_BIN, 'ork'),
    [
      '#!/bin/sh',
      '# Orkester: o comando dos agentes (so funciona dentro de um terminal do app)',
      'if [ -z "$ORK_PIPE" ]; then echo "ork: so funciona dentro de um terminal do Orkester" >&2; exit 2; fi',
      node ? `exec "${node}" "$ORK_CLI" "$@"` : 'ELECTRON_RUN_AS_NODE=1 exec "$ORK_NODE" "$ORK_CLI" "$@"',
      ''
    ].join('\n')
  )
  // o app se chamava Maestri Próprio até 06/11/2026: o comando velho sai do PATH para ninguém chamar os dois
  for (const antigo of ['mpro.cmd', 'mpro']) rmSync(join(PASTA_BIN, antigo), { force: true })
  // o manual vira skill do Claude Code e do Codex (decisão do Luís, 28/10/2026); fora do app ela manda não usar
  if (AUTOTESTE) return
  for (const pasta of [process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), process.env.CODEX_HOME || join(homedir(), '.codex')]) {
    if (!existsSync(pasta)) continue
    const destino = join(pasta, 'skills', 'orkester')
    mkdirSync(destino, { recursive: true })
    gravarSeMudou(join(destino, 'SKILL.md'), SKILL)
    // e a skill com o nome antigo sai: duas skills ensinando comandos diferentes confundiriam os agentes
    rmSync(join(pasta, 'skills', 'maestri-proprio'), { recursive: true, force: true })
  }
  liberarOrkNoCodex()
}

/**
 * Poupa o agente de pedir aprovação a cada `ork`, pela regra de execpolicy que o próprio Codex documenta.
 *
 * **O que ela não é:** o que faz o `ork` funcionar. Escrevi isto em 09/11/2026 achando que era — o `ork`
 * morria com "Acesso negado" e eu li aquilo como recusa de aprovação. Era outra coisa: o sandbox nega a
 * pasta de instalação inteira, e o `ork` rodava o Electron de lá (ver `shared/node-do-sistema.ts`). Com o
 * CLI morando na pasta de dados, medi de novo em 10/11/2026: **funciona com e sem esta regra.**
 *
 * O que sobra para ela é o atrito: sem ela, cada `ork` do agente pára pedindo aprovação na tela, e um
 * quadro trabalhando sozinho trava. Em troca, os comandos `ork` rodam fora do sandbox — e o `ork` alcança
 * outros cartões, inclusive um shell. É uma escolha de conveniência contra isolamento, do dono do app;
 * apagar o arquivo devolve as perguntas e não quebra nada. A regra é só para o programa `ork`.
 */
function liberarOrkNoCodex(): void {
  const casa = process.env.CODEX_HOME || join(homedir(), '.codex')
  if (!existsSync(casa)) return
  const regra = [
    '# Escrito pelo Orkester. Deixa o agente usar o `ork` — o comando com que ele fala com o app que o',
    '# abriu. Sem esta regra o Codex recusa o comando dentro do sandbox e o agente fica mudo.',
    '# Vale só para o `ork`: qualquer outro comando continua passando pelas suas regras de sempre.',
    'prefix_rule(',
    '    pattern = ["ork"],',
    '    decision = "allow",',
    '    justification = "ork: o comando do Orkester, o app que abriu este terminal",',
    '    match = ["ork quem", "ork quadro"],',
    '    not_match = ["git ork"],',
    ')',
    ''
  ].join('\n')
  try {
    const pasta = join(casa, 'rules')
    mkdirSync(pasta, { recursive: true })
    gravarSeMudou(join(pasta, 'orkester.rules'), regra)
  } catch {
    // sem permissão de escrever na casa do Codex: o agente vai pedir aprovação, que é o de antes
  }
}

// ---------- pedidos que mexem no quadro: vão para a janela dona do espaço ----------

const respostas = new Map<string, { janela: number; resolver: (r: RespostaAoAgente) => void }>()
/** Janelas que já instalaram o atendente do renderer. */
const janelasProntas = new Set<number>()

function janelaDoEspaco(espacoId: string) {
  const dono = donoDe(espacoId)
  const janela = dono !== undefined ? webContents.fromId(dono) : undefined
  return janela && !janela.isDestroyed() ? janela : undefined
}

/** Uma janela reservada ainda está carregando: pedido antes do atendente se perderia no IPC. */
async function abrirJanelaPronta(espacoId: string): Promise<{ jaEstavaAberta: boolean }> {
  const jaEstavaAberta = !!janelaDoEspaco(espacoId)
  if (!abrirJanela(espacoId)) throw new Error('não consegui abrir uma janela para este espaço')
  for (const limite = Date.now() + 10_000; Date.now() < limite; await esperar(50)) {
    const janela = janelaDoEspaco(espacoId)
    if (janela && janelasProntas.has(janela.id)) return { jaEstavaAberta }
  }
  throw new Error('a janela do espaço abriu, mas não ficou pronta para atender em 10 s; tente de novo')
}

function pedirAJanela(pedido: PedidoDoAgente): Promise<RespostaAoAgente> {
  const janela = janelaDoEspaco(pedido.espacoId)
  if (!janela) {
    return Promise.resolve({ ok: false, erro: 'o espaço deste terminal não está aberto em nenhuma janela; peça ao usuário para abri-lo' })
  }
  const id = randomUUID()
  return new Promise((resolver) => {
    const limite = setTimeout(() => {
      respostas.delete(id)
      resolver({ ok: false, erro: 'a janela do app não respondeu' })
    }, 10_000)
    respostas.set(id, {
      janela: janela.id,
      resolver: (r) => {
        clearTimeout(limite)
        respostas.delete(id)
        resolver(r)
      }
    })
    janela.send(CANAIS_AGENTES.pedido, id, pedido)
  })
}

// ---------- estado e espera ----------

/** `pergunta`: parado num diálogo, esperando alguém responder (nada deve ser digitado nele por engano). */
type Situacao = 'encerrado' | 'trabalhando' | 'pergunta' | 'livre'

/**
 * Poucas linhas podem deixar passar uma pergunta verdadeira e fazer o ork digitar em cima dela (foi assim que
 * o Codex atualizou sem querer em 28/10); linhas demais tratam uma citação velha como pergunta e travam à toa.
 */
function ultimasLinhasComTexto(tela: string, quantidade = 6): string {
  return tela.split('\n').filter((linha) => linha.trim()).slice(-quantidade).join('\n')
}

function situacaoNaTela(s: Sessao, tela: string): Situacao {
  if (!s.processo) return 'encerrado'
  // a pergunta vem antes de "teve saída agora": uma pergunta que acabou de aparecer não pode receber texto
  if (s.espec.agente !== 'shell' && DIALOGO.test(ultimasLinhasComTexto(tela))) return 'pergunta'
  if (Date.now() - s.ultimaSaida < 1200) return 'trabalhando'
  // shell: livre só com o prompt no fim (um comando quieto, como um Start-Sleep, ainda está rodando)
  if (s.espec.agente === 'shell') return PROMPT_LIVRE.test(tela.split('\n').pop() ?? '') ? 'livre' : 'trabalhando'
  return OCUPADO.test(tela) ? 'trabalhando' : 'livre'
}

async function situacao(s: Sessao): Promise<Situacao> {
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
function contextoNaTela(s: Sessao, tela: string): LeituraDoContexto {
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

async function contextoRestante(s: Sessao, medir = false, cancelado: () => boolean = () => false): Promise<LeituraDoContexto> {
  const tela = await telaDe(s, 80)
  const passivo = contextoNaTela(s, tela)
  if (passivo.agora || !medir || s.espec.agente !== 'claude') return passivo
  if (situacaoNaTela(s, tela) !== 'livre') return passivo

  await digitarPedido(s, '/context')
  const medicao = await medirContextoDoClaude(s, tela, cancelado)
  return medicao !== null ? guardarContexto(s, medicao) : ultimoContexto(s)
}

const textoDoContexto = (leitura: LeituraDoContexto): string => {
  if (leitura.codex) return 'contexto: o Codex não expõe contexto'
  if (leitura.contexto === null) return 'contexto: não deu para ler'
  if (leitura.agora) return `contexto: ${leitura.contexto}% restante`
  const quando = new Date(leitura.medidoEm!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `contexto: ${leitura.contexto}% restante (medido às ${quando})`
}

/** Espera começar (até 8 s) e depois sossegar (livre ou numa pergunta) por 2,5 s seguidos. false = o tempo acabou antes. */
async function aguardarFim(s: Sessao, ms: number, cancelado: () => boolean): Promise<boolean> {
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
async function aguardarPronto(
  s: Sessao,
  ms: number,
  cancelado: () => boolean
): Promise<'pronto' | 'confirmar' | 'desconhecido' | 'tempo' | 'encerrado'> {
  for (const limite = Date.now() + ms; Date.now() < limite && !cancelado(); await esperar(300)) {
    if (!s.processo) return 'encerrado'
    const quieto = Date.now() - s.ultimaSaida
    if (Date.now() - s.iniciadoEm < 2000 || quieto < 1500) continue
    if (s.espec.agente === 'shell') return 'pronto'
    const tela = await telaDe(s, 40)
    if (DIALOGO.test(ultimasLinhasComTexto(tela))) return 'confirmar'
    if (PRONTO.test(tela)) return 'pronto'
    // Quieto, sem a marca de pronto e sem diálogo conhecido: uma tela que eu não sei ler.
    //
    // Isto já devolveu 'pronto', e foi assim que o aviso de atualização do Codex comeu dois pedidos em
    // 09/11/2026: o app digitou em cima de um menu que não entendia. Reconhecer mais frases ajuda, mas
    // nunca vai acabar — cada versão de cada agente inventa uma tela nova. A regra que não envelhece é
    // outra: **não se digita numa tela que não foi reconhecida**, e quem pediu fica sabendo.
    if (quieto > 6000 && tela.trim() && !PROMPT_DO_SHELL.test(tela.split('\n').pop() ?? '')) return 'desconhecido'
  }
  return 'tempo'
}

/** Nada é digitado num terminal parado numa pergunta: devolve a tela para quem pediu decidir. */
async function recusarSeEmPergunta(s: Sessao): Promise<void> {
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
async function digitarPedido(s: Sessao, texto: string): Promise<ResultadoDoEnvio> {
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
    tela: () => telaDe(s, 12),
    emPergunta: async () => (await situacao(s)) === 'pergunta',
    esperar,
    ocupado: (tela) => OCUPADO.test(tela)
  })
}

/** O que dizer a quem pediu quando o envio não foi confirmado. `incerto` não manda reenviar às cegas. */
async function avisoDeEnvio(s: Sessao, r: 'ficou' | 'incerto', linhas: number): Promise<string> {
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
export async function dispararNoTerminal(id: string, texto: string): Promise<ResultadoDaRotina> {
  const s = sessaoPorId(id)
  if (!s || s.fim) return 'sem-cartao'
  const agora = await situacao(s)
  if (agora !== 'livre') return agora === 'encerrado' ? 'encerrado' : agora === 'pergunta' ? 'pergunta' : 'ocupado'
  // o usuário escrevendo nesse cartão (ou com texto no campo) também é "ocupado": a rotina não cola por cima
  if (motivoDeEspera(agora, s.usuario, Date.now())) return 'ocupado'
  // `incerto` não vira `nao-enviou`: a rotina repetiria e duplicaria o pedido. Fica anotado no registro.
  const envio = await digitarPedido(s, texto)
  registrar(s, null, registroDoEnvio('rotina', envio).comando, texto)
  return resultadoDaRotina(envio)
}

function registrar(de: Sessao, para: Sessao | null, comando: string, texto = ''): void {
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
const caixa = criarCaixa({
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
  mudou: (id, resumo) => {
    const s = sessaoPorId(id)
    const dono = s ? donoDe(s.espacoId) : undefined
    const janela = dono !== undefined ? webContents.fromId(dono) : undefined
    if (janela && !janela.isDestroyed()) janela.send(CANAIS.caixa, id, resumo)
  },
  registrar: (recado, fim) => {
    const para = sessaoPorId(recado.para) ?? null
    const de = recado.de ? sessaoPorId(recado.de) : undefined
    if (para) registrar(de ?? para, para, `caixa-${recado.tipo}-${fim}`, recado.texto)
  }
})

/** Espera a caixa digitar o recado, até `ms`. null = continua na fila (o app entrega sozinho depois). */
async function porNaCaixa(
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
function textoNaFila(alvo: Sessao, posicao: number, motivo: MotivoDeEspera | null, oQue: 'pedido' | 'entrega'): string {
  const porque = motivo ? TEXTO_DO_MOTIVO[motivo] : 'a vez dele ainda não chegou'
  const artigo = oQue === 'pedido' ? 'O pedido' : 'A entrega'
  return (
    `${artigo} está na caixa de entrada de "${alvo.espec.nome}" (${posicao}º da fila; agora: ${porque}). ` +
    `O Orkester digita sozinho quando ele ficar livre e o usuário não estiver escrevendo nele. NÃO mande de novo.`
  )
}

/** Quem pode receber uma entrega minha: os ligados, quem me abriu e quem me deu a tarefa pela caixa. */
function quemRecebeDe(eu: Sessao): Sessao[] {
  const extras = [eu.espec.criadoPor, caixa.pendenciaDe(eu.id)?.de]
    .map((id) => (id ? sessaoPorId(id) : undefined))
    .filter((s): s is Sessao => !!s && !s.fim)
  return [...new Map([...ligadosA(eu), ...extras].map((s) => [s.id, s])).values()]
}

// ---------- quem fala com quem ----------

/** Quem está ligado a mim por corda, mais quem eu abri, mesmo se estiver em outro espaço. */
function ligadosA(eu: Sessao): Sessao[] {
  const ids = new Set<string>()
  for (const [a, b] of cordasDoEspaco(eu.espacoId)) {
    if (a === eu.id) ids.add(b)
    if (b === eu.id) ids.add(a)
  }
  const porCorda = sessoesDoEspaco(eu.espacoId).filter((s) => s.id !== eu.id && ids.has(s.id))
  const meus = sessoesCriadasPor(eu.id)
  return [...new Map([...porCorda, ...meus].map((s) => [s.id, s])).values()]
}

function acharEntre(lista: Sessao[], nome: string | undefined): Sessao {
  if (!nome) throw new Error('diga com quem: o nome do cartão (veja `ork quem`)')
  const procurado = nome.trim().toLowerCase()
  const exatos = lista.filter((s) => s.espec.nome.toLowerCase() === procurado || s.id === procurado)
  const candidatos = exatos.length ? exatos : lista.filter((s) => s.espec.nome.toLowerCase().startsWith(procurado))
  if (candidatos.length === 1) return candidatos[0]
  const nomes = lista.map((s) => `"${s.espec.nome}"`).join(', ') || 'ninguém'
  if (candidatos.length > 1) throw new Error(`mais de um cartão com "${nome}": ${candidatos.map((s) => `"${s.espec.nome}"`).join(', ')}`)
  throw new Error(`ninguém ligado a você se chama "${nome}". Ligados: ${nomes}`)
}

function tempoDe(opcoes: Record<string, unknown>): number {
  const n = Number(opcoes.tempo ?? TEMPO_PADRAO)
  return Number.isFinite(n) && n > 0 ? Math.min(n, TEMPO_MAX) : TEMPO_PADRAO
}

async function resultado(s: Sessao, segundos: number, cancelado: () => boolean, quemEspera?: Sessao): Promise<string> {
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
async function fecharCartoesDepoisDaResposta(sessoes: Sessao[]): Promise<void> {
  for (const s of sessoes) {
    try {
      await abrirJanelaPronta(s.espacoId)
      const r = await pedirAJanela({ tipo: 'fechar', espacoId: s.espacoId, id: s.id })
      if (r.ok) encerrarAgora(s.id)
    } catch {
      // A resposta já saiu: não há cliente esperando este detalhe. O cartão continua visível para o usuário recuperar.
    }
  }
}

/** Todos os filhos vivos, em qualquer profundidade; propriedade ruim não pode prender o fechamento num ciclo. */
/** "1 sessão" / "2 sessões": o app fala português com os agentes. */
const contaSessoes = (n: number): string => `${n} ${n === 1 ? 'sessão' : 'sessões'}`

function descendentesDe(id: string): Sessao[] {
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
 * inclusive quando os cartões estão em janelas diferentes.
 */
async function transferirSessoes(antigo: Sessao, sucessor: Sessao, transferidas: Sessao[]): Promise<void> {
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

const TECLAS: Record<string, string> = {
  enter: '\r',
  esc: '\x1b',
  tab: '\t',
  'shift-tab': '\x1b[Z',
  cima: '\x1b[A',
  up: '\x1b[A',
  baixo: '\x1b[B',
  down: '\x1b[B',
  direita: '\x1b[C',
  right: '\x1b[C',
  esquerda: '\x1b[D',
  left: '\x1b[D',
  'ctrl-c': '\x03',
  'ctrl-d': '\x04',
  backspace: '\x7f',
  espaco: ' ',
  space: ' '
}

function agenteDe(texto: string | undefined): Agente | null {
  const t = (texto ?? '').toLowerCase()
  if (t === 'claude') return 'claude'
  if (t === 'codex') return 'codex'
  if (t === 'shell' || t === 'powershell') return 'shell'
  return null
}

/** O MSYS do Git Bash troca `/context` por `.../Programs/Git/context` antes de chamar o ork. */
function desfazerConversaoDoGitBash(texto: string): string {
  const achou = texto.match(/^(?:[A-Za-z]:)?(?:[\\/][^\\/\r\n]+)*[\\/]Programs[\\/]Git[\\/]([^\\/\s]+)$/i)
  return achou ? `/${achou[1]}` : texto
}

function espacoPorNome(nome: string | undefined) {
  if (!nome?.trim()) throw new Error('diga o nome do espaço (veja `ork espacos`)')
  const procurado = nome.trim().toLocaleLowerCase('pt-BR')
  const achados = resumosDosEspacos().filter((e) => e.nome.trim().toLocaleLowerCase('pt-BR') === procurado)
  if (achados.length === 1) return achados[0]
  if (achados.length > 1) throw new Error(`há mais de um espaço chamado "${nome}"; renomeie um deles pelo quadro`)
  throw new Error(`não existe espaço chamado "${nome}". Veja ork espacos.`)
}

interface Pedido {
  cracha?: unknown
  /** Chave de usuário: um cliente MCP falando pelo cano (ver shared/chaves.ts). */
  chave?: unknown
  comando?: unknown
  posicionais?: unknown
  opcoes?: unknown
  texto?: unknown
}

interface ResultadoDoComando {
  saida: string
  /** Só é executado depois que a resposta saiu pelo pipe do próprio terminal. */
  sair?: Sessao[]
}

interface ContextoDoVerbo {
  eu: Sessao
  pos: string[]
  opcoes: Record<string, string | number | true>
  texto: string
  cancelado: () => boolean
}

type HandlerDoVerbo = (ctx: ContextoDoVerbo) => Promise<ResultadoDoComando>

/** Opção numérica já validada pelo registro (faixa inclusive); ausente fica indefinida. */
const comoNumero = (valor: string | number | true | undefined): number | undefined => (typeof valor === 'number' ? valor : undefined)

/** Leva ao quadro o que o agente pediu. A janela dona do espaço é que aplica, e registra no desfazer. */
async function mexerNoQuadro(eu: Sessao, pedido: Omit<PedidoNoQuadro, 'eu' | 'onde'>): Promise<ResultadoDoComando> {
  await abrirJanelaPronta(eu.espacoId)
  const r = await pedirAJanela({ tipo: 'quadro', espacoId: eu.espacoId, id: eu.id, pedido })
  if (!r.ok) throw new Error(r.erro)
  return { saida: r.texto ?? 'Pronto.' }
}

/**
 * Um handler por verbo, com o nome vindo do registro: o `Record<NomeDeVerbo, …>` não compila se um verbo novo
 * entrar em `verbos.ts` e ninguém escrever o corpo dele. Argumentos e opções já chegam validados.
 */
const HANDLERS: Record<NomeDeVerbo, HandlerDoVerbo> = {
  ajuda: async () => ({ saida: AJUDA }),

  espacos: async ({ eu }) => {
    const linhas = resumosDosEspacos().map((espaco) => {
      const meu = espaco.id === eu.espacoId ? ' · seu espaço' : ''
      return `${meu ? '*' : ' '} "${espaco.nome}" · ${janelaDoEspaco(espaco.id) ? 'janela aberta' : 'sem janela'} · ${espaco.terminais} cartões${meu}`
    })
    return { saida: linhas.join('\n') || 'Não há espaços.' }
  },

  janela: async ({ eu, pos, opcoes }) => {
    if (opcoes.novo) {
      const nome = typeof opcoes.novo === 'string' ? opcoes.novo.trim() : ''
      if (!nome) throw new Error('diga o nome: ork janela --novo "Nome" [--pasta P]')
      const pasta = pastaPedida(eu, opcoes.pasta) ?? eu.espec.pasta
      if (!(existsSync(pasta) && statSync(pasta).isDirectory())) throw new Error(`a pasta não existe: ${pasta}`)
      const espaco = criarEspacoDoAgente(nome, pasta)
      await abrirJanelaPronta(espaco.id)
      return { saida: `Criei o espaço "${espaco.nome}" e abri uma janela nele.` }
    }
    if (opcoes.pasta) throw new Error('`--pasta` só vale com `ork janela --novo "Nome"`')
    const espaco = espacoPorNome(pos[0])
    const { jaEstavaAberta } = await abrirJanelaPronta(espaco.id)
    return {
      saida: jaEstavaAberta
        ? `O espaço "${espaco.nome}" já estava aberto; trouxe a janela para a frente.`
        : `Abri uma janela no espaço "${espaco.nome}".`
    }
  },

  quem: async ({ eu }) => {
    const ligados = ligadosA(eu)
    const linhas = await Promise.all(
      ligados.map(
        async (s) =>
          `  "${s.espec.nome}" · ${s.espec.agente}${s.espec.funcao ? ` · função ${s.espec.funcao}` : ''} · ${await situacao(s)} · ${textoDoContexto(await contextoRestante(s))}${
            s.espec.criadoPor === eu.id ? ' · aberto por você' : ''
          }`
      )
    )
    const filhos = sessoesCriadasPor(eu.id).length
    return {
      saida: [
        `Você é "${eu.espec.nome}" (${eu.espec.agente})${eu.espec.funcao ? ` · função ${eu.espec.funcao}` : ''} · pasta ${eu.espec.pasta} · ${textoDoContexto(await contextoRestante(eu))}`,
        'Ligados a você:',
        ...(linhas.length ? linhas : ['  ninguém (o usuário liga cartões com uma corda; quem você abre continua acessível mesmo em outro espaço)']),
        `Você abriu ${contaSessoes(filhos)}.`
      ].join('\n')
    }
  },

  orcamento: async ({ eu, cancelado }) => ({ saida: textoDoContexto(await contextoRestante(eu, true, cancelado)) }),

  abrir: async ({ eu, pos, opcoes, texto, cancelado }) => {
    // o agente deixou de ser obrigatório na 1.2.5: com `--funcao`, quem diz o motor (e o nível) é o
    // preset da função. Dito à toa, continua valendo e mandando.
    const agente = agenteDe(pos[0])
    const funcaoPedida = typeof opcoes.funcao === 'string' ? opcoes.funcao.trim() : ''
    if (pos[0] && !agente) throw new Error(`não existe o agente "${pos[0]}"; use claude, codex ou shell`)
    if (!agente && !funcaoPedida && !opcoes.preset) {
      throw new Error('diga qual agente: ork abrir claude|codex|shell, ou use --funcao "Papel"')
    }
    const pasta = pastaPedida(eu, opcoes.pasta)
    const nome = typeof opcoes.nome === 'string' ? opcoes.nome.trim().slice(0, 80) || undefined : undefined
    const preset = typeof opcoes.preset === 'string' ? opcoes.preset.trim() || undefined : undefined
    const funcao = typeof opcoes.funcao === 'string' ? opcoes.funcao.trim() || undefined : undefined
    // o primeiro pedido pode vir do --pedido, da função, ou dos dois
    let pedidoInicial = texto
    const espaco = typeof opcoes.espaco === 'string' ? espacoPorNome(opcoes.espaco) : { id: eu.espacoId, nome: '' }
    let novo: Sessao | undefined
    {
      await abrirJanelaPronta(espaco.id)
      const r = await pedirAJanela({ tipo: 'abrir', espacoId: espaco.id, criador: eu.id, agente: agente ?? undefined, preset, nome, pasta, funcao })
      if (!r.ok) throw new Error(r.erro)
      // o prompt da função é o primeiro pedido; com --pedido junto, a função vem antes e o pedido depois
      if (r.texto) pedidoInicial = [r.texto, pedidoInicial].filter(Boolean).join('\n\n')
      novo = r.id ? await esperarSessao(r.id, 5000) : undefined
    }
    if (!novo) throw new Error('o cartão foi criado, mas o processo não abriu')
    registrar(eu, novo, 'abrir', pedidoInicial)
    const aberto =
      novo.espacoId === eu.espacoId
        ? `Abri "${novo.espec.nome}" (${agente}), ligado a você.`
        : `Abri "${novo.espec.nome}" (${agente}) no espaço "${espaco.nome}"; você pode falar com ele porque o abriu.`
    if (!pedidoInicial) return { saida: `${aberto} Mande o primeiro pedido com: ork pedir "${novo.espec.nome}" "…"` }
    const pronto = await aguardarPronto(novo, 90_000, cancelado)
    if (pronto !== 'pronto') {
      const motivo = {
        confirmar:
          'Ele parou numa pergunta (confiar na pasta? servidores MCP? atualização?). O pedido NÃO foi enviado: responda com `ork teclas` se for seguro, ou pergunte ao usuário, e depois use `ork pedir`.',
        desconhecido:
          'Ele parou numa tela que eu não sei ler (um aviso, um menu, uma versão nova do agente). O pedido NÃO foi enviado, de propósito: digitar em cima do que não reconheço já perdeu pedido antes. Veja com `ork ver`, resolva com `ork teclas` se for seguro, e mande com `ork pedir`.',
        tempo: 'Ele não ficou pronto em 90 s; o pedido NÃO foi enviado. Veja com `ork ver` e use `ork pedir` depois.',
        encerrado: 'O processo terminou antes de ficar pronto; o pedido NÃO foi enviado.'
      }[pronto]
      return { saida: `${aberto}\n${motivo}\nTela agora:\n${await telaDe(novo, 30)}` }
    }
    // cartão recém-aberto: ninguém escreveu nele ainda, então o primeiro pedido vai direto, sem caixa
    const envio = await digitarPedido(novo, pedidoInicial)
    if (envio !== 'saiu') return { saida: `${aberto}\n${await avisoDeEnvio(novo, envio, 30)}` }
    // daqui em diante, se ele parar sem `ork entregar`, o app avisa você
    caixa.abrirPendencia(eu.id, novo.id)
    if (!opcoes.esperar || opcoes['sem-esperar']) {
      return {
        saida: `${aberto} Pedido enviado. Quando terminar, ele manda a entrega com \`ork entregar\`; se parar sem mandar, o Orkester avisa você aqui. Não precisa vigiar.`
      }
    }
    return { saida: `${aberto}\n${await resultado(novo, tempoDe(opcoes), cancelado, eu)}` }
  },

  pedir: async ({ eu, pos, opcoes, texto, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    if (!texto.trim()) throw new Error('falta o pedido: ork pedir <nome> "texto" (ou --arquivo pedido.md)')
    if (!alvo.processo) throw new Error(`"${alvo.espec.nome}" está encerrado`)
    await recusarSeEmPergunta(alvo)
    // num agente, o pedido entra na fila dele; num shell rodando um comando, cairia no meio desse comando
    // (com texto do usuário na linha, o shell também parece ocupado: aí não é comando rodando, e o pedido
    // espera na caixa até ele limpar a linha)
    const noShell = alvo.espec.agente === 'shell' ? await situacao(alvo) : null
    // só o texto ainda não enviado conta: tecla recente com Enter no fim é um comando que o usuário rodou,
    // e esse shell está mesmo ocupado
    const doUsuario = noShell === 'trabalhando' && alvo.usuario.rascunho > 0
    if (noShell === 'trabalhando' && !doUsuario) {
      throw new Error(`"${alvo.espec.nome}" está rodando um comando; espere terminar (\`ork esperar "${alvo.espec.nome}"\`) e mande de novo`)
    }
    registrar(eu, alvo, 'pedir', texto)
    // o pedido entra na caixa de entrada dele: só é digitado com ele livre e sem o usuário escrevendo nele
    const comeco = Date.now()
    const segundos = tempoDe(opcoes)
    const espera = opcoes['sem-esperar'] ? 10_000 : segundos * 1000
    const { fim, posicao, motivo } = await porNaCaixa(eu, alvo, 'pedido', texto, espera, cancelado)
    if (fim === null) return { saida: textoNaFila(alvo, posicao, motivo, 'pedido') }
    if (fim === 'sem-destino') throw new Error(`"${alvo.espec.nome}" foi encerrado antes de o pedido entrar; nada foi digitado`)
    if (fim === 'ficou' || fim === 'incerto') throw new Error(await avisoDeEnvio(alvo, fim === 'ficou' ? 'ficou' : 'incerto', 25))
    if (fim === 'cancelado') throw new Error('cancelado')
    if (opcoes['sem-esperar']) {
      return {
        saida: `Pedido enviado para "${alvo.espec.nome}". Quando terminar, ele manda a entrega com \`ork entregar\`; se parar sem mandar, o Orkester avisa você aqui.`
      }
    }
    const resto = Math.max(1, segundos - Math.round((Date.now() - comeco) / 1000))
    return { saida: await resultado(alvo, resto, cancelado, eu) }
  },

  entregar: async ({ eu, opcoes, texto, cancelado }) => {
    if (!texto.trim()) throw new Error('falta a entrega: ork entregar "texto" (ou --arquivo entrega.md)')
    const possiveis = quemRecebeDe(eu)
    let destino: Sessao | undefined
    if (typeof opcoes.para === 'string') {
      destino = acharEntre(possiveis, opcoes.para)
    } else {
      // sem --para: quem deu a tarefa (pela caixa) e, sem isso, quem abriu este cartão
      const quemPediu = caixa.pendenciaDe(eu.id)?.de ?? eu.espec.criadoPor
      destino = possiveis.find((s) => s.id === quemPediu)
    }
    if (!destino) {
      const nomes = possiveis.map((s) => `"${s.espec.nome}"`).join(', ') || 'ninguém'
      throw new Error(`não sei a quem entregar: ninguém te deu tarefa pelo ork e você não foi aberto por um agente. Use --para "Nome" (ao seu alcance: ${nomes})`)
    }
    if (!destino.processo) throw new Error(`"${destino.espec.nome}" está encerrado; a entrega não tem para onde ir. Deixe-a num arquivo e diga o caminho na tela.`)
    // entregou: o app não precisa mais avisar ninguém que você parou
    if (caixa.pendenciaDe(eu.id)?.de === destino.id) caixa.fecharPendencia(eu.id)
    registrar(eu, destino, 'entregar', texto)
    const { fim, posicao, motivo } = await porNaCaixa(eu, destino, 'entrega', texto, 8000, cancelado)
    if (fim === null) {
      return { saida: `${textoNaFila(destino, posicao, motivo, 'entrega')} Você pode encerrar o seu trabalho: não há recibo a esperar.` }
    }
    if (fim === 'entregue') return { saida: `Entrega feita a "${destino.espec.nome}". Não há recibo a esperar: o Orkester confirmou que ela entrou.` }
    if (fim === 'incerto') {
      return { saida: `A entrega foi digitada em "${destino.espec.nome}", mas não deu para confirmar que saiu do campo de entrada. NÃO mande de novo; se precisar, confira com \`ork ver "${destino.espec.nome}"\`.` }
    }
    if (fim === 'ficou') throw new Error(await avisoDeEnvio(destino, 'ficou', 25))
    throw new Error(`"${destino.espec.nome}" foi encerrado antes de a entrega entrar`)
  },

  esperar: async ({ eu, pos, opcoes, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    return { saida: await resultado(alvo, tempoDe(opcoes), cancelado, eu) }
  },

  ver: async ({ eu, pos, opcoes }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    const linhas = Math.min(2000, Math.max(1, Number(opcoes.linhas) || 50))
    return { saida: `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, linhas)}` }
  },

  teclas: async ({ eu, pos }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    const teclas = pos.slice(1)
    if (!teclas.length) throw new Error('quais teclas? ex.: ork teclas <nome> enter (veja `ork ajuda`)')
    const sequencias = teclas.map((t) => {
      const s = TECLAS[t.toLowerCase()] ?? (t.length === 1 ? t : null)
      if (s === null) throw new Error(`tecla desconhecida: ${t}`)
      return s
    })
    registrar(eu, alvo, 'teclas', teclas.join(' '))
    for (const s of sequencias) {
      escreverNoProcesso(alvo, s)
      await esperar(120)
    }
    await esperar(800)
    return { saida: `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, 30)}` }
  },

  limpar: async ({ eu, pos, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    if (!alvo.processo) throw new Error(`"${alvo.espec.nome}" está encerrado`)
    if ((await situacao(alvo)) === 'trabalhando') throw new Error(`"${alvo.espec.nome}" está trabalhando; espere terminar antes de limpar`)
    await recusarSeEmPergunta(alvo)
    registrar(eu, alvo, 'limpar')
    const comandoLimpar =
      alvo.espec.agente === 'claude' ? '/clear' : alvo.espec.agente === 'codex' ? '/new' : process.platform === 'win32' ? 'Clear-Host' : 'clear'
    escreverNoProcesso(alvo, comandoLimpar)
    await esperar(400)
    escreverNoProcesso(alvo, '\r')
    await aguardarFim(alvo, 15_000, cancelado)
    return { saida: `Contexto de "${alvo.espec.nome}" zerado.` }
  },

  /**
   * Os sete verbos com que o agente mexe no quadro. Todos vão pelo mesmo recado, porque quem decide o que
   * acontece é a janela dona do espaço (e lá isso entra no desfazer do usuário).
   */
  quadro: async ({ eu }) => mexerNoQuadro(eu, { acao: 'ler' }),

  mover: async ({ eu, pos, opcoes }) =>
    mexerNoQuadro(eu, {
      acao: 'mover',
      alvos: pos,
      x: comoNumero(opcoes.x),
      y: comoNumero(opcoes.y),
      dx: comoNumero(opcoes.dx),
      dy: comoNumero(opcoes.dy)
    }),

  arrumar: async ({ eu, pos, opcoes }) =>
    mexerNoQuadro(eu, { acao: 'arrumar', alvos: pos, colunas: comoNumero(opcoes.colunas), vao: comoNumero(opcoes.vao) }),

  ler: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'ler-cartao', alvos: [pos.join(' ')] }),

  apagar: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'apagar', alvos: pos }),

  nome: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'nome', alvos: pos.slice(0, 1), texto: pos.slice(1).join(' ') }),

  ligar: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'ligar', alvos: pos }),

  desligar: async ({ eu, pos }) => mexerNoQuadro(eu, { acao: 'desligar', alvos: pos }),

  anotar: async ({ eu, pos, opcoes }) =>
    mexerNoQuadro(eu, { acao: 'anotar', texto: pos.join(' '), x: comoNumero(opcoes.x), y: comoNumero(opcoes.y) }),

  juntar: async ({ eu, pos, opcoes }) => mexerNoQuadro(eu, { acao: 'juntar', alvos: pos, soltar: opcoes.soltar === true }),

  /**
   * Troca o agente de um cartão **que ele abriu**: o cartão fica (lugar, nome, cordas, árvore de código) e o
   * agente muda. Só o que ele abriu, pela mesma razão do `ork fechar`: trocar encerra o processo, e ninguém
   * encerra o trabalho de outro — nem o seu próprio, que mataria o comando no meio.
   */
  trocar: async ({ eu, pos }) => {
    const agente = (pos[1] ?? '').toLowerCase()
    if (agente !== 'claude' && agente !== 'codex' && agente !== 'shell') {
      throw new Error('diga o agente: ork trocar <cartão> <claude|codex|shell>')
    }
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({ tipo: 'trocar', espacoId: eu.espacoId, id: eu.id, alvo: pos[0], agente })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Pronto.' }
  },

  /** Bandas: grupo de agentes como moldura no quadro. Quem sabe o que está dentro dela é a janela. */
  banda: async ({ eu, pos }) => {
    const pedida = (pos[0] ?? 'lista').toLowerCase()
    const acao = pedida === 'lista' ? 'lista' : pedida === 'criar' ? 'criar' : null
    if (!acao) throw new Error(`não conheço \`ork banda ${pos[0]}\`. Use: criar, ou nada para listar.`)
    const nome = (pos[1] ?? '').trim()
    if (acao === 'criar' && !nome) throw new Error('diga o nome: ork banda criar "Nome" <cartão>...')
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({ tipo: 'banda', espacoId: eu.espacoId, id: eu.id, acao, nome, alvos: pos.slice(2).filter(Boolean) })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Pronto.' }
  },

  /**
   * Partituras: times salvos. `usar` sobe o time ao lado de quem pediu, já ligado a ele; `salvar` guarda o
   * que está no quadro. Quem guarda as partituras é a janela, dona das preferências.
   */
  partitura: async ({ eu, pos }) => {
    const acoes = ['lista', 'usar', 'salvar'] as const
    const pedida = (pos[0] ?? 'lista').toLowerCase()
    const acao = acoes.find((a) => a === pedida)
    if (!acao) throw new Error(`não conheço \`ork partitura ${pos[0]}\`. Use: usar, salvar, ou nada para listar.`)
    const nome = (pos[1] ?? '').trim()
    if (acao !== 'lista' && !nome) throw new Error(`diga o nome: ork partitura ${acao} "Nome"`)
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({
      tipo: 'partitura',
      espacoId: eu.espacoId,
      id: eu.id,
      acao,
      nome,
      alvos: pos.slice(2).filter(Boolean)
    })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Pronto.' }
  },

  /** As funções (papéis) que o usuário guardou. Quem sabe quais existem é a janela, dona das preferências. */
  /**
   * Fichas de time (.md) viram funções. O time costuma ser escrito fora do app — à mão, por outra sessão
   * de agente, ou copiado de outro projeto — e até a 1.2.5 instalar isso só dava mexendo no arquivo de
   * preferências com o app fechado.
   *
   * Aqui só a leitura dos arquivos: a decisão do que cada ficha vira está em `shared/catalogo.ts`, e as
   * preferências são da janela, que faz a junção.
   */
  catalogo: async ({ eu, pos }) => {
    if (String(pos[0] ?? '').toLowerCase() !== 'importar') throw new Error('diga o que fazer: ork catalogo importar <pasta>')
    const pasta = pastaPedida(eu, pos[1])
    if (!pasta) throw new Error('diga a pasta das fichas: ork catalogo importar <pasta>')
    const { fichas, pulados } = lerFichasDaPasta(pasta)
    const r = await pedirAJanela({ tipo: 'catalogo', espacoId: eu.espacoId, id: eu.id, fichas })
    if (!r.ok) throw new Error(r.erro)
    const sobras = pulados.length ? ['', 'Arquivos pulados (sem cabeçalho de ficha):', ...pulados.map((p) => `  ${p}`)] : []
    return { saida: [r.texto ?? '', ...sobras].join(String.fromCharCode(10)).trim() }
  },

  funcoes: async ({ eu }) => {
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({ tipo: 'funcoes', espacoId: eu.espacoId })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Nenhuma função guardada.' }
  },

  /**
   * As árvores de código do próprio cartão. Servem para o agente separar os arquivos por frente de trabalho
   * e depois falar delas pelo nome ("leia os arquivos da árvore Backend").
   */
  arvore: async ({ eu, pos, opcoes }) => {
    const acoes = ['lista', 'nova', 'usar', 'mostrar', 'dar', 'desfazer'] as const
    const pedida = (pos[0] ?? 'lista').toLowerCase()
    const acao = acoes.find((a) => a === pedida)
    if (!acao) throw new Error(`não conheço \`ork arvore ${pos[0]}\`. Use: ${acoes.join(', ')}.`)
    const resto = pos.slice(1).filter(Boolean)
    const daOpcao = typeof opcoes.arvore === 'string' ? opcoes.arvore.trim() : ''
    // `dar` leva o nome de um agente, não de uma árvore: `ork arvore dar "Agente" <arquivo>...`
    if (acao === 'dar') {
      const paraQuem = (resto[0] ?? '').trim()
      const quais = resto.slice(1)
      if (!paraQuem || !quais.length) throw new Error('diga para quem e o quê: ork arvore dar "Agente" <arquivo>...')
      await abrirJanelaPronta(eu.espacoId)
      const entrega = await pedirAJanela({
        tipo: 'arvore',
        espacoId: eu.espacoId,
        id: eu.id,
        acao,
        nome: paraQuem,
        arquivos: quais.map((a) => resolve(eu.espec.pasta, a))
      })
      if (!entrega.ok) throw new Error(entrega.erro)
      return { saida: entrega.texto ?? 'Pronto.' }
    }
    const nome = acao === 'mostrar' ? daOpcao : resto.join(' ').trim() || daOpcao
    if ((acao === 'nova' || acao === 'usar' || acao === 'desfazer') && !nome) {
      throw new Error(`diga o nome: ork arvore ${acao} "Nome"`)
    }
    // os arquivos vão em caminho absoluto: a janela só mostra o que está numa pasta do quadro
    const arquivos = acao === 'mostrar' ? resto.map((a) => resolve(eu.espec.pasta, a)) : []
    if (acao === 'mostrar') {
      if (!arquivos.length) throw new Error('diga os arquivos: ork arvore mostrar <arquivo>... [--arvore "Nome"]')
      const sumido = arquivos.find((a) => !existsSync(a))
      if (sumido) throw new Error(`esse arquivo não existe: ${sumido}`)
    }
    await abrirJanelaPronta(eu.espacoId)
    const r = await pedirAJanela({ tipo: 'arvore', espacoId: eu.espacoId, id: eu.id, acao, nome, arquivos })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? 'Pronto.' }
  },

  fechar: async ({ eu, pos }) => {
    const meus = sessoesCriadasPor(eu.id)
    const alvo = acharEntre(meus, pos[0])
    const herdadas = sessoesCriadasPor(alvo.id)
    // Fechar não mata trabalho em andamento: os filhos passam para quem fechou, como numa passagem de bastão.
    await transferirSessoes(alvo, eu, herdadas)
    await abrirJanelaPronta(alvo.espacoId)
    const r = await pedirAJanela({ tipo: 'fechar', espacoId: alvo.espacoId, id: alvo.id })
    if (!r.ok) throw new Error(r.erro)
    registrar(eu, alvo, 'fechar')
    encerrarAgora(alvo.id)
    return {
      saida: herdadas.length
        ? `Fechei "${alvo.espec.nome}". ${herdadas.length === 1 ? 'A sessão' : `As ${herdadas.length} sessões`} que ela tinha aberto agora ${
            herdadas.length === 1 ? 'é sua' : 'são suas'
          }.`
        : `Fechei "${alvo.espec.nome}".`
    }
  },

  passar: async ({ eu, pos }) => {
    const sucessor = acharEntre(ligadosA(eu), pos[0])
    if (sucessor.id === eu.id) throw new Error('você não pode passar sessões para si mesmo')
    if (!sucessor.processo) throw new Error(`"${sucessor.espec.nome}" está encerrado; escolha uma sessão viva`)
    const transferidas = sessoesCriadasPor(eu.id).filter((s) => s.id !== sucessor.id)
    if (!transferidas.length) return { saida: `Não havia outras sessões para passar a "${sucessor.espec.nome}".` }
    await transferirSessoes(eu, sucessor, transferidas)
    registrar(eu, sucessor, 'passar', contaSessoes(transferidas.length))
    return { saida: `Passei ${contaSessoes(transferidas.length)} para "${sucessor.espec.nome}".` }
  },

  sair: async ({ eu, opcoes }) => {
    const minhas = sessoesCriadasPor(eu.id)
    if (minhas.length && !opcoes['com-as-minhas']) {
      throw new Error(
        `você ainda tem ${contaSessoes(minhas.length)} aberta${minhas.length === 1 ? '' : 's'}; use \`ork passar <nome>\` primeiro, ou \`ork sair --com-as-minhas\` para fechar todas junto`
      )
    }
    const motivo = typeof opcoes.motivo === 'string' ? opcoes.motivo : ''
    const comAsMinhas = opcoes['com-as-minhas'] ? descendentesDe(eu.id) : []
    registrar(eu, null, 'sair', motivo)
    return {
      saida: comAsMinhas.length
        ? `Vou fechar seu cartão e ${contaSessoes(comAsMinhas.length)} sua${comAsMinhas.length === 1 ? '' : 's'}.`
        : 'Vou fechar seu cartão.',
      sair: [...comAsMinhas, eu]
    }
  }
}

/** O main normaliza, valida pelo registro e entrega ao handler declarado. Verbo desconhecido morre na validação. */
async function executar(eu: Sessao, pedido: Pedido, cancelado: () => boolean): Promise<ResultadoDoComando> {
  const comandoInformado = typeof pedido.comando === 'string' ? pedido.comando : 'ajuda'
  const posicionais = Array.isArray(pedido.posicionais) ? pedido.posicionais.filter((p): p is string => typeof p === 'string') : []
  const opcoesRecebidas = typeof pedido.opcoes === 'object' && pedido.opcoes !== null ? (pedido.opcoes as Record<string, unknown>) : {}
  const chamada = validarChamada(comandoInformado, posicionais, opcoesRecebidas)
  const texto = desfazerConversaoDoGitBash(typeof pedido.texto === 'string' ? pedido.texto : '')
  return HANDLERS[chamada.verbo.nome as NomeDeVerbo]({ eu, pos: chamada.posicionais, opcoes: chamada.opcoes, texto, cancelado })
}

/**
 * Um pedido, venha pelo pipe ou pelo correio: decodifica, acha de quem é pelo crachá, executa e devolve o
 * que responder. **Os dois canais passam por aqui** — se cada um tivesse o seu caminho, um dia iam divergir
 * e o correio (que só o Codex usa) seria o que ninguém notaria apodrecendo.
 */
export async function responderAoPedido(
  linha: string,
  fechado: () => boolean
): Promise<{ resposta: { ok: boolean; saida?: string; erro?: string }; sair?: Sessao[] }> {
  try {
    const pedido = JSON.parse(linha) as Pedido
    // Uma chave de usuário (cliente MCP) entra por aqui: quem a apresenta age como o usuário, não como
    // agente. Um pedido traz chave **ou** crachá, nunca os dois.
    if (pedido.chave !== undefined) {
      const chave = usuarioPorChave(pedido.chave)
      if (!chave) throw new Error('chave inválida ou revogada; gere outra em Configurações, no Orkester')
      const resultado = await executarComoUsuario(chave, pedido)
      return { resposta: { ok: true, saida: resultado.saida } }
    }
    const eu = sessaoPorCracha(pedido.cracha)
    if (!eu) throw new Error('este terminal não é do Orkester (ou o app foi reaberto: feche e abra o terminal)')
    const resultado = await executar(eu, pedido, fechado)
    return { resposta: { ok: true, saida: resultado.saida }, sair: resultado.sair }
  } catch (erro) {
    return { resposta: { ok: false, erro: erro instanceof Error ? erro.message : String(erro) } }
  }
}

async function atender(linha: string, socket: Socket, fechado: () => boolean): Promise<void> {
  const { resposta, sair } = await responderAoPedido(linha, fechado)
  if (sair) {
    // O `ork` está no processo que vai morrer. Esperamos o flush do socket e mais um instante antes de matar
    // o pty, para ele imprimir a confirmação; se a janela falhar, o cliente ainda jamais fica preso no pipe.
    socket.end(`${JSON.stringify(resposta)}\n`, () => setTimeout(() => void fecharCartoesDepoisDaResposta(sair), 120))
    return
  }
  if (!socket.destroyed) socket.end(`${JSON.stringify(resposta)}\n`)
}


/**
 * As fichas de uma pasta. Usada pelo `ork catalogo importar` do agente e pelo do usuário (a chave): ler
 * arquivo é do processo principal, e ter duas cópias disto seria ter duas regras diferentes de qual
 * arquivo conta como ficha.
 */
function lerFichasDaPasta(pasta: string): { fichas: FichaDeCatalogo[]; pulados: string[] } {
  if (!existsSync(pasta) || !statSync(pasta).isDirectory()) throw new Error(`a pasta não existe: ${pasta}`)
  const arquivos = readdirSync(pasta).filter((a) => a.toLowerCase().endsWith('.md')).sort()
  if (!arquivos.length) throw new Error(`não há nenhum .md em ${pasta}`)
  if (arquivos.length > MAX_FICHAS) throw new Error(`${arquivos.length} arquivos .md em ${pasta}; o teto é ${MAX_FICHAS}`)
  const fichas: FichaDeCatalogo[] = []
  const pulados: string[] = []
  for (const arquivo of arquivos) {
    let bruto: string
    try {
      bruto = readFileSync(join(pasta, arquivo), 'utf8')
    } catch (erro) {
      pulados.push(`${arquivo}: não deu para ler (${erro instanceof Error ? erro.message : erro})`)
      continue
    }
    const lida = lerFicha(arquivo, bruto)
    if ('erro' in lida) pulados.push(lida.erro)
    else fichas.push(lida.ficha)
  }
  if (!fichas.length) {
    throw new Error([`nenhuma ficha válida em ${pasta}`, ...pulados.map((p) => `  ${p}`)].join(String.fromCharCode(10)))
  }
  return { fichas, pulados }
}

// ---------- o usuário pelo cano, com uma chave ----------

/**
 * Um cliente MCP falando com o quadro. Ele não tem cartão, então **não é um agente**: o que ele faz é o
 * que o usuário faria pela tela — nada nasce com dono, nada nasce com corda, e a regra da corda (que é
 * permissão entre agentes) não se aplica a ele.
 *
 * O protocolo é o mesmo do `ork`, com `chave` no lugar de `cracha`, e a mesma validação de verbos: um
 * cliente que erra a opção recebe o mesmo erro que um agente erraria, escrito uma vez só.
 */
interface ContextoDoUsuario {
  chave: ChaveGuardada
  pos: string[]
  opcoes: Record<string, string | number | true>
  texto: string
}

/** Em que espaço o pedido cai: o dito em `--espaco`, senão o único que está aberto numa janela. */
function espacoDoUsuario(opcoes: Record<string, string | number | true>): ResumoEspaco {
  if (typeof opcoes.espaco === 'string') return espacoPorNome(opcoes.espaco)
  const abertos = resumosDosEspacos().filter((e) => janelaDoEspaco(e.id))
  if (abertos.length === 1) return abertos[0]
  if (!abertos.length) throw new Error('nenhum espaço está aberto numa janela; abra o Orkester (ou diga --espaco "Nome")')
  throw new Error(`há ${abertos.length} espaços abertos; diga qual com --espaco "Nome": ${abertos.map((e) => `"${e.nome}"`).join(', ')}`)
}

const HANDLERS_DO_USUARIO: Partial<Record<NomeDeVerbo, (ctx: ContextoDoUsuario) => Promise<ResultadoDoComando>>> = {
  espacos: async () => ({
    saida:
      resumosDosEspacos()
        .map((e) => `  "${e.nome}" · ${janelaDoEspaco(e.id) ? 'janela aberta' : 'sem janela'} · ${e.terminais} cartões`)
        .join('\n') || 'Não há espaços.'
  }),

  quadro: async ({ opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    const r = await pedirAJanela({ tipo: 'usuario', espacoId: espaco.id, acao: 'quadro' })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? '' }
  },

  funcoes: async ({ opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    const r = await pedirAJanela({ tipo: 'funcoes', espacoId: espaco.id })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? '' }
  },

  partitura: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    const acao = String(pos[0] ?? '').toLowerCase()
    if (!acao) {
      const r = await pedirAJanela({ tipo: 'partitura', espacoId: espaco.id, id: '', acao: 'lista' })
      if (!r.ok) throw new Error(r.erro)
      return { saida: r.texto ?? '' }
    }
    if (acao !== 'usar') throw new Error('pela chave só dá para listar ou usar: ork partitura usar "Nome"')
    const r = await pedirAJanela({ tipo: 'usuario', espacoId: espaco.id, acao: 'partitura', nome: pos[1] })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? '' }
  },

  catalogo: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    if (String(pos[0] ?? '').toLowerCase() !== 'importar') throw new Error('diga o que fazer: ork catalogo importar <pasta>')
    const fichas = lerFichasDaPasta(resolve(espaco.pasta, String(pos[1] ?? '')))
    const r = await pedirAJanela({ tipo: 'catalogo', espacoId: espaco.id, id: '', fichas: fichas.fichas })
    if (!r.ok) throw new Error(r.erro)
    const sobras = fichas.pulados.length ? ['', 'Arquivos pulados (sem cabeçalho de ficha):', ...fichas.pulados.map((p) => `  ${p}`)] : []
    return { saida: [r.texto ?? '', ...sobras].join('\n').trim() }
  },

  abrir: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    const agente = agenteDe(pos[0])
    if (pos[0] && !agente) throw new Error(`não existe o agente "${pos[0]}"; use claude, codex ou shell`)
    const funcao = typeof opcoes.funcao === 'string' ? opcoes.funcao.trim() : undefined
    if (!agente && !funcao && !opcoes.preset) throw new Error('diga o agente (claude, codex ou shell) ou use --funcao "Papel"')
    await abrirJanelaPronta(espaco.id)
    const r = await pedirAJanela({
      tipo: 'usuario',
      espacoId: espaco.id,
      acao: 'abrir',
      agente: agente ?? undefined,
      preset: typeof opcoes.preset === 'string' ? opcoes.preset : undefined,
      nome: typeof opcoes.nome === 'string' ? opcoes.nome.trim().slice(0, 80) : undefined,
      pasta: typeof opcoes.pasta === 'string' ? resolve(espaco.pasta, opcoes.pasta) : undefined,
      funcao
    })
    if (!r.ok) throw new Error(r.erro)
    // A função traz o primeiro pedido (o papel). Até a 1.4.0 ele voltava da janela e era ignorado aqui: o
    // cartão aberto pelo MCP nascia com o agente certo e sem saber quem era. Quem digita é este processo,
    // como no `ork abrir`, mas sem segurar a resposta do cliente (o agente leva até um minuto para ficar pronto).
    if (r.texto && r.id) void digitarPrimeiroPedidoDoUsuario(r.id, r.texto)
    return { saida: `Abri "${r.nome}".${r.texto ? ' O papel da função vai ser digitado assim que o agente ficar pronto.' : ''}` }
  },

  ver: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    // o usuário enxerga qualquer cartão do espaço: a corda é permissão entre agentes, não entre ele e o quadro
    const alvo = acharEntre(sessoesDoEspaco(espaco.id), pos[0])
    const linhas = Math.min(2000, Math.max(1, Number(opcoes.linhas) || 50))
    return { saida: `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, linhas)}` }
  }
}

/** O papel de um cartão aberto pelo MCP: espera o agente ficar pronto e digita; o que acontecer vai para o registro. */
async function digitarPrimeiroPedidoDoUsuario(id: string, texto: string): Promise<void> {
  const s = await esperarSessao(id, 10_000)
  if (!s) return
  const pronto = await aguardarPronto(s, 90_000, () => false)
  if (pronto !== 'pronto') {
    registrar(s, null, 'primeiro-pedido-nao-digitado', `agente não ficou pronto (${pronto}); o papel NÃO foi digitado`)
    return
  }
  const envio = await digitarPedido(s, texto)
  const { comando, alerta } = registroDoEnvio('primeiro-pedido', envio)
  registrar(s, null, comando, alerta ?? texto)
}

async function executarComoUsuario(chave: ChaveGuardada, pedido: Pedido): Promise<ResultadoDoComando> {
  const comandoInformado = typeof pedido.comando === 'string' ? pedido.comando : 'ajuda'
  const posicionais = Array.isArray(pedido.posicionais) ? pedido.posicionais.filter((p): p is string => typeof p === 'string') : []
  const opcoesRecebidas = typeof pedido.opcoes === 'object' && pedido.opcoes !== null ? (pedido.opcoes as Record<string, unknown>) : {}
  // O `--espaco` é do usuário, não do verbo: um agente sempre fala do espaço dele, então os verbos do agente
  // não o declaram (e declarar só para cá seria aceitar, no agente, uma opção que não faz nada). A chave não
  // tem espaço próprio, então ele sai antes da validação e volta depois.
  const { espaco, ...semEspaco } = opcoesRecebidas
  const chamada = validarChamada(comandoInformado, posicionais, semEspaco)
  if (typeof espaco === 'string' && espaco.trim()) chamada.opcoes.espaco = espaco.trim()
  const handler = HANDLERS_DO_USUARIO[chamada.verbo.nome as NomeDeVerbo]
  if (!handler) {
    const quais = Object.keys(HANDLERS_DO_USUARIO).join(', ')
    throw new Error(`"${chamada.verbo.nome}" é de agente, não de chave. Pela chave dá para: ${quais}`)
  }
  const texto = typeof pedido.texto === 'string' ? pedido.texto : ''
  return handler({ chave, pos: chamada.posicionais, opcoes: chamada.opcoes, texto })
}

/**
 * Como um cliente MCP sobe o servidor nesta máquina. O arquivo é a cópia em `~/.orkester/bin`, não a de
 * dentro da instalação: a pasta de instalação muda a cada versão, e uma configuração colada num cliente
 * tem de continuar valendo depois de atualizar. Node do sistema se houver; senão o próprio app em modo Node.
 */
function comandoDoMcp(): ComandoDoMcp {
  const mcp = join(PASTA_BIN, 'cli', 'mcp.js')
  const node = nodeDoSistema()
  return node ? { comando: node, args: [mcp] } : { comando: process.execPath, args: [mcp], env: { ELECTRON_RUN_AS_NODE: '1' } }
}

export function registrarComandos(): void {
  instalarComando()
  ipcMain.handle(CANAIS_CHAVES.comando, (): ComandoDoMcp => comandoDoMcp())

  ipcMain.on(CANAIS_AGENTES.pronta, (evento) => {
    janelasProntas.add(evento.sender.id)
    // Recarregar preserva o WebContents, mas derruba o atendente do renderer; até ele se anunciar de novo não enviamos pedidos.
    evento.sender.once('did-start-loading', () => janelasProntas.delete(evento.sender.id))
    evento.sender.once('destroyed', () => janelasProntas.delete(evento.sender.id))
  })

  /**
   * Cartão criado pela interface com uma função: o prompt dela é o primeiro pedido. Quem espera o agente
   * ficar pronto é o processo principal, que é quem lê a tela — a janela não sabe quando a abertura acabou.
   */
  ipcMain.handle(CANAIS.primeiroPedido, (_evento, id: unknown, texto: unknown): Promise<ResultadoDoPrimeiroPedido> =>
    primeiroPedidoDoCartao<Sessao>({
      id,
      texto,
      acharSessao: (sid) => esperarSessao(sid, 5000),
      // falhou em ficar pronto (pergunta de confiar na pasta, por exemplo): não digita nada, o cartão
      // fica lá esperando o usuário — melhor do que escrever o papel no meio de um diálogo
      aguardarPronto: (s) => aguardarPronto(s, 90_000, () => false),
      digitar: digitarPedido,
      // o chamador recebe o status; o registro e o log continuam, e nada é reenviado
      registrar: (s, r) => {
        if (r.status === 'nao-pronto') {
          registrar(s, null, 'primeiro-pedido-nao-digitado', `agente não ficou pronto (${r.motivo}); o primeiro pedido NÃO foi digitado`)
          console.warn(`[orkester] primeiro pedido de "${s.espec.nome}" não digitado: agente não ficou pronto (${r.motivo})`)
          return
        }
        if (r.status === 'sem-sessao') return
        const { comando, alerta } = registroDoEnvio('primeiro-pedido', r.status)
        registrar(s, null, comando, alerta ?? String(texto))
        if (alerta) console.warn(`[orkester] "${s.espec.nome}": ${alerta}`)
      }
    })
  )

  ipcMain.on(CANAIS_AGENTES.resposta, (evento, id: unknown, resposta: RespostaAoAgente) => {
    const pendente = typeof id === 'string' ? respostas.get(id) : undefined
    if (!pendente || pendente.janela !== evento.sender.id) return
    const valida = resposta && typeof resposta === 'object' && typeof resposta.ok === 'boolean'
    pendente.resolver(valida ? resposta : { ok: false, erro: 'resposta inválida da janela' })
  })

  ipcMain.handle(CANAIS.contextos, async (evento, espacoId: unknown): Promise<ResumoContextoTerminal[]> => {
    if (typeof espacoId !== 'string' || donoDe(espacoId) !== evento.sender.id) return []
    return Promise.all(
      sessoesDoEspaco(espacoId).map(async (s) => {
        // O painel precisa das duas leituras, mas o mesmo recorte de 80 linhas basta para situação e rodapé.
        const tela = await telaDe(s, 80)
        return {
          id: s.id,
          nome: s.espec.nome,
          agente: s.espec.agente,
          situacao: situacaoNaTela(s, tela),
          contexto: contextoNaTela(s, tela).contexto
        }
      })
    )
  })

  // a caixa de entrada: de segundo em segundo, entrega o que pode e confere quem parou sem entregar
  setInterval(() => void caixa.rodada(), 1000).unref()
  ipcMain.handle(CANAIS.caixas, (evento, espacoId: unknown) => {
    if (typeof espacoId !== 'string' || donoDe(espacoId) !== evento.sender.id) return {}
    const caixas: Record<string, ReturnType<typeof caixa.resumo>> = {}
    for (const s of sessoesDoEspaco(espacoId)) {
      const r = caixa.resumo(s.id)
      if (r.fila) caixas[s.id] = r
    }
    return caixas
  })
  ipcMain.on(CANAIS.liberarCaixa, (evento, id: unknown) => {
    const s = typeof id === 'string' ? sessaoPorId(id) : undefined
    if (!s || donoDe(s.espacoId) !== evento.sender.id) return
    esquecerRascunho(s.id)
    void caixa.rodada()
  })

  const servidor = createServer((socket) => {
    let recebido = ''
    let fechado = false
    socket.setEncoding('utf8')
    // o pedido chega de uma vez: quem conecta e não manda nada em 10 s é desligado
    socket.setTimeout(10_000, () => socket.destroy())
    socket.on('close', () => (fechado = true))
    socket.on('error', () => (fechado = true))
    const aoReceber = (parte: string): void => {
      recebido += parte
      if (recebido.length > MAX_PEDIDO) return void socket.destroy()
      const fim = recebido.indexOf('\n')
      if (fim < 0) return
      socket.off('data', aoReceber)
      // daqui em diante a espera é do comando (`ork esperar` pode levar até uma hora)
      socket.setTimeout(0)
      void atender(recebido.slice(0, fim), socket, () => fechado)
    }
    socket.on('data', aoReceber)
  })
  // O correio: o mesmo atendente do pipe, por arquivo, para o agente cujo sandbox recusa pipe (o Codex).
  abrirCorreio(async (linha) => {
    const { resposta, sair } = await responderAoPedido(linha, () => false)
    return { resposta, depois: sair ? () => fecharCartoesDepoisDaResposta(sair) : undefined }
  })

  servidor.maxConnections = MAX_CONEXOES
  servidor.on('error', (erro) => console.error('ork: o pipe não abriu', erro))
  servidor.listen(PIPE, publicarCano)
}

/**
 * O endereço do cano muda a cada execução (é sorteado), e um cliente MCP não herda o ambiente do app como
 * os terminais herdam. Então o app o publica num arquivo enquanto vive — e o arquivo existir é também
 * como o servidor MCP sabe que o Orkester está aberto. Some quando o app sai (`fecharCano`).
 */
const ARQUIVO_DO_CANO = (): string => join(PASTA_DADOS, 'cano.json')

function publicarCano(): void {
  try {
    writeFileSync(ARQUIVO_DO_CANO(), JSON.stringify({ pipe: PIPE, pid: process.pid, desde: new Date().toISOString() }))
  } catch (erro) {
    console.error('ork: não consegui publicar o endereço do cano', erro)
  }
}

/** Só apaga se o arquivo ainda for deste processo: com duas instâncias, uma não derruba a outra. */
export function fecharCano(): void {
  try {
    const atual = JSON.parse(readFileSync(ARQUIVO_DO_CANO(), 'utf8')) as { pid?: number }
    if (atual.pid === process.pid) rmSync(ARQUIVO_DO_CANO(), { force: true })
  } catch {
    // não havia arquivo, ou ele está ilegível: nada a limpar
  }
}
