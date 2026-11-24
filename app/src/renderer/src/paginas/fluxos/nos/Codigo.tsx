// Formulário do nó Código (F4): JavaScript num campo monoespaçado com realce de sintaxe (highlight.js, o mesmo do cartão
// de código). O realce é uma camada pintada atrás de um `textarea` transparente: o que se digita é o `textarea`, o que
// se vê colorido é a camada (`aria-hidden`), e as duas andam juntas na rolagem.
import { useMemo, useRef } from 'react'
import { MAX_CODIGO } from '../../../../../shared/fluxos/nos'
import { realcarLinhas } from '../../../arquivos/realce'
import { Campo, texto, type PropsDoFormulario } from './comum'
import '../../../estilos/fluxos-fora.css'

export function FormCodigo({ ajustes, mudar, somenteLer }: PropsDoFormulario) {
  const codigo = texto(ajustes.codigo)
  const camada = useRef<HTMLPreElement>(null)
  // uma linha de HTML por linha de texto; a última linha em branco garante que a camada tenha a mesma altura do campo
  const html = useMemo(() => `${realcarLinhas(codigo, 'codigo.js').join('\n')}\n `, [codigo])
  const sincronizar = (e: { currentTarget: HTMLTextAreaElement }): void => {
    if (!camada.current) return
    camada.current.scrollTop = e.currentTarget.scrollTop
    camada.current.scrollLeft = e.currentTarget.scrollLeft
  }
  return (
    <>
      <Campo
        rotulo="JavaScript"
        nota={
          <>
            Recebe todos os itens: <code>$input.all()</code>, <code>$input.first()</code>, <code>{"$('Nome').all()"}</code> de um nó anterior. Devolve uma lista
            de itens. <code>throw</code> deixa o nó vermelho; <code>console.log</code> vai para a execução. Sem disco, sem rede, 5 s.
          </>
        }
      >
        <div className="codigo-caixa" data-codigo-caixa>
          {/* a camada só pinta: quem recebe o texto e o foco é o textarea por cima */}
          <pre ref={camada} className="codigo-camada" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />
          <textarea
            className="codigo-campo"
            aria-label="Código"
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            maxLength={MAX_CODIGO}
            value={codigo}
            disabled={somenteLer}
            onScroll={sincronizar}
            onKeyDown={(e) => {
              // Tab escreve dois espaços em vez de sair do campo
              if (e.key !== 'Tab' || e.shiftKey || somenteLer) return
              e.preventDefault()
              const t = e.currentTarget
              const ini = t.selectionStart
              const fim = t.selectionEnd
              mudar({ ...ajustes, codigo: `${codigo.slice(0, ini)}  ${codigo.slice(fim)}` })
              requestAnimationFrame(() => t.setSelectionRange(ini + 2, ini + 2))
            }}
            onChange={(e) => mudar({ ...ajustes, codigo: e.target.value })}
          />
        </div>
        <span className="codigo-contador suave" data-codigo-contador>
          {codigo.length.toLocaleString('pt-BR')} / {MAX_CODIGO.toLocaleString('pt-BR')} letras
        </span>
      </Campo>
      <p className="ed-aviso-sensivel" role="note">
        Código é sensível: o fluxo só liga com a sua confirmação, vendo o código inteiro.
      </p>
    </>
  )
}
