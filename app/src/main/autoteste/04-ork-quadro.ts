import { Cenario, Estado } from './util'

export const orkQuadro = (e: Estado): Cenario[] => [
    {
      // O agente mexendo no quadro (volta 1A): ler, mover, arrumar, nome, ligar, desligar, anotar, juntar.
      // Os cartões deste cenário nascem longe de tudo para não atrapalhar os outros, e o que ele mexe no
      // cartão do chefe (o nome, a corda) ele desfaz antes de sair.
      nome: 'ork-quadro',
      depende: 'ork-conexoes',
      rodar: async (d) => {
        const { chefe, solto } = e
        const { esperar, js, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d
    // os cartões nascem centrados no ponto, então todo lugar esperado vem do estado, não de número fixo
    const notas = await js<Record<string, string>>(`(() => { const L = window.__teste.loja
      return {
        a: L.adicionarNo({ tipo: 'texto', texto: 'Nota A' }, 9000, 4000),
        b: L.adicionarNo({ tipo: 'texto', texto: 'Nota B' }, 9600, 4000),
        c: L.adicionarNo({ tipo: 'texto', texto: 'Nota C' }, 9000, 4600)
      } })()`)
    const lugarDe = (id: string): Promise<{ x: number; y: number; altura: number; grupo: string }> =>
      js(`(() => { const n = window.__teste.loja.acharNo('${id}')
        return { x: n.x, y: n.y, altura: n.altura, grupo: n.grupo ?? '' } })()`)
    const antesDeMexer = await lugarDe(notas.a)

    const leitura = await comandoAte(chefe, 'ork quadro', /cartão\(ões\)/, 15_000)
    conferir(
      'ork quadro: lista os cartões numerados, com lugar, e marca quem perguntou',
      /cartão\(ões\)/.test(leitura) && /← você/.test(leitura) && /Nota A/.test(leitura) && /em \(\d+, \d+\)/.test(leitura),
      ultimas(leitura, 2)
    )

    // só lugar absoluto neste cenário: repetir o comando dá no mesmo, então a repetição do comandoAte
    // (que existe porque a entrada sintética se perde) não muda o resultado
    await comandoAte(chefe, 'ork mover "Nota A" --x 9000 --y 7000', /Movi "Nota A"/, 15_000)
    const movida = await lugarDe(notas.a)
    await js('window.__teste.loja.desfazer()')
    await esperar(300)
    const desfeita = await lugarDe(notas.a)
    conferir(
      'ork mover leva o cartão para o lugar pedido, e o Ctrl+Z do usuário desfaz',
      movida.x === 9000 && movida.y === 7000 && desfeita.x === antesDeMexer.x && desfeita.y === antesDeMexer.y,
      `movida (${movida.x}, ${movida.y}) · desfeita (${desfeita.x}, ${desfeita.y}) · era (${antesDeMexer.x}, ${antesDeMexer.y})`
    )

    await comandoAte(chefe, 'ork juntar "Nota A" "Nota B"', /num grupo/, 15_000)
    await comandoAte(chefe, 'ork mover "Nota A" --x 5000 --y 5000', /Movi "Nota A", "Nota B"/, 15_000)
    const [grupoA, grupoB] = [await lugarDe(notas.a), await lugarDe(notas.b)]
    conferir(
      'ork juntar agrupa, e mover um leva o grupo inteiro (sem perder a distância)',
      !!grupoA.grupo && grupoA.grupo === grupoB.grupo && grupoA.x === 5000 && grupoA.y === 5000 && grupoB.x - grupoA.x === 600 && grupoB.y === 5000,
      `grupo ${grupoA.grupo ? 'sim' : 'não'} · A em (${grupoA.x}, ${grupoA.y}) · B em (${grupoB.x}, ${grupoB.y})`
    )

    await js(`window.__teste.loja.atualizarNo('${notas.c}', { travado: true }, false)`)
    await esperar(200)
    const antesDoTravado = await lugarDe(notas.c)
    const recusa = await comandoAte(chefe, 'ork mover "Nota C" --x 1 --y 1', /travado/, 15_000)
    const travada = await lugarDe(notas.c)
    conferir(
      'cartão travado não se mexe por pedido de agente, e o ork diz por quê',
      /travado/.test(recusa) && travada.x === antesDoTravado.x && travada.y === antesDoTravado.y,
      `${ultimas(recusa, 1)} · (${travada.x}, ${travada.y})`
    )
    await js(`window.__teste.loja.atualizarNo('${notas.c}', { travado: false }, false)`)
    await esperar(200)

    await comandoAte(chefe, 'ork arrumar "Nota A" "Nota B" "Nota C" --colunas 1 --vao 20', /Arrumei \d+ bloco/, 15_000)
    const arrumadas = [await lugarDe(notas.a), await lugarDe(notas.b), await lugarDe(notas.c)]
    conferir(
      // a ordem dos blocos na coluna é a de cima para baixo do quadro antes de arrumar, então o que se
      // confere é a coluna (mesmo x), a distância do vão e o grupo inteiro de pé
      'ork arrumar põe em coluna, trata o grupo como um bloco e não desmancha o grupo',
      arrumadas[0].x === arrumadas[2].x &&
        arrumadas[1].x - arrumadas[0].x === 600 &&
        Math.abs(arrumadas[2].y - arrumadas[0].y) === arrumadas[0].altura + 20,
      arrumadas.map((l) => `(${l.x}, ${l.y})`).join(' ')
    )

    // o nome é conferido no estado, não na tela, e o comando é repetido se a tecla se perder: renomear para
    // um nome que já está em uso é recusado, então repetir é inofensivo (e foi preciso — numa rodada o
    // segundo `ork nome` se perdeu e a checagem caiu sem nada de errado no app)
    const renomear = async (de: string, para: string): Promise<string> => {
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        await comando(chefe, `ork nome "${de}" "${para}"`)
        const chegou = await aguardar(async () => js<string>(`window.__teste.loja.acharNo('${chefe}').nome`), para, 8000)
        if (chegou === para) return chegou
      }
      return js<string>(`window.__teste.loja.acharNo('${chefe}').nome`)
    }
    const batizado = await renomear('PowerShell', 'Maestro')
    const devolta = await renomear('Maestro', 'PowerShell')
    conferir('ork nome renomeia o cartão de agente nos dois sentidos', batizado === 'Maestro' && devolta === 'PowerShell', `${batizado} → ${devolta}`)

    // A corda **é** a permissão, então ela não se dá a si mesma: o agente só liga ou desliga quem ele abriu
    // ou quem já está ligado a ele (ver shared/quadro/agente.ts). Até a 1.0.10 este cenário ligava o chefe a
    // um cartão do usuário e passava; a regra mudou na 1.0.10 e o cenário não — e ninguém o rodou depois,
    // então a checagem vinha falhando calada desde então (visto em 10/11/2026). Agora cobre os dois lados.
    const cordasEntre = (a: string, b: string): Promise<number> =>
      js(`window.__teste.loja.planoAtual().cordas
        .filter((c) => [c.de, c.para].includes('${a}') && [c.de, c.para].includes('${b}')).length`)

    // o lado que pode: quem o chefe abriu fica ao alcance dele pela criação, não pela corda — então,
    // depois de desligar, ele consegue religar
    await comando(chefe, 'ork abrir shell --nome Vizinho')
    // sem `comandoAte` aqui de propósito: ele repete o comando até casar, e repetir um `ork abrir` abriria
    // mais de um cartão
    await aguardar(() => telaNoApp(chefe), /Abri .Vizinho./, 40_000)
    const vizinho = await js<string>(`(() => { const n = window.__teste.loja.planoAtual().nos
      .find((x) => x.tipo === 'terminal' && x.nome === 'Vizinho'); return n ? n.id : '' })()`)
    const nasceLigado = await cordasEntre(chefe, vizinho)
    // a tela é limpa entre as medições: o "Desliguei" de um passo ficaria no histórico e a espera do passo
    // seguinte terminaria antes de o comando rodar (o `comandoAte` volta assim que vê o texto)
    await comando(chefe, 'Clear-Host')
    await esperar(600)
    await comandoAte(chefe, 'ork desligar "PowerShell" "Vizinho"', /Desliguei/, 15_000)
    const semVizinho = await cordasEntre(chefe, vizinho)
    await comando(chefe, 'Clear-Host')
    await esperar(600)
    await comandoAte(chefe, 'ork ligar "PowerShell" "Vizinho"', /Liguei/, 15_000)
    const religado = await cordasEntre(chefe, vizinho)
    conferir(
      'ork desliga e religa quem ele mesmo abriu',
      !!vizinho && nasceLigado === 1 && semVizinho === 0 && religado === 1,
      `nasce:${nasceLigado} → desligado:${semVizinho} → religado:${religado}`
    )
    await comandoAte(chefe, 'ork fechar "Vizinho"', /Fechei/, 20_000)

    // o lado recusado: o cartão que o usuário abriu não se alcança por conta própria. O "Solto" pode estar
    // ligado ao chefe por causa de um cenário anterior; desliga (isso é permitido, a corda existe), tenta
    // ligar de novo — e tem de ser recusado. No fim devolve o quadro como estava.
    const cordaComOSolto = await cordasEntre(chefe, solto)
    if (cordaComOSolto) {
      await comando(chefe, 'Clear-Host')
      await esperar(600)
      await comandoAte(chefe, 'ork desligar "PowerShell" "Solto"', /Desliguei/, 15_000)
    }
    await comando(chefe, 'Clear-Host')
    await esperar(600)
    const tentou = await comandoAte(chefe, 'ork ligar "PowerShell" "Solto"', /alcance|Liguei/, 15_000)
    const cordaDepois = await cordasEntre(chefe, solto)
    if (cordaComOSolto) await js(`window.__teste.loja.ligar('${chefe}', '${solto}')`)
    conferir(
      'a corda não se dá a si mesma: ork ligar num cartão do usuário é recusado',
      /não está ao seu alcance/.test(tentou) && cordaDepois === 0,
      `${ultimas(tentou, 3)} · cordas com o Solto depois: ${cordaDepois}`
    )

    await comando(chefe, 'ork anotar "Falta o teste do empurrao"')
    await aguardar(() => telaNoApp(chefe), 'Anotei no quadro', 15_000)
    const anotacao = await js<{ achou: boolean; abaixo: boolean }>(`(() => { const L = window.__teste.loja
      const chefe = L.acharNo('${chefe}')
      const nova = L.planoAtual().nos.find((n) => n.tipo === 'texto' && n.texto === 'Falta o teste do empurrao')
      return { achou: !!nova, abaixo: !!nova && nova.y > chefe.y + chefe.altura - 1 && nova.x === chefe.x } })()`)
    conferir('ork anotar escreve no quadro, abaixo do cartão de quem anotou', anotacao.achou && anotacao.abaixo, `achou:${anotacao.achou} · abaixo:${anotacao.abaixo}`)

    // Ler de volta o que ele mesmo anotou. A lista do `ork quadro` corta em 60 letras, então a anotação
    // longa é justamente o caso: o agente escrevia um relatório e não conseguia relê-lo.
    const longa = `RELATORIO-LONGO-${'x'.repeat(90)}-FIM`
    await comandoAte(chefe, `cls; ork anotar "${longa}"`, /Anotei no quadro/, 15_000)
    const lido = await comandoAte(chefe, 'cls; ork ler "RELATORIO-LONGO"', /RELATORIO-LONGO/, 15_000)
    conferir('ork ler devolve a anotação inteira, não o começo que a lista mostra', lido.includes('-FIM'), ultimas(lido, 2))

    // e apagar o que ele criou, com a corda indo junto
    const apagou = await comandoAte(chefe, 'cls; ork apagar "RELATORIO-LONGO"', /Apaguei|não/, 15_000)
    const sumiu = await js<boolean>(
      `!window.__teste.loja.planoAtual().nos.some((n) => n.tipo === 'texto' && n.texto.includes('RELATORIO-LONGO'))`
    )
    conferir('ork apagar tira o cartão do quadro', sumiu && /Apaguei/.test(apagou), sumiu ? 'saiu do quadro' : 'continua lá')

    // e não apaga agente nenhum: isso é `ork fechar`, e só o que ele abriu
    const recusaDeApagar = await comandoAte(chefe, `cls; ork apagar "PowerShell"`, /ork fechar|não/, 15_000)
    const chefeVivo = await js<boolean>(`!!window.__teste.loja.acharNo('${chefe}')`)
    conferir('ork apagar recusa agente e manda usar o ork fechar', chefeVivo && /ork fechar/.test(recusaDeApagar), ultimas(recusaDeApagar, 2))

    // o quadro volta ao que era para os cenários seguintes: as notas e a anotação deste teste saem
    await js(`(() => { const L = window.__teste.loja
      const anotacao = L.planoAtual().nos.find((n) => n.tipo === 'texto' && n.texto === 'Falta o teste do empurrao')
      for (const id of [...${JSON.stringify(Object.values(notas))}, anotacao?.id].filter(Boolean)) {
        L.selecionar({ tipo: 'no', id }); L.apagarSelecao()
      }
      L.selecionar(null) })()`)
    await esperar(300)
    // e a tela do chefe fica limpa: a leitura do quadro escreve o nome do espaço, e o cenário seguinte
    // espera por texto na tela — resto de um comando meu faria a espera dele terminar antes da hora
    await comando(chefe, 'Clear-Host')
    await esperar(600)
      },
    },
]
