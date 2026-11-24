// Formulário do nó HTTP (F4): método, URL, consulta, cabeçalhos, corpo e a credencial, escolhida por NOME entre as
// credenciais globais (Configurações › Conexões › Credenciais). A tela confere na hora se o host da URL está nos
// domínios da credencial; o valor da credencial nunca passa por aqui.
//
// Rede local (1.9.6, #91): URL do seu computador ou da sua rede (`localhost:5678`, `192.168.0.10:8080`) só roda com a
// permissão daquele endereço neste fluxo. O aviso e o botão Permitir/Tirar moram aqui, no próprio nó; a lista é do
// fluxo (o editor a guarda e a manda no Salvar) e chega pelo `ContextoDaRede`.
import { createContext, useContext } from 'react'
import { Network, RefreshCw } from 'lucide-react'
import { rotuloDoTipo } from '../../conexoes/regrasDeCredenciais'
import { usarCredenciais } from '../../conexoes/usarCredenciais'
import type { CorpoHttp, MetodoHttp } from '../../../../../shared/fluxos/tipos'
import { MAX_CORPO, MAX_PARES, MAX_URL, METODOS_HTTP, TIPOS_DE_CORPO } from '../../../../../shared/fluxos/nos'
import { Campo, ListaDePares, NOTA_DE_EXPRESSAO, pares, sem, texto, type PropsDoFormulario } from './comum'
import { conferirCredencialNaUrl, nomesComCaraDeSegredo } from './credencialNaUrl'
import { AVISO_DE_REDE_LOCAL, situacaoDaRede } from './redeLocal'
import '../../../estilos/fluxos-fora.css'

/** A lista de endereços locais permitidos do fluxo aberto e como mexer nela (`null` = só olhar: aviso sem botão). */
export interface RedeDoFluxo {
  locais: readonly string[]
  permitir: ((autoridade: string) => void) | null
  tirar: ((autoridade: string) => void) | null
}

export const ContextoDaRede = createContext<RedeDoFluxo>({ locais: [], permitir: null, tirar: null })

function AvisoDeRede({ url, somenteLer }: { url: string; somenteLer: boolean }) {
  const rede = useContext(ContextoDaRede)
  const s = situacaoDaRede(url, rede.locais)
  if (!s) return null
  if (s.estado === 'recusa')
    return (
      <div className="http-conferencia erro http-rede" role="alert" data-http-rede="recusa">
        <p>
          <Network size={14} aria-hidden /> <span>{s.motivo}</span>
        </p>
      </div>
    )
  const acao = somenteLer ? null : s.estado === 'falta' ? rede.permitir : rede.tirar
  return (
    <div className={`http-conferencia ${s.estado === 'permitido' ? 'ok' : 'aviso'} http-rede`} role="status" data-http-rede={s.estado}>
      <p>
        <Network size={14} aria-hidden />{' '}
        {s.estado === 'permitido' ? (
          <span>
            <strong className="ed-mono">{s.autoridade}</strong> permitido neste fluxo
          </span>
        ) : (
          <span>{AVISO_DE_REDE_LOCAL}</span>
        )}
      </p>
      {acao && (
        <button type="button" className="ed-botao" onClick={() => acao(s.autoridade)} data-http-rede-botao={s.estado === 'falta' ? 'permitir' : 'tirar'}>
          {s.estado === 'falta' ? (
            <>
              Permitir <span className="ed-mono">{s.autoridade}</span> neste fluxo
            </>
          ) : (
            'Tirar permissão'
          )}
        </button>
      )}
    </div>
  )
}

const NOMES_DO_CORPO: Record<CorpoHttp['tipo'], string> = { nenhum: 'sem corpo', json: 'JSON', texto: 'texto', formulario: 'formulário' }

