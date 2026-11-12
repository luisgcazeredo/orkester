import assert from 'node:assert/strict'
import test from 'node:test'

const { primeiroPedidoDoCartao } = await import(new URL('./api.ts', import.meta.url).href)

type Sessao = { nome: string }
const sessao: Sessao = { nome: 'Cartão' }

function montar(o: { sessao?: Sessao; pronto?: string; envio?: string; id?: unknown; texto?: unknown }) {
  const chamadas: string[] = []
  const registros: unknown[] = []
  const dep = {
    id: 'id' in o ? o.id : 'c1',
    texto: 'texto' in o ? o.texto : 'faça isto',
    acharSessao: async () => {
      chamadas.push('achar')
      return 'sessao' in o ? o.sessao : sessao
    },
    aguardarPronto: async () => {
      chamadas.push('pronto')
      return o.pronto ?? 'pronto'
    },
    digitar: async () => {
      chamadas.push('digitar')
      return o.envio ?? 'saiu'
    },
    registrar: (_s: Sessao, r: unknown) => registros.push(r)
  }
  return { chamadas, registros, dep }
}

for (const status of ['saiu', 'ficou', 'incerto']) {
  test(`retorna ${status} quando o envio dá ${status}, e registra`, async () => {
    const { dep, registros, chamadas } = montar({ envio: status })
    assert.deepEqual(await primeiroPedidoDoCartao(dep), { status })
    assert.deepEqual(registros, [{ status }])
    assert.deepEqual(chamadas, ['achar', 'pronto', 'digitar'])
  })
}

for (const motivo of ['confirmar', 'desconhecido', 'tempo', 'encerrado']) {
  test(`nao-pronto com motivo ${motivo}: nada é digitado`, async () => {
    const { dep, registros, chamadas } = montar({ pronto: motivo })
    assert.deepEqual(await primeiroPedidoDoCartao(dep), { status: 'nao-pronto', motivo })
    assert.deepEqual(registros, [{ status: 'nao-pronto', motivo }])
    assert.equal(chamadas.includes('digitar'), false)
  })
}

test('sem-sessao: cartão sem processo, nada é digitado nem registrado', async () => {
  const { dep, registros, chamadas } = montar({ sessao: undefined })
  assert.deepEqual(await primeiroPedidoDoCartao(dep), { status: 'sem-sessao' })
  assert.deepEqual(chamadas, ['achar'])
  assert.deepEqual(registros, [])
})

test('sem-sessao: pedido inválido (id não texto, texto vazio) nem procura a sessão', async () => {
  for (const o of [{ id: 7 }, { texto: '   ' }, { texto: 3 }]) {
    const { dep, chamadas } = montar(o)
    assert.deepEqual(await primeiroPedidoDoCartao(dep), { status: 'sem-sessao' })
    assert.deepEqual(chamadas, [])
  }
})
