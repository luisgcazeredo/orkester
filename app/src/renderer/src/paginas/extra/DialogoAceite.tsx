import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AcessosDaPagina as Acessos } from '../../../../shared/api'
import { Dialogo } from '../../ui/Dialogo'
import { avisar } from '../../ui/Perguntas'
import { AcessosDaPagina, usarFontesDosAcessos } from './AcessosDaPagina'
import { exigirOk, mensagemDeErro, type PropostaDePagina, type RespostaDaProposta } from './contrato'
import { apiPaginas, recarregarPaginas } from './estado'
import { IconeDaPagina } from './Icone'
import { aceiteSemDialogo, acessosIniciais, acessosParaEnviar, avisoQuadroEscrita, cabecalhoDaProposta, faltaNosAcessos, itensDePermissao, SEMPRE, tamanho } from './textos'
import '../../estilos/extra.css'

// Diálogo de aceite de uma página extra (§4). Tudo o que ele mostra vem da PROPOSTA do main (que varreu a pasta e
// guardou um token): a tela não lê manifesto, não manda caminho nem permissões. Tudo ou nada: o usuário aceita as
// `novas` listadas (página nova = tudo o que ela pede; rever/atualizar = só a diferença) ou cancela.
//
// (1.9.7, F1) No lugar dos encaixes, "APIs que esta página enxerga" e "MCPs que esta página enxerga" (AcessosDaPagina,
// o mesmo do cartão em Conexões). O manifesto só sugere: a candidata única vem pré-marcada, com `atende`. A tela manda ao
// main só ids e nomes (`aceitar(token, acessos)`); o main confere tudo de novo.

let atual: PropostaDePagina | null = null
const ouvintes = new Set<() => void>()

function trocar(p: PropostaDePagina | null): void {
  atual = p
  ouvintes.forEach((o) => o())
}

/**
 * Pede uma proposta ao main (escolher pasta, rever, atualizar da pasta) e abre o diálogo com ela. Erro do main
 * (pasta recusada e o motivo) vira aviso; cancelar o seletor de pasta do sistema não mostra nada. Atualizar/rever sem
 * ficha nova e com toda sugestão já atendida é aceito direto, mantendo os acessos de antes (`aceitar(token)`).
 */
export async function abrirProposta(pedir: () => Promise<RespostaDaProposta>, titulo = 'Adicionar página'): Promise<void> {
  if (atual) return
  try {
    const r = await pedir()
    if (!r.ok) {
      if (!r.cancelado) await avisar(titulo, r.erro)
      return
    }
    if (aceiteSemDialogo(r.proposta)) {
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
  const [acessos, setAcessos] = useState<Acessos>(p.acessosAntes ?? {})
  const fontes = usarFontesDosAcessos(acessos)
  const sugestoes = p.sugestoes ?? []
  // a pré-marcação espera as APIs e os servidores: uma vez, quando os dois chegam
  const [preMarcado, setPreMarcado] = useState(false)
  const [criandoApi, setCriandoApi] = useState(false)
  useEffect(() => {
    if (preMarcado || !fontes.apis || !fontes.servidores) return
    setAcessos(acessosIniciais(sugestoes, p.acessosAntes, fontes.apis, fontes.servidores, p.semAcessos))
    setPreMarcado(true)
  }, [preMarcado, fontes.apis, fontes.servidores])
  const { manifesto: m } = p
  const itens = itensDePermissao(p.novas)
  const cab = cabecalhoDaProposta(p)
  // "Criar API" aberto: Adicionar e permitir fica desligado até terminar ou fechar a API nova (senão o que foi digitado se perde)
  const falta = !preMarcado ? 'lendo as APIs e os servidores' : p.semAcessos ? '' : faltaNosAcessos(acessos, fontes.lendo) || (criandoApi ? 'termine ou feche a API nova' : '')
  const avisoDoQuadro = p.semAcessos ? '' : avisoQuadroEscrita(p.pedidas, acessos, fontes.apis ?? [])

  async function aceitar(): Promise<void> {
    const api = apiPaginas()
    if (!api || enviando || falta) return
    setEnviando(true)
    setErro('')
    try {
      // página com `rede`/`local`: nada vai; o main tira os acessos de antes
      exigirOk(await api.aceitar(p.token, p.semAcessos ? undefined : acessosParaEnviar(acessos, fontes.ferramentas)))
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

        {/* o que o manifesto pede, e logo abaixo o básico que toda página tem (não fica mais no fim do diálogo) */}
        <p className="extra-aceite-rotulo" data-permissoes-do-manifesto>
          {cab.rotulo}
          {!itens.length && p.tipo === 'nova' && <span className="suave extra-aceite-vazio"> {cab.vazio}</span>}
        </p>
        {itens.length ? (
          <ul className="extra-aceite-lista">
            {itens.map((i) => (
              <li key={i.ficha} className={i.perigo ? 'perigo' : ''} data-permissao={i.ficha}>
                {i.texto}
              </li>
            ))}
          </ul>
        ) : (
          p.tipo !== 'nova' && <p className="suave extra-aceite-vazio">Nenhuma permissão nova.</p>
        )}
        <ul className="extra-aceite-sempre suave" data-o-basico>
          {SEMPRE.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>

        {avisoDoQuadro && (
          <p className="extra-aceite-aviso perigo" role="note" data-aviso-quadro-escrita>
            {avisoDoQuadro}
          </p>
        )}
        <AcessosDaPagina acessos={acessos} mudar={(f) => setAcessos(f)} sugestoes={sugestoes} semAcessos={p.semAcessos} fontes={fontes} aoFormularioAberto={setCriandoApi} />

        {erro && (
          <p className="extra-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
      <div className="dialogo-acoes">
        {falta && preMarcado && (
          <span className="extra-aceite-falta" data-falta-no-aceite>
            {falta}
          </span>
        )}
        <button type="button" onClick={cancelar}>
          Cancelar
        </button>
        <button
          type="button"
          className="primario"
          autoFocus
          disabled={enviando || !!falta}
          title={falta ? `Antes: ${falta}` : undefined}
          onClick={() => void aceitar()}
          data-aceitar-pagina
        >
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
