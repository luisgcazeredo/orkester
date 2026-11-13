import assert from 'node:assert/strict'
import test from 'node:test'

const { lerEntradaDoUsuario, entradaVazia, motivoDeEspera, decidirPendencia, criarCaixa, textoDoRecado, textoDoAviso, tirarCitacoes, semEcoDeFerramenta, janelaDeDialogo, RETOMADA_ESPERA, SILENCIO_DO_USUARIO, PARADO_PARA_AVISO, ESPERA_ENTRE_RECADOS, SEGUNDO_PLANO_PARA_AVISO } = await import(
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
  const segundoPlano = new Set<string>()
  const retomadas: string[] = []
  const registrosComTela: Array<[string, string | undefined]> = []
  const caixa = criarCaixa({
    agora: () => agora,
    novoId: () => `r${++n}`,
    situacao: async (id: string) => (situacoes.has(id) ? situacoes.get(id) : null),
    usuario: (id: string) => usuarios.get(id) ?? entradaVazia(),
    nome: (id: string) => (situacoes.has(id) ? id[0].toUpperCase() + id.slice(1) : null),
    shell: () => false,
    segundoPlano: async (id: string) => segundoPlano.has(id),
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
    registrosComTela,
    segundoPlano
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

// ---- 1.5.2: `desistido` não trava a fila ----

test('caixa 1.5.2 (i): desistiu e a marca está no campo de verdade → nada é colado por cima, nem depois de muito tempo; motivo próprio; "liberar" solta', async () => {
  const m = mundo()
  m.resultado('ficou')
  m.marcaNoCampo(true)
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'primeiro' })
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'segundo' })
  await m.caixa.rodada()
  m.passar(RETOMADA_ESPERA + 1000)
  await m.caixa.rodada() // desiste do primeiro
  m.resultado('saiu')
  const segundos = (): number => m.digitados.filter(([, t]) => t === 'segundo').length
  for (const espera of [ESPERA_ENTRE_RECADOS, 61_000, 10 * 60_000]) {
    m.passar(espera)
    await m.caixa.rodada()
    assert.equal(segundos(), 0, 'a marca continua no campo: nada por cima, sem prazo')
    assert.equal(m.caixa.resumo('testador').motivo, 'recado-antigo')
  }
  m.caixa.liberar('testador') // o usuário clicou em "liberar"
  await m.caixa.rodada()
  assert.equal(segundos(), 1, 'liberado: o segundo entra')
  assert.equal(m.caixa.resumo('testador').fila, 0)
})

test('caixa 1.5.2 (iii): dois recados na fila e o primeiro dá `ficou` falso → o segundo sai quando o campo não tem mais a marca', async () => {
  const m = mundo()
  m.resultado('ficou')
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'primeiro' })
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'segundo' })
  await m.caixa.rodada()
  m.passar(RETOMADA_ESPERA + 1000)
  await m.caixa.rodada()
  m.resultado('saiu')
  m.marcaNoCampo(false) // a leitura certa do campo: o recado não está lá
  m.passar(ESPERA_ENTRE_RECADOS)
  await m.caixa.rodada()
  assert.equal(m.digitados.filter(([, t]) => t === 'segundo').length, 1)
})

// ---- 1.5.3: avisos velhos, prioridade e comando em segundo plano ----

const avisoSobre = (m: ReturnType<typeof mundo>, sobre: string, texto = 'aviso') =>
  m.caixa.enfileirar({ tipo: 'aviso', de: null, deNome: 'Orkester', para: 'maestro', texto, sobre })

