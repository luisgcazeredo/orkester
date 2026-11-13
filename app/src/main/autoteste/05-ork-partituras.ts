import { Cenario, Estado } from './util'

export const orkPartituras = (e: Estado): Cenario[] => [
    {
      // Partituras (volta 3): guardar um time e subir ele de novo, pelo usuário e pelo agente. Os cartões
      // nascem longe de tudo, e no fim o cenário apaga o que criou e devolve as preferências como achou.
      nome: 'ork-partituras',
      depende: 'ork-quadro',
      rodar: async (d) => {
        const { chefe } = e
        const { esperar, js, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d

    const banda = await js<{ a: string; b: string; nota: string }>(`(() => { const L = window.__teste.loja
      const antes = L.lerEstado().preferencias.funcoes ?? []
      L.definirFuncoes([...antes, { id: 'f-banda', nome: 'Baterista', prompt: 'echo PARTITURA-CHEGOU' }])
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      const funcao = L.lerEstado().preferencias.funcoes.find((f) => f.nome === 'Baterista')
      const a = L.adicionarNo({ tipo: 'terminal', preset, funcao }, 14000, 9000)
      const b = L.adicionarNo({ tipo: 'terminal', preset }, 15400, 9000)
      L.atualizarNo(b, { nome: 'Baixista' }, false)
      const nota = L.adicionarNo({ tipo: 'texto', texto: 'ensaio as 19h' }, 14000, 10400)
      L.ligar(a, b)
      return { a, b, nota } })()`)
    await esperar(400)

    const guardou = await js<{ erro: string; pecas: number; cordas: number; funcoes: string[]; temPasta: boolean }>(
      `(() => { const L = window.__teste.loja
        const erro = L.salvarPartitura('Banda', ${JSON.stringify([banda.a, banda.b, banda.nota])})
        const p = (L.lerEstado().preferencias.partituras ?? []).find((x) => x.nome === 'Banda')
        return {
          erro: erro ?? '',
          pecas: p ? p.pecas.length : 0,
          cordas: p ? p.cordas.length : 0,
          funcoes: p ? p.pecas.flatMap((x) => (x.funcao ? [x.funcao] : [])) : [],
          temPasta: p ? p.pecas.some((x) => 'pasta' in x) : true
        } })()`
    )
    conferir(
      'salvar como partitura guarda os agentes, o recado, a corda e a função — e nunca a pasta',
      guardou.erro === '' && guardou.pecas === 3 && guardou.cordas === 1 && guardou.funcoes.join() === 'Baterista' && !guardou.temPasta,
      `erro:${guardou.erro || 'nenhum'} · ${guardou.pecas} peças · ${guardou.cordas} corda(s) · funções ${guardou.funcoes.join(', ') || 'nenhuma'} · pasta:${guardou.temPasta}`
    )

    const lista = await comandoAte(chefe, 'ork partitura', /"Banda"/, 15_000)
    conferir('ork partitura lista os times salvos com o que tem dentro', /"Banda"/.test(lista) && /agentes/.test(lista), ultimas(lista, 3))

    const subiu = await comandoAte(chefe, 'ork partitura usar "Banda"', /Subi a partitura/, 30_000)
    await esperar(600)
    const time = await js<{ nomes: string[]; donos: boolean[]; comChefe: boolean[]; entreEles: boolean; baterista: string; funcoes: string[] }>(
      `(() => { const L = window.__teste.loja; const p = L.planoAtual()
        const novos = p.nos.filter((n) => n.tipo === 'terminal' && ['Baterista 2', 'Baixista 2'].includes(n.nome))
        const ligado = (id) => p.cordas.some((c) => [c.de, c.para].includes('${chefe}') && [c.de, c.para].includes(id))
        return {
          nomes: novos.map((n) => n.nome).sort(),
          donos: novos.map((n) => n.criadoPor === '${chefe}'),
          comChefe: novos.map((n) => ligado(n.id)),
          entreEles: novos.length === 2 && p.cordas.some((c) => [c.de, c.para].includes(novos[0].id) && [c.de, c.para].includes(novos[1].id)),
          baterista: (novos.find((n) => n.funcao === 'Baterista') ?? {}).id ?? '',
          funcoes: novos.map((n) => n.funcao ?? '')
        } })()`
    )
    const chegou = time.baterista ? await aguardar(() => telaNoApp(time.baterista), /PARTITURA-CHEGOU/, 40_000) : ''
    conferir(
      'ork partitura usar sobe o time ligado a quem pediu, com as funções e o primeiro pedido de cada papel',
      /Subi a partitura/.test(subiu) &&
        time.nomes.join() === 'Baixista 2,Baterista 2' &&
        time.donos.every(Boolean) &&
        time.comChefe.every(Boolean) &&
        time.entreEles &&
        /PARTITURA-CHEGOU/.test(chegou),
      `${time.nomes.join(', ')} · donos:${time.donos.join(',')} · com o chefe:${time.comChefe.join(',')} · entre eles:${time.entreEles} · prompt:${/PARTITURA-CHEGOU/.test(chegou)}`
    )

    // o time de um agente é sessão viva: o Ctrl+Z do usuário não o mata (a mesma regra do `ork abrir`),
    // e quem subiu é que fecha
    await js('window.__teste.loja.desfazer()')
    await esperar(500)
    const depoisDoZ = await js<number>(
      `window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'terminal' && /^(Baterista|Baixista) 2$/.test(n.nome)).length`
    )
    await comandoAte(chefe, 'ork fechar "Baterista 2"', /Fechei "Baterista 2"/, 15_000)
    await comandoAte(chefe, 'ork fechar "Baixista 2"', /Fechei "Baixista 2"/, 15_000)
    await esperar(400)
    const depoisDeFechar = await js<number>(
      `window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'terminal' && /^(Baterista|Baixista) 2$/.test(n.nome)).length`
    )
    conferir(
      'o Ctrl+Z não mata o time vivo de um agente, e quem subiu fecha com ork fechar',
      depoisDoZ === 2 && depoisDeFechar === 0,
      `${depoisDoZ} vivos depois do Ctrl+Z · ${depoisDeFechar} depois do ork fechar`
    )

    const salvouAgente = await comandoAte(chefe, 'ork partitura salvar "Dupla" "Baterista" "Baixista"', /Guardei a partitura/, 15_000)
    const dupla = await js<number>(
      `(() => { const p = (window.__teste.loja.lerEstado().preferencias.partituras ?? []).find((x) => x.nome === 'Dupla'); return p ? p.pecas.length : 0 })()`
    )
    conferir(
      'ork partitura salvar guarda o time pelo nome dos cartões',
      /Guardei a partitura/.test(salvouAgente) && dupla === 2,
      `${ultimas(salvouAgente, 1)} · ${dupla} peças`
    )

    const naoExiste = await comandoAte(chefe, 'ork partitura usar "Fanfarra"', /não existe a partitura/, 15_000)
    conferir(
      'partitura que não existe: o ork diz quais existem, e não sobe nada',
      /não existe a partitura/.test(naoExiste) && /"Banda"/.test(naoExiste),
      ultimas(naoExiste, 2)
    )

    const doUsuario = await js<{ erro: string; quantos: number; semDono: boolean; comOsDeFora: number; ids: string[] }>(
      `(() => { const L = window.__teste.loja
        const p = (L.lerEstado().preferencias.partituras ?? []).find((x) => x.nome === 'Banda')
        const r = L.subirPartitura(p, 20000, 14000)
        if (r.erro) return { erro: r.erro, quantos: 0, semDono: false, comOsDeFora: 0, ids: [] }
        const plano = L.planoAtual()
        const nos = r.ids.map((id) => plano.nos.find((n) => n.id === id))
        return {
          erro: '',
          quantos: nos.length,
          semDono: nos.every((n) => n.tipo !== 'terminal' || !n.criadoPor),
          comOsDeFora: plano.cordas.filter((c) => r.ids.includes(c.de) !== r.ids.includes(c.para)).length,
          ids: r.ids
        } })()`
    )
    // e o que é do usuário entra no desfazer dele: um Ctrl+Z tira o arranjo inteiro
    await js('window.__teste.loja.desfazer()')
    await esperar(500)
    const sobrouDoUsuario = await js<number>(
      `(() => { const p = window.__teste.loja.planoAtual()
        return ${JSON.stringify(doUsuario.ids)}.filter((id) => p.nos.some((n) => n.id === id)).length })()`
    )
    conferir(
      'o time que o usuário sobe é dele: sem dono, sem corda para fora, e o Ctrl+Z tira inteiro',
      doUsuario.erro === '' && doUsuario.quantos === 3 && doUsuario.semDono && doUsuario.comOsDeFora === 0 && sobrouDoUsuario === 0,
      `erro:${doUsuario.erro || 'nenhum'} · ${doUsuario.quantos} cartões · sem dono:${doUsuario.semDono} · cordas para fora:${doUsuario.comOsDeFora} · depois do Ctrl+Z:${sobrouDoUsuario}`
    )

    // devolve o quadro e as preferências como estavam para os cenários seguintes
    await js(`(() => { const L = window.__teste.loja
      for (const id of ${JSON.stringify([banda.a, banda.b, banda.nota])}) {
        if (L.acharNo(id)) { L.selecionar({ tipo: 'no', id }); L.apagarSelecao() }
      }
      L.selecionar(null)
      L.definirPartituras([])
      L.definirFuncoes((L.lerEstado().preferencias.funcoes ?? []).filter((f) => f.id !== 'f-banda')) })()`)
    await esperar(400)
    await comando(chefe, 'Clear-Host')
    await esperar(600)
      },
    },
]
