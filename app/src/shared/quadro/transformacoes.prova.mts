import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { fechar } from './transformacoes.ts'
import type { Espaco, No } from '../modelo'

const instante = '2026-11-10T10:00:00.000Z'

const agente = (id: string, nome: string, extra: Partial<No> = {}): No =>
  ({ id, tipo: 'terminal', nome, agente: 'claude', comando: 'claude', x: 0, y: 0, largura: 200, altura: 100, z: 1, criadoEm: instante, ...extra }) as No

const codigo = (id: string, terminal: string): No =>
  ({ id, tipo: 'codigo', terminal, caminho: 'src/fila.mjs', modo: 'diff', automatico: true, x: 300, y: 0, largura: 200, altura: 200, z: 1, criadoEm: instante }) as No

const espacoCom = (nos: No[]): Espaco =>
  ({
    versao: 1,
    id: 'e',
    nome: 'Espaço',
    pasta: 'C:\projeto',
    cor: '#000',
    icone: 'folder',
    criadoEm: instante,
    abertoEm: instante,
    camera: { x: 0, y: 0, zoom: 1 },
    nos,
    cordas: [],
    desenhos: [],
    andares: [],
    andarAtivo: null
  }) as unknown as Espaco

test('fechar um agente: os cartões de código dele passam para quem o abriu', () => {
  const espaco = espacoCom([agente('chefe', 'Chefe'), agente('filho', 'Filho', { criadoPor: 'chefe' }), codigo('c', 'filho')])
  const { espaco: depois, resposta } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'filho' } as never)
  assert.equal(resposta.ok, true)
  const cartao = depois.nos.find((n) => n.id === 'c')
  assert.equal(cartao?.tipo === 'codigo' && cartao.terminal, 'chefe')
  assert.equal(depois.nos.some((n) => n.id === 'filho'), false, 'o agente sai do quadro')
})

test('sem quem herde (agente aberto pelo usuário), o cartão de código fica como está', () => {
  const espaco = espacoCom([agente('sozinho', 'Sozinho'), codigo('c', 'sozinho')])
  const { espaco: depois } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'sozinho' } as never)
  const cartao = depois.nos.find((n) => n.id === 'c')
  assert.equal(cartao?.tipo === 'codigo' && cartao.terminal, 'sozinho', 'não inventa dono')
  assert.ok(cartao, 'e o trabalho continua no quadro para ser lido')
})

test('herdeiro que já saiu do quadro não recebe nada', () => {
  const espaco = espacoCom([agente('filho', 'Filho', { criadoPor: 'quem-ja-foi' }), codigo('c', 'filho')])
  const { espaco: depois } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'filho' } as never)
  const cartao = depois.nos.find((n) => n.id === 'c')
  assert.equal(cartao?.tipo === 'codigo' && cartao.terminal, 'filho')
})

const visor = (id: string, terminal: string, arquivos: { caminho: string; em: number; sumiu?: boolean }[], extra: Partial<No> = {}): No =>
  ({ id, tipo: 'codigo', terminal, caminho: arquivos[0]?.caminho, modo: 'diff', automatico: true, arquivos, x: 300, y: 0, largura: 860, altura: 460, z: 1, criadoEm: instante, ...extra }) as No

const lista = (n: No | undefined): string[] => (n?.tipo === 'codigo' ? (n.arquivos ?? []).map((a) => a.caminho) : [])

test('fechar um agente: o visor dele se junta ao principal de quem o abriu, sem repetir arquivo', () => {
  const espaco = espacoCom([
    agente('chefe', 'Chefe'),
    agente('filho', 'Filho', { criadoPor: 'chefe' }),
    visor('vc', 'chefe', [{ caminho: 'a.ts', em: 5 }, { caminho: 'b.ts', em: 1 }]),
    visor('vf', 'filho', [{ caminho: 'c.ts', em: 9 }, { caminho: 'a.ts', em: 3 }]),
    visor('vf2', 'filho', [{ caminho: 'd.ts', em: 4 }], { arvore: 'outra' })
  ])
  const { espaco: depois } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'filho' } as never)
  assert.deepEqual(lista(depois.nos.find((n) => n.id === 'vc')), ['c.ts', 'a.ts', 'd.ts', 'b.ts'])
  assert.equal(depois.nos.some((n) => n.id === 'vf' || n.id === 'vf2'), false, 'os visores do que fechou somem, as listas ficaram')
  assert.equal(depois.nos.filter((n) => n.tipo === 'codigo').length, 1)
})

