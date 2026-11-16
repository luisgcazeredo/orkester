import { type ArvoreDeCodigo, type NoTerminal, PRESETS_PADRAO } from '../../../shared/modelo'
import { type PedidoDoAgente, type RespostaAoAgente } from '../../../shared/api'
import { juntarCatalogo, textoDoRelatorio } from '../../../shared/catalogo'
import { abrir, fechar, passar } from '../../../shared/quadro/transformacoes'
import { acharAlvos, mexerNoQuadro } from '../../../shared/quadro/agente'
import { resumoDaPartitura } from '../../../shared/quadro/partituras'
import { alcanca, alcancaveisPor, bandasDoPlano, cordasDaBanda, membrosDaBanda } from '../../../shared/quadro/bandas'
import { centroDaTela } from '../quadro/geometria'
import { arrumarArvores, contarArquivos, criarArvore, desfazerArvore, entregarArquivos, mostrarArquivoNaArvore, usarArvore } from './arvores'
import { criarBandaNoQuadro, trocarAgenteDoCartao } from './bandas'
import { ARVORE_PRINCIPAL, arvoresDoTerminal } from './codigo'
import { definirFuncoes, salvarPartitura, subirPartitura } from './espacos'
import { acharNo, agora, novoId } from './nos'
import { andarAtual, definir, estado, mudarEspaco, mudarPlano, planoAtual, registrarHistorico } from './nucleo'
import { fechadosPorAgente } from './terminais'

/** A primeira linha do prompt de uma função, para caber numa lista. */
const primeiraLinha = (texto: string): string => texto.split(/\r?\n/)[0].slice(0, 80)

/** O agente mexendo nas próprias árvores de código pelo `ork arvore`. */
function atenderArvore(pedido: Extract<PedidoDoAgente, { tipo: 'arvore' }>): RespostaAoAgente {
  const terminal = acharNo(pedido.id)
  if (terminal?.tipo !== 'terminal') return { ok: false, erro: 'o seu cartão não está no andar à mostra desta janela' }
  const nome = (pedido.nome ?? '').trim()
  const porNome = (): ArvoreDeCodigo | undefined =>
    arvoresDoTerminal(terminal).find((a) => (a.nome || 'principal').toLowerCase() === nome.toLowerCase())
  const emUso = (): string =>
    arvoresDoTerminal(terminal).find((a) => a.id === (terminal.arvoreAtiva ?? ARVORE_PRINCIPAL))?.nome || 'principal'
  if (pedido.acao === 'lista') {
    const linhas = arvoresDoTerminal(terminal).map((a) => {
      const minha = a.id === (terminal.arvoreAtiva ?? ARVORE_PRINCIPAL)
      const total = contarArquivos(terminal.id, a.id)
      return `${minha ? '*' : ' '} "${a.nome || 'principal'}" · ${total} arquivo(s)${minha ? ' · em uso' : ''}`
    })
    return { ok: true, texto: ['Suas árvores de código:', ...linhas].join('\n') }
  }
  if (pedido.acao === 'nova') {
    const nova = criarArvore(terminal.id, nome)
    return nova
      ? { ok: true, texto: `Árvore "${nova.nome}" pronta; os próximos arquivos nascem nela.` }
      : { ok: false, erro: 'diga o nome da árvore' }
  }
  if (pedido.acao === 'usar') {
    const achada = porNome()
    if (!achada) return { ok: false, erro: `você não tem a árvore "${nome}"; crie com: ork arvore nova "${nome}"` }
    usarArvore(terminal.id, achada.id)
    return { ok: true, texto: `Os próximos arquivos vão para a árvore "${achada.nome || 'principal'}".` }
  }
  /**
   * Entregar um arquivo a outro agente: o cartão continua no quadro, com o histórico dele, e passa para a
   * coluna de quem vai mexer agora. É o conserto certo para o palpite de dono — e é como o maestro repassa
   * o trabalho de um agente que ele fechou, em vez de deixar cartão pendurado em quem já foi.
   */
  if (pedido.acao === 'dar') {
    const plano = planoAtual()
    if (!plano) return { ok: false, erro: 'nenhum espaço aberto nesta janela' }
    const destino = plano.nos.find(
      (n): n is NoTerminal => n.tipo === 'terminal' && n.nome.toLowerCase() === nome.toLowerCase()
    )
    if (!destino) return { ok: false, erro: `não achei o agente "${nome}" no andar à mostra. Veja \`ork quadro\`.` }
    if (destino.id === terminal.id) return { ok: false, erro: 'esse arquivo já é seu' }
    // entregar põe o cartão na coluna do outro e mexe no quadro dele: vale a mesma regra da corda
    if (!alcancaveisPor(plano, terminal.id).has(destino.id)) {
      return { ok: false, erro: `"${destino.nome}" não está ao seu alcance: entregue a quem você abriu ou a quem está ligado a você` }
    }
    const entregues = entregarArquivos(terminal.id, destino.id, pedido.arquivos ?? [])
    if (!entregues) return { ok: false, erro: 'nenhum desses arquivos está na sua lista; só se entrega arquivo seu' }
    return { ok: true, texto: `Entreguei ${entregues} arquivo(s) para "${destino.nome}".` }
  }
  if (pedido.acao === 'desfazer') {
    const achada = porNome()
    if (!achada || achada.id === ARVORE_PRINCIPAL) return { ok: false, erro: 'a principal não se desfaz; diga o nome de outra' }
    desfazerArvore(terminal.id, achada.id)
    return { ok: true, texto: `Desfiz a árvore "${achada.nome}"; os arquivos dela voltaram para a principal.` }
  }
  const alvo = nome ? porNome() : undefined
  if (nome && !alvo) return { ok: false, erro: `você não tem a árvore "${nome}"` }
  const onde = alvo?.nome || emUso()
  const feitos = (pedido.arquivos ?? []).filter((caminho) => mostrarArquivoNaArvore(terminal.id, caminho, alvo?.id))
  if (!feitos.length) return { ok: false, erro: 'nenhum arquivo foi mostrado; eles precisam estar numa pasta do quadro' }
  return { ok: true, texto: `Mostrei ${feitos.length} arquivo(s) na árvore "${onde}".` }
}

