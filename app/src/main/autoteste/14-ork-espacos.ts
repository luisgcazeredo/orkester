import { BrowserWindow } from 'electron'
import { lerSessaoDeJanelas } from '../dados'
import { janelasParaAbrir } from '../../shared/janelas'
import { Cenario, Estado } from './util'

export const orkEspacos = (e: Estado): Cenario[] => [
    {
      nome: 'ork-espacos',
      depende: 'ork-conexoes',
      rodar: async (d) => {
        const { janela, chefe } = e
        let { frente2 } = e
        try {
        const { tela, esperar, js, centroDe, clicar, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d
    // espera por "seu espaço", que só este comando escreve: procurar o nome do espaço casava com o que
    // outro comando (o `ork quadro`) tinha deixado na tela, e a espera terminava antes da saída de verdade.
    // Ler não muda nada, então aqui vale repetir: o Enter sintético se perde quando a máquina está carregada.
    const espacosDoMpro = await comandoAte(chefe, 'ork espacos', 'seu espaço', 15_000)
    conferir(
      'ork espacos lista o espaço do agente e o marca',
      /\* "Terminais"[\s\S]*seu espaço/.test(espacosDoMpro),
      ultimas(espacosDoMpro, 5)
    )

    await comando(chefe, 'ork janela --novo "Frente 2"')
    await aguardar(() => telaNoApp(chefe), 'Criei o espaço "Frente 2"')
    let frente2Pronta = false
    for (let i = 0; i < 100 && !frente2Pronta; i++) {
      await esperar(100)
      frente2 = BrowserWindow.getAllWindows().find((j) => j !== janela && !j.isDestroyed())
      frente2Pronta = !!frente2 &&
        (await frente2.webContents.executeJavaScript(`window.__teste?.loja.lerEstado().espaco?.nome === 'Frente 2'`).catch(() => false))
    }
    conferir('ork janela --novo cria o espaço e abre a janela', frente2Pronta, frente2 ? frente2.webContents.getTitle() : 'sem janela')

    // Com duas janelas abertas, a sessão em disco tem que descrever as duas: é dela que sai a reabertura
    // na próxima vez que o app subir. A gravação é adiada meio segundo, então esperamos um pouco mais.
    await esperar(900)
    const sessaoNoDisco = lerSessaoDeJanelas()
    const espacosNaSessao = sessaoNoDisco.janelas.map((j) => j.espacoId)
    const idsAbertos = await js<string[]>(`[window.__teste.loja.lerEstado().espaco?.id ?? null]`)
    const idDaFrente2 = frente2
      ? await frente2.webContents.executeJavaScript(`window.__teste.loja.lerEstado().espaco?.id ?? null`).catch(() => null)
      : null
    conferir(
      'a sessão em disco guarda as duas janelas, cada uma com o seu espaço',
      sessaoNoDisco.janelas.length === 2 &&
        espacosNaSessao.includes(idsAbertos[0]) &&
        espacosNaSessao.includes(idDaFrente2) &&
        sessaoNoDisco.janelas.every((j) => j.largura > 0 && j.altura > 0),
      `${sessaoNoDisco.janelas.length} janela(s): ${sessaoNoDisco.janelas.map((j) => `${j.largura}x${j.altura} em ${j.x},${j.y}`).join(' | ')}`
    )

    const UMA_TELA = [{ x: 0, y: 0, largura: 1920, altura: 1040 }]
    const reabriria = janelasParaAbrir(sessaoNoDisco, [idsAbertos[0], idDaFrente2].filter((id): id is string => !!id), UMA_TELA)
    conferir(
      'essa sessão reabriria as duas janelas, cada uma dentro da tela',
      reabriria.length === 2 && reabriria.every((j) => j.x >= 0 && j.y >= 0 && j.x + j.largura <= 1920 && j.y + j.altura <= 1040),
      reabriria.map((j) => `${j.espacoId?.slice(0, 8)} em ${j.x},${j.y} ${j.largura}x${j.altura}`).join(' | ')
    )

    await comando(chefe, 'ork abrir --espaco "Frente 2" shell --nome "Longe"')
    const abriuLonge = await aguardar(() => telaNoApp(chefe), 'Abri "Longe"')
    const longe = frente2
      ? await frente2.webContents.executeJavaScript(`(() => { const n = window.__teste.loja.planoAtual().nos
          .find((x) => x.tipo === 'terminal' && x.nome === 'Longe'); return n ? { id: n.id, criadoPor: n.criadoPor } : null })()`).catch(() => null)
      : null
    await comando(chefe, 'ork ver Longe --linhas 5')
    const viuLonge = await aguardar(() => telaNoApp(chefe), '"Longe"')
    conferir(
      'ork abrir --espaco cria longe e o dono ainda consegue ver sem corda',
      !!longe && longe.criadoPor === chefe && abriuLonge.includes('porque o abriu') && viuLonge.includes('"Longe"'),
      longe ? `criado por: ${longe.criadoPor}` : ultimas(abriuLonge, 4)
    )

    await comando(chefe, 'ork orcamento')
    const orcamento = await aguardar(() => telaNoApp(chefe), /contexto: (\d+% restante|não deu para ler)/i)
    conferir('ork orcamento responde mesmo sem contexto na tela', /contexto: (\d+% restante|não deu para ler)/i.test(orcamento), ultimas(orcamento))

    // painel: só consulta o espelho enquanto aberto; aqui basta haver um terminal conhecido, com estado e contexto.
    const botaoContexto = await centroDe('button[title="Contexto dos terminais"]')
    if (botaoContexto) await clicar(botaoContexto)
    await esperar(350)
    const painelContexto = await js<{ linhas: number; texto: string }>(`(() => ({
      linhas: document.querySelectorAll('.contexto-terminal').length,
      texto: document.querySelector('.painel-contexto')?.textContent ?? ''
    }))()`)
    tela.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    tela.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await esperar(150)
    const painelFechado = await js<boolean>('!document.querySelector(".painel-contexto")')
    conferir(
      'painel de contexto abre, mostra situação/contexto e fecha com Esc',
      painelContexto.linhas > 0 && /livre|trabalhando|pergunta|encerrado/.test(painelContexto.texto) && /%|—/.test(painelContexto.texto) && painelFechado,
      `${painelContexto.linhas} linhas · fechado: ${painelFechado}`
    )

    // a janela do "Frente 2" ficou com o foco do Windows, e teclado sintético vai para a janela focada:
    // sem isto, o que vem abaixo é digitado no vazio
    janela.focus()
    await esperar(400)

        } finally {
          e.frente2 = frente2
        }
      },
    },
]