test('fechar um agente: o herdeiro sem visor fica com o do que fechou (principal), listas juntas', () => {
  const espaco = espacoCom([
    agente('chefe', 'Chefe'),
    agente('filho', 'Filho', { criadoPor: 'chefe' }),
    visor('vf', 'filho', [{ caminho: 'c.ts', em: 9 }], { arvore: 'outra' }),
    visor('vp', 'filho', [{ caminho: 'p.ts', em: 2 }])
  ])
  const { espaco: depois } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'filho' } as never)
  const visores = depois.nos.filter((n) => n.tipo === 'codigo')
  assert.equal(visores.length, 1)
  const v = visores[0]
  assert.equal(v.tipo === 'codigo' && v.terminal, 'chefe')
  assert.equal(v.tipo === 'codigo' && v.arvore, undefined)
  assert.equal(v.id, 'vp', 'a principal de quem fechou dá a posição')
  assert.deepEqual(lista(v), ['c.ts', 'p.ts'])
})

test('fechar um agente sem herdeiro: o visor fica intacto', () => {
  const espaco = espacoCom([agente('sozinho', 'Sozinho'), visor('v', 'sozinho', [{ caminho: 'a.ts', em: 1 }])])
  const { espaco: depois } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'sozinho' } as never)
  const v = depois.nos.find((n) => n.id === 'v')
  assert.equal(v?.tipo === 'codigo' && v.terminal, 'sozinho')
  assert.deepEqual(lista(v), ['a.ts'])
})

test('fechar um agente: o que chegou ao herdeiro sai das outras árvores dele (nada repetido)', () => {
  const espaco = espacoCom([
    agente('chefe', 'Chefe'),
    agente('filho', 'Filho', { criadoPor: 'chefe' }),
    visor('vc', 'chefe', [{ caminho: 'b.ts', em: 1 }]),
    visor('vcb', 'chefe', [{ caminho: 'api.ts', em: 2 }, { caminho: 'k.ts', em: 1 }], { arvore: 'Backend' }),
    visor('vf', 'filho', [{ caminho: 'api.ts', em: 9 }])
  ])
  const { espaco: depois } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'filho' } as never)
  assert.deepEqual(lista(depois.nos.find((n) => n.id === 'vc')), ['api.ts', 'b.ts'])
  assert.deepEqual(lista(depois.nos.find((n) => n.id === 'vcb')), ['k.ts'])
})

test('fechar um agente: arquivo que o corte de 50 levou continua na árvore do herdeiro onde estava', () => {
  const recentes = Array.from({ length: 45 }, (_, i) => ({ caminho: `r${i}.ts`, em: 1000 - i }))
  const velhos = [{ caminho: 'x.ts', em: 5 }, ...Array.from({ length: 9 }, (_, i) => ({ caminho: `v${i}.ts`, em: 10 + i }))]
  const espaco = espacoCom([
    agente('chefe', 'Chefe'),
    agente('filho', 'Filho', { criadoPor: 'chefe' }),
    visor('vc', 'chefe', recentes),
    visor('vcb', 'chefe', [{ caminho: 'x.ts', em: 500 }], { arvore: 'Backend' }),
    visor('vf', 'filho', velhos)
  ])
  const { espaco: depois } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'filho' } as never)
  const principal = lista(depois.nos.find((n) => n.id === 'vc'))
  assert.equal(principal.length, 50)
  assert.ok(!principal.includes('x.ts'), 'x.ts foi o mais velho e o corte o levou')
  assert.deepEqual(lista(depois.nos.find((n) => n.id === 'vcb')), ['x.ts'], 'não some de todas as listas')
})

test('fechar um agente: o em/sumiu mais novo da outra árvore não é trocado pelo mais velho de quem fechou', () => {
  const espaco = espacoCom([
    agente('chefe', 'Chefe'),
    agente('filho', 'Filho', { criadoPor: 'chefe' }),
    visor('vc', 'chefe', [{ caminho: 'b.ts', em: 1 }]),
    visor('vcb', 'chefe', [{ caminho: 'api.ts', em: 80, sumiu: true }], { arvore: 'Backend' }),
    visor('vf', 'filho', [{ caminho: 'api.ts', em: 9 }])
  ])
  const { espaco: depois } = fechar(espaco, { tipo: 'fechar', espacoId: 'e', id: 'filho' } as never)
  const v = depois.nos.find((n) => n.id === 'vc')
  const api = v?.tipo === 'codigo' ? v.arquivos?.find((a) => a.caminho === 'api.ts') : undefined
  assert.deepEqual(api, { caminho: 'api.ts', em: 80, sumiu: true })
  assert.deepEqual(lista(depois.nos.find((n) => n.id === 'vcb')), [])
})
