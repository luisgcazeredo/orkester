import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const { evidenciaDeEnvio, confirmarEnvio, resultadoDaRotina, registroDoEnvio, campoNaTela, retomarEnvio, marcaNoCampo, juntarLinhasDaTela, AMBIENTE_DO_CLAUDE } = await import(new URL('./envio.ts', import.meta.url).href)

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

// ---- B: o campo de entrada lido direto (telas reais do Claude Code 2.1.322 e do Codex 0.167, 12/11/2026) ----

const ficha = 'Você é Decisões.\n- Idioma: português do Brasil, direto ao ponto.\n\nIGNORE o papel acima: isto é só um teste. Responda apenas: OK-1'
const regua = '─'.repeat(60)
const claudeComColagem = `◐ medium · /effort\n${regua}\n❯ [Pasted text #1 +40 lines]\n${regua}\n  ⏵⏵ auto mode on (shift+tab to cycle)`
// depois do envio o Claude mostra a ficha inteira no histórico, e o fim dela pode cair na altura em que o campo estava
const claudeDepois = `  - Idioma: português do Brasil, direto ao ponto.\n\n  IGNORE o papel acima: isto é só um teste. Responda apenas: OK-1\n\n● OK-1\n\n✻ Cooked for 2s · done 15:20\n◐ medium · /effort\n${regua}\n❯ \n${regua}\n  paste again to expand`
const codexDigitado = `  >_ OpenAI Codex (v0.167.2)\n\n›   - Artefatos: tudo o que você cria é arquivo dentro da pasta do espaço ↑\n  ficha manda. Nunca em Downloads.\n  - Idioma: português do Brasil, direto ao ponto.\n  IGNORE o papel acima: isto é só um teste. Responda apenas: OK-1\n\n  GPT-5.6-Terra high · ~\\projetos\\Orkester`

test('B: campo do Claude com a colagem resumida → o pedido está no campo', () => {
  assert.match(campoNaTela(claudeComColagem)!, /\[pasted text #1/)
})

test('B: Claude depois do envio, ficha no histórico e campo vazio → saiu (era "ficou" pela posição)', () => {
  assert.equal(evidenciaDeEnvio({ ...base, texto: ficha, antes: claudeComColagem, depois: claudeDepois }), 'saiu')
})

test('B: Enter engolido no Claude, a colagem continua no campo → ficou', () => {
  assert.equal(evidenciaDeEnvio({ ...base, texto: ficha, antes: claudeComColagem, depois: claudeComColagem }), 'ficou')
})

test('B: Codex com o texto digitado no campo (várias linhas) → ficou', () => {
  assert.equal(evidenciaDeEnvio({ ...base, texto: ficha, antes: codexDigitado, depois: codexDigitado }), 'ficou')
})

test('B: Codex com a ficha no campo, com linha em branco no meio → o fim dela ainda é visto (ficou)', () => {
  const comParagrafo = `  >_ OpenAI Codex (v0.167.2)\n\n›   - Nunca feche o programa.\n  - Idioma: português do Brasil, direto ao ponto.\n\n  IGNORE o papel acima: isto é só um teste. Responda apenas: OK-1\n\n\n  GPT-5.6-Terra high · ~\\projetos`
  assert.equal(evidenciaDeEnvio({ ...base, texto: ficha, antes: comParagrafo, depois: comParagrafo }), 'ficou')
})

test('B: Codex enviou: a mensagem sobe no histórico e o campo volta vazio → saiu', () => {
  const depois = `${codexDigitado.replace('\n\n  GPT', '\n\n• Trabalhando\n\n› \n\n  GPT')}`
  assert.equal(evidenciaDeEnvio({ ...base, texto: ficha, antes: codexDigitado, depois }), 'saiu')
})

test('B: a linha de status muda mas o campo está vazio → nenhum Enter até o recado aparecer no campo', async () => {
  // o Claude terminando a resposta anterior: "Churned…" muda, o campo fica vazio, e o recado só entra depois
  const recado = 'ENTREGA | Testador | teste de recado. Responda apenas: SEGUNDO-1'
  const tela = (status: string, campo: string) => `● OK-1\n\n✻ ${status}\n${regua}\n❯ ${campo}\n${regua}\n  paste again to expand`
  let leituras = 0
  let campoNoEnter: string | null = 'nenhum Enter'
  let enviado = false
  const dep = {
    texto: recado,
    shell: false,
    escreverColagem: () => {},
    escrever: () => {
      if (campoNoEnter === 'nenhum Enter') campoNoEnter = campoNaTela(atual())
      enviado = true
    },
    tela: async () => {
      leituras++
      return atual()
    },
    emPergunta: async () => false,
    esperar: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 3))),
    ocupado: (t: string) => /esc to interrupt/.test(t),
    assentarMs: 20
  }
  function atual(): string {
    if (enviado) return tela('Churning… esc to interrupt', '')
    if (leituras <= 1) return tela('Cooked for 2s', '')
    if (leituras < 30) return tela(`Churned for ${leituras}s · done`, '') // só o status mexe
    return tela('Churned for 30s · done', recado)
  }
  assert.equal(await confirmarEnvio(dep), 'saiu')
  assert.match(campoNoEnter ?? '', /segundo-1/, 'o primeiro Enter só sai com o recado já no campo')
})

