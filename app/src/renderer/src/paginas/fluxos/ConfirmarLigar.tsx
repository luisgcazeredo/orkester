import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AlertTriangle, Bot, CheckCircle2 } from 'lucide-react'
import type { FluxoGravado } from '../../../../shared/fluxos/tipos'
import { ehSensivel } from '../../../../shared/fluxos/formato'
import { realcarLinhas } from '../../arquivos/realce'
import { avisosDoFluxo, descreverNosSensiveis, mostradoDe, textosDaConfirmacao, type BlocoDoNo, type CadastroDeServidores, type ModoDaConfirmacao, type NoParaConfirmar } from './ligarSensivel'
import '../../estilos/fluxos-fora.css'

// Confirmação de ligar um fluxo SENSÍVEL (Código, HTTP, MCP ou comando). Mostra, nó por nó, o que cada um faz por inteiro e o
// que mudou desde a última aprovação (marcando o que um agente mexeu), e só entrega o `mostrado` ao confirmar. Quem chama
// manda esse texto ao main junto do `ligar`; o main o confere contra o disco e recusa se um agente mexeu no meio.
//
//   const mostrado = await confirmarLigar(fluxoSalvo)   // `FluxoGravado` lido do disco (o que vai rodar)
//   if (mostrado === null) return                        // cancelou
//   await api.ligar(espaco, fluxoSalvo.id, true, mostrado)
//
// O botão Rodar fluxo usa a mesma confirmação em modo `'rodar'` (`confirmarLigar(fluxoSalvo, 'rodar')`): outro título, outro botão e sem
// a frase de que o fluxo dispara sozinho, porque ele roda uma vez só e não liga.
//
// Abre num painel próprio (uma raiz do React à parte), então funciona de qualquer tela sem montar nada na casca.

/** Abre a confirmação. `null` = o usuário cancelou; senão, o `mostrado` para o `ligar` (ou o `rodar`). Sem nó sensível, devolve direto. */
export function confirmarLigar(fluxo: FluxoGravado, modo: ModoDaConfirmacao = 'ligar'): Promise<string | null> {
  // todo nó sensível do catálogo (Código, HTTP, comando, Ferramenta MCP…): a lista não é fixa aqui
  if (!ehSensivel(fluxo)) return Promise.resolve(mostradoDe(fluxo))
  return new Promise((resolver) => {
    const alvo = document.createElement('div')
    alvo.setAttribute('data-confirmar-ligar-raiz', '')
    // dentro do .app: os tokens do tema (fundo, borda, véu) moram nas classes dele; no body, o diálogo saía transparente
    const casa = document.querySelector('.app') ?? document.body
    casa.appendChild(alvo)
    const raiz = createRoot(alvo)
    const fechar = (resposta: string | null): void => {
      raiz.unmount()
      alvo.remove()
      resolver(resposta)
    }
    raiz.render(<DialogoDeLigar fluxo={fluxo} modo={modo} aoResponder={fechar} />)
  })
}

function Bloco({ b, tipo }: { b: BlocoDoNo; tipo: NoParaConfirmar['tipo'] }) {
  // o código é colorido como no editor; o resto (pedido, comando) fica em texto monoespaçado
  const html = useMemo(() => (b.codigo && tipo === 'fora.codigo' ? realcarLinhas(b.texto, 'codigo.js').join('\n') : null), [b, tipo])
  return (
    <div className="ligar-bloco">
      <span className="ligar-bloco-rotulo">{b.rotulo}</span>
      {b.perigo && (
        <p className="conexoes-erro" role="alert" data-ligar-perigo>
          {b.perigo}
        </p>
      )}
      {html !== null ? (
        <pre className="ligar-texto codigo-realce" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className={`ligar-texto ${b.codigo ? '' : 'simples'}`}>{b.texto || '(vazio)'}</pre>
      )}
    </div>
  )
}

function Cartao({ n }: { n: NoParaConfirmar }) {
  return (
    <section className={`ligar-no ${n.estado}`} data-ligar-no={n.id} data-ligar-estado={n.estado}>
      <header className="ligar-no-topo">
        <h4>
          {n.nome} <span className="suave">· {n.titulo}</span>
        </h4>
        {n.estado === 'igual' ? (
          <span className="ligar-selo igual">
            <CheckCircle2 size={12} /> igual ao que você aprovou
          </span>
        ) : (
          <span className="ligar-selo atencao">
            <AlertTriangle size={12} /> {n.estado === 'mudou' ? 'mudou' : 'novo'}
          </span>
        )}
        {n.porAgente && (
          <span className="ligar-selo agente" data-ligar-agente>
            <Bot size={12} /> agente {n.porAgente}
          </span>
        )}
      </header>
      {n.marcas.map((m) => (
        <p key={m} className="ligar-marca">
          {m}
        </p>
      ))}
      {n.blocos.map((b) => (
        <Bloco key={b.rotulo} b={b} tipo={n.tipo} />
      ))}
    </section>
  )
}

function DialogoDeLigar({ fluxo, modo, aoResponder }: { fluxo: FluxoGravado; modo: ModoDaConfirmacao; aoResponder: (r: string | null) => void }) {
  const t = textosDaConfirmacao(modo, fluxo.nome)
  const [nos, setNos] = useState<NoParaConfirmar[] | null>(null)
  const [erro, setErro] = useState('')
  const [li, setLi] = useState(false)

  useEffect(() => {
    // o nome do servidor MCP vem do cadastro, pelo id (o do nó é texto de quem o escreveu)
    const cadastro = fluxo.nos.some((n) => n.tipo === 'fora.mcp') ? window.ork.mcpFora.listar().then((l): CadastroDeServidores => l.map((s) => ({ id: s.id, nome: s.nome })), (): CadastroDeServidores => null) : Promise.resolve(undefined)
    cadastro.then((c) => descreverNosSensiveis(fluxo, undefined, c)).then(setNos, (e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
  }, [fluxo])
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') aoResponder(null)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoResponder])

  const frases = nos ? avisosDoFluxo(fluxo, nos, modo) : []
  return (
    <div className="dialogo-fundo" onPointerDown={() => aoResponder(null)}>
      <div className="dialogo dialogo-ligar" role="dialog" aria-label={t.titulo} onPointerDown={(e) => e.stopPropagation()} data-confirmar-ligar>
        <h3>{t.titulo}</h3>
        <p className="dialogo-texto">{t.abertura}</p>
        {erro && (
          <p className="conexoes-erro" role="alert">
            Não consegui montar a confirmação: {erro}
          </p>
        )}
        {!nos && !erro && <p className="suave">Lendo…</p>}
        {frases.length > 0 && (
          <ul className="ligar-frases">
            {frases.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <div className="ligar-nos">{nos?.map((n) => <Cartao key={n.id} n={n} />)}</div>
        <label className="dialogo-opcao">
          <input type="checkbox" checked={li} disabled={!nos} onChange={(e) => setLi(e.target.checked)} data-ligar-li />
          {t.li}
        </label>
        <div className="dialogo-acoes">
          <button autoFocus onClick={() => aoResponder(null)}>
            Cancelar
          </button>
          <button className="primario" disabled={!nos || !li} onClick={() => aoResponder(mostradoDe(fluxo))} data-ligar-confirmar>
            {t.botao}
          </button>
        </div>
      </div>
    </div>
  )
}
