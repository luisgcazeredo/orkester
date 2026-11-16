import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { anotarNoVisor, ehVisor, escolherNoVisor, exibidoDepois, juntarNoVisor, marcarApagado, MAX_NA_LISTA, migrarCodigos, migrarEspaco, seguirDeNovo, tirarDoVisor, VISOR_ABERTO, VISOR_RECOLHIDO } from './visor.ts'
import type { No, NoCodigo, Plano } from '../modelo'

const hora = (k: number) => `2026-11-01T10:0${k}:00.000Z`

const codigo = (id: string, extra: Partial<NoCodigo>): NoCodigo =>
  ({ id, tipo: 'codigo', modo: 'diff', x: 10, y: 10, largura: 620, altura: 460, z: 3, criadoEm: hora(1), ...extra }) as NoCodigo

const terminal = (id: string): No =>
  ({ id, tipo: 'terminal', nome: id, agente: 'claude', comando: 'claude', x: 0, y: 0, largura: 200, altura: 100, z: 2, criadoEm: hora(0) }) as No

const texto: No = { id: 'tx', tipo: 'texto', texto: 'recado', tamanhoFonte: 20, mono: false, x: 0, y: 0, largura: 100, altura: 40, z: 1, criadoEm: hora(0) } as No

function plano(nos: No[]): Plano {
  return { camera: { x: 0, y: 0, zoom: 1 }, nos, desenhos: [], cordas: [{ id: 'c1', de: 'A', para: 'B', criadoEm: hora(0) }] }
}

/**
 * Sete cartões antigos de um agente numa árvore. Ordem da coluna esperada: c2, c1, c3, c4, c7, c6, c5.
 * `topoAberto: false` recolhe o c2 também (nenhum cartão aberto).
 */
function setecartoes(pref: string, terminalId: string, arvore: string | undefined, topoAberto = true): NoCodigo[] {
  const base = { terminal: terminalId, ...(arvore ? { arvore } : {}) }
  const x = (n: number) => `${pref}-c${n}`
  return [
    codigo(x(1), { ...base, automatico: true, ordem: 1, recolhido: true, caminho: 'a.ts', criadoEm: hora(1), x: 100, y: 100 }),
    codigo(x(2), { ...base, automatico: true, ordem: 0, recolhido: !topoAberto, caminho: 'b.ts', modo: 'conteudo', criadoEm: hora(2), x: 500, y: 40, z: 9, cor: '#f00' }),
    codigo(x(3), { ...base, automatico: true, ordem: 2, recolhido: true, caminho: 'c.ts', criadoEm: hora(3) }),
    codigo(x(4), { ...base, automatico: true, ordem: 3, recolhido: true, criadoEm: hora(4) }), // sem caminho
    codigo(x(5), { ...base, automatico: false, recolhido: !topoAberto, caminho: 'd.ts', criadoEm: hora(5), x: 3000, y: 3000 }), // solto
    codigo(x(6), { ...base, automatico: false, recolhido: true, caminho: 'a.ts', criadoEm: hora(6) }), // solto, repete a.ts
    codigo(x(7), { ...base, automatico: true, recolhido: true, caminho: 'e.ts', criadoEm: hora(7) }) // sem ordem
  ]
}

function quadroAntigo(): Plano {
  return plano([
    terminal('A'),
    terminal('B'),
    ...setecartoes('A-p', 'A', undefined),
    texto,
    ...setecartoes('A-x', 'A', 'arv-x'),
    ...setecartoes('B-p', 'B', undefined),
    ...setecartoes('B-x', 'B', 'arv-x', false),
    codigo('aberto-a-mao', { caminho: 'z.ts' }) // sem terminal: cartão de um arquivo só
  ])
}

const visores = (p: Plano) => p.nos.filter(ehVisor)
const caminhos = (no: NoCodigo) => (no.arquivos ?? []).map((a) => a.caminho)