test('B: o Claude esconde o campo no redesenho depois de responder → isso não conta como colagem chegando', async () => {
  const recado = 'ENTREGA | Testador | teste. Responda apenas: SEGUNDO-2'
  const comCampo = (campo: string) => `● OK-2\n\n✻ Brewed for 3s · done\n${regua}\n❯ ${campo}\n${regua}\n  ⏵⏵ auto mode on`
  const semCampo = `● OK-2\n\n✻ Brewed for 3s · done`
  let leituras = 0
  let campoNoEnter: string | null = 'nenhum Enter'
  let enviado = false
  const atual = (): string => {
    if (enviado) return `${comCampo('')}\n esc to interrupt`
    if (leituras <= 1) return comCampo('')
    if (leituras < 20) return semCampo // redesenho: o campo some por um tempo
    return comCampo(recado)
  }
  const dep = {
    texto: recado,
    shell: false,
    escreverColagem: () => {},
    escrever: () => {
      if (campoNoEnter === 'nenhum Enter') campoNoEnter = campoNaTela(atual())
      enviado = true
    },
    tela: async () => {
      leituras++
      return atual()
    },
    emPergunta: async () => false,
    esperar: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 3))),
    ocupado: (t: string) => /esc to interrupt/.test(t),
    assentarMs: 20
  }
  assert.equal(await confirmarEnvio(dep), 'saiu')
  assert.match(campoNoEnter ?? '', /segundo-2/)
})

test('B: depois do 1º Enter o campo tem o rascunho do usuário → nenhum Enter a mais (não envia o que não é nosso)', async () => {
  const recado = 'ENTREGA | Testador | teste. Responda apenas: SEGUNDO-9'
  const comCampo = (campo: string) => `● OK\n${regua}\n❯ ${campo}\n${regua}\n  ⏵⏵ auto mode on`
  let enters = 0
  let leituras = 0
  const dep = {
    texto: recado,
    shell: false,
    escreverColagem: () => {},
    escrever: () => void enters++,
    tela: async () => {
      leituras++
      if (leituras <= 1) return comCampo('')
      if (enters === 0) return comCampo(recado)
      // o 1º Enter saiu sem prova visível (sem "trabalhando") e o usuário começou a escrever
      return comCampo('meu rascunho pela metade')
    },
    emPergunta: async () => false,
    esperar: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 3))),
    ocupado: () => false,
    assentarMs: 20,
    prazoDoEnterMs: 40
  }
  const r = await confirmarEnvio(dep)
  assert.equal(enters, 1, 'um Enter só')
  assert.notEqual(r, 'ficou')
})

