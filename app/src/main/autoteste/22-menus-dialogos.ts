import { sessaoPorId, telaDe } from '../terminais'
import { Cenario, Estado } from './util'

type Pt = { x: number; y: number }
type Esperado = { esc: boolean; calados: boolean }

/**
 * 1.9.0 (T7c): a matriz de menus e diálogos (PLANEJAMENTO-REFATORACAO.md, "Matriz de estados de menus e diálogos")
 * como cenário. UMA abertura do app: cada camada abre, tira print, aperta `n` (atalho do quadro: post-it) para ver se
 * o quadro está calado, aperta Esc para ver se fecha, e confere que nada foi parar no console. Nos dois temas.
 * Os valores esperados são os OBSERVADOS na base 027b43c (matriz-comparacao.md), não os do plano: o plano marcava
 * como "(D)" o que a observação resolveu (vista dos andares não cala `n`; menu do Terminal não fecha com Esc).
 */
export const menusDialogos = (_e: Estado): Cenario[] => [
  {
    nome: 'menus-dialogos',
    rodar: async (d) => {
      const { tela, esperar, js, conferir, print, aguardarCarga, teclar } = d

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

      // ---- entrada de gente: mouse (esquerdo e direito) e teclas com modificador ----
      const mover = (p: Pt): void => tela.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y })
      const clicarEm = async (p: Pt, botao: 'left' | 'right' = 'left'): Promise<void> => {
        mover(p)
        tela.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: botao, clickCount: 1 })
        tela.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: botao, clickCount: 1 })
        await esperar(250)
      }
      const tecla = async (keyCode: string, modifiers: Array<'control' | 'shift'> = []): Promise<void> => {
        tela.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
        tela.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
        await esperar(200)
      }
      const existe = (seletor: string): Promise<boolean> => js<boolean>(`!!document.querySelector(${JSON.stringify(seletor)})`)
      const centro = (seletor: string): Promise<Pt | null> => d.centroDe(seletor)
      const porTitulo = (titulo: string): string => `button[title^="${titulo}"]`
      const clicarSeletor = async (seletor: string): Promise<void> => {
        const p = await centro(seletor)
        if (!p) throw new Error(`sem ${seletor}`)
        await clicarEm(p)
      }
      const ferramenta = (): Promise<string> => js<string>(`window.__teste.loja.lerEstado().ferramenta`)
      const dialogoAberto = (): Promise<boolean> => existe('.dialogo-fundo')
      const tituloDoDialogo = (): Promise<string> => js<string>(`document.querySelector('.dialogo h3')?.textContent || ''`)
      const centroDoTexto = (raiz: string, folha: string, texto: string): Promise<Pt | null> =>
        js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(`${raiz} ${folha}`)})].find((x) => x.children.length < 4 && x.textContent.trim().startsWith(${JSON.stringify(texto)}))
          if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
      const clicarNoTexto = async (raiz: string, folha: string, texto: string): Promise<void> => {
        const p = await centroDoTexto(raiz, folha, texto)
        if (!p) throw new Error(`sem "${texto}" em ${raiz}; há: ${(await js<string>(`(document.querySelector(${JSON.stringify(raiz)})?.innerText ?? "(nada aberto)").split(String.fromCharCode(10)).join(" / ")`)).slice(0, 300)}`)
        await clicarEm(p)
      }
      // um ponto do quadro sem nó, barra, controle nem menu: a rede de segurança do clique direito e do "foco no quadro"
      const vazio = (): Promise<Pt | null> =>
        js(`(() => { for (let y = 300; y < innerHeight - 100; y += 60) for (let x = 500; x < innerWidth - 40; x += 80) {
          const e = document.elementFromPoint(x, y)
          if (e && !e.closest('.no,.pilula,.controles,.lateral,button,.barra-ferramentas-pos,.andares-canto,.mini-mapa,.menu-terminal')) return { x, y } }
          return null })()`)
      // o centro do cabeçalho cai no campo do nome (o campo tem o menu dele): varre o cabeçalho até um ponto que não seja campo nem botão
      const abrirMenuDoNo = async (): Promise<void> => {
        const p = await js<Pt | null>(`(() => {
          const c = document.querySelector(".no-terminal .terminal-cabecalho"); if (!c) return null
          const r = c.getBoundingClientRect(); const y = Math.round(r.top + r.height / 2)
          for (let x = Math.round(r.left) + 4; x < r.right - 4; x += 6) {
            const e = document.elementFromPoint(x, y)
            if (e && c.contains(e) && !e.closest("input, textarea, button")) return { x, y }
          }
          return null })()`)
        if (!p) throw new Error("sem ponto livre no cabeçalho do terminal")
        await clicarEm(p, "right")
      }
      const menuDoTerminal = async (rotulo: string): Promise<void> => {
        await clicarSeletor(porTitulo('Terminal'))
        await clicarNoTexto('.menu-terminal', 'button', rotulo)
      }
      const tudoFechado = async (): Promise<void> => {
        for (let i = 0; i < 3; i++) await tecla('Escape')
        if (await existe('.vista-andares')) await clicarSeletor(porTitulo('Andares:'))
        await esperar(300)
      }

      // ---- o quadro de partida: um terminal de verdade (o clique direito e as Perguntas dependem de um cartão) ----
      let terminal = ''
      const iniciar = async (): Promise<void> => {
      await aguardarCarga()
      terminal = await js<string>(`(() => {
        const L = window.__teste.loja
        const shell = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell') ?? L.lerEstado().preferencias.presets[2]
        const id = L.adicionarNo({ tipo: 'terminal', preset: shell }, 300, 250)
        L.definirCamera({ x: 40, y: 40, zoom: 1 })
        L.escolherFerramenta('selecionar')
        L.selecionar(null)
        return id
      })()`)
      for (let i = 0; i < 100; i++) {
        const s = sessaoPorId(terminal)
        if (s && /PS .*>/.test(await telaDe(s, 10)) && Date.now() - s.ultimaSaida > 800) break
        await esperar(100)
      }
      if (!(await existe('.lateral'))) await clicarSeletor('button[title="Mostrar ou esconder os espaços"]')
      await esperar(300)
      }

      // [nome, esperado, abre, aberto?, fecha (só quando o Esc não fecha)]
      const camadas: Array<[string, Esperado, () => Promise<void>, () => Promise<boolean>, () => Promise<void>]> = [
        ['Menu de contexto', { esc: true, calados: true }, async () => clicarEm((await vazio())!, 'right'), () => existe('.menu-contexto'), async () => {}],
        ['Paleta (Ctrl+K)', { esc: true, calados: true }, () => tecla('K', ['control']), () => existe('.paleta-fundo'), async () => {}],
        [
          'Atalhos (?)',
          { esc: true, calados: true },
          async () => {
            // só teclado real, sem evento sintético: Shift+"/" com o caractere "?". Se não abrir, a checagem reprova.
            tela.sendInputEvent({ type: 'keyDown', keyCode: '/', modifiers: ['shift'] })
            tela.sendInputEvent({ type: 'char', keyCode: '?', modifiers: ['shift'] })
            tela.sendInputEvent({ type: 'keyUp', keyCode: '/', modifiers: ['shift'] })
            await esperar(200)
          },
          async () => (await dialogoAberto()) && /atalho/i.test(await tituloDoDialogo()),
          async () => {}
        ],
        ['Perguntas (Salvar como partitura)', { esc: true, calados: true }, async () => { await abrirMenuDoNo(); await clicarNoTexto('.menu-contexto', '*', 'Salvar como partitura') }, dialogoAberto, async () => {}],
        [
          'Novo andar',
          { esc: true, calados: true },
          async () => {
            await clicarSeletor(porTitulo('Andares:'))
            await esperar(300)
            await clicarNoTexto('.pilha-pilulas', 'button', 'Novo andar')
          },
          dialogoAberto,
          async () => {}
        ],
        ['Vista dos andares', { esc: true, calados: false }, () => clicarSeletor(porTitulo('Andares:')), () => existe('.vista-andares'), () => clicarSeletor(porTitulo('Andares:'))],
        ['Presets', { esc: true, calados: true }, () => menuDoTerminal('Editar presets'), dialogoAberto, async () => {}],
        ['Funções', { esc: true, calados: true }, () => menuDoTerminal('Editar funções'), dialogoAberto, async () => {}],
        ['Partituras', { esc: true, calados: true }, () => menuDoTerminal('Partituras…'), dialogoAberto, async () => {}],
        ['Configurações', { esc: true, calados: true }, () => clicarSeletor(porTitulo('Configurações')), dialogoAberto, async () => {}],
        ['Rotinas', { esc: true, calados: true }, async () => { await abrirMenuDoNo(); await clicarNoTexto('.menu-contexto', '*', 'Rotinas') }, dialogoAberto, async () => {}],
        ['Novo espaço', { esc: true, calados: true }, () => clicarSeletor(porTitulo('Novo espaço de trabalho')), dialogoAberto, async () => {}],
        ['Explorador (Ctrl+Shift+E)', { esc: false, calados: false }, () => tecla('E', ['control', 'shift']), () => existe('[class*=explorador-raiz]'), () => tecla('E', ['control', 'shift'])],
        ['Mini mapa', { esc: false, calados: false }, () => clicarSeletor(porTitulo('Mini-mapa')), () => existe('.mini-mapa'), () => clicarSeletor(porTitulo('Mini-mapa'))],
        ['Lateral de espaços', { esc: false, calados: false }, async () => {}, () => existe('.lateral'), async () => {}],
        ['Menu do Terminal (painel)', { esc: false, calados: false }, () => clicarSeletor(porTitulo('Terminal')), () => existe('.menu-terminal'), () => clicarSeletor(porTitulo('Terminal'))]
      ]
      const slug = (nome: string): string =>
        nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const temaDaTela = (): Promise<string> => js<string>(`document.querySelector('.app').className.includes('tema-claro') ? 'claro' : 'escuro'`)

      const resumo: string[] = []
      try {
        await iniciar()
        for (const tema of ['escuro', 'claro'] as const) {
          if ((await temaDaTela()) !== tema) {
            await clicarSeletor(porTitulo(tema === 'claro' ? 'Tema claro' : 'Tema escuro'))
            await esperar(600)
          }
          conferir(`menus-dialogos: o tema ${tema} está aplicado`, (await temaDaTela()) === tema)
          // o quadro sem nada aberto: referência da base e, com ORK_BASE, o print que ajusta a janela ao tamanho fixo ANTES
          // de qualquer menu abrir (redimensionar com um menu aberto o fecha e o primeiro print saía diferente)
          await tudoFechado()
          await print(`menus-dialogos-quadro-${tema}`)
          for (const [nome, esperado, abrir, aberto, fechar] of camadas) {
            const rotulo = `menus-dialogos: ${nome} (${tema})`
            try {
              await tudoFechado()
              await clicarSeletor(porTitulo('Selecionar'))
              await esperar(150)
              const ponto = await vazio()
              if (!ponto) throw new Error('não achei um ponto vazio no quadro')
              await clicarEm(ponto)
              await abrir()
              await esperar(500)
              const abriu = await aberto()
              if (!abriu) {
                conferir(`${rotulo}: abre`, false, 'a camada não apareceu')
                continue
              }
              await print(`menus-dialogos-${slug(nome)}-${tema}`)
              await teclar('n')
              const calou = (await ferramenta()) === 'selecionar'
              if (!calou) await teclar('v')
              await tecla('Escape')
              await esperar(300)
              const fechouComEsc = !(await aberto())
              if (!fechouComEsc) {
                await fechar()
                await esperar(300)
                await tudoFechado()
              }
              conferir(`${rotulo}: Esc ${esperado.esc ? 'fecha' : 'não fecha'}`, fechouComEsc === esperado.esc, `Esc fechou: ${fechouComEsc}`)
              conferir(`${rotulo}: atalhos do quadro ${esperado.calados ? 'calados' : 'valem'}`, calou === esperado.calados, `calados: ${calou}`)
              resumo.push(`${nome}/${tema}: Esc ${fechouComEsc}, calados ${calou}`)
            } catch (erro) {
              conferir(`${rotulo}: rodou sem exceção`, false, erro instanceof Error ? erro.message : String(erro))
            }
          }
        }
      } finally {
        // deixa o app como estava; cada passo no seu try, o terminal PRIMEIRO, e erro de limpeza não engole o original
        const falhas: string[] = []
        const passo = async (nome: string, f: () => Promise<unknown>): Promise<void> => {
          try {
            await f()
          } catch (e) {
            falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        if (terminal) await passo('apagar terminal', () => js(`window.__teste.loja.apagar({ tipo: 'no', id: ${JSON.stringify(terminal)} })`))
        await passo('fechar tudo', tudoFechado)
        await passo('tema escuro', async () => {
          if ((await temaDaTela()) !== 'escuro') await clicarSeletor(porTitulo('Tema escuro'))
        })
        await passo('ferramenta', () => js(`window.__teste.loja.escolherFerramenta('selecionar')`))
        tela.off('console-message', ouvir as never)
        if (falhas.length) conferir('menus-dialogos: limpeza final', false, falhas.join(' | '))
      }
      conferir('menus-dialogos: nenhum erro no console durante o cenário', erros.length === 0, erros.length ? erros.slice(0, 3).join(' | ') : `${resumo.length} camadas conferidas`)
    }
  }
]
