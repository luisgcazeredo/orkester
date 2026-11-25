import { useEffect, useRef, useState } from 'react'
import { Globe, Plug, Plus } from 'lucide-react'
import type { AcessosDaPagina as Acessos, FerramentaMcp, ResumoDeServidorMcp, SugestaoDePagina } from '../../../../shared/api'
import { FormDeCredencial } from '../conexoes/FormDeCredencial'
import { ehApi, SEM_COFRE } from '../conexoes/regrasDeCredenciais'
import { descricaoDoServidor } from '../conexoes/regrasDeServidores'
import { usarCredenciais } from '../conexoes/usarCredenciais'
import { mensagemDeErro } from './contrato'
import {
  avisoSemAtendimento, contarFerramentas, desmarcarApi, desmarcarServidor, ferramentasDoServidor, ferramentasQueDizemSoLer, listaDeHosts, marcarApi, marcarServidor, mudarEscrita,
  mudarFerramentas, paginaSugereEscrever, rotuloDoServidor, seloDoTeto, servidorEscolhivel, sugestoesSemAtendimento, textoDoAtende, type ApiDaTela
} from './textos'
import { LIMITES_DE_ACESSO } from '../../../../shared/paginasAcessos'
import '../../estilos/extra.css'

// "APIs que esta página enxerga" e "MCPs que esta página enxerga" (1.9.7, F1). O MESMO componente serve ao aceite
// (DialogoAceite) e ao cartão da página em Conexões › Páginas. Quem marca é o Luís: o manifesto só sugere (pré-marca,
// feita por quem monta o estado inicial) e a tela manda ao main só ids e nomes. As regras são puras, em textos.ts.

/** O que os acessos precisam ler: as APIs (sem Segredo), os servidores MCP e as ferramentas dos servidores marcados. */
export interface FontesDosAcessos {
  apis: ApiDaTela[] | null
  cifra: boolean
  recarregarApis: () => Promise<void>
  servidores: ResumoDeServidorMcp[] | null
  /** servidor → as ferramentas que ele já listou (sem subir nada) */
  ferramentas: Record<string, FerramentaMcp[]>
  erro: string
  /** nomes dos servidores marcados cujas ferramentas ainda não voltaram */
  lendo: string[]
}

export function usarFontesDosAcessos(acessos: Acessos): FontesDosAcessos {
  const { lista, erro: erroDasApis, recarregar } = usarCredenciais()
  const [servidores, setServidores] = useState<ResumoDeServidorMcp[] | null>(null)
  const [erro, setErro] = useState('')
  const [ferramentas, setFerramentas] = useState<Record<string, FerramentaMcp[]>>({})
  const pedidas = useRef(new Set<string>())
  useEffect(() => {
    let vivo = true
    window.ork.mcpFora.listar().then(
      (l) => vivo && setServidores(l),
      (e) => vivo && (setServidores([]), setErro(`Não consegui ler os servidores MCP: ${mensagemDeErro(e)}`))
    )
    return () => void (vivo = false)
  }, [])
  const ids = (acessos.mcp ?? []).map((x) => x.servidorId)
  const chave = ids.join('|')
  useEffect(() => {
    for (const id of ids) {
      if (pedidas.current.has(id)) continue
      pedidas.current.add(id)
      window.ork.mcpFora.ferramentas(id).then(
        (f) => setFerramentas((x) => ({ ...x, [id]: f })),
        () => setFerramentas((x) => ({ ...x, [id]: [] }))
      )
    }
    // só refaz quando muda o conjunto de servidores marcados
  }, [chave])
  const apis = lista ? lista.itens.filter(ehApi) : null
  const lendo = ids.filter((id) => !(id in ferramentas) && servidores?.some((s) => s.id === id)).map((id) => servidores?.find((s) => s.id === id)?.nome ?? id)
  return {
    apis,
    cifra: lista?.cifraDisponivel === true,
    recarregarApis: recarregar,
    servidores,
    ferramentas,
    erro: erroDasApis ? `Não consegui ler as APIs: ${erroDasApis}` : erro,
    lendo
  }
}

export interface PropsDosAcessos {
  acessos: Acessos
  /** sempre por função: o "Criar API" marca a nova depois de um await */
  mudar: (f: (a: Acessos) => Acessos) => void
  sugestoes: readonly SugestaoDePagina[]
  /** a página pede `rede`/`local`: as duas seções aparecem desligadas, com o motivo */
  semAcessos?: string
  fontes: FontesDosAcessos
  /** Avisa quando o formulário "Criar API" abre ou fecha: o aceite e o cartão desligam o botão de gravar enquanto ele está aberto. */
  aoFormularioAberto?: (aberto: boolean) => void
}

