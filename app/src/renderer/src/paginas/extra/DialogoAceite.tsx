import { useState, useSyncExternalStore } from 'react'
import { Dialogo } from '../../ui/Dialogo'
import { avisar } from '../../ui/Perguntas'
import { exigirOk, mensagemDeErro, type PropostaDePagina, type RespostaDaProposta } from './contrato'
import { apiPaginas, recarregarPaginas } from './estado'
import { IconeDaPagina } from './Icone'
import { cabecalhoDaProposta, itensDePermissao, SEMPRE, tamanho } from './textos'
import '../../estilos/extra.css'

// Diálogo de aceite de uma página extra (§4). Tudo o que ele mostra vem da PROPOSTA do main (que varreu a pasta e
// guardou um token): a tela não lê manifesto, não manda caminho nem permissões. Tudo ou nada: o usuário aceita as
// `novas` listadas (página nova = tudo o que ela pede; rever/atualizar = só a diferença) ou cancela.

let atual: PropostaDePagina | null = null
const ouvintes = new Set<() => void>()

function trocar(p: PropostaDePagina | null): void {
  atual = p
  ouvintes.forEach((o) => o())
}

/**
 * Pede uma proposta ao main (escolher pasta, rever, atualizar da pasta) e abre o diálogo com ela. Erro do main
 * (pasta recusada e o motivo) vira aviso; cancelar o seletor de pasta do sistema não mostra nada. Atualização que
 * não pede nada novo é aceita direto (§1: "aceite só se pedir permissão nova").
 */
export async function abrirProposta(pedir: () => Promise<RespostaDaProposta>, titulo = 'Adicionar página'): Promise<void> {
  if (atual) return
  try {
    const r = await pedir()
    if (!r.ok) {
      if (!r.cancelado) await avisar(titulo, r.erro)
      return
    }
    if (r.proposta.tipo === 'atualizacao' && !r.proposta.novas.length) {
      exigirOk(await apiPaginas()!.aceitar(r.proposta.token))
      await recarregarPaginas()
      return
    }
    trocar(r.proposta)
  } catch (e) {
    await avisar(titulo, mensagemDeErro(e))
  }
}


function Corpo({ p }: { p: PropostaDePagina }) {
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const { manifesto: m } = p
  const itens = itensDePermissao(p.novas)
  const cab = cabecalhoDaProposta(p)

  async function aceitar(): Promise<void> {
    const api = apiPaginas()
    if (!api || enviando) return
    setEnviando(true)
    try {
      exigirOk(await api.aceitar(p.token))
      trocar(null)
      void recarregarPaginas()
    } catch (e) {
      setErro(mensagemDeErro(e))
      setEnviando(false)
    }
  }

  function cancelar(): void {
    void apiPaginas()?.recusar(p.token).catch(() => undefined)
    trocar(null)
  }

  return (
    <Dialogo titulo={cab.titulo} aoFechar={cancelar}>
      <div className="extra-aceite" data-aceite-pagina={m.id} data-tipo-da-proposta={p.tipo}>
        <div className="extra-aceite-topo">
          <IconeDaPagina icone={p.icone} nome={m.nome} tamanho={32} />
          <div className="extra-aceite-nome">
            <b>{m.nome}</b> <span className="suave">versão {m.versao}</span>
            {m.descricao && <p className="extra-aceite-descricao">{m.descricao}</p>}
          </div>
        </div>
        <p className="suave extra-aceite-origem">
          Pasta: <code>{p.origem}</code> · {p.arquivos} arquivo(s), {tamanho(p.bytes)}
        </p>
        {cab.aviso && <p className={`extra-aceite-aviso ${p.mudouFora ? 'perigo' : ''}`}>{cab.aviso}</p>}

        <p className="extra-aceite-rotulo">{cab.rotulo}</p>
        {itens.length ? (
          <ul className="extra-aceite-lista">
            {itens.map((i) => (
              <li key={i.ficha} className={i.perigo ? 'perigo' : ''} data-permissao={i.ficha}>
                {i.texto}
              </li>
            ))}
          </ul>
        ) : (
          <p className="suave extra-aceite-vazio">{p.tipo === 'nova' ? 'Nada além do básico abaixo.' : 'Nenhuma permissão nova.'}</p>
        )}
        <ul className="extra-aceite-sempre suave">
          {SEMPRE.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        {erro && (
          <p className="extra-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
      <div className="dialogo-acoes">
        <button type="button" onClick={cancelar}>
          Cancelar
        </button>
        <button type="button" className="primario" autoFocus disabled={enviando} onClick={() => void aceitar()} data-aceitar-pagina>
          {cab.botao}
        </button>
      </div>
    </Dialogo>
  )
}

/** Montado uma vez (pela barra de páginas); só desenha com uma proposta aberta. */
export function DialogoAceite() {
  const p = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => void ouvintes.delete(o)
    },
    () => atual
  )
  return p ? <Corpo key={p.token} p={p} /> : null
}