test('migrar: 2 agentes × 2 árvores × 7 cartões viram 4 visores com a lista na ordem da coluna', () => {
  const migrado = migrarCodigos(quadroAntigo())
  const v = visores(migrado)
  assert.equal(v.length, 4)
  for (const visor of v) assert.deepEqual(caminhos(visor), ['b.ts', 'a.ts', 'c.ts', 'e.ts', 'd.ts']) // c4 sem caminho some; c6 repete a.ts
  assert.deepEqual(v.map((n) => n.id), ['A-p-c2', 'A-x-c2', 'B-p-c2', 'B-x-c2'])
  assert.equal(migrado.nos.filter((n) => n.tipo === 'codigo').length, 5) // 4 visores + o cartão aberto à mão
  assert.deepEqual(migrado.cordas, quadroAntigo().cordas)
  assert.equal(migrado.nos.filter((n) => n.tipo === 'terminal').length, 2)
})

test('migrar: o visor herda posição, cor, modo e o arquivo do cartão aberto; nasce seguindo', () => {
  const [visor] = visores(migrarCodigos(quadroAntigo()))
  assert.equal(visor.id, 'A-p-c2')
  assert.equal(visor.terminal, 'A')
  assert.equal(visor.arvore, undefined)
  assert.equal(visor.caminho, 'b.ts')
  assert.equal(visor.modo, 'conteudo')
  assert.equal('seguindo' in visor, false) // ausente = acompanha (item 5)
  assert.equal(exibidoDepois(visor, 'n.ts'), 'n.ts')
  assert.equal(visor.automatico, true)
  assert.equal(visor.recolhido, false)
  assert.deepEqual([visor.x, visor.y, visor.z, visor.cor], [500, 40, 9, '#f00'])
  assert.deepEqual([visor.largura, visor.altura], [VISOR_ABERTO.largura, VISOR_ABERTO.altura])
  assert.equal('ordem' in visor, false)
  assert.equal(visor.arquivos![1].em, Date.parse(hora(6))) // a.ts: c1 (hora 1) e c6 (hora 6) → o maior (item 3)
})

test('migrar: tudo recolhido vira visor recolhido, mostrando o de maior criadoEm (item 4)', () => {
  const v = visores(migrarCodigos(quadroAntigo())).find((n) => n.id === 'B-x-c2')!
  assert.equal(v.recolhido, true)
  assert.deepEqual([v.largura, v.altura], [VISOR_RECOLHIDO.largura, VISOR_RECOLHIDO.altura])
  assert.deepEqual([v.larguraAberta, v.alturaAberta], [VISOR_ABERTO.largura, VISOR_ABERTO.altura])
  assert.equal(v.caminho, 'e.ts') // c7 (hora 7) é o mais novo; o 1º da coluna seria b.ts
  assert.equal(v.arvore, 'arv-x')
})

test('migrar: rodar 2× dá o mesmo resultado (e a mesma referência quando não há o que migrar)', () => {
  const uma = migrarCodigos(quadroAntigo())
  const duas = migrarCodigos(uma)
  assert.equal(duas, uma)
  assert.deepEqual(duas, uma)
})

test('migrar: não depende da ordem em que os cartões estão no arquivo', () => {
  const antigo = quadroAntigo()
  const embaralhado = { ...antigo, nos: [...antigo.nos].reverse() }
  const a = visores(migrarCodigos(antigo)).sort((p, q) => p.id.localeCompare(q.id))
  const b = visores(migrarCodigos(embaralhado)).sort((p, q) => p.id.localeCompare(q.id))
  assert.deepEqual(b, a)
})

