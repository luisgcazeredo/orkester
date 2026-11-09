import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ehRecado, idDoRecado, MAX_RECADO, nomeDoRecado, SUFIXO_PARCIAL } from '../shared/correio'

/**
 * O lado do app do correio — o segundo canal do `ork`, por arquivo. O porquê está em `shared/correio.ts`:
 * o sandbox do Codex recusa pipe (`connect EPERM`) e deixa passar arquivo.
 *
 * O app vigia **uma pasta só**, pequena e própria, com `fs.watch`. Nunca uma varredura: já houve neste
 * projeto um vigia que percorria a pasta do usuário inteira, e foi o pior achado da revisão de 05/11/2026.
 * Além do `fs.watch`, uma olhada lenta de 2 em 2 segundos — no Windows o evento às vezes não vem, e um
 * pedido perdido deixaria o agente esperando para sempre. Ler a lista de uma pasta com dois arquivos de
 * dois em dois segundos não é custo.
 */

/** De quanto em quanto tempo a rede de segurança olha a pasta, para o caso de o evento do SO não vir. */
const OLHADA = 2000
/** Recado esquecido na pasta (agente morto antes de ler a resposta) é varrido depois disto. */
const VALIDADE = 10 * 60 * 1000

let pasta: string | null = null
let vigia: FSWatcher | null = null
let relogio: NodeJS.Timeout | null = null
const emAtendimento = new Set<string>()
let atendente: Atendente | null = null

/** Quem sabe responder um pedido. Vem de fora para o correio não conhecer os verbos nem fechar ciclo. */
export type Atendente = (linha: string) => Promise<{ resposta: unknown; depois?: () => Promise<void> }>

/** A pasta do correio deste app, criada na primeira vez. Nome aleatório: não é segredo, mas não é adivinhável. */
export function pastaDoCorreio(): string {
  if (!pasta) pasta = join(tmpdir(), `orkester-correio-${randomBytes(12).toString('hex')}`)
  return pasta
}

function responder(id: string, resposta: unknown): void {
  const destino = join(pastaDoCorreio(), nomeDoRecado('resposta', id))
  const parcial = `${destino}${SUFIXO_PARCIAL}`
  // grava e renomeia: renomear é atômico, então o agente nunca lê uma resposta pela metade
  writeFileSync(parcial, `${JSON.stringify(resposta)}\n`, 'utf8')
  renameSync(parcial, destino)
}

async function atenderRecado(nome: string): Promise<void> {
  const id = idDoRecado(nome, 'pedido')
  if (!id || emAtendimento.has(id)) return
  emAtendimento.add(id)
  const caminho = join(pastaDoCorreio(), nome)
  try {
    const tamanho = statSync(caminho).size
    // o pedido é apagado antes de ser atendido: atendido duas vezes seria pior do que não atendido
    const linha = tamanho > MAX_RECADO ? '' : readFileSync(caminho, 'utf8')
    rmSync(caminho, { force: true })
    if (!linha) {
      responder(id, { ok: false, erro: 'pedido grande demais ou vazio' })
      return
    }
    const { resposta, depois } = await atendente!(linha.split('\n')[0])
    responder(id, resposta)
    // `ork sair` fecha o cartão de quem pediu: a resposta tem de estar no disco antes de o processo morrer
    if (depois) setTimeout(() => void depois(), 150)
  } catch (erro) {
    try {
      responder(id, { ok: false, erro: erro instanceof Error ? erro.message : String(erro) })
    } catch {
      // a pasta sumiu (app fechando): não há a quem responder
    }
  } finally {
    emAtendimento.delete(id)
  }
}

function varrerPasta(): void {
  let nomes: string[]
  try {
    nomes = readdirSync(pastaDoCorreio())
  } catch {
    return
  }
  const agora = Date.now()
  for (const nome of nomes) {
    if (ehRecado(nome, 'pedido')) {
      void atenderRecado(nome)
      continue
    }
    // resposta que ninguém veio buscar, ou recado parcial de um agente que morreu no meio da escrita
    if (!ehRecado(nome, 'resposta') && !nome.endsWith(SUFIXO_PARCIAL)) continue
    try {
      const caminho = join(pastaDoCorreio(), nome)
      if (agora - statSync(caminho).mtimeMs > VALIDADE) rmSync(caminho, { force: true })
    } catch {
      // já foi
    }
  }
}

/** Abre o correio: cria a pasta e começa a vigiar. Devolve a pasta, que vai no ambiente dos terminais. */
export function abrirCorreio(quemAtende: Atendente): string {
  atendente = quemAtende
  const caminho = pastaDoCorreio()
  mkdirSync(caminho, { recursive: true })
  try {
    vigia = watch(caminho, (_evento, nome) => {
      if (typeof nome === 'string' && ehRecado(nome, 'pedido')) void atenderRecado(nome)
    })
    vigia.on('error', () => {
      // o vigia morreu (pasta apagada por fora): a olhada lenta continua dando conta
      vigia?.close()
      vigia = null
    })
  } catch {
    // sem `fs.watch` neste sistema: a olhada lenta é o canal, só com até 2 s de atraso
  }
  relogio = setInterval(varrerPasta, OLHADA)
  relogio.unref()
  varrerPasta()
  return caminho
}

/** Fecha o correio e apaga a pasta: nada do que foi conversado fica no disco depois que o app sai. */
export function fecharCorreio(): void {
  vigia?.close()
  vigia = null
  if (relogio) clearInterval(relogio)
  relogio = null
  if (pasta) rmSync(pasta, { recursive: true, force: true })
}
