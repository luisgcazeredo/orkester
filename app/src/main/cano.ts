import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { type Socket } from 'node:net'
import { join } from 'node:path'
import { usuarioPorChave } from './chaves'
import { PASTA_DADOS } from './dados'
import { validarChamada, type NomeDeVerbo } from './verbos'
import { sessaoPorCracha, type Sessao } from './terminais'
import { PIPE } from './instalarOrk'
import { fecharCartoesDepoisDaResposta } from './espera'
import { desfazerConversaoDoGitBash, HANDLERS, type Pedido, type ResultadoDoComando } from './verbosDoAgente'
import { executarComoUsuario } from './verbosDoUsuario'

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
      if (!chave) throw new Error('chave inválida ou revogada; gere outra no Orkester, em Configurações › Conexões › Chaves')
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

export async function atender(linha: string, socket: Socket, fechado: () => boolean): Promise<void> {
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
 * O endereço do cano muda a cada execução (é sorteado), e um cliente MCP não herda o ambiente do app como
 * os terminais herdam. Então o app o publica num arquivo enquanto vive — e o arquivo existir é também
 * como o servidor MCP sabe que o Orkester está aberto. Some quando o app sai (`fecharCano`).
 */
const ARQUIVO_DO_CANO = (): string => join(PASTA_DADOS, 'cano.json')

export function publicarCano(): void {
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
