/**
 * O que o app sabe sobre o Codex sem tocar em Electron nem em processo (para as provas rodarem com `node --test`):
 * o arquivo de regras de execução que ele grava em `~/.codex/rules`, e a oferta de atualização ao abrir.
 *
 * Por que as regras de git (1.5.1, 13/11/2026): no sandbox elevado do Windows o Codex não enxerga o `git` instalado
 * no perfil do usuário, e por isso o agente pede aprovação até para `git --version`. Flag de sandbox não resolve
 * (medido com `codex exec -s workspace-write`, com e sem `disk-full-read-access`); regra de prefixo resolve, e é o
 * mesmo mecanismo que o app já usa para o `ork`. Só **leitura**: nada de `config`, `remote`, `credential`, `push`,
 * `commit`, `add`, `reset`.
 */

/**
 * Subcomandos de git que só leem, `--version` e os que não têm opção que escreva ou execute. A regra é de PREFIXO e
 * aceita argumentos a mais (medido: `git diff --stat --output=x` casa `git diff --stat`), então ficam de fora
 * `diff`, `log` e `show` (`--output` grava arquivo), `branch` (apaga e renomeia ramo) e `grep` (`-O` executa programa).
 */
export const GIT_SO_LEITURA = ['--version', 'status', 'rev-parse', 'ls-files'] as const

const lista = (itens: readonly string[]): string => `[${itens.map((i) => JSON.stringify(i)).join(', ')}]`

/**
 * O `git.exe` do perfil do usuário (`%LOCALAPPDATA%\Programs\Git`), achado em tempo de execução; null se não existe.
 * Nada de caminho fixo: o nome do usuário e a pasta mudam de máquina para máquina.
 */
export function acharGitDoPerfil(ambiente: Record<string, string | undefined>, casa: string, existe: (caminho: string) => boolean): string | null {
  const locais = [ambiente.LOCALAPPDATA, `${casa}\\AppData\\Local`].filter((x): x is string => !!x)
  const candidatos = locais.flatMap((l) => [`${l}\\Programs\\Git\\cmd\\git.exe`, `${l}\\Programs\\Git\\bin\\git.exe`])
  return candidatos.find((c) => existe(c)) ?? null
}

/** O arquivo `orkester.rules`. A barra invertida do Windows é dobrada (é texto Starlark entre aspas). */
export function regrasDoCodex(gitExe: string | null): string {
  const blocos = [
    [
      '# Escrito pelo Orkester. Deixa o agente usar o `ork` — o comando com que ele fala com o app que o',
      '# abriu. Sem esta regra o Codex recusa o comando dentro do sandbox e o agente fica mudo.',
      '# Vale só para o `ork` e para a LEITURA de git (abaixo): qualquer outro comando continua passando pelas',
      '# suas regras de sempre. Apagar este arquivo devolve as perguntas e não quebra nada.',
      'prefix_rule(',
      '    pattern = ["ork"],',
      '    decision = "allow",',
      '    justification = "ork: o comando do Orkester, o app que abriu este terminal",',
      '    match = ["ork quem", "ork quadro"],',
      '    not_match = ["git ork"],',
      ')'
    ].join('\n'),
    [
      '# Só leitura de git. Sem `config`, `remote`, `credential`, `push`, `commit`, `add` ou `reset`: esses continuam pedindo.',
      'prefix_rule(',
      `    pattern = ["git", ${lista(GIT_SO_LEITURA)}],`,
      '    decision = "allow",',
      '    justification = "git: só leitura do repositório",',
      '    match = ["git status", "git rev-parse HEAD", "git --version"],',
      '    not_match = ["git push", "git branch -D x", "git grep -O sh x", "git diff --output=x", "git log --output=x", "git commit -m x", "git config user.name", "git remote -v", "git credential fill"],',
      ')'
    ].join('\n')
  ]
  if (gitExe) {
    blocos.push(
      [
        '# O mesmo, pelo caminho completo do git do perfil (o sandbox não o enxerga pelo nome).',
        'prefix_rule(',
        `    pattern = [${JSON.stringify(gitExe)}, ${lista(GIT_SO_LEITURA)}],`,
        '    decision = "allow",',
        '    justification = "git do perfil: só leitura do repositório",',
        `    match = [[${JSON.stringify(gitExe)}, "status"], [${JSON.stringify(gitExe)}, "--version"]],`,
        `    not_match = [[${JSON.stringify(gitExe)}, "push"], [${JSON.stringify(gitExe)}, "config", "user.name"]],`,
        ')'
      ].join('\n')
    )
  }
  return `${blocos.join('\n\n')}\n`
}

// ---------- a oferta de atualização ao abrir ----------

/** A tela é a oferta de atualização do Codex (com a opção de pular). */
export function ofertaDeAtualizacao(tela: string): boolean {
  return /update available/i.test(tela) && /update now/i.test(tela) && /skip/i.test(tela)
}

/** A opção marcada (linha com `›`/`❯`) é uma das de pular. Só então o Enter é seguro: o outro lado dele é instalar. */
export function pularEstaMarcado(tela: string): boolean {
  const marcada = tela.split('\n').find((l) => /^\s*[❯›>]\s*\d?[.)]?\s/.test(l) && /\S/.test(l.replace(/^\s*[❯›>]/, '')))
  return !!marcada && /skip/i.test(marcada) && !/update now/i.test(marcada)
}
