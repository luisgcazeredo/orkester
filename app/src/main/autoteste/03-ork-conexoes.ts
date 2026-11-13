import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { sessaoPorId } from '../terminais'
import { Cenario, Estado } from './util'

export const orkConexoes = (e: Estado): Cenario[] => [
    {
      nome: 'ork-conexoes',
      depende: 'ork',
      rodar: async (d) => {
        const { presetShell, chefe } = e
        let { ajudante, solto } = e
        try {
        const { esperar, js, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d
    await comando(chefe, 'ork quem')
    const quem = await aguardar(() => telaNoApp(chefe), 'Você é "PowerShell"')
    conferir('ork quem (o comando existe dentro do terminal)', quem.includes('Você é "PowerShell"'), ultimas(quem, 3))

    await comando(chefe, "ork abrir shell --nome Ajudante --pedido 'echo AJUDANTE-$(3*3)' --esperar --tempo 40")
    const abriu = await aguardar(() => telaNoApp(chefe), /terminou\. Tela:[\s\S]*AJUDANTE-9/, 60_000)
    ajudante = await js<{ id: string; criadoPor: string; corda: boolean } | null>(`(() => {
      const p = window.__teste.loja.planoAtual()
      const n = p.nos.find((x) => x.tipo === 'terminal' && x.nome === 'Ajudante'); if (!n) return null
      return { id: n.id, criadoPor: n.criadoPor, corda: p.cordas.some((c) => c.de === '${chefe}' && c.para === n.id) } })()`)
    conferir(
      'ork abrir: sessão nova ao lado, ligada, com o pedido feito',
      !!ajudante && ajudante.criadoPor === chefe && ajudante.corda && /AJUDANTE-9/.test(abriu),
      ajudante ? `corda: ${ajudante.corda} · ${ultimas(abriu)}` : `cartão não apareceu · ${ultimas(abriu, 4)}`
    )

    solto = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 560, 1100); L.atualizarNo(id, { nome: 'Solto' }); return id })()`)
    await aguardar(() => telaNoApp(solto), /PS .*>/)
    await comando(chefe, 'ork pedir Solto "echo NAO-DEVIA"')
    const recusou = await aguardar(() => telaNoApp(chefe), 'ninguém ligado a você se chama "Solto"', 15_000)
    await comando(chefe, 'ork ver Ajudante --linhas 20')
    const viu = await aguardar(() => telaNoApp(chefe), /"Ajudante" · livre[\s\S]*AJUDANTE-9/, 15_000)
    conferir(
      'ork ver lê a tela do outro; sem corda, recusa',
      /"Ajudante" · livre/.test(viu) && recusou.includes('ninguém ligado') && !(await telaNoApp(solto)).includes('NAO-DEVIA'),
      `${ultimas(viu)} · fim do Ajudante: ${JSON.stringify((await telaNoApp(ajudante?.id ?? '')).split('\n').slice(-2))}`
    )

    // nada é digitado em quem está numa pergunta, nem com a tela ainda mexendo (o diálogo acabou de aparecer);
    // o cartão "Dialogo" é do tipo Claude, mas no autoteste roda só o PowerShell, que imita o rodapé de um diálogo
    const dialogo = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: L.lerEstado().preferencias.presets.find((p) => p.agente === 'claude') }, 1600, 1100)
      L.atualizarNo(id, { nome: 'Dialogo' }); L.ligar('${chefe}', id); return id })()`)
    await aguardar(() => telaNoApp(dialogo), /PS .*>/)
    await comando(dialogo, "while ($true) { Write-Host 'Enter to confirm - Esc to cancel'; Start-Sleep -Milliseconds 300 }")
    await esperar(1500)
    await comando(chefe, "ork pedir Dialogo 'NAO-DIGITAR'; echo FIM-DIALOGO")
    const naPergunta = await aguardar(() => telaNoApp(chefe), /^FIM-DIALOGO/m, 20_000)
    await comando(chefe, 'ork teclas Dialogo ctrl-c')
    // e um PowerShell rodando um comando quieto não está livre: o pedido não cai no meio dele
    await js(`window.__teste.loja.ligar('${chefe}', '${solto}')`)
    await comando(solto, 'Start-Sleep 20')
    await esperar(2000)
    await comando(chefe, "ork pedir Solto 'echo NO-MEIO'; echo FIM-OCUPADO")
    const ocupado = await aguardar(() => telaNoApp(chefe), /^FIM-OCUPADO/m, 20_000)
    await comando(chefe, 'ork teclas Solto ctrl-c')
    conferir(
      'ork não digita em pergunta (nem com a tela mexendo) nem em shell ocupado',
      /parado\s+numa\s+pergunta/.test(naPergunta) &&
        !(await telaNoApp(dialogo)).includes('NAO-DIGITAR') &&
        /rodando\s+um\s+comando/.test(ocupado) &&
        !(await telaNoApp(solto)).includes('NO-MEIO'),
      `pergunta: ${/parado\s+numa\s+pergunta/.test(naPergunta)} · ocupado: ${/rodando\s+um\s+comando/.test(ocupado)}`
    )
    await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${dialogo}' })`)

    const gitBash = [join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'), 'C:\\Program Files\\Git\\bin\\bash.exe'].find(
      (c) => existsSync(c)
    )
    if (gitBash) {
      // o Claude Code roda comandos pelo Git Bash: lá vale o script sh, não o .cmd
      await comando(chefe, `& '${gitBash}' -c 'ork quem >/dev/null && echo BASH-MPRO-OK'`)
      const bash = await aguardar(() => telaNoApp(chefe), /^BASH-MPRO-OK/m, 60_000)
      conferir('ork também funciona pelo Git Bash', /^BASH-MPRO-OK/m.test(bash), ultimas(bash))
    }

    await comando(chefe, 'ork fechar Solto')
    await aguardar(() => telaNoApp(chefe), /ork: ninguém ligado a você se chama "Solto"[\s\S]*ork: ninguém ligado a você se chama "Solto"/, 15_000)
    await comando(chefe, 'ork fechar Ajudante')
    await aguardar(() => telaNoApp(chefe), 'Fechei "Ajudante"', 15_000)
    await esperar(300)
    const sobrou = await js<string[]>(`window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'terminal').map((n) => n.nome)`)
    conferir(
      'ork fechar: só fecha o que ele abriu, e o cartão some',
      !sobrou.includes('Ajudante') && sobrou.includes('Solto') && !!ajudante && !sessaoPorId(ajudante.id),
      sobrou.join(', ')
    )
    // funções (papéis): o cartão nasce com o nome do papel, na pasta dela, e o prompt vai como primeiro pedido
    await js(`window.__teste.loja.definirFuncoes([{ id: 'f-teste', nome: 'Carteiro', prompt: 'echo FUNCAO-CHEGOU' }])`)
    await esperar(300)
    const idFuncao = await js<string>(`(() => { const L = window.__teste.loja
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      const funcao = L.lerEstado().preferencias.funcoes[0]
      return L.adicionarNo({ tipo: 'terminal', preset, funcao }, 3600, 2200) })()`)
    const doCartao = await js<{ nome: string; funcao: string }>(
      `(() => { const n = window.__teste.loja.acharNo('${idFuncao}'); return { nome: n.nome, funcao: n.funcao ?? '' } })()`
    )
    const chegou = await aguardar(() => telaNoApp(idFuncao), /^FUNCAO-CHEGOU/m, 30_000)
    conferir(
      'cartão nasce com a função: nome do papel e o prompt entregue como primeiro pedido',
      doCartao.nome === 'Carteiro' && doCartao.funcao === 'Carteiro' && /^FUNCAO-CHEGOU/m.test(chegou),
      `nome ${doCartao.nome} · função ${doCartao.funcao} · ${ultimas(chegou, 2)}`
    )

    // aviso do primeiro pedido: confirmado (saiu) não deixa selo; não confirmado mostra o selo no cartão e dispensa some
    const seloDe = (id: string): Promise<boolean> =>
      js<boolean>(`!!document.querySelector('[data-no-id="${id}"] [data-teste="aviso-primeiro-pedido"]')`)
    const semSeloDeInicio = !(await seloDe(idFuncao))
    const espacoDoTeste = await js<string>('window.__teste.loja.lerEstado().espaco.id')
    const avisos = (): Promise<Record<string, string>> => js('window.__teste.loja.lerEstado().avisosDoPrimeiroPedido')
    const chave = (esp: string, id: string): string => `${esp}${id}`
    const anotar = (esp: string, id: string, status: string): Promise<unknown> =>
      js(`window.__teste.loja.anotarAvisoDoPrimeiroPedido('${esp}', '${id}', '${status}')`)
    const dicaDe = (id: string): Promise<string> =>
      js<string>(`document.querySelector('[data-no-id="${id}"] [data-teste="aviso-primeiro-pedido"]')?.title ?? ''`)
    // cada status não confirmado (e o erro do canal) põe o selo com a mensagem própria; o clique só remove o aviso
    const esperada: Record<string, RegExp> = {
      ficou: /NÃO foi enviado/,
      incerto: /pode ter saído/,
      'nao-pronto': /não ficou pronto/,
      'sem-sessao': /não há processo/,
      erro: /comunicação/
    }
    const dicas: Record<string, string> = {}
    let selosOk = true
    let dispensaSoRemove = true
    for (const status of Object.keys(esperada)) {
      await anotar(espacoDoTeste, idFuncao, status)
      const apareceu = (await aguardar(async () => String(await seloDe(idFuncao)), 'true', 5000)) === 'true'
      dicas[status] = await dicaDe(idFuncao)
      if (!apareceu || !esperada[status].test(dicas[status])) selosOk = false
      await js(`document.querySelector('[data-no-id="${idFuncao}"] [data-teste="aviso-primeiro-pedido"]')?.click()`)
      await esperar(300)
      const depois = await avisos()
      if ((await seloDe(idFuncao)) || chave(espacoDoTeste, idFuncao) in depois || Object.values(depois).includes('saiu')) dispensaSoRemove = false
    }
    const mensagensDistintas = new Set(Object.values(dicas)).size === 5
    // o mesmo id de cartão em outro espaço não aparece neste cartão, e some só com a chave dele
    await anotar('espaco-de-fora', idFuncao, 'ficou')
    await esperar(300)
    const outroNaoAparece = !(await seloDe(idFuncao)) && chave('espaco-de-fora', idFuncao) in (await avisos())
    await js(`window.__teste.loja.dispensarAvisoDoPrimeiroPedido('espaco-de-fora', '${idFuncao}')`)
    const outroSaiu = !(chave('espaco-de-fora', idFuncao) in (await avisos()))
    // dispensar com o pedido ainda pendente: a resposta tardia não recria o selo (controle: sem dispensar, ela cria)
    const emVoo = (status: string): Promise<unknown> =>
      js(`(() => { window.__pend = {}; const p = new Promise((r) => { window.__pend.r = r })
        window.__teste.loja.entregarPrimeiroPedido('${idFuncao}', 'x', () => p)
        return true })()`).then(() => js(`window.__pend.r({ status: '${status}' })`))
    await emVoo('incerto')
    const controleCriou = (await aguardar(async () => String(await seloDe(idFuncao)), 'true', 5000)) === 'true'
    await js(`window.__teste.loja.dispensarAvisoDoPrimeiroPedido('${espacoDoTeste}', '${idFuncao}')`)
    await js(`(() => { window.__pend = {}; const p = new Promise((r) => { window.__pend.r = r })
      window.__teste.loja.entregarPrimeiroPedido('${idFuncao}', 'x', () => p); return true })()`)
    await js(`window.__teste.loja.dispensarAvisoDoPrimeiroPedido('${espacoDoTeste}', '${idFuncao}')`)
    await js(`window.__pend.r({ status: 'ficou' })`)
    await esperar(400)
    const tardiaAposDispensar = !(await seloDe(idFuncao)) && !(chave(espacoDoTeste, idFuncao) in (await avisos()))
    await js(`window.__teste.loja.dispensarAvisoDoPrimeiroPedido('${espacoDoTeste}', '${idFuncao}')`)
    // cartão apagado: o aviso sai do mapa, e uma resposta tardia não o traz de volta
    const idEfemero = await js<string>(`(() => { const L = window.__teste.loja
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      return L.adicionarNo({ tipo: 'terminal', preset }, 3900, 2200) })()`)
    await anotar(espacoDoTeste, idEfemero, 'ficou')
    const tinha = chave(espacoDoTeste, idEfemero) in (await avisos())
    await js(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: '${idEfemero}' }); L.apagarSelecao() })()`)
    await esperar(300)
    const limpou = !(chave(espacoDoTeste, idEfemero) in (await avisos()))
    await anotar(espacoDoTeste, idEfemero, 'ficou')
    const tardiaIgnorada = !(chave(espacoDoTeste, idEfemero) in (await avisos()))
    conferir(
      'primeiro pedido não confirmado: o cartão ganha o selo de aviso e ele some ao dispensar',
      semSeloDeInicio && selosOk && mensagensDistintas && dispensaSoRemove && outroNaoAparece && outroSaiu && controleCriou && tardiaAposDispensar && tinha && limpou && tardiaIgnorada,
      `sem selo ao nascer ${semSeloDeInicio} · selo e mensagem própria (ficou/incerto/nao-pronto/sem-sessao/erro) ${selosOk} · 5 mensagens distintas ${mensagensDistintas} · dispensar só remove ${dispensaSoRemove} · outro espaço isolado ${outroNaoAparece}/${outroSaiu} · pendente: controle criou ${controleCriou}, dispensado não recria ${tardiaAposDispensar} · cartão apagado: tinha ${tinha}, saiu ${limpou} · resposta tardia ignorada ${tardiaIgnorada}`
    )

    // o agente também enxerga as funções e abre por elas
    const listaFuncoes = await comandoAte(chefe, 'ork funcoes', /Carteiro/, 15_000)
    const abriuComFuncao = await comandoAte(chefe, 'ork abrir shell --funcao "Carteiro" --nome Entregador', /Abri "Entregador"/, 30_000)
    const oEntregador = await js<string>(`(() => { const n = window.__teste.loja.planoAtual().nos
      .find((x) => x.tipo === 'terminal' && x.nome === 'Entregador'); return n ? n.funcao ?? '' : 'não nasceu' })()`)
    conferir(
      'ork funcoes lista, e ork abrir --funcao dá o papel ao cartão novo',
      /Carteiro/.test(listaFuncoes) && /Abri "Entregador"/.test(abriuComFuncao) && oEntregador === 'Carteiro',
      `lista:${/Carteiro/.test(listaFuncoes)} · abriu:${/Abri "Entregador"/.test(abriuComFuncao)} · função do novo: ${oEntregador}`
    )


        } finally {
          e.ajudante = ajudante
          e.solto = solto
        }
      },
    },
]
