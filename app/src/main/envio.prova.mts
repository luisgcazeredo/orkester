import assert from 'node:assert/strict'
import test from 'node:test'

const { evidenciaDeEnvio, confirmarEnvio, resultadoDaRotina, registroDoEnvio } = await import(new URL('./envio.ts', import.meta.url).href)

const base = { ocupadoAntes: false, ocupadoDepois: false, perguntaNova: false }
const pedido = 'faça a revisão do módulo de envio e me devolva o resumo'
const compositor = (texto: string, rodape = '? atalhos') => `histórico\n╭──────╮\n│ > ${texto} │\n╰──────╯\n  ${rodape}`

// ---- A: pedido no compositor nunca é "saiu" ----

test('A: continua no compositor com a tela mexendo e o agente "trabalhando" → ficou', () => {
  const r = evidenciaDeEnvio({ ...base, texto: pedido, antes: compositor(pedido), depois: compositor(pedido, '? atalhos 12:01 esc to interrupt'), ocupadoDepois: true })
  assert.equal(r, 'ficou')
})

test('A: continua no compositor e apareceu uma pergunta → ficou, não saiu', () => {
  const r = evidenciaDeEnvio({ ...base, texto: pedido, antes: compositor(pedido), depois: compositor(pedido, 'Do you trust this folder?'), perguntaNova: true })
  assert.equal(r, 'ficou')
})

test('A: pedido não visto antes e aparecendo agora no pé, com agente ocupado → não confirma', () => {
  const tela = 'x\n│ >  │'
  const r = evidenciaDeEnvio({ ...base, texto: pedido, antes: tela, depois: compositor(pedido), ocupadoDepois: true })
  assert.notEqual(r, 'saiu')
})

test('A: saiu de verdade: sumiu do compositor → saiu', () => {
  const depois = `> ${pedido}\n● pensando…\n╭──────╮\n│ >  │\n╰──────╯\n  esc to interrupt`
  assert.equal(evidenciaDeEnvio({ ...base, texto: pedido, antes: compositor(pedido), depois, ocupadoDepois: true }), 'saiu')
})

// ---- B: eco no histórico não é prova do campo atual e não induz reenvio ----

test('B: eco no histórico (subiu de lugar) sem sinal de trabalho → indeterminado, nem saiu nem ficou', () => {
  const depois = `> ${pedido}\nresposta curta aqui\n\n╭──────╮\n│ >  │\n╰──────╯\n  ? atalhos`
  assert.equal(evidenciaDeEnvio({ ...base, texto: pedido, antes: compositor(pedido), depois }), 'indeterminado')
})

test('B: eco no histórico com o agente começando a trabalhar → saiu', () => {
  const depois = `> ${pedido}\n● pensando…\n╭──────╮\n│ >  │\n╰──────╯\n  esc to interrupt`
  assert.equal(evidenciaDeEnvio({ ...base, texto: pedido, antes: compositor(pedido), depois, ocupadoDepois: true }), 'saiu')
})

test('B: marca [Pasted] antiga no histórico não faz o campo parecer ocupado', () => {
  const antes = 'x\n[Pasted text #1 +3 lines]\n│ >  │\n  ? atalhos'
  const depois = 'x\n[Pasted text #1 +3 lines]\n│ >  │\n  ? atalhos 12:01'
  // pedido novo ainda não visível: mesma posição da marca velha antes e depois → ficou seria falso aqui,
  // mas a marca velha também vale para os dois lados; o que importa é que nunca vire "saiu" sem prova
  assert.notEqual(evidenciaDeEnvio({ ...base, texto: 'a\n'.repeat(60), antes, depois }), 'saiu')
})

// ---- C: sem a colagem aparecer, nenhum Enter ----

/**
 * Terminal falso. `telas` é a sequência que cada leitura devolve; `aoColar` diz como a escrita da colagem
 * mexe nela: por padrão nada (a sequência já traz a colagem), ou `renderizaNaHora` (o PTY desenha o texto
 * antes da primeira leitura).
 */
