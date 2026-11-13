import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { decidir, executar } from './atalhos.ts'
import type { Contexto, Executores, TeclaEv } from './atalhos'

const livre: Contexto = { pagina: 'quadro', digitando: false, menuAberto: false, dialogoAberto: false, terminalComTeclado: false, emGesto: false }
const tecla = (key: string, mods: Partial<TeclaEv> = {}): TeclaEv => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods })

/** Registra cada efeito como texto; o "antigo" e o "novo" escrevem no mesmo formato. */
function gravador(): { log: string[]; x: Executores } {
  const log: string[] = []
  const g = (s: string) => () => void log.push(s)
  return {
    log,
    x: {
      devolverFoco: g('devolverFoco'),
      cancelarGesto: g('cancelarGestos'),
      zoom: (f) => void log.push(`zoom:${f}`),
      enquadrarTudo: g('enquadrarTudo'),
      desfazer: g('desfazer'),
      refazer: g('refazer'),
      duplicar: g('duplicarSelecao'),
      selecionarTudo: g('selecionarTudo'),
      agrupar: g('agrupar'),
      desagrupar: g('desagrupar'),
      copiar: (r) => void log.push(r ? 'copiarSelecao:recortar' : 'copiarSelecao'),
      colar: g('colar'),
      paleta: g('abrirPaleta'),
      novaJanela: g('abrirNovaJanela'),
      alternarExplorador: g('alternarExplorador'),
      empurrar: (dx, dy) => void log.push(`empurrar:${dx},${dy}`),
      mostrarAtalhos: g('abrirAtalhos'),
      apagar: g('apagarSelecao'),
      escape: g('escape'),
      borracha: g('borracha'),
      ferramenta: (f) => void log.push(`ferramenta:${f}`)
    }
  }
}

/** O `atalhos()` do App.tsx de 1.6.0 (commit da R5), com os efeitos trocados por registros. */
function antigo(e: TeclaEv, c: Contexto, log: string[]): void {
  const f = (s: string) => () => void log.push(s)
  const desfazer = f('desfazer'), refazer = f('refazer'), duplicarSelecao = f('duplicarSelecao'), selecionarTudo = f('selecionarTudo')
  const agrupar = f('agrupar'), desagrupar = f('desagrupar'), abrirPaleta = f('abrirPaleta'), abrirNovaJanela = f('abrirNovaJanela')
  const alternarExplorador = f('alternarExplorador'), enquadrarTudo = f('enquadrarTudo'), abrirAtalhos = f('abrirAtalhos')
  const apagarSelecao = f('apagarSelecao'), cancelarGestos = f('cancelarGestos')
  const zoomPeloCentro = (n: number | string) => log.push(`zoom:${n}`)
  const copiarSelecao = (r?: boolean) => log.push(r ? 'copiarSelecao:recortar' : 'copiarSelecao')
  const colar = f('colar')
  const empurrarSelecao = (a: number, b: number) => log.push(`empurrar:${a},${b}`)
  const selecionar = (_: null) => log.push('selecionar:null')
  const editar = (_: null) => log.push('editar:null')
  const escolherFerramenta = (n: string) => log.push(`ferramenta:${n}`)
  const definirEstiloDesenho = (_: object) => log.push('borracha')
  const loja = { abrirVistaAndares: (_: boolean) => log.push('abrirVistaAndares:false') }
  const digitando = () => c.digitando
  const menuAberto = () => c.menuAberto
  const emGesto = () => c.emGesto
  const dialogo = c.dialogoAberto
  const terminal = c.terminalComTeclado ? { focus: f('devolverFoco') } : null
  const ev = { ...e, preventDefault: f('preventDefault') }

  // ---- corpo copiado de App.tsx (1.6.0) ----
  if (digitando() || menuAberto() || dialogo) return
  if (terminal) {
    terminal.focus()
    return
  }
  if (emGesto()) {
    if (ev.key === 'Escape') cancelarGestos()
    return
  }
  const ctrl = ev.ctrlKey || ev.metaKey
  const tecla = ev.key.toLowerCase()
  if (ctrl && (ev.key === '=' || ev.key === '+')) return (ev.preventDefault(), void zoomPeloCentro(1.2))
  if (ctrl && ev.key === '-') return (ev.preventDefault(), void zoomPeloCentro(1 / 1.2))
  if (ctrl && ev.key === '0') return (ev.preventDefault(), void zoomPeloCentro('inicial'))
  if (ctrl && ev.key === '1') return (ev.preventDefault(), enquadrarTudo())
  if (ctrl && tecla === 'z') return (ev.preventDefault(), ev.shiftKey ? refazer() : desfazer())
  if (ctrl && tecla === 'y') return (ev.preventDefault(), refazer())
  if (ctrl && tecla === 'd') return (ev.preventDefault(), duplicarSelecao())
  if (ctrl && tecla === 'a') return (ev.preventDefault(), selecionarTudo())
  if (ctrl && tecla === 'g') return (ev.preventDefault(), ev.shiftKey ? desagrupar() : agrupar())
  if (ctrl && tecla === 'c') return (ev.preventDefault(), void copiarSelecao())
  if (ctrl && tecla === 'x') return (ev.preventDefault(), void copiarSelecao(true))
  if (ctrl && tecla === 'v') return (ev.preventDefault(), void colar())
  if (ctrl && tecla === 'k') return (ev.preventDefault(), abrirPaleta())
  if (ctrl && ev.shiftKey && tecla === 'n') return (ev.preventDefault(), abrirNovaJanela())
  if (ctrl && ev.shiftKey && tecla === 'e') return (ev.preventDefault(), alternarExplorador())
  if (ctrl || ev.altKey) return
  const seta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (seta[ev.key]) {
    ev.preventDefault()
    const passo = ev.shiftKey ? 10 : 1
    return void empurrarSelecao(seta[ev.key][0] * passo, seta[ev.key][1] * passo)
  }
  if (ev.key === '?') return abrirAtalhos()
  if (ev.key === 'Delete' || ev.key === 'Backspace') return apagarSelecao()
  if (ev.key === 'Escape') {
    cancelarGestos()
    selecionar(null)
    editar(null)
    loja.abrirVistaAndares(false)
    return void escolherFerramenta('selecionar')
  }
  if (tecla === 'e') return void definirEstiloDesenho({ ferramenta: 'borracha' })
  const porTecla: Record<string, string> = { v: 'selecionar', n: 'postit', t: 'texto', d: 'desenho' }
  const ferramenta = porTecla[tecla]
  if (ferramenta) escolherFerramenta(ferramenta)
}

