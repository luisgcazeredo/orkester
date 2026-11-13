import { homedir } from 'node:os'
import { Cenario, Estado } from './util'

export const codigoExplorador = (e: Estado): Cenario[] => [
    {
      nome: 'codigo-explorador',
      depende: 'ork',
      rodar: async (d) => {
        const { pastaTerminais, espacoTerminais, chefe } = e
        const { esperar, js, conferir, comandoAte, aguardar, clicarEm, print, teclar, ultimas, arrastar, centroDe } = d
        // o cenário anterior pode ter deixado outro espaço à mostra; o shell "chefe" mora neste
        await js(`window.__teste.loja.abrirEspaco(${JSON.stringify(espacoTerminais)}, null)`)
        await esperar(700)
        const irPara = async (id: string): Promise<void> => {
          await js(`(() => { const L = window.__teste.loja; const n = L.planoAtual().nos.find((x) => x.id === ${JSON.stringify(id)})
            if (n) L.definirCamera({ x: -n.x + 60, y: -n.y + 60, zoom: 1 }) })()`)
          await esperar(500)
        }
        // Duas armadilhas do autoteste de uma vez: a marca é procurada no começo da linha (sem a âncora, a
        // espera casa com o eco da própria linha digitada, antes de o comando rodar) e o comando repete,
        // porque tecla sintética se perde — principalmente logo depois de clicar na interface.
        const gravar = async (nome: string, texto: string, marca: string): Promise<void> => {
          await comandoAte(chefe, `Set-Content -Encoding utf8 ${nome} '${texto}'; echo ${marca}`, new RegExp(`^${marca}`, 'm'), 15_000)
          await esperar(600) // a vigia junta a rajada de gravação antes de avisar
        }

        // o shell grava um arquivo na pasta do espaço: é o que um agente faria
        await gravar('exemplo.ts', 'const um = 1', 'FIM-GRAVOU1')
        // o cartão tem de nascer sozinho com a gravação: ninguém clicou em nada aqui
        const procurarCodigo = (): Promise<string> =>
          js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'codigo')?.id ?? ''`)
        let idCodigo = ''
        for (let i = 0; i < 40 && !idCodigo; i++) {
          idCodigo = await procurarCodigo()
          if (!idCodigo) await esperar(300)
        }
        conferir('o cartão de código nasce sozinho quando o agente grava', !!idCodigo, idCodigo || 'nenhum cartão apareceu')
        if (!idCodigo) throw new Error('sem cartão de código: o resto do cenário depende dele')
        const noCartao = (parte: string): Promise<string> =>
          js<string>(`document.querySelector('[data-no-id="${idCodigo}"] ${parte}')?.innerText ?? ''`)
        const corpo = (): Promise<string> => noCartao('.codigo-corpo')

        const visto = await aguardar(corpo, 'const um = 1', 15_000)
        conferir('cartão de código mostra o arquivo que o agente acabou de gravar', visto.includes('const um = 1'), ultimas(visto, 2))
        // pasta de teste não tem git: o cartão mostra o arquivo e diz por quê, em vez de só dar erro
        conferir('sem git, o cartão cai para o arquivo inteiro', visto.includes('pasta sem git'), ultimas(visto, 2))

        // realce de sintaxe: o corpo vem com as marcas do highlight.js, não texto cru
        const html = await js<string>(`document.querySelector('[data-no-id="${idCodigo}"] .codigo-linhas')?.innerHTML ?? ''`)
        conferir('o código aparece colorido (realce de sintaxe)', html.includes('class="hljs-'), html.slice(0, 80))

        // arquivo novo = cartão novo; o do arquivo anterior fica de bloquinho com o nome
        const cartoes = (): Promise<Array<{ id: string; caminho: string; recolhido: boolean; terminal: string }>> =>
          js(`window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'codigo')
            .map((n) => ({ id: n.id, caminho: n.caminho ?? '', recolhido: !!n.recolhido, terminal: n.terminal ?? '' }))`)
        await gravar('outro.ts', 'const dois = 2', 'FIM-GRAVOU2')
        let lista = await cartoes()
        for (let i = 0; i < 40 && lista.length < 2; i++) {
          await esperar(300)
          lista = await cartoes()
        }
        const aberto = lista.find((c) => !c.recolhido)
        const bloquinho = lista.find((c) => c.recolhido)
        const resumo = (l: typeof lista): string => l.map((c) => `${c.caminho}${c.recolhido ? ' (bloquinho)' : ''}`).join(' | ')
        conferir(
          'arquivo novo abre cartão novo e o anterior vira bloquinho',
          lista.length === 2 && !!aberto?.caminho.endsWith('outro.ts') && !!bloquinho?.caminho.endsWith('exemplo.ts'),
          resumo(lista)
        )
        const dono = lista[0]?.terminal ?? ''

        // segredo não abre cartão, mesmo recém-gravado
        await gravar('.env', 'SENHA=1234', 'FIM-ENV')
        await esperar(1500)
        const comEnv = await cartoes()
        conferir(
          'arquivo com cara de segredo não abre cartão',
          comEnv.length === 2 && !comEnv.some((c) => c.caminho.endsWith('.env')),
          resumo(comEnv)
        )

        // recolher pelo botão do cartão: encolhe de verdade (era o pedido de não espalhar o quadro)
        const idAberto = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'codigo' && !n.recolhido)?.id ?? ''`)
        await irPara(idAberto)
        const recolheu = await clicarEm(`[data-no-id="${idAberto}"] button[title^="Recolher"]`)
        await esperar(400)
        const tamanho = await js<{ largura: number; altura: number }>(`(() => { const n = window.__teste.loja.acharNo('${idAberto}')
          return { largura: n.largura, altura: n.altura } })()`)
        conferir('recolher encolhe o cartão num bloquinho', recolheu && tamanho.altura === 30 && tamanho.largura === 300, JSON.stringify(tamanho))

        // o "node" do agente: recolher todos e abrir todos de uma vez
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', true)`)
        await esperar(400)
        const todosBloquinho = (await cartoes()).every((c) => c.recolhido)
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', false)`)
        await esperar(400)

        const todosAbertos = (await cartoes()).every((c) => !c.recolhido)
        conferir('recolher todos e abrir todos, pelo agente', todosBloquinho && todosAbertos, `recolheu ${todosBloquinho} · abriu ${todosAbertos}`)

        // mapa mental: com os arquivos todos abertos, a coluna empurra o que estiver embaixo dela em vez de
        // passar por cima — nenhum cartão de código pode cobrir outra peça do quadro
        const sobrepostos = await js<string[]>(`(() => {
          const nos = window.__teste.loja.planoAtual().nos
          const cruza = (a, b) => a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura
          const pares = []
          for (let i = 0; i < nos.length; i++) {
            for (let j = i + 1; j < nos.length; j++) {
              const a = nos[i], b = nos[j]
              if ((a.tipo === 'codigo' || b.tipo === 'codigo') && cruza(a, b)) pares.push(a.tipo + ' x ' + b.tipo)
            }
          }
          return pares
        })()`)
        conferir(
          'com tudo aberto, nenhum cartão de código cobre outra peça do quadro',
          sobrepostos.length === 0,
          sobrepostos.join(' | ') || 'nada se cobre'
        )

        // a bolinha onde as ligações se separam: um clique nela recolhe os arquivos daquele agente
        await irPara(dono)
        const clicouBolinha = await clicarEm('.vinculo-toque')
        await esperar(500)
        const pelaBolinha = (await cartoes()).every((c) => c.recolhido)
        conferir(
          'a bolinha das ligações recolhe os arquivos do agente',
          clicouBolinha && pelaBolinha,
          `clicou ${clicouBolinha} · recolhidos ${pelaBolinha}`
        )
        await print('codigo-mapa-mental')
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', false)`)
        await esperar(400)

        // arrastar pela bolinha leva a coluna inteira, e ela continua sendo arrumada pelo app
        const posicoes = (): Promise<Array<{ id: string; x: number; y: number; automatico: boolean }>> =>
          js(`window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'codigo')
            .map((n) => ({ id: n.id, x: n.x, y: n.y, automatico: !!n.automatico }))`)
        const antesDoArrasto = await posicoes()
        const bolinha = await centroDe('.vinculo-toque')
        if (bolinha) await arrastar(bolinha, { x: bolinha.x, y: bolinha.y + 120 })
        await esperar(400)
        const depoisDoArrasto = await posicoes()
        const desceu = depoisDoArrasto.every((c) => {
          const antes = antesDoArrasto.find((a) => a.id === c.id)
          // folga no x também: o ímã de alinhamento pode encostar a coluna na borda de um vizinho
          return !!antes && Math.abs(c.y - antes.y - 120) <= 12 && Math.abs(c.x - antes.x) <= 12 && c.automatico
        })
        const desloc = await js<{ x: number; y: number } | null>(
          `window.__teste.loja.acharNo('${dono}')?.codigoDesloc ?? null`
        )
        conferir(
          'arrastar pela bolinha leva a coluna junto, sem tirá-la das mãos do app',
          !!bolinha && desceu && Math.abs((desloc?.y ?? 0) - 120) <= 12,
          `desceu ${desceu} · deslocamento ${JSON.stringify(desloc)}`
        )

        // e arrastar o agente leva os arquivos dele junto, como o ramo vai com o nó que o segura
        const cabecalhoDoDono = await centroDe(`[data-no-id="${dono}"] .terminal-cabecalho, [data-no-id="${dono}"] [data-arrasta]`)
        const antesDoAgente = await posicoes()
        if (cabecalhoDoDono) await arrastar(cabecalhoDoDono, { x: cabecalhoDoDono.x + 90, y: cabecalhoDoDono.y })
        await esperar(400)
        const depoisDoAgente = await posicoes()
        const foiJunto = depoisDoAgente.every((c) => {
          const antes = antesDoAgente.find((a) => a.id === c.id)
          return !!antes && Math.abs(c.x - antes.x - 90) <= 12 && c.automatico
        })
        conferir(
          'arrastar o agente leva os arquivos dele junto',
          !!cabecalhoDoDono && foiJunto,
          depoisDoAgente.map((c) => `${c.x},${c.y}${c.automatico ? '' : ' (solto)'}`).join(' | ')
        )

        // arrastar um cartão dentro da coluna reordena a coluna: ele não sai mais do grupo nem fica perdido
        const antesDaOrdem = await posicoes()
        const topoAntes = [...antesDaOrdem].sort((a, b) => a.y - b.y)[0]
        // o cartão precisa estar à vista: arrasto é mouse de verdade, e fora da tela não acerta nada
        await irPara(topoAntes.id)
        const pegada = await centroDe(`[data-no-id="${topoAntes.id}"] .cartao-ferramenta-cabecalho`)
        // mais que a altura de um cartão aberto, senão ele continua sendo o primeiro da fila
        if (pegada) await arrastar(pegada, { x: pegada.x, y: pegada.y + 520 })
        await esperar(600)
        const depoisDaOrdem = await posicoes()
        const alinhados = depoisDaOrdem.every((c) => c.automatico && c.x === depoisDaOrdem[0].x)
        const mudouDeLugar = [...depoisDaOrdem].sort((a, b) => a.y - b.y)[0]?.id !== topoAntes.id
        conferir(
          'arrastar um cartão dentro da coluna reordena, em vez de soltá-lo no quadro',
          !!pegada && alinhados && mudouDeLugar,
          `alinhados ${alinhados} · mudou de lugar ${mudouDeLugar}`
        )

        // longe da coluna é saída de propósito; e o menu do agente traz os soltos de volta
        await irPara(topoAntes.id)
        const pegadaLonge = await centroDe(`[data-no-id="${topoAntes.id}"] .cartao-ferramenta-cabecalho`)
        if (pegadaLonge) await arrastar(pegadaLonge, { x: pegadaLonge.x + 420, y: pegadaLonge.y + 40 })
        await esperar(600)
        const solto = (await posicoes()).find((c) => c.id === topoAntes.id)
        await js(`window.__teste.loja.juntarCodigosDoTerminal('${dono}')`)
        await esperar(600)
        const devolvido = (await posicoes()).find((c) => c.id === topoAntes.id)
        // e, enquanto estiver fora, a coluna não o empurra: antes ele descia um pouco a cada rearranjo
        await js(`window.__teste.loja.soltarCodigoDaColuna('${topoAntes.id}')`)
        await esperar(300)
        const ondeSolto = (await posicoes()).find((c) => c.id === topoAntes.id)?.y ?? 0
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', true)`)
        await esperar(300)
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', false)`)
        await esperar(500)
        const depoisDeRearranjar = (await posicoes()).find((c) => c.id === topoAntes.id)
        conferir(
          'cartão fora da coluna não leva empurrão a cada rearranjo',
          depoisDeRearranjar?.y === ondeSolto,
          `${ondeSolto} → ${depoisDeRearranjar?.y}`
        )
        await js(`window.__teste.loja.juntarCodigosDoTerminal('${dono}')`)
        await esperar(400)

        conferir(
          'arrastar para longe tira da coluna, e o menu do agente traz de volta',
          solto?.automatico === false && devolvido?.automatico === true,
          `solto ${solto?.automatico === false} · devolvido ${devolvido?.automatico === true}`
        )

        // com git, o cartão mostra o diff de verdade — é o caso principal, e sem repositório ele nunca roda
        // comandoAte repete: tecla sintética se perde de vez em quando, e esta linha vem depois de muito
        // clique na interface (é a armadilha conhecida do autoteste)
        const saidaGit = await comandoAte(
          chefe,
          'git init -q; git add -A; git -c user.email=t@teste -c user.name=Teste commit -qm base; ' +
            'if (Test-Path .git) { echo GIT-PRONTO } else { echo GIT-FALHOU }',
          /^GIT-(PRONTO|FALHOU)/m,
          40_000
        )
        conferir('o git do cenário foi preparado', /^GIT-PRONTO/m.test(saidaGit), ultimas(saidaGit, 3))
        const doExemplo = (await cartoes()).find((c) => c.caminho.endsWith('exemplo.ts'))?.id ?? ''
        await gravar('exemplo.ts', 'const um = 111', 'FIM-GRAVOU-DIFF')
        const comDiff = await aguardar(
          () => js<string>(`document.querySelector('[data-no-id="${doExemplo}"] .codigo-corpo')?.innerText ?? ''`),
          'const um = 111',
          15_000
        )
        const linhasDoDiff = await js<{ mais: number; menos: number }>(`(() => {
          const corpo = document.querySelector('[data-no-id="${doExemplo}"] .codigo-corpo')
          return { mais: corpo?.querySelectorAll('.codigo-linha.mais').length ?? 0, menos: corpo?.querySelectorAll('.codigo-linha.menos').length ?? 0 }
        })()`)
        conferir(
          'com git, o cartão mostra o diff: linha que entrou e linha que saiu',
          linhasDoDiff.mais === 1 && linhasDoDiff.menos === 1 && !comDiff.includes('pasta sem git'),
          `+${linhasDoDiff.mais} -${linhasDoDiff.menos} · ${ultimas(comDiff, 2)}`
        )
        await print('codigo-diff')

        // explorador da direita
        await js('window.__teste.loja.alternarExplorador()')
        await esperar(500)
        await clicarEm('.explorador-raiz-topo')
        const listado = await aguardar(() => js<string>(`document.querySelector('.explorador-arvore')?.innerText ?? ''`), 'exemplo.ts', 10_000)
        conferir(
          'explorador da direita lista os arquivos da pasta do espaço',
          listado.includes('exemplo.ts') && listado.includes('outro.ts'),
          listado.split('\n').filter(Boolean).slice(0, 6).join(' | ')
        )
        await print('codigo-explorador')

        // botão de anexo no cartão do terminal (o diálogo do sistema não dá para dirigir no teste)
        await irPara(chefe)
        const abriu = await clicarEm(`[data-no-id="${chefe}"] button[title^="Anexar"]`)
        const menu = await js<string>(`document.querySelector('.menu-contexto')?.innerText ?? ''`)
        conferir(
          'botão de anexo abre as opções no cartão do terminal',
          abriu && menu.includes('Arquivo') && menu.includes('Pasta'),
          menu.split('\n').filter(Boolean).join(' | ') || 'menu não abriu'
        )
        await teclar('Escape')
        await js('window.__teste.loja.alternarExplorador()')
        await esperar(300)

        // fechar um cartão só fecha aquele arquivo: o próximo que o agente mexer abre outro
        await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${idCodigo}' })`)
        await esperar(300)
        await gravar('terceiro.ts', 'const tres = 3', 'FIM-GRAVOU3')
        await esperar(1500)
        const depoisDeFecharUm = await cartoes()
        conferir(
          'fechar um cartão não para o automático; o arquivo seguinte abre outro',
          depoisDeFecharUm.some((c) => c.caminho.endsWith('terceiro.ts')),
          resumo(depoisDeFecharUm)
        )

        // "fechar todos" é o gesto de parar: apaga a coluna e desliga o automático da pasta
        await js(`window.__teste.loja.fecharCodigosDoTerminal('${dono}')`)
        await esperar(400)
        const desligou = await js<boolean>(`window.__teste.loja.acharNo('${dono}')?.codigoSozinho === false`)
        await gravar('quarto.ts', 'const quatro = 4', 'FIM-GRAVOU4')
        await esperar(1500)
        const quantos = (await cartoes()).length
        conferir('fechar todos desliga o automático da pasta', desligou && quantos === 0, `desligou ${desligou} · cartões ${quantos}`)

        // religa o automático (o "fechar todos" acima desligou) para o resto do cenário
        await js(`window.__teste.loja.alternarCodigoSozinho('${dono}')`)
        await esperar(300)

        // cartão aberto à mão antes de haver arquivo (e o que sobrou da versão que trocava de conteúdo):
        // ele vira o cartão do primeiro arquivo gravado, em vez de trocar de conteúdo para sempre
        await js(`(() => { const L = window.__teste.loja
          return L.adicionarNo({ tipo: 'codigo', terminal: '${dono}' }, 3000, 300) })()`)
        await gravar('quinto.ts', 'const cinco = 5', 'FIM-GRAVOU5')
        await esperar(1500)
        const depoisDoVazio = await cartoes()
        conferir(
          'cartão sem arquivo vira o cartão do primeiro arquivo gravado',
          depoisDoVazio.length === 1 && depoisDoVazio[0].caminho.endsWith('quinto.ts'),
          resumo(depoisDoVazio) || 'nenhum cartão'
        )
        // e o app passa a tratá-lo como dele: o arquivo seguinte recolhe este num bloquinho
        await gravar('sexto.ts', 'const seis = 6', 'FIM-GRAVOU6')
        await esperar(1500)
        const depoisDoSexto = await cartoes()
        conferir(
          'cartão adotado entra na coluna e se recolhe quando chega o próximo arquivo',
          depoisDoSexto.length === 2 && depoisDoSexto.some((c) => c.caminho.endsWith('quinto.ts') && c.recolhido),
          resumo(depoisDoSexto)
        )

        // abrir um bloquinho para ler não é arrumar o quadro: o cartão continua na coluna, e o arquivo
        // seguinte recolhe só o que era o atual — não o que você abriu para ler
        const idQuinto = (await cartoes()).find((c) => c.caminho.endsWith('quinto.ts'))?.id ?? ''
        await irPara(idQuinto)
        const abriuBloquinho = await clicarEm(`[data-no-id="${idQuinto}"] button[title^="Abrir"]`)
        await esperar(400)
        await gravar('setimo.ts', 'const sete = 7', 'FIM-GRAVOU7')
        await esperar(1500)
        const tres = await cartoes()
        const quinto = tres.find((c) => c.caminho.endsWith('quinto.ts'))
        const sexto = tres.find((c) => c.caminho.endsWith('sexto.ts'))
        const setimo = tres.find((c) => c.caminho.endsWith('setimo.ts'))
        conferir(
          'bloquinho aberto para ler continua aberto; o próximo arquivo recolhe só o anterior',
          abriuBloquinho && !!quinto && !quinto.recolhido && !!sexto?.recolhido && !!setimo && !setimo.recolhido,
          resumo(tres)
        )

        // arquivo apagado: o cartão diz "não encontrado", não "não está em pasta do quadro". O alvo é o
        // cartão aberto (bloquinho não desenha corpo, então não teria aviso nenhum para ler)
        await comandoAte(chefe, 'Remove-Item setimo.ts; if (Test-Path setimo.ts) { echo AINDA } else { echo SUMIU }', /^SUMIU/m, 15_000)
        const doSetimo = (await cartoes()).find((c) => c.caminho.endsWith('setimo.ts'))?.id ?? ''
        const recado = await aguardar(
          () => js<string>(`document.querySelector('[data-no-id="${doSetimo}"] .codigo-aviso')?.innerText ?? ''`),
          /não encontrado|não está em pasta/,
          8000
        )
        conferir('arquivo apagado: o cartão diz que não encontrou, e não que está fora do quadro', recado.includes('não encontrado'), recado)
        // árvores de código: o agente separa os arquivos por frente de trabalho e fala delas pelo nome
        const listou = await comandoAte(chefe, 'ork arvore', /principal/m, 15_000)
        conferir('ork arvore lista as árvores do cartão', /"principal"/.test(listou), ultimas(listou, 3))

        await comandoAte(chefe, 'ork arvore nova "Backend"', /^Árvore "Backend" pronta/m, 15_000)
        await gravar('oitavo.ts', 'const oito = 8', 'FIM-GRAVOU8')
        await esperar(1500)
        const comArvore = await js<Array<{ caminho: string; arvore: string }>>(
          `window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'codigo')
            .map((n) => ({ caminho: n.caminho ?? '', arvore: n.arvore ?? '' }))`
        )
        const oitavo = comArvore.find((c) => c.caminho.endsWith('oitavo.ts'))
        conferir(
          'arquivo novo nasce na árvore em uso',
          !!oitavo?.arvore && comArvore.some((c) => c.caminho.endsWith('sexto.ts') && !c.arvore),
          comArvore.map((c) => `${c.caminho.split(/[\/]/).pop()}${c.arvore ? ' (outra árvore)' : ''}`).join(' | ')
        )
        const bolinhas = await js<number>(`document.querySelectorAll('.vinculo-bolinha').length`)
        const nomeNaTela = await js<string>(
          `[...document.querySelectorAll('.vinculo-nome')].map((n) => n.textContent).join(' | ')`
        )
        conferir(
          'cada árvore tem a sua bolinha, e a nova mostra o nome',
          bolinhas >= 2 && nomeNaTela.includes('Backend'),
          `${bolinhas} bolinha(s) · nomes: ${nomeNaTela || 'nenhum'}`
        )
        // de longe, para o print mostrar as duas árvores inteiras, com as bolinhas e os nomes
        await js(`(() => { const L = window.__teste.loja; const n = L.acharNo(${JSON.stringify(dono)})
          L.definirCamera({ x: -n.x * 0.45 + 340, y: -n.y * 0.45 + 60, zoom: 0.45 }) })()`)
        await esperar(500)
        await print('codigo-arvores')
        // uma árvore não cobre a outra: a nova nasce abaixo do que o agente já tinha
        const seCobrem = await js<number>(`(() => {
          const nos = window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'codigo')
          const cruza = (a, b) => a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + b.altura && b.y < a.y + a.altura
          let pares = 0
          for (let i = 0; i < nos.length; i++) for (let j = i + 1; j < nos.length; j++) if (cruza(nos[i], nos[j])) pares++
          return pares
        })()`)
        conferir('com duas árvores, nenhum cartão cobre outro', seCobrem === 0, )

        // mostrar traz um arquivo que já tinha cartão para a árvore pedida, sem abrir cartão repetido
        await comandoAte(chefe, 'ork arvore mostrar sexto.ts --arvore "Backend"', /^Mostrei 1 arquivo/m, 15_000)
        await esperar(800)
        const depoisDeMostrar = await js<Array<{ caminho: string; arvore: string }>>(
          `window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'codigo')
            .map((n) => ({ caminho: n.caminho ?? '', arvore: n.arvore ?? '' }))`
        )
        const doSexto = depoisDeMostrar.filter((c) => c.caminho.endsWith('sexto.ts'))
        conferir(
          'ork arvore mostrar leva o arquivo para a árvore, sem cartão repetido',
          doSexto.length === 1 && !!doSexto[0].arvore,
          doSexto.map((c) => `${c.caminho} (${c.arvore || 'principal'})`).join(' | ') || 'nenhum cartão'
        )
        // Entregar um cartão de código a outro agente: o cartão fica no quadro e troca de coluna. É o
        // conserto para o dono ter sido palpitado errado — num time na mesma pasta, o app não sabe quem
        // gravou, e em 10/11/2026 todos os arquivos de quatro agentes foram parar na coluna de um só.
        // o nome do cartão vem do preset (o `adicionarNo` não aceita nome), então o teste pergunta qual é
        const vizinho = await js<{ id: string; nome: string }>(`(() => { const L = window.__teste.loja
          const presets = L.lerEstado().preferencias.presets
          const id = L.adicionarNo({ tipo: 'terminal', preset: presets.find((p) => p.agente === 'shell') }, 3000, 1400)
          return { id, nome: L.acharNo(id).nome } })()`)
        await esperar(400)
        // Sem corda, recusa: entregar mexe na coluna do outro, e desde a 1.0.10 isso segue a regra da corda.
        // Este teste é anterior a ela e ficou quatro versões reprovando sem ninguém ver (a suíte inteira não
        // rodava a cada entrega); agora confere os dois lados.
        const semCorda = await comandoAte(chefe, `cls; ork arvore dar "${vizinho.nome}" sexto.ts`, /Entreguei|alcance|ork:/, 15_000)
        conferir('ork arvore dar recusa entregar a quem não está na sua corda', /não está ao seu alcance/.test(semCorda), ultimas(semCorda, 2))
        await js(`window.__teste.loja.ligar(${JSON.stringify(chefe)}, ${JSON.stringify(vizinho.id)})`)
        await esperar(300)
        const entrega = await comandoAte(chefe, `cls; ork arvore dar "${vizinho.nome}" sexto.ts`, /Entreguei|não|ork:/, 15_000)
        await esperar(600)
        const donoDoSexto = await js<string>(
          `(window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'codigo' && (n.caminho ?? '').endsWith('sexto.ts'))?.terminal ?? '')`
        )
        conferir(
          'ork arvore dar passa o cartão de código para outro agente, sem apagá-lo',
          donoDoSexto === vizinho.id && /Entreguei/.test(entrega),
          `para "${vizinho.nome}" · dono agora: ${donoDoSexto === vizinho.id ? 'ele' : donoDoSexto || 'nenhum cartão'} · ${ultimas(entrega, 3)}`
        )

        // a pasta do usuário não é vigiada (senão vira cartão de tudo que o PC grava); a do projeto é
        const podeProjeto = await js<boolean>(`window.ork.codigo.vigiavel(${JSON.stringify(pastaTerminais)})`)
        const podeCasa = await js<boolean>(
          `window.ork.codigo.vigiavel(${JSON.stringify(process.env.USERPROFILE ?? homedir())})`
        )
        conferir(
          'a pasta do usuário não é vigiada; a do projeto é',
          podeProjeto === true && podeCasa === false,
          `projeto ${podeProjeto} · casa ${podeCasa}`
        )

        // arrastar um cartão para a coluna da outra árvore muda ele de árvore
        await js(`(() => { const L = window.__teste.loja; const n = L.acharNo(${JSON.stringify(dono)})
          L.definirCamera({ x: -n.x * 0.45 + 340, y: -n.y * 0.45 + 60, zoom: 0.45 }) })()`)
        await esperar(500)
        const comIds = (): Promise<Array<{ id: string; caminho: string; arvore: string }>> =>
          js(`window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'codigo')
            .map((n) => ({ id: n.id, caminho: n.caminho ?? '', arvore: n.arvore ?? '' }))`)
        const antesDaTroca = await comIds()
        const oitavoCartao = antesDaTroca.find((c) => c.caminho.endsWith('oitavo.ts'))
        const daPrincipal = antesDaTroca.find((c) => !c.arvore)
        const pegaOitavo = oitavoCartao ? await centroDe(`[data-no-id="${oitavoCartao.id}"] .cartao-ferramenta-cabecalho`) : null
        const alvoPrincipal = daPrincipal ? await centroDe(`[data-no-id="${daPrincipal.id}"] .cartao-ferramenta-cabecalho`) : null
        if (pegaOitavo && alvoPrincipal) await arrastar(pegaOitavo, { x: alvoPrincipal.x, y: alvoPrincipal.y + 12 })
        await esperar(700)
        const trocou = (await comIds()).find((c) => c.caminho.endsWith('oitavo.ts'))
        conferir(
          'arrastar um cartão para a coluna da outra árvore muda ele de árvore',
          !!trocou && trocou.arvore === '',
          `${oitavoCartao?.arvore ? 'Backend' : 'principal'} → ${trocou?.arvore ? 'outra' : 'principal'}`
        )

        // fechar os soltos tira só o que saiu das árvores
        const quantosAntes = (await comIds()).length
        if (trocou) await js(`window.__teste.loja.soltarCodigoDaColuna('${trocou.id}')`)
        await esperar(300)
        await js(`window.__teste.loja.fecharCodigosSoltos('${dono}')`)
        await esperar(400)
        const depoisDeFechar = await comIds()
        conferir(
          'fechar os soltos tira só o cartão que saiu das árvores',
          depoisDeFechar.length === quantosAntes - 1 && !depoisDeFechar.some((c) => c.caminho.endsWith('oitavo.ts')),
          `${quantosAntes} → ${depoisDeFechar.length} cartões`
        )


      }
    },
]
