// Ligar um fluxo sensível (Código, HTTP, MCP ou comando): o que a confirmação mostra, nó por nó, e o que mudou desde a última
// aprovação (plano §3, "regra de sensível"). Parte pura da `ConfirmarLigar.tsx`: roda no Node, sem React e sem DOM.
//
// O main guarda, em `aprovado.nos`, o hash de `assinaturaDoNo` de cada nó sensível que o usuário aprovou. A tela refaz o
// hash do que está no disco agora (SHA-256 em hexadecimal, o mesmo que o main usa) e compara: igual = o que você viu;
// diferente = mudou; ausente = nó novo. Quem decide de verdade é o main, que confere o `mostrado` contra o disco.
import type { FluxoGravado, NoDoFluxo } from '../../../../shared/fluxos/tipos'
// Node executa as provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { assinaturaDoMostrado, assinaturaDoNo, locaisDoFluxo, nosSensiveis } from '../../../../shared/fluxos/formato.ts'
// @ts-expect-error idem
import { quandoFoi } from './textos.ts'

export type EstadoDoNoSensivel = 'novo' | 'mudou' | 'igual'

export interface BlocoDoNo {
  rotulo: string
  texto: string
  /** Pintar como código (monoespaçado, com rolagem). */
  codigo?: boolean
  /** Um alerta em vermelho sobre este bloco (o que o nó diz não bate com o cadastro). */
  perigo?: string
}

/** Os servidores MCP do cadastro (Conexões › MCP): o que a confirmação usa para conferir o nome do nó pelo id. `null` = não deu para ler. */
export type CadastroDeServidores = readonly { id: string; nome: string }[] | null

export interface NoParaConfirmar {
  id: string
  nome: string
  tipo: NoDoFluxo['tipo']
  /** "Código", "Pedido HTTP" ou "Comando no shell". */
  titulo: string
  estado: EstadoDoNoSensivel
  /** Por que merece atenção (vazio quando é igual ao aprovado). */
  marcas: string[]
  /** O nome do agente que mexeu, quando a última edição foi de um agente e o nó não é igual ao aprovado. */
  porAgente: string | null
  blocos: BlocoDoNo[]
}

export type FazerHash = (assinatura: string) => Promise<string>

