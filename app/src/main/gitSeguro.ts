// O único jeito de o app chamar o git. Um repositório que veio de fora pode trazer, no `.git/config`, programa
// para rodar sozinho (`core.fsmonitor`, `diff.external`, `textconv`, filtros, hooks…): bastava o visor
// olhar um arquivo para executá-lo. Aqui o git roda com essas saídas fechadas, com ou sem confiança na pasta.
// Sem `electron` de propósito: a prova roda em Node puro.
import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface SaidaGit {
  codigo: number
  saida: string
  erro: string
}

export interface OpcoesGit {
  timeout?: number
  maxBuffer?: number
}

/** Pasta que existe e fica vazia: `core.hooksPath` apontando para ela é "sem hooks" em qualquer sistema. */
function pastaSemHooks(): string {
  const pasta = join(tmpdir(), 'orkester-git-sem-hooks')
  mkdirSync(pasta, { recursive: true })
  return pasta
}

/** O que sempre vai antes do comando: nada de programa de config. */
export function configSegura(): string[] {
  const c = [
    'core.fsmonitor=false',
    `core.hooksPath=${pastaSemHooks()}`,
    'core.pager=cat',
    'core.sshCommand=',
    'core.askPass=',
    'core.editor=true',
    'diff.external=',
    'credential.helper=',
    'gpg.program=',
    'protocol.ext.allow=never',
    // o diff/status não usa rede: nenhum transporte vale (a busca preguiçosa de clone parcial roda o `uploadpack` do config)
    'protocol.allow=never'
  ]
  return c.flatMap((valor) => ['-c', valor])
}

export function ambienteSeguro(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  for (const nome of ['GIT_EXTERNAL_DIFF', 'GIT_SSH_COMMAND', 'GIT_SSH', 'GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_EDITOR', 'GIT_SEQUENCE_EDITOR', 'GIT_PROXY_COMMAND']) {
    delete env[nome]
  }
  return {
    ...env,
    // sem GIT_CONFIG_NOSYSTEM de propósito: a config de sistema é do administrador e guarda o core.autocrlf do Git for Windows
    GIT_NO_LAZY_FETCH: '1',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_PAGER: 'cat',
    GIT_OPTIONAL_LOCKS: '0'
  }
}

/** Comandos que mexem em arquivo da árvore e por isso podem chamar filtro (`clean`/`smudge`/`process`) do `.git/config`. */
const COM_FILTRO = new Set(['diff', 'status', 'merge', 'worktree', 'checkout', 'add', 'stash', 'reset', 'switch', 'restore'])

function rodar(pasta: string, args: string[], opcoes: OpcoesGit = {}): Promise<SaidaGit> {
  return new Promise((resolver) => {
    execFile(
      'git',
      args,
      {
        cwd: pasta,
        env: ambienteSeguro(),
        windowsHide: true,
        encoding: 'utf8',
        timeout: opcoes.timeout ?? 15000,
        maxBuffer: opcoes.maxBuffer ?? 16 * 1024 * 1024
      },
      (falha, saida, erro) => {
        const codigo = falha ? (typeof falha.code === 'number' ? falha.code : 1) : 0
        resolver({ codigo, saida: String(saida ?? '').trim(), erro: String(erro ?? '').trim() })
      }
    )
  })
}

/** Filtros que a config da pasta define: cada um vira "sem comando" (e "não obrigatório", para o git não recusar). */
async function filtrosDesligados(pasta: string): Promise<string[]> {
  const r = await rodar(pasta, [...configSegura(), 'config', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$'], { timeout: 5000 })
  if (r.codigo !== 0) return []
  const nomes = new Set<string>()
  for (const chave of r.saida.split(/\r?\n/)) {
    const m = /^(filter\..+)\.(clean|smudge|process|required)$/i.exec(chave.trim())
    if (m) nomes.add(m[1])
  }
  return [...nomes].flatMap((n) => ['-c', `${n}.clean=`, '-c', `${n}.smudge=`, '-c', `${n}.process=`, '-c', `${n}.required=false`])
}

/** Roda `git <args>` em `pasta` sem deixar a config do repositório executar nada. Nunca lança: falha vira `codigo` ≠ 0. */
export async function gitSeguro(pasta: string, args: string[], opcoes?: OpcoesGit): Promise<SaidaGit> {
  const verbo = args[0]
  const filtros = COM_FILTRO.has(verbo) ? await filtrosDesligados(pasta) : []
  // `--no-ext-diff`/`--no-textconv` só existem no `diff`
  const extra = verbo === 'diff' ? ['--no-ext-diff', '--no-textconv'] : []
  return rodar(pasta, [...configSegura(), ...filtros, verbo, ...extra, ...args.slice(1)], opcoes)
}