/** O efeito da decisão nova; `escape` é o que o executor do App faz (5 passos), aqui aberto no mesmo registro. */
function novo(e: TeclaEv, c: Contexto): string[] {
  const { log, x } = gravador()
  x.escape = () => void log.push('cancelarGestos', 'selecionar:null', 'editar:null', 'abrirVistaAndares:false', 'ferramenta:selecionar')
  x.borracha = () => void log.push('borracha')
  const d = decidir(e, c)
  if (!d) return log
  if (d.prevenir) log.push('preventDefault')
  executar(d.acao, x)
  return log
}

// Tabela tecla → efeito, escrita à mão a partir do código antigo (a documentada no handoff).
const TABELA: Array<[string, Partial<TeclaEv>, string[]]> = [
  ['=', { ctrlKey: true }, ['preventDefault', 'zoom:1.2']],
  ['+', { ctrlKey: true }, ['preventDefault', 'zoom:1.2']],
  ['-', { ctrlKey: true }, ['preventDefault', `zoom:${1 / 1.2}`]],
  ['0', { ctrlKey: true }, ['preventDefault', 'zoom:inicial']],
  ['1', { ctrlKey: true }, ['preventDefault', 'enquadrarTudo']],
  ['z', { ctrlKey: true }, ['preventDefault', 'desfazer']],
  ['z', { ctrlKey: true, shiftKey: true }, ['preventDefault', 'refazer']],
  ['y', { ctrlKey: true }, ['preventDefault', 'refazer']],
  ['d', { ctrlKey: true }, ['preventDefault', 'duplicarSelecao']],
  ['a', { ctrlKey: true }, ['preventDefault', 'selecionarTudo']],
  ['g', { ctrlKey: true }, ['preventDefault', 'agrupar']],
  ['g', { ctrlKey: true, shiftKey: true }, ['preventDefault', 'desagrupar']],
  ['c', { ctrlKey: true }, ['preventDefault', 'copiarSelecao']],
  ['x', { ctrlKey: true }, ['preventDefault', 'copiarSelecao:recortar']],
  ['v', { ctrlKey: true }, ['preventDefault', 'colar']],
  ['k', { ctrlKey: true }, ['preventDefault', 'abrirPaleta']],
  ['N', { ctrlKey: true, shiftKey: true }, ['preventDefault', 'abrirNovaJanela']],
  ['E', { ctrlKey: true, shiftKey: true }, ['preventDefault', 'alternarExplorador']],
  ['z', { metaKey: true }, ['preventDefault', 'desfazer']],
  ['ArrowLeft', {}, ['preventDefault', 'empurrar:-1,0']],
  ['ArrowRight', {}, ['preventDefault', 'empurrar:1,0']],
  ['ArrowUp', {}, ['preventDefault', 'empurrar:0,-1']],
  ['ArrowDown', {}, ['preventDefault', 'empurrar:0,1']],
  ['ArrowLeft', { shiftKey: true }, ['preventDefault', 'empurrar:-10,0']],
  ['ArrowDown', { shiftKey: true }, ['preventDefault', 'empurrar:0,10']],
  ['?', { shiftKey: true }, ['abrirAtalhos']],
  ['Delete', {}, ['apagarSelecao']],
  ['Backspace', {}, ['apagarSelecao']],
  ['Escape', {}, ['cancelarGestos', 'selecionar:null', 'editar:null', 'abrirVistaAndares:false', 'ferramenta:selecionar']],
  ['e', {}, ['borracha']],
  ['E', { shiftKey: true }, ['borracha']],
  ['v', {}, ['ferramenta:selecionar']],
  ['n', {}, ['ferramenta:postit']],
  ['t', {}, ['ferramenta:texto']],
  ['d', {}, ['ferramenta:desenho']]
]

