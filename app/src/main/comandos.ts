import { ipcMain } from 'electron'
import { createServer } from 'node:net'
import { CANAIS, CANAIS_AGENTES, CANAIS_CHAVES, primeiroPedidoDoCartao, type ResultadoDoPrimeiroPedido, type RespostaAoAgente, type ResumoContextoTerminal } from '../shared/api'
import type { ComandoDoMcp } from '../shared/chaves'
import { donoDe } from './janelas'
import { abrirCorreio } from './correio'
import { registroDoEnvio } from './envio'
import { esperarSessao, esquecerRascunho, sessaoPorId, sessoesDoEspaco, telaDe, type Sessao } from './terminais'
import { PIPE, instalarComando, comandoDoMcp } from './instalarOrk'
import { respostas, janelasProntas } from './quadroDoAgente'
import { situacaoNaTela, contextoNaTela, aguardarPronto, digitarPedido, registrar, caixa, fecharCartoesDepoisDaResposta } from './espera'
import { responderAoPedido, atender, publicarCano } from './cano'

const MAX_PEDIDO = 512 * 1024
const MAX_CONEXOES = 128

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
    caixa.liberar(s.id)
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
