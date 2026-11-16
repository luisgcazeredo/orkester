import { homedir } from 'node:os'
import { Cenario, Estado } from './util'

// B2d (1.8.0): o código do agente é um visor por agente e árvore, com a lista dos arquivos (`arquivos`), e não
// mais um cartão por arquivo. O cartão de UM arquivo (o "Ver o código no quadro" do explorador) continua existindo.
type Visor = {
  id: string
  terminal: string
  arvore: string
  caminho: string
  seguindo: boolean
  recolhido: boolean
  automatico: boolean
  x: number
  y: number
  largura: number
  altura: number
  arquivos: Array<{ caminho: string; sumiu: boolean }>
}
const ultimoNome = (c: string): string => c.split(/[\\/]/).pop() ?? c

export const codigoExplorador = (e: Estado): Cenario[] => [
    {
      nome: 'codigo-explorador',
      depende: 'ork',
      rodar: async (d) => {
        const { pastaTerminais, espacoTerminais, chefe } = e
        const { esperar, js, conferir, comandoAte, comando, aguardar, clicarEm, print, teclar, ultimas, arrastar, centroDe } = d
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
        const visores = (): Promise<Visor[]> =>
          js(`window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'codigo' && Array.isArray(n.arquivos))
            .map((n) => ({ id: n.id, terminal: n.terminal ?? '', arvore: n.arvore ?? '', caminho: n.caminho ?? '',
              seguindo: n.seguindo !== false, recolhido: !!n.recolhido, automatico: !!n.automatico,
              x: n.x, y: n.y, largura: n.largura, altura: n.altura,
              arquivos: n.arquivos.map((a) => ({ caminho: a.caminho, sumiu: !!a.sumiu })) }))`)
        const ehPrincipal = (v: Visor): boolean => !v.arvore || v.arvore === 'principal'
        const doPrincipal = async (): Promise<Visor | undefined> => (await visores()).find(ehPrincipal)
        const nomes = (v?: Visor): string => (v ? v.arquivos.map((a) => ultimoNome(a.caminho)).join(', ') : 'sem visor')
        const esperarLista = async (quando: (v: Visor | undefined) => boolean, ms = 12_000): Promise<Visor | undefined> => {
          let v = await doPrincipal()
          for (const limite = Date.now() + ms; Date.now() < limite && !quando(v); ) {
            await esperar(150)
            v = await doPrincipal()
          }
          return v
        }

        // o shell grava um arquivo na pasta do espaço: é o que um agente faria
        await gravar('exemplo.ts', 'const um = 1', 'FIM-GRAVOU1')
        // o visor tem de nascer sozinho com a gravação: ninguém clicou em nada aqui
        const v1 = await esperarLista((v) => !!v && v.arquivos.length >= 1, 15_000)
        const idCodigo = v1?.id ?? ''
        conferir('o visor de código nasce sozinho quando o agente grava', !!idCodigo && nomes(v1) === 'exemplo.ts', nomes(v1))
        if (!idCodigo) throw new Error('sem visor de código: o resto do cenário depende dele')
        const dono = v1?.terminal ?? ''
        const noCartao = (parte: string, id = idCodigo): Promise<string> =>
          js<string>(`document.querySelector('[data-no-id="${id}"] ${parte}')?.innerText ?? ''`)
        const corpo = (): Promise<string> => noCartao('.codigo-corpo')

        const visto = await aguardar(corpo, 'const um = 1', 15_000)
        conferir('o visor mostra o arquivo que o agente acabou de gravar', visto.includes('const um = 1'), ultimas(visto, 2))
        // pasta de teste não tem git: o visor mostra o arquivo e diz por quê, em vez de só dar erro
        conferir('sem git, o visor cai para o arquivo inteiro', visto.includes('pasta sem git'), ultimas(visto, 2))

        // realce de sintaxe: o corpo vem com as marcas do highlight.js, não texto cru
        const html = await js<string>(`document.querySelector('[data-no-id="${idCodigo}"] .codigo-linhas')?.innerHTML ?? ''`)
        conferir('o código aparece colorido (realce de sintaxe)', html.includes('class="hljs-'), html.slice(0, 80))

        // arquivo novo = entrada nova no topo da MESMA lista; nenhum cartão novo
        await gravar('outro.ts', 'const dois = 2', 'FIM-GRAVOU2')
        const v2 = await esperarLista((v) => !!v && v.arquivos.length >= 2)
        const soUm = (await visores()).length === 1
        conferir(
          'arquivo novo entra no topo da lista do visor, sem abrir cartão novo',
          nomes(v2) === 'outro.ts, exemplo.ts' && soUm,
          `${nomes(v2)} · visores ${soUm ? 1 : 'mais de 1'}`
        )
        const trocou2 = await esperarLista((v) => !!v && ultimoNome(v.caminho) === 'outro.ts', 8000)
        conferir('seguindo, o visor passa a mostrar o arquivo mais novo', ultimoNome(trocou2?.caminho ?? '') === 'outro.ts', ultimoNome(trocou2?.caminho ?? ''))

        // rajada: a lista atualiza na hora, a tela só troca depois de ~2 s sem gravação nova e não pisca no meio
        const antesDaRajada = ultimoNome((await doPrincipal())?.caminho ?? '')
        await comando(chefe, "Set-Content r1.ts 'a'; Set-Content r2.ts 'b'; Set-Content r3.ts 'c'; echo FIM-RAJADA")
        const vistos = new Set<string>()
        let chegouEm = 0
        let trocouEm = 0
        let viuNaHora = ''
        for (const limite = Date.now() + 20_000; Date.now() < limite; await esperar(80)) {
          const v = await doPrincipal()
          if (!v) continue
          const listados = v.arquivos.map((a) => ultimoNome(a.caminho))
          const cheia = ['r1.ts', 'r2.ts', 'r3.ts'].every((r) => listados.includes(r))
          if (cheia && !chegouEm) {
            chegouEm = Date.now()
            viuNaHora = ultimoNome(v.caminho)
          }
          if (chegouEm) {
            vistos.add(ultimoNome(v.caminho))
            if (v.caminho === v.arquivos[0]?.caminho) {
              trocouEm = Date.now()
              break
            }
          }
        }
        const espera = trocouEm - chegouEm
        const topoDaRajada = ultimoNome((await doPrincipal())?.arquivos[0]?.caminho ?? '')
        conferir(
          'rajada: a lista já tem os três arquivos e a tela só troca depois da espera',
          !!chegouEm && viuNaHora === antesDaRajada && espera >= 900 && /^r[123]\.ts$/.test(topoDaRajada),
          `na hora mostrava ${viuNaHora} (antes ${antesDaRajada}) · trocou após ${espera} ms para ${topoDaRajada}`
        )
        conferir(
          'rajada: o visor não pisca nos arquivos do meio',
          [...vistos].every((n) => n === antesDaRajada || n === topoDaRajada),
          [...vistos].join(' → ')
        )
        await esperar(500)

        // segredo não entra na lista, mesmo recém-gravado
        await gravar('.env', 'SENHA=1234', 'FIM-ENV')
        await esperar(1500)
        const comEnv = await doPrincipal()
        conferir(
          'arquivo com cara de segredo não entra na lista',
          !!comEnv && !comEnv.arquivos.some((a) => a.caminho.endsWith('.env')) && (await visores()).length === 1,
          nomes(comEnv)
        )

        // visor aberto, nos dois temas (a lista à esquerda, o arquivo à direita)
        const temaInicial = await js<string>(`window.__teste.loja.lerEstado().preferencias.tema`)
        await irPara(idCodigo)
        await js(`window.__teste.loja.definirTema('claro')`)
        await esperar(500)
        await print('codigo-visor-claro')
        await js(`window.__teste.loja.definirTema('escuro')`)
        await esperar(500)
        await print('codigo-visor-escuro')
        await js(`window.__teste.loja.definirTema(${JSON.stringify(temaInicial)})`)
        await esperar(300)

        // clicar num arquivo antigo FIXA o visor nele; chegada nova só marca o topo com o ponto "novo"
        const clicouAntigo = await clicarEm(`[data-no-id="${idCodigo}"] .codigo-item[title$="exemplo.ts"]`)
        await esperar(400)
        const fixo = await doPrincipal()
        conferir(
          'clicar num arquivo antigo fixa o visor nele',
          clicouAntigo && fixo?.seguindo === false && ultimoNome(fixo.caminho) === 'exemplo.ts',
          `seguindo ${fixo?.seguindo} · mostra ${ultimoNome(fixo?.caminho ?? '')}`
        )
        await gravar('novo-fixo.ts', 'const fixo = 1', 'FIM-FIXO')
        await esperar(2800) // mais que a espera de 2 s: se fosse trocar, já teria trocado
        const aindaFixo = await doPrincipal()
        const pontos = await js<number>(`document.querySelectorAll('[data-no-id="${idCodigo}"] .codigo-novo').length`)
        conferir(
          'fixo: arquivo novo entra no topo mas a tela não troca, e o ponto "novo" aparece',
          ultimoNome(aindaFixo?.arquivos[0]?.caminho ?? '') === 'novo-fixo.ts' && ultimoNome(aindaFixo?.caminho ?? '') === 'exemplo.ts' && pontos === 1,
          `topo ${ultimoNome(aindaFixo?.arquivos[0]?.caminho ?? '')} · mostra ${ultimoNome(aindaFixo?.caminho ?? '')} · pontos ${pontos}`
        )
        await print('codigo-visor-fixo')
        const clicouSeguir = await clicarEm(`[data-no-id="${idCodigo}"] button.codigo-seguir`)
        await esperar(500)
        const seguiu = await doPrincipal()
        const pontosDepois = await js<number>(`document.querySelectorAll('[data-no-id="${idCodigo}"] .codigo-novo').length`)
        conferir(
          'o botão de seguir volta ao arquivo mais novo e some o ponto',
          clicouSeguir && seguiu?.seguindo === true && ultimoNome(seguiu.caminho) === 'novo-fixo.ts' && pontosDepois === 0,
          `seguindo ${seguiu?.seguindo} · mostra ${ultimoNome(seguiu?.caminho ?? '')} · pontos ${pontosDepois}`
        )

        // recolher pelo botão do visor: encolhe de verdade e diz quantos arquivos tem; abrir devolve o tamanho
        const botaoRecolher = await clicarEm(`[data-no-id="${idCodigo}"] button[title^="Recolher"]`)
        await esperar(400)
        const recolhido = (await doPrincipal())!
        const textoRecolhido = await noCartao('.cartao-ferramenta')
        conferir(
          'recolher encolhe o visor num bloquinho com a contagem de arquivos',
          botaoRecolher && recolhido.recolhido && recolhido.altura === 30 && recolhido.largura === 300 && new RegExp(`${recolhido.arquivos.length} arquivos`).test(textoRecolhido),
          `${recolhido.largura}x${recolhido.altura} · ${textoRecolhido.replace(/\s+/g, ' ').trim()}`
        )
        const botaoAbrir = await clicarEm(`[data-no-id="${idCodigo}"] button[title^="Abrir"]`)
        await esperar(400)
        const aberto = (await doPrincipal())!
        conferir('abrir devolve o visor ao tamanho aberto', botaoAbrir && !aberto.recolhido && aberto.largura === 860 && aberto.altura === 460, `${aberto.largura}x${aberto.altura}`)

        // o "node" do agente: recolher todos e abrir todos de uma vez
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', true)`)
        await esperar(400)
        const todosBloquinho = (await visores()).every((c) => c.recolhido)
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', false)`)
        await esperar(400)
        const todosAbertos = (await visores()).every((c) => !c.recolhido)
        conferir('recolher todos e abrir todos, pelo agente', todosBloquinho && todosAbertos, `recolheu ${todosBloquinho} · abriu ${todosAbertos}`)

        // mapa mental: com o visor aberto, ele empurra o que estiver embaixo em vez de passar por cima
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
        conferir('com o visor aberto, ele não cobre outra peça do quadro', sobrepostos.length === 0, sobrepostos.join(' | ') || 'nada se cobre')

        // a bolinha onde as ligações se separam: um clique nela recolhe o visor daquele agente
        await irPara(dono)
        const clicouBolinha = await clicarEm('.vinculo-toque')
        await esperar(500)
        const pelaBolinha = (await visores()).every((c) => c.recolhido)
        conferir('a bolinha das ligações recolhe o visor do agente', clicouBolinha && pelaBolinha, `clicou ${clicouBolinha} · recolhidos ${pelaBolinha}`)
        // de longe, para o print mostrar o agente e o visor recolhido ao lado dele
        await js(`(() => { const L = window.__teste.loja; const n = L.acharNo(${JSON.stringify(dono)})
          L.definirCamera({ x: -n.x * 0.6 + 340, y: -n.y * 0.6 + 60, zoom: 0.6 }) })()`)
        await esperar(500)
        await print('codigo-mapa-mental')
        await irPara(dono)
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', false)`)
        await esperar(400)

        // arrastar pela bolinha leva o visor, e ele continua sendo arrumado pelo app
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
        const desloc = await js<{ x: number; y: number } | null>(`window.__teste.loja.acharNo('${dono}')?.codigoDesloc ?? null`)
        conferir(
          'arrastar pela bolinha leva o visor junto, sem tirá-lo das mãos do app',
          !!bolinha && desceu && Math.abs((desloc?.y ?? 0) - 120) <= 12,
          `desceu ${desceu} · deslocamento ${JSON.stringify(desloc)} · antes ${JSON.stringify(antesDoArrasto)} · depois ${JSON.stringify(depoisDoArrasto)} · bolinha ${JSON.stringify(bolinha)}`
        )

        // e arrastar o agente leva o visor dele junto, como o ramo vai com o nó que o segura
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
          'arrastar o agente leva o visor dele junto',
          !!cabecalhoDoDono && foiJunto,
          depoisDoAgente.map((c) => `${c.x},${c.y}${c.automatico ? '' : ' (solto)'}`).join(' | ')
        )

        // longe da coluna é saída de propósito — mas o visor continua sendo do agente e recebendo arquivos
        await irPara(idCodigo)
        const pegadaLonge = await centroDe(`[data-no-id="${idCodigo}"] .cartao-ferramenta-cabecalho`)
        if (pegadaLonge) await arrastar(pegadaLonge, { x: pegadaLonge.x + 420, y: pegadaLonge.y + 40 })
        await esperar(600)
        const solto = (await visores())[0]
        await gravar('longe.ts', 'const longe = 1', 'FIM-LONGE')
        const recebeuLonge = await esperarLista((v) => !!v && v.arquivos.some((a) => a.caminho.endsWith('longe.ts')))
        const unicoVisor = (await visores()).length === 1
        conferir(
          'visor arrastado para longe continua recebendo, sem nascer um segundo',
          solto?.automatico === false && !!recebeuLonge && unicoVisor,
          `solto ${solto?.automatico === false} · lista: ${nomes(recebeuLonge)} · visores ${unicoVisor ? 1 : 'mais de 1'}`
        )
        // e, enquanto estiver fora, a coluna não o empurra: antes ele descia um pouco a cada rearranjo
        const ondeSolto = (await visores())[0]?.y ?? 0
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', true)`)
        await esperar(300)
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', false)`)
        await esperar(500)
        const depoisDeRearranjar = (await visores())[0]
        conferir('visor fora da coluna não leva empurrão a cada rearranjo', depoisDeRearranjar?.y === ondeSolto, `${ondeSolto} → ${depoisDeRearranjar?.y}`)
        await js(`window.__teste.loja.juntarCodigosDoTerminal('${dono}')`)
        await esperar(500)
        const devolvido = (await visores())[0]
        conferir('o menu do agente traz o visor solto de volta à coluna', devolvido?.automatico === true, `devolvido ${devolvido?.automatico === true}`)

        // com git, o visor mostra o diff de verdade — é o caso principal, e sem repositório ele nunca roda
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
        await gravar('exemplo.ts', 'const um = 111', 'FIM-GRAVOU-DIFF')
        const comDiff = await aguardar(() => corpo(), 'const um = 111', 15_000)
        const linhasDoDiff = await js<{ mais: number; menos: number }>(`(() => {
          const corpo = document.querySelector('[data-no-id="${idCodigo}"] .codigo-corpo')
          return { mais: corpo?.querySelectorAll('.codigo-linha.mais').length ?? 0, menos: corpo?.querySelectorAll('.codigo-linha.menos').length ?? 0 }
        })()`)
        conferir(
          'com git, o visor mostra o diff: linha que entrou e linha que saiu',
          linhasDoDiff.mais === 1 && linhasDoDiff.menos === 1 && !comDiff.includes('pasta sem git'),
          `+${linhasDoDiff.mais} -${linhasDoDiff.menos} · ${ultimas(comDiff, 2)}`
        )
        await irPara(idCodigo)
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

        // o cartão de UM arquivo ("Ver o código no quadro", do explorador) é o de antes: sem lista, com o histórico
        const caminhoUm = `${pastaTerminais}${pastaTerminais.includes('/') ? '/' : '\\'}outro.ts`
        const idUm = await js<string>(`window.__teste.loja.adicionarNo({ tipo: 'codigo', caminho: ${JSON.stringify(caminhoUm)} }, 3000, 900)`)
        await esperar(800)
        const textoUm = await aguardar(() => noCartao('.codigo-corpo', idUm), 'const dois = 2', 10_000)
        const formaUm = await js<{ lista: number; historico: number; seguir: number; arquivos: boolean; largura: number; altura: number }>(`(() => {
          const raiz = document.querySelector('[data-no-id="${idUm}"]')
          const n = window.__teste.loja.acharNo('${idUm}')
          return { lista: raiz?.querySelectorAll('.codigo-lista').length ?? -1, historico: raiz?.querySelectorAll('button[title^="Arquivos mexidos"]').length ?? -1,
            seguir: raiz?.querySelectorAll('.codigo-seguir').length ?? -1, arquivos: Array.isArray(n?.arquivos), largura: n?.largura, altura: n?.altura } })()`)
        conferir(
          'cartão de um arquivo do explorador é o de antes: sem lista, com o botão de histórico',
          textoUm.includes('const dois = 2') && formaUm.lista === 0 && formaUm.historico === 1 && formaUm.seguir === 0 && !formaUm.arquivos && formaUm.largura === 620 && formaUm.altura === 460,
          JSON.stringify(formaUm)
        )
        await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${idUm}' })`)
        await esperar(300)

        // fechar o visor (a lixeira) fecha só ele: o próximo arquivo que o agente mexer faz nascer outro
        await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${idCodigo}' })`)
        await esperar(300)
        await gravar('terceiro.ts', 'const tres = 3', 'FIM-GRAVOU3')
        const depoisDeFecharUm = await esperarLista((v) => !!v && v.arquivos.some((a) => a.caminho.endsWith('terceiro.ts')))
        conferir(
          'fechar o visor não para o automático; o arquivo seguinte faz nascer outro',
          !!depoisDeFecharUm && depoisDeFecharUm.id !== idCodigo && (await visores()).length === 1,
          nomes(depoisDeFecharUm)
        )

        // "fechar todos" é o gesto de parar: apaga o visor e desliga o automático da pasta
        await js(`window.__teste.loja.fecharCodigosDoTerminal('${dono}')`)
        await esperar(400)
        const desligou = await js<boolean>(`window.__teste.loja.acharNo('${dono}')?.codigoSozinho === false`)
        await gravar('quarto.ts', 'const quatro = 4', 'FIM-GRAVOU4')
        await esperar(1500)
        const quantos = (await visores()).length
        conferir('fechar todos desliga o automático da pasta: nenhum visor nasce', desligou && quantos === 0, `desligou ${desligou} · visores ${quantos}`)

        // religa o automático: o visor nasce de novo no primeiro arquivo
        await js(`window.__teste.loja.alternarCodigoSozinho('${dono}')`)
        await esperar(300)
        await gravar('quinto.ts', 'const cinco = 5', 'FIM-GRAVOU5')
        const renasceu = await esperarLista((v) => !!v && v.arquivos.some((a) => a.caminho.endsWith('quinto.ts')))
        conferir('religado o automático, o visor nasce no primeiro arquivo gravado', !!renasceu && (await visores()).length === 1, nomes(renasceu))
        // desligado com o visor já aberto, ele continua recebendo (o desligar só impede o visor de nascer)
        await js(`window.__teste.loja.alternarCodigoSozinho('${dono}')`)
        await esperar(300)
        await gravar('sexto.ts', 'const seis = 6', 'FIM-GRAVOU6')
        const recebeuDesligado = await esperarLista((v) => !!v && v.arquivos.some((a) => a.caminho.endsWith('sexto.ts')))
        conferir(
          'com o automático desligado, o visor que já existe continua recebendo',
          !!recebeuDesligado && (await visores()).length === 1,
          nomes(recebeuDesligado)
        )
        await js(`window.__teste.loja.alternarCodigoSozinho('${dono}')`)
        await esperar(300)

        // arquivo apagado: continua na lista, riscado e marcado "apagado"; o corpo diz que o arquivo sumiu
        await gravar('setimo.ts', 'const sete = 7', 'FIM-GRAVOU7')
        const comSetimo = await esperarLista((v) => !!v && ultimoNome(v.caminho) === 'setimo.ts', 8000)
        const idVisor = comSetimo?.id ?? ''
        await comandoAte(chefe, 'Remove-Item setimo.ts; if (Test-Path setimo.ts) { echo AINDA } else { echo SUMIU }', /^SUMIU/m, 15_000)
        const marcou = await esperarLista((v) => !!v && !!v.arquivos.find((a) => a.caminho.endsWith('setimo.ts'))?.sumiu, 8000)
        const recado = await aguardar(() => noCartao('.codigo-aviso', idVisor), /apagado|não encontrado/, 8000)
        const riscado = await js<string>(
          `(() => { const el = document.querySelector('[data-no-id="${idVisor}"] .codigo-item.sumiu .codigo-item-nome'); return el ? getComputedStyle(el).textDecorationLine : '' })()`
        )
        const idade = await noCartao('.codigo-item.sumiu .codigo-item-idade', idVisor)
        conferir(
          'arquivo apagado: fica na lista, riscado e com a marca "apagado", e o corpo avisa',
          !!marcou?.arquivos.some((a) => a.caminho.endsWith('setimo.ts') && a.sumiu) && riscado.includes('line-through') && /apagado/.test(idade) && /apagado|não encontrado/.test(recado),
          `riscado "${riscado}" · idade "${idade}" · aviso "${recado}"`
        )
        // o arquivo que volta a existir sai do estado "apagado" (a entrada velha sai e a nova entra no topo)
        await gravar('setimo.ts', 'const sete = 77', 'FIM-VOLTOU7')
        const voltou = await esperarLista((v) => !!v && v.arquivos.some((a) => a.caminho.endsWith('setimo.ts') && !a.sumiu))
        conferir('o arquivo que volta a existir sai do estado "apagado"', !!voltou && voltou.arquivos.filter((a) => a.caminho.endsWith('setimo.ts')).length === 1, nomes(voltou))

        // árvores de código: o agente separa os arquivos por frente de trabalho e fala delas pelo nome
        const listou = await comandoAte(chefe, 'ork arvore', /principal/m, 15_000)
        conferir('ork arvore lista as árvores do agente', /"principal"/.test(listou), ultimas(listou, 3))

        // árvore nova = visor novo, vazio
        const antesDaArvore = (await doPrincipal())?.arquivos.length ?? 0
        await comandoAte(chefe, 'ork arvore nova "Backend"', /^Árvore "Backend" pronta/m, 15_000)
        await esperar(500)
        const doBackend = async (): Promise<Visor | undefined> => (await visores()).find((v) => v.arvore && v.arvore !== 'principal')
        const vazio = await doBackend()
        conferir(
          'ork arvore nova cria um visor vazio ao lado do principal',
          !!vazio && vazio.arquivos.length === 0 && (await visores()).length === 2,
          `visores ${(await visores()).length} · Backend com ${vazio?.arquivos.length ?? '?'} arquivos`
        )
        const textoVazio = vazio ? await noCartao('.codigo-corpo', vazio.id) : ''
        conferir('o visor vazio diz que ainda não há arquivo', /Nenhum arquivo ainda/.test(textoVazio), textoVazio.replace(/\s+/g, ' ').trim())
        if (vazio) await irPara(vazio.id)
        await print('codigo-visor-vazio')

        await gravar('oitavo.ts', 'const oito = 8', 'FIM-GRAVOU8')
        const comBackend = await (async () => {
          for (const limite = Date.now() + 12_000; Date.now() < limite; await esperar(150)) {
            const v = await doBackend()
            if (v?.arquivos.some((a) => a.caminho.endsWith('oitavo.ts'))) return v
          }
          return doBackend()
        })()
        const principalDepois = await doPrincipal()
        conferir(
          'arquivo novo entra no visor da árvore em uso; o principal não mexe',
          !!comBackend?.arquivos.some((a) => a.caminho.endsWith('oitavo.ts')) &&
            !principalDepois?.arquivos.some((a) => a.caminho.endsWith('oitavo.ts')) &&
            principalDepois?.arquivos.length === antesDaArvore,
          `Backend: ${nomes(comBackend)} · principal: ${principalDepois?.arquivos.length} arquivos (eram ${antesDaArvore})`
        )
        const bolinhas = await js<number>(`document.querySelectorAll('.vinculo-bolinha').length`)
        const nomeNaTela = await js<string>(`[...document.querySelectorAll('.vinculo-nome')].map((n) => n.textContent).join(' | ')`)
        conferir('cada árvore tem a sua bolinha, e a nova mostra o nome', bolinhas >= 2 && nomeNaTela.includes('Backend'), `${bolinhas} bolinha(s) · nomes: ${nomeNaTela || 'nenhum'}`)
        // de longe, para o print mostrar os dois visores inteiros, com as bolinhas e os nomes
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
        conferir('com duas árvores, nenhum visor cobre o outro', seCobrem === 0, `${seCobrem} par(es) se cobrindo`)

        // mostrar traz um arquivo que já estava numa lista para a árvore pedida, sem repetir entre as árvores
        await comandoAte(chefe, 'ork arvore mostrar sexto.ts --arvore "Backend"', /^Mostrei 1 arquivo/m, 15_000)
        await esperar(800)
        const depoisDeMostrar = await visores()
        const comSexto = depoisDeMostrar.filter((v) => v.arquivos.some((a) => a.caminho.endsWith('sexto.ts')))
        conferir(
          'ork arvore mostrar leva o arquivo para a árvore, sem repetir nas listas',
          comSexto.length === 1 && !ehPrincipal(comSexto[0]!) && ultimoNome(comSexto[0]!.arquivos[0]?.caminho ?? '') === 'sexto.ts',
          depoisDeMostrar.map((v) => `${ehPrincipal(v) ? 'principal' : v.arvore}: ${nomes(v)}`).join(' | ')
        )

        // Entregar arquivos a outro agente: eles saem da lista de quem deu e entram no topo do principal do outro.
        // É o conserto para o dono ter sido palpitado errado — num time na mesma pasta, o app não sabe quem
        // gravou, e em 10/11/2026 todos os arquivos de quatro agentes foram parar na coluna de um só.
        // o nome do cartão vem do preset (o `adicionarNo` não aceita nome), então o teste pergunta qual é
        const vizinho = await js<{ id: string; nome: string }>(`(() => { const L = window.__teste.loja
          const presets = L.lerEstado().preferencias.presets
          const id = L.adicionarNo({ tipo: 'terminal', preset: presets.find((p) => p.agente === 'shell') }, 3000, 1400)
          return { id, nome: L.acharNo(id).nome } })()`)
        await esperar(400)
        // Sem corda, recusa: entregar mexe na lista do outro, e desde a 1.0.10 isso segue a regra da corda.
        const semCorda = await comandoAte(chefe, `cls; ork arvore dar "${vizinho.nome}" sexto.ts`, /Entreguei|alcance|ork:/, 15_000)
        conferir('ork arvore dar recusa entregar a quem não está na sua corda', /não está ao seu alcance/.test(semCorda), ultimas(semCorda, 2))
        await js(`window.__teste.loja.ligar(${JSON.stringify(chefe)}, ${JSON.stringify(vizinho.id)})`)
        await esperar(300)
        const entrega = await comandoAte(chefe, `cls; ork arvore dar "${vizinho.nome}" sexto.ts`, /Entreguei|não|ork:/, 15_000)
        await esperar(800)
        const depoisDeDar = await visores()
        const doVizinho = depoisDeDar.filter((v) => v.terminal === vizinho.id)
        const nosDele = depoisDeDar.filter((v) => v.terminal === dono && v.arquivos.some((a) => a.caminho.endsWith('sexto.ts')))
        conferir(
          'ork arvore dar passa o arquivo para o visor principal do outro agente e o tira de quem deu',
          /Entreguei/.test(entrega) &&
            doVizinho.length === 1 &&
            ehPrincipal(doVizinho[0]!) &&
            ultimoNome(doVizinho[0]!.arquivos[0]?.caminho ?? '') === 'sexto.ts' &&
            nosDele.length === 0,
          `vizinho: ${nomes(doVizinho[0])} · ainda com quem deu: ${nosDele.length} · ${ultimas(entrega, 2)}`
        )
        const repetido = depoisDeDar.filter((v) => v.arquivos.some((a) => a.caminho.endsWith('sexto.ts'))).length
        conferir('o arquivo entregue não fica repetido em nenhuma outra lista', repetido === 1, `${repetido} lista(s) com sexto.ts`)

        // a pasta do usuário não é vigiada (senão vira lista de tudo que o PC grava); a do projeto é
        const podeProjeto = await js<boolean>(`window.ork.codigo.vigiavel(${JSON.stringify(pastaTerminais)})`)
        const podeCasa = await js<boolean>(`window.ork.codigo.vigiavel(${JSON.stringify(process.env.USERPROFILE ?? homedir())})`)
        conferir('a pasta do usuário não é vigiada; a do projeto é', podeProjeto === true && podeCasa === false, `projeto ${podeProjeto} · casa ${podeCasa}`)
      }
    },
]