export function AcessosDaPagina({ acessos, mudar, sugestoes, semAcessos, fontes, aoFormularioAberto }: PropsDosAcessos) {
  const semAtender = sugestoesSemAtendimento(sugestoes, acessos)
  return (
    <div className="extra-acessos" data-acessos-da-pagina>
      <SecaoDeApis acessos={acessos} mudar={mudar} sugestoes={sugestoes} semAcessos={semAcessos} fontes={fontes} semAtender={semAtender.filter((s) => s.tipo === 'api')} aoFormularioAberto={aoFormularioAberto} />
      <SecaoDeMcps acessos={acessos} mudar={mudar} sugestoes={sugestoes} semAcessos={semAcessos} fontes={fontes} semAtender={semAtender.filter((s) => s.tipo === 'mcp')} />
      {fontes.erro && (
        <p className="extra-erro" role="alert">
          {fontes.erro}
        </p>
      )}
    </div>
  )
}

function Atende({ atende }: { atende?: string[] }) {
  return atende?.length ? (
    <span className="extra-acesso-atende" data-atende={atende.join(' ')}>
      {textoDoAtende(atende)}
    </span>
  ) : null
}

function AvisosSemAtender({ semAtender }: { semAtender: readonly SugestaoDePagina[] }) {
  return (
    <>
      {semAtender.map((s) => (
        <p key={s.encaixe} className="extra-acesso-aviso" role="note" data-sugestao-sem-atender={s.encaixe}>
          {avisoSemAtendimento(s.encaixe)}
          {s.tipo === 'api' && s.hosts.length > 0 && ` (a sugestão é uma API para ${listaDeHosts(s.hosts)})`}
          {s.tipo === 'mcp' && ` (a sugestão é um servidor com ${listaDeHosts(s.ferramentas.slice(0, 3))}${s.ferramentas.length > 3 ? '…' : ''})`}
        </p>
      ))}
    </>
  )
}

type PropsDaSecao = Omit<PropsDosAcessos, 'semAcessos'> & { semAcessos?: string; semAtender: readonly SugestaoDePagina[] }

