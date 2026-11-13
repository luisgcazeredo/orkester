import assert from 'node:assert/strict'
import test from 'node:test'

const { lerEntradaDoUsuario, entradaVazia, motivoDeEspera, decidirPendencia, criarCaixa, textoDoRecado, textoDoAviso, tirarCitacoes, semEcoDeFerramenta, janelaDeDialogo, RETOMADA_ESPERA, SILENCIO_DO_USUARIO, PARADO_PARA_AVISO, ESPERA_ENTRE_RECADOS } = await import(
  new URL('./caixa.ts', import.meta.url).href
)

// ---- o usuário escrevendo ----

test('letras viram rascunho; Enter zera', () => {
  let e = entradaVazia()
  for (const l of 'oi tudo') e = lerEntradaDoUsuario(e, l, 100)
  assert.equal(e.rascunho, 7)
  assert.equal(e.ultimaTecla, 100)
  e = lerEntradaDoUsuario(e, '\r', 200)
  assert.equal(e.rascunho, 0)
  assert.equal(e.ultimaTecla, 200)
})

test('Backspace apaga, Ctrl+U e Ctrl+C limpam, Ctrl+W tira uma palavra', () => {
  let e = lerEntradaDoUsuario(entradaVazia(), 'abcdefghij', 1)
  e = lerEntradaDoUsuario(e, '\x7f', 2)
  assert.equal(e.rascunho, 9)
  e = lerEntradaDoUsuario(e, '\x17', 3)
  assert.equal(e.rascunho, 3)
  assert.equal(lerEntradaDoUsuario(e, '\x15', 4).rascunho, 0)
  assert.equal(lerEntradaDoUsuario(e, '\x03', 4).rascunho, 0)
})

test('colagem do usuário conta o tamanho do texto colado', () => {
  const e = lerEntradaDoUsuario(entradaVazia(), '\x1b[200~linha 1\nlinha 2\x1b[201~', 5)
  assert.equal(e.rascunho, 15)
})

test('resposta automática do terminal (foco, cursor, mouse) não é o usuário', () => {
  const antes = { ultimaTecla: 7, rascunho: 3, ultimoEsc: 0 }
  for (const seq of ['\x1b[I', '\x1b[O', '\x1b[12;40R', '\x1b[?1;2c', '\x1b[<0;10;5M', '\x1b]11;rgb:0000/0000/0000\x07']) {
    assert.deepEqual(lerEntradaDoUsuario(antes, seq, 999), antes, JSON.stringify(seq))
  }
})

test('Esc duas vezes seguidas limpa o campo (Claude Code); uma só não', () => {
  let e = lerEntradaDoUsuario(entradaVazia(), 'abc', 1)
  e = lerEntradaDoUsuario(e, '\x1b', 1000)
  assert.equal(e.rascunho, 3)
  e = lerEntradaDoUsuario(e, '\x1b', 1500)
  assert.equal(e.rascunho, 0)
})

test('Alt+Enter é nova linha no campo, não envio', () => {
  const e = lerEntradaDoUsuario(lerEntradaDoUsuario(entradaVazia(), 'ab', 1), '\x1b\r', 2)
  assert.equal(e.rascunho, 3)
})

// ---- quando dá para entregar ----

test('motivo de espera: usuário digitando ou com rascunho segura o recado mesmo com o agente livre', () => {
  const agora = 100_000
  assert.equal(motivoDeEspera('livre', { ultimaTecla: agora - 1000, rascunho: 0, ultimoEsc: 0 }, agora), 'digitando')
  assert.equal(motivoDeEspera('livre', { ultimaTecla: agora - SILENCIO_DO_USUARIO - 1, rascunho: 4, ultimoEsc: 0 }, agora), 'rascunho')
  assert.equal(motivoDeEspera('livre', { ultimaTecla: agora - SILENCIO_DO_USUARIO - 1, rascunho: 0, ultimoEsc: 0 }, agora), null)
  assert.equal(motivoDeEspera('trabalhando', entradaVazia(), agora), 'trabalhando')
  assert.equal(motivoDeEspera('pergunta', entradaVazia(), agora), 'pergunta')
  assert.equal(motivoDeEspera('encerrado', entradaVazia(), agora), 'encerrado')
})