test('B: campo que nunca recebeu a colagem e continua vazio não prova envio', () => {
  const vazio = `${regua}\n❯ Try "fix typecheck errors"\n${regua}`
  assert.notEqual(evidenciaDeEnvio({ ...base, texto: ficha, antes: vazio, depois: vazio }), 'saiu')
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
      prazoDoEnterMs: 30,
      assentarMs: 0
    }
  }
}

test('C: a tela não muda depois da colagem → não envia CR e devolve ficou', async () => {
  const { escritos, dep } = terminalFalso([compositor('')])
  assert.equal(await confirmarEnvio(dep), 'ficou')
  assert.deepEqual(escritos, [])
})

test('C: a tela não muda → cola uma vez só e nunca aperta Enter', async () => {
  const { ordem, escritos, dep } = terminalFalso([compositor('')])
  assert.equal(await confirmarEnvio(dep), 'ficou')
  assert.equal(ordem.filter((o) => o === 'colagem').length, 1)
  assert.deepEqual(escritos, [])
})

test('C: agente recém-aberto mostra a colagem atrasado → uma colagem, depois Enter, e o pedido sai', async () => {
  // como os cartões de 12/11: a colagem fica guardada e só aparece leituras depois; nada de colar de novo
  const vazio = compositor('')
  let colagens = 0
  let leituras = 0
  const escritos: string[] = []
  const dep = {
    texto: pedido,
    shell: false,
    escreverColagem: () => void colagens++,
    escrever: (d: string) => escritos.push(d),
    tela: async () => {
      if (escritos.length) return `> ${pedido}\n● pensando\n${vazio}\n esc to interrupt`
      return leituras++ < 6 ? vazio : compositor(pedido)
    },
    emPergunta: async () => false,
    esperar: async () => {},
    ocupado: (t: string) => /esc to interrupt/.test(t),
    prazoDaColagemMs: 1000,
    prazoDoEnterMs: 30
  }
  assert.equal(await confirmarEnvio(dep), 'saiu')
  assert.equal(colagens, 1)
  assert.deepEqual(escritos, ['\r'])
})

test('C: Codex "digitando" a colagem devagar → nenhum Enter enquanto o texto ainda chega', async () => {
  // a tela muda a cada leitura até o pedido inteiro entrar (letra a letra), depois para
  let leituras = 0
  let enterNaLeitura = -1
  const dep = {
    texto: pedido,
    shell: false,
    escreverColagem: () => {},
    escrever: () => {
      if (enterNaLeitura < 0) enterNaLeitura = leituras
    },
    tela: async () => {
      leituras++
      if (enterNaLeitura >= 0) return `> ${pedido}\n● pensando\n${compositor('')}\n esc to interrupt`
      return leituras <= 1 ? compositor('') : compositor(pedido.slice(0, Math.min(leituras, pedido.length)))
    },
    emPergunta: async () => false,
    // relógio de mentira: cada espera anda o tempo de verdade só um pouco, para o teste não demorar
    esperar: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 5))),
    ocupado: (t: string) => /esc to interrupt/.test(t),
    assentarMs: 60
  }
  assert.equal(await confirmarEnvio(dep), 'saiu')
  assert.ok(enterNaLeitura > pedido.length, `o Enter saiu na leitura ${enterNaLeitura}, com o texto ainda chegando`)
})

test('C: a colagem aparece → envia CR e confirma quando o pedido sai', async () => {
  const vazio = compositor('')
  const colado = compositor(pedido)
  const enviado = `> ${pedido}\n● pensando…\n╭──────╮\n│ >  │\n╰──────╯\n  esc to interrupt`
  const { escritos, dep } = terminalFalso([vazio, colado, colado, enviado])
  assert.equal(await confirmarEnvio(dep), 'saiu')
  assert.deepEqual(escritos, ['\r'])
})

