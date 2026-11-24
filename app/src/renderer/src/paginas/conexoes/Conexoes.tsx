import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppWindow, Check, Copy, Download, Globe, KeyRound, Lock, Plug, Plus, Power, PowerOff, RefreshCw, Trash2, Unlink, Wrench } from 'lucide-react'
import { comecoParaTela, configuracoesDoMcp, type ComandoDoMcp, type ConfiguracoesDoMcp } from '../../../../shared/chaves'
import { listarFerramentas } from '../../../../shared/ferramentasMcp'
import type { ResumoDePortal } from '../../../../shared/portais'
import { avisar, confirmar } from '../../ui/Perguntas'
import { exigirOk, mensagemDeErro as mensagemDeErroDaPagina, type ApiPaginas, type PaginaInstalada } from '../extra/contrato'
import { abrirProposta } from '../extra/DialogoAceite'
import { alternarChaveDasPaginas, apiPaginas, iniciarEstadoDasPaginas, recarregarPaginas, usarPaginas } from '../extra/estado'
import { IconeDaPagina } from '../extra/Icone'
import { LigarAgente } from '../extra/LigarAgente'
import { abrirPainelDePaginas } from '../extra/PainelMais'
import { linhasDePermissao, motivoDaQueda, SEMPRE, textoDePendencia, textoDeDesligada } from '../extra/textos'
import { aoPedirAbaDeConexoes, pegarAbaDeConexoes, type AbaDeConexoes } from './aba'
import { Credenciais } from './Credenciais'
import '../../estilos/conexoes.css'

// Conexões (página geral): tudo o que liga o Orkester ao que está fora dele. Desde a 1.9.5 (S6) é organizada em abas
// (Chaves · MCP · Páginas · Credenciais · Portais), cada uma com uma frase do que é e cartões com título, selo de estado e as ações
// à vista. Só mostra e organiza o que já existe: o cofre de chaves é main/chaves.ts, a lista das ferramentas sai do
// registro do servidor (shared/ferramentasMcp.ts), os portais são a partição do Electron (main/portais.ts) e as páginas
// "+" são do registro do main (main/paginas.ts).

type ChaveNaTela = Awaited<ReturnType<typeof window.ork.chaves.listar>>[number]
type Formato = keyof ConfiguracoesDoMcp
type Tom = 'vivo' | 'atencao' | 'perigo' | 'neutro'

/** Como ligar o MCP nesta máquina: o comando, ou o motivo de não termos conseguido ler (a tela mostra o motivo em vez de ficar em "Lendo…"). */
interface EstadoMcp {
  comando: ComandoDoMcp | null
  erro: string
}

const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** `configuracoesDoMcp` lança quando o caminho do programa tem um caractere que ela não sabe escapar (ex.: aspas simples no nome do usuário). */
function montarConfig(segredo: string, comando: ComandoDoMcp): { config: ConfiguracoesDoMcp | null; erro: string } {
  try {
    return { config: configuracoesDoMcp(segredo, comando), erro: '' }
  } catch (e) {
    return { config: null, erro: `Não consegui montar o comando do MCP: ${mensagemDe(e)}` }
  }
}

const FORMATOS: Array<[Formato, string, string]> = [
  ['claudeCode', 'Claude Code', 'Cole no terminal. Vale para todos os seus projetos.'],
  ['json', 'Claude Desktop / .mcp.json', 'Cole dentro de "mcpServers" na configuração do Claude Desktop, ou no .mcp.json de um projeto.'],
  ['codex', 'Codex', 'Cole no fim do ~/.codex/config.toml.']
]

/** Onde o usuário troca pela chave de verdade quando o comando é mostrado sem ela. */
const NO_LUGAR_DA_CHAVE = 'COLE_AQUI_SUA_CHAVE'