/** SHA-256 em hexadecimal minúsculo. */
export const sha256Hex: FazerHash = async (texto) => {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const TITULOS: Record<string, string> = { 'fora.codigo': 'Código', 'fora.http': 'Pedido HTTP', 'orkester.comando': 'Comando no shell', 'fora.mcp': 'Ferramenta MCP' }

const txt = (v: unknown): string => (typeof v === 'string' ? v : '')
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const paresEmTexto = (v: unknown): string =>
  (Array.isArray(v) ? v : [])
    .map((p) => objeto(p))
    .filter((p) => txt(p.nome))
    .map((p) => `${txt(p.nome)}: ${txt(p.valor)}`)
    .join('\n')

/** Tudo o que o nó faz, por inteiro (sem cortar): é isto que o usuário aprova. */
const semCaixa = (t: string): string => t.trim().toLocaleLowerCase('pt-BR')

/**
 * O bloco Servidor de um nó MCP. O motor chama o servidor PELO ID, então o nome mostrado é o do cadastro; o nome gravado no
 * nó (que um agente pode escrever como quiser) só entra para avisar, em vermelho, quando é outro ou quando o id não existe.
 */
function blocoDoServidor(servidor: Record<string, unknown>, cadastro: CadastroDeServidores | undefined): BlocoDoNo {
  const id = txt(servidor.id)
  const gravado = txt(servidor.nome)
  if (!id) return { rotulo: 'Servidor', texto: '(escolha o servidor)', perigo: 'O nó ainda não aponta para um servidor do cadastro.' }
  if (!cadastro) return { rotulo: 'Servidor', texto: `${gravado || '(sem nome)'} · id ${id}`, perigo: 'Não consegui ler o cadastro: o nome acima é o que está gravado no nó, e quem manda é o id.' }
  const do_cadastro = cadastro.find((s) => s.id === id)
  if (!do_cadastro) return { rotulo: 'Servidor', texto: `(não existe no cadastro) · id ${id}`, perigo: `O id deste nó não existe em Conexões › MCP${gravado ? ` (o nó diz “${gravado}”)` : ''}. Ele vai dar erro ao rodar.` }
  // (1.9.7) o id é ruído para quem lê: só aparece quando o nome do nó e o do cadastro divergem (o caso que já fica vermelho)
  const bate = semCaixa(gravado) === semCaixa(do_cadastro.nome)
  const bloco: BlocoDoNo = { rotulo: 'Servidor', texto: bate ? do_cadastro.nome : `${do_cadastro.nome} · id ${id}` }
  if (!bate) bloco.perigo = `O nó diz “${gravado || '(sem nome)'}”, mas o servidor com este id é “${do_cadastro.nome}”. Vale o do cadastro.`
  return bloco
}

export function blocosDoNo(no: Pick<NoDoFluxo, 'tipo' | 'ajustes'>, cadastro?: CadastroDeServidores): BlocoDoNo[] {
  const a = no.ajustes
  if (no.tipo === 'fora.codigo') return [{ rotulo: 'JavaScript', texto: txt(a.codigo), codigo: true }]
  if (no.tipo === 'orkester.comando') {
    const shell = objeto(a.terminal)
    return [
      { rotulo: 'Digita no shell', texto: txt(shell.nome) || '(escolha um shell)' },
      { rotulo: 'Comando', texto: txt(a.comando), codigo: true }
    ]
  }
  if (no.tipo === 'fora.http') {
    const corpo = objeto(a.corpo)
    const consulta = paresEmTexto(a.consulta)
    const cabecalhos = paresEmTexto(a.cabecalhos)
    const lista: BlocoDoNo[] = [{ rotulo: 'Pedido', texto: `${txt(a.metodo) || 'GET'} ${txt(a.url)}`, codigo: true }]
    if (consulta) lista.push({ rotulo: 'Consulta', texto: consulta, codigo: true })
    if (cabecalhos) lista.push({ rotulo: 'Cabeçalhos', texto: cabecalhos, codigo: true })
    if (txt(corpo.tipo) && txt(corpo.tipo) !== 'nenhum') lista.push({ rotulo: `Corpo (${txt(corpo.tipo)})`, texto: txt(corpo.valor), codigo: true })
    lista.push({ rotulo: 'Credencial', texto: txt(a.credencial) ? `${txt(a.credencial)} (só o nome; o valor fica no cofre)` : 'nenhuma' })
    return lista
  }
  if (no.tipo === 'fora.mcp') {
    const servidor = objeto(a.servidor)
    return [
      blocoDoServidor(servidor, cadastro),
      { rotulo: 'Ferramenta', texto: txt(a.ferramenta) || '(escolha a ferramenta)', codigo: true },
      { rotulo: 'Argumentos', texto: txt(a.argumentos) || '{}', codigo: true }
    ]
  }
  return []
}

/**
 * Os nós sensíveis do fluxo salvo, cada um com o que mostrar e a situação diante do que o usuário aprovou antes.
 * `hash` é injetável para a prova; na tela é o `sha256Hex`.
 */
export async function descreverNosSensiveis(fluxo: FluxoGravado, hash: FazerHash = sha256Hex, cadastro?: CadastroDeServidores): Promise<NoParaConfirmar[]> {
  const aprovados = fluxo.aprovado?.nos ?? {}
  const agente = fluxo.editadoPor?.id ? fluxo.editadoPor.nome || 'um agente' : null
  const criouAgente = fluxo.criadoPor?.id ? fluxo.criadoPor.nome || 'um agente' : null
  const saida: NoParaConfirmar[] = []
  for (const no of nosSensiveis(fluxo)) {
    const antes = aprovados[no.id]
    const agora = await hash(assinaturaDoNo(no))
    const estado: EstadoDoNoSensivel = !fluxo.aprovado || antes === undefined ? 'novo' : antes.toLowerCase() === agora.toLowerCase() ? 'igual' : 'mudou'
    const marcas: string[] = []
    let porAgente: string | null = null
    if (estado === 'novo') marcas.push(fluxo.aprovado ? 'Nó novo: você ainda não aprovou este.' : 'Você ainda não aprovou este nó.')
    if (estado === 'mudou') marcas.push(`Mudou desde a sua última aprovação (${quandoFoi(fluxo.aprovado?.em)}).`)
    if (estado !== 'igual') {
      porAgente = agente ?? (estado === 'novo' ? criouAgente : null)
      if (porAgente) marcas.push(agente ? `Mexido pelo agente ${porAgente}.` : `Criado pelo agente ${porAgente}.`)
    }
    saida.push({ id: no.id, nome: no.nome, tipo: no.tipo, titulo: TITULOS[no.tipo] ?? no.tipo, estado, marcas, porAgente, blocos: blocosDoNo(no, cadastro) })
  }
  return saida
}

/** O que a confirmação vai fazer: `ligar` (passa a disparar sozinho) ou `rodar` (o botão Rodar fluxo: uma vez só, agora). */
export type ModoDaConfirmacao = 'ligar' | 'rodar'

/** Os textos de cada modo: o título, a frase de abertura, o que a pessoa declara ter lido e o botão. */
export function textosDaConfirmacao(modo: ModoDaConfirmacao, nome: string): { titulo: string; abertura: string; li: string; botao: string } {
  if (modo === 'rodar')
    return {
      titulo: `Rodar “${nome}” agora?`,
      abertura: 'Este fluxo tem nós que rodam código, falam com a internet, chamam ferramentas de servidores MCP ou digitam num shell. Confira cada um:',
      li: 'Li o que cada nó acima faz e quero rodar este fluxo uma vez.',
      botao: 'Aprovar e rodar uma vez'
    }
  return {
    titulo: `Ligar “${nome}”?`,
    abertura: 'Este fluxo tem nós que rodam código, falam com a internet, chamam ferramentas de servidores MCP ou digitam num shell. Ligado, ele faz isso sozinho, sem perguntar de novo. Confira cada um:',
    li: 'Li o que cada nó acima faz e quero ligar este fluxo.',
    botao: 'Ligar o fluxo'
  }
}

/** As frases do alto da confirmação: o que é o fluxo e o que merece atenção antes de ligar (ou de rodar uma vez). */
export function avisosDoFluxo(fluxo: Pick<FluxoGravado, 'desligadoPor' | 'rede' | 'limite' | 'nome'>, nos: readonly NoParaConfirmar[], modo: ModoDaConfirmacao = 'ligar'): string[] {
  const frases: string[] = []
  if (fluxo.desligadoPor?.motivo === 'mudou-sem-aprovacao') frases.push('Este fluxo foi desligado porque um nó sensível mudou sem a sua aprovação.')
  // os endereços locais permitidos (#91), canônicos: a mesma lista que o `mostrado` assina
  const locais = locaisDoFluxo(fluxo)
  if (locais.length) frases.push(`Pode chamar no seu computador/rede: ${locais.join(', ')}.`)
  const mudados = nos.filter((n) => n.estado !== 'igual').length
  if (mudados) frases.push(`${mudados === 1 ? '1 nó sensível' : `${mudados} nós sensíveis`} para você conferir: ${mudados === 1 ? 'está marcado' : 'estão marcados'} abaixo.`)
  else if (nos.length) frases.push('Nenhum nó mudou desde a sua última aprovação.')
  frases.push(modo === 'rodar' ? 'Rodar fluxo roda uma vez só, agora, e não liga o fluxo.' : `Depois de ligado, dispara sozinho, até ${fluxo.limite.porHora} vezes por hora.`)
  return frases
}

/**
 * O que a tela manda ao main como `mostrado`: a assinatura de cada nó sensível e da lista de endereços locais, igual à
 * que o main refaz do disco. Por isso vai o fluxo lido do disco (com `rede`), não o rascunho.
 */
export const mostradoDe = (fluxo: Pick<FluxoGravado, 'nos' | 'rede'>): string => assinaturaDoMostrado(fluxo)
