import { useEffect, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, Ban, BookOpen, Bot, Check, FolderOpen, LayoutDashboard, PanelLeft, Power, ShieldCheck } from 'lucide-react'
import { colunaDoPapel } from '../../../../shared/kanban'
import { lerEstado, usarLoja } from '../../estado/loja'
import { Dialogo } from '../../ui/Dialogo'
import { abrirConfiguracoes } from '../configuracoes/abrir'
import { mensagemDeErro } from './contrato'
import { abrirProposta } from './DialogoAceite'
import { alternarChaveDasPaginas, apiPaginas, iniciarEstadoDasPaginas, usarPaginas } from './estado'
import type { FerramentaMcp } from '../../../../shared/api'
import { ehApi } from '../conexoes/regrasDeCredenciais'
import { usarCredenciais } from '../conexoes/usarCredenciais'
import {
  DESCRICAO_MAXIMA, EXEMPLOS, instrucoesDaDemanda, itemDePermissao, NAO_PODE, NOTA_DO_PEDIDO, O_QUE_E, PASSOS_DO_GUIA, PODE, servidorEscolhivel, TEXTO_DESLIGADAS, textoDoPedido, tituloDaDemanda,
  type EscolhaDaDemanda, type ServidorParaEscolher
} from './textos'
import '../../estilos/extra.css'

// Painel do "+" (1.9.5, S6). O "+" fica sempre na barra e abre este painel, nunca o seletor de pasta direto:
// guia curto (o que é, 3 passos, pode/não pode, onde revogar), exemplo pronto, "Escolher pasta…" e "Pedir a um agente".
// Com a chave geral desligada, o painel abre no modo "Páginas estão desligadas", com o botão de ligar (mesmo aviso de
// Conexões). Exemplo e pasta passam pelo MESMO aceite (DialogoAceite): nada roda antes dele. O pedido a um agente só
// cria uma demanda no kanban do espaço e a delega ao Maestro pelo fluxo de sempre (mover para "Com o Maestro").

let aberto = false
const ouvintes = new Set<() => void>()

function trocar(valor: boolean): void {
  aberto = valor
  ouvintes.forEach((o) => o())
}

/** O "+" da barra e o "Adicionar página…" de Conexões. */
export function abrirPainelDePaginas(): void {
  if (apiPaginas()) trocar(true)
}

const fechar = (): void => trocar(false)

/** Fecha o painel e abre o aceite com a proposta do main (exemplo ou pasta). */
function propor(pedir: () => ReturnType<NonNullable<ReturnType<typeof apiPaginas>>['escolherPasta']>): void {
  fechar()
  void abrirProposta(pedir)
}

function Desligadas() {
  const [erro, setErro] = useState('')
  const [ligando, setLigando] = useState(false)
  async function ligar(): Promise<void> {
    setLigando(true)
    setErro(await alternarChaveDasPaginas(true))
    setLigando(false)
  }
  return (
    <section className="extra-painel-desligadas" data-paginas-desligadas>
      <div className="extra-painel-desligadas-texto">
        <h4>
          <Power size={15} /> Páginas estão desligadas
        </h4>
        <p>{TEXTO_DESLIGADAS}</p>
        {erro && (
          <p className="extra-erro" role="alert">
            {erro}
          </p>
        )}
      </div>
      <button type="button" className="extra-botao primario" disabled={ligando} onClick={() => void ligar()} data-ligar-paginas>
        Ligar páginas
      </button>
    </section>
  )
}