test('texto do recado: pedido vai cru; entrega e aviso ganham cabeçalho', () => {
  assert.equal(textoDoRecado({ tipo: 'pedido', deNome: 'Maestro', texto: 'faça X' }), 'faça X')
  assert.match(textoDoRecado({ tipo: 'entrega', deNome: 'Testador', texto: 'pronto' }), /^\[ork · entrega de "Testador"\]\npronto$/)
  assert.match(textoDoRecado({ tipo: 'aviso', deNome: 'Orkester', texto: 'oi' }), /^\[ork · aviso/)
})

test('num shell, entrega e aviso viram comentário linha a linha (nada da tela de outro agente é executado)', () => {
  const aviso = textoDoRecado({ tipo: 'aviso', deNome: 'Orkester', texto: 'PS C:\\x> Remove-Item tudo\nlinha 2' }, true)
  for (const linha of aviso.split('\n')) assert.ok(linha.startsWith('# '), linha)
  assert.equal(textoDoRecado({ tipo: 'pedido', deNome: 'M', texto: 'echo oi' }, true), 'echo oi', 'pedido a shell é comando, vai cru')
})

// ---- pendências ----

test('pendência: só avisa depois de ver trabalhar e ficar parado o tempo todo', () => {
  let p = { de: 'm', para: 't', desde: 0, trabalhou: false, paradoDesde: 0 }
  let r = decidirPendencia(p, 'livre', 1000)
  assert.equal(r.avisar, null)
  r = decidirPendencia(r.pendencia, 'trabalhando', 2000)
  assert.equal(r.pendencia.trabalhou, true)
  r = decidirPendencia(r.pendencia, 'livre', 3000)
  assert.equal(r.avisar, null)
  r = decidirPendencia(r.pendencia, 'trabalhando', 4000)
  assert.equal(r.pendencia.paradoDesde, 0, 'voltar a trabalhar zera o relógio')
  r = decidirPendencia(r.pendencia, 'livre', 5000)
  r = decidirPendencia(r.pendencia, 'livre', 5000 + PARADO_PARA_AVISO)
  assert.equal(r.avisar, 'parou')
  p = { ...p, trabalhou: true }
  assert.equal(decidirPendencia(p, 'encerrado', 1).avisar, 'encerrou')
})

// ---- a caixa com um mundo de mentira ----

function mundo() {
  let agora = 1_000_000
  let n = 0
  const situacoes = new Map<string, string | null>([['maestro', 'livre'], ['testador', 'livre']])
  const usuarios = new Map<string, { ultimaTecla: number; rascunho: number; ultimoEsc: number }>()
  const digitados: Array<[string, string]> = []
  const registros: Array<[string, string]> = []
  let resultado = 'saiu'
  let retomada = 'sem-marca'
  let marcaNoCampo = false
  const retomadas: string[] = []
  const registrosComTela: Array<[string, string | undefined]> = []
  const caixa = criarCaixa({
    agora: () => agora,
    novoId: () => `r${++n}`,
    situacao: async (id: string) => (situacoes.has(id) ? situacoes.get(id) : null),
    usuario: (id: string) => usuarios.get(id) ?? entradaVazia(),
    nome: (id: string) => (situacoes.has(id) ? id[0].toUpperCase() + id.slice(1) : null),
    shell: () => false,
    tela: async () => 'ultima linha',
    digitar: async (id: string, texto: string) => {
      digitados.push([id, texto])
      return resultado
    },
    retomar: async (id: string) => {
      retomadas.push(id)
      return retomada
    },
    marcaNoCampo: async () => marcaNoCampo,
    mudou: () => {},
    registrar: (r: { para: string }, fim: string, tela?: string) => {
      registros.push([r.para, fim])
      registrosComTela.push([fim, tela])
    }
  })
  return {
    caixa,
    digitados,
    registros,
    situacoes,
    usuarios,
    passar: (ms: number) => (agora += ms),
    agora: () => agora,
    resultado: (r: string) => (resultado = r),
    retomada: (r: string) => (retomada = r),
    marcaNoCampo: (v: boolean) => (marcaNoCampo = v),
    retomadas,
    registrosComTela
  }
}

test('caixa: com o usuário escrevendo no Maestro, a entrega espera; parou e mandou, ela entra', async () => {
  const m = mundo()
  m.usuarios.set('maestro', { ultimaTecla: m.agora(), rascunho: 12, ultimoEsc: 0 })
  const { fim } = m.caixa.enfileirar({ tipo: 'entrega', de: 'testador', deNome: 'Testador', para: 'maestro', texto: 'ENTREGA' })
  await m.caixa.rodada()
  assert.equal(m.digitados.length, 0)
  assert.equal(m.caixa.resumo('maestro').motivo, 'digitando')
  m.passar(SILENCIO_DO_USUARIO + 1)
  await m.caixa.rodada()
  assert.equal(m.digitados.length, 0, 'rascunho no campo ainda segura')
  assert.equal(m.caixa.resumo('maestro').motivo, 'rascunho')
  m.usuarios.set('maestro', { ultimaTecla: m.agora(), rascunho: 0, ultimoEsc: 0 }) // apertou Enter
  m.situacoes.set('maestro', 'trabalhando')
  m.passar(SILENCIO_DO_USUARIO + 1)
  await m.caixa.rodada()
  assert.equal(m.digitados.length, 0, 'trabalhando no que o usuário mandou')
  m.situacoes.set('maestro', 'livre')
  await m.caixa.rodada()
  assert.deepEqual(m.digitados, [['maestro', '[ork · entrega de "Testador"]\nENTREGA']])
  assert.equal(await fim, 'entregue')
  assert.equal(m.caixa.resumo('maestro').fila, 0)
})

test('caixa: um de cada vez, na ordem; o segundo espera o destino ficar livre de novo', async () => {
  const m = mundo()
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'um' })
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'dois' })
  await m.caixa.rodada()
  assert.deepEqual(m.digitados.map((x) => x[1]), ['um'])
  m.situacoes.set('testador', 'trabalhando')
  await m.caixa.rodada()
  assert.equal(m.digitados.length, 1)
  m.situacoes.set('testador', 'livre')
  m.passar(ESPERA_ENTRE_RECADOS)
  await m.caixa.rodada()
  assert.deepEqual(m.digitados.map((x) => x[1]), ['um', 'dois'])
})

