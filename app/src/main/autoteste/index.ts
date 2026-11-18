import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encerrarNavegador } from '../navegador'
import { encerrarTodos } from '../terminais'
import { Cenario, Estado, criarDriver } from './util'
import { quadroPortal } from './01-quadro-portal'
import { apagarPastaDosTerminais, ork } from './02-ork'
import { orkConexoes } from './03-ork-conexoes'
import { orkQuadro } from './04-ork-quadro'
import { orkPartituras } from './05-ork-partituras'
import { orkCatalogo } from './06-ork-catalogo'
import { orkMcp } from './07-ork-mcp'
import { telaConfiguracoes } from './08-tela-configuracoes'
import { orkBanda } from './09-ork-banda'
import { rotinas } from './10-rotinas'
import { orkCorreio } from './11-ork-correio'
import { selecaoNoTerminal } from './12-selecao-no-terminal'
import { tetoDeTerminais } from './13-teto-de-terminais'
import { orkEspacos } from './14-ork-espacos'
import { orkHeranca } from './15-ork-heranca'
import { orkPresets } from './16-ork-presets'
import { agentes } from './17-agentes'
import { codigoExplorador } from './18-codigo-explorador'
import { caixaDeEntrada } from './19-caixa-de-entrada'
import { menuTerminal } from './20-menu-terminal'
import { cascaPaginas } from './21-casca-paginas'
import { menusDialogos } from './22-menus-dialogos'
import { leitorMarkdown } from './23-leitor-markdown'
import { barraPaginas } from './24-barra-paginas'
import mapa from './mapa.json'
import { apagarChromiumDaRodada, escolherCenarios } from './filtro'

// `npm run autoteste`: monta um quadro de exemplo numa pasta de dados temporária, tira print nos dois
// temas, usa o mouse como um usuário (arrastar terminal, ligar dois terminais pela porta), recarrega e
// confere que tudo voltou do disco. Sai com 0 (passou) ou 1 (falhou).

