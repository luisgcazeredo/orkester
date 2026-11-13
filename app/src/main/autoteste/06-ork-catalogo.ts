import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Cenario, Estado } from './util'

export const orkCatalogo = (e: Estado): Cenario[] => [
    {
      // Catálogo (volta 3): fichas .md viram funções, e a função manda no motor e no nível do cartão.
      //
      // O time é escrito fora do app — à mão, por outra sessão de agente, ou copiado de outro projeto — e
      // até a 1.2.5 instalar isso só dava mexendo no arquivo de preferências com o app fechado. Aqui o
      // caminho inteiro: arquivo no disco, `ork catalogo importar`, função gravada, cartão nascendo nela.
      //
      // Os presets do teste são todos de shell, com comandos diferentes: é o que deixa medir *qual* preset
      // abriu o cartão sem subir um Claude ou um Codex de verdade.
      nome: 'ork-catalogo',
      depende: 'ork-partituras',
      rodar: async (d) => {
        const { chefe } = e
        const { esperar, js, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d

    // fora da pasta do espaço: lá dentro ela é vigiada, e cada ficha virava cartão de código que bagunçava o
        // cenário dos cartões de código, mais adiante (foi assim que ele passou a reprovar na suíte inteira)
        const pastaFichas = join(tmpdir(), `orkester-autoteste-fichas-${process.pid}`)
    mkdirSync(pastaFichas, { recursive: true })
    const ficha = (nome: string, motor: string, nivel: string, corpo: string): string =>
      `---\nnome: ${nome}\nmotor: ${motor}\nnivel: ${nivel}\n---\n${corpo}\n`
    writeFileSync(join(pastaFichas, 'carteiro.md'), ficha('Carteiro de teste', 'Shell', 'rápido', 'Leve recados.'))
    writeFileSync(join(pastaFichas, 'guarda.md'), ficha('Guarda de teste', 'Shell', 'forte', 'Fique de olho.'))
    writeFileSync(join(pastaFichas, 'LEIAME.md'), 'Isto não é ficha: não tem cabeçalho.')

    const antesDoCatalogo = await js<{ presets: unknown[]; funcoes: unknown[] }>(`(() => { const L = window.__teste.loja
      const p = L.lerEstado().preferencias
      return { presets: p.presets, funcoes: p.funcoes ?? [] } })()`)
    await js(`(() => { const L = window.__teste.loja
      const presets = L.lerEstado().preferencias.presets
      L.definirPresets([
        ...presets,
        { id: 'shell-rapido', nome: 'PowerShell rápido', agente: 'shell', comando: 'echo PRESET-RAPIDO' },
        { id: 'shell-forte', nome: 'PowerShell forte', agente: 'shell', comando: 'echo PRESET-FORTE' }
      ]) })()`)
    await esperar(300)

    const importou = await comandoAte(chefe, `cls; ork catalogo importar "${pastaFichas}"`, /criada|ork:/, 20_000)
    const gravadas = await js<Array<{ nome: string; preset: string; prompt: string }>>(`(() => {
      const f = window.__teste.loja.lerEstado().preferencias.funcoes ?? []
      return f.filter((x) => x.nome.endsWith('de teste')).map((x) => ({ nome: x.nome, preset: x.preset, prompt: x.prompt })) })()`)
    conferir(
      'ork catalogo importar transforma ficha em função, com o preset do nível',
      gravadas.length === 2 &&
        gravadas.every((f) => (f.nome === 'Carteiro de teste' ? f.preset === 'shell-rapido' : f.preset === 'shell-forte')) &&
        gravadas.every((f) => f.prompt === '') &&
        /criada/.test(importou),
      `${gravadas.map((f) => `${f.nome}:${f.preset}`).join(' · ')} · ${ultimas(importou, 2)}`
    )
    conferir(
      'arquivo sem cabeçalho de ficha é pulado, com o nome dele no relatório',
      /LEIAME\.md/.test(importou) && /pulad/i.test(importou),
      ultimas(importou, 4)
    )

    // importar de novo não duplica: a função é a mesma, achada pelo nome
    const deNovo = await comandoAte(chefe, `cls; ork catalogo importar "${pastaFichas}"`, /sem mudança|criada/, 20_000)
    const quantas = await js<number>(`(window.__teste.loja.lerEstado().preferencias.funcoes ?? []).filter((x) => x.nome.endsWith('de teste')).length`)
    conferir('importar duas vezes atualiza em vez de duplicar', quantas === 2 && /2 sem mudança/.test(deNovo), `${quantas} funções · ${ultimas(deNovo, 2)}`)

    // e o que isto tudo serve: abrir sem dizer o agente, com o nível saindo da ficha
    await comando(chefe, 'cls; ork abrir --funcao "Guarda de teste"')
    await aguardar(() => telaNoApp(chefe), /Abri .Guarda de teste./, 30_000)
    const nasceu = await js<{ agente: string; comando: string; funcao: string } | null>(`(() => {
      const n = window.__teste.loja.planoAtual().nos.find((x) => x.tipo === 'terminal' && x.nome === 'Guarda de teste')
      return n ? { agente: n.agente, comando: n.comando, funcao: n.funcao } : null })()`)
    conferir(
      'ork abrir --funcao sem agente: o motor e o nível saem do preset da função',
      !!nasceu && nasceu.agente === 'shell' && nasceu.comando === 'echo PRESET-FORTE' && nasceu.funcao === 'Guarda de teste',
      nasceu ? `${nasceu.agente} · ${nasceu.comando}` : 'o cartão não apareceu'
    )

    // --preset manda mais que a função, e preset que não existe é recusado dizendo quais existem
    await comando(chefe, 'cls; ork abrir --funcao "Guarda de teste" --preset "PowerShell rápido" --nome "Guarda leve"')
    await aguardar(() => telaNoApp(chefe), /Abri .Guarda leve./, 30_000)
    const comPreset = await js<string>(`(() => {
      const n = window.__teste.loja.planoAtual().nos.find((x) => x.tipo === 'terminal' && x.nome === 'Guarda leve')
      return n ? n.comando : '' })()`)
    const inventado = await comandoAte(chefe, 'cls; ork abrir shell --preset "PowerShell turbinado"', /não existe o preset|Abri/, 20_000)
    conferir(
      '--preset manda mais que a função, e o inventado é recusado com a lista',
      comPreset === 'echo PRESET-RAPIDO' && /não existe o preset/.test(inventado),
      `${comPreset} · ${ultimas(inventado, 2)}`
    )

    // o quadro e as preferências voltam ao que eram
    await comandoAte(chefe, 'cls; ork fechar "Guarda de teste"', /Fechei/, 20_000)
    await comandoAte(chefe, 'cls; ork fechar "Guarda leve"', /Fechei/, 20_000)
    await js(`(() => { const L = window.__teste.loja
      L.definirPresets(L.lerEstado().preferencias.presets.filter((p) => p.id !== 'shell-rapido' && p.id !== 'shell-forte'))
      L.definirFuncoes((L.lerEstado().preferencias.funcoes ?? []).filter((f) => !f.nome.endsWith('de teste'))) })()`)
    await esperar(300)
    const limpou = await js<{ presets: number; funcoes: number }>(`(() => { const p = window.__teste.loja.lerEstado().preferencias
      return { presets: p.presets.length, funcoes: (p.funcoes ?? []).length } })()`)
    conferir(
      'o cenário devolve presets e funções como achou',
      limpou.presets === antesDoCatalogo.presets.length && limpou.funcoes === antesDoCatalogo.funcoes.length,
      `presets ${antesDoCatalogo.presets.length} → ${limpou.presets} · funções ${antesDoCatalogo.funcoes.length} → ${limpou.funcoes}`
    )
    await comando(chefe, 'cls')
    await esperar(300)
      }
    },
]
