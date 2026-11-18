import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, Globe, KeyRound, Plug, Trash2, Wrench } from 'lucide-react'
import { comecoParaTela, configuracoesDoMcp, type ComandoDoMcp, type ConfiguracoesDoMcp } from '../../../../shared/chaves'
import { listarFerramentas } from '../../../../shared/ferramentasMcp'
import type { ResumoDePortal } from '../../../../shared/portais'
import { avisar, confirmar } from '../../ui/Perguntas'
import '../../estilos/conexoes.css'

// Conexões (página geral): tudo o que liga o Orkester ao que está fora dele, numa tela só — as chaves que deixam
// um cliente de fora (o Claude do usuário, o Codex) mexer no quadro, o comando para ligar o MCP do Orkester com a
// lista do que ele faz, e os portais do navegador embutido, onde os logins ficam guardados.
// Só mostra e organiza o que já existe: o cofre de chaves é main/chaves.ts, as ferramentas são as do servidor
// (shared/ferramentasMcp.ts) e os portais são a partição do Electron (main/portais.ts).

type ChaveNaTela = Awaited<ReturnType<typeof window.ork.chaves.listar>>[number]
type Formato = keyof ConfiguracoesDoMcp

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

function Secao({ id, icone, titulo, children }: { id: string; icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <section className="conexoes-secao" data-conexoes-secao={id}>
      <h3 className="conexoes-secao-titulo">
        {icone} {titulo}
      </h3>
      {children}
    </section>
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

function Chaves({ mcp }: { mcp: EstadoMcp }) {
  const [chaves, definirChaves] = useState<ChaveNaTela[] | null>(null)
  const [nome, definirNome] = useState('')
  const [erro, definirErro] = useState('')
  // `config` nula = o comando não pôde ser montado; aí o `segredo` fica à mostra no lugar dele (só neste caso, e some junto com `nova`)
  const [nova, definirNova] = useState<{ nome: string; config: ConfiguracoesDoMcp | null; segredo: string } | null>(null)

  const recarregar = useCallback(async (): Promise<void> => definirChaves(await window.ork.chaves.listar()), [])
  useEffect(() => {
    void recarregar()
  }, [recarregar])

  async function gerar(): Promise<void> {
    definirErro('')
    try {
      const criada = await window.ork.chaves.criar(nome)
      if ('erro' in criada) return definirErro(criada.erro)
      // a chave já está gravada: mesmo que o comando não saia (ainda lendo, ou caminho que não dá para escapar), ela aparece
      const { config, erro: porque } = mcp.comando
        ? montarConfig(criada.segredo, mcp.comando)
        : { config: null, erro: mcp.erro || 'Ainda não sei como ligar o MCP nesta máquina.' }
      definirNova({ nome: criada.nome, config, segredo: config ? '' : criada.segredo })
      if (!config) definirErro(`${porque} Copie a chave abaixo e use-a no comando da seção "MCP do Orkester".`)
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
    <Secao id="chaves" icone={<KeyRound size={15} />} titulo="Chaves">
      <p className="suave conexoes-texto">
        Uma chave deixa um cliente de fora — o seu Claude, o Codex, outra sessão — ler o quadro, abrir agentes, subir times salvos e importar fichas, como se
        fosse você pela tela. O Orkester precisa estar aberto. A chave não protege contra programas que já rodam na sua máquina; ela serve para você saber quem
        fez o quê e cortar o acesso quando quiser. Aqui aparece só o <b>começo</b> de cada chave: a inteira existe uma vez, na hora de criar.
      </p>

      {nova ? (
        <div className="conexoes-nova" data-chave-nova>
          <p className="conexoes-texto">
            Chave <b>{nova.nome}</b> criada. <b>Copie agora:</b> ela não aparece de novo — nem o Orkester a guarda, só uma impressão digital dela.
          </p>
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
        </div>
      ) : (
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
      )}
      {erro && <p className="conexoes-erro" role="alert">{erro}</p>}

      <div className="conexoes-lista">
        {vivas.map((k) => (
          <div key={k.id} className="conexoes-linha" data-chave={k.id}>
            <div className="conexoes-linha-dados">
              <span className="conexoes-linha-nome">{k.nome}</span>
              <span className="conexoes-linha-detalhe suave">
                <code>{comecoParaTela(k.comeco)}</code> · criada {data(k.criadaEm)} · {k.usadaEm ? `último uso ${dataEHora(k.usadaEm)}` : 'nunca usada'}
              </span>
            </div>
            <button type="button" className="conexoes-icone perigo" title={`Revogar a chave "${k.nome}"`} aria-label={`Revogar a chave ${k.nome}`} onClick={() => void revogar(k)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {chaves && !vivas.length && !nova && <p className="suave conexoes-vazio">Nenhuma chave ainda.</p>}
        {!chaves && <p className="suave conexoes-vazio">Lendo…</p>}
        {!!revogadas.length && (
          <p className="suave conexoes-vazio">
            {revogadas.length} revogada(s): {revogadas.map((k) => k.nome).join(', ')}.
          </p>
        )}
      </div>
    </Secao>
  )
}

function ServidorMcp({ mcp }: { mcp: EstadoMcp }) {
  const ferramentas = useMemo(() => listarFerramentas(), [])
  const { config, erro } = useMemo(() => (mcp.comando ? montarConfig(NO_LUGAR_DA_CHAVE, mcp.comando) : { config: null, erro: mcp.erro }), [mcp])
  return (
    <Secao id="mcp" icone={<Plug size={15} />} titulo="MCP do Orkester">
      <p className="suave conexoes-texto">
        O comando abaixo liga o servidor MCP do Orkester ao seu cliente. Troque <code>{NO_LUGAR_DA_CHAVE}</code> por uma das chaves acima (a inteira só aparece
        quando você a cria).
      </p>
      {config ? (
        <ConfigDoMcp config={config} />
      ) : erro ? (
        <p className="conexoes-erro" role="alert">
          {erro}
        </p>
      ) : (
        <p className="suave conexoes-vazio">Lendo…</p>
      )}
      <h4 className="conexoes-subtitulo">
        <Wrench size={13} /> O que ele faz ({ferramentas.length} ferramentas)
      </h4>
      <ul className="conexoes-ferramentas">
        {ferramentas.map((f) => (
          <li key={f.nome} data-ferramenta={f.nome}>
            <code>{f.nome}</code>
            <span className="suave">{f.resumo}</span>
          </li>
        ))}
      </ul>
    </Secao>
  )
}

function Portais() {
  const [portais, definirPortais] = useState<ResumoDePortal[] | null>(null)
  const recarregar = useCallback(async (): Promise<void> => definirPortais(await window.ork.portais.listar()), [])
  useEffect(() => {
    void recarregar()
  }, [recarregar])

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
    <Secao id="portais" icone={<Globe size={15} />} titulo="Portais">
      <p className="suave conexoes-texto">
        O navegador embutido dos cartões de portal guarda os logins dos sites numa área própria, separada do seu navegador. Quando o PC tem Chrome ou Edge, o
        Orkester usa o Chrome dele; este é o navegador de reserva.
      </p>
      <div className="conexoes-lista">
        {(portais ?? []).map((p) => (
          <div key={p.particao} className="conexoes-linha" data-portal={p.particao}>
            <div className="conexoes-linha-dados">
              <span className="conexoes-linha-nome">{p.nome}</span>
              <span className="conexoes-linha-detalhe suave">
                {p.temLogin
                  ? `login guardado em ${p.sites.length} site(s): ${p.sites.slice(0, 6).join(', ')}${p.sites.length > 6 ? '…' : ''}`
                  : p.cookies
                    ? `${p.cookies} cookie(s) só da sessão atual; nenhum login guardado`
                    : 'nenhum cookie de login guardado'}
              </span>
            </div>
            <button type="button" className="conexoes-botao perigo" title="Apaga cookies e dados guardados dos sites, mesmo os que não aparecem na lista" onClick={() => void limpar(p)}>
              <Trash2 size={13} /> Limpar login
            </button>
          </div>
        ))}
        {!portais && <p className="suave conexoes-vazio">Lendo…</p>}
      </div>
    </Secao>
  )
}

export function Conexoes() {
  const [mcp, definirMcp] = useState<EstadoMcp>({ comando: null, erro: '' })
  useEffect(() => {
    window.ork.chaves.comandoDoMcp().then(
      (comando) => definirMcp({ comando, erro: '' }),
      (e) => definirMcp({ comando: null, erro: `Não consegui ler como ligar o MCP nesta máquina: ${mensagemDe(e)}` })
    )
  }, [])
  return (
    <div className="conexoes" data-pagina-geral="conexoes">
      <header className="conexoes-cabecalho">
        <h2>Conexões</h2>
        <p className="suave">O que liga o Orkester ao que está fora dele: as chaves, o servidor MCP e os logins dos portais.</p>
      </header>
      <div className="conexoes-corpo">
        <Chaves mcp={mcp} />
        <ServidorMcp mcp={mcp} />
        <Portais />
      </div>
    </div>
  )
}
