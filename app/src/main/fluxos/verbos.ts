// `ork fluxo` (agente, pelo crachá) e as ferramentas `fluxo_*` do MCP (usuário, pela chave; agente, pelo crachá).
// Tudo passa pelo serviço (main/fluxos/servico.ts), que já tem as regras de sensível: agente e cliente MCP gravam,
// mas o fluxo com Código, HTTP ou comando fica desligado, e só o usuário o liga, pela página.
//
// Aqui fica o que é do agente: o alcance nó a nó ao gravar (`prenderFluxoAoAlcance`) e o `foraDoAlcance` do motor,
// com quem está ligado a quem vindo das sessões vivas. O serviço chega como parâmetro (não importamos main/fluxos/index,
// que importa este arquivo para o motor).
import type { AutorDaMudanca, EventoDeAutomacao, VereditoDoAlcance } from '../../shared/automacoes'
import { nomeNoCabecalho } from '../../shared/automacoes'
import type { ResumoDeFluxo } from '../../shared/api'
import { chaveDoNome, ehSensivel, exportar, faltaParaLigar, lerExportado, resolverReferencias, type Execucao, type FluxoGravado, type ResumoDaExecucao } from '../../shared/fluxos/formato'
import { CATALOGO } from '../../shared/fluxos/nos'
import { rotinasSalvas } from '../dados'
import { ligadosA } from '../espera'
import { colunasDoKanban, maestroDo } from '../kanban'
import { sessaoPorId, sessoesDoEspaco, type Sessao } from '../terminais'
import { prenderFluxoAoAlcance, vereditoDoAlcance } from './alcance'
import { DESLIGADO_POR_NO_SENSIVEL, type FluxoGravadoComAviso, type ServicoDeFluxos } from './servico'

// ---------- quem é quem no espaço ----------

const nomeDoCartao = (espacoId: string, id: string): string => sessaoPorId(id)?.espec.nome ?? rotinasSalvas(espacoId).nomes[id] ?? 'cartão que sumiu'

/** Os cartões do espaço (guardados e vivos), para resolver um fluxo mandado só com nomes. */
function cartoesDoEspaco(espacoId: string): { id: string; nome: string }[] {
  const nomes: Record<string, string> = { ...rotinasSalvas(espacoId).nomes }
  for (const s of sessoesDoEspaco(espacoId)) nomes[s.id] = s.espec.nome
  return Object.entries(nomes).map(([id, nome]) => ({ id, nome }))
}

/** Os ids ao alcance do cartão agora (cordas e os que ele abriu); `null` = sem sessão aberta neste espaço. */
function alcanceDoCartao(espacoId: string, id: string): Set<string> | null {
  const s = sessaoPorId(id)
  if (!s || s.fim || s.espacoId !== espacoId || !s.processo) return null
  return new Set(ligadosA(s).map((x) => x.id))
}

/** O motor pergunta a cada disparo: o fluxo de agente ainda alcança o que o evento e os nós tocam? */
export function foraDoAlcance(espacoId: string, fluxo: FluxoGravado, evento: EventoDeAutomacao): VereditoDoAlcance {
  return vereditoDoAlcance(fluxo, evento, {
    alcanceDe: (agente) => alcanceDoCartao(espacoId, agente),
    saiuDoQuadro: (agente) => !sessaoPorId(agente) && !(agente in rotinasSalvas(espacoId).nomes),
    destino: (d) => (d === 'maestro' ? maestroDo(espacoId)?.id : d),
    nome: (id) => nomeDoCartao(espacoId, id)
  })
}

// ---------- ler o que veio ----------

function jsonDoFluxo(texto: string, uso: string): unknown {
  if (!texto.trim()) throw new Error(`falta o fluxo: ${uso} (o JSON do \`ork fluxo ver "Nome" --json\`)`)
  try {
    return JSON.parse(texto)
  } catch (e) {
    throw new Error(`o arquivo não é um JSON válido (${e instanceof Error ? e.message : String(e)})`)
  }
}

