import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessaoPorId, telaDe } from '../terminais'
import { Cenario, Estado } from './util'

export const ork = (e: Estado): Cenario[] => [
    {
      nome: 'ork',
      rodar: async (d) => {
        let { pastaTerminais, espacoTerminais, presetShell, chefe } = e
        try {
        const { esperar, js, print, centroDe, conferir, teclar, digitar, clicar } = d
    pastaTerminais = join(tmpdir(), `orkester-autoteste-terminais-${Date.now()}`)
    mkdirSync(pastaTerminais, { recursive: true })
    await js(`window.__teste.loja.criarEspaco('Terminais', ${JSON.stringify(pastaTerminais)})`)
    await esperar(300)
    espacoTerminais = await js<string>('window.__teste.loja.lerEstado().espaco.id')
    presetShell = `window.__teste.loja.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')`
    chefe = await js<string>(`(() => { const L = window.__teste.loja; L.definirCamera({ x: 0, y: 0, zoom: 1 })
      return L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 560, 320) })()`)
    const telaNoApp = async (id: string): Promise<string> => {
      const s = sessaoPorId(id)
      return s ? telaDe(s, 300) : ''
    }
    const telaNoCartao = (id: string): Promise<string> =>
      js<string>(`(() => { const t = window.__terminais?.[${JSON.stringify(id)}]; if (!t) return ''
        const b = t.buffer.active; const linhas = []
        for (let y = 0; y < b.length; y++) linhas.push(b.getLine(y)?.translateToString(true) ?? '')
        return linhas.join('\\n') })()`)
    const aguardar = async (ler: () => Promise<string>, procurado: string | RegExp, ms = 20_000): Promise<string> => {
      let texto = ''
      for (const limite = Date.now() + ms; Date.now() < limite; await esperar(200)) {
        texto = await ler()
        if (typeof procurado === 'string' ? texto.includes(procurado) : procurado.test(texto)) break
      }
      return texto
    }
    // seleciona o cartão (o terminal pega o foco) e digita a linha pelo teclado
    // (cartão fora da tela por mais de 1,5 s descarrega e o teclado não chega: se ele não está à vista, a câmera vai até ele)
    const comando = async (id: string, linha: string): Promise<void> => {
      const longe = await js<boolean | 'sumiu'>(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: ${JSON.stringify(id)} })
        if (document.querySelector('[data-no-id="${id}"] .terminal-xterm')) return false
        const n = L.planoAtual().nos.find((x) => x.id === ${JSON.stringify(id)})
        if (!n) return 'sumiu'
        L.definirCamera({ x: -n.x + 40, y: -n.y + 40, zoom: 1 }); return true })()`)
      if (longe === 'sumiu') throw new Error(`o cartão ${id} não está no plano à mostra: não dá para digitar nele`)
      await esperar(longe ? 900 : 250)
      await digitar(linha)
      await teclar('Return')
    }
    // A entrada sintética pode se perder logo depois de aparecer um cartão; só repete enquanto o eco ainda não veio.
    const comandoAte = async (id: string, linha: string, procurado: string | RegExp, ms = 8_000): Promise<string> => {
      let tela = ''
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        await comando(id, linha)
        tela = await aguardar(() => telaNoApp(id), procurado, ms)
        if (typeof procurado === 'string' ? tela.includes(procurado) : procurado.test(tela)) break
      }
      return tela
    }
    const ultimas = (texto: string, n = 2): string => texto.split('\n').filter((l) => l.trim()).slice(-n).join(' | ')
    void comandoAte

    await aguardar(() => telaNoApp(chefe), /PS .*>/)
    await comando(chefe, 'echo "MP-$(2+3)"')
    const eco = await aguardar(() => telaNoCartao(chefe), /^MP-5/m)
    conferir('terminal de verdade: digita no cartão e o PowerShell responde', /^MP-5/m.test(eco), ultimas(eco))

    // um clique de mouse só no corpo do cartão já deixa escrever (o teste acima seleciona pela loja, que não
    // passa pelo escudo nem pelo foco): era o defeito de 29/10/2026, em que a letra virava atalho do quadro
    await js(`window.__teste.loja.selecionar(null)`)
    await esperar(200)
    const corpoDoChefe = await centroDe(`[data-no-id="${chefe}"] .terminal-corpo`)
    if (!corpoDoChefe) throw new Error("corpo do terminal não está na tela")
    await clicar(corpoDoChefe)
    const focoNoTerminal = await js<boolean>(
      `!!document.activeElement?.closest('[data-no-id="${chefe}"] .xterm')`
    )
    const ferramentaAntes = await js<string>(`window.__teste.loja.lerEstado().ferramenta`)
    await digitar('echo "MP-UM-CLIQUE"')
    await teclar('Return')
    const umClique = await aguardar(() => telaNoCartao(chefe), /^MP-UM-CLIQUE/m)
    const ferramentaDepois = await js<string>(`window.__teste.loja.lerEstado().ferramenta`)
    conferir(
      'um clique no cartão e já escreve (a letra não vira atalho do quadro)',
      focoNoTerminal && /^MP-UM-CLIQUE/m.test(umClique) && ferramentaDepois === ferramentaAntes,
      `foco no terminal: ${focoNoTerminal} · ferramenta ${ferramentaAntes} → ${ferramentaDepois} · ${ultimas(umClique)}`
    )

    // zoom: o xterm desenha sempre no dobro da resolução, então mexer na roda não redesenha nada — nem a
    // fonte, nem as colunas. Quem redesenha é o tamanho do cartão.
    const colunas = sessaoPorId(chefe)?.espelho.cols
    const anteDoZoom = await js<{ escala: string; fonte: number }>(`(() => ({
      escala: document.querySelector('[data-no-id="${chefe}"] .terminal-caixa')?.dataset.escala ?? '',
      fonte: window.__terminais?.['${chefe}']?.options.fontSize ?? 0 }))()`)
    await js('window.__teste.loja.definirCamera({ x: -300, y: -150, zoom: 1.6 })')
    await esperar(900)
    const nitido = await js<{ escala: string; fonte: number }>(`(() => ({
      escala: document.querySelector('[data-no-id="${chefe}"] .terminal-caixa')?.dataset.escala ?? '',
      fonte: window.__terminais?.['${chefe}']?.options.fontSize ?? 0 }))()`)
    await print('terminal-zoom')
    conferir(
      'o zoom não redesenha o terminal: a qualidade é fixa e o texto continua nítido',
      nitido.escala === '2' && nitido.fonte === anteDoZoom.fonte && sessaoPorId(chefe)?.espelho.cols === colunas,
      `escala ${nitido.escala} · fonte ${anteDoZoom.fonte} → ${nitido.fonte} · colunas ${colunas} → ${sessaoPorId(chefe)?.espelho.cols}`
    )

    // quem muda as colunas é o tamanho do cartão: alargar o cartão e o processo recebe colunas novas
    const larguraAntes = await js<number>(`window.__teste.loja.acharNo('${chefe}').largura`)
    await js(`window.__teste.loja.atualizarNo('${chefe}', { largura: ${larguraAntes} + 220 }, false)`)
    await esperar(900)
    const colunasDepois = sessaoPorId(chefe)?.espelho.cols ?? 0
    conferir(
      'redimensionar o cartão muda as colunas do processo',
      colunasDepois > (colunas ?? 0),
      `${colunas} → ${colunasDepois} colunas`
    )
    await js(`window.__teste.loja.atualizarNo('${chefe}', { largura: ${larguraAntes} }, false)`)
    await esperar(600)
    await js('window.__teste.loja.definirCamera({ x: 0, y: 0, zoom: 1 })')

    // trocar de espaço não encerra o processo; ao voltar, o cartão se liga de novo e a tela volta
    const pid = sessaoPorId(chefe)?.processo?.pid
    const espacoVizinho = await js<string>(`(() => { const e = window.__teste.loja.lerEstado()
      return e.espacos.find((x) => x.id !== e.espaco.id && !e.emOutrasJanelas.includes(x.id)).id })()`)
    await js(`window.__teste.loja.abrirEspaco('${espacoVizinho}')`)
    await esperar(500)
    const vivoFora = sessaoPorId(chefe)?.processo?.pid === pid && sessaoPorId(chefe)?.vistas.size === 0
    await js(`window.__teste.loja.abrirEspaco('${espacoTerminais}')`)
    const deVolta = await aguardar(() => telaNoCartao(chefe), /^MP-5/m, 5000)
    conferir(
      'trocar de espaço e voltar: o processo segue e a tela volta',
      vivoFora && sessaoPorId(chefe)?.processo?.pid === pid && /^MP-5/m.test(deVolta),
      `pid ${pid} · vivo fora: ${vivoFora}`
    )

    // fora da tela por um tempo: o cartão para de desenhar (o processo segue) e volta igual
    await js('window.__teste.loja.definirCamera({ x: -40000, y: 0, zoom: 1 })')
    await esperar(2500)
    const descarregou =
      (await js<boolean>(`!!document.querySelector('[data-no-id="${chefe}"] .terminal-descarregado')`)) && sessaoPorId(chefe)?.vistas.size === 0
    await js('window.__teste.loja.definirCamera({ x: 0, y: 0, zoom: 1 })')
    const voltou = await aguardar(() => telaNoCartao(chefe), /^MP-5/m, 5000)
    conferir('fora da tela o cartão para de desenhar e volta igual', descarregou && /^MP-5/m.test(voltou), `descarregou: ${descarregou}`)

    // o `ork` dentro do terminal: quem, abrir (com pedido e espera), ver, permissão pela corda, fechar
        } finally {
          e.pastaTerminais = pastaTerminais
          e.espacoTerminais = espacoTerminais
          e.presetShell = presetShell
          e.chefe = chefe
        }
      },
    },
]