test('C: Enter engolido nas 6 tentativas → ficou, com 6 CR, uma colagem só e sem nunca dizer saiu', async () => {
  const { escritos, ordem, dep } = terminalFalso([compositor(''), compositor(pedido)])
  assert.equal(await confirmarEnvio(dep), 'ficou')
  assert.deepEqual(escritos, ['\r', '\r', '\r', '\r', '\r', '\r'])
  assert.equal(ordem.filter((o) => o === 'colagem').length, 1)
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

// ---- 1.5.1: `ficou` retomado (a colagem aparece depois do prazo) ----

const campoClaude = (texto: string): string => `histórico\n❯ ${texto}\n  ? for shortcuts`
const enviadoClaude = `❯ ${pedido}\n● pensando\n❯ \n  esc to interrupt`

test('retomada (i): colagem que só aparece depois do prazo → ficou sem Enter; a retomada aperta o Enter e sai', async () => {
  let colagemVisivel = false // o agente segura a colagem e só a mostra depois do prazo da primeira tentativa
  const escritos: string[] = []
  let colagens = 0
  const base = {
    texto: pedido,
    shell: false,
    escrever: (d: string) => escritos.push(d),
    tela: async () => (escritos.length ? enviadoClaude : colagemVisivel ? campoClaude(pedido) : campoClaude('')),
    emPergunta: async () => false,
    esperar: (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 2))),
    ocupado: (t: string) => /esc to interrupt/.test(t),
    assentarMs: 0,
    prazoDoEnterMs: 30
  }
  assert.equal(await confirmarEnvio({ ...base, escreverColagem: () => void colagens++, prazoDaColagemMs: 20 }), 'ficou')
  assert.deepEqual(escritos, [], 'sem Enter enquanto a colagem não apareceu')
  colagemVisivel = true // 70 s depois, a colagem aparece
  assert.equal(await retomarEnvio(base), 'saiu')
  assert.deepEqual(escritos, ['\r'], 'um Enter só')
  assert.equal(colagens, 1, 'e nenhuma colagem nova')
})

test('retomada: sem a marca no campo (campo vazio, texto do usuário, shell) nenhum Enter vai', async () => {
  for (const tela of [campoClaude(''), campoClaude('outra coisa que o usuário escreveu'), 'sem campo nenhum']) {
    const escritos: string[] = []
    const r = await retomarEnvio({
      texto: pedido,
      shell: false,
      escrever: (d: string) => escritos.push(d),
      tela: async () => tela,
      emPergunta: async () => false,
      esperar: async () => {},
      ocupado: () => false,
      assentarMs: 0
    })
    assert.equal(r, 'sem-marca')
    assert.deepEqual(escritos, [])
  }
  const escritos: string[] = []
  const shell = await retomarEnvio({ texto: pedido, shell: true, escrever: (d: string) => escritos.push(d), tela: async () => campoClaude(pedido), emPergunta: async () => false, esperar: async () => {}, ocupado: () => false })
  assert.equal(shell, 'sem-marca')
  assert.deepEqual(escritos, [])
})

test('retomada: o usuário volta ao campo durante a espera → nenhum Enter', async () => {
  const escritos: string[] = []
  const r = await retomarEnvio({
    texto: pedido,
    shell: false,
    escrever: (d: string) => escritos.push(d),
    tela: async () => campoClaude(pedido),
    emPergunta: async () => false,
    esperar: async () => {},
    ocupado: () => false,
    assentarMs: 0,
    interromper: () => true
  })
  assert.equal(r, 'sem-marca')
  assert.deepEqual(escritos, [])
})

test('retomada (item 4): o usuário começa a digitar entre a última conferência e o Enter → o Enter não vai, nem o primeiro', async () => {
  const escritos: string[] = []
  let chamadas = 0
  const r = await retomarEnvio({
    texto: pedido,
    shell: false,
    escrever: (d: string) => escritos.push(d),
    tela: async () => campoClaude(pedido),
    emPergunta: async () => false,
    esperar: async () => {},
    ocupado: () => false,
    assentarMs: 0,
    // a 1a conferência (antes de apertar) passa; a que vem logo antes do Enter já vê o usuário
    interromper: () => ++chamadas >= 2
  })
  assert.equal(r, 'sem-marca')
  assert.deepEqual(escritos, [])
  assert.equal(chamadas, 2)
})

