import { useCallback, useEffect, useRef, useState } from 'react'
import type { LeituraDoKanban, OperacaoDoKanban, ResultadoDoKanban } from '../../../../shared/kanban'

// Os dados do Kanban do espaço desta janela. O processo principal é o dono do arquivo: a página lê, pede mudanças e
// relê quando chega o aviso `{ tipo: 'kanban' }` (agente, MCP ou outra janela gravou). A situação dos responsáveis
// (livre/ocupado) muda sem gravação nenhuma, então a leitura também se repete de 3 em 3 s com a janela visível.

const PASSO_MS = 3000

// `aoAvisar` prende um ouvinte de IPC por chamada e não tem como soltar: liga UMA vez e reparte daqui.
const ouvintes = new Set<(espacoId: string) => void>()
let ligado = false
export function ouvirAvisos(ouvinte: (espacoId: string) => void): () => void {
  if (!ligado) {
    ligado = true
    window.ork.janelas.aoAvisar((aviso) => {
      if (aviso.tipo === 'kanban') ouvintes.forEach((o) => o(aviso.espacoId))
    })
  }
  ouvintes.add(ouvinte)
  return () => void ouvintes.delete(ouvinte)
}

export interface DadosDoKanban {
  leitura: LeituraDoKanban | null
  erro: string | null
  aplicar: (operacao: OperacaoDoKanban) => Promise<ResultadoDoKanban>
}

export function usarKanban(espacoId: string | undefined): DadosDoKanban {
  // a leitura guarda de que espaço é: logo depois de trocar de espaço, a do anterior não vale (nem por um quadro)
  const [lida, setLida] = useState<{ espacoId: string; leitura: LeituraDoKanban } | null>(null)
  const leitura = lida && lida.espacoId === espacoId ? lida.leitura : null
  const [erro, setErro] = useState<string | null>(null)
  // Cada gravação sobe a geração: uma leitura que saiu antes dela (e volta depois) traria o arquivo velho de volta.
  const geracao = useRef(0)

  const ler = useCallback((): void => {
    if (!espacoId) return
    const minha = geracao.current
    window.ork.kanban.ler(espacoId).then(
      (l) => {
        if (geracao.current !== minha) return
        setLida({ espacoId, leitura: l })
        setErro(null)
      },
      (e: unknown) => setErro(e instanceof Error ? e.message : String(e))
    )
  }, [espacoId])

  useEffect(() => {
    setErro(null)
    if (!espacoId) return
    ler()
    const sair = ouvirAvisos((id) => {
      if (id === espacoId) ler()
    })
    const t = setInterval(() => {
      if (!document.hidden) ler()
    }, PASSO_MS)
    const visivel = (): void => {
      if (!document.hidden) ler()
    }
    document.addEventListener('visibilitychange', visivel)
    return () => {
      sair()
      clearInterval(t)
      document.removeEventListener('visibilitychange', visivel)
    }
  }, [espacoId, ler])

  const aplicar = useCallback(
    async (operacao: OperacaoDoKanban): Promise<ResultadoDoKanban> => {
      if (!espacoId) return { ok: false, erro: 'nenhum espaço aberto nesta janela' }
      geracao.current++
      let r: ResultadoDoKanban
      try {
        r = await window.ork.kanban.aplicar(espacoId, operacao)
      } catch (e) {
        r = { ok: false, erro: e instanceof Error ? e.message : String(e) }
      }
      if (r.ok) {
        const arquivo = r.arquivo
        setLida((l) => (l && l.espacoId === espacoId ? { ...l, leitura: { ...l.leitura, arquivo } } : l))
      }
      return r
    },
    [espacoId]
  )

  return { leitura, erro, aplicar }
}
