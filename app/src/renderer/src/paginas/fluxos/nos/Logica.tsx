// Formulários de Se e Definir campos.
import { Plus, X } from 'lucide-react'
import type { CondicaoDoSe, OperadorDoSe } from '../../../../../shared/fluxos/tipos'
import { MAX_CAMPOS, MAX_CONDICOES, OPERADORES_DO_SE, OPERADORES_SEM_COMPARAR } from '../../../../../shared/fluxos/nos'
import { Campo, ListaDePares, lista, NOTA_DE_EXPRESSAO, pares, texto, type PropsDoFormulario } from './comum'

const NOMES_DOS_OPERADORES: Record<OperadorDoSe, string> = {
  igual: 'é igual a',
  diferente: 'é diferente de',
  contem: 'contém',
  'nao-contem': 'não contém',
  comeca: 'começa com',
  termina: 'termina com',
  vazio: 'está vazio',
  'nao-vazio': 'não está vazio',
  maior: 'é maior que',
  menor: 'é menor que',
  verdadeiro: 'é verdadeiro',
  falso: 'é falso'
}

const operador = (v: unknown): OperadorDoSe => ((OPERADORES_DO_SE as readonly unknown[]).includes(v) ? (v as OperadorDoSe) : 'igual')

export function FormSe({ ajustes, mudar, somenteLer }: PropsDoFormulario) {
  const condicoes: CondicaoDoSe[] = lista(ajustes.condicoes, (c) => ({ valor: texto(c.valor), operador: operador(c.operador), comparar: texto(c.comparar) }))
  const combinar = ajustes.combinar === 'ou' ? 'ou' : 'e'
  const trocar = (i: number, p: Partial<CondicaoDoSe>): void => mudar({ ...ajustes, condicoes: condicoes.map((c, j) => (j === i ? { ...c, ...p } : c)) })
  return (
    <>
      <p className="suave ed-nota">
        Os itens que passam saem por <b>verdadeiro</b>; os outros, por <b>falso</b>. {NOTA_DE_EXPRESSAO}
      </p>
      {condicoes.length > 1 && (
        <Campo rotulo="Combinar">
          <select aria-label="Combinar" value={combinar} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, combinar: e.target.value })}>
            <option value="e">todas as condições (e)</option>
            <option value="ou">qualquer uma (ou)</option>
          </select>
        </Campo>
      )}
      <div className="ed-condicoes">
        {condicoes.map((c, i) => (
          <div key={i} className="ed-condicao">
            <input aria-label={`Valor ${i + 1}`} placeholder="{{ campo }}" value={c.valor} disabled={somenteLer} onChange={(e) => trocar(i, { valor: e.target.value })} />
            <select aria-label={`Operador ${i + 1}`} value={c.operador} disabled={somenteLer} onChange={(e) => trocar(i, { operador: e.target.value as OperadorDoSe })}>
              {OPERADORES_DO_SE.map((o) => (
                <option key={o} value={o}>
                  {NOMES_DOS_OPERADORES[o]}
                </option>
              ))}
            </select>
            {!OPERADORES_SEM_COMPARAR.includes(c.operador) && (
              <input aria-label={`Comparar com ${i + 1}`} placeholder="valor" value={c.comparar} disabled={somenteLer} onChange={(e) => trocar(i, { comparar: e.target.value })} />
            )}
            {!somenteLer && condicoes.length > 1 && (
              <button type="button" className="ed-icone" title="Tirar condição" aria-label={`Tirar condição ${i + 1}`} onClick={() => mudar({ ...ajustes, condicoes: condicoes.filter((_, j) => j !== i) })}>
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!somenteLer && condicoes.length < MAX_CONDICOES && (
        <button type="button" className="ed-botao-leve" onClick={() => mudar({ ...ajustes, condicoes: [...condicoes, { valor: '', operador: 'igual', comparar: '' }] })}>
          <Plus size={14} /> condição
        </button>
      )}
    </>
  )
}

export function FormDefinir({ ajustes, mudar, somenteLer }: PropsDoFormulario) {
  return (
    <>
      <Campo rotulo="Campos" nota={<>O nome aceita caminho (<code>a.b</code>). {NOTA_DE_EXPRESSAO}</>}>
        <ListaDePares itens={pares(ajustes.campos)} rotuloNome="campo" rotuloValor="valor" max={MAX_CAMPOS} somenteLer={somenteLer} mudar={(campos) => mudar({ ...ajustes, campos })} />
      </Campo>
      <label className="ed-marcar">
        <input type="checkbox" checked={ajustes.manterOutros !== false} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, manterOutros: e.target.checked })} />
        manter os outros campos do item
      </label>
    </>
  )
}
