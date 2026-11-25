import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Download, FileJson, KeyRound, Pause, Pencil, Play, Plug, Plus, ShieldAlert, ShieldCheck, Trash2, X, Zap } from 'lucide-react'
import type {
  FerramentaMcp, LeituraDaImportacaoMcp, OrigemDaImportacaoMcp, ResultadoDeServidorMcp, ResumoDeServidorMcp, ServidorParaImportar
} from '../../../../shared/api'
import type { CredencialVisivel } from '../../../../shared/fluxos/credenciais'
import { Dialogo } from '../../ui/Dialogo'
import { confirmar } from '../../ui/Perguntas'
import { CartaoDaCredencial } from './Credenciais'
import { FormDeCredencial, textoDeGuardada } from './FormDeCredencial'
import { mascaraDoValor, SEM_COFRE } from './regrasDeCredenciais'
import {
  AVISO_DE_LOGIN, AVISO_DO_STDIO, cabecalhoDaCredencial, comandoInteiro, credenciaisParaCabecalho, descricaoCurta, descricaoDoServidor, formularioDoServidor, FORMULARIO_DE_SERVIDOR_VAZIO, hostDaUrl, marcadoNaImportacao,
  NOVA_VARIAVEL, nomeDaCredencial, pedidoDoFormulario, rotuloDaFerramenta, segredosDisponiveis, seloDoServidor, textoDasMudadas, textoDosSecretos,
  type FormularioDeServidor, type LinhaDeVariavel
} from './regrasDeServidores'
import { usarCredenciais } from './usarCredenciais'
import '../../estilos/conexoes.css'

// Conexões › MCP › "Servidores de fora" (1.9.7, C4): servidores MCP de terceiros (o ClickUp, o n8n-mcp…) que os fluxos e as
// páginas podem usar. O cadastro é só desta janela. Segredo nunca passa por aqui em texto: variável de ambiente cita uma
// credencial do tipo Segredo e cabeçalho cita uma credencial com domínio, os dois por id; a tela só mostra nome e os 4
// últimos. Não há evento de "mudou" no main: a lista é relida depois de cada ação e a cada 5 segundos com a aba aberta
// (a situação ligado/parado muda sozinha).

const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '') : String(e))
const RELEITURA_MS = 5000

