import { useState } from 'react'
import { Lock, Pencil, RefreshCw, Trash2, Workflow } from 'lucide-react'
import type { CredencialVisivel, MudancasDaCredencial, TipoDeCredencial } from '../../../../shared/fluxos/credenciais'
import { avisar, confirmar } from '../../ui/Perguntas'
import {
  avisoDoApagar, conferirDominios, dominiosDoTexto, faltaParaCriar, faltaParaTrocarValor, FORMULARIO_VAZIO, mascaraDoValor, rotuloDoTipo, SEM_COFRE, textoDoApagado, TIPOS, valorDoFormulario,
  type Formulario
} from './regrasDeCredenciais'
import { usarCredenciais } from './usarCredenciais'

// Aba Credenciais de Conexões (1.9.6, F4): o que o nó HTTP dos fluxos usa para falar com uma API. São GLOBAIS (valem em
// todos os espaços), cada uma presa aos domínios dela, e o valor é cifrado pelo cofre do sistema. Depois de salva, a
// tela só vê `••••` mais os 4 últimos caracteres: o valor não volta nem para conferir. Os fluxos citam a credencial só
// pelo NOME.

const data = (iso: string): string => (Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Campo de valor secreto: a tela nunca o mostra e o navegador não o guarda. */
function CampoSecreto({ rotulo, valor, mudar, placeholder }: { rotulo: string; valor: string; mudar: (v: string) => void; placeholder?: string }) {
  return (
    <input type="password" autoComplete="off" spellCheck={false} aria-label={rotulo} placeholder={placeholder} value={valor} onChange={(e) => mudar(e.target.value)} data-credencial-valor />
  )
}

function CamposDoValor({ tipo, f, mudar }: { tipo: TipoDeCredencial; f: Pick<Formulario, 'valor' | 'usuario' | 'senha'>; mudar: (p: Partial<Formulario>) => void }) {
  if (tipo === 'basic') {
    return (
      <div className="credencial-linha">
        <input aria-label="Usuário" autoComplete="off" placeholder="Usuário" value={f.usuario} onChange={(e) => mudar({ usuario: e.target.value })} />
        <CampoSecreto rotulo="Senha" placeholder="Senha" valor={f.senha} mudar={(senha) => mudar({ senha })} />
      </div>
    )
  }
  return <CampoSecreto rotulo="Valor" placeholder={TIPOS.find((t) => t.id === tipo)?.valor} valor={f.valor} mudar={(valor) => mudar({ valor })} />
}

function SelectDeTipo({ valor, mudar, so }: { valor: TipoDeCredencial; mudar: (t: TipoDeCredencial) => void; so?: readonly TipoDeCredencial[] }) {
  return (
    <select aria-label="Tipo" value={valor} onChange={(e) => mudar(e.target.value as TipoDeCredencial)}>
      {TIPOS.filter((t) => !so || so.includes(t.id)).map((t) => (
        <option key={t.id} value={t.id}>
          {t.rotulo}
        </option>
      ))}
    </select>
  )
}

function Nova({ aoGuardar }: { aoGuardar: () => Promise<void> }) {
  const [f, setF] = useState<Formulario>(FORMULARIO_VAZIO)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [feita, setFeita] = useState('')
  const mudar = (p: Partial<Formulario>): void => setF((x) => ({ ...x, ...p }))

  async function guardar(): Promise<void> {
    setFeita('')
    const falta = faltaParaCriar(f)
    if (falta) return setErro(`Falta: ${falta}.`)
    const dominios = conferirDominios(f.dominios)
    if ('erro' in dominios) return setErro(dominios.erro)
    setErro('')
    setSalvando(true)
    try {
      const r = await window.ork.credenciais.criar({
        nome: f.nome.trim(),
        tipo: f.tipo,
        ...(f.tipo === 'cabecalho' ? { cabecalho: f.cabecalho.trim() } : {}),
        dominios,
        valor: valorDoFormulario(f)
      })
      if ('erro' in r) return setErro(r.erro)
      // o valor sai da memória da tela agora; ele não volta
      setF(FORMULARIO_VAZIO)
      setFeita(`Credencial "${r.credencial.nome}" guardada. O valor não aparece de novo: só ${mascaraDoValor(r.credencial)}.`)
      await aoGuardar()
    } catch (e) {
      setErro(`Não consegui guardar: ${mensagemDe(e)}`)
    } finally {
      setSalvando(false)
    }
  }

  const ajuda = TIPOS.find((t) => t.id === f.tipo)?.ajuda
  return (
    <div className="conexoes-cartao destaque" data-credencial-criar>
      <div className="conexoes-cartao-topo">
        <h4 className="conexoes-cartao-titulo">Guardar uma credencial</h4>
      </div>
      <form
        className="credencial-form"
        onSubmit={(e) => {
          e.preventDefault()
          void guardar()
        }}
      >
        <label className="credencial-campo">
          <span>Nome</span>
          <input aria-label="Nome da credencial" maxLength={80} placeholder='Como os fluxos vão citar ("API de cotação")' value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} />
        </label>
        <label className="credencial-campo">
          <span>Tipo</span>
          <SelectDeTipo valor={f.tipo} mudar={(tipo) => mudar({ tipo, valor: '', usuario: '', senha: '' })} />
          {ajuda && <span className="suave credencial-ajuda">{ajuda}</span>}
        </label>
        {f.tipo === 'cabecalho' && (
          <label className="credencial-campo">
            <span>Nome do cabeçalho</span>
            <input aria-label="Nome do cabeçalho" placeholder="X-Api-Key" value={f.cabecalho} onChange={(e) => mudar({ cabecalho: e.target.value })} />
          </label>
        )}
        <label className="credencial-campo">
          <span>Domínios onde ela pode ir</span>
          <textarea aria-label="Domínios" rows={2} spellCheck={false} placeholder={'api.exemplo.com\n*.exemplo.org'} value={f.dominios} onChange={(e) => mudar({ dominios: e.target.value })} />
          <span className="suave credencial-ajuda">
            Um por linha. <code>*.exemplo.org</code> vale para os subdomínios. Só vai por <b>https</b>, e para qualquer outro endereço o Orkester recusa levá-la.
          </span>
        </label>
        <div className="credencial-campo">
          <span>{f.tipo === 'basic' ? 'Usuário e senha' : 'Valor'}</span>
          <CamposDoValor tipo={f.tipo} f={f} mudar={mudar} />
        </div>
        <div className="conexoes-acoes">
          <button className="primario" type="submit" disabled={salvando}>
            <Lock size={13} /> Guardar cifrada
          </button>
        </div>
      </form>
      {erro && (
        <p className="conexoes-erro" role="alert">
          {erro}
        </p>
      )}
      {feita && (
        <p className="suave conexoes-nota" role="status" data-credencial-guardada>
          {feita}
        </p>
      )}
    </div>
  )
}

