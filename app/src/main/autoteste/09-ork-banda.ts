import { sessaoPorId } from '../terminais'
import { Cenario, Estado } from './util'

export const orkBanda = (e: Estado): Cenario[] => [
    {
      // Volta 2: banda (grupo de agentes) e troca de agente no mesmo cartão. A banda é moldura: a prova que
      // importa é a permissão — dois agentes sem corda desenhada se falando porque estão dentro dela, e
      // deixando de se falar quando um sai.
      nome: 'ork-banda',
      depende: 'ork-partituras',
      rodar: async (d) => {
        const { chefe } = e
        const { esperar, js, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d

    const dupla = await js<{ baixo: string; bateria: string }>(`(() => { const L = window.__teste.loja
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      const baixo = L.adicionarNo({ tipo: 'terminal', preset }, 24000, 9000)
      const bateria = L.adicionarNo({ tipo: 'terminal', preset }, 25400, 9000)
      L.atualizarNo(baixo, { nome: 'Baixo' }, false); L.atualizarNo(bateria, { nome: 'Bateria' }, false)
      return { baixo, bateria } })()`)
    await aguardar(() => telaNoApp(dupla.baixo), /PS .*>/, 30_000)
    await aguardar(() => telaNoApp(dupla.bateria), /PS .*>/, 30_000)

    // sem banda e sem corda, um não alcança o outro: é o ponto de partida da prova. Cada leitura termina com
    // uma marca própria e a tela é limpa entre elas: esperar por "ninguém ligado" casaria com a tentativa
    // anterior, e a espera terminaria antes de o comando da vez rodar
    await comando(dupla.baixo, 'ork ver "Bateria"; echo FIM-SEM-BANDA')
    const semBanda = await aguardar(() => telaNoApp(dupla.baixo), /^FIM-SEM-BANDA/m, 20_000)
    await comando(dupla.baixo, 'Clear-Host')
    await esperar(400)

    const criada = await js<{ erro: string; texto: string; id: string; membros: string[] }>(
      `(() => { const L = window.__teste.loja
        const r = L.criarBandaNoQuadro('Ritmo', ${JSON.stringify([dupla.baixo, dupla.bateria])}, { x: 0, y: 0 })
        if (r.erro) return { erro: r.erro, texto: '', id: '', membros: [] }
        const banda = L.planoAtual().nos.find((n) => n.tipo === 'banda' && n.nome === 'Ritmo')
        return { erro: '', texto: r.texto, id: banda ? banda.id : '', membros: L.membrosDaBandaAtual(banda ? banda.id : '').map((n) => n.nome) } })()`
    )
    await esperar(600)
    await comando(dupla.baixo, 'ork ver "Bateria"; echo FIM-COM-BANDA')
    const comBanda = await aguardar(() => telaNoApp(dupla.baixo), /^FIM-COM-BANDA/m, 20_000)
    conferir(
      'a banda liga quem está dentro dela: dois agentes se falam sem nenhuma corda desenhada',
      criada.erro === '' &&
        criada.membros.join() === 'Baixo,Bateria' &&
        /ninguém ligado a você/.test(semBanda) &&
        // a tela guarda o histórico, então o que prova é a leitura ter saído — sem permissão ela nem sai
        /"Bateria" · (livre|trabalhando|pergunta|encerrado)/.test(comBanda),
      `membros: ${criada.membros.join(', ')} · antes: ${/ninguém/.test(semBanda)} · depois: ${/"Bateria" · (livre|trabalhando|pergunta|encerrado)/.test(comBanda)}`
    )

    const lista = await comandoAte(dupla.baixo, 'ork banda', /"Ritmo"/, 15_000)
    conferir(
      'ork banda lista as bandas do andar, quem está dentro e onde está a moldura',
      /"Ritmo"/.test(lista) && /"Baixo"/.test(lista) && /moldura de \(/.test(lista),
      ultimas(lista, 3)
    )

    // corda desenhada na banda vale para cada um dos de dentro
    await js(`window.__teste.loja.ligar('${criada.id}', '${chefe}')`)
    await esperar(600)
    await comando(chefe, 'ork ver "Bateria" --linhas 3; echo FIM-PELA-CORDA')
    const pelaCorda = await aguardar(() => telaNoApp(chefe), /^FIM-PELA-CORDA/m, 20_000)
    conferir(
      'a corda desenhada na banda alcança cada agente de dentro dela',
      /"Bateria" · (livre|trabalhando|pergunta|encerrado)/.test(pelaCorda),
      ultimas(pelaCorda, 2)
    )

    // e sair da moldura é sair do time: nada de lista guardada discordando do que está na tela
    await js(`window.__teste.loja.atualizarNo('${dupla.bateria}', { x: 40000, y: 20000 }, false)`)
    await esperar(800)
    await comando(dupla.baixo, 'Clear-Host')
    await esperar(400)
    await comando(dupla.baixo, 'ork ver "Bateria"; echo FIM-FORA')
    const foraDaBanda = await aguardar(() => telaNoApp(dupla.baixo), /^FIM-FORA/m, 20_000)
    const membrosDepois = await js<string[]>(`window.__teste.loja.membrosDaBandaAtual('${criada.id}').map((n) => n.nome)`)
    conferir(
      'cartão arrastado para fora da moldura sai do time, e a permissão sai com ele',
      membrosDepois.join() === 'Baixo' && /ninguém ligado a você/.test(foraDaBanda),
      `membros: ${membrosDepois.join(', ') || 'nenhum'} · recusou: ${/ninguém ligado a você/.test(foraDaBanda)}`
    )

    const criadaPeloAgente = await comandoAte(chefe, 'ork banda criar "Metais" "Baixo"', /Criei a banda "Metais"/, 15_000)
    const metais = await js<number>(
      `(() => { const L = window.__teste.loja
        const b = L.planoAtual().nos.find((n) => n.tipo === 'banda' && n.nome === 'Metais')
        return b ? L.membrosDaBandaAtual(b.id).length : 0 })()`
    )
    conferir('ork banda criar põe a moldura em volta dos cartões que o agente nomeou', /Criei a banda "Metais"/.test(criadaPeloAgente) && metais === 1, `${metais} dentro`)

    // ---------- trocar o agente no mesmo cartão ----------
    await comandoAte(chefe, 'ork abrir claude --nome "Troca"', /Abri "Troca"/, 30_000)
    const antesDaTroca = await js<{ id: string; agente: string; x: number; cordas: number }>(
      `(() => { const L = window.__teste.loja; const p = L.planoAtual()
        const n = p.nos.find((x) => x.tipo === 'terminal' && x.nome === 'Troca')
        return { id: n ? n.id : '', agente: n ? n.agente : '', x: n ? n.x : -1, cordas: p.cordas.filter((c) => [c.de, c.para].includes(n ? n.id : '')).length } })()`
    )
    // o pid de antes: a troca tem de reabrir o processo, senão o cartão continuaria rodando o agente antigo
    const pidAntes = sessaoPorId(antesDaTroca.id)?.processo?.pid ?? 0
    const trocou = await comandoAte(chefe, 'ork trocar "Troca" shell', /Troquei "Troca"/, 20_000)
    await esperar(1500)
    const pidDepois = sessaoPorId(antesDaTroca.id)?.processo?.pid ?? 0
    const depoisDaTroca = await js<{ agente: string; cordas: number; x: number }>(
      `(() => { const L = window.__teste.loja; const p = L.planoAtual()
        const n = p.nos.find((x) => x.id === '${antesDaTroca.id}')
        return { agente: n ? n.agente : 'sumiu', cordas: p.cordas.filter((c) => [c.de, c.para].includes('${antesDaTroca.id}')).length, x: n ? n.x : -1 } })()`
    )
    conferir(
      'ork trocar muda o agente do cartão, reabre o processo e mantém id, lugar e cordas',
      /Troquei "Troca"/.test(trocou) &&
        antesDaTroca.agente === 'claude' &&
        depoisDaTroca.agente === 'shell' &&
        depoisDaTroca.cordas === antesDaTroca.cordas &&
        depoisDaTroca.x === antesDaTroca.x &&
        !!pidAntes &&
        !!pidDepois &&
        pidAntes !== pidDepois,
      `${antesDaTroca.agente} → ${depoisDaTroca.agente} · cordas ${antesDaTroca.cordas} → ${depoisDaTroca.cordas} · pid ${pidAntes} → ${pidDepois}`
    )

    const recusaDoUsuario = await comandoAte(chefe, 'ork trocar "Baixo" codex', /não foi aberto por você/, 15_000)
    const recusaDeSi = await comandoAte(chefe, 'ork trocar "PowerShell" codex', /não troca o seu próprio cartão|não foi aberto por você/, 15_000)
    const aindaShell = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.id === '${dupla.baixo}').agente`)
    conferir(
      'o agente não troca cartão do usuário nem o seu próprio',
      /não foi aberto por você/.test(recusaDoUsuario) && /não troca o seu próprio cartão|não foi aberto por você/.test(recusaDeSi) && aindaShell === 'shell',
      `${ultimas(recusaDoUsuario, 1)} · ${ultimas(recusaDeSi, 1)}`
    )

    // devolve o quadro: fecha o cartão trocado e apaga os cartões e as molduras deste cenário
    await comandoAte(chefe, 'ork fechar "Troca"', /Fechei "Troca"/, 15_000)
    await js(`(() => { const L = window.__teste.loja
      const bandas = L.planoAtual().nos.filter((n) => n.tipo === 'banda' && ['Ritmo', 'Metais'].includes(n.nome)).map((n) => n.id)
      for (const id of ${JSON.stringify([dupla.baixo, dupla.bateria])}.concat(bandas)) {
        if (L.acharNo(id)) { L.selecionar({ tipo: 'no', id }); L.apagarSelecao() }
      }
      L.selecionar(null) })()`)
    await esperar(400)
    await comando(chefe, 'Clear-Host')
    await esperar(600)
      },
    },
]