/** Agente: os cartões citados são resolvidos para o espaço e precisam estar ao alcance dele. Usuário: passa como veio. */
function presoAoAlcance(espacoId: string, bruto: unknown, eu: Sessao | undefined): unknown {
  if (!eu) return bruto
  const lido = lerExportado(bruto)
  if (!lido.ok) throw new Error(lido.motivo)
  const resolvido = resolverReferencias(lido.fluxo, { cartoes: cartoesDoEspaco(espacoId), colunas: colunasDoKanban(espacoId) })
  const r = prenderFluxoAoAlcance(resolvido, {
    agente: eu.id,
    alcance: new Set(ligadosA(eu).map((s) => s.id)),
    maestro: maestroDo(espacoId)?.id,
    nome: (id) => nomeDoCartao(espacoId, id)
  })
  if (typeof r === 'string') throw new Error(r)
  // o "rede" do JSON segue até o serviço, que o ignora (só o usuário na página muda) e devolve o aviso
  const rede = bruto && typeof bruto === 'object' ? (bruto as { rede?: unknown }).rede : undefined
  return rede === undefined ? r : { ...r, rede }
}

function acharFluxo(servico: ServicoDeFluxos, espacoId: string, nome: string): FluxoGravado {
  const procurado = nome.trim()
  if (!procurado) throw new Error('diga qual fluxo: o nome dele (veja `ork fluxo listar`)')
  const lista = servico.listar(espacoId).fluxos
  const k = chaveDoNome(procurado)
  const exatos = lista.filter((f) => chaveDoNome(f.nome) === k || f.id === procurado)
  const candidatos = exatos.length ? exatos : lista.filter((f) => chaveDoNome(f.nome).startsWith(k))
  if (candidatos.length > 1) throw new Error(`mais de um fluxo com "${procurado}": ${candidatos.map((f) => `"${f.nome}"`).join(', ')}`)
  const f = candidatos.length ? servico.ler(espacoId, candidatos[0].id) : null
  if (f) return f
  throw new Error(`não há fluxo "${procurado}" neste espaço. Fluxos: ${lista.map((x) => `"${x.nome}"`).join(', ') || 'nenhum'}`)
}

// ---------- textos ----------

const MOTIVOS: Record<string, string> = { excesso: 'disparou demais', 'cartao-sumiu': 'um cartão dele sumiu', 'mudou-sem-aprovacao': 'nó sensível mudou sem aprovação', 'coluna-sumiu': 'uma coluna dele saiu do kanban' }
const rotulo = (tipo: string): string => CATALOGO[tipo as keyof typeof CATALOGO]?.rotulo ?? tipo
const curto = (t: string, max: number): string => (t.length > max ? `${t.slice(0, max - 1)}…` : t)

function linhaDoResumo(f: ResumoDeFluxo, pastas: Map<string, string>): string {
  const partes = [
    `${f.ligado ? '●' : '○'} "${f.nome}"`,
    f.ligado ? 'ligado' : `desligado${f.desligadoPor ? ` (${MOTIVOS[f.desligadoPor.motivo] ?? f.desligadoPor.motivo})` : ''}`,
    `${f.nos} nós`,
    `gatilhos: ${f.gatilhos.map(rotulo).join(', ') || 'nenhum'}`
  ]
  if (f.pasta) partes.push(`pasta "${pastas.get(f.pasta) ?? '?'}"`)
  if (f.sensivel) partes.push('sensível (Código, HTTP ou comando)')
  if (f.ultima) partes.push(`última: ${f.ultima.resultado} em ${f.ultima.inicio}`)
  return partes.join(' · ')
}