test('caixa 1.5.3 (a): 3 avisos na fila do Maestro sobre X; X some; a entrega nova é a 1ª e os avisos terminam cancelado', async () => {
  const m = mundo()
  m.situacoes.set('x', 'livre')
  m.situacoes.set('maestro', 'trabalhando')
  const avisos = [avisoSobre(m, 'x', 'a1'), avisoSobre(m, 'x', 'a2'), avisoSobre(m, 'x', 'a3')]
  await m.caixa.rodada()
  m.situacoes.delete('x') // o agente foi fechado
  m.caixa.esquecer('x') // o que o app faz ao fechar o cartão
  const entrega = m.caixa.enfileirar({ tipo: 'entrega', de: 'testador', deNome: 'Testador', para: 'maestro', texto: 'feito' })
  m.situacoes.set('maestro', 'livre')
  await m.caixa.rodada()
  assert.deepEqual(await Promise.all(avisos.map((a) => a.fim)), ['cancelado', 'cancelado', 'cancelado'])
  assert.equal(await entrega.fim, 'entregue')
  assert.deepEqual(m.digitados.map(([para, texto]) => [para, /feito/.test(texto)]), [['maestro', true]], 'só a entrega foi digitada')
})

test('caixa 1.5.3 (a): sem o `esquecer` o aviso sobre agente que sumiu também é cancelado na rodada', async () => {
  const m = mundo()
  m.situacoes.set('y', 'livre')
  m.situacoes.set('maestro', 'trabalhando')
  const aviso = avisoSobre(m, 'y')
  m.situacoes.delete('y')
  await m.caixa.rodada()
  assert.equal(await aviso.fim, 'cancelado')
  m.situacoes.set('maestro', 'livre')
  await m.caixa.rodada()
  assert.equal(m.digitados.length, 0)
})

test('caixa 1.5.3 (a): aviso sobre Y; Y volta a trabalhar (de vez, 3 s seguidos) → o aviso não é digitado; um eco de 1 s não basta', async () => {
  const m = mundo()
  m.situacoes.set('y', 'livre')
  m.situacoes.set('maestro', 'trabalhando')
  const aviso = avisoSobre(m, 'y')
  let fim: string | null = null
  void aviso.fim.then((f: string) => (fim = f))
  // um instante de "trabalhando" (eco do usuário clicando no cartão) e volta a livre: o aviso continua valendo
  m.situacoes.set('y', 'trabalhando')
  await m.caixa.rodada()
  m.passar(1000)
  m.situacoes.set('y', 'livre')
  await m.caixa.rodada()
  await Promise.resolve()
  assert.equal(fim, null, 'um eco não cancela')
  // agora ele volta a trabalhar e fica
  m.situacoes.set('y', 'trabalhando')
  await m.caixa.rodada()
  m.passar(3500)
  await m.caixa.rodada()
  assert.equal(await aviso.fim, 'cancelado')
  m.situacoes.set('maestro', 'livre')
  await m.caixa.rodada()
  assert.equal(m.digitados.length, 0, 'o aviso velho não foi digitado')
})

test('caixa 1.5.3 (a): aviso que ainda vale (agente parado) é digitado; aviso de "encerrou" não envelhece', async () => {
  const m = mundo()
  m.situacoes.set('y', 'livre')
  const valido = avisoSobre(m, 'y', 'ainda vale')
  await m.caixa.rodada()
  assert.equal(await valido.fim, 'entregue')
  // "encerrou" é o fato de o agente ter saído: sem `sobre`, vai mesmo com o agente já fora do app
  const m2 = mundo()
  m2.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'x' })
  await m2.caixa.rodada()
  m2.situacoes.set('testador', 'trabalhando')
  await m2.caixa.rodada()
  m2.situacoes.delete('testador')
  m2.passar(1000)
  await m2.caixa.rodada()
  assert.ok(m2.digitados.some(([para, texto]) => para === 'maestro' && /saiu/.test(texto)), 'o Maestro soube que ele saiu')
})

test('caixa 1.5.3 (a): entregas e pedidos passam na frente de avisos na mesma fila, mantendo a ordem entre si', async () => {
  const m = mundo()
  m.situacoes.set('y', 'livre')
  m.situacoes.set('maestro', 'trabalhando')
  avisoSobre(m, 'y', 'aviso-1')
  m.caixa.enfileirar({ tipo: 'entrega', de: 'testador', deNome: 'Testador', para: 'maestro', texto: 'entrega-1' })
  m.caixa.enfileirar({ tipo: 'pedido', de: 'testador', deNome: 'Testador', para: 'maestro', texto: 'pedido-1' })
  m.situacoes.set('maestro', 'livre')
  for (let i = 0; i < 3; i++) {
    await m.caixa.rodada()
    m.passar(ESPERA_ENTRE_RECADOS + 100)
  }
  const ordem = m.digitados.map(([, t]) => (/entrega-1/.test(t) ? 'entrega' : /pedido-1/.test(t) ? 'pedido' : 'aviso'))
  assert.deepEqual(ordem, ['entrega', 'pedido', 'aviso'])
})

