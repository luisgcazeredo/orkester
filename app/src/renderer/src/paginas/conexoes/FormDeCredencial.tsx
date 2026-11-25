import { useState } from 'react'
import { Lock } from 'lucide-react'
import type { CredencialVisivel, TipoDeCredencial } from '../../../../shared/fluxos/credenciais'
import {
  dominiosDoFormulario, faltaParaCriar, FORMULARIO_VAZIO, mascaraDoValor, NOTA_DO_MCP_NA_ESCRITA, oQueE, semDominio, TIPOS, TIPOS_DE_CABECALHO, valorDoFormulario,
  type Formulario
} from './regrasDeCredenciais'
import '../../estilos/conexoes.css'

// O formulário de guardar uma API ou um segredo (1.9.6, F4; separado em 1.9.7, A2): uma API (com domínio e "só lê / lê e
// escreve") ou um Segredo de servidor MCP. Quem usa: Conexões › APIs, Conexões › MCP (segredos e cabeçalhos), o aceite
// de uma página e o nó HTTP dos fluxos. O
// valor sai da memória da tela assim que a credencial é guardada; ele não volta nem para conferir (só `••••` e os 4
// últimos caracteres). Quem usa decide o que fazer com a credencial criada (`aoCriar`).

const mensagemDe = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Campo de valor secreto: a tela nunca o mostra e o navegador não o guarda. */
export function CampoSecreto({ rotulo, valor, mudar, placeholder }: { rotulo: string; valor: string; mudar: (v: string) => void; placeholder?: string }) {
  return (
    <input type="password" autoComplete="off" spellCheck={false} aria-label={rotulo} placeholder={placeholder} value={valor} onChange={(e) => mudar(e.target.value)} data-credencial-valor />
  )
}