function textoDoFluxo(f: FluxoGravado): string {
  const nomeDe = (id: string): string => f.nos.find((n) => n.id === id)?.nome ?? id
  const autor = [f.criadoPor ? `criado por ${f.criadoPor.nome}` : '', f.editadoPor ? `editado por ${f.editadoPor.nome}` : ''].filter(Boolean).join(', ')
  const linhas = [
    `"${f.nome}" · ${f.ligado ? 'ligado' : 'desligado'} · até ${f.limite.porHora} disparos por hora${autor ? ` · ${autor}` : ''}`,
    ...(ehSensivel(f) ? ['Sensível (Código, HTTP ou comando): só o usuário liga, pela página Fluxos.'] : []),
    'Nós:',
    // a credencial do HTTP é só o nome dela: o valor nunca entra no fluxo
    ...f.nos.map((n) => `  ${n.id} "${n.nome}" · ${rotulo(n.tipo)} · ${curto(JSON.stringify(n.ajustes), 200)}`),
    'Ligações:',
    ...(f.ligacoes.length ? f.ligacoes.map((l) => `  "${nomeDe(l.de)}"${l.saida ? ` (saída ${l.saida})` : ''} → "${nomeDe(l.para)}"`) : ['  nenhuma'])
  ]
  const falta = f.ligado ? null : faltaParaLigar(f)
  if (falta) linhas.push(`Para ligar: ${falta}`)
  linhas.push('O JSON inteiro (para editar): ork fluxo ver "Nome" --json')
  return linhas.join('\n')
}

function textoDaExecucao(ex: Execucao, f: FluxoGravado): string {
  const nomeDe = (id: string): string => f.nos.find((n) => n.id === id)?.nome ?? id
  const linhas = [`Execução ${ex.id} · ${ex.resultado} · ${ex.ms} ms${ex.detalhe ? ` · ${ex.detalhe}` : ''}`]
  for (const id of ex.caminho) {
    const n = ex.nos[id]
    if (!n) continue
    const extra = [n.erro ? `erro: ${n.erro}` : '', n.recado ? `recado: ${n.recado}` : ''].filter(Boolean).join(' · ')
    linhas.push(`  ${n.estado} "${nomeDe(id)}" · ${n.itens.entrada} → ${n.itens.saidas.join('/')} itens${extra ? ` · ${curto(extra, 300)}` : ''}`)
  }
  return linhas.join('\n')
}

const linhaDaExecucao = (e: ResumoDaExecucao): string =>
  `  ${e.inicio} · ${e.modo} · ${e.resultado} · ${e.ms} ms · ${e.gatilho}${e.noComErro ? ` · erro em "${e.noComErro}"` : ''}${e.erro ? `: ${curto(e.erro, 200)}` : ''}${e.detalhe ? ` · ${curto(e.detalhe, 200)}` : ''}`

/** Depois de gravar: ligado, ou o que falta para ligar (e quem pode). */
function comoFicou(g: FluxoGravadoComAviso, autor: AutorDaMudanca): string {
  if (g.ligado) return 'ligado'
  // o usuário (chave) mudou um nó sensível de um fluxo ligado: aprovar de novo é na página (D8)
  if (g.desligado === DESLIGADO_POR_NO_SENSIVEL) return `${g.desligado}, na página Fluxos`
  if (ehSensivel(g) && autor.tipo !== 'usuario') return 'desligado: tem Código, HTTP ou comando, e só o usuário liga, na página Fluxos'
  const falta = faltaParaLigar(g)
  return falta ? `desligado; para ligar: ${falta}` : `desligado; ligue com \`ork fluxo ligar "${g.nome}"\``
}

// ---------- os comandos ----------

export const ACOES_DO_FLUXO = ['listar', 'ver', 'criar', 'editar', 'ligar', 'desligar', 'rodar', 'execucoes', 'apagar'] as const

/**
 * `ork fluxo <ação> [nome] [opções]`. `eu` = o cartão do agente (para o alcance); sem ele, é o usuário pela chave.
 * O `texto` é o conteúdo do `--arquivo` (o CLI lê) ou o JSON que a ferramenta MCP mandou.
 */