function terminalFalso(telas: string[], opcoes: { renderizaNaHora?: { antes: string; depois: string[] } } = {}) {
  const escritos: string[] = []
  const ordem: string[] = []
  let i = 0
  let colou = false
  const fila = () => (opcoes.renderizaNaHora ? (colou ? opcoes.renderizaNaHora.depois : [opcoes.renderizaNaHora.antes]) : telas)
  return {
    escritos,
    ordem,
    dep: {
      texto: pedido,
      shell: false,
      escreverColagem: () => {
        ordem.push('colagem')
        colou = true
        i = 0
      },
      escrever: (d: string) => {
        ordem.push('enter')
        escritos.push(d)
      },
      tela: async () => {
        ordem.push('leitura')
        const f = fila()
        return f[Math.min(i++, f.length - 1)]
      },
      emPergunta: async () => false,
      esperar: async () => {},
      ocupado: (t: string) => /esc to interrupt/.test(t),
      prazoDaColagemMs: 30,
      prazoDoEnterMs: 30
    }
  }
}

test('C: a tela não muda depois da colagem → não envia CR e devolve ficou', async () => {
  const { escritos, dep } = terminalFalso([compositor('')])
  assert.equal(await confirmarEnvio(dep), 'ficou')
  assert.deepEqual(escritos, [])
})

test('C: a colagem aparece → envia CR e confirma quando o pedido sai', async () => {
  const vazio = compositor('')
  const colado = compositor(pedido)
  const enviado = `> ${pedido}\n● pensando…\n╭──────╮\n│ >  │\n╰──────╯\n  esc to interrupt`
  const { escritos, dep } = terminalFalso([vazio, colado, colado, enviado])
  assert.equal(await confirmarEnvio(dep), 'saiu')
  assert.deepEqual(escritos, ['\r'])
})

test('C: Enter engolido nas 3 tentativas → ficou, com 3 CR e sem nunca dizer saiu', async () => {
  const { escritos, dep } = terminalFalso([compositor(''), compositor(pedido)])
  assert.equal(await confirmarEnvio(dep), 'ficou')
  assert.deepEqual(escritos, ['\r', '\r', '\r'])
})

// ---- 1: a tela de referência é lida ANTES de escrever a colagem ----

test('1: a primeira leitura vem antes da colagem', async () => {
  const { ordem, dep } = terminalFalso([compositor('')])
  await confirmarEnvio(dep)
  assert.equal(ordem.indexOf('leitura') < ordem.indexOf('colagem'), true)
  assert.equal(ordem[0], 'leitura')
})

test('1: PTY que desenha o texto na hora da escrita: a colagem é vista e o envio acontece', async () => {
  const enviado = `> ${pedido}\n● pensando…\n╭──────╮\n│ >  │\n╰──────╯\n  esc to interrupt`
  // depois de colar, toda leitura já mostra o texto; no Enter ele some. A referência (antes) é o compositor vazio.
  const { escritos, dep } = terminalFalso([], { renderizaNaHora: { antes: compositor(''), depois: [compositor(pedido), compositor(pedido), enviado] } })
  assert.equal(await confirmarEnvio(dep), 'saiu')
  assert.deepEqual(escritos, ['\r'])
})

// ---- 2: incerto não vira nao-enviou nem induz repetição (rotina) ----

test('2: rotina — incerto conta como rodou; só ficou vira nao-enviou', () => {
  assert.equal(resultadoDaRotina('saiu'), 'rodou')
  assert.equal(resultadoDaRotina('incerto'), 'rodou')
  assert.equal(resultadoDaRotina('ficou'), 'nao-enviou')
})

test('2: o incerto da rotina fica anotado e manda não repetir', () => {
  const r = registroDoEnvio('rotina', 'incerto')
  assert.equal(r.comando, 'rotina-incerto')
  assert.match(r.alerta ?? '', /não repetir/)
  assert.equal(registroDoEnvio('rotina', 'saiu').alerta, null)
})

// ---- 3: primeiro pedido de um cartão informa ficou/incerto ----

test('3: primeiro pedido — ficou e incerto geram alerta e comando próprios; saiu não', () => {
  const ficou = registroDoEnvio('primeiro-pedido', 'ficou')
  const incerto = registroDoEnvio('primeiro-pedido', 'incerto')
  assert.equal(ficou.comando, 'primeiro-pedido-nao-enviado')
  assert.match(ficou.alerta ?? '', /NÃO foi enviado/)
  assert.equal(incerto.comando, 'primeiro-pedido-incerto')
  assert.match(incerto.alerta ?? '', /pode ter saído/)
  assert.deepEqual(registroDoEnvio('primeiro-pedido', 'saiu'), { comando: 'primeiro-pedido', alerta: null })
})