const data = (iso?: string): string => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const dataEHora = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`

function Selo({ tom, children, ...resto }: { tom: Tom; children: ReactNode } & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <span className={`conexoes-selo ${tom}`} {...resto}>
      {children}
    </span>
  )
}

/** Cabeçalho de cada aba: título, uma frase do que é. */
function Secao({ id, icone, titulo, frase, children }: { id: AbaDeConexoes; icone: ReactNode; titulo: string; frase: ReactNode; children: ReactNode }) {
  return (
    <section className="conexoes-secao" data-conexoes-secao={id}>
      <div className="conexoes-secao-topo">
        <h3 className="conexoes-secao-titulo">
          {icone} {titulo}
        </h3>
        <p className="suave conexoes-texto">{frase}</p>
      </div>
      {children}
    </section>
  )
}

/** Um cartão: título, selo de estado à direita, uma frase e o conteúdo. */
function Cartao({ titulo, selo, frase, children, className = '', ...resto }: { titulo: ReactNode; selo?: ReactNode; frase?: ReactNode; children?: ReactNode; className?: string } & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <div className={`conexoes-cartao ${className}`} {...resto}>
      <div className="conexoes-cartao-topo">
        <h4 className="conexoes-cartao-titulo">{titulo}</h4>
        {selo}
      </div>
      {frase && <p className="suave conexoes-texto">{frase}</p>}
      {children}
    </div>
  )
}

/** As três formas de colar a configuração, com o texto da escolhida e o botão de copiar. */
function ConfigDoMcp({ config, aoCopiar }: { config: ConfiguracoesDoMcp; aoCopiar?: () => void }) {
  const [formato, definirFormato] = useState<Formato>('claudeCode')
  const [copiado, definirCopiado] = useState(false)
  async function copiar(): Promise<void> {
    await navigator.clipboard.writeText(config[formato])
    definirCopiado(true)
    aoCopiar?.()
    setTimeout(() => definirCopiado(false), 1500)
  }
  return (
    <div className="conexoes-config">
      <div className="conexoes-formatos" role="tablist">
        {FORMATOS.map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={formato === id} className={`conexoes-formato ${formato === id ? 'ativo' : ''}`} onClick={() => definirFormato(id)}>
            {rotulo}
          </button>
        ))}
      </div>
      <p className="suave conexoes-nota">{FORMATOS.find(([id]) => id === formato)?.[2]}</p>
      <pre className="conexoes-comando" data-formato={formato}>
        {config[formato]}
      </pre>
      <div className="conexoes-acoes">
        <button type="button" onClick={() => void copiar()}>
          {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

/** Plano B quando o comando não pôde ser montado: a chave criada aparece mesmo assim, para não se perder (ela não é mostrada de novo). */
function SegredoAvulso({ segredo }: { segredo: string }) {
  const [copiado, definirCopiado] = useState(false)
  async function copiar(): Promise<void> {
    await navigator.clipboard.writeText(segredo)
    definirCopiado(true)
    setTimeout(() => definirCopiado(false), 1500)
  }
  return (
    <div className="conexoes-config">
      <pre className="conexoes-comando" data-chave-segredo>
        {segredo}
      </pre>
      <div className="conexoes-acoes">
        <button type="button" onClick={() => void copiar()}>
          {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Chaves

// A chave recém-criada mora em `Conexoes` (só na memória da janela), não em `Chaves`: trocar de aba desmonta `Chaves`, e a chave
// não aparece de novo. Só some com "Já copiei". `config` nula = o comando não pôde ser montado; aí o `segredo` fica à mostra no
// lugar dele (só neste caso, e some junto) e `aviso` diz por quê.
type ChaveNova = { nome: string; config: ConfiguracoesDoMcp | null; segredo: string; aviso: string }

function Chaves({
  mcp,
  chaves,
  recarregar,
  nova,
  definirNova
}: {
  mcp: EstadoMcp
  chaves: ChaveNaTela[] | null
  recarregar: () => Promise<void>
  nova: ChaveNova | null
  definirNova: (n: ChaveNova | null) => void
}) {
  const [nome, definirNome] = useState('')
  const [erro, definirErro] = useState('')

  async function gerar(): Promise<void> {
    definirErro('')
    try {
      const criada = await window.ork.chaves.criar(nome)
      if ('erro' in criada) return definirErro(criada.erro)
      // a chave já está gravada: mesmo que o comando não saia (ainda lendo, ou caminho que não dá para escapar), ela aparece
      const { config, erro: porque } = mcp.comando
        ? montarConfig(criada.segredo, mcp.comando)
        : { config: null, erro: mcp.erro || 'Ainda não sei como ligar o MCP nesta máquina.' }
      definirNova({ nome: criada.nome, config, segredo: config ? '' : criada.segredo, aviso: config ? '' : `${porque} Copie a chave abaixo e use-a no comando da aba MCP.` })
      definirNome('')
      await recarregar()
    } catch (e) {
      definirErro(`Não consegui gerar a chave: ${mensagemDe(e)}`)
    }
  }

  async function revogar(k: ChaveNaTela): Promise<void> {
    const r = await confirmar({
      titulo: `Revogar a chave "${k.nome}"?`,
      mensagem: 'Quem usa esta chave deixa de conseguir mexer no quadro na hora. Não dá para desfazer: para voltar, gere outra.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Revogar', valor: 'revogar', perigo: true }
      ]
    })
    if (r.botao !== 'revogar') return
    await window.ork.chaves.revogar(k.id)
    await recarregar()
  }

  const vivas = (chaves ?? []).filter((k) => !k.revogadaEm)
  const revogadas = (chaves ?? []).filter((k) => k.revogadaEm)

  return (
    <Secao
      id="chaves"
      icone={<KeyRound size={16} />}
      titulo="Chaves"
      frase="Uma chave deixa um programa de fora — o seu Claude, o Codex, outro PC — ver e mexer no quadro como se fosse você. Cada programa ganha a sua, e você corta o acesso quando quiser."
    >
      {nova ? (
        <Cartao titulo={<>Chave “{nova.nome}” criada</>} selo={<Selo tom="atencao">Copie agora</Selo>} className="destaque" data-chave-nova>
          <p className="conexoes-texto">
            Ela <b>não aparece de novo</b>: o Orkester guarda só uma impressão digital dela. Escolha onde vai colar e copie o comando (ele já leva a chave).
          </p>
          {nova.aviso && (
            <p className="conexoes-erro" role="alert">
              {nova.aviso}
            </p>
          )}
          {nova.config ? <ConfigDoMcp config={nova.config} /> : <SegredoAvulso segredo={nova.segredo} />}
          <div className="conexoes-acoes">
            <button
              type="button"
              className="primario"
              onClick={() => {
                definirNova(null)
                definirErro('')
              }}
            >
              Já copiei
            </button>
          </div>
        </Cartao>
      ) : (
        <Cartao titulo="Criar uma chave" frase="Dê um nome para saber depois quem está usando." data-chave-criar>
          <form
            className="conexoes-gerar"
            onSubmit={(e) => {
              e.preventDefault()
              void gerar()
            }}
          >
            <input value={nome} placeholder='Para quem é ("Claude Desktop", "notebook")' maxLength={60} aria-label="Nome da nova chave" onChange={(e) => definirNome(e.target.value)} />
            <button className="primario" type="submit" disabled={!nome.trim()}>
              Gerar chave
            </button>
          </form>
        </Cartao>
      )}
      {erro && (
        <p className="conexoes-erro" role="alert">
          {erro}
        </p>
      )}

      <div className="conexoes-subtitulo">
        <h4>Suas chaves</h4>
        {chaves && <span className="conexoes-contagem">{vivas.length}</span>}
      </div>
      {!chaves && <p className="suave conexoes-vazio">Lendo…</p>}
      {chaves && !vivas.length && <p className="suave conexoes-vazio conexoes-vazio-caixa">Nenhuma chave ainda. Crie uma acima e cole o comando que aparece no programa que vai usar o Orkester.</p>}
      {!!vivas.length && (
        <div className="conexoes-grade">
          {vivas.map((k) => (
            <Cartao
              key={k.id}
              titulo={k.nome}
              selo={k.usadaEm ? <Selo tom="vivo">Em uso</Selo> : <Selo tom="neutro">Nunca usada</Selo>}
              data-chave={k.id}
            >
              <p className="suave conexoes-detalhe">
                <code>{comecoParaTela(k.comeco)}</code> · criada {data(k.criadaEm)} · {k.usadaEm ? `último uso ${dataEHora(k.usadaEm)}` : 'nunca usada'}
              </p>
              <div className="conexoes-acoes conexoes-acoes-pe">
                <button type="button" className="perigo" title={`Revogar a chave "${k.nome}"`} onClick={() => void revogar(k)} data-revogar-chave={k.id}>
                  <Trash2 size={13} /> Revogar
                </button>
              </div>
            </Cartao>
          ))}
        </div>
      )}
      {!!revogadas.length && (
        <p className="suave conexoes-nota">
          {plural(revogadas.length, 'revogada', 'revogadas')}: {revogadas.map((k) => k.nome).join(', ')}.
        </p>
      )}
      <p className="suave conexoes-nota conexoes-rodape">
        O Orkester precisa estar aberto para a chave funcionar. Ela não protege contra programas que já rodam no seu PC: serve para saber quem fez o quê e cortar
        o acesso. A lista mostra só o <b>começo</b> de cada chave.
      </p>
    </Secao>
  )
}

// ---------------------------------------------------------------- MCP

function ServidorMcp({ mcp, chavesVivas, irParaChaves }: { mcp: EstadoMcp; chavesVivas: number | null; irParaChaves: () => void }) {
  const total = useMemo(() => listarFerramentas().length, [])
  const [resultado, definirResultado] = useState<{ caminho: string; erro: string } | null>(null)
  async function baixar(): Promise<void> {
    try {
      const r = await window.ork.chaves.salvarListaDeFerramentas()
      if (r) definirResultado('erro' in r ? { caminho: '', erro: `Não consegui salvar a lista: ${r.erro}` } : { caminho: r.caminho, erro: '' })
    } catch (e) {
      definirResultado({ caminho: '', erro: `Não consegui salvar a lista: ${mensagemDe(e)}` })
    }
  }
  const { config, erro } = useMemo(() => (mcp.comando ? montarConfig(NO_LUGAR_DA_CHAVE, mcp.comando) : { config: null, erro: mcp.erro }), [mcp])
  const selo =
    chavesVivas === null ? undefined : chavesVivas > 0 ? (
      <Selo tom="vivo">{plural(chavesVivas, 'chave pronta', 'chaves prontas')}</Selo>
    ) : (
      <Selo tom="atencao">Falta uma chave</Selo>
    )
  return (
    <Secao
      id="mcp"
      icone={<Plug size={16} />}
      titulo="MCP do Orkester"
      frase="O MCP é a porta pela qual o seu Claude ou o Codex conversa com o Orkester: lê o quadro, abre agentes, mexe no kanban."
    >
      <Cartao titulo="Ligar ao seu programa" selo={selo} data-mcp-ligar>
        <ol className="conexoes-passos">
          <li>
            <b>Tenha uma chave.</b>{' '}
            {chavesVivas === 0 ? (
              <>
                Você ainda não tem.{' '}
                <button type="button" className="conexoes-link" onClick={irParaChaves} data-ir-para-chaves>
                  Criar na aba Chaves
                </button>
              </>
            ) : (
              <span className="suave">Cada programa usa a sua (aba Chaves).</span>
            )}
          </li>
          <li>
            <b>Escolha onde vai colar</b> <span className="suave">e copie o comando.</span>
          </li>
          <li>
            <b>Troque</b> <code>{NO_LUGAR_DA_CHAVE}</code> <span className="suave">pela chave inteira (ela só aparece quando você a cria).</span>
          </li>
        </ol>
        {config ? (
          <ConfigDoMcp config={config} />
        ) : erro ? (
          <p className="conexoes-erro" role="alert">
            {erro}
          </p>
        ) : (
          <p className="suave conexoes-vazio">Lendo…</p>
        )}
      </Cartao>
      <Cartao titulo="Ferramentas" data-ferramentas-mcp>
        <p className="conexoes-texto">
          <Wrench size={13} /> O MCP do Orkester tem <b>{total} ferramentas</b>. A lista diz o que cada uma faz, para você conferir ou mandar a alguém.
        </p>
        <div className="conexoes-acoes">
          <button type="button" data-baixar-ferramentas onClick={() => void baixar()}>
            <Download size={13} /> Baixar a lista (.md)
          </button>
        </div>
        {resultado && (
          <p className={resultado.erro ? 'conexoes-erro' : 'suave conexoes-nota'} role={resultado.erro ? 'alert' : 'status'} data-ferramentas-resultado>
            {resultado.erro || `Lista salva em ${resultado.caminho}`}
          </p>
        )}
      </Cartao>
    </Secao>
  )
}

// ---------------------------------------------------------------- Portais

function Portais({ portais, recarregar }: { portais: ResumoDePortal[] | null; recarregar: () => Promise<void> }) {
  async function limpar(p: ResumoDePortal): Promise<void> {
    const r = await confirmar({
      titulo: `Limpar o login de "${p.nome}"?`,
      mensagem: 'Apaga os cookies e os dados guardados dos sites neste navegador. Você terá de entrar de novo em cada site. Os cartões de portal abertos podem precisar ser recarregados.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Limpar login', valor: 'limpar', perigo: true }
      ]
    })
    if (r.botao !== 'limpar') return
    if (!(await window.ork.portais.limpar(p.particao))) await avisar('Conexões', 'Não consegui limpar: esse portal não é um que o Orkester conheça.')
    await recarregar()
  }

  return (
    <Secao
      id="portais"
      icone={<Globe size={16} />}
      titulo="Portais"
      frase="Os cartões de portal abrem sites dentro do quadro. Os logins desses sites ficam guardados aqui, separados do seu navegador."
    >
      {!portais && <p className="suave conexoes-vazio">Lendo…</p>}
      {portais && !portais.length && <p className="suave conexoes-vazio conexoes-vazio-caixa">Nenhum portal ainda. Abra um cartão de portal no quadro para navegar num site.</p>}
      {!!portais?.length && (
        <div className="conexoes-grade">
          {portais.map((p) => (
            <Cartao
              key={p.particao}
              titulo={p.nome}
              selo={p.temLogin ? <Selo tom="vivo">Login guardado</Selo> : <Selo tom="neutro">Sem login</Selo>}
              data-portal={p.particao}
            >
              <p className="suave conexoes-detalhe">
                {p.temLogin
                  ? `Em ${plural(p.sites.length, 'site', 'sites')}: ${p.sites.slice(0, 6).join(', ')}${p.sites.length > 6 ? '…' : ''}`
                  : p.cookies
                    ? `${plural(p.cookies, 'cookie', 'cookies')} só desta sessão; nenhum login guardado.`
                    : 'Nenhum cookie de login guardado.'}
              </p>
              <div className="conexoes-acoes conexoes-acoes-pe">
                <button type="button" className="perigo" title="Apaga cookies e dados guardados dos sites, mesmo os que não aparecem na lista" onClick={() => void limpar(p)}>
                  <Trash2 size={13} /> Limpar login
                </button>
              </div>
            </Cartao>
          ))}
        </div>
      )}
      <p className="suave conexoes-nota conexoes-rodape">Quando o PC tem Chrome ou Edge, o portal usa o navegador dele; este é o navegador de reserva.</p>
    </Secao>
  )
}

// ---------------------------------------------------------------- Páginas

/** Situação de uma página instalada, como selo. */
function seloDaPagina(p: PaginaInstalada): { tom: Tom; texto: string } {
  if (p.desligada) return p.desligada.motivo === 'quedas' ? { tom: 'perigo', texto: 'Desligada (quedas)' } : { tom: 'neutro', texto: 'Desligada' }
  if (p.pendente) return { tom: 'atencao', texto: p.pendente.motivo === 'mudou-fora' ? 'Mudou fora' : 'Pede permissão' }
  return { tom: 'vivo', texto: 'Ligada' }
}

/** Uma página extra instalada: situação, permissões (Revogar / Permitir de novo), ligações, Atualizar e Remover. */
function PaginaInstaladaNaLista({ p, acao }: { p: PaginaInstalada; acao: (fazer: (api: ApiPaginas) => Promise<unknown>) => Promise<void> }) {
  const pendencia = textoDePendencia(p.pendente)
  const linhas = linhasDePermissao(p)
  const selo = seloDaPagina(p)
  async function remover(): Promise<void> {
    const r = await confirmar({
      titulo: `Remover a página "${p.nome}"?`,
      mensagem: 'Apaga a cópia dela no Orkester, os dados que ela guardou e as ligações com agentes. A pasta de onde ela veio não é tocada.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Remover', valor: 'remover', perigo: true }
      ]
    })
    if (r.botao === 'remover') await acao((api) => api.remover(p.id))
  }
  return (
    <div className="conexoes-cartao conexoes-pagina" data-pagina-instalada={p.id}>
      <div className="conexoes-pagina-topo">
        <IconeDaPagina icone={p.icone} nome={p.nome} tamanho={28} />
        <div className="conexoes-pagina-nome">
          <h4 className="conexoes-cartao-titulo">
            {p.nome} <span className="suave conexoes-versao">versão {p.versao}</span>
          </h4>
          {p.descricao && <p className="suave conexoes-detalhe">{p.descricao}</p>}
        </div>
        <Selo tom={selo.tom} data-selo-da-pagina={selo.tom}>
          {selo.texto}
        </Selo>
      </div>
      <p className="suave conexoes-detalhe" data-situacao-da-pagina>
        {p.desligada ? textoDeDesligada(p.desligada.motivo) : pendencia || 'Ligada: aparece na barra da esquerda.'}
        {p.ultimaQueda && ` Última queda: ${dataEHora(new Date(p.ultimaQueda.em).toISOString())} (${motivoDaQueda(p.ultimaQueda.motivo)}).`}
      </p>
      <div className="conexoes-acoes conexoes-acoes-quebra">
        {pendencia && (
          <button type="button" className="primario" onClick={() => void abrirProposta(() => apiPaginas()!.rever(p.id), 'Rever página')}>
            Rever
          </button>
        )}
        {p.desligada ? (
          <button type="button" onClick={() => void acao((api) => api.religar(p.id))} data-religar-pagina={p.id}>
            <Power size={13} /> Religar
          </button>
        ) : (
          <button type="button" title="Tira da barra e não carrega até você religar" onClick={() => void acao((api) => api.desligar(p.id))} data-desligar-pagina={p.id}>
            <PowerOff size={13} /> Desligar
          </button>
        )}
        <button type="button" title={`Lê de novo a pasta de onde ela veio (${p.origem}) e mostra o que mudou`} onClick={() => void abrirProposta(() => apiPaginas()!.atualizar(p.id), 'Atualizar da pasta')}>
          <RefreshCw size={13} /> Atualizar da pasta
        </button>
        <button type="button" className="perigo" onClick={() => void remover()} data-remover-pagina={p.id}>
          <Trash2 size={13} /> Remover
        </button>
      </div>

      <div className="conexoes-pagina-blocos">
        <div className="conexoes-pagina-bloco">
          <span className="conexoes-pagina-rotulo">Permissões</span>
          {linhas.length ? (
            linhas.map((l) => (
              <div key={l.ficha} className={`conexoes-pagina-item ${l.recusada ? 'recusada' : ''} ${l.perigo ? 'perigo' : ''}`} data-permissao={l.ficha} data-recusada={l.recusada || undefined}>
                <span>
                  {l.recusada && <s>{l.rotulo}</s>}
                  {!l.recusada && <span title={l.texto}>{l.rotulo}</span>}
                  {l.recusada && <span className="suave"> (revogada)</span>}
                </span>
                {l.recusada ? (
                  <button type="button" onClick={() => void acao((api) => api.permitirDeNovo(p.id, l.ficha))}>
                    Permitir de novo
                  </button>
                ) : (
                  <button type="button" className="perigo" onClick={() => void acao((api) => api.revogar(p.id, l.ficha))} data-revogar={l.ficha}>
                    Revogar
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="suave conexoes-vazio">Nenhuma além do básico: {SEMPRE[0]}.</p>
          )}
        </div>

        <div className="conexoes-pagina-bloco">
          <span className="conexoes-pagina-rotulo">Ligada a</span>
          {p.cordas.map((c) => (
            <div key={`${c.espacoId}/${c.cartaoId}`} className="conexoes-pagina-item" data-corda={`${c.espacoId}/${c.cartaoId}`}>
              <span>
                {c.cartaoNome} <span className="suave">· {c.espacoNome}</span>
              </span>
              <button type="button" onClick={() => void acao((api) => api.desligarCorda(p.id, c.espacoId, c.cartaoId))}>
                <Unlink size={13} /> Desligar
              </button>
            </div>
          ))}
          {!p.cordas.length && <p className="suave conexoes-vazio">Nenhum agente. Ligue um para a página poder mandar recados a ele.</p>}
          <LigarAgente pagina={p} />
        </div>
      </div>
    </div>
  )
}

function Paginas() {
  const { lista, erro: erroDaLista } = usarPaginas()
  const [erro, setErro] = useState('')

  const acao = useCallback(async (fazer: (api: ApiPaginas) => Promise<unknown>): Promise<void> => {
    const atual = apiPaginas()
    if (!atual) return
    setErro('')
    try {
      exigirOk(await fazer(atual))
    } catch (e) {
      setErro(mensagemDeErroDaPagina(e))
    }
    await recarregarPaginas()
  }, [])

  const ligadas = lista?.ligadas === true
  return (
    <Secao
      id="paginas"
      icone={<AppWindow size={16} />}
      titulo="Páginas próprias"
      frase={
        <>
          Telas feitas por você ou pelo seu time que entram na barra da esquerda pelo botão <b>+</b>. Cada uma roda isolada: não lê seus arquivos nem abre
          programas, e só faz o que você permitiu.
        </>
      }
    >
      <Cartao
        titulo="Chave geral"
        selo={lista ? ligadas ? <Selo tom="vivo">Ligadas</Selo> : <Selo tom="neutro">Desligadas</Selo> : undefined}
        frase={ligadas ? 'Desligar tira todas da barra na hora; nada carrega até você ligar de novo.' : 'Vêm desligadas porque rodam código de fora do Orkester. Ligue para adicionar a primeira.'}
        className="destaque"
        data-cartao-chave-paginas
      >
        <div className="conexoes-chave-linha">
          <label className="conexoes-chave" data-chave-paginas>
            <input type="checkbox" role="switch" checked={ligadas} disabled={!lista} onChange={(e) => void alternarChaveDasPaginas(e.target.checked).then(setErro)} />
            <span>
              <b>{ligadas ? 'Ligadas' : 'Ligar páginas próprias'}</b> <span className="suave">(experimental)</span>
            </span>
          </label>
          <span className="espaco-flex" />
          {ligadas && (
            <button type="button" className="primario" onClick={abrirPainelDePaginas} data-adicionar-pagina-conexoes>
              <Plus size={14} /> Adicionar página…
            </button>
          )}
        </div>
      </Cartao>
      {(erro || erroDaLista) && (
        <p className="conexoes-erro" role="alert">
          {erro || erroDaLista}
        </p>
      )}
      {!lista && !erroDaLista && <p className="suave conexoes-vazio">Lendo…</p>}
      {lista?.soLeitura && (
        <p className="conexoes-erro" role="alert">
          {lista.soLeitura}
        </p>
      )}
      {ligadas && (
        <>
          <div className="conexoes-subtitulo">
            <h4>Instaladas</h4>
            <span className="conexoes-contagem">{lista.paginas.length}</span>
          </div>
          {lista.paginas.length ? (
            <div className="conexoes-lista">
              {lista.paginas.map((p) => (
                <PaginaInstaladaNaLista key={p.id} p={p} acao={acao} />
              ))}
            </div>
          ) : (
            <p className="suave conexoes-vazio conexoes-vazio-caixa">
              Nenhuma página ainda. Clique em <b>Adicionar página…</b>: dá para começar pelo exemplo pronto “Resumo do espaço”.
            </p>
          )}
        </>
      )}
    </Secao>
  )
}

// ---------------------------------------------------------------- a página

/** A última aba aberta: voltar a Conexões cai nela. */
let ultimaAba: AbaDeConexoes = 'chaves'

export function Conexoes() {
  const temPaginas = !!apiPaginas()
  const [aba, setAbaLocal] = useState<AbaDeConexoes>(() => pegarAbaDeConexoes() ?? ultimaAba)
  const setAba = useCallback((a: AbaDeConexoes) => {
    ultimaAba = a
    setAbaLocal(a)
  }, [])
  useEffect(
    () =>
      aoPedirAbaDeConexoes(() => {
        const a = pegarAbaDeConexoes()
        if (a) setAba(a)
      }),
    [setAba]
  )
  useEffect(() => {
    if (temPaginas) iniciarEstadoDasPaginas()
  }, [temPaginas])

  const [mcp, definirMcp] = useState<EstadoMcp>({ comando: null, erro: '' })
  useEffect(() => {
    window.ork.chaves.comandoDoMcp().then(
      (comando) => definirMcp({ comando, erro: '' }),
      (e) => definirMcp({ comando: null, erro: `Não consegui ler como ligar o MCP nesta máquina: ${mensagemDe(e)}` })
    )
  }, [])
  const [chaves, definirChaves] = useState<ChaveNaTela[] | null>(null)
  const [nova, definirNova] = useState<ChaveNova | null>(null)
  const recarregarChaves = useCallback(async (): Promise<void> => definirChaves(await window.ork.chaves.listar()), [])
  const [portais, definirPortais] = useState<ResumoDePortal[] | null>(null)
  const recarregarPortais = useCallback(async (): Promise<void> => definirPortais(await window.ork.portais.listar()), [])
  useEffect(() => {
    void recarregarChaves()
    void recarregarPortais()
  }, [recarregarChaves, recarregarPortais])
  const { lista } = usarPaginas()

  const vivas = chaves ? chaves.filter((k) => !k.revogadaEm).length : null
  const comLogin = portais ? portais.filter((p) => p.temLogin).length : null
  const abas: Array<{ id: AbaDeConexoes; titulo: string; icone: ReactNode; contagem: string | null }> = [
    { id: 'chaves', titulo: 'Chaves', icone: <KeyRound size={14} />, contagem: vivas === null ? null : String(vivas) },
    { id: 'mcp', titulo: 'MCP', icone: <Plug size={14} />, contagem: null },
    ...(temPaginas
      ? [{ id: 'paginas' as const, titulo: 'Páginas', icone: <AppWindow size={14} />, contagem: lista ? (lista.ligadas ? String(lista.paginas.length) : 'desligadas') : null }]
      : []),
    { id: 'credenciais', titulo: 'Credenciais', icone: <Lock size={14} />, contagem: null },
    { id: 'portais', titulo: 'Portais', icone: <Globe size={14} />, contagem: comLogin ? String(comLogin) : null }
  ]
  const atual = aba === 'paginas' && !temPaginas ? 'chaves' : aba

  return (
    <div className="conexoes" data-pagina-geral="conexoes">
      <header className="conexoes-cabecalho">
        <h2>Conexões</h2>
        <p className="suave">O que liga o Orkester ao que está fora dele.</p>
        <div className="conexoes-abas" role="tablist" aria-label="Seções de Conexões">
          {abas.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={atual === a.id}
              className={`conexoes-aba ${atual === a.id ? 'ativo' : ''}`}
              data-conexoes-aba={a.id}
              onClick={() => setAba(a.id)}
            >
              {a.icone} {a.titulo}
              {a.contagem !== null && <span className="conexoes-aba-contagem">{a.contagem}</span>}
            </button>
          ))}
        </div>
      </header>
      <div className="conexoes-corpo" role="tabpanel">
        {atual === 'chaves' && <Chaves mcp={mcp} chaves={chaves} recarregar={recarregarChaves} nova={nova} definirNova={definirNova} />}
        {atual === 'mcp' && <ServidorMcp mcp={mcp} chavesVivas={vivas} irParaChaves={() => setAba('chaves')} />}
        {atual === 'paginas' && <Paginas />}
        {atual === 'credenciais' && <Credenciais />}
        {atual === 'portais' && <Portais portais={portais} recarregar={recarregarPortais} />}
      </div>
    </div>
  )
}
