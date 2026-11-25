import { useState } from 'react'
import { Lock, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { CredencialVisivel, MudancasDaCredencial, TipoDeCredencial } from '../../../../shared/fluxos/credenciais'
import { avisar, confirmar } from '../../ui/Perguntas'
import { CamposDoValor, EscolhaDaEscrita, FormDeCredencial, SelectDeTipo, textoDeGuardada } from './FormDeCredencial'
import {
  avisoDoApagar, avisoDoRenomear, dominiosDoFormulario, dominiosDoTexto, ehApi, faltaParaTrocarValor, mascaraDoValor, oQueE, rotuloDoTipo, SEM_COFRE, seloDaEscrita, semDominio,
  TIPOS_DE_CABECALHO, textoDoApagado, textoDoRenomeado, tituloDoApagar, valorDoFormulario
} from './regrasDeCredenciais'
import { usarCredenciais } from './usarCredenciais'

// Aba APIs de Conexões (1.9.6, F4, era Credenciais; o id da aba continua `credenciais`): o que as páginas e o nó HTTP
// dos fluxos usam para falar com uma API. São GLOBAIS (valem em todos os espaços), cada uma presa aos domínios dela,
// "só lê" ou "lê e escreve", e o valor é cifrado pelo cofre do sistema. Depois de salva, a tela só vê `••••` mais os 4
// últimos caracteres: o valor não volta nem para conferir. Fluxos e páginas chamam a API pelo NOME. Os Segredos (sem
// domínio, só para servidor MCP) não são API: aparecem em Conexões › MCP, com o mesmo cartão daqui.

const data = (iso: string): string => (Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * O cartão "Guardar uma API" (ou, com `tipos={['segredo']}`, "Guardar um segredo" em Conexões › MCP). Sem nenhuma guardada
 * (`jaTem` falso) ele começa aberto (bom estado vazio); com ao menos uma, fica atrás do botão "+ Nova API" para a
 * lista "Suas APIs" aparecer na primeira tela (1.9.7).
 */
export function NovaCredencial({ aoGuardar, titulo = 'Guardar uma API', tipos = TIPOS_DE_CABECALHO, jaTem = false }: { aoGuardar: () => Promise<void>; titulo?: string; tipos?: readonly TipoDeCredencial[]; jaTem?: boolean }) {
  const [feita, setFeita] = useState('')
  const [aberto, setAberto] = useState(false)
  const mostrar = !jaTem || aberto
  return (
    <>
      {mostrar ? (
        <div className="conexoes-cartao destaque" data-credencial-criar>
          <div className="conexoes-cartao-topo">
            <h4 className="conexoes-cartao-titulo">{titulo}</h4>
          </div>
          <FormDeCredencial
            tipos={tipos}
            aoCancelar={jaTem ? () => setAberto(false) : undefined}
            aoCriar={async (c) => {
              setFeita(textoDeGuardada(c))
              setAberto(false)
              await aoGuardar()
            }}
          />
        </div>
      ) : (
        <div className="conexoes-acoes">
          <button type="button" onClick={() => setAberto(true)} data-credencial-nova>
            <Plus size={13} /> Nova API
          </button>
        </div>
      )}
      {feita && (
        <p className="suave conexoes-nota" role="status" data-credencial-guardada>
          {feita}
        </p>
      )}
    </>
  )
}

/** O cartão de uma API (ou de um Segredo, em Conexões › MCP): trocar o valor, editar, apagar. */
export function CartaoDaCredencial({ c, cifra, aoMudar }: { c: CredencialVisivel; cifra: boolean; aoMudar: () => Promise<void> }) {
  const [modo, setModo] = useState<'valor' | 'editar' | null>(null)
  // quem usa a API, lido ao abrir o Editar: o aviso de renomear diz quem para antes do Salvar (null = ainda não sei)
  const [usam, setUsam] = useState<string[] | null>(null)
  const [erro, setErro] = useState('')
  const [v, setV] = useState({ valor: '', usuario: '', senha: '' })
  const doCartao = () => ({ nome: c.nome, tipo: c.tipo, cabecalho: c.cabecalho ?? '', dominios: c.dominios.join('\n'), soLeitura: c.soLeitura === true })
  const [e, setE] = useState(doCartao)
  const o = oQueE(c)
  const api = ehApi(c)
  const selo = seloDaEscrita(c)
  const aviso = avisoDoRenomear(e.nome.trim() !== c.nome, usam)

  const fechar = (): void => {
    setModo(null)
    setErro('')
    setV({ valor: '', usuario: '', senha: '' })
  }

  async function trocarValor(): Promise<void> {
    const falta = faltaParaTrocarValor(c.tipo, v)
    if (falta) return setErro(`Falta: ${falta}.`)
    try {
      const r = await window.ork.credenciais.trocarValor(c.id, valorDoFormulario({ tipo: c.tipo, ...v }))
      if ('erro' in r) return setErro(r.erro)
      fechar()
      await aoMudar()
    } catch (x) {
      setErro(`Não consegui trocar: ${mensagemDe(x)}`)
    }
  }

  async function salvarEdicao(): Promise<void> {
    const dominios = dominiosDoFormulario(e)
    if ('erro' in dominios) return setErro(dominios.erro)
    if (!e.nome.trim()) return setErro(`Falta: dê um nome ${api ? 'à API' : 'ao segredo'}.`)
    if (e.tipo === 'cabecalho' && !e.cabecalho.trim()) return setErro('Falta: diga o nome do cabeçalho.')
    const mudancas: MudancasDaCredencial = {
      nome: e.nome.trim(),
      tipo: e.tipo,
      dominios,
      ...(e.tipo === 'cabecalho' ? { cabecalho: e.cabecalho.trim() } : {}),
      ...(api ? { soLeitura: e.soLeitura } : {})
    }
    try {
      const r = await window.ork.credenciais.editar(c.id, mudancas)
      if ('erro' in r) return setErro(r.erro)
      fechar()
      await aoMudar()
      // o Segredo é citado por id (só servidores): renomear não quebra ninguém
      const renomeado = api && r.credencial.nome !== c.nome ? textoDoRenomeado(c.nome, r.credencial.nome, r.usadaEm ?? []) : null
      if (renomeado) await avisar('API renomeada', renomeado)
    } catch (x) {
      setErro(`Não consegui salvar: ${mensagemDe(x)}`)
    }
  }

  async function apagar(): Promise<void> {
    // falha fechado (como o "Apagar coluna"): sem conferir quem usa, não apaga
    let quem: string[]
    try {
      const q = await window.ork.credenciais.quemUsa(c.id)
      if ('erro' in q) throw new Error(q.erro)
      quem = q.usadaEm
    } catch (x) {
      await avisar(o.nome, `Não consegui conferir quem usa, tente de novo (${mensagemDe(x)}).`)
      return
    }
    const r = await confirmar({
      titulo: tituloDoApagar(c.nome, o.artigo),
      mensagem: avisoDoApagar(quem),
      detalhes: quem.length ? quem : undefined,
      botoes: [
        { rotulo: 'Cancelar', valor: 'nao', primario: true },
        { rotulo: quem.length ? 'Apagar assim mesmo' : 'Apagar', valor: 'sim', perigo: true }
      ]
    })
    if (r.botao !== 'sim') return
    try {
      const res = await window.ork.credenciais.apagar(c.id)
      if ('erro' in res) await avisar(o.nome, `Não apaguei: ${res.erro}`)
      else await avisar(o.nome, textoDoApagado(c.nome, res.usadaEm, o.artigo))
    } catch (x) {
      await avisar(o.nome, `Não apaguei: ${mensagemDe(x)}`)
    }
    await aoMudar()
  }

  // o tipo só troca entre token e cabeçalho: de/para Basic muda a forma do valor (apague e crie de novo)
  const tiposDaEdicao: readonly TipoDeCredencial[] = c.tipo === 'basic' ? ['basic'] : c.tipo === 'segredo' ? ['segredo'] : ['bearer', 'cabecalho']

  return (
    <div className="conexoes-cartao" data-credencial={c.id}>
      <div className="conexoes-cartao-topo">
        <h4 className="conexoes-cartao-titulo">{c.nome}</h4>
        <span className="conexoes-selo neutro">{rotuloDoTipo(c)}</span>
        {api && (
          <span className={`conexoes-selo ${selo.perigo ? 'perigo' : 'vivo'}`} data-credencial-selo-escrita={selo.perigo ? 'escreve' : 'so-le'}>
            {selo.texto}
          </span>
        )}
      </div>
      <p className="credencial-valor" data-credencial-mascara>
        <Lock size={13} aria-hidden /> <code>{mascaraDoValor(c)}</code>
        {!c.fim && <span className="suave"> (valor curto: nem o fim aparece)</span>}
      </p>
      <p className="suave conexoes-detalhe">
        {semDominio(c.tipo) ? (
          'Sem domínio: só vai para variável de ambiente de um servidor MCP de fora, nunca para cabeçalho nem pedido HTTP.'
        ) : (
          <>Só vai por https, para: {c.dominios.map((d) => <code key={d} className="credencial-dominio">{d}</code>)}</>
        )}
        <br />
        guardada {data(c.criadaEm)}
        {c.editadaEm !== c.criadaEm && ` · mexida ${data(c.editadaEm)}`}
      </p>

      {modo === 'valor' && (
        <form
          className="credencial-form"
          onSubmit={(ev) => {
            ev.preventDefault()
            void trocarValor()
          }}
        >
          <CamposDoValor tipo={c.tipo} f={v} mudar={(p) => setV((x) => ({ ...x, ...p }))} />
          <div className="conexoes-acoes">
            <button type="button" onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className="primario">
              Guardar o valor novo
            </button>
          </div>
        </form>
      )}
      {modo === 'editar' && (
        <form
          className="credencial-form"
          onSubmit={(ev) => {
            ev.preventDefault()
            void salvarEdicao()
          }}
        >
          <label className="credencial-campo">
            <span>Nome</span>
            <input aria-label="Nome" maxLength={80} value={e.nome} onChange={(ev) => setE({ ...e, nome: ev.target.value })} />
            <span className={`suave credencial-ajuda${api && aviso.perigo ? ' credencial-atencao' : ''}`} data-credencial-aviso-renomear role={api && aviso.perigo ? 'status' : undefined}>
              {api ? aviso.texto : 'O servidor cita o segredo pelo id: mudar o nome não o quebra.'}
            </span>
          </label>
          {tiposDaEdicao.length > 1 && (
            <label className="credencial-campo">
              <span>Tipo</span>
              <SelectDeTipo valor={e.tipo} so={tiposDaEdicao} mudar={(tipo) => setE({ ...e, tipo })} />
            </label>
          )}
          {e.tipo === 'cabecalho' && (
            <label className="credencial-campo">
              <span>Nome do cabeçalho</span>
              <input aria-label="Nome do cabeçalho" value={e.cabecalho} onChange={(ev) => setE({ ...e, cabecalho: ev.target.value })} />
            </label>
          )}
          {!semDominio(e.tipo) && (
            <label className="credencial-campo">
              <span>Domínios</span>
              <textarea aria-label="Domínios" rows={2} spellCheck={false} value={e.dominios} onChange={(ev) => setE({ ...e, dominios: ev.target.value })} />
              <span className="suave credencial-ajuda">{dominiosDoTexto(e.dominios).length} domínio(s). Um por linha.</span>
            </label>
          )}
          {api && <EscolhaDaEscrita soLeitura={e.soLeitura} mudar={(soLeitura) => setE({ ...e, soLeitura })} />}
          <div className="conexoes-acoes">
            <button type="button" onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className="primario">
              Salvar
            </button>
          </div>
        </form>
      )}
      {erro && (
        <p className="conexoes-erro" role="alert">
          {erro}
        </p>
      )}

      {modo === null && (
        <div className="conexoes-acoes conexoes-acoes-quebra conexoes-acoes-pe">
          <button type="button" disabled={!cifra} title={cifra ? 'Guardar um valor novo, no lugar do atual' : 'Sem o cofre do sistema não dá para guardar valor'} onClick={() => setModo('valor')} data-credencial-trocar={c.id}>
            <RefreshCw size={13} /> Trocar o valor
          </button>
          <button type="button" onClick={() => {
              setE(doCartao())
              setUsam(null)
              if (api) {
                window.ork.credenciais
                  .quemUsa(c.id)
                  .then((q) => setUsam('erro' in q ? null : q.usadaEm))
                  .catch(() => setUsam(null))
              }
              setModo('editar')
            }} data-credencial-editar={c.id}>
            <Pencil size={13} /> Editar
          </button>
          <button type="button" className="perigo" onClick={() => void apagar()} data-credencial-apagar={c.id}>
            <Trash2 size={13} /> Apagar
          </button>
        </div>
      )}
    </div>
  )
}

export function Credenciais() {
  const { lista, erro, recarregar } = usarCredenciais()
  // o Segredo não é API: ele é listado em Conexões › MCP
  const itens = (lista?.itens ?? []).filter(ehApi)
  return (
    <section className="conexoes-secao" data-conexoes-secao="credenciais">
      <div className="conexoes-secao-topo">
        <h3 className="conexoes-secao-titulo">
          <Lock size={16} /> APIs
        </h3>
        <p className="suave conexoes-texto">
          A chave de cada API que as páginas e o nó <b>HTTP</b> dos fluxos usam. Ela fica aqui, cifrada pelo cofre do sistema, vale em todos os espaços, só viaja
          para os domínios que você marcar e, se for <b>só lê</b>, só consulta. Páginas e fluxos chamam a API pelo <b>nome</b>: o valor não entra neles, na execução
          nem no que se copia e cola. Os segredos dos servidores MCP ficam em <b>MCP</b>.
        </p>
      </div>

      {erro && (
        <p className="conexoes-erro" role="alert">
          Não consegui ler as APIs: {erro}
        </p>
      )}
      {lista && !lista.cifraDisponivel && (
        <div className="conexoes-cartao" data-credencial-sem-cofre>
          <div className="conexoes-cartao-topo">
            <h4 className="conexoes-cartao-titulo">Cofre do sistema indisponível</h4>
            <span className="conexoes-selo atencao">Só leitura</span>
          </div>
          <p className="conexoes-texto">{SEM_COFRE}</p>
        </div>
      )}
      {lista?.cifraDisponivel && <NovaCredencial aoGuardar={recarregar} jaTem={!!itens.length} />}

      <div className="conexoes-subtitulo">
        <h4>Suas APIs</h4>
        {lista && <span className="conexoes-contagem">{itens.length}</span>}
      </div>
      {!lista && !erro && <p className="suave conexoes-vazio">Lendo…</p>}
      {lista && !itens.length && (
        <p className="suave conexoes-vazio conexoes-vazio-caixa">Nenhuma API ainda. Guarde uma acima e marque-a numa página ou escolha o nome dela no nó HTTP de um fluxo.</p>
      )}
      {!!itens.length && (
        <div className="conexoes-grade">
          {itens.map((c) => (
            <CartaoDaCredencial key={c.id} c={c} cifra={!!lista?.cifraDisponivel} aoMudar={recarregar} />
          ))}
        </div>
      )}
      <p className="suave conexoes-nota conexoes-rodape">
        O valor só é aberto na hora do pedido, dentro do Orkester, e nunca vai a um agente nem ao <code>ork</code>. Quem mexe no seu usuário do Windows consegue abrir o
        cofre: ele protege o arquivo, não protege contra um programa que já roda como você.
      </p>
    </section>
  )
}
