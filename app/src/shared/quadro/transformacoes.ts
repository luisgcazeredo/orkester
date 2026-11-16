import type { PedidoDoAgente, RespostaAoAgente } from '../api'
import type { Corda, Espaco, Funcao, No, NoCodigo, NoTerminal, Plano, PresetAgente } from '../modelo'
// Node executa as provas TypeScript diretamente e precisa da extensão neste único import de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { caixaDoNo, lugarPerto, proximoZ, tocam, type Caixa } from './geometria.ts'
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { ehVisor, juntarNoVisor } from './visor.ts'

type PedidoAbrir = Extract<PedidoDoAgente, { tipo: 'abrir' }>
type PedidoFechar = Extract<PedidoDoAgente, { tipo: 'fechar' }>
type PedidoPassar = Extract<PedidoDoAgente, { tipo: 'passar' }>

export interface AmbienteTransformacoesDoQuadro {
  presets: PresetAgente[]
  /** As funções guardadas; `abrir --funcao` procura aqui pelo nome. */
  funcoes: Funcao[]
  presetsPadrao: PresetAgente[]
  novoId: () => string
  agora: () => string
  /** Meio da tela do usuário no quadro: onde nasce o cartão que ninguém do quadro abriu. */
  centro?: { x: number; y: number }
}

interface ResultadoTransformacaoDoQuadro {
  espaco: Espaco
  resposta: RespostaAoAgente
}

const planosDe = (espaco: Espaco): Plano[] => [espaco, ...espaco.andares]

function mudarPlano(espaco: Espaco, alvo: Plano, mudar: (plano: Plano) => Plano): Espaco {
  const principal = alvo === espaco ? mudar(espaco) : espaco
  return {
    ...espaco,
    ...principal,
    andares: espaco.andares.map((andar) => (andar === alvo ? { ...andar, ...mudar(andar) } : andar))
  }
}

/** Cria o cartão pedido, sem tocar no estado da janela nem em relógio ou aleatoriedade próprios. */
/**
 * Com que preset o cartão abre: o do `--preset`, senão o preferido da função, senão o primeiro do tipo.
 *
 * Até a 1.2.5 era sempre o primeiro do tipo. O preset da função — onde moram o motor e o nível — só
 * valia quando o usuário clicava na função na barra; pelo `ork abrir` ele era ignorado, e o agente
 * escolhia motor mas nunca nível. Num time em que o Maestro reparte tarefas por nível, isso é metade
 * do desenho faltando.
 */
function escolherPreset(
  ambiente: AmbienteTransformacoesDoQuadro,
  pedido: PedidoAbrir,
  funcao: Funcao | undefined
): { preset: PresetAgente } | { erro: string } {
  const todos = ambiente.presets.length ? ambiente.presets : ambiente.presetsPadrao
  const daFuncao = funcao?.preset ? todos.find((p) => p.id === funcao.preset) : undefined

  if (pedido.preset) {
    const alvo = pedido.preset.trim().toLowerCase()
    const achado = todos.find((p) => p.id.toLowerCase() === alvo || p.nome.toLowerCase() === alvo)
    if (!achado) return { erro: `não existe o preset "${pedido.preset}"; os que existem: ${todos.map((p) => `"${p.nome}"`).join(', ')}` }
    if (pedido.agente && achado.agente !== pedido.agente) {
      return { erro: `o preset "${achado.nome}" é de ${achado.agente}, e você pediu ${pedido.agente}` }
    }
    return { preset: achado }
  }

  // sem agente dito: quem manda é a função. É o caso de `ork abrir --funcao "Revisor"`.
  if (!pedido.agente) {
    if (daFuncao) return { preset: daFuncao }
    return { erro: 'diga o agente (claude, codex ou shell) ou use uma função que tenha preset' }
  }

  if (daFuncao && daFuncao.agente === pedido.agente) return { preset: daFuncao }
  const doTipo = todos.find((p) => p.agente === pedido.agente) ?? ambiente.presetsPadrao.find((p) => p.agente === pedido.agente)
  return doTipo ? { preset: doTipo } : { erro: `não há preset de ${pedido.agente}` }
}

