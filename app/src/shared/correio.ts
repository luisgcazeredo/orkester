/**
 * O correio: o segundo canal do `ork`, por arquivo.
 *
 * O caminho normal é o pipe local (ver `main/comandos.ts`): é instantâneo e não toca o disco. Só que o
 * Codex roda os comandos dele num sandbox do Windows que **recusa pipe** — medido em 09/11/2026, com
 * `connect EPERM` num pipe de teste, igual em `read-only` e em `workspace-write`; contra o pipe do app, com
 * um Codex de verdade, o erro veio **outro**. Por isso o `ork` não olha o errno para decidir: havendo
 * correio, qualquer falha do cano cai aqui. O mesmo sandbox deixa ler e escrever
 * arquivo no diretório de trabalho e na pasta temporária, e a pasta temporária é a **mesma** que o app vê
 * (também medido: o app escreveu e o agente leu, e o contrário). Então quando o pipe é recusado o `ork`
 * passa a conversar por arquivo, sozinho, sem ninguém configurar nada.
 *
 * O nome do arquivo é o protocolo inteiro: `pedido-<id>.json` chega, `resposta-<id>.json` volta. Quem
 * grava escreve primeiro com o sufixo `.parcial` e só então renomeia — renomear é atômico, então ninguém
 * nunca lê um recado pela metade. Quem lê apaga na hora.
 *
 * **O que isto não é:** fronteira de segurança. A identidade continua sendo o crachá (`ORK_CRACHA`), como
 * no pipe, e vale o que está escrito em `main/comandos.ts`: todos os agentes rodam como o mesmo usuário do
 * Windows e um pode ler o ambiente do outro. A pasta tem nome aleatório e os recados são apagados ao serem
 * lidos para não ficarem por aí, não porque isso impeça alguém determinado.
 */

/** Recado maior que isto é lixo ou ataque, não pedido: o mesmo teto do pipe. */
export const MAX_RECADO = 512 * 1024

/** Enquanto está sendo escrito, o recado não tem nome de recado — só ganha o nome ao ser renomeado. */
export const SUFIXO_PARCIAL = '.parcial'

export type TipoDeRecado = 'pedido' | 'resposta'

const NOME = /^(pedido|resposta)-([0-9a-f]{24})\.json$/

export function nomeDoRecado(tipo: TipoDeRecado, id: string): string {
  return `${tipo}-${id}.json`
}

/** O id de um recado, ou null se o arquivo não for um recado (lixo na pasta é ignorado, não dá erro). */
export function idDoRecado(nome: string, tipo?: TipoDeRecado): string | null {
  const achado = NOME.exec(nome)
  if (!achado) return null
  if (tipo && achado[1] !== tipo) return null
  return achado[2]
}

export function ehRecado(nome: string, tipo?: TipoDeRecado): boolean {
  return idDoRecado(nome, tipo) !== null
}

/** O começo do nome da pasta de correio de um app; o resto é o pid de quem a criou. */
export const PREFIXO_PASTA = 'orkester-correio-'

export function nomeDaPasta(pid: number): string {
  return `${PREFIXO_PASTA}${pid}`
}

/**
 * Pastas de correio de apps que já morreram, para varrer na abertura.
 *
 * O app apaga a própria pasta ao sair, mas um encerramento forçado (ou um teste matando o processo) deixa
 * ela para trás, e em 09/11/2026 havia três em `%TEMP%` de uma vez. O pid no nome resolve: dá para
 * perguntar ao sistema quem ainda está vivo em vez de chutar por data — chutar por data apagaria a pasta
 * de um app vivo que estivesse quieto.
 */
export function pastasMortas(nomes: string[], vivo: (pid: number) => boolean, meuPid: number): string[] {
  const mortas: string[] = []
  for (const nome of nomes) {
    if (!nome.startsWith(PREFIXO_PASTA)) continue
    const resto = nome.slice(PREFIXO_PASTA.length)
    // nome sorteado: é da versão anterior, que nunca mais vai existir — logo, não é de ninguém vivo
    if (/^[0-9a-f]{24}$/.test(resto)) {
      mortas.push(nome)
      continue
    }
    const pid = Number(resto)
    if (!Number.isInteger(pid) || pid <= 0) continue
    if (pid !== meuPid && !vivo(pid)) mortas.push(nome)
  }
  return mortas
}

/** O nome da resposta de um pedido. null se o nome não for de um pedido. */
export function respostaDe(nomeDoPedido: string): string | null {
  const id = idDoRecado(nomeDoPedido, 'pedido')
  return id ? nomeDoRecado('resposta', id) : null
}