/**
 * Troca de agente pelo `ork`. Só nos cartões que o próprio agente abriu: trocar encerra um processo, e
 * encerrar trabalho de outro (ou o seu, no meio do comando) não é dele. O preset é o do usuário para aquele
 * agente, como no `ork abrir`.
 */
function atenderTroca(pedido: Extract<PedidoDoAgente, { tipo: 'trocar' }>): RespostaAoAgente {
  const plano = planoAtual()
  if (!plano) return { ok: false, erro: 'nenhum espaço aberto nesta janela' }
  const achados = acharAlvos(plano, [pedido.alvo])
  if (typeof achados === 'string') return { ok: false, erro: achados }
  const alvo = achados[0]
  if (alvo.tipo !== 'terminal') return { ok: false, erro: 'só cartão de agente troca de agente' }
  if (alvo.id === pedido.id) return { ok: false, erro: 'você não troca o seu próprio cartão: isso encerraria você no meio deste comando' }
  if (alvo.criadoPor !== pedido.id) return { ok: false, erro: `"${alvo.nome}" não foi aberto por você; só trocar o que é seu` }
  const preset =
    estado.preferencias.presets.find((p) => p.agente === pedido.agente) ?? PRESETS_PADRAO.find((p) => p.agente === pedido.agente)!
  const feito = trocarAgenteDoCartao(alvo.id, preset, true)
  return 'erro' in feito ? { ok: false, erro: feito.erro } : { ok: true, texto: feito.texto }
}

