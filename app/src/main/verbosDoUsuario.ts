import { resolve } from 'node:path'
import type { ResumoEspaco } from '../shared/modelo'
import type { ChaveGuardada } from '../shared/chaves'
import { resumosDosEspacos } from './dados'
import { registroDoEnvio } from './envio'
import { rodarKanban } from './kanban'
import { validarChamada, type NomeDeVerbo } from './verbos'
import { esperarSessao, sessoesDoEspaco, telaDe } from './terminais'
import { conferirModelo, lerModelos, modeloDasOpcoes, textoDoModelo, textoDosModelos } from './modelos'
import { janelaDoEspaco, abrirJanelaPronta, pedirAJanela } from './quadroDoAgente'
import { situacao, aguardarPronto, digitarPedido, registrar, acharEntre } from './espera'
import { agenteDe, espacoPorNome, lerFichasDaPasta, trocarModeloDe, type Pedido, type ResultadoDoComando } from './verbosDoAgente'

// ---------- o usuário pelo cano, com uma chave ----------

/**
 * Um cliente MCP falando com o quadro. Ele não tem cartão, então **não é um agente**: o que ele faz é o
 * que o usuário faria pela tela — nada nasce com dono, nada nasce com corda, e a regra da corda (que é
 * permissão entre agentes) não se aplica a ele.
 *
 * O protocolo é o mesmo do `ork`, com `chave` no lugar de `cracha`, e a mesma validação de verbos: um
 * cliente que erra a opção recebe o mesmo erro que um agente erraria, escrito uma vez só.
 */
interface ContextoDoUsuario {
  chave: ChaveGuardada
  pos: string[]
  opcoes: Record<string, string | number | true>
  texto: string
}

/** Em que espaço o pedido cai: o dito em `--espaco`, senão o único que está aberto numa janela. */
function espacoDoUsuario(opcoes: Record<string, string | number | true>): ResumoEspaco {
  if (typeof opcoes.espaco === 'string') return espacoPorNome(opcoes.espaco)
  const abertos = resumosDosEspacos().filter((e) => janelaDoEspaco(e.id))
  if (abertos.length === 1) return abertos[0]
  if (!abertos.length) throw new Error('nenhum espaço está aberto numa janela; abra o Orkester (ou diga --espaco "Nome")')
  throw new Error(`há ${abertos.length} espaços abertos; diga qual com --espaco "Nome": ${abertos.map((e) => `"${e.nome}"`).join(', ')}`)
}

