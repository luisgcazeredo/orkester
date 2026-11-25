// Formulário do nó "Ferramenta MCP" (1.9.7, C3b): o servidor (de Conexões › MCP), depois a ferramenta (as conhecidas, sem
// subir nada; "Atualizar" testa o servidor e relê), depois os campos que o esquema da ferramenta pede. O formulário
// GERA o texto de `argumentos` (um objeto JSON que aceita `{{ }}`); o que o esquema não cobre vai num campo JSON, e um texto
// que já não é um objeto JSON válido (escrito por um agente) abre inteiro para consertar. A ferramenta que mudou desde a
// última revisão aparece marcada: o motor a recusa até o usuário rever em Conexões › MCP.
import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { FerramentaMcp, ResumoDeServidorMcp } from '../../../../../shared/api'
import { Campo, NOTA_DE_EXPRESSAO, ref, texto, type PropsDoFormulario } from './comum'
import { rotuloDaFerramenta } from '../../conexoes/regrasDeServidores'
import { camposDoEsquema, lerArgumentos, objetoDosCampos, textoDosArgumentos, valoresDosCampos, type CampoDoEsquema } from './mcpArgumentos'
import '../../../estilos/fluxos-fora.css'
import '../../../estilos/conexoes.css'

const MAX_ARGUMENTOS = 20_000

/** O rótulo de risco na opção do seletor: a palavra do servidor, curta (a completa vem abaixo do seletor). */
const riscoNaOpcao = (f: FerramentaMcp): string => (rotuloDaFerramenta(f).perigo ? 'pode mudar coisas' : 'diz que só lê')