/** Bandas pelo `ork`: listar as do andar à mostra (com quem está dentro) e criar uma em volta de cartões. */
function atenderBanda(pedido: Extract<PedidoDoAgente, { tipo: 'banda' }>): RespostaAoAgente {
  const plano = planoAtual()
  if (!plano) return { ok: false, erro: 'nenhum espaço aberto nesta janela' }
  if (pedido.acao === 'lista') {
    const bandas = bandasDoPlano(plano)
    const linhas = bandas.map((b) => {
      const dentro = membrosDaBanda(plano, b.id)
      const ligada = cordasDaBanda(plano, b.id).length
      return [
        `  "${b.nome}" — ${dentro.length ? dentro.map((n) => `"${n.nome}"`).join(', ') : 'vazia'}`,
        `    moldura de (${Math.round(b.x)}, ${Math.round(b.y)}) a (${Math.round(b.x + b.largura)}, ${Math.round(b.y + b.altura)})${
          ligada ? ` · ${ligada} corda(s) na banda` : ''
        }`
      ].join('\n')
    })
    return {
      ok: true,
      texto: linhas.length
        ? [
            'Bandas deste andar (quem está dentro da moldura fala com todos os de dentro):',
            ...linhas,
            'Para pôr um agente num time, mova o cartão para dentro da moldura (`ork mover "Nome" --x N --y N`).'
          ].join('\n')
        : 'Nenhuma banda neste andar. Crie uma com `ork banda criar "Nome" <cartão>...`.'
    }
  }
  const achados = pedido.alvos?.length ? acharAlvos(plano, pedido.alvos) : []
  if (typeof achados === 'string') return { ok: false, erro: achados }
  const eu = acharNo(pedido.id)
  const onde = eu ? { x: eu.x + eu.largura / 2, y: eu.y + eu.altura + 200 } : { x: 0, y: 0 }
  const feito = criarBandaNoQuadro(pedido.nome ?? '', achados.map((no) => no.id), onde)
  return 'erro' in feito ? { ok: false, erro: feito.erro } : { ok: true, texto: feito.texto }
}

/**
 * Partituras pelo `ork`: listar, subir um time e guardar o que está no quadro como partitura.
 *
 * Subir entra no desfazer (é o `subirPartitura` que registra); guardar não mexe no quadro, mexe nas
 * preferências. O time sobe à direita do cartão de quem pediu, ligado a ele, como o `ork abrir`.
 */
/**
 * O usuário falando pelo cano, com uma chave (um cliente MCP). Não há cartão de origem: nada nasce com
 * dono nem com corda, exatamente como quando ele faz pela tela. A corda é permissão **entre agentes**;
 * entre o dono e o quadro dele não existe fronteira nenhuma a respeitar.
 */
function atenderUsuario(pedido: Extract<PedidoDoAgente, { tipo: 'usuario' }>): RespostaAoAgente {
  const espaco = estado.espaco
  const plano = planoAtual()
  if (!espaco || !plano) return { ok: false, erro: 'nenhum espaço aberto nesta janela' }
  const andar = andarAtual()
  const onde = `Espaço "${espaco.nome}" · ${andar ? `andar "${andar.nome}"` : 'térreo'}`

  if (pedido.acao === 'quadro') {
    // `eu` vazio: ninguém é marcado como "você" na leitura, porque quem pergunta não tem cartão
    const feito = mexerNoQuadro(plano, { acao: 'ler', eu: '', onde }, { novoId, agora, alcanca })
    return 'erro' in feito ? { ok: false, erro: feito.erro } : { ok: true, texto: feito.texto }
  }

  if (pedido.acao === 'partitura') {
    const nome = (pedido.nome ?? '').trim()
    if (!nome) return { ok: false, erro: 'diga o nome da partitura' }
    const guardada = (estado.preferencias.partituras ?? []).find((p) => p.nome.toLowerCase() === nome.toLowerCase())
    if (!guardada) {
      const quais = (estado.preferencias.partituras ?? []).map((p) => `"${p.nome}"`).join(', ')
      return { ok: false, erro: `não existe a partitura "${nome}"${quais ? `; as que existem: ${quais}` : ''}` }
    }
    // sem dono: o time é do usuário, como o que ele sobe pelo botão. O lugar é o canto de cima à esquerda,
    // e o arranjo desce sozinho até achar espaço livre (ver `cantoLivre` em partituras.ts).
    const feito = subirPartitura(guardada, 120, 120)
    return 'erro' in feito ? { ok: false, erro: feito.erro } : { ok: true, texto: feito.texto }
  }

  // abrir: o mesmo caminho do agente, com criador vazio — o cartão nasce solto
  const ambiente = {
    presets: estado.preferencias.presets,
    funcoes: estado.preferencias.funcoes ?? [],
    presetsPadrao: PRESETS_PADRAO,
    novoId,
    agora,
    // nasce no meio da tela do usuário, e não no fim do quadro
    centro: centroDaTela(plano.camera)
  }
  const resultado = abrir(espaco, {
    tipo: 'abrir',
    espacoId: pedido.espacoId,
    criador: '',
    agente: pedido.agente,
    preset: pedido.preset,
    nome: pedido.nome,
    pasta: pedido.pasta,
    funcao: pedido.funcao
  }, ambiente)
  if (!resultado.resposta.ok) return resultado.resposta
  mudarEspaco(() => resultado.espaco, false)
  return resultado.resposta
}