export function CamposDoValor({ tipo, f, mudar }: { tipo: TipoDeCredencial; f: Pick<Formulario, 'valor' | 'usuario' | 'senha'>; mudar: (p: Partial<Formulario>) => void }) {
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

export function SelectDeTipo({ valor, mudar, so }: { valor: TipoDeCredencial; mudar: (t: TipoDeCredencial) => void; so?: readonly TipoDeCredencial[] }) {
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

/** "O que ela pode fazer": só lê (GET, HEAD) ou lê e escreve (vermelho). Vale para páginas e para o nó HTTP. */
export function EscolhaDaEscrita({ soLeitura, mudar }: { soLeitura: boolean; mudar: (soLeitura: boolean) => void }) {
  return (
    <div className="credencial-campo" role="radiogroup" aria-label="O que ela pode fazer" data-credencial-escrita>
      <span>O que ela pode fazer</span>
      <div className="credencial-escrita">
        <label className="servidor-opcao">
          <input type="radio" checked={soLeitura} onChange={() => mudar(true)} data-credencial-so-le /> Só lê (GET, HEAD)
        </label>
        <label className={`servidor-opcao${soLeitura ? '' : ' credencial-escreve'}`}>
          <input type="radio" checked={!soLeitura} onChange={() => mudar(false)} data-credencial-le-e-escreve /> Lê e escreve
        </label>
      </div>
      <span className="suave credencial-ajuda">
        Só lê: as páginas e os fluxos que a usam só conseguem consultar; um POST, PUT, PATCH ou DELETE é recusado antes de sair. {NOTA_DO_MCP_NA_ESCRITA}
      </span>
    </div>
  )
}

export interface PropsDoFormDeCredencial {
  /** Domínios já preenchidos, um por linha (o aceite e o nó HTTP põem o host de quem está pedindo). */
  dominiosIniciais?: string
  /** Chamado com a credencial guardada (sem o valor). Pode ser assíncrono; o erro dele aparece no formulário. */
  aoCriar: (credencial: CredencialVisivel) => void | Promise<void>
  /** Com isto, aparece o botão Cancelar. */
  aoCancelar?: () => void
  /**
   * (1.9.7) O formulário vive DENTRO de outro (o aceite de uma página, o servidor MCP): o outro já tem o seu Cancelar, então
   * o daqui diz o que ele faz de fato, "Não criar" (fecha só este formulário, sem criar a API).
   */
  embutido?: boolean
  /** Os tipos oferecidos. Padrão: os de cabeçalho (sem o Segredo, que é só para servidor MCP). */
  tipos?: readonly TipoDeCredencial[]
  /** Nome já preenchido (ex.: o da variável de ambiente). */
  nomeInicial?: string
}

export function FormDeCredencial({ dominiosIniciais = '', aoCriar, aoCancelar, embutido = false, tipos = TIPOS_DE_CABECALHO, nomeInicial = '' }: PropsDoFormDeCredencial) {
  const vazio: Formulario = { ...FORMULARIO_VAZIO, nome: nomeInicial, tipo: tipos[0] ?? 'bearer', dominios: dominiosIniciais }
  const [f, setF] = useState<Formulario>(vazio)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudar = (p: Partial<Formulario>): void => setF((x) => ({ ...x, ...p }))

  async function guardar(): Promise<void> {
    const falta = faltaParaCriar(f)
    if (falta) return setErro(`Falta: ${falta}.`)
    const dominios = dominiosDoFormulario(f)
    if ('erro' in dominios) return setErro(dominios.erro)
    setErro('')
    setSalvando(true)
    try {
      const r = await window.ork.credenciais.criar({
        nome: f.nome.trim(),
        tipo: f.tipo,
        ...(f.tipo === 'cabecalho' ? { cabecalho: f.cabecalho.trim() } : {}),
        dominios,
        ...(semDominio(f.tipo) ? {} : { soLeitura: f.soLeitura }),
        valor: valorDoFormulario(f)
      })
      if ('erro' in r) return setErro(r.erro)
      // o valor sai da memória da tela agora; ele não volta
      setF(vazio)
      await aoCriar(r.credencial)
    } catch (e) {
      setErro(`Não consegui guardar: ${mensagemDe(e)}`)
    } finally {
      setSalvando(false)
    }
  }

  const ajuda = TIPOS.find((t) => t.id === f.tipo)?.ajuda
  return (
    <form
      className="credencial-form"
      data-credencial-form
      onSubmit={(e) => {
        e.preventDefault()
        void guardar()
      }}
    >
      <label className="credencial-campo">
        <span>Nome</span>
        <input
          aria-label={semDominio(f.tipo) ? 'Nome do segredo' : 'Nome da API'}
          maxLength={80}
          placeholder={semDominio(f.tipo) ? 'Como o servidor vai citar ("Chave do ClickUp")' : 'Como as páginas e os fluxos vão chamar ("API de cotação")'}
          value={f.nome}
          onChange={(e) => mudar({ nome: e.target.value })}
        />
      </label>
      <label className="credencial-campo">
        <span>Tipo</span>
        <SelectDeTipo valor={f.tipo} so={tipos} mudar={(tipo) => mudar({ tipo, valor: '', usuario: '', senha: '' })} />
        {ajuda && <span className="suave credencial-ajuda">{ajuda}</span>}
      </label>
      {f.tipo === 'cabecalho' && (
        <label className="credencial-campo">
          <span>Nome do cabeçalho</span>
          <input aria-label="Nome do cabeçalho" placeholder="X-Api-Key" value={f.cabecalho} onChange={(e) => mudar({ cabecalho: e.target.value })} />
        </label>
      )}
      {!semDominio(f.tipo) && (
      <label className="credencial-campo">
        <span>Domínios onde ela pode ir</span>
        <textarea aria-label="Domínios" rows={2} spellCheck={false} placeholder={'api.exemplo.com\n*.exemplo.org'} value={f.dominios} onChange={(e) => mudar({ dominios: e.target.value })} />
        <span className="suave credencial-ajuda">
          Um por linha. <code>*.exemplo.org</code> vale para os subdomínios. Só vai por <b>https</b>, e para qualquer outro endereço o Orkester recusa levá-la.
        </span>
      </label>
      )}
      <div className="credencial-campo">
        <span>{f.tipo === 'basic' ? 'Usuário e senha' : 'Valor'}</span>
        <CamposDoValor tipo={f.tipo} f={f} mudar={mudar} />
      </div>
      {!semDominio(f.tipo) && <EscolhaDaEscrita soLeitura={f.soLeitura} mudar={(soLeitura) => mudar({ soLeitura })} />}
      {erro && (
        <p className="conexoes-erro credencial-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="conexoes-acoes credencial-acoes">
        {aoCancelar && (
          <button type="button" onClick={aoCancelar} disabled={salvando}>
            {embutido ? 'Não criar' : 'Cancelar'}
          </button>
        )}
        <button className="primario" type="submit" disabled={salvando}>
          <Lock size={13} /> {semDominio(f.tipo) ? 'Guardar o segredo' : 'Guardar a API'}
        </button>
      </div>
    </form>
  )
}

/** "API "X" guardada. O valor não aparece de novo: só ••••1234." */
export const textoDeGuardada = (c: CredencialVisivel): string => {
  const o = oQueE(c)
  return `${o.nome} "${c.nome}" ${o.nome === 'API' ? 'guardada' : 'guardado'}. O valor não aparece de novo: só ${mascaraDoValor(c)}.`
}