export function abrir(
  espaco: Espaco,
  pedido: PedidoAbrir,
  ambiente: AmbienteTransformacoesDoQuadro
): ResultadoTransformacaoDoQuadro {
  const planos = planosDe(espaco)
  const planoDoCriador = planos.find((plano) => plano.nos.some((no) => no.id === pedido.criador))
  const criador = planoDoCriador?.nos.find((no) => no.id === pedido.criador)
  // Um criador de outro espaço não tem cartão aqui: o novo começa no andar ativo, sem corda.
  const plano = planoDoCriador ?? espaco.andares.find((andar) => andar.id === espaco.andarAtivo) ?? espaco

  // função pedida pelo nome: ela dá o nome do cartão, a pasta, o primeiro pedido e o preset preferido
  const funcao = pedido.funcao
    ? ambiente.funcoes.find((f) => f.nome.toLowerCase() === pedido.funcao!.trim().toLowerCase())
    : undefined
  if (pedido.funcao && !funcao) {
    const quais = ambiente.funcoes.map((f) => `"${f.nome}"`).join(', ')
    return { espaco, resposta: { ok: false, erro: `não existe a função "${pedido.funcao}"${quais ? `; as que existem: ${quais}` : ' (nenhuma criada ainda)'}` } }
  }
  const escolhido = escolherPreset(ambiente, pedido, funcao)
  if ('erro' in escolhido) return { espaco, resposta: { ok: false, erro: escolhido.erro } }
  const preset = escolhido.preset
  const nomes = new Set(planos.flatMap((atual) => atual.nos.flatMap((no) => (no.tipo === 'terminal' ? [no.nome.toLowerCase()] : []))))
  const base = pedido.nome || funcao?.nome || preset.nome
  let nome = base
  for (let indice = 2; nomes.has(nome.toLowerCase()); indice++) nome = `${base} ${indice}`

  const tamanho = { largura: 720, altura: 460 }
  let caixa: Caixa
  if (criador) {
    // o vão livre mais perto de quem abriu, em volta dele (ver `lugarPerto`)
    caixa = { ...lugarPerto(caixaDoNo(criador), tamanho, plano.nos.filter((no) => no.id !== criador.id).map(caixaDoNo)), ...tamanho }
  } else {
    // sem quem abriu no quadro (o usuário, pelo MCP): no meio da tela dele, se a janela disse onde é; ocupado,
    // o vão livre mais perto dali. Antes descia a partir de (120, 120) até achar vaga — no quadro do time de
    // 12/11/2026 o cartão nasceu em y = 6880, fora da vista.
    const centro = ambiente.centro
    caixa = centro ? { x: Math.round(centro.x - tamanho.largura / 2), y: Math.round(centro.y - tamanho.altura / 2), ...tamanho } : { x: 120, y: 120, ...tamanho }
    const ocupados = plano.nos.map(caixaDoNo)
    if (ocupados.some((o) => tocam(caixa, o, 30))) caixa = { ...lugarPerto(caixa, tamanho, ocupados), ...tamanho }
  }

  const no: NoTerminal = {
    id: ambiente.novoId(),
    z: proximoZ(plano),
    criadoEm: ambiente.agora(),
    ...caixa,
    tipo: 'terminal',
    nome,
    agente: preset.agente,
    comando: preset.comando,
    pasta: pedido.pasta || funcao?.pasta || undefined,
    funcao: funcao?.nome,
    sessao: preset.agente === 'claude' ? ambiente.novoId() : undefined,
    // criador vazio é o usuário (um cliente MCP, pela chave): o cartão nasce sem dono, como os que ele
    // cria pela tela — e sem dono ninguém o herda nem o fecha por engano
    criadoPor: pedido.criador || undefined
  }
  const corda: Corda | null = criador ? { id: ambiente.novoId(), de: criador.id, para: no.id, criadoEm: ambiente.agora() } : null
  const proximo = mudarPlano(espaco, plano, (atual) => ({ ...atual, nos: [...atual.nos, no], cordas: corda ? [...atual.cordas, corda] : atual.cordas }))
  // sem função, a resposta não ganha campo nenhum a mais (há provas comparando o objeto inteiro)
  const comPrompt = funcao?.prompt ? { texto: funcao.prompt } : {}
  return { espaco: proximo, resposta: { ok: true, id: no.id, nome, ...comPrompt } }
}

/**
 * Os visores do agente que fechou passam a quem o abriu: as listas de todas as árvores se juntam no visor principal
 * do herdeiro (que nasce do primeiro visor, se ele não tinha), sem repetir arquivo. Sem herdeiro, ficam como estão.
 */
export function herdarVisores(nos: No[], morto: string, herdeiro: string | undefined): No[] {
  if (!herdeiro) return nos
  const dele = nos.filter((n): n is NoCodigo => ehVisor(n) && n.terminal === morto)
  if (!dele.length) return nos
  const principal = (n: No): boolean => ehVisor(n) && n.terminal === herdeiro && (!n.arvore || n.arvore === 'principal')
  let alvo = nos.find((n): n is NoCodigo => n.tipo === 'codigo' && principal(n))
  const sai = new Set<string>()
  const novo = new Map<string, NoCodigo>()
  // a principal de quem fechou vai primeiro: é ela que dá a posição, se o herdeiro não tinha visor
  const ordem = [...dele].sort((a, b) => Number(!!a.arvore && a.arvore !== 'principal') - Number(!!b.arvore && b.arvore !== 'principal'))
  for (const v of ordem) {
    if (!alvo) {
      alvo = { ...v, terminal: herdeiro, arvore: undefined }
    } else {
      alvo = juntarNoVisor(alvo, v.arquivos ?? [])
      sai.add(v.id)
    }
    novo.set(alvo.id, alvo)
  }
  for (const v of dele) if (!novo.has(v.id) && !sai.has(v.id)) sai.add(v.id)
  return nos.flatMap((n) => (sai.has(n.id) ? [] : [novo.get(n.id) ?? n]))
}