test('migrar: todos soltos (arrastados para fora) também viram um visor, na posição do primeiro', () => {
  const p = plano([
    terminal('A'),
    codigo('s1', { terminal: 'A', automatico: false, caminho: 'x.ts', criadoEm: hora(1), x: 700, y: 700 }),
    codigo('s2', { terminal: 'A', automatico: false, caminho: 'y.ts', criadoEm: hora(2), x: 900, y: 900 })
  ])
  const [v] = visores(migrarCodigos(p))
  assert.equal(v.id, 's2') // o mais novo primeiro
  assert.deepEqual(caminhos(v), ['y.ts', 'x.ts'])
  assert.equal(v.automatico, false)
  assert.deepEqual([v.x, v.y], [900, 900])
})

test('migrar: agente só com cartões sem caminho ganha um visor vazio', () => {
  const p = plano([terminal('A'), codigo('v0', { terminal: 'A', automatico: true, ordem: 0 })])
  const [v] = visores(migrarCodigos(p))
  assert.deepEqual(v.arquivos, [])
  assert.equal(v.caminho, undefined)
})

test('migrar: cartão solto que uma versão velha criou ao lado de um visor entra na lista dele, do mais novo para o mais velho (itens 2 e 3)', () => {
  const migrado = migrarCodigos(quadroAntigo())
  const velho = codigo('novo-velho', { terminal: 'A', automatico: true, ordem: 0, caminho: 'f.ts', criadoEm: hora(8) })
  const repetido = codigo('rep', { terminal: 'A', automatico: true, ordem: 1, caminho: 'b.ts', criadoEm: hora(9) })
  const de = migrarCodigos({ ...migrado, nos: [...migrado.nos, velho, repetido] })
  const v = visores(de).find((n) => n.id === 'A-p-c2')!
  assert.deepEqual(caminhos(v), ['b.ts', 'f.ts', 'e.ts', 'a.ts', 'd.ts', 'c.ts'])
  const ems = caminhos(v).map((_, i) => v.arquivos![i].em)
  assert.deepEqual(ems, [...ems].sort((x, y) => y - x))
  assert.equal(v.arquivos![0].em, Date.parse(hora(9))) // b.ts repetido: fica o maior em
  assert.equal(de.nos.some((n) => n.id === 'novo-velho' || n.id === 'rep'), false)
  assert.equal(visores(de).length, 4)
})

test('migrar: repetido na coluna fica com o maior em do caminho (item 3)', () => {
  const p = plano([
    terminal('A'),
    codigo('r1', { terminal: 'A', automatico: true, ordem: 0, caminho: 'a.ts', criadoEm: hora(1) }),
    codigo('r2', { terminal: 'A', automatico: true, ordem: 1, caminho: 'a.ts', criadoEm: hora(6) })
  ])
  const [v] = visores(migrarCodigos(p))
  assert.deepEqual(v.arquivos, [{ caminho: 'a.ts', em: Date.parse(hora(6)) }])
})

test('migrar: nenhum cartão aberto → exibido é o de maior criadoEm, mesmo que não seja o 1º da coluna (item 4)', () => {
  const p = plano([
    terminal('A'),
    codigo('n1', { terminal: 'A', automatico: true, ordem: 0, recolhido: true, caminho: 'velho.ts', criadoEm: hora(1) }),
    codigo('n2', { terminal: 'A', automatico: true, ordem: 1, recolhido: true, caminho: 'novo.ts', criadoEm: hora(5) })
  ])
  const [v] = visores(migrarCodigos(p))
  assert.equal(v.id, 'n1')
  assert.equal(v.caminho, 'novo.ts')
  assert.equal(v.recolhido, true)
})

test('migrar: visor migrado não grava seguindo (item 5)', () => {
  for (const v of visores(migrarCodigos(quadroAntigo()))) assert.equal('seguindo' in v, false)
  assert.equal('seguindo' in JSON.parse(JSON.stringify(visores(migrarCodigos(quadroAntigo()))[0])), false)
})