const HANDLERS_DO_USUARIO: Partial<Record<NomeDeVerbo, (ctx: ContextoDoUsuario) => Promise<ResultadoDoComando>>> = {
  espacos: async () => ({
    saida:
      resumosDosEspacos()
        .map((e) => `  "${e.nome}" · ${janelaDoEspaco(e.id) ? 'janela aberta' : 'sem janela'} · ${e.terminais} cartões`)
        .join('\n') || 'Não há espaços.'
  }),

  quadro: async ({ opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    const r = await pedirAJanela({ tipo: 'usuario', espacoId: espaco.id, acao: 'quadro' })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? '' }
  },

  modelos: async () => ({ saida: textoDosModelos(lerModelos()) }),

  modelo: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    // o usuário mexe em qualquer cartão do espaço; só o agente precisa estar livre
    const alvo = acharEntre(sessoesDoEspaco(espaco.id), pos[0])
    return { saida: await trocarModeloDe(alvo, pos[1], opcoes, async (modelo, esforco) => pedirAJanela({ tipo: 'usuario', espacoId: espaco.id, acao: 'modelo', alvo: alvo.id, modelo, esforco })) }
  },

  funcoes: async ({ opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    const r = await pedirAJanela({ tipo: 'funcoes', espacoId: espaco.id })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? '' }
  },

  partitura: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    const acao = String(pos[0] ?? '').toLowerCase()
    if (!acao) {
      const r = await pedirAJanela({ tipo: 'partitura', espacoId: espaco.id, id: '', acao: 'lista' })
      if (!r.ok) throw new Error(r.erro)
      return { saida: r.texto ?? '' }
    }
    if (acao !== 'usar') throw new Error('pela chave só dá para listar ou usar: ork partitura usar "Nome"')
    const r = await pedirAJanela({ tipo: 'usuario', espacoId: espaco.id, acao: 'partitura', nome: pos[1] })
    if (!r.ok) throw new Error(r.erro)
    return { saida: r.texto ?? '' }
  },

  catalogo: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    if (String(pos[0] ?? '').toLowerCase() !== 'importar') throw new Error('diga o que fazer: ork catalogo importar <pasta>')
    const fichas = lerFichasDaPasta(resolve(espaco.pasta, String(pos[1] ?? '')))
    const r = await pedirAJanela({ tipo: 'catalogo', espacoId: espaco.id, id: '', fichas: fichas.fichas })
    if (!r.ok) throw new Error(r.erro)
    const sobras = fichas.pulados.length ? ['', 'Arquivos pulados (sem cabeçalho de ficha):', ...fichas.pulados.map((p) => `  ${p}`)] : []
    return { saida: [r.texto ?? '', ...sobras].join('\n').trim() }
  },

  abrir: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    const agente = agenteDe(pos[0])
    if (pos[0] && !agente) throw new Error(`não existe o agente "${pos[0]}"; use claude, codex ou shell`)
    const funcao = typeof opcoes.funcao === 'string' ? opcoes.funcao.trim() : undefined
    if (!agente && !funcao && !opcoes.preset) throw new Error('diga o agente (claude, codex ou shell) ou use --funcao "Papel"')
    const { modelo, esforco } = modeloDasOpcoes(opcoes, agente ?? undefined)
    await abrirJanelaPronta(espaco.id)
    const r = await pedirAJanela({
      tipo: 'usuario',
      espacoId: espaco.id,
      acao: 'abrir',
      agente: agente ?? undefined,
      preset: typeof opcoes.preset === 'string' ? opcoes.preset : undefined,
      nome: typeof opcoes.nome === 'string' ? opcoes.nome.trim().slice(0, 80) : undefined,
      pasta: typeof opcoes.pasta === 'string' ? resolve(espaco.pasta, opcoes.pasta) : undefined,
      funcao,
      modelo,
      esforco
    })
    if (!r.ok) throw new Error(r.erro)
    // A função traz o primeiro pedido (o papel). Até a 1.4.0 ele voltava da janela e era ignorado aqui: o
    // cartão aberto pelo MCP nascia com o agente certo e sem saber quem era. Quem digita é este processo,
    // como no `ork abrir`, mas sem segurar a resposta do cliente (o agente leva até um minuto para ficar pronto).
    if (r.texto && r.id) void digitarPrimeiroPedidoDoUsuario(r.id, r.texto)
    const aviso = [conferirModelo(r.agente ?? agente ?? undefined, r.modelo, r.esforco, lerModelos()).aviso, r.aviso].filter(Boolean).join('; ') || undefined
    return { saida: `Abri "${r.nome}".${textoDoModelo(r.modelo, r.esforco, aviso)}${r.texto ? ' O papel da função vai ser digitado assim que o agente ficar pronto.' : ''}` }
  },

  /** O kanban de qualquer espaço (é o usuário). Quem fez fica como `MCP · <nome da chave>`. */
  kanban: async ({ chave, pos, opcoes, texto }) => {
    const espaco = espacoDoUsuario(opcoes)
    return { saida: await rodarKanban(espaco.id, { nome: `MCP · ${chave.nome}` }, pos, opcoes, texto) }
  },

  ver: async ({ pos, opcoes }) => {
    const espaco = espacoDoUsuario(opcoes)
    // o usuário enxerga qualquer cartão do espaço: a corda é permissão entre agentes, não entre ele e o quadro
    const alvo = acharEntre(sessoesDoEspaco(espaco.id), pos[0])
    const linhas = Math.min(2000, Math.max(1, Number(opcoes.linhas) || 50))
    return { saida: `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, linhas)}` }
  }
}

/** O papel de um cartão aberto pelo MCP: espera o agente ficar pronto e digita; o que acontecer vai para o registro. */
async function digitarPrimeiroPedidoDoUsuario(id: string, texto: string): Promise<void> {
  const s = await esperarSessao(id, 10_000)
  if (!s) return
  const pronto = await aguardarPronto(s, 90_000, () => false)
  if (pronto !== 'pronto') {
    registrar(s, null, 'primeiro-pedido-nao-digitado', `agente não ficou pronto (${pronto}); o papel NÃO foi digitado`)
    return
  }
  const envio = await digitarPedido(s, texto)
  const { comando, alerta } = registroDoEnvio('primeiro-pedido', envio)
  registrar(s, null, comando, alerta ?? texto)
}

export async function executarComoUsuario(chave: ChaveGuardada, pedido: Pedido): Promise<ResultadoDoComando> {
  const comandoInformado = typeof pedido.comando === 'string' ? pedido.comando : 'ajuda'
  const posicionais = Array.isArray(pedido.posicionais) ? pedido.posicionais.filter((p): p is string => typeof p === 'string') : []
  const opcoesRecebidas = typeof pedido.opcoes === 'object' && pedido.opcoes !== null ? (pedido.opcoes as Record<string, unknown>) : {}
  // O `--espaco` é do usuário, não do verbo: um agente sempre fala do espaço dele, então os verbos do agente
  // não o declaram (e declarar só para cá seria aceitar, no agente, uma opção que não faz nada). A chave não
  // tem espaço próprio, então ele sai antes da validação e volta depois.
  const { espaco, ...semEspaco } = opcoesRecebidas
  const chamada = validarChamada(comandoInformado, posicionais, semEspaco)
  if (typeof espaco === 'string' && espaco.trim()) chamada.opcoes.espaco = espaco.trim()
  const handler = HANDLERS_DO_USUARIO[chamada.verbo.nome as NomeDeVerbo]
  if (!handler) {
    const quais = Object.keys(HANDLERS_DO_USUARIO).join(', ')
    throw new Error(`"${chamada.verbo.nome}" é de agente, não de chave. Pela chave dá para: ${quais}`)
  }
  const texto = typeof pedido.texto === 'string' ? pedido.texto : ''
  return handler({ chave, pos: chamada.posicionais, opcoes: chamada.opcoes, texto })
}