/** Remove o cartão e todas as cordas dele. */
export function fechar(espaco: Espaco, pedido: PedidoFechar): ResultadoTransformacaoDoQuadro {
  const plano = planosDe(espaco).find((atual) => atual.nos.some((no) => no.id === pedido.id))
  if (!plano) return { espaco, resposta: { ok: false, erro: 'esse cartão não está mais no quadro' } }
  // Quem abriu o cartão herda os cartões de código dele — é a mesma regra das sessões, que já passam ao
  // sucessor no `ork fechar`. Antes eles ficavam apontando para um agente que não existe mais: não sumiam
  // (o trabalho continua no quadro, para ser lido), mas ninguém mais os arrumava nem conseguia entregá-los,
  // e o `ork quadro` os anunciava como "na árvore de alguém". Agora param na mão de quem fechou, e o `ork
  // arvore dar` repassa ao próximo que for mexer naquilo.
  const fechado = plano.nos.find((no) => no.id === pedido.id)
  const herdeiro = fechado?.tipo === 'terminal' ? fechado.criadoPor : undefined
  const temHerdeiro = !!herdeiro && plano.nos.some((no) => no.id === herdeiro && no.tipo === 'terminal')
  const proximo = mudarPlano(espaco, plano, (atual) => ({
    ...atual,
    nos: herdarVisores(
      atual.nos
        .filter((no) => no.id !== pedido.id)
        .map((no) =>
          temHerdeiro && no.tipo === 'codigo' && no.terminal === pedido.id && !ehVisor(no)
            ? ({ ...no, terminal: herdeiro, arvore: undefined } as No)
            : no
        ),
      pedido.id,
      temHerdeiro ? herdeiro : undefined
    ),
    cordas: atual.cordas.filter((corda) => corda.de !== pedido.id && corda.para !== pedido.id)
  }))
  return { espaco: proximo, resposta: { ok: true } }
}

/** Transfere cartões entre agentes; cordas só existem no plano onde as duas pontas coexistem. */
export function passar(
  espaco: Espaco,
  pedido: PedidoPassar,
  ambiente: Pick<AmbienteTransformacoesDoQuadro, 'novoId' | 'agora'>
): ResultadoTransformacaoDoQuadro {
  const ids = new Set(pedido.ids)
  const temDonoDoSucessor = Object.prototype.hasOwnProperty.call(pedido, 'donoDoSucessor')
  const procurados = new Set([...ids, ...(temDonoDoSucessor ? [pedido.sucessor] : [])])
  const encontrados = planosDe(espaco).flatMap((plano) => plano.nos).filter((no) => no.tipo === 'terminal' && procurados.has(no.id)).length
  if (encontrados !== procurados.size) return { espaco, resposta: { ok: false, erro: 'um cartão a passar não está mais no quadro' } }

  const transformar = (plano: Plano): Plano => {
    const aqui = new Set(plano.nos.filter((no) => no.tipo === 'terminal').map((no) => no.id))
    const mudar = [...ids].filter((id) => aqui.has(id))
    const liga = (corda: Corda, a: string, b: string): boolean =>
      (corda.de === a && corda.para === b) || (corda.de === b && corda.para === a)
    const cordas = plano.cordas.filter((corda) => !mudar.some((id) => liga(corda, pedido.antigo, id)))
    if (aqui.has(pedido.novoCriador)) {
      for (const id of mudar) {
        if (id !== pedido.novoCriador && !cordas.some((corda) => liga(corda, pedido.novoCriador, id))) {
          cordas.push({ id: ambiente.novoId(), de: pedido.novoCriador, para: id, criadoEm: ambiente.agora() })
        }
      }
    }
    return {
      ...plano,
      cordas,
      nos: plano.nos.map((no) => {
        if (no.tipo !== 'terminal') return no
        if (temDonoDoSucessor && no.id === pedido.sucessor) return { ...no, criadoPor: pedido.donoDoSucessor ?? undefined }
        return ids.has(no.id) ? { ...no, criadoPor: pedido.novoCriador } : no
      })
    }
  }

  return {
    espaco: { ...espaco, ...transformar(espaco), andares: espaco.andares.map((andar) => ({ ...andar, ...transformar(andar) })) },
    resposta: { ok: true }
  }
}
