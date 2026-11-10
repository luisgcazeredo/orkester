/**
 * O `ork` precisa de um Node para rodar, e **qual** Node importa.
 *
 * O caminho natural seria o Electron do próprio app em modo Node (ele está ali, e a versão casa com o
 * bundle). Só que o sandbox do Codex **nega a pasta de instalação inteira** — medido em 10/11/2026:
 * `EPERM` até para um `lstat` em `AppData\Local\Programs\orkester`, e um `Acesso negado.` seco ao tentar
 * executar o binário. Com isso o agente não conseguia nem rodar `ork quem`.
 *
 * Por isso o `ork` passa a rodar com o Node do sistema, lendo uma cópia do CLI que mora junto dos dados
 * (`~/.orkester`), pasta que o sandbox deixa ler. O Electron do app fica como reserva, para quem não tem
 * Node instalado — e aí o agente sandboxed não funciona, mas o resto funciona.
 */

/** A versão mais antiga do Node que roda o que o bundler gera para o app. */
export const NODE_MINIMO = 20

/** `v22.1.0`, `22.1.0` ou nada: serve para rodar o `ork`? */
export function nodeServe(versao: string | null | undefined): boolean {
  if (!versao) return false
  const achado = /^v?(\d+)\./.exec(versao.trim())
  if (!achado) return false
  return Number(achado[1]) >= NODE_MINIMO
}