function atenderPartitura(pedido: Extract<PedidoDoAgente, { tipo: 'partitura' }>): RespostaAoAgente {
  const plano = planoAtual()
  if (!plano) return { ok: false, erro: 'nenhum espaço aberto nesta janela' }
  const guardadas = estado.preferencias.partituras ?? []
  if (pedido.acao === 'lista') {
    const linhas = guardadas.map((p) => `  "${p.nome}" — ${resumoDaPartitura(p)}`)
    return {
      ok: true,
      texto: linhas.length
        ? ['Partituras guardadas:', ...linhas, 'Suba uma com `ork partitura usar "Nome"`.'].join('\n')
        : 'Nenhuma partitura guardada ainda. Guarde o time que está no quadro com `ork partitura salvar "Nome"`.'
    }
  }
  const eu = acharNo(pedido.id)
  if (eu?.tipo !== 'terminal') return { ok: false, erro: 'o seu cartão não está no andar à mostra desta janela' }
  const nome = (pedido.nome ?? '').trim()
  if (!nome) return { ok: false, erro: 'diga o nome da partitura' }

  if (pedido.acao === 'salvar') {
    let ids: string[] | null = null
    if (pedido.alvos?.length) {
      const achados = acharAlvos(plano, pedido.alvos)
      if (typeof achados === 'string') return { ok: false, erro: achados }
      ids = achados.map((no) => no.id)
    }
    const erro = salvarPartitura(nome, ids)
    if (erro) return { ok: false, erro }
    const salva = (estado.preferencias.partituras ?? []).find((p) => p.nome.toLowerCase() === nome.slice(0, 80).toLowerCase())
    return { ok: true, texto: `Guardei a partitura "${salva?.nome ?? nome}"${salva ? ` — ${resumoDaPartitura(salva)}` : ''}.` }
  }

  const procurado = nome.toLowerCase()
  const exatas = guardadas.filter((p) => p.nome.toLowerCase() === procurado)
  const quase = exatas.length ? exatas : guardadas.filter((p) => p.nome.toLowerCase().startsWith(procurado))
  if (!quase.length) {
    const quais = guardadas.map((p) => `"${p.nome}"`).join(', ')
    return { ok: false, erro: `não existe a partitura "${nome}"${quais ? `; as que existem: ${quais}` : ' (nenhuma guardada ainda)'}` }
  }
  if (quase.length > 1) return { ok: false, erro: `"${nome}" serve para ${quase.map((p) => `"${p.nome}"`).join(' e ')}; diga o nome inteiro` }
  const feito = subirPartitura(quase[0], eu.x + eu.largura + 80, eu.y, eu.id)
  return 'erro' in feito ? { ok: false, erro: feito.erro } : { ok: true, texto: feito.texto }
}

/**
 * O agente mexendo no quadro pelo `ork` (ler, mover, arrumar, nome, ligar, desligar, anotar, juntar).
 *
 * Diferente dos outros pedidos de agente, **isto entra no desfazer**: o que um agente arrumar errado o
 * usuário desfaz com Ctrl+Z, como se tivesse arrastado ele mesmo. A decisão toda é da função pura; aqui só
 * se aplica o plano que ela devolveu e se rearruma a árvore de código de quem mudou de lugar.
 */
