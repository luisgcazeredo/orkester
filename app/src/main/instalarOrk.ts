import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import type { ComandoDoMcp } from '../shared/chaves'
import { nodeServe } from '../shared/node-do-sistema'
import { PASTA_DADOS } from './dados'
import { pastaDoCorreio } from './correio'
import { SKILL } from './manual'
import { acharGitDoPerfil, regrasDoCodex } from './codex-regras'
import { type Sessao } from './terminais'

// O `ork`: a linha de comando dos agentes. Cada terminal do app ganha no ambiente o endereço de um pipe local
// (ORK_PIPE) e um crachá próprio (ORK_CRACHA), e a pasta com o `ork` no PATH. O `ork` (src/cli/ork.ts) manda uma
// linha JSON e recebe uma de volta. A corda entre dois terminais é a permissão: sem corda, não há conversa.
// O nome do crachá não tem KEY, TOKEN nem SECRET: o Codex tira essas variáveis do ambiente dos comandos.
// A corda é regra de convívio, não fronteira de segurança: todos os agentes rodam como o mesmo usuário do Windows e
// um pode ler o ambiente (e o crachá) de outro. O crachá muda a cada processo e deixa de valer quando ele sai.

const AUTOTESTE = process.argv.includes('--autoteste')
export const PIPE =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\orkester-${randomBytes(12).toString('hex')}`
    : join(tmpdir(), `orkester-${randomBytes(12).toString('hex')}.sock`)
const PASTA_BIN = join(PASTA_DADOS, 'bin')
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
export function instalarComando(): void {
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
  // a prévia (ORK_PREVIA) também não mexe em ~/.claude e ~/.codex: ali mora a skill do app instalado
  if (AUTOTESTE || process.env.ORK_PREVIA === '1') return
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
 * apagar o arquivo devolve as perguntas e não quebra nada. As regras (o `ork` e a leitura de git) estão em
 * `codex-regras.ts`.
 */
function liberarOrkNoCodex(): void {
  const casa = process.env.CODEX_HOME || join(homedir(), '.codex')
  if (!existsSync(casa)) return
  const regra = regrasDoCodex(acharGitDoPerfil(process.env, homedir(), existsSync))
  try {
    const pasta = join(casa, 'rules')
    mkdirSync(pasta, { recursive: true })
    gravarSeMudou(join(pasta, 'orkester.rules'), regra)
  } catch {
    // sem permissão de escrever na casa do Codex: o agente vai pedir aprovação, que é o de antes
  }
}
/**
 * Como um cliente MCP sobe o servidor nesta máquina. O arquivo é a cópia em `~/.orkester/bin`, não a de
 * dentro da instalação: a pasta de instalação muda a cada versão, e uma configuração colada num cliente
 * tem de continuar valendo depois de atualizar. Node do sistema se houver; senão o próprio app em modo Node.
 */
export function comandoDoMcp(): ComandoDoMcp {
  const mcp = join(PASTA_BIN, 'cli', 'mcp.js')
  const node = nodeDoSistema()
  return node ? { comando: node, args: [mcp] } : { comando: process.execPath, args: [mcp], env: { ELECTRON_RUN_AS_NODE: '1' } }
}
