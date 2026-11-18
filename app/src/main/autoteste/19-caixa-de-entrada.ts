import { Cenario, Estado } from './util'

export const caixaDeEntrada = (e: Estado): Cenario[] => [
    {
      // 1.4.0: nada que um agente manda a outro é digitado na hora. O pedido espera o usuário parar de
      // escrever (e esvaziar o campo), a entrega volta sem recibo, e quem parou sem entregar faz o app avisar
      // quem pediu. Foi o que travou o time em 12/11/2026: colagem no meio do que o usuário escrevia no
      // Maestro, e o Maestro parado sem saber que o agente tinha terminado.
      nome: 'caixa-de-entrada',
      depende: 'ork',
      rodar: async (d) => {
        const { espacoTerminais, chefe } = e
        const { esperar, js, conferir, aguardar, comando, digitar, tecla, telaNoApp, ultimas } = d
        await js(`window.__teste.loja.abrirEspaco(${JSON.stringify(espacoTerminais)}, null)`)
        await esperar(700)
        // pôr o foco num cartão sem apertar Enter (o `comando` sempre aperta)
        const focar = async (id: string): Promise<void> => {
          await js(`(() => { const L = window.__teste.loja; const n = L.planoAtual().nos.find((x) => x.id === ${JSON.stringify(id)})
            if (n) L.definirCamera({ x: -n.x + 40, y: -n.y + 40, zoom: 1 }); L.selecionar({ tipo: 'no', id: ${JSON.stringify(id)} }) })()`)
          await esperar(900)
        }

        await comando(chefe, 'cls; ork abrir shell --nome Caixa')
        await aguardar(() => telaNoApp(chefe), 'Abri "Caixa"', 30_000)
        const caixaId = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Caixa')?.id ?? ''`)
        await aguardar(() => telaNoApp(caixaId), /PS .*>/)

        // 1) o usuário está escrevendo no Caixa: o pedido fica na caixa de entrada, e o cartão mostra o selo
        await focar(caixaId)
        await digitar('rascunho-do-usuario')
        await comando(chefe, "cls; ork pedir Caixa 'echo CAIXA-ENTROU' --sem-esperar")
        const naFila = await aguardar(() => telaNoApp(chefe), /caixa de entrada de "Caixa"/, 30_000)
        await focar(caixaId)
        const selo = await js<boolean>(`!!document.querySelector('[data-no-id="${caixaId}"] [data-teste="caixa-do-cartao"]')`)
        const antesDeLimpar = await telaNoApp(caixaId)
        conferir(
          'caixa: com o usuário escrevendo, o pedido espera na fila (e o cartão mostra o selo)',
          /caixa de entrada/.test(naFila) && selo && !/^CAIXA-ENTROU/m.test(antesDeLimpar),
          `fila: ${/caixa de entrada/.test(naFila)} · selo: ${selo} · ${ultimas(naFila, 2)}`
        )

        // 2) o usuário limpou o campo (Ctrl+C) e parou de escrever: o pedido entra sozinho
        await tecla('C')
        const entrou = await aguardar(() => telaNoApp(caixaId), /^CAIXA-ENTROU/m, 30_000)
        const textoInteiro = !(await telaNoApp(caixaId)).includes('rascunho-do-usuarioecho')
        conferir(
          'caixa: campo limpo e usuário parado, o pedido entra sozinho, sem colar no rascunho',
          /^CAIXA-ENTROU/m.test(entrou) && textoInteiro,
          ultimas(entrou, 2)
        )

        // 3) `ork entregar` sem --para vai para quem deu a tarefa; num shell, como comentário (nada executa)
        await esperar(1500)
        await comando(caixaId, "ork entregar 'ENTREGA-VEIO'")
        const noChefe = await aguardar(() => telaNoApp(chefe), /# \[ork · entrega de "Caixa"\][\s\S]*# ENTREGA-VEIO/, 40_000)
        const noCaixa = await aguardar(() => telaNoApp(caixaId), /Entrega feita a "PowerShell"|caixa de entrada de "PowerShell"/, 15_000)
        conferir(
          'ork entregar: a entrega chega em quem pediu, sem recibo, e num shell vira comentário',
          /entrega de "Caixa"/.test(noChefe) && /Entrega feita a "PowerShell"|caixa de entrada de "PowerShell"/.test(noCaixa),
          `${ultimas(noChefe, 6)} · ${ultimas(noCaixa, 2)}`
        )

        // 4) pedido sem entrega: o agente trabalha, para, e o app avisa quem pediu
        await esperar(6000)
        await comando(chefe, "cls; ork pedir Caixa 'Start-Sleep 3; echo TRABALHO-FEITO' --sem-esperar")
        await aguardar(() => telaNoApp(caixaId), /^TRABALHO-FEITO/m, 30_000)
        const aviso = await aguardar(() => telaNoApp(chefe), /terminou o que você pediu/, 60_000)
        conferir(
          'parou sem entregar: o app avisa quem pediu, com a tela dele',
          /# \[ork · aviso do Orkester\]/.test(aviso) && /terminou o que você pediu/.test(aviso),
          ultimas(aviso, 3)
        )

        await comando(chefe, 'cls; ork fechar Caixa')
        await aguardar(() => telaNoApp(chefe), 'Fechei "Caixa"', 15_000)
        await js(`window.__teste.loja.selecionar(null)`)
      }
    },
]