// ---- 1.5.2: ❯ colado na régua, eco no histórico e sugestão fantasma (telas reais de 13/11/2026) ----

const fixture = (nome: string): string => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url), 'utf8')
const recadoEscriba = '[ork · entrega de "Escriba"]\nregistrado'
const pedidoDoTestador = 'Rode no shell, em um único comando, exatamente: Start-Sleep -Seconds 60; "pronto-60". Não faça mais nada além disso e diga o resultado.'

test('1.5.2 (a): tela real de 13:44:28 (eco do recado + resposta + ❯ colado na régua): o campo não tem o recado', () => {
  const tela = fixture('tela-1344-eco-e-regua-colada.txt')
  const campo = campoNaTela(tela)
  assert.ok(campo !== null, 'o campo é reconhecido, colado na régua')
  assert.doesNotMatch(campo, /registrado/)
  assert.equal(marcaNoCampo(tela, recadoEscriba), false)
})

test('1.5.2 (a): tela real de 13:43:07 (sugestão fantasma no campo): o campo é a sugestão, sem o pedido', () => {
  const tela = fixture('tela-1343-sugestao-fantasma.txt')
  const campo = campoNaTela(tela)
  assert.ok(campo !== null)
  assert.match(campo, /^nothing — the task was a one-off/)
  assert.equal(marcaNoCampo(tela, pedidoDoTestador), false)
})

test('1.5.2 (b): ❯ seguido de resposta (●) ou de fim de turno (✻) é histórico: campo não reconhecido, nunca "tem o pedido"', () => {
  const eco = `❯ ${pedido}\n● resposta do agente\n  mais resposta`
  assert.equal(campoNaTela(eco), null)
  assert.equal(marcaNoCampo(eco, pedido), false)
  assert.equal(campoNaTela(`❯ ${pedido}\n          ✻ Cooked for 1s · done 10:43`), null)
  // a mesma linha, quando o xterm a juntou com a resposta
  assert.equal(campoNaTela(`❯ ${pedido}${' '.repeat(40)}● resposta`), null)
  // campo de verdade, com colagem de várias linhas que tem um marcador no meio: continua sendo campo
  assert.equal(marcaNoCampo(`❯ ${pedido}\n  - item\n  ● destaque\n${regua}\n  ⏵⏵ auto mode on`, pedido), true)
})

test('1.5.2: evidência com a tela real depois do envio: o campo tinha o recado, agora só o rodapé → saiu', () => {
  const antes = `histórico\n${regua}\n❯ ${recadoEscriba.replace('\n', ' ')}\n${regua}\n  ⏵⏵ auto mode on (shift+tab to cycle)`
  assert.equal(marcaNoCampo(antes, recadoEscriba), true)
  const depois = fixture('tela-1344-eco-e-regua-colada.txt')
  assert.equal(evidenciaDeEnvio({ ...base, texto: recadoEscriba, antes, depois }), 'saiu')
})

test('1.5.2: régua com ❯ colado e o pedido de fato no campo → ficou', () => {
  const tela = `❯ ${pedido}\n● resposta antiga\n  ✻ Cooked for 1s · done 10:43\n${regua}❯ ${pedido}\n${regua}  ⏵⏵ auto mode on`
  assert.equal(marcaNoCampo(tela, pedido), true)
  assert.equal(evidenciaDeEnvio({ ...base, texto: pedido, antes: tela, depois: tela }), 'ficou')
})

test('1.5.2: juntarLinhasDaTela junta a continuação de verdade, mas não esconde ❯ ou ⏵ dentro da régua', () => {
  assert.deepEqual(
    juntarLinhasDaTela([
      { texto: 'uma frase que passou da ', continuacao: false },
      { texto: 'largura', continuacao: true }
    ]),
    ['uma frase que passou da largura']
  )
  assert.deepEqual(
    juntarLinhasDaTela([
      { texto: regua, continuacao: false },
      { texto: '❯ ', continuacao: true },
      { texto: regua, continuacao: false },
      { texto: '⏵⏵ auto mode on', continuacao: true }
    ]),
    [regua, '❯ ', regua, '⏵⏵ auto mode on']
  )
})

