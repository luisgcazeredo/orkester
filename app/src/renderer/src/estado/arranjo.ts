import { type No, type Plano } from '../../../shared/modelo'
import { membrosDaBanda } from '../../../shared/quadro/bandas'
import { type Caixa, caixaDoDesenho, caixaDoNo, uniao } from '../quadro/geometria'
import { arvoreDoCodigo } from './codigo'
import { novoId } from './nos'
import { type Alvo, definir, estado, mudarPlano, NADA, planoAtual, registrarHistorico } from './nucleo'
import { gruposDa, selecionar } from './selecao'

// ---------- mover, apagar, agrupar e alinhar a seleção ----------

/** Onde cada item estava quando o arrasto começou. */
export interface Posicoes {
  nos: Array<{ id: string; x: number; y: number }>
  desenhos: Array<{ id: string; pontos: Array<[number, number]> }>
}

/** Posições da seleção; cartões travados ficam fora (não saem do lugar). */
export function posicoesDaSelecao(): Posicoes {
  const plano = planoAtual()
  const s = estado.selecao
  if (!plano) return { nos: [], desenhos: [] }
  // o agente leva os arquivos dele junto, como os ramos de um mapa mental vão com o nó que os segura
  const escolhidos = new Set(s.nos)
  // e a moldura de uma banda leva o time que está dentro dela: mover a banda é mover o time
  for (const n of plano.nos) {
    if (n.tipo === 'banda' && escolhidos.has(n.id)) for (const membro of membrosDaBanda(plano, n.id)) escolhidos.add(membro.id)
  }
  for (const n of plano.nos) {
    if (n.tipo === 'codigo' && n.automatico && n.terminal && escolhidos.has(n.terminal)) escolhidos.add(n.id)
  }
  return {
    nos: plano.nos.filter((n) => escolhidos.has(n.id) && !n.travado).map(({ id, x, y }) => ({ id, x, y })),
    desenhos: plano.desenhos.filter((d) => s.desenhos.includes(d.id)).map(({ id, pontos }) => ({ id, pontos }))
  }
}

/** Os cartões de código que o app arruma para um agente — o que anda junto quando você pega a bolinha. */
export function posicoesDaColuna(terminalId: string, arvoreId: string): Posicoes {
  const plano = planoAtual()
  if (!plano) return { nos: [], desenhos: [] }
  return {
    nos: plano.nos
      .filter(
        (n) =>
          n.tipo === 'codigo' && n.automatico && n.terminal === terminalId && arvoreDoCodigo(n) === arvoreId && !n.travado
      )
      .map(({ id, x, y }) => ({ id, x, y })),
    desenhos: []
  }
}

/** Põe cada item na posição original + (dx, dy). Mudanças com a mesma `chave` (um arrasto) são um passo de desfazer. */
export function moverItens(originais: Posicoes, dx: number, dy: number, chave: string): void {
  const plano = planoAtual()
  if (!plano) return
  dx = Math.round(dx)
  dy = Math.round(dy)
  const nos = new Map(originais.nos.map((o) => [o.id, o]))
  const desenhos = new Map(originais.desenhos.map((o) => [o.id, o]))
  const parado =
    plano.nos.every((n) => {
      const o = nos.get(n.id)
      return !o || (n.x === o.x + dx && n.y === o.y + dy)
    }) &&
    plano.desenhos.every((d) => {
      const o = desenhos.get(d.id)
      return !o || (d.pontos[0]?.[0] === o.pontos[0]?.[0] + dx && d.pontos[0]?.[1] === o.pontos[0]?.[1] + dy)
    })
  if (parado) return
  mudarPlano(
    (p) => ({
      ...p,
      nos: p.nos.map((n) => {
        const o = nos.get(n.id)
        if (!o) return n
        return { ...n, x: o.x + dx, y: o.y + dy } as No
      }),
      desenhos: p.desenhos.map((d) => {
        const o = desenhos.get(d.id)
        return o ? { ...d, pontos: o.pontos.map(([x, y]) => [x + dx, y + dy] as [number, number]) } : d
      })
    }),
    chave
  )
}

/** Setas do teclado: empurra a seleção. Toques seguidos viram um passo de desfazer. */
export function empurrarSelecao(dx: number, dy: number): void {
  moverItens(posicoesDaSelecao(), dx, dy, 'setas')
}