test('pendência 1.5.3 (b): "1 shell still running" no rodapé: não avisa em 20 s, nem em 9 min; sem o rodapé, avisa', () => {
  const p = { de: 'm', para: 't', desde: 0, trabalhou: true, paradoDesde: 0 }
  // sem o rodapé, 20 s parado = aviso
  let r = decidirPendencia(p, 'livre', 1000)
  r = decidirPendencia(r.pendencia, 'livre', 1000 + PARADO_PARA_AVISO)
  assert.equal(r.avisar, 'parou')
  // com o rodapé, não
  r = decidirPendencia(p, 'livre', 1000, true)
  assert.equal(r.avisar, null)
  r = decidirPendencia(r.pendencia, 'livre', 1000 + PARADO_PARA_AVISO, true)
  assert.equal(r.avisar, null, '20 s com comando em segundo plano não é "parou"')
  r = decidirPendencia(r.pendencia, 'livre', 1000 + 9 * 60_000, true)
  assert.equal(r.avisar, null)
  // teto: 10 min com o comando, avisa com o texto próprio
  r = decidirPendencia(r.pendencia, 'livre', 1000 + SEGUNDO_PLANO_PARA_AVISO, true)
  assert.equal(r.avisar, 'segundo-plano')
  assert.match(textoDoAviso('Testador', 'segundo-plano', 'x'), /10 min.*comando em segundo plano/)
  // o comando acabou: o relógio de "parou" começa do zero (não herda os minutos de espera)
  r = decidirPendencia(p, 'livre', 5000, true)
  r = decidirPendencia(r.pendencia, 'livre', 5000 + 8 * 60_000, false)
  assert.equal(r.avisar, null, 'acabou o comando: conta de novo desde agora')
  r = decidirPendencia(r.pendencia, 'livre', 5000 + 8 * 60_000 + PARADO_PARA_AVISO, false)
  assert.equal(r.avisar, 'parou')
  // voltar a trabalhar zera o tempo em segundo plano
  r = decidirPendencia(decidirPendencia(p, 'livre', 1, true).pendencia, 'trabalhando', 2, true)
  assert.equal(r.pendencia.segundoPlanoDesde, 0)
})

test('caixa 1.5.3 (b): com o rodapé de segundo plano o Maestro não recebe "parou"; sem ele, recebe', async () => {
  for (const comComando of [true, false]) {
    const m = mundo()
    m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'rode o build' })
    await m.caixa.rodada()
    m.situacoes.set('testador', 'trabalhando')
    await m.caixa.rodada()
    m.situacoes.set('testador', 'livre')
    if (comComando) m.segundoPlano.add('testador')
    m.passar(1000)
    await m.caixa.rodada()
    m.passar(PARADO_PARA_AVISO + 1000)
    await m.caixa.rodada()
    const aviso = m.digitados.find(([para]) => para === 'maestro')
    assert.equal(!!aviso, !comComando, comComando ? 'esperando o comando: sem aviso' : 'parado de verdade: avisa')
  }
})

// ---- 1.5.3 (ajuste): o aviso cancelado por "voltou a trabalhar" rearma a pendência (M1) ----