test('caixa: `ficou` não consome o recado: não cola de novo e, com a marca no campo e o destino livre, o Enter vai sozinho (i)', async () => {
  const m = mundo()
  m.resultado('ficou')
  const { fim } = m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'x' })
  await m.caixa.rodada()
  assert.equal(m.digitados.length, 1)
  assert.equal(m.caixa.resumo('testador').fila, 1, 'o recado continua na fila')
  assert.equal(m.caixa.pendenciaDe('testador'), undefined, 'ainda não saiu: sem pendência')
  assert.deepEqual(m.registrosComTela[0], ['ficou', 'ultima linha'], 'a tela do destino vai para o registro')
  // 70 s depois a colagem aparece: o Enter vai, sem ninguém tocar
  m.passar(70_000)
  m.retomada('saiu')
  await m.caixa.rodada()
  assert.equal(await fim, 'entregue')
  assert.equal(m.digitados.length, 1, 'a colagem não se repete')
  assert.equal(m.retomadas.length, 2, 'tentou ao ficar (sem marca ainda) e de novo quando a colagem apareceu')
  assert.ok(m.caixa.pendenciaDe('testador'), 'saiu: abre a pendência de quem pediu')
  assert.equal(m.caixa.resumo('testador').fila, 0)
})

test('caixa: retomada só com destino livre e o usuário sem rascunho e sem digitar (nunca Enter sobre texto dele)', async () => {
  const m = mundo()
  m.resultado('ficou')
  m.caixa.enfileirar({ tipo: 'entrega', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'x' })
  await m.caixa.rodada()
  m.retomadas.length = 0
  m.usuarios.set('testador', { ultimaTecla: m.agora(), rascunho: 5, ultimoEsc: 0 })
  m.passar(SILENCIO_DO_USUARIO + 1)
  await m.caixa.rodada()
  assert.equal(m.retomadas.length, 0, 'rascunho do usuário no campo')
  m.usuarios.set('testador', { ultimaTecla: m.agora(), rascunho: 0, ultimoEsc: 0 })
  await m.caixa.rodada()
  assert.equal(m.retomadas.length, 0, 'ele acabou de digitar')
  m.passar(SILENCIO_DO_USUARIO + 1)
  m.situacoes.set('testador', 'trabalhando')
  await m.caixa.rodada()
  assert.equal(m.retomadas.length, 0, 'destino trabalhando')
  m.situacoes.set('testador', 'pergunta')
  await m.caixa.rodada()
  assert.equal(m.retomadas.length, 0, 'destino numa pergunta')
  m.situacoes.set('testador', 'livre')
  await m.caixa.rodada()
  assert.equal(m.retomadas.length, 1, 'livre e sem rascunho: tenta')
})