function CampoDaFerramenta({ campo, valor, mudar, somenteLer }: { campo: CampoDoEsquema; valor: string; mudar: (v: string) => void; somenteLer: boolean }) {
  const nome = `${campo.nome}${campo.obrigatorio ? ' *' : ''}`
  // a descrição é do servidor, não do Orkester: vai marcada como fala dele
  const nota = campo.descricao ? <>o servidor diz: <em>“{campo.descricao}”</em></> : undefined
  if (campo.tipo === 'booleano')
    return (
      <Campo rotulo={nome} nota={nota}>
        <select aria-label={campo.nome} value={valor} disabled={somenteLer} onChange={(e) => mudar(e.target.value)}>
          <option value="">(não mandar)</option>
          {/^\{\{/.test(valor) && <option value={valor}>expressão: {valor}</option>}
          <option value="true">sim</option>
          <option value="false">não</option>
        </select>
      </Campo>
    )
  if (campo.tipo === 'escolha')
    return (
      <Campo rotulo={nome} nota={nota}>
        <select aria-label={campo.nome} value={valor} disabled={somenteLer} onChange={(e) => mudar(e.target.value)}>
          <option value="">(não mandar)</option>
          {valor && !campo.opcoes?.includes(valor) && <option value={valor}>{valor}</option>}
          {campo.opcoes?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Campo>
    )
  if (campo.tipo === 'lista-texto' || campo.tipo === 'lista-numero')
    return (
      <Campo rotulo={nome} nota={<>{nota ? <>{nota} · </> : null}um por linha; uma linha só com {'{{ expressão }}'} vale como a lista inteira</>}>
        <textarea aria-label={campo.nome} className="ed-mono" rows={3} value={valor} disabled={somenteLer} onChange={(e) => mudar(e.target.value)} />
      </Campo>
    )
  return (
    <Campo rotulo={nome} nota={nota}>
      <input aria-label={campo.nome} className={campo.tipo === 'numero' ? 'ed-mono' : undefined} inputMode={campo.tipo === 'numero' ? 'decimal' : undefined} value={valor} disabled={somenteLer} onChange={(e) => mudar(e.target.value.replace(/[\r\n]+/g, ' '))} />
    </Campo>
  )
}

export function FormMcp({ ajustes, mudar, somenteLer }: PropsDoFormulario) {
  const servidor = ref(ajustes.servidor) ?? { id: '', nome: '' }
  const ferramenta = texto(ajustes.ferramenta)
  const argumentos = texto(ajustes.argumentos)
  const [servidores, setServidores] = useState<ResumoDeServidorMcp[] | null>(null)
  const [ferramentas, setFerramentas] = useState<FerramentaMcp[] | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [extraTexto, setExtraTexto] = useState('')
  const [erroDoExtra, setErroDoExtra] = useState('')

  useEffect(() => {
    let vivo = true
    window.ork.mcpFora.listar().then(
      (l) => vivo && setServidores(l),
      () => vivo && setServidores([])
    )
    return () => {
      vivo = false
    }
  }, [])
  useEffect(() => {
    setFerramentas(null)
    setErro('')
    if (!servidor.id) return
    let vivo = true
    window.ork.mcpFora.ferramentas(servidor.id).then(
      (l) => vivo && setFerramentas(l),
      () => vivo && setFerramentas([])
    )
    return () => {
      vivo = false
    }
  }, [servidor.id])

  const atual = ferramentas?.find((f) => f.nome === ferramenta)
  const { campos, usavel } = useMemo(() => camposDoEsquema(atual?.esquema), [atual])
  const lido = useMemo(() => lerArgumentos(argumentos), [argumentos])
  const dividido = useMemo(() => (lido.ok ? valoresDosCampos(campos, lido.objeto) : null), [lido, campos])
  // o campo JSON "outros" acompanha o texto, menos enquanto a pessoa digita nele (aí ele manda)
  const extraDoTexto = dividido ? (Object.keys(dividido.extra).length ? textoDosArgumentos(dividido.extra) : '') : ''
  const chaveDaFerramenta = `${servidor.id}|${ferramenta}`
  useEffect(() => {
    setExtraTexto(extraDoTexto)
    setErroDoExtra('')
    // só ao trocar de ferramenta ou de nó: reescrever a cada tecla tiraria o cursor do campo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaFerramenta])

  const gravar = (objeto: Record<string, unknown>): void => mudar({ ...ajustes, argumentos: textoDosArgumentos(objeto) })
  const escolherServidor = (id: string): void => {
    const s = servidores?.find((x) => x.id === id)
    if (!s) return
    mudar({ ...ajustes, servidor: { id: s.id, nome: s.nome }, ferramenta: '', argumentos: '{}' })
  }
  const escolherFerramenta = (nome: string): void => mudar({ ...ajustes, ferramenta: nome, argumentos: '{}' })
  const atualizar = async (): Promise<void> => {
    if (!servidor.id) return
    setOcupado(true)
    setErro('')
    try {
      const r = await window.ork.mcpFora.testar(servidor.id)
      if (r.ok) setFerramentas(r.ferramentas)
      else setErro(r.erro)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setOcupado(false)
  }

  const conhecido = !!servidores?.some((s) => s.id === servidor.id)
  const doServidor = servidores?.find((s) => s.id === servidor.id)
  return (
    <>
      <Campo rotulo="Servidor" nota={servidores && servidores.length === 0 ? 'Nenhum servidor cadastrado: cadastre em Conexões › MCP.' : 'Os servidores de fora cadastrados em Conexões › MCP.'}>
        <select aria-label="Servidor MCP" value={servidor.id} disabled={somenteLer || !servidores} onChange={(e) => escolherServidor(e.target.value)} data-mcp-servidor>
          {!servidor.id && <option value="">(escolha)</option>}
          {servidor.id && servidores && !conhecido && <option value={servidor.id}>{servidor.nome || servidor.id} (não existe mais)</option>}
          {servidores?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
              {s.pausado ? ' (pausado)' : s.situacao === 'precisa-login' ? ' (precisa de login)' : ''}
            </option>
          ))}
        </select>
      </Campo>
      {doServidor?.pausado && <p className="suave ed-nota">Este servidor está pausado: o fluxo dá erro até você religá-lo em Conexões › MCP.</p>}
      {servidor.id && (
        <Campo rotulo="Ferramenta">
          <div className="ed-linha">
            <select aria-label="Ferramenta" className="ed-cresce" value={ferramenta} disabled={somenteLer || !ferramentas} onChange={(e) => escolherFerramenta(e.target.value)} data-mcp-ferramenta>
              {!ferramenta && <option value="">(escolha)</option>}
              {ferramenta && ferramentas && !atual && <option value={ferramenta}>{ferramenta} (não está na lista)</option>}
              {ferramentas?.map((f) => (
                <option key={f.nome} value={f.nome}>
                  {f.nome} · {riscoNaOpcao(f)}
                  {f.bloqueada ? ' (bloqueada)' : ''}
                </option>
              ))}
            </select>
            {!somenteLer && (
              <button type="button" className="ed-botao" disabled={ocupado} onClick={() => void atualizar()} title="Sobe o servidor e relê as ferramentas dele" data-mcp-atualizar>
                <RefreshCw size={14} aria-hidden /> {ocupado ? 'Lendo…' : 'Atualizar'}
              </button>
            )}
          </div>
        </Campo>
      )}
      {ferramentas && ferramentas.length === 0 && !erro && <p className="suave ed-nota">Nenhuma ferramenta conhecida ainda: use Atualizar para subir o servidor e ler as dele.</p>}
      {erro && (
        <p className="conexoes-erro" role="alert">
          {erro}
        </p>
      )}
      {/* a opção do seletor já diz "diz que só lê"; abaixo, só o aviso vermelho da que pode mudar coisas */}
      {atual && rotuloDaFerramenta(atual).perigo && (
        <p className="servidor-rotulo perigo" data-mcp-risco="muda">
          {rotuloDaFerramenta(atual).texto}
        </p>
      )}
      {atual?.bloqueada && (
        <p className="conexoes-erro" role="alert" data-mcp-bloqueada>
          Esta ferramenta mudou desde a última revisão. O fluxo dá erro até você rever em Conexões › MCP.
        </p>
      )}
      {atual?.descricao && (
        <p className="suave ed-nota">
          o servidor diz: <em>“{atual.descricao.slice(0, 400)}”</em>
        </p>
      )}

      {ferramenta && (
        <>
          <p className="suave ed-nota">{NOTA_DE_EXPRESSAO}</p>
          {!lido.ok ? (
            <Campo rotulo="Argumentos (JSON)" nota="Não é um objeto JSON válido: conserte aqui.">
              <textarea aria-label="Argumentos" className="ed-mono" rows={6} maxLength={MAX_ARGUMENTOS} value={argumentos} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, argumentos: e.target.value })} data-mcp-argumentos />
            </Campo>
          ) : usavel && atual && dividido ? (
            <>
              {campos
                .filter((c) => c.tipo !== 'json')
                .map((c) => (
                  <CampoDaFerramenta
                    key={c.nome}
                    campo={c}
                    valor={dividido.valores[c.nome] ?? ''}
                    somenteLer={somenteLer}
                    mudar={(v) => gravar(objetoDosCampos(campos, { ...dividido.valores, [c.nome]: v }, dividido.extra))}
                  />
                ))}
              {(campos.some((c) => c.tipo === 'json') || Object.keys(dividido.extra).length > 0 || extraTexto) && (
                <Campo rotulo="Outros campos (JSON)" nota={erroDoExtra || 'O que o formulário não cobre: objetos e listas de objetos. Um objeto JSON com os nomes dos campos.'}>
                  <textarea
                    aria-label="Outros campos"
                    className="ed-mono"
                    rows={4}
                    value={extraTexto}
                    disabled={somenteLer}
                    maxLength={MAX_ARGUMENTOS}
                    onChange={(e) => {
                      setExtraTexto(e.target.value)
                      const l = lerArgumentos(e.target.value)
                      if (!l.ok) return setErroDoExtra('JSON incompleto: ainda não foi gravado.')
                      setErroDoExtra('')
                      gravar(objetoDosCampos(campos, dividido.valores, l.objeto))
                    }}
                    data-mcp-extra
                  />
                </Campo>
              )}
            </>
          ) : (
            <Campo rotulo="Argumentos (JSON)" nota={atual ? 'A ferramenta não descreve campos: escreva o objeto JSON.' : 'Escolha uma ferramenta da lista para ver os campos dela, ou escreva o objeto JSON.'}>
              <textarea aria-label="Argumentos" className="ed-mono" rows={6} maxLength={MAX_ARGUMENTOS} value={argumentos} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, argumentos: e.target.value })} data-mcp-argumentos />
            </Campo>
          )}
          <details className="ed-detalhe">
            <summary>Ver o texto dos argumentos</summary>
            <pre className="ed-mono">{argumentos || '{}'}</pre>
          </details>
        </>
      )}
    </>
  )
}
