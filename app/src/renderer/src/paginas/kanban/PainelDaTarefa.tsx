import { useEffect, useMemo, useState, type MouseEvent as EventoDeMouse } from 'react'
import { ArchiveRestore, Crosshair, Pencil, Send, Trash2, X } from 'lucide-react'
import type { AgenteDoKanban, ArquivoDoKanban, OperacaoDoKanban, Quem, ResultadoDoKanban, Tarefa } from '../../../../shared/kanban'
import { renderizarMarkdown } from '../../../../shared/markdown'
import { TEXTO_DA_SITUACAO, chipDe, chipsDaTarefa, colunaDoPapel, type Chip } from './filtros'
import { ChipDeAgente } from './TarefaNoKanban'

// Painel à direita com a tarefa inteira: título, coluna (a alternativa ao arrasto pelo teclado), "Delegar ao Maestro"
// (em Demandas; a alternativa ao arrasto), a quem foi delegada, "Trabalhando nela" (um chip por agente, ✕ tira da
// lista, "Ir ao cartão" vai ao do agente no quadro), etiquetas, descrição (prévia em Markdown + editar), comentários,
// quem criou e quem mexeu por último e Apagar (vai para a lixeira). Esc fecha.

const dois = (n: number): string => String(n).padStart(2, '0')
export function quando(ms: number): string {
  const d = new Date(ms)
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`
}
const quem = (q: Quem): string => q.nome

/** Link da prévia: http(s) e mailto abrem no navegador (o principal revalida); o resto não vai a lugar nenhum. */
function cliqueNaPrevia(e: EventoDeMouse<HTMLDivElement>): void {
  const a = (e.target as HTMLElement).closest('a')
  if (!a) return
  e.preventDefault()
  const externo = a.getAttribute('data-externo')
  if (externo) void window.ork.leitor.externo(externo)
}

interface Props {
  tarefa: Tarefa
  arquivo: ArquivoDoKanban
  agentes: readonly AgenteDoKanban[]
  podeEditar: boolean
  aplicar: (op: OperacaoDoKanban) => Promise<ResultadoDoKanban>
  fechar: () => void
  irAoCartao: (id: string) => void
}

export function PainelDaTarefa({ tarefa: t, arquivo, agentes, podeEditar, aplicar, fechar, irAoCartao }: Props) {
  const [titulo, setTitulo] = useState(t.titulo)
  const [editandoDescricao, setEditandoDescricao] = useState(false)
  const [descricao, setDescricao] = useState(t.descricao)
  const [comentario, setComentario] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  // outra tarefa, ou a mesma mudada por fora (agente, MCP): os campos que a pessoa não está editando acompanham
  useEffect(() => {
    if (!document.activeElement?.closest('.kanban-painel-titulo')) setTitulo(t.titulo)
  }, [t.numero, t.titulo])
  useEffect(() => {
    if (!editandoDescricao) setDescricao(t.descricao)
  }, [t.numero, t.descricao, editandoDescricao])
  useEffect(() => {
    setEditandoDescricao(false)
    setComentario('')
    setEtiqueta('')
    setErro(null)
  }, [t.numero])

  const pedir = async (op: OperacaoDoKanban): Promise<boolean> => {
    const r = await aplicar(op)
    setErro(r.ok ? null : r.erro)
    return r.ok
  }
  const salvarTitulo = (): void => {
    if (titulo.trim() && titulo.trim() !== t.titulo) void pedir({ tipo: 'editar', numero: t.numero, titulo: titulo.trim() })
    else setTitulo(t.titulo)
  }
  const comentar = async (): Promise<void> => {
    if (comentario.trim() && (await pedir({ tipo: 'comentar', numero: t.numero, texto: comentario }))) setComentario('')
  }
  const porEtiqueta = async (): Promise<void> => {
    if (etiqueta.trim() && (await pedir({ tipo: 'editar', numero: t.numero, etiquetasMais: [etiqueta.trim()] }))) setEtiqueta('')
  }

  const candidatos = agentes.filter((a) => a.agente !== 'shell' && !t.trabalhando.some((p) => p.id === a.id))
  const chips = chipsDaTarefa(t, agentes)
  const entrada = colunaDoPapel(arquivo, 'entrada')
  const delegar = colunaDoPapel(arquivo, 'delegar')
  const delegada = t.delegada ? chipDe(t.delegada, agentes) : null
  const previa = useMemo(() => (t.descricao ? renderizarMarkdown(t.descricao) : ''), [t.descricao])
  const linhaDoChip = (c: Chip, soltar?: () => void) => (
    <li key={c.id} className="kanban-trabalhando-item" data-trabalhando={c.id}>
      <ChipDeAgente chip={c} />
      <span className="espaco-flex" />
      {c.situacao !== 'sem-cartao' && (
        <button type="button" className="kanban-botao kanban-ir" data-acao="ir-ao-cartao" onClick={() => irAoCartao(c.id)}>
          <Crosshair size={13} aria-hidden /> Ir ao cartão
        </button>
      )}
      {soltar && podeEditar && (
        <button type="button" className="kanban-icone" data-acao="soltar" aria-label={`Tirar ${c.nome} da lista`} title="Tirar da lista" onClick={soltar}>
          <X size={13} />
        </button>
      )}
    </li>
  )

  return (
    <aside className="kanban-painel" aria-label={`Tarefa #${t.numero}`} data-painel-tarefa={t.numero}>
      <header className="kanban-painel-topo">
        <span className="kanban-numero">#{t.numero}</span>
        <span className="espaco-flex" />
        <button type="button" className="kanban-icone" title="Fechar (Esc)" aria-label="Fechar o painel" onClick={fechar}>
          <X size={16} />
        </button>
      </header>
      <div className="kanban-painel-corpo">
        <input
          className="kanban-painel-titulo"
          value={titulo}
          maxLength={120}
          aria-label="Título"
          disabled={!podeEditar}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={salvarTitulo}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />

        <div className="kanban-painel-campos">
          <label>
            <span>Coluna</span>
            <select value={t.coluna} disabled={!podeEditar} data-campo="coluna" onChange={(e) => void pedir({ tipo: 'mover', numero: t.numero, coluna: e.target.value, posicao: 'fim' })}>
              {arquivo.colunas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          {podeEditar && delegar && entrada && t.coluna === entrada.id && (
            <button type="button" className="kanban-botao primario kanban-delegar" data-acao="delegar" onClick={() => void pedir({ tipo: 'mover', numero: t.numero, coluna: delegar.id, posicao: 'fim' })}>
              <Send size={13} aria-hidden /> Delegar ao Maestro
            </button>
          )}
        </div>
        {delegada && t.delegada && (
          <p className="suave kanban-delegada" data-delegada={delegada.id}>
            Delegada a {delegada.nome} em {quando(t.delegada.em)}
            {delegada.situacao === 'sem-cartao' ? ' (cartão não existe mais)' : ''}
          </p>
        )}

        <section className="kanban-painel-secao">
          <h4>Trabalhando nela ({chips.length})</h4>
          {chips.length > 0 ? (
            <ul className="kanban-trabalhando">{chips.map((c) => linhaDoChip(c, () => void pedir({ tipo: 'soltar', numero: t.numero, quem: c.id })))}</ul>
          ) : (
            <p className="suave kanban-dica">Ninguém ainda. Quem pega roda `ork kanban pegar {t.numero}`.</p>
          )}
          {podeEditar && candidatos.length > 0 && (
            <select
              className="kanban-por-agente"
              value=""
              data-campo="por-agente"
              aria-label="Pôr um agente na lista"
              onChange={(e) => e.target.value && void pedir({ tipo: 'atribuir', numero: t.numero, responsavel: e.target.value })}
            >
              <option value="">+ pôr um agente (avisa a caixa dele)</option>
              {candidatos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                  {a.situacao ? ` · ${TEXTO_DA_SITUACAO[a.situacao]}` : ''}
                </option>
              ))}
            </select>
          )}
        </section>

        <section className="kanban-painel-secao">
          <h4>Etiquetas</h4>
          <ul className="kanban-etiquetas">
            {t.etiquetas.map((e) => (
              <li key={e} className="kanban-etiqueta">
                {e}
                {podeEditar && (
                  <button type="button" className="kanban-etiqueta-tirar" aria-label={`Tirar a etiqueta ${e}`} title="Tirar" onClick={() => void pedir({ tipo: 'editar', numero: t.numero, etiquetasMenos: [e] })}>
                    <X size={11} />
                  </button>
                )}
              </li>
            ))}
            {!t.etiquetas.length && <li className="suave kanban-dica">nenhuma</li>}
          </ul>
          {podeEditar && t.etiquetas.length < 8 && (
            <input
              className="kanban-etiqueta-nova"
              value={etiqueta}
              maxLength={24}
              placeholder="nova etiqueta + Enter"
              aria-label="Nova etiqueta"
              onChange={(e) => setEtiqueta(e.target.value.replace(/,/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void porEtiqueta()
              }}
            />
          )}
        </section>

        <section className="kanban-painel-secao">
          <h4>
            Descrição
            {podeEditar && !editandoDescricao && (
              <button type="button" className="kanban-icone" title="Editar a descrição" aria-label="Editar a descrição" data-acao="editar-descricao" onClick={() => setEditandoDescricao(true)}>
                <Pencil size={13} />
              </button>
            )}
          </h4>
          {editandoDescricao ? (
            <>
              <textarea className="kanban-descricao-campo" autoFocus rows={8} value={descricao} aria-label="Descrição (Markdown)" onChange={(e) => setDescricao(e.target.value)} />
              <div className="kanban-acoes">
                <button
                  type="button"
                  className="kanban-botao primario"
                  onClick={async () => {
                    if (descricao === t.descricao || (await pedir({ tipo: 'editar', numero: t.numero, descricao }))) setEditandoDescricao(false)
                  }}
                >
                  Salvar
                </button>
                <button type="button" className="kanban-botao" onClick={() => (setDescricao(t.descricao), setEditandoDescricao(false))}>
                  Cancelar
                </button>
              </div>
            </>
          ) : previa ? (
            // HTML do markdown-it com `html: false` e links sem href (shared/markdown.ts): o texto não é de confiança
            <div className="kanban-descricao md-corpo" onClick={cliqueNaPrevia} dangerouslySetInnerHTML={{ __html: previa }} />
          ) : (
            <p className="suave kanban-dica">Sem descrição.</p>
          )}
        </section>

        <section className="kanban-painel-secao">
          <h4>Comentários ({t.comentarios.length})</h4>
          <ol className="kanban-comentarios">
            {t.comentarios.map((c, i) => (
              <li key={`${c.em}-${i}`} className="kanban-comentario">
                <span className="kanban-comentario-quem">
                  {quem(c.por)} <span className="suave">· {quando(c.em)}</span>
                </span>
                <p>{c.texto}</p>
              </li>
            ))}
          </ol>
          {podeEditar && (
            <>
              <textarea
                className="kanban-comentario-campo"
                rows={3}
                value={comentario}
                placeholder="Comentar (Ctrl+Enter envia)"
                aria-label="Novo comentário"
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void comentar()
                }}
              />
              <div className="kanban-acoes">
                <button type="button" className="kanban-botao primario" data-acao="comentar" disabled={!comentario.trim()} onClick={() => void comentar()}>
                  Comentar
                </button>
              </div>
            </>
          )}
        </section>

        {erro && (
          <p className="kanban-erro" role="alert">
            {erro}
          </p>
        )}

        <p className="suave kanban-meta">
          Criada por {quem(t.criadaPor)} em {quando(t.criadaEm)} · atualizada por {quem(t.atualizadaPor)} em {quando(t.atualizadaEm)}
          {t.concluidaEm ? ` · concluída em ${quando(t.concluidaEm)}` : ''}
        </p>
        {podeEditar && (
          <div className="kanban-acoes">
            <button
              type="button"
              className="kanban-botao perigo"
              data-acao="apagar"
              onClick={async () => {
                if (await pedir({ tipo: 'apagar', numero: t.numero })) fechar()
              }}
            >
              <Trash2 size={13} aria-hidden /> Apagar (vai para a lixeira)
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

interface PropsLixeira {
  arquivo: ArquivoDoKanban
  podeEditar: boolean
  aplicar: (op: OperacaoDoKanban) => Promise<ResultadoDoKanban>
  esvaziar: () => void
  fechar: () => void
}

/** A lixeira no lugar do painel: as apagadas (as 50 mais recentes), restaurar uma ou esvaziar. */
export function PainelDaLixeira({ arquivo, podeEditar, aplicar, esvaziar, fechar }: PropsLixeira) {
  const [erro, setErro] = useState<string | null>(null)
  const lista = [...arquivo.lixeira].reverse()
  return (
    <aside className="kanban-painel" aria-label="Lixeira do kanban" data-painel-lixeira>
      <header className="kanban-painel-topo">
        <h3 className="kanban-painel-nome">Lixeira ({lista.length})</h3>
        <span className="espaco-flex" />
        <button type="button" className="kanban-icone" title="Fechar (Esc)" aria-label="Fechar a lixeira" onClick={fechar}>
          <X size={16} />
        </button>
      </header>
      <div className="kanban-painel-corpo">
        {!lista.length && <p className="suave kanban-dica">A lixeira está vazia.</p>}
        <ul className="kanban-lixeira">
          {lista.map((t) => (
            <li key={t.numero} className="kanban-lixeira-item" data-lixeira={t.numero}>
              <div className="kanban-lixeira-dados">
                <span>
                  <span className="kanban-numero">#{t.numero}</span> {t.titulo}
                </span>
                <span className="suave">{t.apagadaEm ? `apagada por ${t.apagadaPor ? quem(t.apagadaPor) : 'alguém'} em ${quando(t.apagadaEm)}` : ''}</span>
              </div>
              {podeEditar && (
                <button
                  type="button"
                  className="kanban-botao"
                  data-acao="restaurar"
                  onClick={async () => {
                    const r = await aplicar({ tipo: 'restaurar', numero: t.numero })
                    setErro(r.ok ? null : r.erro)
                  }}
                >
                  <ArchiveRestore size={13} aria-hidden /> Restaurar
                </button>
              )}
            </li>
          ))}
        </ul>
        {erro && (
          <p className="kanban-erro" role="alert">
            {erro}
          </p>
        )}
        {podeEditar && lista.length > 0 && (
          <div className="kanban-acoes">
            <button type="button" className="kanban-botao perigo" onClick={esvaziar}>
              <Trash2 size={13} aria-hidden /> Esvaziar a lixeira
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
