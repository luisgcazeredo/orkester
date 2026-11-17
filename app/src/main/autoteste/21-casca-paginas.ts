import { Cenario, Estado } from './util'

export const cascaPaginas = (_e: Estado): Cenario[] => [
    {
      // 1.7.0 (dívida de tela, parte 2): a casca de páginas (R5) e os atalhos do quadro presos à página (R6).
      // O registro não tem "desregistrar": a página de teste fica registrada até o app fechar, mas a ativa volta ao quadro.
      nome: 'casca-paginas',
      rodar: async (d) => {
        const { esperar, js, conferir, teclar, print } = d
        const estado = (): Promise<{ ativa: string; ferramenta: string; quadro: boolean; teste: boolean }> =>
          js(`({ ativa: window.__teste.casca.paginaAtiva(), ferramenta: window.__teste.loja.lerEstado().ferramenta,
            quadro: !!document.querySelector('.pagina-ativa .quadro'), teste: !!document.querySelector('#pagina-teste-casca') })`)
        try {
          // o quadro só monta depois da carga do espaço: dá até 6 s
          let inicio = await estado()
          for (let i = 0; i < 30 && !inicio.quadro; i++) {
            await esperar(200)
            inicio = await estado()
          }
          conferir('a página ativa nasce "quadro", com o quadro na tela', inicio.ativa === 'quadro' && inicio.quadro && !inicio.teste, JSON.stringify(inicio))
  
          // elemento do React 19 escrito à mão: o cenário roda fora do bundle do app, sem JSX
          const registro = await js<{ primeira: boolean; repetida: string }>(`(() => {
            const el = { $$typeof: Symbol.for('react.transitional.element'), type: 'div', key: null, ref: null,
              props: { id: 'pagina-teste-casca', children: 'página de teste' }, _owner: null, _store: {} }
            const pagina = { id: 'teste-casca', titulo: 'Teste', icone: () => null, nativa: false, Componente: () => el }
            window.__teste.casca.registrarPagina(pagina)
            let repetida = 'aceitou'
            try { window.__teste.casca.registrarPagina(pagina) } catch (e) { repetida = 'recusou' }
            return { primeira: true, repetida }
          })()`)
          conferir('registrar a página de teste funciona e o id repetido é recusado', registro.primeira && registro.repetida === 'recusou', JSON.stringify(registro))
  
          const desconhecido = await js<boolean>(`window.__teste.casca.irParaPagina('nao-existe')`)
          await esperar(200)
          const depoisDesconhecido = await estado()
          conferir(
            'ir para id desconhecido devolve false e nada muda',
            desconhecido === false && depoisDesconhecido.ativa === 'quadro' && depoisDesconhecido.quadro && !depoisDesconhecido.teste,
            `retorno ${desconhecido} · ${JSON.stringify(depoisDesconhecido)}`
          )
  
          const foi = await js<boolean>(`window.__teste.casca.irParaPagina('teste-casca')`)
          await esperar(300)
          await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`)
          await teclar('n')
          await esperar(200)
          const naTeste = await estado()
          await print('casca-pagina-teste')
          conferir(
            'na página de teste o quadro some e o atalho "n" não age',
            foi && naTeste.ativa === 'teste-casca' && naTeste.teste && !naTeste.quadro && naTeste.ferramenta === 'selecionar',
            `retorno ${foi} · ${JSON.stringify(naTeste)}`
          )
  
          const voltou = await js<boolean>(`window.__teste.casca.irParaPagina('quadro')`)
          await esperar(300)
          await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`)
          await teclar('n')
          await esperar(200)
          const noQuadro = await estado()
          conferir(
            'voltando ao quadro ele reaparece e o atalho "n" troca a ferramenta para post-it',
            voltou && noQuadro.ativa === 'quadro' && noQuadro.quadro && !noQuadro.teste && noQuadro.ferramenta === 'postit',
            `retorno ${voltou} · ${JSON.stringify(noQuadro)}`
          )
        } finally {
          // deixa o app como estava: no quadro, com a ferramenta de seleção
          await js(`window.__teste.casca.irParaPagina('quadro'); window.__teste.loja.escolherFerramenta('selecionar')`)
          await esperar(200)
        }
      }
    },
]