/** Apaga o que está selecionado. Cartão travado não sai (destrave antes) e continua selecionado. */
export function apagarSelecao(): void {
  const { selecao } = estado
  const plano = planoAtual()
  if (!plano) return
  const nos = new Set(plano.nos.filter((n) => selecao.nos.includes(n.id) && !n.travado).map((n) => n.id))
  const desenhos = new Set(selecao.desenhos)
  if (!nos.size && !desenhos.size && !selecao.corda) return
  registrarHistorico()
  mudarPlano(
    (p) =>
      semGruposSozinhos({
        ...p,
        nos: p.nos.filter((n) => !nos.has(n.id)),
        cordas: p.cordas.filter((c) => c.id !== selecao.corda && !nos.has(c.de) && !nos.has(c.para)),
        desenhos: p.desenhos.filter((d) => !desenhos.has(d.id))
      }),
    false
  )
  const notas = { ...estado.notas }
  for (const n of plano.nos) if (n.tipo === 'postit' && nos.has(n.id)) delete notas[n.arquivo]
  definir({ notas, selecao: { ...NADA, nos: selecao.nos.filter((id) => !nos.has(id)) }, editando: null })
}

export function apagar(alvo: Alvo): void {
  selecionar(alvo, { sozinho: true })
  apagarSelecao()
}

const semGrupo = <T extends { grupo?: string }>(item: T): T => ({ ...item, grupo: undefined })

/** Grupo com um item só deixa de ser grupo (depois de apagar, tirar ou reagrupar parte dele). */
export function semGruposSozinhos(p: Plano): Plano {
  const contagem = new Map<string, number>()
  for (const i of [...p.nos, ...p.desenhos]) if (i.grupo) contagem.set(i.grupo, (contagem.get(i.grupo) ?? 0) + 1)
  const sozinho = (i: { grupo?: string }): boolean => !!i.grupo && contagem.get(i.grupo)! < 2
  if (![...p.nos, ...p.desenhos].some(sozinho)) return p
  return { ...p, nos: p.nos.map((n) => (sozinho(n) ? semGrupo(n) : n)), desenhos: p.desenhos.map((d) => (sozinho(d) ? semGrupo(d) : d)) }
}

/** Agrupa a seleção (2 itens ou mais): passam a ser selecionados e movidos juntos. */
export function agrupar(): void {
  const s = estado.selecao
  if (s.nos.length + s.desenhos.length < 2) return
  const grupo = novoId()
  mudarPlano((p) =>
    semGruposSozinhos({
      ...p,
      nos: p.nos.map((n) => (s.nos.includes(n.id) ? { ...n, grupo } : n)),
      desenhos: p.desenhos.map((d) => (s.desenhos.includes(d.id) ? { ...d, grupo } : d))
    })
  )
}

/** Desfaz os grupos que a seleção toca: cada item volta a ser solto (e continua selecionado). */
export function desagrupar(): void {
  const plano = planoAtual()
  if (!plano) return
  const grupos = gruposDa(plano, estado.selecao)
  if (!grupos.size) return
  const sai = (i: { grupo?: string }): boolean => !!i.grupo && grupos.has(i.grupo)
  mudarPlano((p) => ({
    ...p,
    nos: p.nos.map((n) => (sai(n) ? semGrupo(n) : n)),
    desenhos: p.desenhos.map((d) => (sai(d) ? semGrupo(d) : d))
  }))
}

/** Tira só os itens selecionados do grupo deles. Grupo que sobra com um item só deixa de existir. */
export function tirarDoGrupo(): void {
  const s = estado.selecao
  mudarPlano((p) =>
    semGruposSozinhos({
      ...p,
      nos: p.nos.map((n) => (s.nos.includes(n.id) ? semGrupo(n) : n)),
      desenhos: p.desenhos.map((d) => (s.desenhos.includes(d.id) ? semGrupo(d) : d))
    })
  )
}

