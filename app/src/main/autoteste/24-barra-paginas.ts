import { sessaoPorId } from '../terminais'
import { Cenario, Estado } from './util'

export const barraPaginas = (_e: Estado): Cenario[] => [
  {
    // 1.9.0 (T2): a barra de páginas e o quadro sempre montado. Trocar de página não pode derrubar o terminal do
    // quadro: o mesmo objeto xterm no renderer, o mesmo processo no principal, a mesma tela. Clique de verdade nos
    // ícones (mouse do Electron), não `irParaPagina` — o que o usuário faz.
    nome: 'barra-paginas',
    rodar: async (d) => {
      const { esperar, js, conferir, clicarEm, teclar, print, aguardar, telaNoApp, telaNoCartao, comandoAte } = d
      const estado = (): Promise<{ ativa: string; ferramenta: string; quadroVisivel: boolean; testeVisivel: boolean; quadroInerte: boolean }> =>
        js(`({ ativa: window.__teste.casca.paginaAtiva(), ferramenta: window.__teste.loja.lerEstado().ferramenta,
          quadroVisivel: !!document.querySelector('.pagina-ativa[data-pagina="quadro"] .quadro'),
          testeVisivel: !!document.querySelector('.pagina-ativa #pagina-teste-barra'),
          quadroInerte: !!document.querySelector('.pagina-escondida[data-pagina="quadro"][inert]') })`)
      const marcado = (): Promise<string[]> =>
        js(`[...document.querySelectorAll('.barra-pagina.ativo')].map((b) => b.dataset.paginaId + ':' + b.getAttribute('aria-current'))`)
      let cartao = ''
      try {
        for (let i = 0; i < 30 && !(await estado()).quadroVisivel; i++) await esperar(200)
        const inicio = await estado()
        conferir('a barra tem o ícone do quadro marcado ao abrir', inicio.ativa === 'quadro' && (await marcado()).join() === 'quadro:page', JSON.stringify(await marcado()))

        // um terminal de verdade no quadro, com um texto que só ele tem
        cartao = await js<string>(`(() => { const L = window.__teste.loja
          const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
          const id = L.adicionarNo({ tipo: 'terminal', preset }, 560, 420)
          L.atualizarNo(id, { nome: 'Barra' }, false); L.selecionar(null); return id })()`)
        await aguardar(() => telaNoApp(cartao), /PS .*>/, 30_000)
        await comandoAte(cartao, '"MARCA-DA-BARRA-" + (6*7)', 'MARCA-DA-BARRA-42', 20_000)
        for (let i = 0; i < 25 && !(await js<boolean>(`!!window.__terminais?.[${JSON.stringify(cartao)}]`)); i++) await esperar(200)
        await js(`(() => { const t = window.__terminais[${JSON.stringify(cartao)}]; t.__marcaBarra = 'mesmo' })()`)
        // solta a seleção (o terminal selecionado sozinho é dono do teclado) e deixa o prompt assentar
        await js(`window.__teste.loja.selecionar(null)`)
        await esperar(1500)
        const sessao = sessaoPorId(cartao)
        const telaAntes = await telaNoCartao(cartao)
        conferir('o terminal tem a marca na tela antes de trocar', telaAntes.includes('MARCA-DA-BARRA-42') && !!sessao, telaAntes.slice(-120))

        // registra a página de teste (elemento do React 19 à mão: o cenário roda fora do bundle, sem JSX)
        // (o ícone aparece sozinho: a barra ouve o registro); o resto do cenário usa o mouse
        await js(`(() => {
          const el = { $$typeof: Symbol.for('react.transitional.element'), type: 'div', key: null, ref: null,
            props: { id: 'pagina-teste-barra', children: 'página de teste da barra' }, _owner: null, _store: {} }
          window.__teste.casca.registrarPagina({ id: 'teste-barra', titulo: 'Teste da barra', icone: () => null, nativa: false, Componente: () => el })
          })()`)
        await esperar(300)

        const apos = async (rotulo: string, ativaEsperada: 'quadro' | 'teste-barra'): Promise<void> => {
          const e = await estado()
          const tela = await telaNoCartao(cartao)
          const mesmo = await js<boolean>(`window.__terminais?.[${JSON.stringify(cartao)}]?.__marcaBarra === 'mesmo'`)
          conferir(`${rotulo}: página ativa e ícone marcado`, e.ativa === ativaEsperada && (await marcado()).join() === `${ativaEsperada}:page`, JSON.stringify([e, await marcado()]))
          conferir(
            `${rotulo}: o terminal do quadro é o mesmo (objeto no renderer, processo no principal, tela igual)`,
            mesmo && sessaoPorId(cartao) === sessao && !sessao?.fim && tela === telaAntes,
            `mesmo=${mesmo} sessao=${sessaoPorId(cartao) === sessao} fim=${sessao?.fim} tela igual=${tela === telaAntes} · antes=${JSON.stringify(telaAntes.trimEnd().slice(-80))} · depois=${JSON.stringify(tela.trimEnd().slice(-80))}`
          )
        }

        const clicou = await clicarEm('.barra-pagina[data-pagina-id="teste-barra"]')
        await esperar(400)
        await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`)
        await teclar('n')
        await esperar(200)
        await print('barra-paginas-teste')
        const naTeste = await estado()
        conferir('clicar no ícone abre a página; o quadro fica escondido e inerte, e o atalho "n" não age', clicou && naTeste.testeVisivel && !naTeste.quadroVisivel && naTeste.quadroInerte && naTeste.ferramenta === 'selecionar', JSON.stringify(naTeste))
        await apos('na página de teste', 'teste-barra')

        const voltou = await clicarEm('.barra-pagina[data-pagina-id="quadro"]')
        await esperar(400)
        await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`)
        await teclar('n')
        await esperar(200)
        await print('barra-paginas-quadro')
        const noQuadro = await estado()
        conferir('voltar pelo ícone mostra o quadro e o atalho "n" troca para post-it', voltou && noQuadro.quadroVisivel && !noQuadro.testeVisivel && noQuadro.ferramenta === 'postit', JSON.stringify(noQuadro))
        await apos('de volta ao quadro', 'quadro')

        // T2b: Space numa página que não é o quadro não chega ao quadro; ao voltar, o terminal ativo recupera o foco
        const space = (): Promise<boolean> =>
          js(`(() => { const e = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })
            document.body.dispatchEvent(e); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true })); return e.defaultPrevented })()`)
        const focoNoTerminal = (): Promise<boolean> =>
          js(`!!document.activeElement?.closest('.no-terminal.selecionado.sozinho .xterm-helper-textarea')`)
        await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`)
        const espacoNoQuadro = await space()
        await js(`window.__teste.loja.selecionar({ tipo: 'no', id: ${JSON.stringify(cartao)} })`)
        await esperar(400)
        const focoAntes = await focoNoTerminal()
        const foiTeste = await clicarEm('.barra-pagina[data-pagina-id="teste-barra"]')
        await esperar(400)
        const espacoFora = await space()
        const voltou2 = await clicarEm('.barra-pagina[data-pagina-id="quadro"]')
        await esperar(500)
        const focoDepois = await focoNoTerminal()
        const fim = await estado()
        conferir('Space numa página que não é o quadro não chega ao quadro (no quadro, chega)', foiTeste && espacoNoQuadro === true && espacoFora === false, `quadro=${espacoNoQuadro} fora=${espacoFora}`)
        conferir('ao voltar ao quadro, o terminal ativo recebe o foco de novo', voltou2 && fim.quadroVisivel && focoAntes && focoDepois, `antes=${focoAntes} depois=${focoDepois} ${JSON.stringify(fim)}`)
      } finally {
        await js(`(() => { const L = window.__teste.loja; window.__teste.casca.irParaPagina('quadro'); L.escolherFerramenta('selecionar')
          if (${JSON.stringify(cartao)} && L.acharNo(${JSON.stringify(cartao)})) { L.selecionar({ tipo: 'no', id: ${JSON.stringify(cartao)} }); L.apagarSelecao() }
          L.selecionar(null); L.definirCamera({ x: 0, y: 0, zoom: 1 }) })()`)
        await esperar(400)
      }
    }
  }
]