test('caixa: `ficou` sem retomada em 3 min gera aviso ao remetente, com a tela citada (iii)', async () => {
  const m = mundo()
  m.resultado('ficou')
  const { fim } = m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'x' })
  await m.caixa.rodada()
  m.passar(RETOMADA_ESPERA - 1000)
  await m.caixa.rodada()
  assert.equal(m.digitados.filter(([p]) => p === 'maestro').length, 0, 'ainda dentro do prazo')
  m.resultado('saiu') // o aviso ao Maestro é um recado novo e sai normalmente
  m.passar(2000)
  await m.caixa.rodada()
  assert.equal(await fim, 'ficou')
  const aviso = m.digitados.find(([p]) => p === 'maestro')
  assert.ok(aviso, 'o Maestro foi avisado')
  assert.match(aviso![1], /NÃO foi enviado/)
  assert.match(aviso![1], /\| ultima linha/)
  assert.equal(m.caixa.resumo('testador').fila, 0)
  assert.equal(m.registrosComTela.filter(([f]) => f === 'ficou').length, 2, 'registrado ao ficar e ao desistir, com a tela')
})

test('caixa: recado desistido deixa o texto no campo: o próximo não é colado por cima enquanto a marca estiver lá (item 6)', async () => {
  const m = mundo()
  m.resultado('ficou')
  m.marcaNoCampo(true)
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'primeiro' })
  await m.caixa.rodada()
  m.passar(RETOMADA_ESPERA + 1000)
  await m.caixa.rodada()
  m.resultado('saiu')
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'segundo' })
  m.passar(ESPERA_ENTRE_RECADOS)
  const antes = m.digitados.length
  await m.caixa.rodada()
  await m.caixa.rodada()
  assert.equal(m.digitados.filter(([, t]) => t === 'segundo').length, 0, 'marca antiga no campo: espera')
  assert.equal(m.caixa.resumo('testador').fila, 1)
  m.marcaNoCampo(false) // o usuário limpou o campo
  await m.caixa.rodada()
  assert.equal(m.digitados.filter(([, t]) => t === 'segundo').length, 1, 'campo limpo: entra')
  assert.ok(m.digitados.length > antes)
})

test('caixa: `ficou` num shell encerra na hora (não há campo para conferir)', async () => {
  const caixa = criarCaixa({
    agora: () => 1_000_000,
    novoId: () => 'r',
    situacao: async () => 'livre',
    usuario: () => entradaVazia(),
    nome: () => 'Shell',
    shell: () => true,
    tela: async () => '',
    digitar: async () => 'ficou',
    retomar: async () => 'saiu',
    mudou: () => {},
    registrar: () => {}
  })
  const { fim } = caixa.enfileirar({ tipo: 'entrega', de: null, deNome: 'X', para: 'shell', texto: 'x' })
  await caixa.rodada()
  assert.equal(await fim, 'ficou')
})

test('aviso: a tela citada não tem linha começando com › ou ❯ e o diálogo dela some para o app (ii)', () => {
  const tela = 'Do you want to run git?\n› 1. Yes, proceed (y)\n  2. No\nPress enter to confirm or esc to cancel'
  const texto = textoDoAviso('Revisor', 'pergunta', tela)
  for (const linha of texto.split('\n')) assert.doesNotMatch(linha, /^\s*[❯›]/)
  assert.match(texto, /\| Press enter to confirm/, 'o texto continua legível')
  const lidoPeloApp = tirarCitacoes(`❯ ${texto.replace(/\n/g, '\n  ')}`)
  assert.doesNotMatch(lidoPeloApp, /enter to confirm|esc to cancel|Yes, proceed/i)
  assert.equal(tirarCitacoes('um\n  | citado\n|\ndois'), 'um\ndois')
})

test('diálogo: tela cheia de eco de ferramenta não traz um "update available" antigo para a janela de 6 linhas', () => {
  const antigo = ['Update available! 0.1 -> 0.2', 'Do you want to proceed?']
  const chamadas = Array.from({ length: 10 }, (_, i) => [`● Bash(grep -n x arq${i}.ts)`, `  ⎿  ${i}: resultado ${i}`]).flat()
  const tela = [...antigo, ...chamadas, '❯ '].join('\n')
  assert.doesNotMatch(janelaDeDialogo(tela), /update available|do you want to proceed/i)
  // e o diálogo de verdade no pé continua dentro da janela
  assert.match(janelaDeDialogo(`${chamadas.join('\n')}\nDo you want to proceed?\n❯ 1. Yes\n  Esc to cancel`), /esc to cancel/i)
})

test('diálogo: eco de grep e saída de ferramenta na tela do próprio agente não conta; o diálogo de verdade sim', () => {
  const eco = [
    '● Bash(grep -nE "Skip|Update now" src/main/codex-regras.ts)',
    '  ⎿  81:  return /update available/i.test(tela) && /update now/i.test(tela)',
    '     src/main/terminais.ts:310: Update now / Skip',
    '❯ '
  ].join('\n')
  assert.doesNotMatch(semEcoDeFerramenta(eco), /update now|update available/i)
  const dialogo = ' ✨ Update available! 0.167.2 -> 0.170.0\n› 1. Update now\n  2. Skip\n  Press enter to continue'
  assert.match(semEcoDeFerramenta(dialogo), /update available/i)
  assert.match(semEcoDeFerramenta('Do you want to proceed?\n❯ 1. Yes\n  Esc to cancel'), /esc to cancel/i)
})

