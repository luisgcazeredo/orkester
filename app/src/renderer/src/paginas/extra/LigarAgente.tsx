import { useEffect, useRef, useState } from 'react'
import { Link2, Unlink } from 'lucide-react'
import type { AgenteDoKanban } from '../../../../shared/kanban'
import { usarLoja } from '../../estado/loja'
import { exigirOk, mensagemDeErro, type PaginaInstalada } from './contrato'
import { apiPaginas, recarregarPaginas } from './estado'

// "Ligar a agente…" (§3, corda de página): quem liga é o usuário, aqui. Lista os cartões Claude/Codex do espaço DESTA
// janela (a mesma leitura que o Kanban usa) e liga/desliga a corda pelo main, que confere tudo de novo.

const MAX_CORDAS = 10

export function LigarAgente({ pagina }: { pagina: PaginaInstalada }) {
  // dois seletores de valor simples: um objeto novo a cada leitura faria o useSyncExternalStore redesenhar sem fim
  const espacoId = usarLoja((e) => e.espaco?.id)
  const espacoNome = usarLoja((e) => e.espaco?.nome)
  const espaco = espacoId ? { id: espacoId, nome: espacoNome ?? '' } : null
  const [aberto, setAberto] = useState(false)
  const [agentes, setAgentes] = useState<AgenteDoKanban[] | null>(null)
  const [erro, setErro] = useState('')
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto || !espacoId) return
    let vivo = true
    setAgentes(null)
    window.ork.kanban.ler(espacoId).then(
      (l) => vivo && setAgentes(l.agentes.filter((a) => a.agente === 'claude' || a.agente === 'codex')),
      (e) => vivo && setErro(`Não consegui ler os agentes: ${mensagemDeErro(e)}`)
    )
    return () => {
      vivo = false
    }
  }, [aberto, espacoId])

  // fecha ao clicar fora ou com Esc
  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent): void => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false)
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAberto(false)
    }
    window.addEventListener('pointerdown', fora)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('pointerdown', fora)
      window.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const ligada = (cartaoId: string): boolean => pagina.cordas.some((c) => c.espacoId === espacoId && c.cartaoId === cartaoId)

  async function alternar(a: AgenteDoKanban): Promise<void> {
    const api = apiPaginas()
    if (!api || !espacoId) return
    setErro('')
    try {
      const r = ligada(a.id) ? await api.desligarCorda(pagina.id, espacoId, a.id) : await api.ligarCorda(pagina.id, espacoId, a.id)
      exigirOk(r)
    } catch (e) {
      setErro(mensagemDeErro(e))
    }
    await recarregarPaginas()
  }

  return (
    <div className="extra-ligar" ref={caixa}>
      <button type="button" className="extra-botao" aria-expanded={aberto} onClick={() => setAberto((v) => !v)} data-ligar-agente={pagina.id}>
        <Link2 size={13} /> Ligar a agente…
      </button>
      {aberto && (
        <div className="extra-ligar-lista" role="dialog" aria-label={`Ligar "${pagina.nome}" a um agente`}>
          {!espaco ? (
            <p className="suave extra-ligar-vazio">Abra um espaço nesta janela para ligar a página a um agente dele.</p>
          ) : (
            <>
              <p className="suave extra-ligar-nota">
                Agentes de <b>{espaco.nome}</b>. Ligado, ele recebe os recados desta página (como pedido de terceiro, não seu) e pode responder a ela.
              </p>
              {agentes === null && !erro && <p className="suave extra-ligar-vazio">Lendo…</p>}
              {agentes?.length === 0 && <p className="suave extra-ligar-vazio">Nenhum agente Claude ou Codex neste espaço.</p>}
              {agentes?.map((a) => {
                const sim = ligada(a.id)
                const cheio = !sim && pagina.cordas.length >= MAX_CORDAS
                return (
                  <div key={a.id} className="extra-ligar-linha" data-cartao={a.id}>
                    <span className="extra-ligar-nome">
                      {a.nome} <span className="suave">· {a.agente === 'claude' ? 'Claude' : 'Codex'}</span>
                    </span>
                    <button type="button" className={`extra-botao ${sim ? 'ligado' : ''}`} disabled={cheio} title={cheio ? `No máximo ${MAX_CORDAS} ligações por página` : undefined} onClick={() => void alternar(a)}>
                      {sim ? <Unlink size={12} /> : <Link2 size={12} />} {sim ? 'Desligar' : 'Ligar'}
                    </button>
                  </div>
                )
              })}
            </>
          )}
          {erro && (
            <p className="extra-erro" role="alert">
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
