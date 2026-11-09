// O `ork`, rodado pelos agentes dentro de um terminal do app (pelo Electron em modo Node, ver comandos.ts).
// Lê os argumentos, manda uma linha JSON pelo pipe do app e escreve a resposta. Saída: 0 ok, 1 recusado, 2 sem app.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { nomeDoRecado, SUFIXO_PARCIAL } from '../shared/correio'
import { opcaoExigeValor, validarChamada } from '../main/verbos'

function falhar(mensagem: string, codigo: number): void {
  process.stderr.write(`ork: ${mensagem}\n`)
  process.exitCode = codigo
}

function lerArgumentos(comando: string, argumentos: string[]): { posicionais: string[]; opcoes: Record<string, string | true> } {
  const posicionais: string[] = []
  const opcoes: Record<string, string | true> = {}
  for (let i = 0; i < argumentos.length; i++) {
    const a = argumentos[i]
    if (!a.startsWith('--') || a === '--') {
      posicionais.push(a)
      continue
    }
    const igual = a.indexOf('=')
    const chave = igual > 0 ? a.slice(2, igual) : a.slice(2)
    if (igual > 0) opcoes[chave] = a.slice(igual + 1)
    else if (opcaoExigeValor(comando, chave) && i + 1 < argumentos.length && !argumentos[i + 1].startsWith('--')) opcoes[chave] = argumentos[++i]
    else opcoes[chave] = true
  }
  return { posicionais, opcoes }
}

function lerTexto(comando: string, posicionais: string[], opcoes: Record<string, string | true>): string {
  if (typeof opcoes.arquivo === 'string') return readFileSync(opcoes.arquivo, 'utf8')
  if (comando === 'abrir') return typeof opcoes.pedido === 'string' ? opcoes.pedido : ''
  if (comando !== 'pedir') return ''
  // `ork pedir Nome -`: o pedido vem pela entrada padrão
  if (posicionais[1] === '-') return readFileSync(0, 'utf8')
  return posicionais.slice(1).join(' ')
}

function principal(): void {
  const [comando = 'ajuda', ...resto] = process.argv.slice(2)
  const pipe = process.env.ORK_PIPE
  const cracha = process.env.ORK_CRACHA
  if (!pipe || !cracha) return falhar('só funciona dentro de um terminal do Orkester', 2)
  const { posicionais, opcoes } = lerArgumentos(comando, resto)
  let texto: string
  try {
    texto = lerTexto(comando, posicionais, opcoes)
  } catch (erro) {
    return falhar(`não consegui ler o pedido: ${erro instanceof Error ? erro.message : erro}`, 1)
  }
  try {
    validarChamada(comando, posicionais, opcoes)
  } catch (erro) {
    return falhar(erro instanceof Error ? erro.message : String(erro), 1)
  }

  const linha = `${JSON.stringify({ cracha, comando, posicionais, opcoes, texto })}\n`

  // ORK_SEM_PIPE existe para o autoteste poder exercitar o correio de propósito: um canal que só um agente
  // usa, e que ninguém testa, é um canal que apodrece em silêncio.
  if (process.env.ORK_SEM_PIPE) return void porCorreio(linha)

  const conexao = connect(pipe)
  let resposta = ''
  conexao.setEncoding('utf8')
  conexao.on('connect', () => conexao.write(linha))
  conexao.on('data', (parte: string) => (resposta += parte))
  conexao.on('error', (erro: NodeJS.ErrnoException) => {
    // Pipe recusado pelo sandbox do agente (o Codex no Windows dá EPERM): o mesmo pedido vai por arquivo.
    // Não é erro nenhum do ponto de vista de quem chamou — é o outro caminho para a mesma casa.
    if (erro.code === 'EPERM' || erro.code === 'EACCES') return void porCorreio(linha)
    falhar(
      erro.code === 'ENOENT'
        ? 'não consegui falar com o app (ele foi fechado?)'
        : `não consegui falar com o app (${erro.code ?? erro.message})`,
      2
    )
  })
  conexao.on('end', () => entregar(resposta))
}

/**
 * O segundo canal: deixa o pedido como arquivo numa pasta que o app vigia e espera a resposta aparecer do
 * lado. O porquê está em `shared/correio.ts` — o sandbox do Codex recusa pipe e deixa passar arquivo.
 *
 * A espera é em olhadas de 100 ms, sem prazo próprio: quem manda no tempo é o comando (um `ork esperar`
 * pode levar uma hora, e isso é normal). O que interrompe é a pasta do correio sumir, que é o app fechando.
 */
function porCorreio(linha: string): void {
  const pasta = process.env.ORK_CORREIO
  if (!pasta) return falhar('o sandbox deste agente recusou o pipe do app e não há correio para usar', 2)
  const id = randomBytes(12).toString('hex')
  const pedido = join(pasta, nomeDoRecado('pedido', id))
  const resposta = join(pasta, nomeDoRecado('resposta', id))
  try {
    // grava e renomeia: o app nunca lê um pedido pela metade
    writeFileSync(`${pedido}${SUFIXO_PARCIAL}`, linha, 'utf8')
    renameSync(`${pedido}${SUFIXO_PARCIAL}`, pedido)
  } catch (erro) {
    return falhar(`não consegui deixar o pedido no correio do app: ${erro instanceof Error ? erro.message : erro}`, 2)
  }
  const olhar = (): void => {
    try {
      const conteudo = readFileSync(resposta, 'utf8')
      rmSync(resposta, { force: true })
      return entregar(conteudo)
    } catch {
      // ainda não chegou
    }
    if (!existsSync(pasta)) return falhar('o app fechou antes de responder', 2)
    setTimeout(olhar, 100)
  }
  setTimeout(olhar, 40)
}

/** Imprime a resposta do app, venha ela do pipe ou do correio. */
function entregar(resposta: string): void {
  try {
    const r = JSON.parse(resposta) as { ok: boolean; saida?: string; erro?: string }
    if (r.ok) process.stdout.write(`${r.saida ?? ''}\n`)
    else falhar(r.erro ?? 'recusado', 1)
  } catch {
    falhar('resposta estranha do app', 2)
  }
}

principal()
