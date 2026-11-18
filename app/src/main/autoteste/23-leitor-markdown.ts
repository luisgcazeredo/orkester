import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dialog } from 'electron'
import { PASTA_DADOS } from '../dados'
import { Cenario, Estado } from './util'

type Pt = { x: number; y: number }

/**
 * 1.9.0 (T6): o Leitor de Markdown e o `.md` formatado no visor de código, na tela, como gente usa.
 * A fixture mora numa pasta TEMPORÁRIA (nunca a pasta real do usuário) e a pasta é fixada pela API
 * (`window.ork.dados.salvarPreferencias`), não pelo diálogo do sistema. Dez prints: cinco estados nos dois temas.
 */
export const leitorMarkdown = (_e: Estado): Cenario[] => [
  {
    nome: 'leitor-markdown',
    rodar: async (d) => {
      const { tela, esperar, js, conferir, print, aguardarCarga, clicar, clicarEm, teclar, digitar } = d

      // erros do console durante o cenário (a assinatura do evento mudou entre versões do Electron: aceita as duas)
      const erros: string[] = []
      const ouvir = (...args: unknown[]): void => {
        const primeiro = args[0] as { level?: unknown; message?: unknown } | undefined
        const detalhes = primeiro && typeof primeiro === 'object' && 'message' in primeiro ? primeiro : undefined
        const nivel = detalhes ? detalhes.level : args[1]
        const mensagem = String(detalhes ? detalhes.message : args[2])
        if (nivel === 'error' || nivel === 3) erros.push(mensagem.slice(0, 200))
      }
      tela.on('console-message', ouvir as never)

      // ---- a fixture: tudo numa pasta temporária só deste cenário ----
      const pasta = mkdtempSync(join(tmpdir(), 'orkester-leitor-'))
      // FORA de verdade: no autoteste o espaço aponta para a pasta do usuário e o temporário mora dentro dela, então a pasta
      // "de fora" precisa estar em outro lugar (a pasta pública do Windows; sem ela, a do ProgramData)
      const lugarDeFora = [process.env.PUBLIC, process.env.ProgramData, 'C:\\Users\\Public'].find((p) => !!p && existsSync(p))
      if (!lugarDeFora) throw new Error('sem uma pasta fora da pasta do usuário para o teste de "fora das pastas"')
      const fora = mkdtempSync(join(lugarDeFora, 'orkester-leitor-fora-'))
      const linhaLonga = 'X'.repeat(400)
      const a = (titulo: string): string =>
        [
          `# ${titulo}`,
          '',
          'Texto com [vizinho](b.md), [mesmo nome](sub/a.md), [perigo](javascript:alert(1)), [morto](c.txt) e [site](https://example.com).',
          '',
          '| coluna um | coluna dois |',
          '| --------- | ----------- |',
          '| valor um  | valor dois  |',
          '',
          '```js',
          'const x = 1',
          '```',
          '',
          '<script>window.__invadido = true</script>',
          '',
          linhaLonga,
          ''
        ].join('\n')
      const caminhoA = join(pasta, 'a.md')
      mkdirSync(join(pasta, 'sub'))
      writeFileSync(caminhoA, a('Título do Leitor'))
      writeFileSync(join(pasta, 'b.md'), '# Arquivo B\n\nSó o B.\n')
      writeFileSync(join(pasta, 'sub', 'a.md'), '# A da subpasta\n\nOutro arquivo com o mesmo nome.\n')
      writeFileSync(join(pasta, 'c.txt'), 'não é markdown\n')
      writeFileSync(join(pasta, 'grande.md'), '# Grande\n\n' + 'palavra '.repeat(Math.ceil((450 * 1024) / 8)))
      writeFileSync(join(fora, 'x.md'), '# Fora\n\nNenhuma raiz do quadro tem esta pasta.\n')
      const preferenciasEmDisco = (): { leitor?: { pastas?: string[] } } => JSON.parse(readFileSync(join(PASTA_DADOS, 'preferencias.json'), 'utf8'))

      // ---- ajudantes ----
      const esperarAte = async (expressao: string, ms = 8000): Promise<boolean> => {
        for (const limite = Date.now() + ms; Date.now() < limite; await esperar(100)) {
          if (await js<boolean>(`!!(${expressao})`)) return true
        }
        return false
      }
      const paginaAtiva = (): Promise<string> => js<string>('window.__teste.casca.paginaAtiva()')
      const irPara = async (id: string): Promise<void> => {
        if (!(await clicarEm(`[data-pagina-id="${id}"]`))) throw new Error(`sem o botão da página ${id}`)
        await esperarAte(`window.__teste.casca.paginaAtiva() === ${JSON.stringify(id)}`)
        await esperar(300)
      }
      const titulo = (): Promise<string> => js<string>(`document.querySelector('.leitor-titulo')?.textContent ?? ''`)
      const ativos = (): Promise<string[]> =>
        js<string[]>(`[...document.querySelectorAll('.leitor-arquivo.ativo')].map((x) => x.getAttribute('data-caminho'))`)
      const voltarDisabled = (): Promise<boolean> => js<boolean>(`!!document.querySelector('.leitor-topo .leitor-voltar')?.disabled`)
      const abrirNaArvore = async (rel: string): Promise<boolean> => {
        const ok = await clicarEm(`.leitor-arquivo[data-caminho="${rel}"]`)
        await esperar(300)
        return ok
      }
      const centroDoLink = (texto: string, raiz: string): Promise<Pt | null> =>
        js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(raiz + ' a')})].find((x) => x.textContent.trim() === ${JSON.stringify(texto)})
          if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
      const clicarNoLink = async (texto: string, raiz: string): Promise<boolean> => {
        const p = await centroDoLink(texto, raiz)
        if (p) await clicar(p)
        await esperar(400)
        return !!p
      }
      const tecla = async (keyCode: string, modifiers: Array<'control' | 'alt' | 'shift'>): Promise<void> => {
        tela.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
        tela.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
        await esperar(250)
      }
      const ferramenta = (): Promise<string> => js<string>('window.__teste.loja.lerEstado().ferramenta')
      const temaDaTela = (): Promise<string> => js<string>(`document.querySelector('.app').className.includes('tema-claro') ? 'claro' : 'escuro'`)
      const escolherLeitor = async (): Promise<void> => {
        // a pasta fixada é a raiz da fixture; clicar nela troca a árvore
        if (!(await clicarEm('.leitor-raiz-nome[data-fixada="true"]'))) throw new Error('sem a pasta fixada na lista do Leitor')
        await esperarAte(`document.querySelector('.leitor-arquivo[data-caminho="a.md"]')`)
        await esperar(200)
      }
      const noDoCartao = (id: string, resto: string): string => `[data-no-id="${id}"] ${resto}`
      const verCartao = async (id: string): Promise<void> => {
        await js(`(() => { const L = window.__teste.loja; const n = L.planoAtual().nos.find((x) => x.id === ${JSON.stringify(id)})
          if (n) L.definirCamera({ x: -n.x + 60, y: -n.y + 60, zoom: 1 }) })()`)
        await esperar(500)
      }
      const trocarTema = async (tema: 'escuro' | 'claro'): Promise<void> => {
        if ((await temaDaTela()) === tema) return
        await irPara('quadro')
        if (!(await clicarEm(`button[title="${tema === 'claro' ? 'Tema claro' : 'Tema escuro'}"]`))) throw new Error('sem o botão de tema')
        await esperar(600)
      }

      let cartao = ''
      let cartaoFora = ''
      const passo = async (nome: string, f: () => Promise<void>): Promise<void> => {
        try {
          await f()
        } catch (erro) {
          conferir(`leitor-markdown: ${nome} rodou sem exceção`, false, erro instanceof Error ? erro.message : String(erro))
        }
      }

      try {
        await aguardarCarga()
        await irPara('quadro')

        // ---- pasta fixada: pela API, sem diálogo; vai para o preferencias.json e sobrevive a recarregar ----
        await passo('fixar a pasta', async () => {
          await js(`window.ork.dados.salvarPreferencias({ leitor: { pastas: [${JSON.stringify(pasta)}] } })`)
          const gravado = preferenciasEmDisco().leitor?.pastas ?? []
          conferir('leitor-markdown: a pasta fixada aparece no preferencias.json', gravado.length === 1 && gravado[0] === pasta, JSON.stringify(gravado))
          tela.reload()
          await new Promise<void>((r) => tela.once('did-finish-load', () => r()))
          await aguardarCarga()
          await esperar(400)
          const naLoja = await js<string[]>(`window.__teste.loja.lerEstado().preferencias.leitor?.pastas ?? []`)
          conferir('leitor-markdown: a pasta fixada sobrevive a recarregar a janela', naLoja.length === 1 && naLoja[0] === pasta, JSON.stringify(naLoja))
        })

        // ---- a página abre e lista só .md ----
        await passo('abrir a página e listar', async () => {
          await irPara('leitor')
          conferir('leitor-markdown: o botão da barra abre a página Leitor', (await paginaAtiva()) === 'leitor' && (await esperarAte(`document.querySelector('[data-pagina="leitor"] .leitor[data-leitor]')`)), await paginaAtiva())
          const raizes = await js<Array<{ raiz: string; fixada: string }>>(
            `[...document.querySelectorAll('.leitor-raiz-nome')].map((x) => ({ raiz: x.getAttribute('data-raiz'), fixada: x.getAttribute('data-fixada') }))`
          )
          conferir(
            'leitor-markdown: a pasta fixada está na lista de raízes, marcada como fixada',
            raizes.some((r) => r.raiz === pasta && r.fixada === 'true'),
            JSON.stringify(raizes)
          )
          await escolherLeitor()
          await clicarEm('.leitor-pasta[data-pasta="sub"]')
          await esperarAte(`document.querySelector('.leitor-arquivo[data-caminho="sub/a.md"]')`)
          const lista = await js<string[]>(`[...document.querySelectorAll('.leitor-arvore .leitor-arquivo')].map((x) => x.getAttribute('data-caminho'))`)
          const textoDaArvore = await js<string>(`document.querySelector('.leitor-arvore')?.textContent ?? ''`)
          conferir(
            'leitor-markdown: a árvore lista só .md (a.md, b.md, grande.md, sub/a.md) e nenhum .txt',
            JSON.stringify([...lista].sort()) === JSON.stringify(['a.md', 'b.md', 'grande.md', 'sub/a.md']) && !textoDaArvore.includes('c.txt'),
            JSON.stringify(lista)
          )
          conferir('leitor-markdown: sem arquivo aberto o Voltar está desligado', await voltarDisabled())
        })

        // ---- renderização segura ----
        await passo('renderizar a.md', async () => {
          await abrirNaArvore('a.md')
          const abriu = await esperarAte(`document.querySelector('.leitor-corpo article.md-corpo[data-arquivo="a.md"]')`)
          conferir('leitor-markdown: clicar em a.md abre o arquivo formatado', abriu && (await titulo()) === 'a.md', await titulo())
          const forma = await js<{ h1: string; th: number; td: number; codigo: number; script: number; invadido: boolean; literal: boolean; jsHref: number; perigo: string; morto: string }>(`(() => {
            const art = document.querySelector('.leitor-corpo article.md-corpo')
            const perigo = [...art.querySelectorAll('a')].find((x) => x.textContent.trim() === 'perigo')
            const morto = [...art.querySelectorAll('a')].find((x) => x.textContent.trim() === 'morto')
            return { h1: art.querySelector('h1')?.textContent ?? '', th: art.querySelectorAll('table th').length, td: art.querySelectorAll('table td').length,
              codigo: art.querySelectorAll('pre.md-codigo').length, script: document.querySelectorAll('.leitor-corpo script, .leitor-corpo [onerror], .leitor-corpo [onclick]').length,
              invadido: window.__invadido === true, literal: art.textContent.includes('<script>window.__invadido = true</script>'),
              jsHref: art.querySelectorAll('[href^="javascript" i]').length,
              perigo: perigo ? 'virou link' + (perigo.hasAttribute('href') ? '+href' : '') : art.textContent.includes('[perigo](javascript:alert(1))') ? 'texto puro' : 'sumiu',
              morto: morto ? (morto.classList.contains('md-link-morto') ? 'morto' : 'link') + (morto.hasAttribute('href') ? '+href' : '') : 'sumiu' }
          })()`)
          conferir('leitor-markdown: o título vira h1', forma.h1 === 'Título do Leitor', forma.h1)
          conferir('leitor-markdown: a tabela vira tabela (2 cabeçalhos, 2 células)', forma.th === 2 && forma.td === 2, `${forma.th} th · ${forma.td} td`)
          conferir('leitor-markdown: o bloco de código vira pre.md-codigo', forma.codigo === 1, String(forma.codigo))
          conferir('leitor-markdown: nenhum <script> nem manipulador vindo do arquivo; o texto aparece como texto', forma.script === 0 && !forma.invadido && forma.literal, JSON.stringify(forma))
          conferir('leitor-markdown: o link javascript: não vira link (sem href, sem a): fica como texto', forma.jsHref === 0 && forma.perigo === 'texto puro', `${forma.perigo} · href javascript ${forma.jsHref}`)
          conferir('leitor-markdown: link para algo que não é .md fica morto, sem href', forma.morto === 'morto', forma.morto)
          const largura = await js<{ corpo: number; visivel: number; texto: number }>(`(() => { const c = document.querySelector('.leitor-corpo'); const art = c.querySelector('article')
            return { corpo: c.scrollWidth, visivel: c.clientWidth, texto: art.scrollWidth - art.clientWidth } })()`)
          conferir('leitor-markdown: a linha de 400 caracteres quebra: o Leitor não cresce para o lado', largura.corpo <= largura.visivel + 1 && largura.texto <= 1, JSON.stringify(largura))
          await clicarNoLink('morto', '.leitor-corpo')
          conferir('leitor-markdown: clicar no link morto não faz nada (página e arquivo seguem)', (await paginaAtiva()) === 'leitor' && (await titulo()) === 'a.md', `${await paginaAtiva()} · ${await titulo()}`)
        })

        // ---- links internos, Voltar e arquivos de mesmo nome ----
        await passo('navegar por links', async () => {
          const clicou = await clicarNoLink('vizinho', '.leitor-corpo')
          const noB = await esperarAte(`document.querySelector('.leitor-corpo article[data-arquivo="b.md"]')`)
          conferir('leitor-markdown: clicar no link para b.md abre b.md', clicou && noB && (await titulo()) === 'b.md', await titulo())
          conferir('leitor-markdown: a árvore marca só b.md', JSON.stringify(await ativos()) === JSON.stringify(['b.md']), JSON.stringify(await ativos()))
          conferir('leitor-markdown: depois de seguir um link o Voltar liga', !(await voltarDisabled()))
          await tecla('Left', ['alt'])
          const voltou = await esperarAte(`document.querySelector('.leitor-corpo article[data-arquivo="a.md"]')`)
          conferir('leitor-markdown: Alt+← volta para a.md', voltou && JSON.stringify(await ativos()) === JSON.stringify(['a.md']), `${await titulo()} · ${JSON.stringify(await ativos())}`)

          await clicarNoLink('mesmo nome', '.leitor-corpo')
          await esperarAte(`document.querySelector('.leitor-arquivo.ativo[data-caminho="sub/a.md"]')`)
          const confusao = await ativos()
          const textoDaSub = await js<string>(`document.querySelector('.leitor-corpo article')?.textContent ?? ''`)
          conferir(
            'leitor-markdown: a.md e sub/a.md não se confundem (só sub/a.md marcado, e é o texto dele)',
            JSON.stringify(confusao) === JSON.stringify(['sub/a.md']) && textoDaSub.includes('A da subpasta'),
            `${JSON.stringify(confusao)} · ${textoDaSub.slice(0, 40)}`
          )
          if (!(await clicarEm('.leitor-topo .leitor-voltar'))) throw new Error('sem o botão Voltar')
          await esperarAte(`document.querySelector('.leitor-arquivo.ativo[data-caminho="a.md"]')`)
          const aposVoltar = await ativos()
          conferir('leitor-markdown: o botão Voltar volta para a.md (e não para sub/a.md)', JSON.stringify(aposVoltar) === JSON.stringify(['a.md']) && (await js<boolean>(`!!document.querySelector('.leitor-corpo article[data-arquivo="a.md"]')`)), JSON.stringify(aposVoltar))
        })

        // ---- o arquivo muda no disco: a tela acompanha em até 2 s ----
        await passo('vigia do disco', async () => {
          const antes = Date.now()
          writeFileSync(caminhoA, a('Título editado no disco'))
          const atualizou = await esperarAte(`document.querySelector('.leitor-corpo article h1')?.textContent === 'Título editado no disco'`, 2000)
          conferir('leitor-markdown: gravar a.md no disco atualiza a tela em até 2 s', atualizou, `${Date.now() - antes} ms`)
          writeFileSync(caminhoA, a('Título do Leitor'))
          await esperarAte(`document.querySelector('.leitor-corpo article h1')?.textContent === 'Título do Leitor'`, 4000)
        })

        // ---- arquivo grande ----
        await passo('arquivo grande', async () => {
          await abrirNaArvore('grande.md')
          const aviso = await esperarAte(`document.querySelector('.leitor-corpo .leitor-aviso[data-tipo="grande"]')`)
          const semTexto = await js<boolean>(`!document.querySelector('.leitor-corpo article')`)
          const texto = await js<string>(`document.querySelector('.leitor-aviso[data-tipo="grande"]')?.textContent ?? ''`)
          conferir('leitor-markdown: arquivo > 400 KB mostra o aviso e não mostra o conteúdo', aviso && semTexto && texto.includes('400 KB'), texto.slice(0, 100))
          await print('leitor-markdown-grande-escuro')
          await abrirNaArvore('a.md')
          await esperarAte(`document.querySelector('.leitor-corpo article[data-arquivo="a.md"]')`)
        })

        // ---- busca e atalhos: Ctrl+F foca a busca e o quadro fica calado ----
        await passo('busca e atalhos', async () => {
          await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`)
          const antes = await ferramenta()
          await tecla('F', ['control'])
          const focou = await js<boolean>(`document.activeElement?.classList.contains('leitor-busca-campo') === true`)
          conferir('leitor-markdown: Ctrl+F foca o campo de busca', focou)
          // 'b' e 'n' são atalhos do quadro (ferramentas): digitados na busca viram texto e não mudam a ferramenta
          await digitar('sub')
          const valor = await js<string>(`document.querySelector('.leitor-busca-campo')?.value ?? ''`)
          conferir('leitor-markdown: o que se digita vai para a busca, e o quadro fica calado', valor === 'sub' && (await ferramenta()) === antes, `valor "${valor}" · ferramenta ${await ferramenta()}`)
          const achados = await js<string[]>(`[...document.querySelectorAll('.leitor-achado')].map((x) => x.getAttribute('data-caminho'))`)
          conferir('leitor-markdown: a busca por nome acha sub/a.md', JSON.stringify(achados) === JSON.stringify(['sub/a.md']), JSON.stringify(achados))
          await teclar('Escape')
          const limpou = await js<string>(`document.querySelector('.leitor-busca-campo')?.value ?? 'sem campo'`)
          conferir('leitor-markdown: Esc limpa a busca', limpou === '', `"${limpou}"`)
          await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`)
        })

        // ---- prints do Leitor; o Leitor termina em b.md para provar depois que "abrir no Leitor" troca o arquivo ----
        const cenasDoLeitor = async (tema: 'escuro' | 'claro'): Promise<void> => {
          await irPara('leitor')
          await escolherLeitor()
          await abrirNaArvore('a.md')
          await esperarAte(`document.querySelector('.leitor-corpo article[data-arquivo="a.md"]')`)
          await print(`leitor-markdown-leitor-${tema}`)
          if (tema === 'claro') {
            await abrirNaArvore('grande.md')
            await esperarAte(`document.querySelector('.leitor-corpo .leitor-aviso[data-tipo="grande"]')`)
            await print('leitor-markdown-grande-claro')
          }
          await abrirNaArvore('b.md')
          await esperarAte(`document.querySelector('.leitor-corpo article[data-arquivo="b.md"]')`)
        }
        await passo('print do Leitor (escuro)', () => cenasDoLeitor('escuro'))

        // ---- o visor de código com .md ----
        await passo('visor: .md formatado, ver código, quebra', async () => {
          await irPara('quadro')
          cartao = await js<string>(`window.__teste.loja.adicionarNo({ tipo: 'codigo', caminho: ${JSON.stringify(caminhoA)} }, 600, 400)`)
          if (!cartao) throw new Error('o cartão de código não nasceu')
          await verCartao(cartao)
          const formatado = await esperarAte(`document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-md h1'))})`, 10_000)
          conferir('leitor-markdown: o .md aparece formatado no modo arquivo do visor', formatado && !(await js<boolean>(`!!document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-linhas'))})`)))
          const larguraFormatado = await js<{ corpo: number; visivel: number }>(`(() => { const c = document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-corpo'))}); return { corpo: c.scrollWidth, visivel: c.clientWidth } })()`)
          conferir('leitor-markdown: formatado, a linha de 400 caracteres também não alarga o visor', larguraFormatado.corpo <= larguraFormatado.visivel + 1, JSON.stringify(larguraFormatado))
          await print('leitor-markdown-visor-formatado-escuro')

          if (!(await clicarEm(noDoCartao(cartao, 'button[title="Ver o código do Markdown"]')))) throw new Error('sem o botão "Ver o código do Markdown"')
          await esperarAte(`document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-linhas'))})`)
          const emCodigo = await js<boolean>(`!document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-md'))}) && !!document.querySelector(${JSON.stringify(noDoCartao(cartao, 'button[title="Ver formatado"]'))})`)
          conferir('leitor-markdown: "ver código" mostra o código e troca o botão para "Ver formatado"', emCodigo)

          const largura0 = await js<number>(`document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-corpo'))}).clientWidth`)
          const forma = await js<{ rolagem: number; visivel: number; quebra: boolean; alturaLonga: number; alturaCurta: number; numerosNaLonga: number; texto: string; numeros: string[]; linhas: number }>(`(() => {
            const c = document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-corpo'))})
            const pre = c.querySelector('.codigo-linhas'); const linhas = [...pre.querySelectorAll('.codigo-linha')]
            const longa = linhas.find((l) => l.querySelector('code').textContent.length >= 400)
            const curta = linhas.find((l) => l.querySelector('code').textContent.startsWith('# '))
            return { rolagem: c.scrollWidth, visivel: c.clientWidth, quebra: pre.classList.contains('quebra'),
              alturaLonga: longa ? longa.getBoundingClientRect().height : 0, alturaCurta: curta ? curta.getBoundingClientRect().height : 0,
              numerosNaLonga: longa ? longa.querySelectorAll('.codigo-numero').length : -1, texto: longa ? longa.querySelector('.codigo-numero').textContent : '',
              numeros: linhas.map((l) => l.querySelector('.codigo-numero').textContent), linhas: linhas.length }
          })()`)
          conferir('leitor-markdown: a linha de 400 caracteres quebra: a largura do visor não cresce', forma.quebra && forma.rolagem <= forma.visivel + 1, JSON.stringify({ rolagem: forma.rolagem, visivel: forma.visivel, quebra: forma.quebra }))
          conferir('leitor-markdown: a linha longa ocupa várias linhas na tela (altura > 3x a de uma linha curta)', forma.alturaCurta > 0 && forma.alturaLonga > forma.alturaCurta * 3, `${forma.alturaLonga} contra ${forma.alturaCurta}`)
          const seguidos = forma.numeros.every((n, i) => n === String(i + 1))
          conferir('leitor-markdown: o número da linha aparece só na 1ª parte (um por linha, em ordem)', forma.numerosNaLonga === 1 && seguidos && /^\d+$/.test(forma.texto), `${forma.numerosNaLonga} nº na linha longa · ${forma.linhas} linhas · seguidos ${seguidos}`)
          await print('leitor-markdown-visor-quebra-escuro')

          // contraprova: com a quebra desligada o mesmo texto SIM alarga (rolagem para os lados)
          if (!(await clicarEm(noDoCartao(cartao, 'button[title^="Quebra de linha ligada"]')))) throw new Error('sem o botão de quebra')
          await esperar(400)
          const semQuebra = await js<{ rolagem: number; visivel: number }>(`(() => { const c = document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-corpo'))}); return { rolagem: c.scrollWidth, visivel: c.clientWidth } })()`)
          conferir('leitor-markdown: sem a quebra o código rola para os lados (a contraprova mede de verdade)', semQuebra.rolagem > semQuebra.visivel + 20, JSON.stringify(semQuebra))
          if (!(await clicarEm(noDoCartao(cartao, 'button[title^="Rolagem para os lados"]')))) throw new Error('sem o botão para religar a quebra')
          await esperar(300)
          const largura1 = await js<number>(`document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-corpo'))}).clientWidth`)
          conferir('leitor-markdown: ligar e desligar a quebra não muda a largura do visor', largura0 === largura1, `${largura0} → ${largura1}`)

          if (!(await clicarEm(noDoCartao(cartao, 'button[title="Ver formatado"]')))) throw new Error('sem o botão "Ver formatado"')
          const voltouFormatado = await esperarAte(`document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-md h1'))})`)
          conferir('leitor-markdown: "Ver formatado" volta ao Markdown formatado', voltouFormatado)
        })

        // ---- do visor para o Leitor ----
        await passo('visor: abrir no Leitor', async () => {
          if (!(await clicarEm(noDoCartao(cartao, 'button.codigo-abrir-leitor')))) throw new Error('sem o botão codigo-abrir-leitor')
          const naPagina = await esperarAte(`window.__teste.casca.paginaAtiva() === 'leitor' && document.querySelector('.leitor-corpo article[data-arquivo="a.md"]')`)
          conferir(
            'leitor-markdown: "abrir no Leitor" troca para a página Leitor com o arquivo aberto (estava em b.md)',
            naPagina && (await titulo()) === 'a.md' && JSON.stringify(await ativos()) === JSON.stringify(['a.md']),
            `${await paginaAtiva()} · ${await titulo()} · ${JSON.stringify(await ativos())}`
          )
          await irPara('quadro')
          await verCartao(cartao)
          await esperarAte(`document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-md a[data-md]'))})`)
          const clicou = await clicarNoLink('vizinho', noDoCartao(cartao, '.codigo-md'))
          const noLeitor = await esperarAte(`window.__teste.casca.paginaAtiva() === 'leitor' && document.querySelector('.leitor-corpo article[data-arquivo="b.md"]')`)
          conferir('leitor-markdown: clicar num link .md do visor formatado abre esse arquivo no Leitor', clicou && noLeitor && (await titulo()) === 'b.md', `${await paginaAtiva()} · ${await titulo()}`)
        })

        // ---- arquivo fora das raízes: aviso, sem fixar nada ----
        await passo('visor: arquivo fora das pastas', async () => {
          await irPara('quadro')
          cartaoFora = await js<string>(`window.__teste.loja.adicionarNo({ tipo: 'codigo', caminho: ${JSON.stringify(join(fora, 'x.md'))} }, 1500, 400)`)
          await verCartao(cartaoFora)
          await esperar(500)
          // um observador de DOM diz se o aviso chegou a existir, mesmo que algo o apague logo depois
          await js(`window.__avisoVisto = false; window.__obsAviso?.disconnect(); window.__obsAviso = new MutationObserver(() => { if (document.querySelector('.leitor-aviso[data-tipo="aviso"]')) window.__avisoVisto = true }); window.__obsAviso.observe(document.body, { childList: true, subtree: true })`)
          if (!(await clicarEm(noDoCartao(cartaoFora, 'button.codigo-abrir-leitor')))) throw new Error('o botão "abrir no Leitor" não apareceu no arquivo de fora')
          const aviso = await esperarAte(`window.__teste.casca.paginaAtiva() === 'leitor' && document.querySelector('.leitor-aviso[data-tipo="aviso"]')`)
          const chegouAAparecer = await js<boolean>('window.__avisoVisto === true')
          await js('window.__obsAviso?.disconnect()')
          const texto = await js<string>(`document.querySelector('.leitor-aviso[data-tipo="aviso"] span')?.textContent ?? ''`)
          const fixadas = await js<number>(`document.querySelectorAll('.leitor-raiz-nome[data-fixada="true"]').length`)
          const noDisco = preferenciasEmDisco().leitor?.pastas ?? []
          conferir(
            'leitor-markdown: arquivo fora das pastas dá o aviso e não fixa nada',
            aviso && /fora das pastas/i.test(texto) && fixadas === 1 && noDisco.length === 1 && noDisco[0] === pasta,
            `"${texto.slice(0, 80)}" · o aviso chegou a aparecer: ${chegouAAparecer} · fixadas na tela ${fixadas} · no disco ${JSON.stringify(noDisco)}`
          )
          await print('leitor-markdown-aviso-fora-escuro')
        })

        // ---- os mesmos estados no tema claro ----
        await passo('prints no tema claro', async () => {
          await trocarTema('claro')
          conferir('leitor-markdown: o tema claro está aplicado', (await temaDaTela()) === 'claro')
          await cenasDoLeitor('claro')
          await irPara('quadro')
          await verCartao(cartao)
          await esperarAte(`document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-md h1'))})`)
          await print('leitor-markdown-visor-formatado-claro')
          await clicarEm(noDoCartao(cartao, 'button[title="Ver o código do Markdown"]'))
          await esperarAte(`document.querySelector(${JSON.stringify(noDoCartao(cartao, '.codigo-linhas'))})`)
          await print('leitor-markdown-visor-quebra-claro')
          await clicarEm(noDoCartao(cartao, 'button[title="Ver formatado"]'))
        })
        await passo('print do aviso no tema claro', async () => {
          await irPara('quadro')
          await verCartao(cartaoFora)
          await clicarEm(noDoCartao(cartaoFora, 'button.codigo-abrir-leitor'))
          await esperarAte(`window.__teste.casca.paginaAtiva() === 'leitor' && document.querySelector('.leitor-aviso[data-tipo="aviso"]')`)
          await print('leitor-markdown-aviso-fora-claro')
        })

        // ---- T12: fixar e desafixar pela tela valem na loja, então sobrevivem a sair do Leitor e voltar ----
        await passo('desafixar e fixar sobrevivem a sair e voltar', async () => {
          const naLista = (): Promise<boolean> =>
            js<boolean>(`[...document.querySelectorAll('.leitor-raiz-nome[data-fixada="true"]')].some((x) => x.getAttribute('data-raiz') === ${JSON.stringify(pasta)})`)
          await irPara('leitor')
          conferir('leitor-markdown: (T12) antes de desafixar, a pasta está na lista', await naLista())

          if (!(await clicarEm('.leitor-raiz:has(.leitor-raiz-nome[data-fixada="true"]) .leitor-desafixar'))) throw new Error('sem o botão de desafixar')
          await esperarAte(`!document.querySelector('.leitor-raiz-nome[data-fixada="true"]')`, 4000)
          await irPara('quadro')
          await irPara('leitor')
          conferir('leitor-markdown: desafixar, sair do Leitor e voltar: a pasta não reaparece', !(await naLista()))
          const naLoja = await js<string[]>(`window.__teste.loja.lerEstado().preferencias.leitor?.pastas ?? []`)
          conferir('leitor-markdown: desafixar atualiza a loja (fonte única)', naLoja.length === 0, JSON.stringify(naLoja))

          // fixar pelo botão da tela: o diálogo do sistema é trocado por uma resposta fixa, só durante este passo
          const original = dialog.showOpenDialog
          ;(dialog as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [pasta] })
          try {
            if (!(await clicarEm('button.leitor-fixar'))) throw new Error('sem o botão de fixar pasta')
            await esperarAte(`document.querySelector('.leitor-raiz-nome[data-fixada="true"]')`, 4000)
          } finally {
            ;(dialog as { showOpenDialog: unknown }).showOpenDialog = original
          }
          await irPara('quadro')
          await irPara('leitor')
          conferir('leitor-markdown: fixar, sair do Leitor e voltar: a pasta aparece', await naLista())
          const naLoja2 = await js<string[]>(`window.__teste.loja.lerEstado().preferencias.leitor?.pastas ?? []`)
          conferir('leitor-markdown: fixar atualiza a loja (fonte única)', naLoja2.length === 1 && naLoja2[0] === pasta, JSON.stringify(naLoja2))
        })
      } finally {
        // deixa o app como estava; cada passo no seu try e erro de limpeza não engole o original
        const falhas: string[] = []
        const limpar = async (nome: string, f: () => Promise<unknown>): Promise<void> => {
          try {
            await f()
          } catch (e) {
            falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        for (const id of [cartao, cartaoFora]) {
          if (id) await limpar('apagar cartão', () => js(`window.__teste.loja.apagar({ tipo: 'no', id: ${JSON.stringify(id)} })`))
        }
        await limpar('voltar ao quadro', () => irPara('quadro'))
        await limpar('tema escuro', () => trocarTema('escuro'))
        // desafixa pelo MESMO caminho da tela (botão do Leitor): grava as preferências E zera a pasta e o arquivo abertos na memória
        await limpar('desafixar a pasta', async () => {
          await irPara('leitor')
          if (!(await clicarEm('.leitor-raiz:has(.leitor-raiz-nome[data-fixada="true"]) .leitor-desafixar'))) {
            throw new Error('sem o botão de desafixar na lista do Leitor')
          }
          const ok = await esperarAte(`!document.querySelector('.leitor-raiz-nome[data-fixada="true"]')`, 4000)
          const gravado = preferenciasEmDisco().leitor?.pastas ?? []
          const estado = await js<{ artigo: number; aviso: number; ativos: number }>(
            `({ artigo: document.querySelectorAll('.leitor-corpo article').length, aviso: document.querySelectorAll('.leitor-aviso').length, ativos: document.querySelectorAll('.leitor-arquivo.ativo').length })`
          )
          if (!ok || gravado.length !== 0 || estado.artigo !== 0 || estado.aviso !== 0 || estado.ativos !== 0) {
            throw new Error(`o Leitor não ficou limpo: fixada na tela ${!ok} · no disco ${JSON.stringify(gravado)} · ${JSON.stringify(estado)}`)
          }
        })
        await limpar('voltar ao quadro (2)', () => irPara('quadro'))
        await limpar('apagar a fixture', async () => {
          rmSync(pasta, { recursive: true, force: true })
          rmSync(fora, { recursive: true, force: true })
        })
        tela.off('console-message', ouvir as never)
        if (falhas.length) conferir('leitor-markdown: limpeza final', false, falhas.join(' | '))
      }
      conferir('leitor-markdown: nenhum erro no console durante o cenário', erros.length === 0, erros.length ? erros.slice(0, 3).join(' | ') : 'console limpo')
    }
  }
]