function SecaoDeApis({ acessos, mudar, sugestoes, semAcessos, fontes, semAtender, aoFormularioAberto }: PropsDaSecao) {
  const { apis, servidores, cifra } = fontes
  const [criando, setCriando] = useState(false)
  // o formulário abre sozinho só quando a página sugeriu uma API e nenhuma existe; "Não criar" o fecha, e aí ele não volta
  const [dispensado, setDispensado] = useState(false)
  const marcadas = acessos.api ?? []
  const cheio = marcadas.length >= LIMITES_DE_ACESSO.apis
  const sumidas = apis ? marcadas.filter((x) => !apis.some((a) => a.id === x.apiId)) : []
  const hostsSugeridos = semAtender.flatMap((s) => (s.tipo === 'api' ? s.hosts : []))
  const formAberto = cifra && (criando || (!!apis && !apis.length && !semAcessos && hostsSugeridos.length > 0 && !dispensado))
  useEffect(() => {
    aoFormularioAberto?.(formAberto)
    return () => aoFormularioAberto?.(false)
  }, [formAberto])
  return (
    <section className="extra-acessos-secao" data-acessos-api>
      <p className="extra-aceite-rotulo">
        <Globe size={14} aria-hidden /> APIs que esta página enxerga
      </p>
      {semAcessos ? (
        <p className="extra-acessos-desligado" data-sem-acessos>
          {semAcessos}
        </p>
      ) : (
        <>
          <p className="suave extra-aceite-origem">A página chama a API pelo nome; o app leva a chave e a página nunca a vê. Sem "também escreve", só consulta (GET, HEAD).</p>
          {!apis && <p className="suave">Lendo as APIs…</p>}
          {!!apis?.length && (
            <ul className="extra-acessos-lista">
              {apis.map((a) => {
                const m = marcadas.find((x) => x.apiId === a.id)
                return (
                  <li key={a.id} className={m ? 'marcado' : ''} data-acesso-api={a.id}>
                    <label className="extra-acesso-linha">
                      <input
                        type="checkbox"
                        checked={!!m}
                        disabled={!m && cheio}
                        onChange={(e) => mudar((x) => (e.target.checked ? marcarApi(x, a.id, sugestoes, apis, servidores ?? []) : desmarcarApi(x, a.id)))}
                        data-marcar-api={a.nome}
                      />
                      <span className="extra-acesso-texto">
                        <b>{a.nome}</b>
                        <span className="suave extra-acesso-dominios">{a.dominios.join(', ')}</span>
                        {/* o teto é o que a API permite (cinza); o vermelho fica só na caixa "também escreve" marcada */}
                        <span className="extra-acesso-selo" title="O teto é o que a API permite. A página só escreve se você marcar “também escreve”." data-teto-da-api={a.soLeitura ? 'so-le' : 'escreve'}>
                          {seloDoTeto(a.soLeitura)}
                        </span>
                      </span>
                    </label>
                    <Atende atende={m?.atende} />
                    {m && !a.soLeitura && (
                      <div className="extra-acesso-escrita-linha">
                        <label className={`extra-acesso-escrita ${m.escrita ? 'perigo' : ''}`}>
                          <input type="checkbox" checked={m.escrita} onChange={(e) => mudar((x) => mudarEscrita(x, a.id, e.target.checked, apis))} data-escrita-api={a.nome} />
                          também escreve: pode criar, mudar e apagar (POST, PUT, PATCH, DELETE)
                        </label>
                        {!m.escrita && paginaSugereEscrever(sugestoes, m.atende) && (
                          <span className="suave extra-acesso-sugere" data-pagina-sugere-escrever>
                            a página sugere também escrever
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
              {sumidas.map((x) => (
                <li key={x.apiId} className="marcado sumiu" data-acesso-api-sumiu={x.apiId}>
                  <label className="extra-acesso-linha">
                    <input type="checkbox" checked onChange={() => mudar((y) => desmarcarApi(y, x.apiId))} />
                    <b>API apagada</b> <span className="suave">(sumiu: desmarque; a página recebe erro ao chamá-la)</span>
                  </label>
                  <Atende atende={x.atende} />
                </li>
              ))}
            </ul>
          )}
          {apis && !apis.length && <p className="suave">Nenhuma API guardada ainda.{cifra ? ' Crie uma abaixo: ela só vai para os domínios que você marcar.' : ` ${SEM_COFRE}`}</p>}
          <AvisosSemAtender semAtender={semAtender} />
          {!formAberto && (
            <div className="extra-acessos-acoes">
              <button type="button" disabled={!cifra || cheio} title={cifra ? 'Guardar uma API nova e marcá-la para esta página' : SEM_COFRE} onClick={() => setCriando(true)} data-criar-api-da-pagina>
                <Plus size={13} /> Criar API
              </button>
            </div>
          )}
          {formAberto && (
            <FormDeCredencial
              dominiosIniciais={[...new Set(hostsSugeridos)].join('\n')}
              embutido
              aoCancelar={() => {
                setCriando(false)
                setDispensado(true)
              }}
              aoCriar={async (c) => {
                setCriando(false)
                await fontes.recarregarApis()
                mudar((x) => marcarApi(x, c.id, sugestoes, [...(apis ?? []).filter((a) => a.id !== c.id), c], servidores ?? []))
              }}
            />
          )}
        </>
      )}
    </section>
  )
}

function SecaoDeMcps({ acessos, mudar, sugestoes, semAcessos, fontes, semAtender }: PropsDaSecao) {
  const { apis, servidores } = fontes
  const marcados = acessos.mcp ?? []
  const cheio = marcados.length >= LIMITES_DE_ACESSO.servidores
  const sumidos = servidores ? marcados.filter((x) => !servidores.some((s) => s.id === x.servidorId)) : []
  return (
    <section className="extra-acessos-secao" data-acessos-mcp>
      <p className="extra-aceite-rotulo">
        <Plug size={14} aria-hidden /> MCPs que esta página enxerga
      </p>
      {semAcessos ? (
        <p className="extra-acessos-desligado" data-sem-acessos>
          {semAcessos}
        </p>
      ) : (
        <>
          <p className="suave extra-aceite-origem">Só as ferramentas marcadas ficam liberadas. O segredo do servidor nunca chega à página.</p>
          {!servidores && <p className="suave">Lendo os servidores…</p>}
          {servidores && !servidores.length && <p className="suave">Nenhum servidor MCP cadastrado. Cadastre ou importe um em Configurações › Conexões › MCP.</p>}
          {!!servidores?.length && (
            <ul className="extra-acessos-lista">
              {servidores.map((s) => {
                const m = marcados.find((x) => x.servidorId === s.id)
                const pode = servidorEscolhivel(s)
                return (
                  <li key={s.id} className={m ? 'marcado' : ''} data-acesso-mcp={s.id}>
                    <label className="extra-acesso-linha">
                      <input
                        type="checkbox"
                        checked={!!m}
                        disabled={!m && (!pode || cheio)}
                        onChange={(e) => mudar((x) => (e.target.checked ? marcarServidor(x, s.id, sugestoes, apis ?? [], servidores) : desmarcarServidor(x, s.id)))}
                        data-marcar-servidor={s.nome}
                      />
                      <span className="extra-acesso-texto">
                        <b>{rotuloDoServidor(s)}</b>
                      </span>
                    </label>
                    <Atende atende={m?.atende} />
                    {m && (
                      <Ferramentas
                        servidorId={s.id}
                        marcadas={m.ferramentas}
                        sugeridas={sugestoes.flatMap((x) => (x.tipo === 'mcp' && m.atende?.includes(x.encaixe) ? x.ferramentas : []))}
                        conhecidas={fontes.ferramentas[s.id] ?? null}
                        mudar={(nomes, marcar) => mudar((x) => mudarFerramentas(x, s.id, nomes, marcar))}
                      />
                    )}
                  </li>
                )
              })}
              {sumidos.map((x) => (
                <li key={x.servidorId} className="marcado sumiu" data-acesso-mcp-sumiu={x.servidorId}>
                  <label className="extra-acesso-linha">
                    <input type="checkbox" checked onChange={() => mudar((y) => desmarcarServidor(y, x.servidorId))} />
                    <b>Servidor removido</b> <span className="suave">(sumiu: desmarque; a página recebe erro ao chamá-lo)</span>
                  </label>
                  <Atende atende={x.atende} />
                </li>
              ))}
            </ul>
          )}
          <AvisosSemAtender semAtender={semAtender} />
        </>
      )}
    </section>
  )
}

function Ferramentas({
  servidorId, marcadas, sugeridas, conhecidas, mudar
}: {
  servidorId: string
  marcadas: readonly string[]
  sugeridas: readonly string[]
  conhecidas: readonly FerramentaMcp[] | null
  mudar: (nomes: string[], marcar: boolean) => void
}) {
  const lista = ferramentasDoServidor(conhecidas, [...marcadas, ...sugeridas])
  if (!lista) return <p className="suave extra-acesso-nota">Lendo as ferramentas…</p>
  // o contador e o teto contam só as que o servidor tem: a que ele não tem fica de fora e nem vai ao main
  const contadas = contarFerramentas(marcadas, conhecidas)
  const cheio = contadas >= LIMITES_DE_ACESSO.ferramentas
  const soLer = ferramentasQueDizemSoLer(conhecidas)
  return (
    <div className="extra-acesso-ferramentas" data-ferramentas-do-servidor={servidorId}>
      {conhecidas?.length === 0 && (
        <p className="suave extra-acesso-nota">Este servidor ainda não listou as ferramentas dele. Use Testar em Conexões › MCP para ver o que cada uma diz.</p>
      )}
      {!!conhecidas?.length && (
        <div className="extra-acessos-acoes">
          <button type="button" disabled={!soLer.length} onClick={() => mudar(soLer, true)} data-marcar-so-ler={servidorId}>
            Marcar as que dizem só ler
          </button>
          <button type="button" onClick={() => mudar(conhecidas.map((f) => f.nome), true)} data-marcar-todas={servidorId}>
            Marcar todas
          </button>
          {!!marcadas.length && (
            <button type="button" onClick={() => mudar([...marcadas], false)}>
              Desmarcar todas
            </button>
          )}
          <span className="suave">
            {contadas} de até {LIMITES_DE_ACESSO.ferramentas}
          </span>
        </div>
      )}
      <ul className="extra-ferramentas">
        {lista.map((f) => {
          const marcada = marcadas.includes(f.nome)
          return (
            <li key={f.nome} className={f.falta ? 'falta' : ''} data-ferramenta={f.nome}>
              {/* a que o servidor não tem não tem caixa: não dá para marcar, e ela não entra na conta */}
              <label className="extra-acesso-linha">
                {f.falta ? (
                  <span className="extra-acesso-caixa-vazia" aria-hidden />
                ) : (
                  <input type="checkbox" checked={marcada} disabled={cheio && !marcada} onChange={(e) => mudar([f.nome], e.target.checked)} />
                )}
                <code>{f.nome}</code>
              </label>
              {/* "pode mudar coisas" só fica vermelho na ferramenta marcada; desmarcada é só informação (o atributo guarda o risco) */}
              <span
                className={`extra-ferramenta-rotulo ${f.perigo && marcada ? 'perigo' : ''} ${f.falta ? 'falta' : ''}`}
                data-ferramenta-rotulo={f.falta ? 'falta' : f.perigo ? 'perigo' : 'leitura'}
              >
                {f.rotulo}
              </span>
              {f.descricao && <span className="suave extra-ferramenta-descricao">{descricaoDoServidor(f.descricao)}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