function Cartao({ c, cifra, aoMudar }: { c: CredencialVisivel; cifra: boolean; aoMudar: () => Promise<void> }) {
  const [modo, setModo] = useState<'valor' | 'editar' | null>(null)
  const [erro, setErro] = useState('')
  const [v, setV] = useState({ valor: '', usuario: '', senha: '' })
  const [e, setE] = useState({ nome: c.nome, tipo: c.tipo, cabecalho: c.cabecalho ?? '', dominios: c.dominios.join('\n') })

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
    const dominios = conferirDominios(e.dominios)
    if ('erro' in dominios) return setErro(dominios.erro)
    if (!e.nome.trim()) return setErro('Falta: dê um nome à credencial.')
    if (e.tipo === 'cabecalho' && !e.cabecalho.trim()) return setErro('Falta: diga o nome do cabeçalho.')
    const mudancas: MudancasDaCredencial = { nome: e.nome.trim(), tipo: e.tipo, dominios, ...(e.tipo === 'cabecalho' ? { cabecalho: e.cabecalho.trim() } : {}) }
    try {
      const r = await window.ork.credenciais.editar(c.id, mudancas)
      if ('erro' in r) return setErro(r.erro)
      fechar()
      await aoMudar()
    } catch (x) {
      setErro(`Não consegui salvar: ${mensagemDe(x)}`)
    }
  }

  async function apagar(): Promise<void> {
    const r = await confirmar({
      titulo: `Apagar a credencial "${c.nome}"?`,
      mensagem: avisoDoApagar(c.nome),
      botoes: [
        { rotulo: 'Cancelar', valor: 'nao', primario: true },
        { rotulo: 'Apagar', valor: 'sim', perigo: true }
      ]
    })
    if (r.botao !== 'sim') return
    try {
      const res = await window.ork.credenciais.apagar(c.id)
      if ('erro' in res) await avisar('Credenciais', `Não apaguei: ${res.erro}`)
      else await avisar('Credenciais', textoDoApagado(c.nome, res.usadaEm))
    } catch (x) {
      await avisar('Credenciais', `Não apaguei: ${mensagemDe(x)}`)
    }
    await aoMudar()
  }

  // o tipo só troca entre token e cabeçalho: de/para Basic muda a forma do valor (apague e crie de novo)
  const tiposDaEdicao: readonly TipoDeCredencial[] = c.tipo === 'basic' ? ['basic'] : ['bearer', 'cabecalho']

  return (
    <div className="conexoes-cartao" data-credencial={c.id}>
      <div className="conexoes-cartao-topo">
        <h4 className="conexoes-cartao-titulo">{c.nome}</h4>
        <span className="conexoes-selo neutro">{rotuloDoTipo(c)}</span>
      </div>
      <p className="credencial-valor" data-credencial-mascara>
        <Lock size={13} aria-hidden /> <code>{mascaraDoValor(c)}</code>
        {!c.fim && <span className="suave"> (valor curto: nem o fim aparece)</span>}
      </p>
      <p className="suave conexoes-detalhe">
        Só vai por https, para: {c.dominios.map((d) => <code key={d} className="credencial-dominio">{d}</code>)}
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
            <span className="suave credencial-ajuda">Mudar o nome faz os fluxos que citam o antigo darem erro: edite os nós HTTP deles.</span>
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
          <label className="credencial-campo">
            <span>Domínios</span>
            <textarea aria-label="Domínios" rows={2} spellCheck={false} value={e.dominios} onChange={(ev) => setE({ ...e, dominios: ev.target.value })} />
            <span className="suave credencial-ajuda">{dominiosDoTexto(e.dominios).length} domínio(s). Um por linha.</span>
          </label>
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
              setE({ nome: c.nome, tipo: c.tipo, cabecalho: c.cabecalho ?? '', dominios: c.dominios.join('\n') })
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
  const itens = lista?.itens ?? []
  return (
    <section className="conexoes-secao" data-conexoes-secao="credenciais">
      <div className="conexoes-secao-topo">
        <h3 className="conexoes-secao-titulo">
          <Workflow size={16} /> Credenciais dos fluxos
        </h3>
        <p className="suave conexoes-texto">
          O nó <b>HTTP</b> dos fluxos pode levar uma senha ou um token. Eles ficam aqui, cifrados pelo cofre do sistema, valem em todos os espaços e só viajam para os
          domínios que você marcar. O fluxo guarda apenas o <b>nome</b> da credencial: o valor não entra no fluxo, na execução nem no que se copia e cola.
        </p>
      </div>

      {erro && (
        <p className="conexoes-erro" role="alert">
          Não consegui ler as credenciais: {erro}
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
      {lista?.cifraDisponivel && <Nova aoGuardar={recarregar} />}

      <div className="conexoes-subtitulo">
        <h4>Suas credenciais</h4>
        {lista && <span className="conexoes-contagem">{itens.length}</span>}
      </div>
      {!lista && !erro && <p className="suave conexoes-vazio">Lendo…</p>}
      {lista && !itens.length && <p className="suave conexoes-vazio conexoes-vazio-caixa">Nenhuma credencial ainda. Guarde uma acima e escolha o nome dela no nó HTTP de um fluxo.</p>}
      {!!itens.length && (
        <div className="conexoes-grade">
          {itens.map((c) => (
            <Cartao key={c.id} c={c} cifra={!!lista?.cifraDisponivel} aoMudar={recarregar} />
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
