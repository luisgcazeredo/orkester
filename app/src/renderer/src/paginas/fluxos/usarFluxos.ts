import { useCallback, useEffect, useRef, useState } from 'react'
import type { ListaDeFluxos } from './contrato'
import { apiDeFluxos } from './fluxosApi'

// A lista de fluxos de um espaço. O processo principal é o dono dos arquivos: a página lê, pede mudanças e relê quando
// chega o aviso `mudou(espacoId)` (disparo, agente pelo `ork`, outra janela). Além do aviso, relê de 3 em 3 s com a
// janela visível, como o Kanban (o último disparo muda sem gravação de fluxo).

const PASSO_MS = 3000

export interface DadosDosFluxos {
  lista: ListaDeFluxos | null
  erro: string | null
  recarregar: () => void
}

export function usarFluxos(espacoId: string | undefined): DadosDosFluxos {
  const [lida, setLida] = useState<{ espacoId: string; lista: ListaDeFluxos } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // a resposta de uma leitura antiga (outro espaço, ou anterior a uma mais nova) não sobrescreve a atual
  const vez = useRef(0)

  const recarregar = useCallback((): void => {
    if (!espacoId) return
    const minha = ++vez.current
    apiDeFluxos()
      .listar(espacoId)
      .then(
        (lista) => {
          if (vez.current !== minha) return
          setLida({ espacoId, lista })
          setErro(null)
        },
        (e: unknown) => {
          if (vez.current === minha) setErro(e instanceof Error ? e.message : String(e))
        }
      )
  }, [espacoId])

  useEffect(() => {
    setErro(null)
    if (!espacoId) return
    recarregar()
    const soltar = apiDeFluxos().aoMudar((id) => {
      if (id === espacoId) recarregar()
    })
    const t = setInterval(() => {
      if (!document.hidden) recarregar()
    }, PASSO_MS)
    const visivel = (): void => {
      if (!document.hidden) recarregar()
    }
    document.addEventListener('visibilitychange', visivel)
    return () => {
      soltar()
      clearInterval(t)
      document.removeEventListener('visibilitychange', visivel)
    }
  }, [espacoId, recarregar])

  const valida = lida && lida.espacoId === espacoId ? lida : null
  return { lista: valida?.lista ?? null, erro, recarregar }
}