test('tecla a tecla: cada linha da tabela dá o efeito de antes, com o quadro ativo', () => {
  for (const [key, mods, esperado] of TABELA) {
    assert.deepEqual(novo(tecla(key, mods), livre), esperado, `${JSON.stringify(mods)} ${key}`)
    const log: string[] = []
    antigo(tecla(key, mods), livre, log)
    assert.deepEqual(log, esperado, `(antigo) ${JSON.stringify(mods)} ${key}`)
  }
})

test('com Alt, ou sem atalho, nada acontece (e o evento segue)', () => {
  const casos: Array<[string, Partial<TeclaEv>]> = [['d', { altKey: true }], ['ArrowLeft', { altKey: true }], ['Delete', { altKey: true }], ['q', {}], ['Enter', {}], ['F5', {}], ['2', { ctrlKey: true }]]
  for (const [key, mods] of casos) assert.deepEqual(novo(tecla(key, mods), livre), [], `${JSON.stringify(mods)} ${key}`)
})

const TECLAS = [
  '=', '+', '-', '0', '1', '2', 'z', 'Z', 'y', 'd', 'D', 'a', 'g', 'G', 'c', 'x', 'v', 'k', 'n', 'N', 'e', 'E', 't', 'T', 'V',
  'q', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '?', 'Delete', 'Backspace', 'Escape', 'Enter', 'Tab', ' ', 'F5', 'Shift', 'Control'
]
const bool = [false, true]

test('equivalência total com o App de antes: teclas × modificadores × contextos (quadro ativo)', () => {
  let casos = 0
  for (const key of TECLAS)
    for (const ctrlKey of bool) for (const metaKey of bool) for (const altKey of bool) for (const shiftKey of bool)
      for (const digitando of bool) for (const menuAberto of bool) for (const dialogoAberto of bool)
        for (const terminalComTeclado of bool) for (const emGesto of bool) {
          const e = { key, ctrlKey, metaKey, altKey, shiftKey }
          const c = { pagina: 'quadro', digitando, menuAberto, dialogoAberto, terminalComTeclado, emGesto }
          const antes: string[] = []
          antigo(e, c, antes)
          assert.deepEqual(novo(e, c), antes, JSON.stringify({ e, c }))
          casos++
        }
  assert.equal(casos, TECLAS.length * 512)
})

test('com outra página ativa, nenhuma tecla vira ação (nem preventDefault)', () => {
  for (const key of TECLAS)
    for (const ctrlKey of bool) for (const shiftKey of bool) for (const altKey of bool)
      for (const pagina of ['outra', 'terminais', '']) {
        const e = tecla(key, { ctrlKey, shiftKey, altKey })
        assert.equal(decidir(e, { ...livre, pagina }), null, `${pagina} ${key}`)
        // vale também com terminal em foco ou em gesto: o gate da página vem primeiro
        assert.equal(decidir(e, { ...livre, pagina, terminalComTeclado: true, emGesto: true }), null)
      }
  const casos: Array<[string, Partial<TeclaEv>]> = [['Delete', {}], ['v', {}], ['n', {}], ['t', {}], ['d', {}], ['e', {}], ['z', { ctrlKey: true }]]
  for (const [key, mods] of casos) assert.equal(novo(tecla(key, mods), { ...livre, pagina: 'outra' }).length, 0, key)
})

test('menu aberto ou .dialogo-fundo: calado, até Esc e Delete', () => {
  const casos: Array<[string, Partial<TeclaEv>]> = [['Escape', {}], ['Delete', {}], ['z', { ctrlKey: true }], ['v', {}], ['ArrowLeft', {}]]
  for (const [key, mods] of casos) {
    assert.equal(decidir(tecla(key, mods), { ...livre, menuAberto: true }), null, `menu ${key}`)
    assert.equal(decidir(tecla(key, mods), { ...livre, dialogoAberto: true }), null, `dialogo ${key}`)
    assert.equal(decidir(tecla(key, mods), { ...livre, digitando: true }), null, `digitando ${key}`)
  }
})

test('no meio de um gesto só o Esc age; com o terminal em foco, só devolve o foco', () => {
  assert.deepEqual(novo(tecla('Escape'), { ...livre, emGesto: true }), ['cancelarGestos'])
  assert.deepEqual(novo(tecla('z', { ctrlKey: true }), { ...livre, emGesto: true }), [])
  assert.deepEqual(novo(tecla('Delete'), { ...livre, terminalComTeclado: true }), ['devolverFoco'])
})