export async function rodarAutoteste(
  janela: BrowserWindow,
  pedirSalvamento: (janela: BrowserWindow) => Promise<boolean>
): Promise<void> {
  const legadoTela = janela.webContents
  const legadoEsperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const legadoJs = <T>(codigo: string): Promise<T> => legadoTela.executeJavaScript(codigo)
  // no app instalado a pasta do app é somente leitura: os prints vão para a pasta temporária
  const pastaSaida = app.isPackaged ? join(tmpdir(), 'orkester-autoteste-prints') : join(app.getAppPath(), 'out')
  mkdirSync(pastaSaida, { recursive: true })
  const driver = criarDriver(janela, pastaSaida)
  const { resultados, tela, esperar, js } = driver
  // a captura às vezes falha logo depois de recarregar (erro do compositor de vídeo): tenta de novo
  const print = async (nome: string): Promise<void> => {
    for (let tentativa = 1; ; tentativa++) {
      await esperar(400 * tentativa)
      try {
        writeFileSync(join(pastaSaida, `autoteste-${nome}.png`), (await tela.capturePage()).toPNG())
        return
      } catch (erro) {
        if (tentativa === 4) throw erro
      }
    }
  }
  const aguardarCarga = async (): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      if (await js<boolean>('!!(window.__teste && window.__teste.loja.lerEstado().carregado)')) return
      await esperar(100)
    }
    throw new Error('o app não terminou de carregar')
  }
  const centroDe = (seletor: string): Promise<{ x: number; y: number } | null> =>
    js(`(() => { const r = document.querySelector(${JSON.stringify(seletor)})?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null })()`)
  // Um arrasto de gente leva uns 300 ms e dezenas de eventos. Com 8 passos de 16 ms, a máquina ocupada
  // engolia os últimos e o cartão andava um pedaço só — foi assim que esta checagem caiu na rodada com
  // agentes de verdade. Mais passos, mais tempo entre eles, e uma pausa antes de soltar o botão: o
  // renderer precisa ter processado o último movimento antes do mouseUp, senão o arrasto termina onde parou.
  const arrastar = async (de: { x: number; y: number }, ate: { x: number; y: number }): Promise<void> => {
    tela.sendInputEvent({ type: 'mouseMove', x: de.x, y: de.y })
    tela.sendInputEvent({ type: 'mouseDown', x: de.x, y: de.y, button: 'left', clickCount: 1 })
    const passos = 12
    for (let i = 1; i <= passos; i++) {
      const x = Math.round(de.x + ((ate.x - de.x) * i) / passos)
      const y = Math.round(de.y + ((ate.y - de.y) * i) / passos)
      tela.sendInputEvent({ type: 'mouseMove', x, y, button: 'left', modifiers: ['leftbuttondown'] })
      await esperar(25)
    }
    await esperar(90)
    tela.sendInputEvent({ type: 'mouseUp', x: ate.x, y: ate.y, button: 'left', clickCount: 1 })
    await esperar(250)
  }
  void legadoTela
  void legadoEsperar
  void legadoJs
  void print
  void aguardarCarga
  void centroDe
  void arrastar
  const e: Estado = {
    janela,
    pedirSalvamento,
    pastaSaida,
    pastaTerminais: '',
    espacoTerminais: '',
    presetShell: '',
    chefe: '',
    ajudante: null,
    solto: '',
    frente2: undefined
  }

  const cenarios: Cenario[] = [
    ...quadroPortal(e),
    ...ork(e),
    ...orkConexoes(e),
    ...orkQuadro(e),
    ...orkPartituras(e),
    ...orkCatalogo(e),
    ...orkMcp(e),
    ...telaConfiguracoes(e),
    ...orkBanda(e),
    ...rotinas(e),
    ...orkCorreio(e),
    ...selecaoNoTerminal(e),
    ...tetoDeTerminais(e),
    ...orkEspacos(e),
    ...orkHeranca(e),
    ...orkPresets(e),
    ...agentes(e),
    ...codigoExplorador(e),
    ...caixaDeEntrada(e),
    ...menuTerminal(e),
    ...cascaPaginas(e),
    ...menusDialogos(e),
    ...leitorMarkdown(e),
    ...barraPaginas(e),
  ]
  // O mapa arquivo→cenários (autoteste:curto) não pode apontar para um cenário que não existe: um nome
  // errado faria o teste curto "passar" sem rodar nada. `aguardando` é o que outra tarefa ainda vai criar.
  const existentes = new Set(cenarios.map((cenario) => cenario.nome))
  const aguardando: string[] = mapa.aguardando
  const citados = new Set([...mapa.padrao, ...mapa.regras.flatMap((regra) => regra.cenarios)])
  const inexistentes = [...citados].filter((nome) => !existentes.has(nome) && !aguardando.includes(nome))
  driver.conferir('mapa-de-cenarios', inexistentes.length === 0, inexistentes.length ? `cenário inexistente no mapa: ${inexistentes.join(', ')}` : `${citados.size} nomes conferidos`)
  const tetoMs = (Number(process.env.ORK_TETO_MIN) > 0 ? Number(process.env.ORK_TETO_MIN) : 15) * 60_000
  // Casamento por nome EXATO (filtro.ts). Pedir o que não existe é FALHA: nunca "PASSOU com 0 cenários".
  // O que o cenário pedido depende (`depende`) entra em cadeia: sem isto, `ORK_CENARIOS=ork-correio` só dizia
  // "não rodou: depende de ork".
  const { selecionados, semPar, adiados } = escolherCenarios(cenarios, process.env.ORK_CENARIOS, aguardando)
  if (adiados.length) console.log(`AUTOTESTE AVISO cenário ainda não existe (está em aguardando no mapa), pulado: ${adiados.join(', ')}`)
  if (semPar.length || (process.env.ORK_CENARIOS?.trim() && !selecionados.length && !adiados.length)) {
    driver.conferir(
      'filtro-de-cenarios',
      false,
      `ORK_CENARIOS pede cenário que não existe: ${semPar.join(', ') || process.env.ORK_CENARIOS}. Existem: ${cenarios.map((c) => c.nome).join(', ')}`
    )
  }
  const situacao = new Map<string, 'passou' | 'falhou' | 'não rodou'>()
  const detalhesDeCenario = new Map<string, string>()
  const duracoes = new Map<string, number>()
  let estourou: string | undefined
  for (const cenario of selecionados) {
    if (estourou) {
      // o cenário que estourou segue vivo com o mesmo driver e a mesma janela: rodar outro em cima dele sujaria o resultado
      situacao.set(cenario.nome, 'não rodou')
      detalhesDeCenario.set(cenario.nome, `${estourou} estourou o tempo; a rodada parou`)
      continue
    }
    if (cenario.depende && situacao.get(cenario.depende) !== 'passou') {
      situacao.set(cenario.nome, 'não rodou')
      detalhesDeCenario.set(cenario.nome, `depende de ${cenario.depende}`)
      continue
    }
    const inicio = Date.now()
    let relogio: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        cenario.rodar(driver),
        new Promise<never>((_, rejeitar) => {
          relogio = setTimeout(() => {
            estourou = cenario.nome
            rejeitar(new Error(`estourou o tempo (${tetoMs / 60_000} min, ORK_TETO_MIN)`))
          }, tetoMs)
        })
      ])
      situacao.set(cenario.nome, 'passou')
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro)
      situacao.set(cenario.nome, 'falhou')
      detalhesDeCenario.set(cenario.nome, detalhe)
      console.error(`AUTOTESTE ERRO ${cenario.nome}`, erro)
    } finally {
      clearTimeout(relogio)
      duracoes.set(cenario.nome, Date.now() - inicio)
    }
  }
  if (estourou) {
    const parados = [...situacao].filter(([, estado]) => estado === 'não rodou').map(([nome]) => nome)
    console.log(`AUTOTESTE ESTOUROU o tempo em ${estourou}; não rodaram: ${parados.join(', ') || '(nenhum)'}`)
  }
  const passou = resultados.every(([, ok]) => ok) && [...situacao.values()].every((estado) => estado === 'passou')
  for (const [nome, estado] of situacao) {
    if (estado !== 'passou') console.log(`AUTOTESTE ${estado === 'falhou' ? 'FALHOU' : 'NÃO RODOU'} ${nome} — ${detalhesDeCenario.get(nome) ?? ''}`)
  }
  const passouChecagens = resultados.filter(([, ok]) => ok).length
  const falhouChecagens = resultados.length - passouChecagens
  const passouCenarios = [...situacao.values()].filter((estado) => estado === 'passou').length
  const falhouCenarios = [...situacao.values()].filter((estado) => estado === 'falhou').length
  const naoRodouCenarios = [...situacao.values()].filter((estado) => estado === 'não rodou').length
  console.log(
    `AUTOTESTE resumo — ${resultados.length} checagens (${passouChecagens} ok, ${falhouChecagens} falhas) · ` +
      `${situacao.size} cenários (${passouCenarios} ok, ${falhouCenarios} falhas, ${naoRodouCenarios} não rodaram)`
  )
  for (const [nome, ms] of duracoes) console.log(`AUTOTESTE duração ${nome} — ${(ms / 1000).toFixed(1)} s`)
  console.log(`AUTOTESTE duração total — ${([...duracoes.values()].reduce((soma, ms) => soma + ms, 0) / 1000).toFixed(1)} s`)
  for (const [nome, ok, detalhe] of resultados) console.log(`AUTOTESTE ${ok ? 'ok    ' : 'FALHOU'} ${nome} — ${detalhe}`)
  console.log(`AUTOTESTE ${passou ? 'PASSOU' : 'FALHOU'} — prints em ${pastaSaida}`)
  encerrarTodos()
  await encerrarNavegador()
  // app.exit não dispara process.on('exit'): a pasta do Chromium desta rodada (sem ORK_DADOS) é apagada aqui
  if (!process.env.ORK_DADOS) console.log(`AUTOTESTE pasta do Chromium ${apagarChromiumDaRodada(app.getPath('userData'), process.pid)}`)
  apagarPastaDosTerminais() // os terminais já foram encerrados acima
  app.exit(passou ? 0 : 1)
}