/** Peças da seleção para alinhar: cada grupo é uma peça só (não se desmancha), cada item solto é uma. */
function pecasDaSelecao(): Array<{ caixa: Caixa; nos: string[]; desenhos: string[] }> {
  const plano = planoAtual()
  const s = estado.selecao
  if (!plano) return []
  const pecas = new Map<string, { caixas: Caixa[]; nos: string[]; desenhos: string[] }>()
  const peca = (chave: string): { caixas: Caixa[]; nos: string[]; desenhos: string[] } => {
    if (!pecas.has(chave)) pecas.set(chave, { caixas: [], nos: [], desenhos: [] })
    return pecas.get(chave)!
  }
  for (const n of plano.nos) {
    if (!s.nos.includes(n.id) || n.travado) continue
    const p = peca(n.grupo ?? n.id)
    p.caixas.push(caixaDoNo(n))
    p.nos.push(n.id)
  }
  for (const d of plano.desenhos) {
    if (!s.desenhos.includes(d.id)) continue
    const p = peca(d.grupo ?? d.id)
    p.caixas.push(caixaDoDesenho(d))
    p.desenhos.push(d.id)
  }
  return [...pecas.values()].map((p) => ({ caixa: uniao(p.caixas)!, nos: p.nos, desenhos: p.desenhos }))
}

function deslocarPecas(deslocamentos: Array<{ nos: string[]; desenhos: string[]; dx: number; dy: number }>): void {
  const porNo = new Map<string, [number, number]>()
  const porDesenho = new Map<string, [number, number]>()
  for (const d of deslocamentos) {
    const dx = Math.round(d.dx)
    const dy = Math.round(d.dy)
    d.nos.forEach((id) => porNo.set(id, [dx, dy]))
    d.desenhos.forEach((id) => porDesenho.set(id, [dx, dy]))
  }
  mudarPlano((p) => ({
    ...p,
    nos: p.nos.map((n) => {
      const d = porNo.get(n.id)
      return d ? { ...n, x: n.x + d[0], y: n.y + d[1] } : n
    }),
    desenhos: p.desenhos.map((desenho) => {
      const d = porDesenho.get(desenho.id)
      return d ? { ...desenho, pontos: desenho.pontos.map(([x, y]) => [x + d[0], y + d[1]] as [number, number]) } : desenho
    })
  }))
}

export type Alinhamento = 'esquerda' | 'centro' | 'direita' | 'topo' | 'meio' | 'base'

export function alinhar(como: Alinhamento): void {
  const pecas = pecasDaSelecao()
  if (pecas.length < 2) return
  const t = uniao(pecas.map((p) => p.caixa))!
  deslocarPecas(
    pecas.map(({ caixa: c, nos, desenhos }) => {
      const alvoX = { esquerda: t.x, centro: t.x + (t.largura - c.largura) / 2, direita: t.x + t.largura - c.largura }
      const alvoY = { topo: t.y, meio: t.y + (t.altura - c.altura) / 2, base: t.y + t.altura - c.altura }
      const dx = como in alvoX ? alvoX[como as keyof typeof alvoX] - c.x : 0
      const dy = como in alvoY ? alvoY[como as keyof typeof alvoY] - c.y : 0
      return { nos, desenhos, dx, dy }
    })
  )
}

/** Espaço igual entre as peças, da primeira à última (as pontas ficam onde estão). */
export function distribuir(eixo: 'x' | 'y'): void {
  const pecas = pecasDaSelecao()
  if (pecas.length < 3) return
  const inicio = (c: Caixa): number => (eixo === 'x' ? c.x : c.y)
  const tamanho = (c: Caixa): number => (eixo === 'x' ? c.largura : c.altura)
  pecas.sort((a, b) => inicio(a.caixa) - inicio(b.caixa))
  const primeira = pecas[0].caixa
  const fim = Math.max(...pecas.map((p) => inicio(p.caixa) + tamanho(p.caixa)))
  const vao = (fim - inicio(primeira) - pecas.reduce((t, p) => t + tamanho(p.caixa), 0)) / (pecas.length - 1)
  let cursor = inicio(primeira)
  deslocarPecas(
    pecas.map(({ caixa, nos, desenhos }) => {
      const delta = cursor - inicio(caixa)
      cursor += tamanho(caixa) + vao
      return { nos, desenhos, dx: eixo === 'x' ? delta : 0, dy: eixo === 'y' ? delta : 0 }
    })
  )
}
