// Formulário do nó HTTP (F4): método, URL, consulta, cabeçalhos, corpo e a API (o campo `credencial` do fluxo),
// escolhida por NOME entre as APIs globais (Configurações › Conexões › APIs). A tela confere na hora se o host da URL
// está nos domínios da API e avisa quando a API "só lê" e o método escreve; o valor nunca passa por aqui.
//
// Rede local (1.9.6, #91): URL do seu computador ou da sua rede (`localhost:5678`, `192.168.0.10:8080`) só roda com a
// permissão daquele endereço neste fluxo. O aviso e o botão Permitir/Tirar moram aqui, no próprio nó; a lista é do
// fluxo (o editor a guarda e a manda no Salvar) e chega pelo `ContextoDaRede`.
import { createContext, useContext, useState } from 'react'
import { Network, Plus, RefreshCw } from 'lucide-react'
import { FormDeCredencial } from '../../conexoes/FormDeCredencial'
import { ehApi, rotuloDoTipo, seloDaEscrita } from '../../conexoes/regrasDeCredenciais'
import { credenciaisParaCabecalho, hostDaUrl } from '../../conexoes/regrasDeServidores'
import { usarCredenciais } from '../../conexoes/usarCredenciais'
import { conferirMetodo } from '../../../../../shared/fluxos/credenciais'
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

/**
 * O domínio que "Criar API" já põe no formulário: o host da URL do nó, se for um nome de verdade (não IP nem
 * "localhost"; a URL pode ter {{ }} e então não vale nada). Vazio: o usuário digita.
 */
export function dominioDaUrl(url: string): string {
  try {
    const host = new URL(url.trim()).hostname
    return host.includes('.') && /[a-z]/i.test(host) && !host.includes('{') ? host.toLowerCase() : ''
  } catch {
    return ''
  }
}

const NOMES_DO_CORPO: Record<CorpoHttp['tipo'], string> = { nenhum: 'sem corpo', json: 'JSON', texto: 'texto', formulario: 'formulário' }

export function FormHttp({ ajustes, mudar, somenteLer }: PropsDoFormulario) {
  const metodo: MetodoHttp = (METODOS_HTTP as readonly unknown[]).includes(ajustes.metodo) ? (ajustes.metodo as MetodoHttp) : 'GET'
  const c = ajustes.corpo && typeof ajustes.corpo === 'object' ? (ajustes.corpo as Record<string, unknown>) : {}
  const corpo: CorpoHttp = { tipo: (TIPOS_DE_CORPO as readonly unknown[]).includes(c.tipo) ? (c.tipo as CorpoHttp['tipo']) : 'nenhum', valor: texto(c.valor) }
  const semCorpo = metodo === 'GET' || metodo === 'HEAD'
  const { lista: credenciais, erro: erroDasCredenciais, recarregar } = usarCredenciais()
  // (1.9.7, D6) "Criar API" aqui mesmo, já com o domínio da URL; ao guardar, o nó passa a usá-la
  const [criando, setCriando] = useState(false)
  const nomeDaCredencial = texto(ajustes.credencial)
  // o Segredo (1.9.7) é só de servidor MCP: nunca vai num pedido HTTP, então não é oferecido aqui
  const itens = (credenciais?.itens ?? []).filter(ehApi)
  const escolhida = itens.find((c) => c.nome.toLowerCase() === nomeDaCredencial.trim().toLowerCase())
  // (1.9.7, F2) com host conhecido, só as APIs que o cobrem; URL com {{ }} ou ainda vazia: todas
  const url = texto(ajustes.url)
  const oferecidas = hostDaUrl(url) ? credenciaisParaCabecalho(itens, url) : itens
  const conferencia = conferirCredencialNaUrl(nomeDaCredencial, url, credenciais?.itens ?? null)
  // API "só lê" com método de escrita: o núcleo recusa antes de sair; a tela avisa antes
  const soLe = escolhida ? conferirMetodo(escolhida, metodo) : null
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
      <Campo rotulo="Cabeçalhos" nota="Senha e token vão numa API (abaixo), nunca aqui.">
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
          API e escolha-a abaixo.
        </p>
      )}
      <Campo rotulo="API (opcional)" nota="Escolha pelo nome; a chave fica cifrada em Configurações › Conexões › APIs e nunca entra no fluxo.">
        <div className="http-credencial">
          <select aria-label="API" value={nomeDaCredencial} disabled={somenteLer} onChange={(e) => mudar(sem({ ...ajustes, credencial: e.target.value || undefined }))} data-http-credencial>
            <option value="">(nenhuma)</option>
            {nomeDaCredencial && !escolhida && <option value={nomeDaCredencial}>{nomeDaCredencial}{credenciais ? ' (não existe)' : ''}</option>}
            {escolhida && !oferecidas.includes(escolhida) && (
              <option value={escolhida.nome}>
                {escolhida.nome} · não cobre este endereço
              </option>
            )}
            {oferecidas.map((c) => (
              <option key={c.id} value={c.nome}>
                {c.nome} · {rotuloDoTipo(c)} · {seloDaEscrita(c).texto}
              </option>
            ))}
          </select>
          <button type="button" className="ed-icone" title="Ler a lista de APIs de novo" aria-label="Atualizar a lista de APIs" onClick={() => void recarregar()}>
            <RefreshCw size={14} />
          </button>
          {!somenteLer && (
            <button
              type="button"
              className="ed-botao"
              disabled={credenciais?.cifraDisponivel === false}
              title={credenciais?.cifraDisponivel === false ? 'Sem o cofre do sistema não dá para guardar valor' : 'Guardar uma API nova sem sair do fluxo'}
              onClick={() => setCriando(!criando)}
              aria-expanded={criando}
              data-http-criar-credencial
            >
              <Plus size={13} /> Criar API
            </button>
          )}
        </div>
        {criando && !somenteLer && (
          <FormDeCredencial
            dominiosIniciais={dominioDaUrl(texto(ajustes.url))}
            aoCancelar={() => setCriando(false)}
            aoCriar={async (c) => {
              mudar(sem({ ...ajustes, credencial: c.nome }))
              setCriando(false)
              await recarregar()
            }}
          />
        )}
        {credenciais && !itens.length && <span className="ed-campo-nota suave">Nenhuma API guardada ainda. Use Criar API, ou crie em Configurações › Conexões › APIs e volte.</span>}
        {credenciais && !!itens.length && !oferecidas.length && <span className="ed-campo-nota suave" data-http-sem-api-do-host>Nenhuma API cobre {hostDaUrl(url)}. Use Criar API: o domínio já vem preenchido.</span>}
        {erroDasCredenciais && <span className="ed-erro">Não consegui ler as APIs: {erroDasCredenciais}</span>}
        {soLe && (
          <span className="http-conferencia erro" role="alert" data-http-so-le>
            {soLe}
          </span>
        )}
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