test('migrar: cartão cujo terminal não existe mais fica como cartão de um arquivo, intacto (item 6)', () => {
  const orfao1 = codigo('o1', { terminal: 'MORTO', automatico: true, ordem: 0, caminho: 'x.ts', criadoEm: hora(1) })
  const orfao2 = codigo('o2', { terminal: 'MORTO', automatico: true, ordem: 1, caminho: 'y.ts', criadoEm: hora(2) })
  const p = plano([terminal('A'), orfao1, orfao2, ...setecartoes('A-p', 'A', undefined)])
  const migrado = migrarCodigos(p)
  assert.deepEqual(migrado.nos.find((n) => n.id === 'o1'), orfao1)
  assert.deepEqual(migrado.nos.find((n) => n.id === 'o2'), orfao2)
  assert.equal(visores(migrado).length, 1)
  assert.equal(visores(migrado)[0].terminal, 'A')
  const so = plano([terminal('A'), orfao1])
  assert.equal(migrarCodigos(so), so) // nada a migrar: mesma referência
})

test('migrar: a lista migrada também corta em 50', () => {
  const cartoes = Array.from({ length: 60 }, (_, i) =>
    codigo(`m${i}`, { terminal: 'A', automatico: true, ordem: i, caminho: `f${i}.ts`, criadoEm: hora(1) })
  )
  const [v] = visores(migrarCodigos(plano([terminal('A'), ...cartoes])))
  assert.equal(v.arquivos!.length, MAX_NA_LISTA)
  assert.equal(v.arquivos![0].caminho, 'f0.ts')
  assert.equal(v.arquivos![49].caminho, 'f49.ts')
})

test('migrar: quadro sem cartão de código, ou só com cartão de um arquivo, volta igual (mesma referência)', () => {
  const sem = plano([terminal('A'), texto])
  assert.equal(migrarCodigos(sem), sem)
  const um = plano([terminal('A'), codigo('um', { caminho: 'z.ts' })])
  assert.equal(migrarCodigos(um), um)
  assert.equal(ehVisor(um.nos[1]), false)
})

test('migrar: o resultado passa por JSON sem perder nada (é o que vai para o disco)', () => {
  const migrado = migrarCodigos(quadroAntigo())
  assert.deepEqual(JSON.parse(JSON.stringify(migrado)), migrado)
})

test('anotar: arquivo novo entra no topo; o repetido sobe sem duplicar', () => {
  let v = codigo('v', { terminal: 'A', caminho: 'b.ts', arquivos: [{ caminho: 'b.ts', em: 5 }, { caminho: 'a.ts', em: 4 }, { caminho: 'c.ts', em: 3 }] })
  v = anotarNoVisor(v, 'n.ts', 6)
  assert.deepEqual(caminhos(v), ['n.ts', 'b.ts', 'a.ts', 'c.ts'])
  v = anotarNoVisor(v, 'c.ts', 7)
  assert.deepEqual(v.arquivos, [{ caminho: 'c.ts', em: 7 }, { caminho: 'n.ts', em: 6 }, { caminho: 'b.ts', em: 5 }, { caminho: 'a.ts', em: 4 }])
  v = anotarNoVisor(v, 'c.ts', 8)
  assert.deepEqual(caminhos(v), ['c.ts', 'n.ts', 'b.ts', 'a.ts'])
  assert.equal(v.arquivos![0].em, 8)
})

test('anotar: não troca o que está à mostra, só preenche o visor vazio; não muda o original', () => {
  const v = codigo('v', { terminal: 'A', caminho: 'b.ts', arquivos: [{ caminho: 'b.ts', em: 5 }] })
  const depois = anotarNoVisor(v, 'n.ts', 6)
  assert.equal(depois.caminho, 'b.ts')
  assert.deepEqual(caminhos(v), ['b.ts'])
  const vazio = codigo('v', { terminal: 'A', arquivos: [] })
  const primeiro = anotarNoVisor(vazio, 'p.ts', 1)
  assert.equal(primeiro.caminho, 'p.ts')
  assert.deepEqual(vazio.arquivos, [])
})

