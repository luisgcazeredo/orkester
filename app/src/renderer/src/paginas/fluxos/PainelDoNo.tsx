// O painel de um nó, em 3 colunas: entrada | ajustes | saída. Entrada e saída mostram os itens da última execução
// (abas JSON e Tabela); sem execução, explicam como ver. Os ajustes são o formulário do tipo, mais o nome e as notas.
// Tudo o que muda aqui vai para o rascunho do editor: só o Salvar grava.
import { useEffect, useRef, useState } from 'react'
import { BookOpen, TriangleAlert, X } from 'lucide-react'
import type { Item, NoDoFluxo, NoNaExecucao } from '../../../../shared/fluxos/tipos'
import { CATALOGO, faltaDoNo } from '../../../../shared/fluxos/nos'
import { MAX_NOTAS } from '../../../../shared/fluxos/formato'
import { jsonDeItens, tabelaDeItens } from './editor/itens'
import { ondeCortou, rotuloDeItens } from './execucoes/textos'
import { FORMULARIOS, ICONES, type ContextoDoEspaco } from './nos'
import { espacoDasReferencias } from './nos/comum'
import { abrirDocDoNo } from './DocDoNo'

type Aba = 'json' | 'tabela'

function Itens({ itens, aba }: { itens: readonly Item[]; aba: Aba }) {
  if (!itens.length) return <p className="suave ed-nota">Nenhum item.</p>
  if (aba === 'json') return <pre className="ed-json">{jsonDeItens(itens)}</pre>
  const t = tabelaDeItens(itens)
  return (
    <div className="ed-tabela-rolagem">
      <table className="ed-tabela">
        <thead>
          <tr>
            <th>#</th>
            {t.colunas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.linhas.map((l, i) => (
            <tr key={i}>
              <td className="suave">{i + 1}</td>
              {l.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {t.cortada && <p className="suave ed-nota">Mostrando parte dos itens.</p>}
    </div>
  )
}

function Abas({ aba, mudar }: { aba: Aba; mudar: (a: Aba) => void }) {
  return (
    <div className="ed-abas" role="tablist">
      {(['tabela', 'json'] as const).map((a) => (
        <button key={a} type="button" role="tab" aria-selected={aba === a} className={aba === a ? 'ativa' : ''} onClick={() => mudar(a)}>
          {a === 'json' ? 'JSON' : 'Tabela'}
        </button>
      ))}
    </div>
  )
}

const SEM_EXECUCAO = 'Rode o fluxo (botão Rodar fluxo, no alto) para ver aqui os itens que passaram por este nó.'

export function PainelDoNo({ no, ctx, somenteLer, execucao, recusaDeNome, aoRenomear, aoAjustar, aoFechar }: {
  no: NoDoFluxo
  ctx: ContextoDoEspaco
  somenteLer: boolean
  /** O que passou por este nó na última execução aberta; `null` = nenhuma. */
  execucao: NoNaExecucao | null
  recusaDeNome: (nome: string) => string | null
  aoRenomear: (nome: string) => void
  aoAjustar: (mudanca: { ajustes?: Record<string, unknown>; notas?: string }) => void
  aoFechar: () => void
}) {
  const def = CATALOGO[no.tipo]
  const Icone = ICONES[no.tipo]
  const Formulario = FORMULARIOS[no.tipo]
  const [nome, setNome] = useState(no.nome)
  const [abaEntrada, setAbaEntrada] = useState<Aba>('tabela')
  const [abaSaida, setAbaSaida] = useState<Aba>('tabela')
  const [saida, setSaida] = useState(0)
  useEffect(() => setNome(no.nome), [no.id, no.nome])
  useEffect(() => setSaida(0), [no.id])
  // popup: ao abrir, o foco entra nele (Esc e as teclas do editor deixam de mexer no quadro de trás)
  const janela = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!janela.current?.contains(document.activeElement)) janela.current?.focus({ preventScroll: true })
  }, [no.id])

  const motivoDoNome = nome.trim() === no.nome ? null : recusaDeNome(nome)
  const confirmarNome = (): void => {
    if (nome.trim() === no.nome) return
    if (motivoDoNome) setNome(no.nome)
    else aoRenomear(nome.trim())
  }
  // a mesma Falta do nó no desenho (regra do Motor, #82)
  const falta = faltaDoNo(no, espacoDasReferencias(ctx))
  const gatilho = def.categoria === 'gatilho'
  const saidas = def.saidas.length > 1 ? def.saidas : ['']

  return (
    <div
      className="ed-painel-fundo"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) aoFechar()
      }}
    >
      <section className="ed-painel" role="dialog" aria-modal="true" aria-label={`Nó ${no.nome}`} tabIndex={-1} ref={janela} data-painel-do-no={no.id}>
        <header className="ed-painel-topo">
          <span className={`ed-no-icone cat-${def.categoria}`} aria-hidden>
            <Icone size={16} />
          </span>
          <div className="ed-painel-nome">
            <input
              aria-label="Nome do nó"
              value={nome}
              maxLength={70}
              disabled={somenteLer}
              aria-invalid={!!motivoDoNome}
              onChange={(e) => setNome(e.target.value.replace(/[\r\n]+/g, ' '))}
              onBlur={confirmarNome}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  setNome(no.nome)
                  e.stopPropagation()
                }
              }}
            />
            <span className="suave">{def.rotulo}</span>
          </div>
          {motivoDoNome && <span className="ed-erro">{motivoDoNome}</span>}
          <button type="button" className="ed-botao" title={`O que o nó ${def.rotulo} faz, com exemplos`} onClick={() => abrirDocDoNo(no.tipo)} data-doc-do-no>
            <BookOpen size={14} /> Documentação
          </button>
          <button type="button" className="ed-icone" title="Fechar (Esc)" aria-label="Fechar o painel" onClick={aoFechar}>
            <X size={16} />
          </button>
        </header>
        <div className="ed-painel-colunas">
          <section className="ed-painel-coluna" aria-label="Entrada">
            <div className="ed-painel-titulo">
              <h4>Entrada</h4>
              {execucao && !gatilho && <span className="suave">{rotuloDeItens(execucao.itens.entrada)}</span>}
              {execucao && !gatilho && <Abas aba={abaEntrada} mudar={setAbaEntrada} />}
            </div>
            {gatilho ? (
              <p className="suave ed-nota">Gatilho não recebe itens: o que ele solta é o evento que o disparou.</p>
            ) : execucao ? (
              <>
                <Itens itens={execucao.entrada} aba={abaEntrada} />
                {ondeCortou(execucao, saida).entrada && <p className="suave ed-nota">Cortado: a entrada passou de ~10 KB.</p>}
              </>
            ) : (
              <p className="suave ed-nota">{SEM_EXECUCAO}</p>
            )}
          </section>
          <section className="ed-painel-coluna ed-painel-ajustes" aria-label="Ajustes">
            <div className="ed-painel-titulo">
              <h4>Ajustes</h4>
            </div>
            <p className="suave ed-nota">{def.descricao}</p>
            {falta && (
              <p className="ed-falta" role="status">
                <TriangleAlert size={14} aria-hidden /> Falta: {falta}. O Salvar recusa até resolver.
              </p>
            )}
            <Formulario ajustes={no.ajustes} ctx={ctx} somenteLer={somenteLer} mudar={(ajustes) => aoAjustar({ ajustes })} />
            <label className="ed-campo">
              <span className="ed-campo-rotulo">Notas</span>
              <textarea aria-label="Notas do nó" rows={2} maxLength={MAX_NOTAS} placeholder="Para quem ler o fluxo depois (opcional)" value={no.notas ?? ''} disabled={somenteLer} onChange={(e) => aoAjustar({ notas: e.target.value })} />
            </label>
          </section>
          <section className="ed-painel-coluna" aria-label="Saída">
            <div className="ed-painel-titulo">
              <h4>Saída</h4>
              {execucao && <Abas aba={abaSaida} mudar={setAbaSaida} />}
            </div>
            {saidas.length > 1 && (
              <div className="ed-abas ed-abas-saida" role="tablist" aria-label="Qual saída">
                {saidas.map((s, i) => (
                  <button key={s} type="button" role="tab" aria-selected={saida === i} className={saida === i ? 'ativa' : ''} onClick={() => setSaida(i)}>
                    {s}
                    {execucao && ` (${execucao.itens.saidas[i] ?? 0})`}
                  </button>
                ))}
              </div>
            )}
            {execucao ? (
              <>
                {execucao.estado === 'erro' && <p className="ed-erro">{execucao.erro ?? 'o nó deu erro'}</p>}
                {execucao.estado === 'nao-rodou' && <p className="suave ed-nota">Não rodou nesta execução.</p>}
                {saidas.length === 1 && <span className="suave">{rotuloDeItens(execucao.itens.saidas[0] ?? 0)}</span>}
                <Itens itens={execucao.saidas[saida] ?? []} aba={abaSaida} />
                {ondeCortou(execucao, saida).saida && <p className="suave ed-nota">Cortado: a saída passou de ~10 KB.</p>}
                {execucao.log && execucao.log.length > 0 && (
                  <>
                    <h5>console.log</h5>
                    <pre className="ed-json">{execucao.log.join('\n')}</pre>
                  </>
                )}
              </>
            ) : (
              <p className="suave ed-nota">{SEM_EXECUCAO}</p>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}
