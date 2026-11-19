import { useSyncExternalStore } from 'react'
import { confirmar } from '../../ui/Perguntas'
import { exigirOk, mensagemDeErro, type ApiPaginas } from './contrato'
import { AVISO_DA_CHAVE } from './textos'

type ListaDePaginas = Awaited<ReturnType<ApiPaginas['listar']>>

// O que a janela sabe das páginas extras: a lista do main (dono do registro) e as quedas avisadas desde a última carga.
// O main é a verdade: a tela relê a lista a cada aviso `{tipo:'paginas'}` e depois de cada ação; nada fica decidido aqui.

/** A API do preload (null só num preload antigo: aí o recurso não aparece). */
export function apiPaginas(): ApiPaginas | null {
  return window.ork.paginas ?? null
}

interface Estado {
  lista: ListaDePaginas | null
  /** id → motivo da última queda avisada (`pagina-caiu`), até o usuário recarregar. */
  quedas: ReadonlyMap<string, string>
  erro: string
}

let estado: Estado = { lista: null, quedas: new Map(), erro: '' }
const ouvintes = new Set<() => void>()

function mudar(parcial: Partial<Estado>): void {
  estado = { ...estado, ...parcial }
  ouvintes.forEach((o) => o())
}

export function aoMudarPaginas(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => void ouvintes.delete(ouvinte)
}

export function lerPaginas(): Estado {
  return estado
}

export function usarPaginas(): Estado {
  return useSyncExternalStore(aoMudarPaginas, lerPaginas)
}

// Leituras que saem fora de ordem: só a mais nova vale.
let geracao = 0

export async function recarregarPaginas(): Promise<void> {
  const api = apiPaginas()
  if (!api) return
  const minha = ++geracao
  try {
    const lista = await api.listar()
    if (minha === geracao) mudar({ lista, erro: '' })
  } catch (e) {
    if (minha === geracao) mudar({ erro: `Não consegui ler as páginas: ${e instanceof Error ? e.message : String(e)}` })
  }
}

export function esquecerQueda(id: string): void {
  if (!estado.quedas.has(id)) return
  const quedas = new Map(estado.quedas)
  quedas.delete(id)
  mudar({ quedas })
}

let iniciado = false

/** Liga UMA vez (o `aoAvisar` não solta ouvinte): lê a lista e passa a seguir os avisos do main. */
export function iniciarEstadoDasPaginas(): void {
  if (iniciado || !apiPaginas()) return
  iniciado = true
  window.ork.janelas.aoAvisar((aviso) => {
    if (aviso.tipo !== 'paginas' && aviso.tipo !== 'pagina-caiu') return
    if (aviso.tipo === 'pagina-caiu') mudar({ quedas: new Map(estado.quedas).set(aviso.id, aviso.motivo) })
    void recarregarPaginas()
  })
  void recarregarPaginas()
}

/**
 * Liga ou desliga a chave geral "Páginas próprias". Ligar pede confirmação com o aviso de sempre (§4). Usado por
 * Conexões e pelo painel do "+". Devolve o erro (vazio = deu certo ou o usuário cancelou).
 */
export async function alternarChaveDasPaginas(ligar: boolean): Promise<string> {
  const api = apiPaginas()
  if (!api) return ''
  if (ligar) {
    const r = await confirmar({
      titulo: 'Ligar páginas próprias?',
      mensagem: AVISO_DA_CHAVE,
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar' },
        { rotulo: 'Ligar', valor: 'ligar', primario: true }
      ]
    })
    if (r.botao !== 'ligar') return ''
  }
  let erro = ''
  try {
    exigirOk(await api.chaveGeral(ligar))
  } catch (e) {
    erro = mensagemDeErro(e)
  }
  await recarregarPaginas()
  return erro
}