test('anotar: corta em 50, saindo o mais velho', () => {
  let v = codigo('v', { terminal: 'A', caminho: 'fora.ts', arquivos: [] }) // à mostra algo que não está na lista
  for (let i = 0; i < 60; i++) v = anotarNoVisor(v, `f${i}.ts`, i)
  assert.equal(v.arquivos!.length, MAX_NA_LISTA)
  assert.equal(v.arquivos![0].caminho, 'f59.ts')
  assert.equal(v.arquivos![49].caminho, 'f10.ts')
  assert.equal(caminhos(v).includes('f9.ts'), false)
  // repetir um que já está na lista não faz ninguém sair
  const igual = anotarNoVisor(v, 'f30.ts', 100)
  assert.equal(igual.arquivos!.length, MAX_NA_LISTA)
  assert.equal(igual.arquivos![49].caminho, 'f10.ts')
  assert.equal(anotarNoVisor(v, 'x.ts', 1, 3).arquivos!.length, 3)
})

test('seguir e fixar: fixo não troca o exibido; o mais novo ou ⟳ voltam a seguir', () => {
  let v = codigo('v', { terminal: 'A', caminho: 'b.ts', arquivos: [{ caminho: 'b.ts', em: 5 }, { caminho: 'a.ts', em: 4 }] })
  assert.equal(exibidoDepois(v, 'n.ts'), 'n.ts') // seguindo (ausente = true)
  assert.equal(exibidoDepois({ ...v, seguindo: true }, 'n.ts'), 'n.ts')
  v = escolherNoVisor(v, 'a.ts') // clicou num antigo
  assert.deepEqual([v.caminho, v.seguindo], ['a.ts', false])
  assert.equal(exibidoDepois(v, 'n.ts'), 'a.ts')
  v = anotarNoVisor(v, 'n.ts', 6)
  assert.equal(v.caminho, 'a.ts') // a lista andou, a tela não
  assert.equal(caminhos(v)[0], 'n.ts')
  const volta = escolherNoVisor(v, 'n.ts') // clicou no mais novo
  assert.equal(volta.caminho, 'n.ts')
  assert.equal('seguindo' in volta, false)
  const seta = seguirDeNovo(v) // ⟳
  assert.equal(seta.caminho, 'n.ts')
  assert.equal(exibidoDepois(seta, 'q.ts'), 'q.ts')
})

test('apagado: continua na lista, marcado; arquivo desconhecido não entra', () => {
  const v = codigo('v', { terminal: 'A', arquivos: [{ caminho: 'b.ts', em: 5 }, { caminho: 'a.ts', em: 4 }] })
  const depois = marcarApagado(v, 'a.ts')
  assert.deepEqual(depois.arquivos, [{ caminho: 'b.ts', em: 5 }, { caminho: 'a.ts', em: 4, sumiu: true }])
  assert.equal(marcarApagado(v, 'zzz.ts'), v)
  assert.equal(marcarApagado(depois, 'a.ts'), depois)
  // gravar de novo o arquivo apagado ressuscita a entrada
  assert.equal(anotarNoVisor(depois, 'a.ts', 9).arquivos![0].sumiu, undefined)
})

test('anotar: o corte nunca tira o arquivo à mostra; sai o mais antigo dos outros', () => {
  const cheia = Array.from({ length: MAX_NA_LISTA }, (_, i) => ({ caminho: `f${i}.ts`, em: 100 - i })) // f49 é o mais antigo
  for (const seguindo of [true, false]) {
    const v = codigo('v', { terminal: 'A', caminho: 'f49.ts', seguindo, arquivos: cheia })
    const depois = anotarNoVisor(v, 'novo.ts', 200)
    assert.equal(depois.arquivos!.length, MAX_NA_LISTA)
    assert.equal(depois.caminho, 'f49.ts')
    assert.equal(depois.arquivos![0].caminho, 'novo.ts')
    assert.equal(caminhos(depois).includes('f49.ts'), true)
    assert.equal(caminhos(depois).includes('f48.ts'), false) // o mais antigo que não é o exibido
    assert.equal(caminhos(depois)[49], 'f49.ts')
  }
})

