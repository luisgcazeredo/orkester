import { type CorPostIt, type Funcao, type No, type PresetAgente } from '../../../shared/modelo'
import { resolverModelo } from '../../../shared/modelos'
import { proximoZ } from '../../../shared/quadro/geometria'
import { TOM_DO_POSTIT } from './coresDeDados'
import { entregarPrimeiroPedido } from './espacos'
import { definir, estado, mudarPlano, NADA, planoAtual, registrarHistorico } from './nucleo'

// ---------- nós ----------

export const novoId = (): string => crypto.randomUUID()
export const agora = (): string => new Date().toISOString()

export function acharNo(id: string): No | undefined {
  return planoAtual()?.nos.find((n) => n.id === id)
}

export type NovoNo =
  | { tipo: 'terminal'; preset: PresetAgente; funcao?: Funcao }
  /** `texto`: já nasce escrito (colado); sem ele, abre para digitar. */
  | { tipo: 'postit'; texto?: string }
  | { tipo: 'texto'; texto?: string }
  | { tipo: 'arquivo'; caminho: string; nome: string }
  | { tipo: 'pasta'; caminho: string }
  | { tipo: 'portal'; url: string }
  /** Cartão de código: acompanha um terminal (segue o que ele mexe) ou fica preso num arquivo. */
  | { tipo: 'codigo'; terminal?: string; caminho?: string }
  /** Imagem já gravada em `imagens/` do espaço; largura e altura em pixels da imagem. */
  | { tipo: 'imagem'; arquivo: string; largura: number; altura: number }

/** Tamanho com que uma imagem colada entra no quadro: inteira até 640 de largura (ou 480 de altura). */
function tamanhoDaImagem(largura: number, altura: number): { largura: number; altura: number } {
  const escala = Math.min(1, 640 / Math.max(largura, 1), 480 / Math.max(altura, 1))
  return { largura: Math.max(40, Math.round(largura * escala)), altura: Math.max(40, Math.round(altura * escala)) }
}

/** Cria um nó com o centro em (x, y) do quadro e já o seleciona. */
export function adicionarNo(novo: NovoNo, x: number, y: number): string {
  const plano = planoAtual()
  if (!plano) return ''
  registrarHistorico()
  const base = { id: novoId(), z: proximoZ(plano), criadoEm: agora() }
  const centrado = (largura: number, altura: number) => ({ x: x - largura / 2, y: y - altura / 2, largura, altura })
  let no: No
  switch (novo.tipo) {
    case 'terminal': {
      // com função, o cartão nasce com o nome do papel (é assim que você e os agentes falam dele). O número
      // só entra quando o nome já está em uso — a mesma regra do `ork abrir`, para os dois caminhos baterem
      const comoChamar = novo.funcao?.nome ?? novo.preset.nome
      const usados = new Set(plano.nos.flatMap((n) => (n.tipo === 'terminal' ? [n.nome.toLowerCase()] : [])))
      let comoNomear = comoChamar
      for (let i = 2; usados.has(comoNomear.toLowerCase()); i++) comoNomear = `${comoChamar} ${i}`
      // modelo e esforço: a mesma regra do `ork abrir` (função, depois preset; cada campo sozinho). A função só vale
      // no motor do preset dela: se o preset dela sumiu e o menu caiu em outro, o modelo dela fica de fora
      const funcaoServe = !!novo.funcao && (!novo.funcao.preset || novo.funcao.preset === novo.preset.id)
      const { modelo, esforco } =
        novo.preset.agente === 'shell' ? {} : resolverModelo(undefined, funcaoServe ? novo.funcao : undefined, novo.preset)
      no = {
        ...base,
        ...centrado(800, 500),
        tipo: 'terminal',
        nome: comoNomear,
        agente: novo.preset.agente,
        comando: novo.preset.comando,
        funcao: novo.funcao?.nome,
        pasta: novo.funcao?.pasta || undefined,
        ...(modelo !== undefined ? { modelo } : {}),
        ...(esforco !== undefined ? { esforco } : {}),
        // o prompt da função é entregue pelo processo principal, que sabe quando o agente ficou pronto
        // o Claude aceita o id da conversa desde o começo: com ele, o cartão retoma a mesma conversa ao reabrir
        sessao: novo.preset.agente === 'claude' ? novoId() : undefined
      }
      break
    }
    case 'postit':
      no = { ...base, ...centrado(260, 160), tipo: 'postit', arquivo: `${base.id}.md`, cor: estado.preferencias.corPostItPadrao }
      definir({ notas: { ...estado.notas, [no.arquivo]: novo.texto ?? '' } })
      break
    case 'texto':
      no = { ...base, ...centrado(novo.texto ? 420 : 240, 48), tipo: 'texto', texto: novo.texto ?? '', tamanhoFonte: 24, mono: false }
      break
    case 'imagem': {
      const { largura, altura } = tamanhoDaImagem(novo.largura, novo.altura)
      no = { ...base, ...centrado(largura, altura), tipo: 'imagem', arquivo: novo.arquivo }
      break
    }
    case 'arquivo':
      no = { ...base, ...centrado(180, 140), tipo: 'arquivo', caminho: novo.caminho, nomeExibido: novo.nome }
      break
    case 'pasta':
      no = { ...base, ...centrado(300, 380), tipo: 'pasta', caminho: novo.caminho, expandidas: [] }
      break
    case 'portal':
      no = { ...base, ...centrado(900, 600), tipo: 'portal', url: novo.url }
      break
    case 'codigo':
      // preso num arquivo, o interesse é o arquivo inteiro; acompanhando um agente, é o que ele mudou
      no = {
        ...base,
        ...centrado(620, 460),
        tipo: 'codigo',
        terminal: novo.terminal,
        caminho: novo.caminho,
        modo: novo.caminho && !novo.terminal ? 'conteudo' : 'diff'
      }
      break
  }
  mudarPlano((p) => ({ ...p, nos: [...p.nos, no] }), false)
  if (novo.tipo === 'terminal' && novo.funcao?.prompt.trim()) entregarPrimeiroPedido(no.id, novo.funcao.prompt)
  definir({
    selecao: { ...NADA, nos: [no.id] },
    editando: (novo.tipo === 'postit' || novo.tipo === 'texto') && !novo.texto ? no.id : null,
    ferramenta: 'selecionar'
  })
  return no.id
}

