import { app } from 'electron'
import { linhaDeComando, sessaoPorId } from '../terminais'
import { Cenario, Estado } from './util'

export const agentes = (e: Estado): Cenario[] => [
    {
      nome: 'agentes',
      depende: 'ork-presets',
      rodar: async (d) => {
        const { chefe } = e
        const { esperar, js, print, conferir, comando, aguardar, telaNoApp, ultimas } = d
    if (process.env.ORK_AGENTES_DE_VERDADE) {
      const pastaApp = app.getAppPath()
      // `confiar`: as teclas que aceitam a pergunta de confiança na pasta, se ela aparecer (no Claude o cursor começa no "não")
      const casos = [
        { agente: 'claude', nome: 'Claudinho', pergunta: 'Quanto é 21 vezes 2? Responda só com o número seguido de -OK.', resposta: '42-OK', confiar: 'baixo enter' },
        { agente: 'codex', nome: 'Codexinho', pergunta: 'Quanto é 30 mais 7? Responda só com o número seguido de -OK.', resposta: '37-OK', confiar: 'enter' }
      ]
      for (const caso of casos) {
        // o cartão do chefe na tela: fora dela por mais de 1,5 s, ele descarrega e o teclado não chega
        await js('window.__teste.loja.definirCamera({ x: 0, y: 0, zoom: 1 })')
        await esperar(300)
        await comando(
          chefe,
          `ork abrir ${caso.agente} --nome ${caso.nome} --pasta '${pastaApp}' --pedido '${caso.pergunta}' --esperar --tempo 150; echo FIM-ABRIR-${caso.nome}`
        )
        let saida = await aguardar(() => telaNoApp(chefe), new RegExp(`^FIM-ABRIR-${caso.nome}`, 'm'), 200_000)
        const id = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.nome === '${caso.nome}')?.id ?? ''`)
        // pasta nova para o agente: confiança, servidores MCP do projeto, aviso de atualização… O `ork` não digita
        // em cima de pergunta; o teste responde pelo `ork teclas` (a regra do agente é decidir ou perguntar ao usuário)
        for (let i = 0; i < 4 && !saida.includes(caso.resposta); i++) {
          const naTela = (await telaNoApp(id)).split('\n').slice(-25).join('\n')
          const teclas = /I trust this folder|Trust and continue/i.test(naTela)
            ? caso.confiar
            : /MCP servers/i.test(naTela)
              ? 'esc'
              : /update now/i.test(naTela)
                ? 'baixo enter'
                : null
          if (teclas) {
            await comando(chefe, `ork teclas ${caso.nome} ${teclas}; echo FIM-T${i}-${caso.nome}`)
            await aguardar(() => telaNoApp(chefe), new RegExp(`^FIM-T${i}-${caso.nome}`, 'm'), 30_000)
            await esperar(5000)
          }
          await comando(chefe, `ork pedir ${caso.nome} '${caso.pergunta}' --tempo 150; echo FIM-P${i}-${caso.nome}`)
          saida = await aguardar(() => telaNoApp(chefe), new RegExp(`^FIM-P${i}-${caso.nome}`, 'm'), 200_000)
        }
        // o Claude grava a conversa com o id que demos; o do Codex é descoberto pelo arquivo dele (a cada 5 s)
        let retomar = ''
        for (let i = 0; i < 40 && !/--resume|codex resume/.test(retomar); i++) {
          await esperar(500)
          const s = sessaoPorId(id)
          retomar = s ? linhaDeComando(s.espec) : ''
        }
        await js(`(() => { const L = window.__teste.loja; const n = L.planoAtual().nos.find((x) => x.id === '${id}')
          if (n) L.definirCamera({ x: -n.x + 60, y: -n.y + 60, zoom: 1 }) })()`)
        await esperar(800)
        await print(`agente-${caso.agente}`)
        conferir(
          `${caso.agente} de verdade: abre pelo ork, responde e a conversa fica para retomar`,
          saida.includes(caso.resposta) && /--resume|codex resume/.test(retomar),
          `${saida.includes(caso.resposta) ? 'respondeu' : ultimas(saida, 6)} · ${retomar}`
        )
        await comando(chefe, `ork fechar ${caso.nome}`)
        await aguardar(() => telaNoApp(chefe), `Fechei "${caso.nome}"`, 15_000)
      }
    }

      },
    },
]
