import { sessaoPorId, terminaisVivos, tetoDeTerminaisNoTeste } from '../terminais'
import { Cenario, Estado } from './util'

export const tetoDeTerminais = (e: Estado): Cenario[] => [
    {
      nome: 'teto-de-terminais',
      depende: 'ork',
      rodar: async (d) => {
        const { presetShell } = e
        const { esperar, js, conferir, aguardar, telaNoApp, ultimas } = d
    // Com o teto fechado no número exato de processos vivos, o próximo cartão tem que esperar vaga — e dizer
    // isso na própria tela. Antes ele simplesmente não nascia, calado, e o usuário olhava um terminal morto.
    // Primeiro espera o quadro assentar: cartões apagados nos cenários anteriores ainda estão morrendo
    // (há uma folga antes de o processo cair), e cada morte abre uma vaga depois que a porta fechou.
    let estavel = 0
    let antes = -1
    for (let i = 0; i < 80 && estavel < 10; i++) {
      await esperar(300)
      const agora = terminaisVivos()
      estavel = agora === antes ? estavel + 1 : 0
      antes = agora
    }

    const primeiro = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 3600, 1800)
      L.atualizarNo(id, { nome: 'Na vaga' }, false); return id })()`)
    for (let i = 0; i < 60 && !sessaoPorId(primeiro)?.processo; i++) await esperar(200)
    // o teto conta processos vivos, não cartões: cartão esperando ou morrendo não ocupa vaga
    tetoDeTerminaisNoTeste(terminaisVivos())
    const segundo = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 3600, 2000)
      L.atualizarNo(id, { nome: 'Na fila' }, false); return id })()`)
    await esperar(1500)

    const naFila = await aguardar(() => telaNoApp(segundo), /limite deste app/, 15_000)
    conferir(
      'passou do teto: o cartão diz na tela que está esperando vaga, em vez de ficar mudo',
      /limite deste app/.test(naFila) && !sessaoPorId(segundo)?.processo && !!sessaoPorId(primeiro)?.processo,
      `fila sem processo: ${!sessaoPorId(segundo)?.processo} · tela: ${ultimas(naFila, 2)}`
    )

    // fecha o que estava na vaga: o da fila tem que começar sozinho
    await js(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: '${primeiro}' }); L.apagarSelecao(); L.selecionar(null) })()`)
    await esperar(2500) // a folga do apagar (1,5 s no autoteste) e mais um respiro
    let comecou = false
    for (let i = 0; i < 60 && !comecou; i++) {
      await esperar(200)
      comecou = !!sessaoPorId(segundo)?.processo
    }
    conferir('fechou um, o da fila começa sozinho', comecou, comecou ? 'processo nasceu' : 'continua sem processo')

    tetoDeTerminaisNoTeste(32)
    await js(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: '${segundo}' }); L.apagarSelecao(); L.selecionar(null) })()`)
    await esperar(400)
      },
    },
]
