import { useCallback, useEffect, useRef, useState } from 'react'
import type { ListaDeCredenciais } from '../../../../shared/fluxos/credenciais'

// As credenciais globais dos fluxos. O main é o dono do arquivo e só devolve metadados (nome, tipo, domínios e os 4
// últimos caracteres): o valor nunca chega aqui. Lê ao montar e quando a janela volta a ficar visível (a aba de
// Conexões e o nó HTTP do editor usam o mesmo hook).

export interface DadosDasCredenciais {
  lista: ListaDeCredenciais | null
  erro: string | null
  recarregar: () => Promise<void>
}

export function usarCredenciais(): DadosDasCredenciais {
  const [lista, setLista] = useState<ListaDeCredenciais | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // a resposta de uma leitura antiga não sobrescreve a mais nova
  const vez = useRef(0)

  const recarregar = useCallback(async (): Promise<void> => {
    const minha = ++vez.current
    try {
      const l = await window.ork.credenciais.listar()
      if (vez.current !== minha) return
      setLista(l)
      setErro(null)
    } catch (e) {
      if (vez.current === minha) setErro(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void recarregar()
    const visivel = (): void => {
      if (!document.hidden) void recarregar()
    }
    document.addEventListener('visibilitychange', visivel)
    return () => document.removeEventListener('visibilitychange', visivel)
  }, [recarregar])

  return { lista, erro, recarregar }
}
