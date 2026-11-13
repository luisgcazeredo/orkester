import { Cenario, Estado } from './util'

export const rotinas = (_e: Estado): Cenario[] => [
    {
      // Volta 4: rotinas. O que importa provar é o relógio do processo principal digitando no cartão e, acima
      // de tudo, **pulando a vez** quando o terminal está ocupado. Os primeiros disparos são forçados
      // (empurrando a hora da próxima para trás), que é o mesmo caminho do relógio sem esperar minutos de
      // verdade; no fim, um disparo pelo relógio de verdade, sem empurrão nenhum.
      nome: 'rotinas',
      depende: 'ork-banda',
      rodar: async (d) => {
        const { esperar, js, conferir, aguardar, comando, telaNoApp } = d

    const cartao = await js<string>(`(() => { const L = window.__teste.loja
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      const id = L.adicionarNo({ tipo: 'terminal', preset }, 30000, 16000)
      L.atualizarNo(id, { nome: 'Rotineiro' }, false); return id })()`)
    await aguardar(() => telaNoApp(cartao), /PS .*>/, 30_000)

    const criada = await js<{ erro: string; id: string; emMinutos: number }>(
      `(() => { const L = window.__teste.loja
        const erro = L.criarRotina({ nome: 'Bip', terminal: '${cartao}', texto: 'echo ROTINA-RODOU', quando: { tipo: 'cada', minutos: 1 } })
        const r = L.rotinasDoEspaco().find((x) => x.nome === 'Bip')
        return { erro: erro ?? '', id: r ? r.id : '', emMinutos: r ? Math.round((Date.parse(r.proxima) - Date.now()) / 60000) : -1 } })()`
    )
    const rotina = (): Promise<{ vezes: number; resultado: string; pausada: boolean }> =>
      js(`(() => { const r = window.__teste.loja.rotinasDoEspaco().find((x) => x.id === '${criada.id}')
        return r ? { vezes: r.vezes, resultado: r.ultima ? r.ultima.resultado : '', pausada: !!r.pausada } : { vezes: -1, resultado: 'sumiu', pausada: false } })()`)
    conferir(
      'criar rotina: ela entra no espaço com a primeira vez marcada',
      criada.erro === '' && !!criada.id && criada.emMinutos === 1,
      `erro:${criada.erro || 'nenhum'} · próxima em ${criada.emMinutos} min`
    )

    /** Empurra a hora da próxima para trás: o relógio do processo principal a vê vencida no passo seguinte. */
    const vencerAgora = (): Promise<void> =>
      js(`window.__teste.loja.mudarRotina('${criada.id}', { proxima: new Date(Date.now() - 2000).toISOString() })`)

    for (let i = 1; i <= 3; i++) {
      // o eco do disparo anterior deixa o shell ocupado por um instante, e a rotina pularia a vez (e está
      // certa em pular): espera ele ficar livre antes de forçar o próximo
      await esperar(2000)
      await vencerAgora()
      await aguardar(async () => String((await rotina()).vezes), String(i), 25_000)
    }
    const tresVezes = await rotina()
    // A rotina conta assim que digita; o eco só aparece quando o shell responde, e isso atrasa quando a
    // máquina está ocupada (na rodada com agentes de verdade chegaram 2 dos 3 a tempo). Espera o terceiro
    // em vez de fotografar a tela no instante seguinte ao disparo.
    const tela = await aguardar(() => telaNoApp(cartao), /^ROTINA-RODOU[\s\S]*?^ROTINA-RODOU[\s\S]*?^ROTINA-RODOU/m, 30_000)
    conferir(
      'o relógio digita no cartão: três disparos, três vezes contadas e o eco na tela',
      tresVezes.vezes === 3 && tresVezes.resultado === 'rodou' && (tela.match(/^ROTINA-RODOU/gm) ?? []).length >= 3,
      `${tresVezes.vezes} vezes · ${(tela.match(/^ROTINA-RODOU/gm) ?? []).length} ecos`
    )

    // terminal ocupado: a rotina pula a vez em vez de escrever no meio do trabalho
    await comando(cartao, 'Start-Sleep 9; echo ACORDEI')
    await esperar(1500)
    await vencerAgora()
    await aguardar(async () => (await rotina()).resultado, 'ocupado', 20_000)
    const pulada = await rotina()
    // espera o comando quieto terminar: a partir daqui o terminal precisa estar livre de novo
    await aguardar(() => telaNoApp(cartao), /^ACORDEI/m, 30_000)
    conferir(
      'terminal ocupado: a rotina pula a vez e não conta como rodada',
      pulada.resultado === 'ocupado' && pulada.vezes === 3,
      `${pulada.resultado} · ${pulada.vezes} vezes`
    )

    // pausada: o relógio nem olha para ela
    await js(`window.__teste.loja.alternarPausaDaRotina('${criada.id}')`)
    await vencerAgora()
    await esperar(3000)
    const durantePausa = await rotina()
    await js(`window.__teste.loja.alternarPausaDaRotina('${criada.id}')`)
    const depoisDaPausa = await rotina()
    conferir(
      'rotina pausada não dispara, e ao voltar a próxima vez é contada de agora',
      durantePausa.vezes === 3 && durantePausa.pausada && !depoisDaPausa.pausada,
      `durante: ${durantePausa.vezes} vezes, pausada ${durantePausa.pausada} · depois: pausada ${depoisDaPausa.pausada}`
    )

    // "digitar agora": dispara sem mexer no relógio
    const testou = await js<string>(`window.__teste.loja.testarRotina('${criada.id}')`)
    conferir('o botão de testar digita na hora', testou === 'rodou', `resultado: ${testou}`)

    // e, por fim, um disparo pelo relógio de verdade: a rotina é de 1 minuto e ninguém empurra a hora
    await esperar(500)
    const antesDoRelogio = (await rotina()).vezes
    await aguardar(async () => String((await rotina()).vezes), String(antesDoRelogio + 1), 100_000)
    const peloRelogio = await rotina()
    conferir(
      'o relógio dispara sozinho na hora marcada (um minuto, sem empurrão)',
      peloRelogio.vezes === antesDoRelogio + 1,
      `${antesDoRelogio} → ${peloRelogio.vezes} vezes`
    )

    await js(`(() => { const L = window.__teste.loja
      L.apagarRotina('${criada.id}')
      if (L.acharNo('${cartao}')) { L.selecionar({ tipo: 'no', id: '${cartao}' }); L.apagarSelecao() }
      L.selecionar(null) })()`)
    await esperar(400)
      },
    },
]