function Selo({ tom, children, ...resto }: { tom: 'vivo' | 'atencao' | 'perigo' | 'neutro'; children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <span className={`conexoes-selo ${tom}`} {...resto}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------- ferramentas (Testar e Rever)

interface Painel {
  tipo: 'testar' | 'rever'
  carregando: boolean
  erro?: string
  ferramentas?: FerramentaMcp[]
}

function ListaDeFerramentas({ ferramentas, mostrarBloqueio }: { ferramentas: readonly FerramentaMcp[]; mostrarBloqueio: boolean }) {
  if (!ferramentas.length) return <p className="suave conexoes-vazio">O servidor não tem ferramentas.</p>
  return (
    <ul className="servidor-ferramentas">
      {ferramentas.map((f) => {
        const r = rotuloDaFerramenta(f)
        return (
          <li key={f.nome} className="servidor-ferramenta" data-ferramenta={f.nome}>
            <div className="servidor-ferramenta-topo">
              <code>{f.nome}</code>
              <span className={r.perigo ? 'servidor-rotulo perigo' : 'servidor-rotulo'}>{r.texto}</span>
              {mostrarBloqueio && f.bloqueada && <span className="servidor-rotulo perigo">bloqueada: mudou</span>}
            </div>
            {f.descricao && <p className="suave servidor-descricao">{descricaoDoServidor(descricaoCurta(f.descricao, 300))}</p>}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------- o cartão de um servidor

function CartaoDoServidor({
  s, credenciais, aoAgir, aoEditar
}: {
  s: ResumoDeServidorMcp
  credenciais: readonly CredencialVisivel[] | null
  /** Devolve `true` se o main aceitou; o erro dele fica à vista em quem chama (até a próxima ação). */
  aoAgir: (fazer: () => Promise<ResultadoDeServidorMcp>) => Promise<boolean>
  aoEditar: () => void
}) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const selo = seloDoServidor(s)
  const pausado = s.situacao === 'pausado'

  async function abrir(tipo: 'testar' | 'rever'): Promise<void> {
    setPainel({ tipo, carregando: true })
    try {
      if (tipo === 'testar') {
        const r = await window.ork.mcpFora.testar(s.id)
        setPainel(r.ok ? { tipo, carregando: false, ferramentas: r.ferramentas } : { tipo, carregando: false, erro: r.erro })
      } else {
        const todas = await window.ork.mcpFora.ferramentas(s.id)
        setPainel({ tipo, carregando: false, ferramentas: todas.filter((f) => f.bloqueada || s.mudadas.includes(f.nome)) })
      }
    } catch (e) {
      setPainel({ tipo, carregando: false, erro: mensagemDe(e) })
    }
    // o teste muda a situação (ligado, erro) e as ferramentas conhecidas
    await aoAgir(async () => ({ ok: true }))
  }

  async function aceitarMudadas(): Promise<void> {
    // aprova exatamente o que o painel MOSTROU (nome + impressão): se alguma mudou de novo, o main não aprova nenhuma
    const vistas = (painel?.ferramentas ?? []).map((f) => ({ nome: f.nome, impressao: f.impressao }))
    if (!vistas.length) return
    // só fecha o painel se o main aceitou; recusado ("mudou de novo…"), o erro fica à vista e o painel é relido
    if (await aoAgir(() => window.ork.mcpFora.reverFerramentas(s.id, vistas))) return setPainel(null)
    try {
      const todas = await window.ork.mcpFora.ferramentas(s.id)
      setPainel({ tipo: 'rever', carregando: false, ferramentas: todas.filter((f) => f.bloqueada) })
    } catch (e) {
      setPainel({ tipo: 'rever', carregando: false, erro: mensagemDe(e) })
    }
  }

  async function remover(): Promise<void> {
    const r = await confirmar({
      titulo: `Remover o servidor "${s.nome}"?`,
      mensagem: 'Os fluxos e as páginas que o usam não são mexidos: o próximo uso dá "servidor não existe". As chaves dele continuam guardadas: os segredos ficam em Segredos dos servidores, abaixo, e as de cabeçalho em APIs.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Remover', valor: 'remover', perigo: true }
      ]
    })
    if (r.botao === 'remover') await aoAgir(() => window.ork.mcpFora.remover(s.id))
  }

  return (
    <div className="conexoes-cartao servidor-cartao" data-servidor-de-fora={s.id} data-servidor-situacao={s.situacao}>
      <div className="conexoes-cartao-topo">
        <h4 className="conexoes-cartao-titulo">{s.nome}</h4>
        <Selo tom={selo.tom} data-selo-do-servidor={s.situacao}>
          {selo.texto}
        </Selo>
      </div>

      {s.transporte === 'stdio' ? (
        <>
          <pre className="servidor-comando" data-comando-do-servidor>
            {comandoInteiro(s.comando, s.args)}
          </pre>
          <p className="servidor-aviso" role="note" data-aviso-stdio>
            <ShieldAlert size={13} aria-hidden /> {AVISO_DO_STDIO}
          </p>
          {s.pasta && (
            <p className="suave conexoes-detalhe">
              Pasta de trabalho: <code>{s.pasta}</code>
            </p>
          )}
          {(Object.keys(s.envTexto ?? {}).length > 0 || Object.keys(s.envCredencial ?? {}).length > 0) && (
            <ul className="servidor-variaveis" data-variaveis-do-servidor>
              {Object.entries(s.envTexto ?? {}).map(([nome, valor]) => (
                <li key={`t-${nome}`}>
                  <code>{nome}</code> = <code>{valor}</code>
                </li>
              ))}
              {Object.entries(s.envCredencial ?? {}).map(([nome, id]) => {
                const c = credenciais?.find((x) => x.id === id)
                return (
                  <li key={`c-${nome}`} className={credenciais && !c ? 'sumiu' : ''}>
                    <code>{nome}</code> <KeyRound size={12} aria-hidden /> {c ? <>{c.nome} <code>{mascaraDoValor(c)}</code></> : credenciais ? nomeDaCredencial(id, credenciais, 'segredo').nome : 'lendo…'}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="conexoes-detalhe">
            Endereço: <code>{s.url}</code>
          </p>
          {Object.keys(s.cabecalhos ?? {}).length > 0 && (
            <ul className="servidor-variaveis" data-cabecalhos-do-servidor>
              {Object.entries(s.cabecalhos ?? {}).map(([nome, id]) => {
                const c = credenciais?.find((x) => x.id === id)
                return (
                  <li key={nome} className={credenciais && !c ? 'sumiu' : ''}>
                    <code>{nome}</code> <KeyRound size={12} aria-hidden /> {c ? <>{c.nome} <code>{mascaraDoValor(c)}</code></> : credenciais ? nomeDaCredencial(id, credenciais).nome : 'lendo…'}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {s.situacao === 'precisa-login' && (
        <p className="servidor-aviso" role="note" data-precisa-login>
          {AVISO_DE_LOGIN}: este servidor entra por login no navegador, que o Orkester ainda não faz. Ele fica cadastrado, mas não dá para usá-lo. Se ele aceita um token, edite e ponha um cabeçalho com uma API (Conexões › APIs).
        </p>
      )}
      {s.pausado && (
        <p className="suave conexoes-detalhe">
          {s.pausado.motivo === 'quedas' ? 'Pausado depois de 3 quedas em 10 minutos.' : 'Pausado por você.'} Religue para voltar a usar.
        </p>
      )}
      {s.erro && s.situacao === 'erro' && (
        <p className="conexoes-erro" role="alert" data-erro-do-servidor>
          {s.erro}
        </p>
      )}
      {s.mudadas.length > 0 && (
        <p className="servidor-aviso" role="alert" data-ferramentas-mudadas>
          <ShieldAlert size={13} aria-hidden /> {textoDasMudadas(s.mudadas)}
        </p>
      )}

      <div className="conexoes-acoes conexoes-acoes-quebra">
        <button type="button" onClick={() => void abrir('testar')} disabled={pausado || painel?.carregando === true} data-testar-servidor={s.id}>
          <Zap size={13} /> Testar
        </button>
        {s.mudadas.length > 0 && (
          <button type="button" className="primario" onClick={() => void abrir('rever')} data-rever-ferramentas={s.id}>
            <ShieldCheck size={13} /> Rever ferramentas mudadas
          </button>
        )}
        <button type="button" onClick={aoEditar} data-editar-servidor={s.id}>
          <Pencil size={13} /> Editar
        </button>
        <button type="button" onClick={() => void aoAgir(() => window.ork.mcpFora.pausar(s.id, !pausado))} data-pausar-servidor={s.id}>
          {pausado ? (
            <>
              <Play size={13} /> Religar
            </>
          ) : (
            <>
              <Pause size={13} /> Pausar
            </>
          )}
        </button>
        <button type="button" className="perigo" onClick={() => void remover()} data-remover-servidor={s.id}>
          <Trash2 size={13} /> Remover
        </button>
      </div>

      {painel && (
        <div className="servidor-painel" data-painel-do-servidor={painel.tipo}>
          <div className="conexoes-acoes">
            <b>{painel.tipo === 'testar' ? 'Ferramentas do servidor' : 'Ferramentas que mudaram'}</b>
            <span className="espaco-flex" />
            <button type="button" onClick={() => setPainel(null)} aria-label="Fechar">
              <X size={13} />
            </button>
          </div>
          {painel.carregando && <p className="suave conexoes-vazio">{painel.tipo === 'testar' ? 'Subindo o servidor e listando as ferramentas…' : 'Lendo…'}</p>}
          {painel.erro && (
            <p className="conexoes-erro" role="alert">
              {painel.erro}
            </p>
          )}
          {painel.ferramentas && (
            <>
              {painel.tipo === 'testar' && <p className="suave conexoes-detalhe">{painel.ferramentas.length} ferramenta(s). Nada foi chamado: só listadas.</p>}
              {painel.tipo === 'rever' && (
                <p className="suave conexoes-detalhe">Leia o que cada uma diz agora. Aceitar libera só estas, nos fluxos e nas páginas.</p>
              )}
              <ListaDeFerramentas ferramentas={painel.ferramentas} mostrarBloqueio={painel.tipo === 'testar'} />
              {painel.tipo === 'rever' && painel.ferramentas.length > 0 && (
                <div className="conexoes-acoes">
                  <button type="button" onClick={() => setPainel(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="primario" onClick={() => void aceitarMudadas()} data-aceitar-mudadas={s.id}>
                    Aceitar as {painel.ferramentas.length} ferramenta(s)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- cadastro e edição

function LinhaDaVariavel({
  v, segredos, aoMudar, aoTirar, aoCriadoSegredo
}: {
  v: LinhaDeVariavel
  segredos: readonly CredencialVisivel[]
  aoMudar: (p: Partial<LinhaDeVariavel>) => void
  aoTirar: () => void
  aoCriadoSegredo: (c: CredencialVisivel) => Promise<void>
}) {
  const [criando, setCriando] = useState(false)
  return (
    <div className="servidor-variavel" data-variavel-do-form>
      <div className="servidor-linha">
        <input aria-label="Nome da variável" placeholder="NOME_DA_VARIAVEL" spellCheck={false} value={v.nome} onChange={(e) => aoMudar({ nome: e.target.value })} />
        <select aria-label="De onde vem o valor" value={v.modo} onChange={(e) => aoMudar({ modo: e.target.value as LinhaDeVariavel['modo'], valor: '', credencialId: '' })}>
          <option value="segredo">Segredo guardado</option>
          <option value="texto">Texto à vista (não secreto)</option>
        </select>
        <button type="button" aria-label="Tirar a variável" onClick={aoTirar}>
          <X size={13} />
        </button>
      </div>
      {v.modo === 'texto' ? (
        <input aria-label="Valor da variável" placeholder="valor (fica à vista no cadastro: não ponha senha aqui)" value={v.valor} onChange={(e) => aoMudar({ valor: e.target.value })} />
      ) : (
        <div className="credencial-escolha">
          <select aria-label="Segredo da variável" value={v.credencialId} data-a-escolher={v.credencialId ? undefined : true} onChange={(e) => aoMudar({ credencialId: e.target.value })}>
            <option value="">{segredos.length ? 'Escolha o segredo…' : 'Nenhum segredo guardado'}</option>
            {segredos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {mascaraDoValor(c)}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setCriando(!criando)} data-criar-segredo>
            <Plus size={13} /> Criar segredo
          </button>
        </div>
      )}
      {criando && v.modo === 'segredo' && (
        <FormDeCredencial
          tipos={['segredo']}
          nomeInicial={v.nome}
          embutido
          aoCancelar={() => setCriando(false)}
          aoCriar={async (c) => {
            setCriando(false)
            await aoCriadoSegredo(c)
          }}
        />
      )}
    </div>
  )
}

function FormDoServidor({
  id, inicial, credenciais, cifra, recarregarCredenciais, aoSalvo, aoCancelar
}: {
  /** Ausente: cadastro novo. */
  id?: string
  inicial: FormularioDeServidor
  credenciais: readonly CredencialVisivel[] | null
  cifra: boolean
  recarregarCredenciais: () => Promise<void>
  aoSalvo: () => Promise<void>
  aoCancelar: () => void
}) {
  const [f, setF] = useState<FormularioDeServidor>(inicial)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [criandoCabecalho, setCriandoCabecalho] = useState(false)
  const mudar = (p: Partial<FormularioDeServidor>): void => setF((x) => ({ ...x, ...p }))
  const mudarVariavel = (i: number, p: Partial<LinhaDeVariavel>): void => setF((x) => ({ ...x, variaveis: x.variaveis.map((v, j) => (j === i ? { ...v, ...p } : v)) }))
  const segredos = segredosDisponiveis(credenciais)
  const candidatas = credenciaisParaCabecalho(credenciais, f.url)

  /** Credencial recém-criada ainda sendo ligada ao formulário: salvar antes disso recusaria o servidor. */
  const [ligando, setLigando] = useState(false)
  async function ligarCredencial(ligar: () => Promise<void>): Promise<void> {
    setLigando(true)
    try {
      await ligar()
    } finally {
      setLigando(false)
    }
  }

  async function salvar(): Promise<void> {
    if (salvando || ligando) return
    const pedido = pedidoDoFormulario(f, credenciais)
    if ('erro' in pedido) return setErro(pedido.erro)
    setErro('')
    setSalvando(true)
    try {
      const r = id ? await window.ork.mcpFora.editar(id, pedido) : await window.ork.mcpFora.criar(pedido)
      if (!r.ok) return setErro(r.erro)
      await aoSalvo()
    } catch (e) {
      setErro(mensagemDe(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    // Não é <form>: contém o FormDeCredencial (um <form>), cujo submit subiria pela árvore do React e salvaria o
    // servidor antes de a credencial nova estar ligada. Enter num campo do próprio servidor ainda salva.
    <div
      className="conexoes-cartao destaque servidor-form"
      data-form-do-servidor
      onKeyDown={(e) => {
        const alvo = e.target as HTMLInputElement
        if (e.key !== 'Enter' || alvo.tagName !== 'INPUT' || alvo.type === 'radio' || alvo.closest('[data-credencial-form]')) return
        e.preventDefault()
        void salvar()
      }}
    >
      <div className="conexoes-cartao-topo">
        <h4 className="conexoes-cartao-titulo">{id ? `Editar "${inicial.nome}"` : 'Adicionar um servidor de fora'}</h4>
      </div>
      <div className="conexoes-acoes" role="radiogroup" aria-label="Como o servidor roda">
        <label className="servidor-opcao">
          <input type="radio" name="transporte" checked={f.transporte === 'stdio'} disabled={!!id} onChange={() => mudar({ transporte: 'stdio' })} /> Programa neste PC (stdio)
        </label>
        <label className="servidor-opcao">
          <input type="radio" name="transporte" checked={f.transporte === 'http'} disabled={!!id} onChange={() => mudar({ transporte: 'http' })} /> Endereço na internet (https)
        </label>
      </div>
      <label className="credencial-campo">
        <span>Nome</span>
        <input aria-label="Nome do servidor" maxLength={80} placeholder="Como ele aparece (ex.: ClickUp)" value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      </label>

      {f.transporte === 'stdio' ? (
        <>
          <p className="servidor-aviso" role="note">
            <ShieldAlert size={13} aria-hidden /> {AVISO_DO_STDIO}
          </p>
          <label className="credencial-campo">
            <span>Comando</span>
            <input aria-label="Comando" spellCheck={false} placeholder="npx" value={f.comando} onChange={(e) => mudar({ comando: e.target.value })} />
          </label>
          <label className="credencial-campo">
            <span>Argumentos (um por linha)</span>
            <textarea aria-label="Argumentos" rows={3} spellCheck={false} placeholder={'-y\n@exemplo/servidor-mcp'} value={f.args} onChange={(e) => mudar({ args: e.target.value })} />
            <span className="suave credencial-ajuda">Fica à vista no cadastro. Chave e senha vão em variável de ambiente, abaixo, não aqui.</span>
          </label>
          <label className="credencial-campo">
            <span>Pasta de trabalho (opcional)</span>
            <input aria-label="Pasta de trabalho" spellCheck={false} placeholder="a pasta do seu usuário, se ficar vazio" value={f.pasta} onChange={(e) => mudar({ pasta: e.target.value })} />
          </label>
          <div className="credencial-campo">
            <span>Variáveis de ambiente</span>
            {f.variaveis.map((v, i) => (
              <LinhaDaVariavel
                key={i}
                v={v}
                segredos={segredos}
                aoMudar={(p) => mudarVariavel(i, p)}
                aoTirar={() => setF((x) => ({ ...x, variaveis: x.variaveis.filter((_, j) => j !== i) }))}
                aoCriadoSegredo={(c) =>
                  ligarCredencial(async () => {
                    await recarregarCredenciais()
                    mudarVariavel(i, { credencialId: c.id })
                  })
                }
              />
            ))}
            <div className="conexoes-acoes">
              <button type="button" onClick={() => setF((x) => ({ ...x, variaveis: [...x.variaveis, { ...NOVA_VARIAVEL }] }))} data-adicionar-variavel>
                <Plus size={13} /> Variável
              </button>
            </div>
            {!cifra && <span className="suave credencial-ajuda">{SEM_COFRE}</span>}
          </div>
        </>
      ) : (
        <>
          <label className="credencial-campo">
            <span>URL do servidor</span>
            <input aria-label="URL do servidor" spellCheck={false} placeholder="https://mcp.exemplo.com/mcp" value={f.url} onChange={(e) => mudar({ url: e.target.value })} />
            <span className="suave credencial-ajuda">Só https e um nome de verdade (não IP nem endereço deste PC: servidor deste PC entra por stdio).</span>
          </label>
          <div className="credencial-campo">
            <span>Cabeçalhos com API (opcional)</span>
            {f.cabecalhos.map((linha, i) => (
              <div key={i} className="credencial-escolha" data-cabecalho-do-form>
                <select
                  aria-label="API do cabeçalho"
                  value={linha.credencialId}
                  data-a-escolher={linha.credencialId ? undefined : true}
                  onChange={(e) => setF((x) => ({ ...x, cabecalhos: x.cabecalhos.map((l, j) => (j === i ? { credencialId: e.target.value } : l)) }))}
                >
                  <option value="">{candidatas.length ? 'Escolha a API…' : hostDaUrl(f.url) ? `Nenhuma API cobre ${hostDaUrl(f.url)}` : 'Digite a URL primeiro'}</option>
                  {candidatas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} · vai em {cabecalhoDaCredencial(c)} · {mascaraDoValor(c)}
                    </option>
                  ))}
                </select>
                <button type="button" aria-label="Tirar o cabeçalho" onClick={() => setF((x) => ({ ...x, cabecalhos: x.cabecalhos.filter((_, j) => j !== i) }))}>
                  <X size={13} />
                </button>
              </div>
            ))}
            <div className="conexoes-acoes">
              <button type="button" onClick={() => setF((x) => ({ ...x, cabecalhos: [...x.cabecalhos, { credencialId: '' }] }))} data-adicionar-cabecalho>
                <Plus size={13} /> Cabeçalho
              </button>
              <button type="button" disabled={!cifra || !hostDaUrl(f.url)} title={cifra ? 'Guardar uma API para este endereço' : SEM_COFRE} onClick={() => setCriandoCabecalho(!criandoCabecalho)} data-criar-credencial-do-servidor>
                <Plus size={13} /> Criar API
              </button>
            </div>
            {criandoCabecalho && (
              <FormDeCredencial
                dominiosIniciais={hostDaUrl(f.url)}
                embutido
                aoCancelar={() => setCriandoCabecalho(false)}
                aoCriar={(c) =>
                  ligarCredencial(async () => {
                    setCriandoCabecalho(false)
                    await recarregarCredenciais()
                    setF((x) => ({ ...x, cabecalhos: [...x.cabecalhos.filter((l) => l.credencialId), { credencialId: c.id }] }))
                  })
                }
              />
            )}
            <span className="suave credencial-ajuda">Sem cabeçalho, um servidor que pede login fica como "{AVISO_DE_LOGIN}".</span>
          </div>
        </>
      )}

      {erro && (
        <p className="conexoes-erro" role="alert" data-erro-do-form>
          {erro}
        </p>
      )}
      <div className="conexoes-acoes credencial-acoes">
        <button type="button" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button type="button" className="primario" disabled={salvando || ligando} onClick={() => void salvar()} data-guardar-servidor>
          {id ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- importar

function DialogoDeImportacao({ origem, aoFechar, aoConcluir }: { origem: OrigemDaImportacaoMcp; aoFechar: () => void; aoConcluir: () => Promise<void> }) {
  const [leitura, setLeitura] = useState<Extract<LeituraDaImportacaoMcp, { ok: true }> | null>(null)
  const [erro, setErro] = useState('')
  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [pronto, setPronto] = useState<{ criados: string[]; avisos: string[] } | null>(null)
  const lido = useRef(false)

  useEffect(() => {
    // lê uma vez só (o token vale uma importação)
    if (lido.current) return
    lido.current = true
    window.ork.mcpFora.lerImportacao(origem).then(
      (r) => {
        if (!r.ok) {
          if (r.cancelado) aoFechar()
          else setErro(r.erro)
          return
        }
        setLeitura(r)
        setMarcados(new Set(r.servidores.filter(marcadoNaImportacao).map((s) => s.chave)))
      },
      (e) => setErro(mensagemDe(e))
    )
  }, [origem, aoFechar])

  async function importar(): Promise<void> {
    if (!leitura || importando || !marcados.size) return
    setImportando(true)
    setErro('')
    try {
      const r = await window.ork.mcpFora.importar(leitura.token, [...marcados])
      if (!r.ok) {
        setErro(r.erro)
        setImportando(false)
        return
      }
      setPronto({ criados: r.criados, avisos: r.avisos })
      await aoConcluir()
    } catch (e) {
      setErro(mensagemDe(e))
    }
    setImportando(false)
  }

  const alternar = (chave: string): void =>
    setMarcados((m) => {
      const n = new Set(m)
      if (n.has(chave)) n.delete(chave)
      else n.add(chave)
      return n
    })

  return (
    <Dialogo titulo={origem.de === 'claude' ? 'Importar do Claude Code' : 'Importar de um arquivo'} aoFechar={aoFechar}>
      <div className="servidores-importar" data-importar-servidores>
        {!leitura && !erro && <p className="suave">Lendo a configuração…</p>}
        {erro && (
          <p className="extra-erro conexoes-erro" role="alert">
            {erro}
          </p>
        )}
        {pronto ? (
          <>
            <p role="status" data-importacao-pronta>
              {pronto.criados.length ? `Importado: ${pronto.criados.join(', ')}.` : 'Nada foi importado.'}
            </p>
            {pronto.avisos.length > 0 && (
              <ul className="servidor-avisos" data-avisos-da-importacao>
                {pronto.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          leitura && (
            <>
              {!leitura.servidores.length && <p className="suave">Nenhum servidor MCP encontrado.</p>}
              {leitura.servidores.length > 0 && (
                <p className="suave conexoes-detalhe">
                  Segredos (variáveis e cabeçalhos) viram segredos cifrados; o texto puro não é gravado. O Orkester não é oferecido.
                </p>
              )}
              <ul className="servidores-importar-lista">
                {leitura.servidores.map((s: ServidorParaImportar) => (
                  <li key={s.chave} className="servidores-importar-item" data-importar-servidor={s.chave}>
                    <label>
                      <input type="checkbox" checked={marcados.has(s.chave)} onChange={() => alternar(s.chave)} /> <b>{s.nome}</b>{' '}
                      <span className="suave">
                        · {s.transporte === 'stdio' ? 'programa neste PC' : 'endereço'} · {s.onde}
                      </span>
                    </label>
                    <pre className="servidor-comando">{s.resumo}</pre>
                    {s.secretos.length > 0 && <p className="suave conexoes-detalhe">{textoDosSecretos(s.secretos)}</p>}
                    {s.precisaLogin && <p className="servidor-aviso">{AVISO_DE_LOGIN}: fica cadastrado, mas ainda não dá para usar.</p>}
                    {s.jaExiste && <p className="suave conexoes-detalhe">Já existe um servidor com este nome: ele não é trocado.</p>}
                  </li>
                ))}
              </ul>
            </>
          )
        )}
      </div>
      <div className="dialogo-acoes">
        <button type="button" onClick={aoFechar}>
          {pronto ? 'Fechar' : 'Cancelar'}
        </button>
        {!pronto && (
          <button type="button" className="primario" disabled={!leitura || !marcados.size || importando} onClick={() => void importar()} data-importar-confirmar>
            {importando ? 'Importando…' : `Importar ${marcados.size || ''}`.trim()}
          </button>
        )}
      </div>
    </Dialogo>
  )
}

// ---------------------------------------------------------------- a parte "Servidores de fora"

export function ServidoresDeFora() {
  const { lista: credenciais, recarregar: recarregarCredenciais } = usarCredenciais()
  const [servidores, setServidores] = useState<ResumoDeServidorMcp[] | null>(null)
  // erro de LEITURA (a lista) e erro de AÇÃO (pausar, remover, rever…) são separados: a releitura não apaga o da ação
  const [erro, setErro] = useState('')
  const [erroDaAcao, setErroDaAcao] = useState('')
  const [editando, setEditando] = useState<'novo' | string | null>(null)
  const [importacao, setImportacao] = useState<OrigemDaImportacaoMcp | null>(null)
  // a leitura mais nova vale (a releitura periódica não atropela uma ação)
  const vez = useRef(0)

  const recarregar = useCallback(async (): Promise<void> => {
    const minha = ++vez.current
    try {
      const l = await window.ork.mcpFora.listar()
      if (vez.current !== minha) return
      setServidores(l)
      setErro('')
    } catch (e) {
      if (vez.current === minha) setErro(`Não consegui ler os servidores: ${mensagemDe(e)}`)
    }
  }, [])

  useEffect(() => {
    void recarregar()
    const volta = (): void => {
      if (!document.hidden) void recarregar()
    }
    const relogio = setInterval(volta, RELEITURA_MS)
    document.addEventListener('visibilitychange', volta)
    return () => {
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', volta)
    }
  }, [recarregar])

  const agir = useCallback(
    async (fazer: () => Promise<ResultadoDeServidorMcp>): Promise<boolean> => {
      setErroDaAcao('')
      let ok = false
      try {
        const r = await fazer()
        ok = r.ok
        if (!r.ok) setErroDaAcao(r.erro)
      } catch (e) {
        setErroDaAcao(mensagemDe(e))
      }
      await recarregar()
      return ok
    },
    [recarregar]
  )

  const fecharImportacao = useCallback(() => setImportacao(null), [])
  const itens = credenciais?.itens ?? null
  const cifra = credenciais?.cifraDisponivel === true
  const emEdicao = editando && editando !== 'novo' ? servidores?.find((s) => s.id === editando) : undefined

  async function concluirImportacao(): Promise<void> {
    // a importação cria credenciais (segredos): a lista delas e a dos servidores mudam juntas
    await Promise.all([recarregar(), recarregarCredenciais()])
  }

  return (
    <section className="conexoes-secao" data-conexoes-secao="mcp-fora">
      <div className="conexoes-secao-topo">
        <h3 className="conexoes-secao-titulo">
          <Plug size={16} /> Servidores de fora
        </h3>
        <p className="suave conexoes-texto">
          Programas e serviços MCP de terceiros (o ClickUp, o n8n-mcp…) que os fluxos e as páginas podem usar. O cadastro é só desta tela: nenhum agente nem página cadastra servidor. As chaves
          deles ficam cifradas: as de variável de ambiente em <b>Segredos dos servidores</b>, abaixo; as de cabeçalho em <b>APIs</b>.
        </p>
      </div>

      <div className="conexoes-acoes conexoes-acoes-quebra" data-acoes-dos-servidores>
        <button type="button" className="primario" onClick={() => setEditando('novo')} disabled={editando !== null} data-adicionar-servidor>
          <Plus size={14} /> Adicionar servidor
        </button>
        <button type="button" onClick={() => setImportacao({ de: 'claude' })} disabled={!cifra} title={cifra ? 'Lê o ~/.claude.json e deixa você escolher' : SEM_COFRE} data-importar-claude>
          <Download size={14} /> Importar do Claude Code
        </button>
        <button type="button" onClick={() => setImportacao({ de: 'arquivo' })} disabled={!cifra} title={cifra ? 'Escolhe um arquivo .mcp.json' : SEM_COFRE} data-importar-arquivo>
          <FileJson size={14} /> Importar de um arquivo…
        </button>
      </div>
      {!cifra && credenciais && <p className="suave conexoes-detalhe">{SEM_COFRE}</p>}

      {erro && (
        <p className="conexoes-erro" role="alert" data-erro-dos-servidores>
          {erro}
        </p>
      )}
      {erroDaAcao && (
        <p className="conexoes-erro" role="alert" data-erro-da-acao>
          {erroDaAcao}{' '}
          <button type="button" className="conexoes-link" onClick={() => setErroDaAcao('')}>
            Dispensar
          </button>
        </p>
      )}

      {editando === 'novo' && (
        <FormDoServidor
          inicial={FORMULARIO_DE_SERVIDOR_VAZIO}
          credenciais={itens}
          cifra={cifra}
          recarregarCredenciais={recarregarCredenciais}
          aoSalvo={async () => {
            setEditando(null)
            await recarregar()
          }}
          aoCancelar={() => setEditando(null)}
        />
      )}
      {emEdicao && (
        <FormDoServidor
          key={emEdicao.id}
          id={emEdicao.id}
          inicial={formularioDoServidor(emEdicao)}
          credenciais={itens}
          cifra={cifra}
          recarregarCredenciais={recarregarCredenciais}
          aoSalvo={async () => {
            setEditando(null)
            await recarregar()
          }}
          aoCancelar={() => setEditando(null)}
        />
      )}

      <div className="conexoes-subtitulo">
        <h4>Cadastrados</h4>
        {servidores && <span className="conexoes-contagem">{servidores.length}</span>}
      </div>
      {!servidores && !erro && <p className="suave conexoes-vazio">Lendo…</p>}
      {servidores && !servidores.length && (
        <p className="suave conexoes-vazio conexoes-vazio-caixa" data-sem-servidores>
          Nenhum servidor ainda. Use <b>Importar do Claude Code</b> para trazer os que você já tem, ou <b>Adicionar servidor</b>.
        </p>
      )}
      {!!servidores?.length && (
        <div className="conexoes-lista">
          {servidores.map((s) => (
            <CartaoDoServidor key={s.id} s={s} credenciais={itens} aoAgir={agir} aoEditar={() => setEditando(s.id)} />
          ))}
        </div>
      )}
      <SegredosDosServidores segredos={segredosDisponiveis(itens)} lido={!!credenciais} cifra={cifra} recarregar={recarregarCredenciais} />
      {importacao && <DialogoDeImportacao origem={importacao} aoFechar={fecharImportacao} aoConcluir={concluirImportacao} />}
    </section>
  )
}

/**
 * (1.9.7, F2) "Segredos dos servidores": as credenciais do tipo Segredo (sem domínio, só para variável de ambiente de
 * servidor MCP) saíram da aba APIs e moram aqui. Mesmo cofre, mesmo cartão (trocar valor, renomear, apagar).
 */
function SegredosDosServidores({ segredos, lido, cifra, recarregar }: { segredos: readonly CredencialVisivel[]; lido: boolean; cifra: boolean; recarregar: () => Promise<void> }) {
  const [criando, setCriando] = useState(false)
  const [feito, setFeito] = useState('')
  return (
    <div data-segredos-dos-servidores>
      <div className="conexoes-subtitulo">
        <h4>Segredos dos servidores</h4>
        {lido && <span className="conexoes-contagem">{segredos.length}</span>}
      </div>
      <p className="suave conexoes-detalhe">
        O valor de uma variável de ambiente (a chave que um servidor stdio lê). Não tem domínio e nunca vai em cabeçalho nem em pedido HTTP. O servidor o cita
        pelo id: renomear não quebra nada.
      </p>
      <div className="conexoes-acoes">
        <button type="button" disabled={!cifra || criando} title={cifra ? 'Guardar o valor de uma variável de ambiente' : SEM_COFRE} onClick={() => setCriando(true)} data-guardar-segredo>
          <KeyRound size={13} /> Guardar um segredo
        </button>
      </div>
      {criando && (
        <div className="conexoes-cartao destaque" data-credencial-criar>
          <FormDeCredencial
            tipos={['segredo']}
            aoCancelar={() => setCriando(false)}
            aoCriar={async (c) => {
              setCriando(false)
              setFeito(textoDeGuardada(c))
              await recarregar()
            }}
          />
        </div>
      )}
      {feito && (
        <p className="suave conexoes-nota" role="status" data-credencial-guardada>
          {feito}
        </p>
      )}
      {lido && !segredos.length && <p className="suave conexoes-vazio">Nenhum segredo ainda. Ele também nasce ao cadastrar um servidor (Criar segredo, na variável) ou ao importar.</p>}
      {!!segredos.length && (
        <div className="conexoes-grade">
          {segredos.map((c) => (
            <CartaoDaCredencial key={c.id} c={c} cifra={cifra} aoMudar={recarregar} />
          ))}
        </div>
      )}
    </div>
  )
}