test('caixa: depois do aviso de pergunta, o `ork teclas` rearma o aviso da segunda parada, um por parada (S3)', async () => {
  const m = mundo()
  const avisos = (): number => m.digitados.filter(([p]) => p === 'maestro').length
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'revise' })
  await m.caixa.rodada()
  m.situacoes.set('testador', 'trabalhando')
  m.passar(1000)
  await m.caixa.rodada()
  m.situacoes.set('testador', 'pergunta')
  m.passar(1000)
  await m.caixa.rodada()
  m.passar(10_000)
  await m.caixa.rodada()
  assert.equal(avisos(), 1, 'primeiro aviso')
  assert.equal(m.caixa.pendenciaDe('testador'), undefined)
  m.passar(ESPERA_ENTRE_RECADOS)
  // o Maestro responde com `ork teclas`; o agente volta a trabalhar e para de novo
  m.caixa.reabrirPendencia('maestro', 'testador')
  m.caixa.reabrirPendencia('maestro', 'testador') // outra tecla na mesma parada: não duplica
  m.situacoes.set('testador', 'trabalhando')
  m.passar(1000)
  await m.caixa.rodada()
  m.situacoes.set('testador', 'pergunta')
  await m.caixa.rodada()
  m.passar(10_000)
  await m.caixa.rodada()
  m.passar(10_000)
  await m.caixa.rodada()
  await m.caixa.rodada()
  assert.equal(avisos(), 2, 'segundo aviso, e só um')
  // teclas de quem não pediu não reabre nada
  m.caixa.reabrirPendencia('estranho', 'testador')
  assert.equal(m.caixa.pendenciaDe('testador'), undefined)
})

test('caixa: destino que sumiu derruba a fila como sem-destino', async () => {
  const m = mundo()
  const { fim } = m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'fantasma', texto: 'x' })
  await m.caixa.rodada()
  assert.equal(await fim, 'sem-destino')
})

test('caixa: agente terminou e não entregou → aviso automático para quem pediu', async () => {
  const m = mundo()
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'teste tudo' })
  await m.caixa.rodada()
  assert.ok(m.caixa.pendenciaDe('testador'))
  m.situacoes.set('testador', 'trabalhando')
  m.passar(1000)
  await m.caixa.rodada()
  m.situacoes.set('testador', 'livre')
  m.passar(1000)
  await m.caixa.rodada()
  m.passar(PARADO_PARA_AVISO)
  await m.caixa.rodada()
  const aviso = m.digitados.find(([para]) => para === 'maestro')
  assert.ok(aviso, 'o Maestro recebeu o aviso')
  assert.match(aviso![1], /"Testador" terminou o que você pediu/)
  assert.match(aviso![1], /ultima linha/)
  assert.equal(m.caixa.pendenciaDe('testador'), undefined)
})

test('caixa: com `ork entregar` não há aviso; nem enquanto quem pediu está esperando o fim', async () => {
  const m = mundo()
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'x' })
  await m.caixa.rodada()
  const soltar = m.caixa.vigiar('testador')
  m.situacoes.set('testador', 'trabalhando')
  await m.caixa.rodada()
  m.situacoes.set('testador', 'livre')
  m.passar(PARADO_PARA_AVISO * 3)
  await m.caixa.rodada()
  await m.caixa.rodada()
  assert.equal(m.digitados.filter(([p]) => p === 'maestro').length, 0, 'vigiado: sem aviso')
  soltar()
  m.caixa.fecharPendencia('testador') // o que o `ork pedir` faz quando viu o fim
  m.passar(PARADO_PARA_AVISO * 3)
  await m.caixa.rodada()
  assert.equal(m.digitados.filter(([p]) => p === 'maestro').length, 0)
})

test('caixa: a entrega que chega fecha a pendência de quem entregou', async () => {
  const m = mundo()
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'x' })
  await m.caixa.rodada()
  assert.ok(m.caixa.pendenciaDe('testador'))
  m.caixa.enfileirar({ tipo: 'entrega', de: 'testador', deNome: 'Testador', para: 'maestro', texto: 'feito' })
  await m.caixa.rodada()
  assert.equal(m.caixa.pendenciaDe('testador'), undefined)
})