function Guia() {
  function abrirConexoes(): void {
    fechar()
    abrirConfiguracoes('conexoes', 'paginas')
  }
  const icones = [FolderOpen, ShieldCheck, PanelLeft]
  return (
    <section className="extra-guia" data-guia-paginas>
      <p className="extra-guia-o-que">{O_QUE_E}</p>
      <ol className="extra-passos">
        {PASSOS_DO_GUIA.map((p, i) => {
          const Icone = icones[i]
          return (
            <li key={p.titulo} className="extra-passo">
              <span className="extra-passo-numero" aria-hidden>
                {i + 1}
              </span>
              <Icone size={18} strokeWidth={1.8} className="extra-passo-icone" aria-hidden />
              <b>{p.titulo}</b>
              <span className="suave">{p.texto}</span>
            </li>
          )
        })}
      </ol>
      <div className="extra-pode">
        <div className="extra-pode-coluna sim">
          <h4>
            <Check size={14} /> Pode, se pedir e você aceitar
          </h4>
          <ul>
            {PODE.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div className="extra-pode-coluna nao">
          <h4>
            <Ban size={14} /> Nunca pode
          </h4>
          <ul>
            {NAO_PODE.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="suave extra-guia-revogar">
        Mudou de ideia? Em{' '}
        <button type="button" className="extra-link" onClick={abrirConexoes} data-abrir-conexoes-paginas>
          Configurações › Conexões › Páginas
        </button>{' '}
        você revoga cada permissão, desliga ou remove a página.
      </p>
    </section>
  )
}

/**
 * (1.9.7, F1) "APIs que ela vai usar" e "MCPs que ela vai usar": caixas, sem conceder nada (quem concede é o aceite).
 * A demanda leva só nome, domínios e "só lê/escreve" de cada API, e o nome e as ferramentas de cada servidor.
 */
function UsosDoPedido({ escolha, mudar }: { escolha: EscolhaNaTela; mudar: (f: (e: EscolhaNaTela) => EscolhaNaTela) => void }) {
  const { lista } = usarCredenciais()
  const apis = (lista?.itens ?? []).filter(ehApi)
  const [servidores, setServidores] = useState<ServidorParaEscolher[] | null>(null)
  const [ferramentas, setFerramentas] = useState<Record<string, FerramentaMcp[]>>({})
  useEffect(() => {
    let vivo = true
    window.ork.mcpFora.listar().then(
      (l) => vivo && setServidores(l),
      () => vivo && setServidores([])
    )
    return () => void (vivo = false)
  }, [])
  function marcarServidor(id: string, marcar: boolean): void {
    mudar((e) => ({ ...e, mcps: marcar ? { ...e.mcps, [id]: [] } : Object.fromEntries(Object.entries(e.mcps).filter(([k]) => k !== id)) }))
    if (marcar && !(id in ferramentas))
      window.ork.mcpFora.ferramentas(id).then(
        (f) => setFerramentas((x) => ({ ...x, [id]: f })),
        () => setFerramentas((x) => ({ ...x, [id]: [] }))
      )
  }
  if (!apis.length && !servidores?.length) return null
  return (
    <div className="extra-pedir-usos" data-usos-do-pedido>
      {apis.length > 0 && (
        <fieldset className="extra-pedir-grupo" data-apis-do-pedido>
          <legend>APIs que ela vai usar</legend>
          {apis.map((a) => (
            <label key={a.id} className="extra-acesso-linha">
              <input
                type="checkbox"
                checked={escolha.apis.includes(a.id)}
                onChange={(ev) => mudar((e) => ({ ...e, apis: ev.target.checked ? [...e.apis, a.id] : e.apis.filter((x) => x !== a.id) }))}
                data-pedir-api={a.nome}
              />
              {/* a 2ª linha (os domínios) fica recuada até o nome, como no aceite */}
              <span className="extra-acesso-texto">
                <b>{a.nome}</b>
                <span className="suave">
                  {a.dominios.join(', ')} · {a.soLeitura ? 'só lê' : 'lê e escreve'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {!!servidores?.length && (
        <fieldset className="extra-pedir-grupo" data-mcps-do-pedido>
          <legend>MCPs que ela vai usar</legend>
          {servidores.filter(servidorEscolhivel).map((s) => {
            const marcadas = escolha.mcps[s.id]
            return (
              <div key={s.id}>
                <label className="extra-acesso-linha">
                  <input type="checkbox" checked={!!marcadas} onChange={(ev) => marcarServidor(s.id, ev.target.checked)} data-pedir-servidor={s.nome} />
                  <span className="extra-acesso-texto">
                    <b>{s.nome}</b>
                  </span>
                </label>
                {marcadas && (
                  <div className="extra-pedir-ferramentas">
                    {!ferramentas[s.id] && <span className="suave">Lendo as ferramentas…</span>}
                    {ferramentas[s.id]?.length === 0 && <span className="suave">O servidor ainda não listou as ferramentas: o agente escolhe as de leitura.</span>}
                    {ferramentas[s.id]?.map((f) => (
                      <label key={f.nome} className="extra-acesso-linha">
                        <input
                          type="checkbox"
                          checked={marcadas.includes(f.nome)}
                          onChange={(ev) =>
                            mudar((e) => ({ ...e, mcps: { ...e.mcps, [s.id]: ev.target.checked ? [...(e.mcps[s.id] ?? []), f.nome] : (e.mcps[s.id] ?? []).filter((x) => x !== f.nome) } }))
                          }
                        />
                        <code>{f.nome}</code>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </fieldset>
      )}
      {/* marcar aqui não libera nada para a página: é só o que o agente fica sabendo */}
      <p className="suave extra-pedir-nota" data-nota-do-pedido>
        {NOTA_DO_PEDIDO}
      </p>
    </div>
  )
}

/** O que a pessoa marcou: ids na tela (para as caixas); a demanda recebe só nomes, domínios e ferramentas. */
interface EscolhaNaTela {
  apis: string[]
  mcps: Record<string, string[]>
}

function PedirAAgente() {
  const espaco = usarLoja((e) => e.espaco)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [escolha, setEscolha] = useState<EscolhaNaTela>({ apis: [], mcps: {} })
  const { lista: credenciais } = usarCredenciais()

  /** Só nome, domínios e só lê (API) e nome e ferramentas (MCP): nunca id, fim da chave ou valor. */
  async function escolhaDaDemanda(): Promise<EscolhaDaDemanda> {
    const apis = (credenciais?.itens ?? []).filter((c) => ehApi(c) && escolha.apis.includes(c.id)).map((c) => ({ nome: c.nome, dominios: [...c.dominios], soLeitura: c.soLeitura === true }))
    const ids = Object.keys(escolha.mcps)
    const servidores = ids.length ? await window.ork.mcpFora.listar() : []
    const mcps = servidores.filter((s) => ids.includes(s.id)).map((s) => ({ nome: s.nome, ferramentas: [...escolha.mcps[s.id]] }))
    return { apis, mcps }
  }

  async function pedir(): Promise<void> {
    const descricao = texto.trim()
    const espacoId = lerEstado().espaco?.id
    if (!descricao || !espacoId || enviando) return
    setEnviando(true)
    setResultado(null)
    try {
      const leitura = await window.ork.kanban.ler(espacoId)
      const criada = await window.ork.kanban.aplicar(espacoId, { tipo: 'criar', titulo: tituloDaDemanda(descricao), descricao: instrucoesDaDemanda(descricao, await escolhaDaDemanda()) })
      if (!criada.ok || criada.numero === undefined) throw new Error(criada.ok ? 'o kanban não devolveu o número da demanda' : criada.erro)
      const delegar = colunaDoPapel(criada.arquivo.colunas, 'delegar')
      let erroAoDelegar = ''
      let maestro: string | null = null
      if (leitura.maestro && delegar) {
        const movida = await window.ork.kanban.aplicar(espacoId, { tipo: 'mover', numero: criada.numero, coluna: delegar.id })
        if (movida.ok) maestro = leitura.maestro.nome
        else erroAoDelegar = movida.erro
      } else if (!delegar) erroAoDelegar = 'o kanban deste espaço não tem a coluna "Com o Maestro"'
      setResultado({ ok: !!maestro, texto: textoDoPedido(criada.numero, maestro, erroAoDelegar) })
      if (maestro) {
        setTexto('')
        setEscolha({ apis: [], mcps: {} })
      }
    } catch (e) {
      setResultado({ ok: false, texto: `Não consegui criar a demanda: ${mensagemDeErro(e)}` })
    }
    setEnviando(false)
  }

  return (
    <article className="extra-opcao extra-opcao-larga" data-pedir-pagina>
      <div className="extra-opcao-topo">
        <Bot size={18} strokeWidth={1.8} />
        <b>Pedir a um agente para criar</b>
      </div>
      <p className="suave">
        Descreva a página. Vira uma demanda no Kanban {espaco ? <>de “{espaco.nome}”</> : 'do espaço'}, entregue ao Maestro com as instruções. Quando ela ficar
        pronta, você a adiciona por “Escolher pasta…”.
      </p>
      <textarea
        value={texto}
        rows={2}
        maxLength={DESCRICAO_MAXIMA}
        disabled={!espaco}
        placeholder={espaco ? 'Ex.: uma página com as metas da semana e quem está em cada uma' : 'Abra um espaço para pedir'}
        aria-label="Descreva a página"
        onChange={(e) => setTexto(e.target.value)}
        data-descricao-da-pagina
      />
      {espaco && <UsosDoPedido escolha={escolha} mudar={setEscolha} />}
      <div className="extra-opcao-pe">
        {resultado && (
          <p className={resultado.ok ? 'extra-ok' : 'extra-erro'} role={resultado.ok ? 'status' : 'alert'} data-resultado-do-pedido>
            {resultado.texto}
          </p>
        )}
        <span className="extra-espaco-flex" />
        <button type="button" className="extra-botao primario" disabled={!espaco || !texto.trim() || enviando} onClick={() => void pedir()} data-pedir-ao-maestro>
          {enviando ? 'Pedindo…' : 'Pedir ao Maestro'}
        </button>
      </div>
    </article>
  )
}

function Adicionar() {
  const api = apiPaginas()!
  const { lista } = usarPaginas()
  const instaladas = new Set((lista?.paginas ?? []).map((p) => p.id))
  return (
    <section className="extra-adicionar">
      <h4 className="extra-painel-titulo">Adicionar uma página</h4>
      <div className="extra-opcoes">
        {EXEMPLOS.map((x) => {
          const ja = instaladas.has(x.nome)
          return (
            <article key={x.nome} className="extra-opcao" data-exemplo={x.nome}>
              <div className="extra-opcao-topo">
                <LayoutDashboard size={18} strokeWidth={1.8} />
                <b>{x.titulo}</b>
                <span className="extra-selo">Exemplo pronto</span>
              </div>
              <p className="suave">{x.descricao}</p>
              {x.pede.length > 0 && (
                <p className="extra-opcao-pede">
                  Pede:{' '}
                  {x.pede.map((f, i) => {
                    const item = itemDePermissao(f)
                    return (
                      <span key={f} className={item.perigo ? 'extra-pede-perigo' : undefined}>
                        {i > 0 && ' · '}
                        {item.rotulo}
                      </span>
                    )
                  })}
                </p>
              )}
              {!!x.sugere?.length && <p className="extra-opcao-pede">Sugere: {x.sugere.join(' · ')} (você marca no aceite)</p>}
              <div className="extra-opcao-pe">
                <span className="extra-espaco-flex" />
                <button type="button" className="extra-botao primario" disabled={ja} onClick={() => propor(() => api.adicionarExemplo(x.nome))} data-adicionar-exemplo={x.nome}>
                  {ja ? 'Já adicionada' : 'Adicionar'}
                </button>
              </div>
            </article>
          )
        })}
        <article className="extra-opcao" data-opcao-pasta>
          <div className="extra-opcao-topo">
            <FolderOpen size={18} strokeWidth={1.8} />
            <b>Uma pasta sua</b>
          </div>
          <p className="suave">
            Uma pasta com <code>manifesto.json</code> e <code>index.html</code>, escrita por você ou pelo seu time. O Orkester faz uma cópia; a pasta original não muda.
          </p>
          <div className="extra-opcao-pe">
            <span className="extra-espaco-flex" />
            <button type="button" className="extra-botao" onClick={() => propor(() => api.escolherPasta())} data-escolher-pasta>
              <FolderOpen size={13} /> Escolher pasta…
            </button>
          </div>
        </article>
        <PedirAAgente />
      </div>
    </section>
  )
}

/** O docs/paginas.pt-BR.md embutido no app (vale também no app instalado, que não tem o repositório). */
function GuiaCompleto() {
  const [html, setHtml] = useState('')
  useEffect(() => {
    let vivo = true
    // o markdown-it e o texto do guia só são baixados ao abrir o guia (o painel mora na barra, no pacote inicial)
    void Promise.all([import('../../../../shared/markdown'), import('../../../../../../docs/paginas.pt-BR.md?raw')]).then(
      ([{ renderizarMarkdown }, m]: [typeof import('../../../../shared/markdown'), { default: string }]) => vivo && setHtml(renderizarMarkdown(m.default)),
      () => vivo && setHtml('<p>Não consegui abrir o guia.</p>')
    )
    return () => void (vivo = false)
  }, [])
  // HTML do markdown-it com `html: false` e links sem href (shared/markdown.ts); o texto é do próprio app
  return html ? <div className="extra-guia-completo md-corpo" data-guia-completo dangerouslySetInnerHTML={{ __html: html }} /> : <p className="suave">Abrindo…</p>
}

function Corpo() {
  useEffect(iniciarEstadoDasPaginas, [])
  const { lista, erro } = usarPaginas()
  const [vista, setVista] = useState<'inicio' | 'guia'>('inicio')
  const ligadas = lista?.ligadas === true
  return (
    <Dialogo titulo={vista === 'guia' ? 'Guia completo das páginas próprias' : 'Páginas próprias'} aoFechar={fechar}>
      <div className="extra-painel" data-painel-paginas={ligadas ? 'ligadas' : 'desligadas'} data-vista={vista}>
        {vista === 'guia' ? (
          <GuiaCompleto />
        ) : (
          <>
            {erro && (
              <p className="extra-erro" role="alert">
                {erro}
              </p>
            )}
            {lista?.soLeitura && (
              <p className="extra-erro" role="alert">
                {lista.soLeitura}
              </p>
            )}
            {lista && !ligadas && <Desligadas />}
            <Guia />
            {ligadas && <Adicionar />}
          </>
        )}
      </div>
      <div className="dialogo-acoes">
        {vista === 'guia' ? (
          <button type="button" onClick={() => setVista('inicio')} data-voltar-do-guia>
            <ArrowLeft size={13} /> Voltar
          </button>
        ) : (
          <button type="button" onClick={() => setVista('guia')} data-abrir-guia-completo>
            <BookOpen size={13} /> Guia completo
          </button>
        )}
        <span className="espaco-flex" />
        <button type="button" onClick={fechar}>
          Fechar
        </button>
      </div>
    </Dialogo>
  )
}

/** Montado uma vez (pela barra de páginas); só desenha aberto. */
export function PainelDePaginas() {
  const visivel = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => void ouvintes.delete(o)
    },
    () => aberto
  )
  return visivel ? <Corpo /> : null
}
