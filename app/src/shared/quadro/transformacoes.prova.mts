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
