import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { SELETORES_CONHECIDOS, regrasDoPlugin } from '../../../../shared/cssPlugin'
import { TOKENS_DO_EXEMPLO, exemploDePlugin, exemploValido, lerGuiaDosTokens, type MudaCom } from '../../../../shared/guiaCss'
import type { Tema } from '../../../../shared/temas'
import { Dialogo } from '../../ui/Dialogo'
// o texto do próprio tokens.css: a lista do guia é lida dele (shared/guiaCss.ts), não escrita à mão
import textoDosTokens from '../../estilos/tokens.css?raw'

// Guia de CSS (1.9.4): o que é um token, um exemplo pronto para copiar, o que é recusado e por quê, e a lista dos
// tokens com o valor que vale agora nesta janela.

const MUDA_COM: Record<MudaCom, string> = { base: 'muda com a base', destaque: 'muda com o destaque', fixo: 'fixo' }

const pareceCor = (valor: string): boolean => /^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color)/i.test(valor)

export function GuiaCss({ base, aoFechar }: { base: Tema; aoFechar: () => void }) {
  const grupos = useMemo(() => lerGuiaDosTokens(textoDosTokens), [])
  // os valores que valem agora na raiz do app (base, destaque, plugins e tema do usuário juntos)
  const valores = useMemo(() => {
    const raiz = document.querySelector('.app')
    const cs = raiz ? getComputedStyle(raiz) : null
    return Object.fromEntries(grupos.flatMap((g) => g.tokens.map((t) => [t.token, cs?.getPropertyValue(t.token).trim() ?? ''])))
  }, [grupos])
  const exemplo = useMemo(
    () => exemploDePlugin(base, Object.fromEntries(TOKENS_DO_EXEMPLO.map((t) => [t, valores[t] ?? '']))),
    [base, valores]
  )
  const [copiado, definirCopiado] = useState(false)

  async function copiar(): Promise<void> {
    await navigator.clipboard.writeText(exemplo)
    definirCopiado(true)
  }

  return (
    <Dialogo titulo="Guia de CSS" aoFechar={aoFechar}>
      <div className="temas-guia" data-guia-css>
        <section>
          <h4>O que é um token</h4>
          <p className="suave">
            Token é uma variável de CSS (o nome começa com <code>--</code>) que o app usa no lugar de uma cor ou medida. O plugin troca o valor do token, e
            tudo o que usa aquele token muda junto. Um plugin só pode ter blocos <code>{SELETORES_CONHECIDOS.join(', ')}</code>: o <code>:root</code> vale em
            toda base (e passa por cima da cor de destaque escolhida), <code>.tema-…</code> só naquela base. Na lista de plugins, o de baixo vence; um tema
            seu (duplicado) vence os plugins.
          </p>
        </section>
        <section>
          <h4>Exemplo pronto para copiar</h4>
          <pre className="temas-guia-exemplo" data-guia-exemplo>
            {exemplo}
          </pre>
          <div className="temas-acoes">
            <button type="button" data-acao="copiar-exemplo" disabled={!exemploValido(exemplo)} onClick={() => void copiar()}>
              {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <span className="suave temas-guia-nota">Cole na caixa de plugin, troque os valores e clique em Adicionar.</span>
          </div>
        </section>
        <section>
          <h4>O que é recusado, e por quê</h4>
          <ul className="temas-guia-regras" data-guia-regras>
            {regrasDoPlugin().map((r) => (
              <li key={r.regra}>
                <b>{r.regra}</b> <span className="suave">— {r.porque}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h4>Os tokens e o valor de agora</h4>
          {grupos.map((g) => (
            <div key={g.titulo} className="temas-guia-grupo" data-guia-grupo={g.titulo}>
              <div className="temas-guia-grupo-titulo">
                <b>{g.titulo}</b>
                {g.descricao && <span className="suave"> — {g.descricao}</span>}
              </div>
              <table className="temas-guia-tabela">
                <tbody>
                  {g.tokens.map((t) => (
                    <tr key={t.token} data-guia-token={t.token}>
                      <td>
                        <code>{t.token}</code>
                      </td>
                      <td className="temas-guia-valor">
                        {pareceCor(valores[t.token] ?? '') && <span className="temas-guia-amostra" style={{ background: `var(${t.token})` }} />}
                        <code>{valores[t.token] || '—'}</code>
                      </td>
                      <td>
                        {t.descricao} <span className="suave">· {MUDA_COM[t.mudaCom]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      </div>
      <div className="dialogo-acoes">
        <button type="button" className="primario" onClick={aoFechar}>
          Fechar
        </button>
      </div>
    </Dialogo>
  )
}