export function FormHttp({ ajustes, mudar, somenteLer }: PropsDoFormulario) {
  const metodo: MetodoHttp = (METODOS_HTTP as readonly unknown[]).includes(ajustes.metodo) ? (ajustes.metodo as MetodoHttp) : 'GET'
  const c = ajustes.corpo && typeof ajustes.corpo === 'object' ? (ajustes.corpo as Record<string, unknown>) : {}
  const corpo: CorpoHttp = { tipo: (TIPOS_DE_CORPO as readonly unknown[]).includes(c.tipo) ? (c.tipo as CorpoHttp['tipo']) : 'nenhum', valor: texto(c.valor) }
  const semCorpo = metodo === 'GET' || metodo === 'HEAD'
  const { lista: credenciais, erro: erroDasCredenciais, recarregar } = usarCredenciais()
  const nomeDaCredencial = texto(ajustes.credencial)
  const itens = credenciais?.itens ?? []
  const escolhida = itens.find((c) => c.nome.toLowerCase() === nomeDaCredencial.trim().toLowerCase())
  const conferencia = conferirCredencialNaUrl(nomeDaCredencial, texto(ajustes.url), credenciais?.itens ?? null)
  // nome que parece segredo, escrito direto no fluxo, ficaria gravado nele e nas execuções
  const segredos = [...nomesComCaraDeSegredo(pares(ajustes.cabecalhos)), ...nomesComCaraDeSegredo(pares(ajustes.consulta))]
  return (
    <>
      <div className="ed-linha">
        <select aria-label="Método" value={metodo} disabled={somenteLer} onChange={(e) => {
          const m = e.target.value as MetodoHttp
          mudar({ ...ajustes, metodo: m, ...(m === 'GET' || m === 'HEAD' ? { corpo: { tipo: 'nenhum', valor: '' } } : {}) })
        }}>
          {METODOS_HTTP.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input className="ed-mono ed-cresce" aria-label="URL" maxLength={MAX_URL} placeholder="https://" value={texto(ajustes.url)} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, url: e.target.value.replace(/[\r\n]+/g, '') })} />
      </div>
      <p className="suave ed-nota">{NOTA_DE_EXPRESSAO}</p>
      <AvisoDeRede url={texto(ajustes.url)} somenteLer={somenteLer} />
      <Campo rotulo="Consulta (?a=b)">
        <ListaDePares itens={pares(ajustes.consulta)} rotuloNome="nome" rotuloValor="valor" max={MAX_PARES} somenteLer={somenteLer} mudar={(consulta) => mudar({ ...ajustes, consulta })} />
      </Campo>
      <Campo rotulo="Cabeçalhos" nota="Senha e token vão numa credencial, nunca aqui.">
        <ListaDePares itens={pares(ajustes.cabecalhos)} rotuloNome="cabeçalho" rotuloValor="valor" max={MAX_PARES} somenteLer={somenteLer} mudar={(cabecalhos) => mudar({ ...ajustes, cabecalhos })} />
      </Campo>
      {!semCorpo && (
        <Campo rotulo="Corpo">
          <select aria-label="Tipo do corpo" value={corpo.tipo} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, corpo: { ...corpo, tipo: e.target.value } })}>
            {TIPOS_DE_CORPO.map((t) => (
              <option key={t} value={t}>
                {NOMES_DO_CORPO[t]}
              </option>
            ))}
          </select>
          {corpo.tipo !== 'nenhum' && (
            <textarea className="ed-mono" aria-label="Corpo" rows={5} maxLength={MAX_CORPO} spellCheck={false} value={corpo.valor} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, corpo: { ...corpo, valor: e.target.value } })} />
          )}
        </Campo>
      )}
      {segredos.length > 0 && (
        <p className="ed-falta" role="note" data-http-segredo>
          {segredos.map((n) => `"${n}"`).join(', ')} parece{segredos.length > 1 ? 'm' : ''} um segredo. O que se escreve aqui fica gravado no fluxo e nas execuções: guarde o valor numa
          credencial e escolha-a abaixo.
        </p>
      )}
      <Campo rotulo="Credencial (opcional)" nota="Escolha pelo nome; o valor fica cifrado em Configurações › Conexões › Credenciais e nunca entra no fluxo.">
        <div className="http-credencial">
          <select aria-label="Credencial" value={nomeDaCredencial} disabled={somenteLer} onChange={(e) => mudar(sem({ ...ajustes, credencial: e.target.value || undefined }))} data-http-credencial>
            <option value="">(nenhuma)</option>
            {nomeDaCredencial && !escolhida && <option value={nomeDaCredencial}>{nomeDaCredencial}{credenciais ? ' (não existe)' : ''}</option>}
            {itens.map((c) => (
              <option key={c.id} value={c.nome}>
                {c.nome} · {rotuloDoTipo(c)}
              </option>
            ))}
          </select>
          <button type="button" className="ed-icone" title="Ler a lista de credenciais de novo" aria-label="Atualizar a lista de credenciais" onClick={() => void recarregar()}>
            <RefreshCw size={14} />
          </button>
        </div>
        {credenciais && !itens.length && <span className="ed-campo-nota suave">Nenhuma credencial guardada ainda. Crie em Configurações › Conexões › Credenciais e volte.</span>}
        {erroDasCredenciais && <span className="ed-erro">Não consegui ler as credenciais: {erroDasCredenciais}</span>}
        {conferencia && (
          <span className={`http-conferencia ${conferencia.estado}`} role={conferencia.estado === 'erro' ? 'alert' : 'status'} data-http-conferencia={conferencia.estado}>
            {conferencia.texto}
          </span>
        )}
      </Campo>
      <p className="ed-aviso-sensivel" role="note">
        HTTP é sensível: o fluxo só liga com a sua confirmação, vendo o pedido inteiro.
      </p>
    </>
  )
}
