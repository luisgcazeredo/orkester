import { type Corda, type Desenho } from '../../../shared/modelo'
import { proximoZ } from '../../../shared/quadro/geometria'
import { distanciaAoDesenho } from '../quadro/geometria'
import { semGruposSozinhos } from './arranjo'
import { agora, novoId } from './nos'
import { mudarPlano, planoAtual } from './nucleo'

// ---------- cordas e desenhos ----------

/** Só terminal com terminal, sem repetir e sem ligar um terminal nele mesmo. */
export function ligar(de: string, para: string): boolean {
  const plano = planoAtual()
  if (!plano || de === para) return false
  // a corda liga agentes, e também uma banda: nela, a corda vale para cada agente de dentro da moldura
  const podeLigar = (id: string): boolean => plano.nos.some((n) => n.id === id && (n.tipo === 'terminal' || n.tipo === 'banda'))
  if (!podeLigar(de) || !podeLigar(para)) return false
  const existe = plano.cordas.some((c) => (c.de === de && c.para === para) || (c.de === para && c.para === de))
  if (existe) return false
  const corda: Corda = { id: novoId(), de, para, criadoEm: agora() }
  mudarPlano((p) => ({ ...p, cordas: [...p.cordas, corda] }))
  return true
}

export function adicionarDesenho(desenho: Omit<Desenho, 'id' | 'z'>): void {
  const plano = planoAtual()
  if (!plano) return
  mudarPlano((p) => ({ ...p, desenhos: [...p.desenhos, { ...desenho, id: novoId(), z: proximoZ(plano) }] }))
}

export function definirCorDesenho(id: string, cor: string): void {
  mudarPlano((p) => ({ ...p, desenhos: p.desenhos.map((d) => (d.id === id ? { ...d, cor } : d)) }))
}

/** Borracha: apaga os traços a até `raio` (em unidades do quadro) do ponto. Um gesto = um passo de desfazer. */
export function apagarDesenhosPerto(x: number, y: number, raio: number, chaveDoGesto: string): number {
  const plano = planoAtual()
  if (!plano) return 0
  const tocados = plano.desenhos.filter((d) => distanciaAoDesenho(d, { x, y }) <= raio + d.espessura / 2)
  if (!tocados.length) return 0
  const fora = new Set(tocados.map((d) => d.id))
  mudarPlano((p) => semGruposSozinhos({ ...p, desenhos: p.desenhos.filter((d) => !fora.has(d.id)) }), chaveDoGesto)
  return tocados.length
}
