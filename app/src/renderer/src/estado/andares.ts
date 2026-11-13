import { type Andar, type ResultadoGit } from '../../../shared/modelo'
import { definir, estado, historicos, mudarEspaco, NADA, planoDe, salvarAgora, zerarUltimaChave } from './nucleo'

// ---------- andares ----------

export function abrirVistaAndares(aberta: boolean): void {
  definir({ vistaAndares: aberta })
}

/** Mostra outro andar (null = térreo). A troca de andar não entra no desfazer. */
export function irParaAndar(andarId: string | null): void {
  const e = estado.espaco
  if (!e) return
  const existe = andarId === null || e.andares.some((a) => a.id === andarId)
  if (!existe || e.andarAtivo === andarId) return
  mudarEspaco((esp) => ({ ...esp, andarAtivo: andarId }), false)
  definir({ selecao: NADA, editando: null, ferramenta: 'selecionar' })
}

/** Cria o andar (com git: ramo + worktree, feito pelo processo principal) e vai para ele. */
export async function criarAndar(nome: string, usarGit: boolean): Promise<void> {
  const e = estado.espaco
  if (!e) return
  if (!(await salvarAgora())) throw new Error('Não consegui salvar o quadro; o andar não foi criado.')
  const andar = await window.ork.andares.criar(e.id, nome, usarGit)
  // a câmera do andar novo começa onde o térreo está, para a transição ficar no mesmo lugar
  const novo: Andar = { ...andar, camera: planoDe(estado.espaco!).camera }
  mudarEspaco((esp) => ({ ...esp, andares: [...esp.andares, novo], andarAtivo: novo.id }), false)
  definir({ selecao: NADA, editando: null })
  await salvarAgora()
}

export function renomearAndar(andarId: string, nome: string): void {
  const limpo = nome.trim()
  if (!limpo) return
  mudarEspaco((e) => ({ ...e, andares: e.andares.map((a) => (a.id === andarId ? { ...a, nome: limpo } : a)) }), false)
}

export function definirStatusAndar(andarId: string, status: Andar['status']): void {
  mudarEspaco((e) => ({ ...e, andares: e.andares.map((a) => (a.id === andarId ? { ...a, status } : a)) }), false)
}

/** Tira o andar do espaço (depois de juntado ou apagado no git). Os post-its dele saem junto. */
function retirarAndar(andarId: string): void {
  const e = estado.espaco
  const andar = e?.andares.find((a) => a.id === andarId)
  if (!e || !andar) return
  const notas = { ...estado.notas }
  for (const n of andar.nos) if (n.tipo === 'postit') delete notas[n.arquivo]
  definir({ notas })
  mudarEspaco(
    (esp) => ({
      ...esp,
      andares: esp.andares.filter((a) => a.id !== andarId),
      andarAtivo: esp.andarAtivo === andarId ? null : esp.andarAtivo
    }),
    false
  )
  historicos.delete(andarId)
  zerarUltimaChave()
}

const NAO_SALVOU: ResultadoGit = { ok: false, mensagem: 'Não consegui salvar o quadro; nada foi feito no git.' }

export async function pousarAndar(andarId: string, apagarRamo: boolean, destino: string): Promise<ResultadoGit> {
  const e = estado.espaco
  if (!e) return { ok: false, mensagem: 'nenhum espaço aberto' }
  if (!(await salvarAgora())) return NAO_SALVOU
  const r = await window.ork.andares.pousar(e.id, andarId, apagarRamo, destino)
  if (r.ok) {
    retirarAndar(andarId)
    await salvarAgora()
  }
  return r
}

export async function apagarAndar(andarId: string, apagarRamo: boolean, forcar: boolean): Promise<ResultadoGit> {
  const e = estado.espaco
  if (!e) return { ok: false, mensagem: 'nenhum espaço aberto' }
  if (!(await salvarAgora())) return NAO_SALVOU
  const r = await window.ork.andares.apagar(e.id, andarId, apagarRamo, forcar)
  if (r.ok) {
    retirarAndar(andarId)
    await salvarAgora()
  }
  return r
}