test('tirar: some da lista; se era o exibido, passa ao mais novo que sobrou (ou a nada)', () => {
  const v = codigo('v', { terminal: 'A', caminho: 'b.ts', arquivos: [{ caminho: 'b.ts', em: 3 }, { caminho: 'a.ts', em: 2 }, { caminho: 'c.ts', em: 1 }] })
  const sem = tirarDoVisor(v, ['a.ts'])
  assert.deepEqual(caminhos(sem), ['b.ts', 'c.ts'])
  assert.equal(sem.caminho, 'b.ts')
  const semExibido = tirarDoVisor(v, ['b.ts'])
  assert.deepEqual(caminhos(semExibido), ['a.ts', 'c.ts'])
  assert.equal(semExibido.caminho, 'a.ts')
  const vazio = tirarDoVisor(v, ['a.ts', 'b.ts', 'c.ts'])
  assert.deepEqual(vazio.arquivos, [])
  assert.equal(vazio.caminho, undefined)
  assert.equal(tirarDoVisor(v, ['zzz.ts']), v, 'nada a tirar: o mesmo visor')
  assert.equal(v.arquivos!.length, 3, 'não mexe na entrada')
})

test('juntar: sem repetir, vale o de maior em, ordenado, e visor sem exibido ganha o primeiro', () => {
  const destino = codigo('d', { terminal: 'A', caminho: 'a.ts', arquivos: [{ caminho: 'a.ts', em: 5 }, { caminho: 'b.ts', em: 1 }] })
  const j = juntarNoVisor(destino, [{ caminho: 'b.ts', em: 7, sumiu: true }, { caminho: 'c.ts', em: 3 }, { caminho: 'a.ts', em: 2 }])
  assert.deepEqual(j.arquivos, [{ caminho: 'b.ts', em: 7, sumiu: true }, { caminho: 'a.ts', em: 5 }, { caminho: 'c.ts', em: 3 }])
  assert.equal(j.caminho, 'a.ts')
  const vazio = codigo('e', { terminal: 'A', arquivos: [] })
  assert.equal(juntarNoVisor(vazio, [{ caminho: 'x.ts', em: 1 }]).caminho, 'x.ts')
  const cheio = juntarNoVisor(destino, Array.from({ length: 80 }, (_, i) => ({ caminho: `n${i}.ts`, em: 100 + i })))
  assert.equal(cheio.arquivos!.length, MAX_NA_LISTA)
  assert.equal(caminhos(cheio).includes('a.ts'), true, 'o exibido não sai no corte')
})

test('migrarEspaco: térreo e andares; idempotente; nada a migrar = o mesmo espaço', () => {
  const nos = (pref: string): No[] => [
    terminal('A'),
    codigo(`${pref}1`, { terminal: 'A', automatico: true, caminho: 'a.ts', criadoEm: hora(1) }),
    codigo(`${pref}2`, { terminal: 'A', automatico: true, caminho: 'b.ts', criadoEm: hora(2) })
  ]
  const espaco = { ...plano(nos('t')), andares: [plano(nos('x')), plano([terminal('B')])] }
  const m = migrarEspaco(espaco)
  assert.notEqual(m, espaco)
  assert.equal(m.nos.filter((n) => n.tipo === 'codigo').length, 1)
  assert.equal(m.andares[0].nos.filter((n) => n.tipo === 'codigo').length, 1)
  assert.equal(m.andares[1], espaco.andares[1], 'andar sem o que migrar fica como está')
  assert.equal(migrarEspaco(m), m, '2ª rodada: a mesma referência')
  const limpo = { ...plano([terminal('A')]), andares: [] }
  assert.equal(migrarEspaco(limpo), limpo)
})