/** `chave`: mudanças seguidas com a mesma chave viram um passo de desfazer; `false`: fora do histórico. */
export function atualizarNo(id: string, parcial: Partial<No>, chave?: string | false): void {
  // mexer no conteúdo de um cartão de código (modo, arquivo, tamanho) não o tira da coluna do agente:
  // quem tira é arrastar para longe dela, ou o menu (ver assentarCodigos)
  const meu = (n: No): No => ({ ...n, ...parcial }) as No
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (n.id === id ? meu(n) : n)) }), chave)
}

/** Põe os cartões por cima de todo o resto, na mesma ordem entre eles. Fora do desfazer. */
export function trazerParaFrente(ids: string | string[]): void {
  const plano = planoAtual()
  const lista = new Set(typeof ids === 'string' ? [ids] : ids)
  if (!plano || !lista.size) return
  const escolhidos = plano.nos.filter((n) => lista.has(n.id)).sort((a, b) => a.z - b.z)
  const topo = Math.max(0, ...plano.nos.filter((n) => !lista.has(n.id)).map((n) => n.z), ...plano.desenhos.map((d) => d.z))
  if (escolhidos.every((n) => n.z > topo)) return
  const novoZ = new Map(escolhidos.map((n, i) => [n.id, topo + 1 + i]))
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (novoZ.has(n.id) ? { ...n, z: novoZ.get(n.id)! } : n)) }), false)
}

/** Põe os cartões selecionados por baixo de todo o resto. */
export function enviarParaTras(): void {
  const plano = planoAtual()
  const lista = new Set(estado.selecao.nos)
  if (!plano || !lista.size) return
  const escolhidos = plano.nos.filter((n) => lista.has(n.id)).sort((a, b) => a.z - b.z)
  const fundo = Math.min(0, ...plano.nos.filter((n) => !lista.has(n.id)).map((n) => n.z), ...plano.desenhos.map((d) => d.z))
  const novoZ = new Map(escolhidos.map((n, i) => [n.id, fundo - escolhidos.length + i]))
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (novoZ.has(n.id) ? { ...n, z: novoZ.get(n.id)! } : n)) }))
}

export function definirCorNo(id: string, cor: string | undefined): void {
  atualizarNo(id, { cor } as Partial<No>)
}

/** Pinta a seleção inteira: cartões, textos e traços. Post-it ganha o tom pastel correspondente. */
export function definirCorSelecao(cor: string | null): void {
  const s = estado.selecao
  mudarPlano((p) => ({
    ...p,
    nos: p.nos.map((n) => {
      if (!s.nos.includes(n.id)) return n
      if (n.tipo === 'postit') return cor && TOM_DO_POSTIT[cor] ? { ...n, cor: TOM_DO_POSTIT[cor] } : n
      return { ...n, cor: cor ?? undefined }
    }),
    desenhos: cor ? p.desenhos.map((d) => (s.desenhos.includes(d.id) ? { ...d, cor } : d)) : p.desenhos
  }))
}

/** Só post-its selecionados: o tom pastel. */
export function definirTomPostIts(cor: CorPostIt): void {
  const s = estado.selecao
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (n.tipo === 'postit' && s.nos.includes(n.id) ? { ...n, cor } : n)) }))
}

/** Trava todos (se algum estava solto) ou destrava todos. */
export function alternarTravaSelecao(): void {
  const s = estado.selecao
  const nos = planoAtual()?.nos.filter((n) => s.nos.includes(n.id)) ?? []
  if (!nos.length) return
  const travar = nos.some((n) => !n.travado)
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (s.nos.includes(n.id) ? { ...n, travado: travar } : n)) }))
}
