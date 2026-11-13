import { existsSync, readFileSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lerSessaoDeJanelas } from '../dados'
import { sessaoPorId } from '../terminais'
import { Cenario, Estado } from './util'

export const orkHeranca = (e: Estado): Cenario[] => [
    {
      nome: 'ork-heranca',
      depende: 'ork-espacos',
      rodar: async (d) => {
        const { pedirSalvamento, presetShell, chefe, solto, frente2 } = e
        const { esperar, js, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d
    await comandoAte(chefe, 'ork abrir shell --nome "Diálogo antigo"', 'Abri "Diálogo antigo"')
    const dialogoAntigo = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Diálogo antigo')?.id ?? ''`)
    await aguardar(() => telaNoApp(dialogoAntigo), /PS .*>/)
    // As linhas em branco imitam a folga visual; as seguras contam como texto e empurram a citação para fora da janela.
    await comando(dialogoAntigo, 'Write-Output "[y/n]"; 1..6 | ForEach-Object { Write-Output ""; Write-Output "linha segura $_" }')
    await aguardar(() => telaNoApp(dialogoAntigo), 'linha segura 6')
    await esperar(1300)
    const pediuDepoisDoDialogo = await comandoAte(chefe, 'ork pedir "Diálogo antigo" "echo MP-DIALOGO-ANTIGO"', 'MP-DIALOGO-ANTIGO')
    conferir(
      'diálogo citado fora das últimas seis linhas não bloqueia ork pedir',
      pediuDepoisDoDialogo.includes('MP-DIALOGO-ANTIGO'),
      ultimas(pediuDepoisDoDialogo, 5)
    )
    await comandoAte(chefe, 'ork fechar "Diálogo antigo"', 'Fechei "Diálogo antigo"')

    const heranca = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 2200, 1280); L.atualizarNo(id, { nome: 'Raiz herança' }); return id })()`)
    await aguardar(() => telaNoApp(heranca), /PS .*>/)
    await comandoAte(heranca, 'ork abrir shell --nome "Filho herança"', 'Abri "Filho herança"')
    const filhoHeranca = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Filho herança')?.id ?? ''`)
    await aguardar(() => telaNoApp(filhoHeranca), /PS .*>/)
    await comandoAte(filhoHeranca, 'ork abrir shell --nome "Neto herança"', 'Abri "Neto herança"')
    const netoHeranca = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Neto herança')?.id ?? ''`)
    const fechouFilho = await comandoAte(heranca, 'ork fechar "Filho herança"', 'que ela tinha aberto agora')
    const viuNeto = await comandoAte(heranca, 'ork ver "Neto herança"', '"Neto herança"')
    const fechouNeto = await comandoAte(heranca, 'ork fechar "Neto herança"', 'Fechei "Neto herança"')
    conferir(
      'ork fechar herda netos e o novo dono consegue ver e fechar',
      !!netoHeranca && fechouFilho.includes('que ela tinha aberto agora') && viuNeto.includes('"Neto herança"') && fechouNeto.includes('Fechei "Neto herança"') && !sessaoPorId(filhoHeranca) && !sessaoPorId(netoHeranca),
      `herança: ${fechouFilho.includes('que ela tinha aberto agora')} · viu: ${viuNeto.includes('"Neto herança"')} · fechou: ${fechouNeto.includes('Fechei "Neto herança"')}`
    )
    await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${heranca}' })`)

    const aposentadoria = await js<{ antigo: string; sucessor: string }>(`(() => { const L = window.__teste.loja
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      const antigo = L.adicionarNo({ tipo: 'terminal', preset }, 2200, 300)
      const sucessor = L.adicionarNo({ tipo: 'terminal', preset }, 2200, 850)
      L.atualizarNo(antigo, { nome: 'Antigo' }); L.atualizarNo(sucessor, { nome: 'Sucessor' }); L.ligar(antigo, sucessor)
      return { antigo, sucessor } })()`)
    await aguardar(() => telaNoApp(aposentadoria.antigo), /PS .*>/)
    await aguardar(() => telaNoApp(aposentadoria.sucessor), /PS .*>/)
    await comando(aposentadoria.antigo, 'ork abrir shell --nome Herdado')
    await aguardar(() => telaNoApp(aposentadoria.antigo), 'Abri "Herdado"')
    const herdado = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Herdado')?.id ?? ''`)
    // entrada sintética às vezes se perde (o cartão acabou de ganhar um vizinho novo): tenta até o eco aparecer
    let recusouSair = ''
    for (let tentativa = 0; tentativa < 3 && !recusouSair.includes('ork passar'); tentativa++) {
      await comando(aposentadoria.antigo, 'ork sair')
      recusouSair = await aguardar(() => telaNoApp(aposentadoria.antigo), 'ork passar', 8000)
    }
    // comandoAte repete o comando: tecla sintética se perde, e com a máquina carregada (o app de verdade
    // aberto ao lado, por exemplo) essas três linhas eram as primeiras a falhar
    const passouSessao = await comandoAte(aposentadoria.antigo, 'ork passar Sucessor', 'Passei 1 sessão para "Sucessor"', 15_000)
    const antigoNaoFecha = await comandoAte(aposentadoria.antigo, 'ork fechar Herdado', 'ninguém ligado a você se chama "Herdado"', 15_000)
    const sucessorFecha = await comandoAte(aposentadoria.sucessor, 'ork fechar Herdado', 'Fechei "Herdado"', 15_000)
    conferir(
      'ork passar move a propriedade; antigo não fecha e sucessor fecha',
      !!herdado && recusouSair.includes('ork passar') && passouSessao.includes('Passei 1') && antigoNaoFecha.includes('ninguém ligado') && sucessorFecha.includes('Fechei'),
      `herdado:${!!herdado} recusou:${recusouSair.includes('ork passar')} passou:${passouSessao.includes('Passei 1')} ` +
        `antigoNaoFecha:${antigoNaoFecha.includes('ninguém ligado')} sucessorFecha:${sucessorFecha.includes('Fechei')} · APOS SAIR: ${ultimas(recusouSair, 4)}`
    )
    const respostaSair = join(tmpdir(), `orkester-sair-${randomUUID()}.txt`)
    await comando(aposentadoria.antigo, `ork sair --motivo "fim do contexto" | Out-File -Encoding utf8 '${respostaSair}'`)
    for (let i = 0; i < 120 && sessaoPorId(aposentadoria.antigo); i++) await esperar(100)
    const antigoSaiu = !sessaoPorId(aposentadoria.antigo)
    const respostaAntesDeSair = existsSync(respostaSair) ? readFileSync(respostaSair, 'utf8') : ''
    // o arquivo é descartável, e o PowerShell pode ainda estar com ele na mão (ou o antivírus): apagar não
    // pode derrubar o cenário inteiro, como derrubou numa rodada de 06/11
    try {
      rmSync(respostaSair, { force: true })
    } catch {
      // fica no %TEMP%; não atrapalha nada
    }
    conferir(
      'ork sair responde antes de fechar o próprio cartão',
      // sem o acento: o PowerShell decodifica a saída de programa nativo pela página de código OEM, e
      // `ã` viraria lixo no arquivo (na tela do terminal aparece certo)
      antigoSaiu && /Vou fechar seu cart.{1,3}o./.test(respostaAntesDeSair),
      `cartão saiu: ${antigoSaiu} · resposta: ${JSON.stringify(respostaAntesDeSair.trim())}`
    )
    await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${aposentadoria.sucessor}' })`)

    const sairComAsMinhas = await js<string>(`(() => { const L = window.__teste.loja
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      const id = L.adicionarNo({ tipo: 'terminal', preset }, 2900, 300); L.atualizarNo(id, { nome: 'Com as minhas' }); return id })()`)
    await aguardar(() => telaNoApp(sairComAsMinhas), /PS .*>/)
    await comandoAte(sairComAsMinhas, 'ork abrir shell --nome Junto', 'Abri "Junto"')
    const junto = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Junto')?.id ?? ''`)
    await aguardar(() => telaNoApp(junto), /PS .*>/)
    await comandoAte(junto, 'ork abrir shell --nome "Neto junto"', 'Abri "Neto junto"')
    const netoJunto = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Neto junto')?.id ?? ''`)
    await comando(sairComAsMinhas, 'ork sair --com-as-minhas')
    for (let i = 0; i < 30 && (sessaoPorId(sairComAsMinhas) || sessaoPorId(junto) || sessaoPorId(netoJunto)); i++) await esperar(100)
    conferir(
      'ork sair --com-as-minhas fecha a árvore inteira',
      !sessaoPorId(sairComAsMinhas) && !sessaoPorId(junto) && !sessaoPorId(netoJunto),
      `raiz: ${!!sessaoPorId(sairComAsMinhas)} · filho: ${!!sessaoPorId(junto)} · neto: ${!!sessaoPorId(netoJunto)}`
    )

    // Não há limite de sessões por agente (o de 8 saiu na 1.2, porque um time grande esbarrava nele). O que
    // este trecho mede é justamente que **nada recusa por quantidade**: nove aberturas seguidas, uma delas em
    // outro espaço, e o `ork quem` somando as duas pontas. O freio que resta é o do quadro, não um por dono.
    const quantasSessoes = async (): Promise<number> => {
      await comando(chefe, 'Clear-Host')
      await esperar(600)
      const tela = await comandoAte(chefe, 'ork quem', /Você abriu \d+ sess/, 15_000)
      return Number(/Você abriu (\d+) sess/.exec(tela)?.[1] ?? -1)
    }
    const antesDasMuitas = await quantasSessoes()
    const aberturas: string[] = []
    for (let i = 1; i <= 7; i++) {
      const nome = `Limite ${i}`
      await comando(chefe, `ork abrir shell --nome "${nome}"`)
      aberturas.push(await aguardar(() => telaNoApp(chefe), `Abri "${nome}"`, 20_000))
    }
    await comando(chefe, 'ork abrir --espaco "Frente 2" shell --nome "Nono"')
    aberturas.push(await aguardar(() => telaNoApp(chefe), /Abri .Nono./, 20_000))
    // e uma abertura com um cartão recém-apagado ainda na folga do Ctrl+Z: antes, o apagado contava contra
    // o limite e esta era recusada
    const apagadoNaFolga = await js<string>(`(() => { const L = window.__teste.loja
      const n = L.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Limite 1'); if (!n) return ''
      L.apagar({ tipo: 'no', id: n.id }); return n.id })()`)
    await comando(chefe, 'ork abrir shell --nome "Durante a folga"')
    aberturas.push(await aguardar(() => telaNoApp(chefe), /Abri .Durante a folga./, 20_000))
    const depoisDasMuitas = await quantasSessoes()
    const recusada = aberturas.find((t) => /limite/.test(t))
    conferir(
      'um agente abre quantas sessões precisar, somando os dois espaços',
      !recusada && !!apagadoNaFolga && depoisDasMuitas >= 8 && depoisDasMuitas > antesDasMuitas,
      `${antesDasMuitas} → ${depoisDasMuitas} sessões · recusada: ${recusada ? ultimas(recusada, 2) : 'nenhuma'}`
    )

    await js(`(() => { const L = window.__teste.loja
      for (const n of L.planoAtual().nos.filter((n) => n.tipo === 'terminal' && n.criadoPor === '${chefe}')) L.apagar({ tipo: 'no', id: n.id })
      return L.salvarAgora() })()`)
    if (frente2) {
      await frente2.webContents.executeJavaScript(`window.__teste.loja.apagarEspaco(window.__teste.loja.lerEstado().espaco.id)`).catch(() => undefined)
      await pedirSalvamento(frente2)
      frente2.close()
      for (let i = 0; i < 50 && !frente2.isDestroyed(); i++) await esperar(100)

      // Carência: fechar uma janela não a tira da sessão na hora. É isso que faz "fechar as três janelas
      // para encerrar o dia" reabrir as três amanhã, em vez de só a última que sobrou.
      await esperar(900)
      const logoApos = lerSessaoDeJanelas()
      conferir(
        'janela fechada continua na sessão durante a carência',
        logoApos.janelas.length === 2,
        `${logoApos.janelas.length} janela(s) logo depois de fechar`
      )
    }

    // apagar o cartão: o processo espera a folga (o Ctrl+Z traz o cartão com ele vivo); depois encerra
    const pidSolto = sessaoPorId(solto)?.processo?.pid
    await js(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: '${solto}' }); L.apagarSelecao(); L.desfazer() })()`)
    await esperar(2500)
    const continua = !!pidSolto && sessaoPorId(solto)?.processo?.pid === pidSolto
    await js(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: '${solto}' }); L.apagarSelecao() })()`)
    await esperar(2500)
    conferir('apagar terminal: Ctrl+Z na folga mantém o processo; depois ele encerra', continua && !sessaoPorId(solto), `continuou: ${continua}`)

    // presets: criar "Claude Opus" (claude --model opus) pelo diálogo, com mouse e teclado, e abrir um terminal com ele
      },
    },
]
