import { Cenario, Estado } from './util'

export const menuTerminal = (_e: Estado): Cenario[] => [
    {
      // 1.4.0: com o catálogo do time (18 funções) o menu do Terminal era uma pílula só, mais larga que a
      // janela, com os nomes cortados. Agora é um painel em grade, com filtro, que cabe na janela.
      nome: 'menu-terminal',
      rodar: async (d) => {
        const { esperar, js, conferir, clicarEm, digitar, print } = d
        const antes = await js<string>(`JSON.stringify(window.__teste.loja.lerEstado().preferencias.funcoes ?? [])`)
        const nomes = ['Maestro', 'Decisões', 'Arquiteto', 'Escriba', 'Curador do Cérebro', 'Cartógrafo', 'Construtor Front-end',
          'Construtor Back-end', 'Construtor Dados', 'Construtor Integrações', 'Construtor Sistema', 'Construtor Infra e Build',
          'Construtor Scripts e Automação', 'Construtor Generalista', 'Revisor', 'Depurador', 'Testador', 'Pesquisador']
        await js(`window.__teste.loja.definirFuncoes(${JSON.stringify(nomes.map((nome, i) => ({ id: `f-menu-${i}`, nome, prompt: 'echo MENU' })))})`)
        await esperar(300)
        await clicarEm('.barra-ferramentas button[title="Terminal"]')
        await esperar(400)
        const medida = await js<{ cabe: boolean; botoes: number; cortados: number; filtro: boolean }>(`(() => {
          const m = document.querySelector('.menu-terminal'); if (!m) return { cabe: false, botoes: 0, cortados: 0, filtro: false }
          const r = m.getBoundingClientRect()
          const botoes = [...m.querySelectorAll('.menu-terminal-funcao')]
          // cortado = o botão fica fora do painel na horizontal (era o defeito: a faixa passava da janela)
          const cortados = botoes.filter((b) => { const c = b.getBoundingClientRect(); return c.left < r.left - 1 || c.right > r.right + 1 }).length
          return { cabe: r.left >= 0 && r.right <= window.innerWidth, botoes: botoes.length, cortados, filtro: !!m.querySelector('.menu-terminal-filtro') }
        })()`)
        await print('menu-terminal')
        await digitar('constr')
        await esperar(300)
        const filtradas = await js<number>(`document.querySelectorAll('.menu-terminal .menu-terminal-funcao').length`)
        conferir(
          'menu do Terminal com 18 funções: cabe na janela, em grade, e o filtro acha pelo nome',
          medida.cabe && medida.botoes === 18 && medida.cortados === 0 && medida.filtro && filtradas === 8,
          `cabe ${medida.cabe} · ${medida.botoes} funções · ${medida.cortados} cortadas · filtro ${medida.filtro} · "constr" → ${filtradas}`
        )
        await clicarEm('.barra-ferramentas button[title="Terminal"]')
        await js(`window.__teste.loja.definirFuncoes(${antes})`)
        await esperar(300)
      }
    },
]
