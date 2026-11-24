import { useCallback, useEffect, useRef, useState } from 'react'
import type { Execucao, ResumoDaExecucao } from '../../../../../shared/fluxos/tipos'
import { apiDeFluxos } from '../fluxosApi'

// As execuções de um fluxo. O main é o dono do disco (as 50 últimas por fluxo): a lista relê quando chega o aviso
// `aoMudarExecucao` do mesmo fluxo (uma execução acabou ou foi barrada) e quando a janela volta a ficar visível.

const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export interface DadosDasExecucoes {
  /** Da mais nova para a mais antiga; `null` enquanto lê. */
  lista: ResumoDaExecucao[] | null
  erro: string | null
  recarregar: () => void
}

/** `fluxoId: null` (fluxo ainda não salvo) não tem execuções. */
export function usarExecucoes(espacoId: string | undefined, fluxoId: string | null): DadosDasExecucoes {
  const [lida, setLida] = useState<{ chave: string; lista: ResumoDaExecucao[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // a resposta de uma leitura antiga (outro fluxo, ou anterior a uma mais nova) não sobrescreve a atual
  const vez = useRef(0)
  const chave = espacoId && fluxoId ? `${espacoId}/${fluxoId}` : ''

  const recarregar = useCallback((): void => {
    if (!espacoId || !fluxoId) return
    const minha = ++vez.current
    apiDeFluxos()
      .execucoes(espacoId, fluxoId, 50)
      .then(
        (lista) => {
          if (vez.current !== minha) return
          setLida({ chave: `${espacoId}/${fluxoId}`, lista })
          setErro(null)
        },
        (e: unknown) => {
          if (vez.current === minha) setErro(mensagemDe(e))
        }
      )
  }, [espacoId, fluxoId])

  useEffect(() => {
    setErro(null)
    if (!chave) return
    recarregar()
    const soltar = apiDeFluxos().aoMudarExecucao((esp, fluxo) => {
      if (esp === espacoId && fluxo === fluxoId) recarregar()
    })
    const visivel = (): void => {
      if (!document.hidden) recarregar()
    }
    document.addEventListener('visibilitychange', visivel)
    return () => {
      soltar()
      document.removeEventListener('visibilitychange', visivel)
    }
  }, [chave, espacoId, fluxoId, recarregar])

  return { lista: lida && lida.chave === chave ? lida.lista : null, erro, recarregar }
}

export interface DadosDaExecucaoAberta {
  execucao: Execucao | null
  carregando: boolean
  erro: string | null
}

/** O detalhe de uma execução (entrada e saída de cada nó). `execId: null` = nenhuma aberta. */
export function usarExecucaoAberta(espacoId: string | undefined, fluxoId: string | null, execId: string | null): DadosDaExecucaoAberta {
  const [lida, setLida] = useState<{ chave: string; execucao: Execucao | null; erro: string | null } | null>(null)
  const chave = espacoId && fluxoId && execId ? `${espacoId}/${fluxoId}/${execId}` : ''

  useEffect(() => {
    if (!chave || !espacoId || !fluxoId || !execId) return
    let valida = true
    apiDeFluxos()
      .execucao(espacoId, fluxoId, execId)
      .then(
        (execucao) => {
          if (valida) setLida({ chave, execucao, erro: execucao ? null : 'Esta execução não está mais no disco: o Orkester guarda só as 50 últimas de cada fluxo.' })
        },
        (e: unknown) => {
          if (valida) setLida({ chave, execucao: null, erro: mensagemDe(e) })
        }
      )
    return () => {
      valida = false
    }
  }, [chave, espacoId, fluxoId, execId])

  const atual = lida && lida.chave === chave ? lida : null
  return { execucao: atual?.execucao ?? null, carregando: !!chave && !atual, erro: atual?.erro ?? null }
}
