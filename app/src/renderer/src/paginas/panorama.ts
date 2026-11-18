import { useCallback, useEffect, useState } from 'react'
import type { Panorama } from '../../../shared/api'
import type { ResumoEspaco } from '../../../shared/modelo'
import { usarLoja } from '../estado/loja'

const PASSO_MS = 3000

/**
 * Os espaços (lista do app) e o panorama do processo principal: agentes vivos e rotinas de TODOS os espaços, em
 * qualquer janela. Só leitura; pergunta de 3 em 3 s enquanto a página está montada e a janela visível (oculta ou
 * minimizada não gasta), e de novo sob demanda. `agentes: false` dispensa a leitura dos agentes.
 */
export function usarPanorama(opcoes?: { agentes?: boolean }): { espacos: ResumoEspaco[]; atualId: string | undefined; panorama: Panorama | null; recarregar: () => void } {
  const espacos = usarLoja((e) => e.espacos)
  const atualId = usarLoja((e) => e.espaco?.id)
  const comAgentes = opcoes?.agentes !== false
  const [panorama, setPanorama] = useState<Panorama | null>(null)
  const recarregar = useCallback((): void => {
    window.ork.panorama.ler(comAgentes ? undefined : { agentes: false }).then(setPanorama, () => {})
  }, [comAgentes])
  useEffect(() => {
    recarregar()
    const t = setInterval(() => {
      if (!document.hidden) recarregar()
    }, PASSO_MS)
    // ao voltar a ficar visível, lê já em vez de esperar o próximo passo
    const visivel = (): void => {
      if (!document.hidden) recarregar()
    }
    document.addEventListener('visibilitychange', visivel)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', visivel)
    }
  }, [recarregar])
  return { espacos, atualId, panorama, recarregar }
}