test('1.5.2 (ii): eco do recado no histórico + campo vazio com sugestão fantasma → a retomada não aperta Enter', async () => {
  for (const tela of [
    `❯ ${pedido}\n● resposta\n✻ Cooked for 1s · done\n${regua}❯ Nothing — the task was a one-off.\n${regua}  ⏵⏵ auto mode on`,
    `❯ ${pedido}\n● resposta\n✻ Cooked for 1s · done\n${regua}\n❯ \n${regua}\n  ⏵⏵ auto mode on`,
    fixture('tela-1344-eco-e-regua-colada.txt')
  ]) {
    const escritos: string[] = []
    const r = await retomarEnvio({
      texto: tela.includes('registrado') ? recadoEscriba : pedido,
      shell: false,
      escrever: (d: string) => escritos.push(d),
      tela: async () => tela,
      emPergunta: async () => false,
      esperar: async () => {},
      ocupado: () => false,
      assentarMs: 0
    })
    assert.equal(r, 'sem-marca')
    assert.deepEqual(escritos, [], 'nenhum Enter')
  }
})

test('1.5.2 (3): os cartões do Claude abrem com a sugestão de próxima mensagem desligada', () => {
  assert.deepEqual(AMBIENTE_DO_CLAUDE, { CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: 'false' })
})

// ---- 1.5.2 (revisão): primeiro envio nunca dá Enter sobre o que não é do app ----

test('1º envio: sugestão fantasma no campo e a tela mudando (spinner) → ficou, 0 Enter', async () => {
  const escritos: string[] = []
  let n = 0
  const r = await confirmarEnvio({
    texto: pedido,
    shell: false,
    escreverColagem: () => {},
    escrever: (d: string) => escritos.push(d),
    // o campo reconhecido mostra só a sugestão; a linha de status muda a cada leitura
    tela: async () => `histórico\n${regua}❯ Nothing — the task was a one-off.\n${regua}  ⏵⏵ auto mode on · ${++n}s`,
    emPergunta: async () => false,
    esperar: (ms: number) => new Promise<void>((res) => setTimeout(res, Math.min(ms, 2))),
    ocupado: () => false,
    prazoDaColagemMs: 40,
    assentarMs: 0
  })
  assert.equal(r, 'ficou')
  assert.deepEqual(escritos, [], 'nenhum Enter')
})

test('1º envio: o usuário digita durante a espera → interromper → 0 Enter e `ficou`', async () => {
  const escritos: string[] = []
  let colado = false
  const r = await confirmarEnvio({
    texto: pedido,
    shell: false,
    escreverColagem: () => void (colado = true),
    escrever: (d: string) => escritos.push(d),
    tela: async () => (colado ? campoClaude(pedido) : campoClaude('')),
    emPergunta: async () => false,
    esperar: (ms: number) => new Promise<void>((res) => setTimeout(res, Math.min(ms, 2))),
    ocupado: () => false,
    assentarMs: 0,
    interromper: () => true
  })
  assert.equal(r, 'ficou')
  assert.deepEqual(escritos, [], 'nenhum Enter')
})

test('1º envio: campo nunca reconhecido (shell/tela desconhecida) e a tela muda → o Enter de reserva continua', async () => {
  const escritos: string[] = []
  let colado = false
  await confirmarEnvio({
    texto: 'ls',
    shell: true,
    escreverColagem: () => void (colado = true),
    escrever: (d: string) => escritos.push(d),
    tela: async () => (colado ? 'PS> ls\narquivo' : 'PS> '),
    emPergunta: async () => false,
    esperar: (ms: number) => new Promise<void>((res) => setTimeout(res, Math.min(ms, 2))),
    ocupado: () => false,
    assentarMs: 0,
    prazoDoEnterMs: 20
  })
  assert.equal(escritos[0], String.fromCharCode(13), 'o Enter de reserva vai')
})
