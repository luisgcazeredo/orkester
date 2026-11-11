import { useEffect, useState, useSyncExternalStore } from 'react'
import { Check, Copy, KeyRound, Trash2 } from 'lucide-react'
import { configuracoesDoMcp, type ConfiguracoesDoMcp } from '../../../shared/chaves'
import { Dialogo } from './Dialogo'
import { confirmar } from './Perguntas'

// Configurações do app. Hoje, uma coisa só: as chaves MCP — o jeito de um cliente de fora (o Claude do
// usuário, o Codex, outra sessão) mexer no quadro sem ter cartão nele. O que é uma chave e o que ela não é
// está em shared/chaves.ts; aqui só a tela.

let aberto = false
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

export function abrirConfiguracoes(): void {
  aberto = true
  avisar()
}

function fechar(): void {
  aberto = false
  avisar()
}

type ChaveNaTela = Awaited<ReturnType<typeof window.ork.chaves.listar>>[number]
type Formato = keyof ConfiguracoesDoMcp

const FORMATOS: Array<[Formato, string, string]> = [
  ['claudeCode', 'Claude Code', 'Cole no terminal. Vale para todos os seus projetos.'],
  ['json', 'Claude Desktop / .mcp.json', 'Cole dentro de "mcpServers" na configuração do Claude Desktop, ou no .mcp.json de um projeto.'],
  ['codex', 'Codex', 'Cole no fim do ~/.codex/config.toml.']
]

const data = (iso?: string): string => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

function Editor() {
  const [chaves, definirChaves] = useState<ChaveNaTela[]>([])
  const [nome, definirNome] = useState('')
  const [erro, definirErro] = useState('')
  const [nova, definirNova] = useState<{ nome: string; config: ConfiguracoesDoMcp } | null>(null)
  const [formato, definirFormato] = useState<Formato>('claudeCode')
  const [copiado, definirCopiado] = useState(false)

  const recarregar = async (): Promise<void> => definirChaves(await window.ork.chaves.listar())
  useEffect(() => {
    void recarregar()
  }, [])

  async function gerar(): Promise<void> {
    definirErro('')
    const criada = await window.ork.chaves.criar(nome)
    if ('erro' in criada) return definirErro(criada.erro)
    try {
      const mcp = await window.ork.chaves.comandoDoMcp()
      definirNova({ nome: criada.nome, config: configuracoesDoMcp(criada.segredo, mcp) })
      definirFormato('claudeCode')
      definirNome('')
    } catch (e) {
      definirErro(e instanceof Error ? e.message : String(e))
    }
    await recarregar()
  }

  async function copiar(): Promise<void> {
    if (!nova) return
    await navigator.clipboard.writeText(nova.config[formato])
    definirCopiado(true)
    setTimeout(() => definirCopiado(false), 1500)
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

  const vivas = chaves.filter((k) => !k.revogadaEm)
  const revogadas = chaves.filter((k) => k.revogadaEm)

  return (
    <Dialogo titulo="Configurações" aoFechar={fechar}>
      <div className="configuracoes">
        <h3 className="configuracoes-titulo">
          <KeyRound size={15} /> Chaves MCP
        </h3>
        <p className="dialogo-texto suave">
          Uma chave deixa um cliente de fora — o seu Claude, o Codex, outra sessão — ler o quadro, abrir agentes, subir
          times salvos e importar fichas, como se fosse você pela tela. O Orkester precisa estar aberto. A chave não
          protege contra programas que já rodam na sua máquina; ela serve para você saber quem fez o quê e cortar o
          acesso quando quiser.
        </p>

        {nova ? (
          <div className="chave-nova" data-chave-nova>
            <p className="dialogo-texto">
              Chave <b>{nova.nome}</b> criada. <b>Copie agora:</b> ela não aparece de novo — nem o Orkester a guarda,
              só uma impressão digital dela.
            </p>
            <div className="chave-formatos">
              {FORMATOS.map(([id, rotulo]) => (
                <button key={id} className={`chave-formato ${formato === id ? 'ativo' : ''}`} onClick={() => definirFormato(id)}>
                  {rotulo}
                </button>
              ))}
            </div>
            <p className="dialogo-texto suave">{FORMATOS.find(([id]) => id === formato)?.[2]}</p>
            <pre className="chave-config" data-formato={formato}>
              {nova.config[formato]}
            </pre>
            <div className="dialogo-acoes">
              <button onClick={() => void copiar()}>
                {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
              <span className="espaco-flex" />
              <button className="primario" onClick={() => definirNova(null)}>
                Já copiei
              </button>
            </div>
          </div>
        ) : (
          <form
            className="chave-gerar"
            onSubmit={(e) => {
              e.preventDefault()
              void gerar()
            }}
          >
            <input
              value={nome}
              placeholder='Para quem é ("Claude Desktop", "notebook")'
              maxLength={60}
              onChange={(e) => definirNome(e.target.value)}
            />
            <button className="primario" type="submit" disabled={!nome.trim()}>
              Gerar chave
            </button>
          </form>
        )}
        {erro && <p className="dialogo-texto erro">{erro}</p>}

        <div className="chaves">
          {vivas.map((k) => (
            <div key={k.id} className="chave-linha" data-chave={k.id}>
              <div className="partitura-dados">
                <span className="partitura-nome">{k.nome}</span>
                <span className="partitura-resumo suave">
                  {k.comeco}… · criada {data(k.criadaEm)} · {k.usadaEm ? `usada ${data(k.usadaEm)}` : 'nunca usada'}
                </span>
              </div>
              <button className="preset-apagar" title="Revogar esta chave" onClick={() => void revogar(k)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!vivas.length && !nova && <p className="dialogo-texto suave">Nenhuma chave ainda.</p>}
          {!!revogadas.length && (
            <p className="dialogo-texto suave">
              {revogadas.length} revogada(s): {revogadas.map((k) => k.nome).join(', ')}.
            </p>
          )}
        </div>
      </div>
      <div className="dialogo-acoes">
        <span className="espaco-flex" />
        <button className="primario" onClick={fechar}>
          Fechar
        </button>
      </div>
    </Dialogo>
  )
}

export function Configuracoes() {
  const visivel = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => aberto
  )
  return visivel ? <Editor /> : null
}