function atenderQuadroDoAgente(pedido: Extract<PedidoDoAgente, { tipo: 'quadro' }>): RespostaAoAgente {
  const espaco = estado.espaco
  const plano = planoAtual()
  if (!espaco || !plano) return { ok: false, erro: 'nenhum espaço aberto nesta janela' }
  const eu = acharNo(pedido.id)
  if (eu?.tipo !== 'terminal') return { ok: false, erro: 'o seu cartão não está no andar à mostra desta janela' }
  const andar = andarAtual()
  const onde = `Espaço "${espaco.nome}" · ${andar ? `andar "${andar.nome}"` : 'térreo'}`
  const feito = mexerNoQuadro(plano, { ...pedido.pedido, eu: pedido.id, onde }, { novoId, agora, alcanca })
  if ('erro' in feito) return { ok: false, erro: feito.erro }
  if (feito.plano !== plano) {
    registrarHistorico()
    // o plano saiu da função pura a partir do que está à mostra agora (este atendimento é síncrono)
    mudarPlano(() => feito.terminais.reduce((acc, id) => arrumarArvores(acc, id), feito.plano), false)
  }
  return { ok: true, texto: feito.texto }
}

/** Um agente pediu pelo `ork`: abrir, fechar ou passar a responsabilidade de cartões. */
export function atenderAgente(pedido: PedidoDoAgente): RespostaAoAgente {
  // Este atendimento precisa continuar síncrono: o resultado puro abaixo parte do espaço lido agora.
  const e = estado.espaco
  if (!e || e.id !== pedido.espacoId) return { ok: false, erro: 'o espaço deste terminal não está aberto nesta janela' }
  // as árvores de código não mexem na topologia dos terminais: a loja desta janela resolve sozinha
  if (pedido.tipo === 'arvore') return atenderArvore(pedido)
  if (pedido.tipo === 'quadro') return atenderQuadroDoAgente(pedido)
  if (pedido.tipo === 'partitura') return atenderPartitura(pedido)
  if (pedido.tipo === 'trocar') return atenderTroca(pedido)
  if (pedido.tipo === 'banda') return atenderBanda(pedido)
  if (pedido.tipo === 'usuario') return atenderUsuario(pedido)
  if (pedido.tipo === 'catalogo') {
    const { funcoes, relatorio } = juntarCatalogo(estado.preferencias.funcoes ?? [], pedido.fichas, estado.preferencias.presets, novoId)
    definirFuncoes(funcoes)
    return { ok: true, texto: textoDoRelatorio(relatorio) }
  }
  if (pedido.tipo === 'funcoes') {
    const lista = estado.preferencias.funcoes ?? []
    const linhas = lista.map((f) => `  "${f.nome}"${f.pasta ? ` · pasta ${f.pasta}` : ''} — ${primeiraLinha(f.prompt)}`)
    return {
      ok: true,
      texto: lista.length
        ? ['Funções guardadas:', ...linhas].join('\n')
        : 'Nenhuma função guardada ainda. O usuário cria em "Editar funções…", no menu de terminal da barra.'
    }
  }
  const ambiente = {
    presets: estado.preferencias.presets,
    funcoes: estado.preferencias.funcoes ?? [],
    presetsPadrao: PRESETS_PADRAO,
    novoId,
    agora
  }
  const resultado = pedido.tipo === 'abrir' ? abrir(e, pedido, ambiente) : pedido.tipo === 'fechar' ? fechar(e, pedido) : passar(e, pedido, ambiente)
  if (!resultado.resposta.ok) return resultado.resposta
  // Pedidos de agentes são estado operacional: não entram no histórico de desfazer.
  if (pedido.tipo === 'fechar') fechadosPorAgente.add(pedido.id)
  mudarEspaco(() => resultado.espaco, false)
  if (pedido.tipo === 'fechar') {
    definir({ selecao: { ...estado.selecao, nos: estado.selecao.nos.filter((id) => id !== pedido.id) } })
  }
  return resultado.resposta
}
