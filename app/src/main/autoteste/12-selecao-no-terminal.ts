import { Cenario, Estado } from './util'

export const selecaoNoTerminal = (e: Estado): Cenario[] => [
    {
      // Seleção com o mouse dentro do terminal. O xterm mede a célula sem escala e lê o clique com escala;
      // onde há escala CSS — o cartão desenha o terminal em dobro para não borrar, e o quadro ainda tem
      // zoom — a conta dele erra por um fator e a seleção cai bem acima do mouse (ver `shared/escala.ts`).
      // Passou batido na 1.0 porque nenhuma checagem selecionava texto com o mouse: a suíte digitava e lia.
      // Roda em dois zooms de propósito, porque o zoom entra na conta — num zoom só, um erro de escala
      // poderia passar por coincidência. As medidas saem do que está na tela (o retângulo do desenho
      // dividido por linhas e colunas), nunca dos fatores que o conserto usa, senão a checagem concordaria
      // com o erro.
      nome: 'selecao-no-terminal',
      depende: 'ork',
      rodar: async (d) => {
        const { presetShell } = e
        const { esperar, js, conferir, aguardar, arrastar, comandoAte, telaNoApp } = d

    const cartao = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 6000, 2600)
      L.atualizarNo(id, { nome: 'Seleção' }, false); return id })()`)
    await aguardar(() => telaNoApp(cartao), /PS .*>/, 30_000)
    // seis linhas diferentes: se a seleção cair na linha errada, o detalhe da falha diz em qual caiu
    await comandoAte(cartao, '1..6 | % { "ALVO-DA-SELECAO-$_" }', 'ALVO-DA-SELECAO-6', 20_000)

    /** Onde, na tela, começa e termina esta linha do terminal — pelo tamanho que o desenho tem na tela. */
    const medir = (linha: string): Promise<{ x1: number; x2: number; y: number; achou: boolean } | null> =>
      js(`(() => {
        const t = window.__terminais?.[${JSON.stringify(cartao)}]
        const el = document.querySelector('[data-no-id="${cartao}"] .xterm-screen')
        if (!t || !el) return null
        const r = el.getBoundingClientRect()
        const altura = r.height / t.rows
        const largura = r.width / t.cols
        const b = t.buffer.active
        let y = -1
        for (let i = 0; i < t.rows; i++) {
          if ((b.getLine(b.viewportY + i)?.translateToString(true) ?? '').trim() === ${JSON.stringify(linha)}) { y = i; break }
        }
        if (y < 0) return { x1: 0, x2: 0, y: 0, achou: false }
        return {
          // 0,2 da célula, não a metade: na metade o clique cai na fronteira entre a coluna 1 e a 2 (o xterm
          // soma meia célula e arredonda para cima), e um pixel de arredondamento já começa a seleção um
          // caractere adiante
          x1: Math.round(r.left + largura * 0.2),
          // e o fim um quinto de célula passado o último caractere, pelo mesmo motivo: meia célula
          // antes do fim é a fronteira exata da última coluna, e em zoom pequeno (célula de 5 px) o
          // arredondamento decide para o lado de fora e come o caractere
          x2: Math.round(r.left + largura * (${JSON.stringify(linha)}.length + 0.2)),
          y: Math.round(r.top + altura * (y + 0.5)),
          achou: true
        } })()`)

    for (const zoom of [1, 0.7]) {
      const alvo = 'ALVO-DA-SELECAO-4'
      // a câmera translada e **depois** amplia, então o cartão aparece em `camera + lugar × zoom`: sem o
      // zoom nesta conta, no zoom 70% o cartão ia parar a 1700 px fora da janela e o arrasto caía no vazio
      await js(`(() => { const L = window.__teste.loja; const n = L.acharNo('${cartao}')
        L.definirCamera({ x: -n.x * ${zoom} + 60, y: -n.y * ${zoom} + 60, zoom: ${zoom} })
        L.selecionar({ tipo: 'no', id: '${cartao}' })
        window.__terminais?.[${JSON.stringify(cartao)}]?.clearSelection() })()`)
      await esperar(700)
      const onde = await medir(alvo)
      const rotulo = `seleção com o mouse pega a linha onde o mouse está (zoom ${Math.round(zoom * 100)}%)`
      if (!onde?.achou) {
        conferir(rotulo, false, 'não achei a linha no cartão')
        continue
      }
      await arrastar({ x: onde.x1, y: onde.y }, { x: onde.x2, y: onde.y })
      const texto = await js<string>(`(window.__terminais?.[${JSON.stringify(cartao)}]?.getSelection() ?? '').trim()`)
      conferir(rotulo, texto === alvo, `esperado "${alvo}" · selecionado "${texto}"`)
    }

    await js(`(() => { const L = window.__teste.loja
      if (L.acharNo('${cartao}')) { L.selecionar({ tipo: 'no', id: '${cartao}' }); L.apagarSelecao() }
      L.selecionar(null); L.definirCamera({ x: 0, y: 0, zoom: 1 }) })()`)
    await esperar(400)
      },
    },
]