test('caixa 1.5.3 M1: aviso "parou" cancelado porque o agente voltou a trabalhar → parou de novo, sai aviso novo', async () => {
  const m = mundo()
  m.situacoes.set('maestro', 'trabalhando') // o aviso fica na fila, sem ser digitado
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'teste tudo' })
  await m.caixa.rodada()
  m.situacoes.set('testador', 'trabalhando')
  m.passar(1000)
  await m.caixa.rodada()
  m.situacoes.set('testador', 'livre')
  m.passar(1000)
  await m.caixa.rodada()
  m.passar(PARADO_PARA_AVISO)
  await m.caixa.rodada()
  assert.equal(m.caixa.pendenciaDe('testador'), undefined, 'o aviso entrou na fila e a pendência fechou')
  // X acorda e trabalha 3 s seguidos: o aviso é cancelado
  m.situacoes.set('testador', 'trabalhando')
  await m.caixa.rodada()
  m.passar(3500)
  await m.caixa.rodada()
  assert.ok(m.caixa.pendenciaDe('testador'), 'a pendência voltou: quem pediu ainda espera a entrega')
  // para de novo, sem entregar: 20 s livre e o aviso novo sai
  m.situacoes.set('testador', 'livre')
  await m.caixa.rodada()
  m.passar(PARADO_PARA_AVISO)
  await m.caixa.rodada()
  m.situacoes.set('maestro', 'livre')
  await m.caixa.rodada()
  const avisos = m.digitados.filter(([para]) => para === 'maestro')
  assert.equal(avisos.length, 1, 'exatamente um aviso (o velho foi cancelado)')
  assert.match(avisos[0][1], /"Testador" terminou o que você pediu/)
})

test('caixa 1.5.3 M1: o mesmo vale para o aviso "segundo-plano"', async () => {
  const m = mundo()
  m.situacoes.set('maestro', 'trabalhando')
  m.caixa.enfileirar({ tipo: 'pedido', de: 'maestro', deNome: 'Maestro', para: 'testador', texto: 'rode o build' })
  await m.caixa.rodada()
  m.situacoes.set('testador', 'trabalhando')
  m.passar(1000)
  await m.caixa.rodada()
  m.situacoes.set('testador', 'livre')
  m.segundoPlano.add('testador')
  m.passar(1000)
  await m.caixa.rodada()
  m.passar(SEGUNDO_PLANO_PARA_AVISO + 1000)
  await m.caixa.rodada()
  assert.equal(m.caixa.pendenciaDe('testador'), undefined, 'o aviso de 10 min entrou na fila')
  m.segundoPlano.delete('testador')
  m.situacoes.set('testador', 'trabalhando')
  await m.caixa.rodada()
  m.passar(3500)
  await m.caixa.rodada()
  assert.ok(m.caixa.pendenciaDe('testador'), 'a pendência voltou')
  m.situacoes.set('testador', 'livre')
  await m.caixa.rodada()
  m.passar(PARADO_PARA_AVISO)
  await m.caixa.rodada()
  m.situacoes.set('maestro', 'livre')
  await m.caixa.rodada()
  const avisos = m.digitados.filter(([para]) => para === 'maestro')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0][1], /terminou o que você pediu/)
})

test('pendência 1.5.3 S4: o rodapé de segundo plano piscando não zera o relógio de 10 min; fora de verdade por 5 s zera', () => {
  const p = { de: 'm', para: 't', desde: 0, trabalhou: true, paradoDesde: 0 }
  let r = decidirPendencia(p, 'livre', 1000, true)
  // pisca: some por uma rodada, volta
  r = decidirPendencia(r.pendencia, 'livre', 60_000, false)
  r = decidirPendencia(r.pendencia, 'livre', 62_000, true)
  r = decidirPendencia(r.pendencia, 'livre', 300_000, false)
  r = decidirPendencia(r.pendencia, 'livre', 301_000, true)
  r = decidirPendencia(r.pendencia, 'livre', 1000 + SEGUNDO_PLANO_PARA_AVISO, true)
  assert.equal(r.avisar, 'segundo-plano', 'o relógio de 10 min sobreviveu às piscadas')
  // fora por 5 s seguidos: zera (o comando acabou)
  let q = decidirPendencia(p, 'livre', 1000, true)
  q = decidirPendencia(q.pendencia, 'livre', 60_000, false)
  q = decidirPendencia(q.pendencia, 'livre', 66_000, false)
  assert.equal(q.pendencia.segundoPlanoDesde, 0)
})
