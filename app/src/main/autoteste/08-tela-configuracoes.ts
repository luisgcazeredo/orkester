import { Cenario, Estado } from './util'

export const telaConfiguracoes = (_e: Estado): Cenario[] => [
    {
      // A tela das chaves, pelo mouse (1.3.1). O ork-mcp acima prova que a chave *funciona*, mas cria a chave
      // por `window.ork` e nunca abre a tela — e a 1.3.0 saiu com o campo e o botão sem estilo nenhum (cara de
      // formulário do navegador) e com o conteúdo vazando pela borda direita do diálogo. Nenhuma checagem olhava.
      // Agora: abre pela engrenagem, digita, gera, e confere o que dá para conferir sem olhos — nada sai da
      // caixa, e o campo e o botão têm as cores do app — além de deixar o print para quem for olhar.
      nome: 'tela-configuracoes',
      rodar: async (d) => {
        const { js, conferir, clicarEm, digitar, esperar, print, teclar } = d
        // tudo o que está à mostra dentro do diálogo cabe na caixa dele (com 1 px de folga para arredondamento)
        const vazamentos = (): Promise<string[]> =>
          js<string[]>(`(() => { const dlg = document.querySelector('.dialogo'); if (!dlg) return ['sem diálogo']
            const caixa = dlg.getBoundingClientRect(); const fora = []
            for (const el of dlg.querySelectorAll('*')) { const r = el.getBoundingClientRect()
              if (!r.width || !r.height) continue
              if (r.right > caixa.right + 1 || r.left < caixa.left - 1) fora.push((el.className || el.tagName) + ' ' + Math.round(r.right - caixa.right) + 'px') }
            if (dlg.scrollWidth > dlg.clientWidth + 1) fora.push('o diálogo rola na horizontal')
            return fora.slice(0, 5) })()`)
        // a cor que o app dá a um token, resolvida pelo próprio navegador, para comparar com o que o elemento tem
        const corDoToken = (token: string, propriedade: string, seletor: string): Promise<[string, string]> =>
          js<[string, string]>(`(() => { const sonda = document.createElement('div'); sonda.style.background = 'var(${token})'
            ;(document.querySelector('.dialogo') ?? document.body).appendChild(sonda); const esperado = getComputedStyle(sonda).backgroundColor; sonda.remove()
            const el = document.querySelector(${JSON.stringify(seletor)})
            return [esperado, el ? getComputedStyle(el)[${JSON.stringify(propriedade)}] : 'sem elemento'] })()`)

        conferir('a engrenagem abre as configurações', (await clicarEm('[data-configuracoes]')) && !!(await js<boolean>("!!document.querySelector('.configuracoes')")))
        await clicarEm('.chave-gerar input')
        await digitar('Autoteste tela')
        await esperar(200)
        // o conteúdo dos terminais atrás do diálogo é vivo (recados do ork chegam em tempo variável): fica invisível só
        // durante o print, para a base de telas não depender do relógio; o diálogo aparece inteiro; o estilo volta num finally
        const esconderTerminais = (esconder: boolean): Promise<number> =>
          js<number>(`(() => { const alvos = [...document.querySelectorAll('.no-terminal .terminal-corpo')]
            for (const el of alvos) el.style.visibility = ${esconder ? "'hidden'" : "''"}
            return alvos.length })()`)
        await esconderTerminais(true)
        try {
          await print('configuracoes')
        } finally {
          await esconderTerminais(false)
        }
        const fora1 = await vazamentos()
        conferir('nada vaza da caixa do diálogo (antes de gerar)', fora1.length === 0, fora1.join(' | '))
        const [fundoEsperado, fundoCampo] = await corDoToken('--lateral-filtro', 'backgroundColor', '.chave-gerar input')
        conferir('o campo do nome tem o fundo dos campos do app, não o do navegador', fundoEsperado === fundoCampo, `${fundoCampo} (esperado ${fundoEsperado})`)
        const [destaque, fundoBotao] = await corDoToken('--destaque', 'backgroundColor', '.chave-gerar button')
        conferir('o botão "Gerar chave" é o botão principal do app', destaque === fundoBotao, `${fundoBotao} (esperado ${destaque})`)

        await clicarEm('.chave-gerar button')
        let segredo = ''
        for (let i = 0; i < 20 && !segredo; i++, await esperar(150))
          segredo = await js<string>("document.querySelector('.chave-config')?.textContent ?? ''")
        conferir('gerar pela tela mostra a configuração com o segredo', /ork_[0-9a-f]{64}/.test(segredo), segredo.slice(0, 60))
        // o comando com ORK_CHAVE e a impressão digital são sorteados a cada rodada (o segredo real já foi conferido acima):
        // ficam transparentes só durante o print, para a base de telas não diferir sempre; o estilo é devolvido logo depois
        const cobrirSorteado = (cobrir: boolean): Promise<number> =>
          js<number>(`(() => { const alvos = [...document.querySelectorAll('.chave-config, .chave-linha .partitura-resumo')]
            for (const el of alvos) el.style.color = ${cobrir ? "'transparent'" : "''"}
            return alvos.length })()`)
        const cobertos = await cobrirSorteado(true)
        await esconderTerminais(true)
        try {
          await print('configuracoes-chave')
        } finally {
          await esconderTerminais(false)
          await cobrirSorteado(false)
        }
        conferir('o print da chave cobre só o comando e a impressão digital (2 trechos)', cobertos === 2, `${cobertos} trecho(s) cobertos`)
        const fora2 = await vazamentos()
        conferir('nada vaza da caixa do diálogo (com a chave à mostra)', fora2.length === 0, fora2.join(' | '))

        await js(`(async () => { const k = (await window.ork.chaves.listar()).find((x) => x.nome === 'Autoteste tela')
          if (k) await window.ork.chaves.revogar(k.id) })()`)
        await teclar('Escape')
        await esperar(200)
        conferir('Esc fecha as configurações', !(await js<boolean>("!!document.querySelector('.configuracoes')")))
      }
    },
]