export async function rodarFluxo(
  servico: ServicoDeFluxos,
  espacoId: string,
  autor: AutorDaMudanca,
  pos: string[],
  opcoes: Record<string, string | number | true>,
  texto: string,
  eu?: Sessao
): Promise<string> {
  const acao = String(pos[0] ?? 'listar').toLowerCase().replace('execuções', 'execucoes')
  const nome = pos.slice(1).join(' ').trim()

  if (acao === 'listar' || (acao === 'ver' && !nome)) {
    const l = servico.listar(espacoId)
    const pastas = new Map(l.pastas.map((p) => [p.id, p.nome]))
    const linhas = l.fluxos.map((f) => linhaDoResumo(f, pastas))
    if (l.invalidos.length) linhas.push('', 'Arquivos que não abrem (não rodam):', ...l.invalidos.map((i) => `  ${i.arquivo}: ${i.motivo}`))
    return linhas.join('\n') || 'Não há fluxos neste espaço. Crie com `ork fluxo criar --arquivo fluxo.json` (veja `ork ajuda fluxo`).'
  }

  switch (acao) {
    case 'ver': {
      const f = acharFluxo(servico, espacoId, nome)
      // igual à exportação (o Ctrl+C da página): sem id, ligado, pasta, autor, teto, rede nem aprovação
      return opcoes.json === true ? JSON.stringify(exportar(f), null, 2) : textoDoFluxo(f)
    }
    case 'criar': {
      if (nome) throw new Error('o nome vai dentro do JSON: ork fluxo criar --arquivo fluxo.json [--pasta "P"]')
      const bruto = presoAoAlcance(espacoId, jsonDoFluxo(texto, 'ork fluxo criar --arquivo fluxo.json'), eu)
      const pastaPedida = typeof opcoes.pasta === 'string' ? opcoes.pasta.trim() : ''
      const pasta = pastaPedida ? servico.listar(espacoId).pastas.find((p) => chaveDoNome(p.nome) === chaveDoNome(pastaPedida)) : undefined
      if (pastaPedida && !pasta) throw new Error(`não há pasta "${pastaPedida}" nos fluxos deste espaço; nada foi criado (tire o --pasta ou crie a pasta pela página)`)
      const g = servico.gravar(espacoId, null, bruto, autor)
      if (pasta) servico.mover(espacoId, g.id, pasta.id)
      return `Criei o fluxo "${g.nome}"${pasta ? ` na pasta "${pasta.nome}"` : ''} (${comoFicou(g, autor)}).${g.aviso ? ` Atenção: ${g.aviso}.` : ''}`
    }
    case 'editar': {
      const f = acharFluxo(servico, espacoId, nome)
      const bruto = presoAoAlcance(espacoId, jsonDoFluxo(texto, `ork fluxo editar "${f.nome}" --arquivo fluxo.json`), eu)
      const g = servico.gravar(espacoId, f.id, bruto, autor)
      return `Editei o fluxo "${g.nome}" (${f.ligado && !g.ligado ? 'era ligado e ficou ' : ''}${comoFicou(g, autor)}).${g.aviso ? ` Atenção: ${g.aviso}.` : ''}`
    }
    case 'ligar':
    case 'desligar': {
      const f = acharFluxo(servico, espacoId, nome)
      const g = servico.ligar(espacoId, f.id, acao === 'ligar', autor)
      return `${acao === 'ligar' ? 'Liguei' : 'Desliguei'} o fluxo "${g.nome}".`
    }
    case 'rodar': {
      const f = acharFluxo(servico, espacoId, nome)
      const execId = await servico.rodar(espacoId, f.id)
      const ex = servico.execucao(espacoId, f.id, execId)
      return ex ? textoDaExecucao(ex, f) : `Rodei o fluxo "${f.nome}" (execução ${execId}).`
    }
    case 'execucoes': {
      const f = acharFluxo(servico, espacoId, nome)
      const n = typeof opcoes.n === 'number' ? opcoes.n : 10
      const lista = servico.execucoes(espacoId, f.id, n)
      return lista.length ? [`Últimas execuções de "${f.nome}":`, ...lista.map(linhaDaExecucao)].join('\n') : `"${f.nome}" ainda não rodou.`
    }
    case 'apagar': {
      const f = acharFluxo(servico, espacoId, nome)
      if (opcoes.confirmar !== true) throw new Error(`apagar é para sempre (vão junto as execuções): ork fluxo apagar "${f.nome}" --confirmar`)
      servico.apagar(espacoId, f.id, autor)
      return `Apaguei o fluxo "${nomeNoCabecalho(f.nome)}".`
    }
    default:
      throw new Error(`não sei "${acao}" em fluxo: use ${ACOES_DO_FLUXO.join(', ')} (veja \`ork ajuda fluxo\`)`)
  }
}
