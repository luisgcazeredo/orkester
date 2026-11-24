// Formulários dos 5 gatilhos (kanban, entrega, parou, relógio, manual). Seletores tirados das Automações da 1.9.6.
import type { QuandoDaRotina } from '../../../../../shared/modelo'
import type { ComoParou } from '../../../../../shared/fluxos/tipos'
import { TriangleAlert } from 'lucide-react'
import { MAX_CONTEM, MIN_MINUTOS_DA_AUTOMACAO } from '../../../../../shared/automacoes'
import { notasDoRelogio } from '../textos'
import { Campo, Horario, ref, SeletorDeCartao, SeletorDeColuna, sem, texto, type PropsDoFormulario } from './comum'

export function FormKanban({ ajustes, ctx, mudar, somenteLer }: PropsDoFormulario) {
  const por = ajustes.por === 'usuario' || ajustes.por === 'agente' ? ajustes.por : 'qualquer'
  return (
    <>
      <Campo rotulo="Quando uma tarefa entrar na coluna">
        <SeletorDeColuna rotulo="Coluna de destino" valor={ref(ajustes.paraColuna)} ctx={ctx} somenteLer={somenteLer} mudar={(r) => mudar(sem({ ...ajustes, paraColuna: r ?? { id: '', nome: '' } }))} />
      </Campo>
      <Campo rotulo="Vinda de">
        <SeletorDeColuna rotulo="Coluna de origem" valor={ref(ajustes.deColuna)} ctx={ctx} qualquer="qualquer coluna" somenteLer={somenteLer} mudar={(r) => mudar(sem({ ...ajustes, deColuna: r }))} />
      </Campo>
      <Campo rotulo="Movida por" nota="Movimento feito por um fluxo nunca dispara.">
        <select aria-label="Quem moveu" value={por} disabled={somenteLer} onChange={(e) => mudar({ ...ajustes, por: e.target.value })}>
          <option value="qualquer">qualquer um</option>
          <option value="usuario">você</option>
          <option value="agente">um agente</option>
        </select>
      </Campo>
    </>
  )
}

export function FormEntrega({ ajustes, ctx, mudar, somenteLer }: PropsDoFormulario) {
  return (
    <>
      <Campo rotulo="De quem">
        <SeletorDeCartao rotulo="De quem" valor={ref(ajustes.de)} ctx={ctx} qualquer="qualquer agente" shells="junto" somenteLer={somenteLer} mudar={(r) => mudar(sem({ ...ajustes, de: r }))} />
      </Campo>
      <Campo rotulo="Para quem">
        <SeletorDeCartao rotulo="Para quem" valor={ref(ajustes.para)} ctx={ctx} qualquer="qualquer um" shells="junto" somenteLer={somenteLer} mudar={(r) => mudar(sem({ ...ajustes, para: r }))} />
      </Campo>
      <Campo rotulo="Texto que contém" nota="Sem diferenciar maiúsculas. Vazio = qualquer entrega.">
        <input
          aria-label="Contém"
          maxLength={MAX_CONTEM}
          placeholder="(qualquer texto)"
          value={texto(ajustes.contem)}
          disabled={somenteLer}
          onChange={(e) => mudar(sem({ ...ajustes, contem: e.target.value || undefined }))}
        />
      </Campo>
    </>
  )
}

const COMOS: readonly (readonly [ComoParou, string])[] = [
  ['parou', 'parar de trabalhar'],
  ['pergunta', 'parar numa pergunta'],
  ['encerrou', 'encerrar']
]

export function FormParou({ ajustes, ctx, mudar, somenteLer }: PropsDoFormulario) {
  const como = Array.isArray(ajustes.como) ? (ajustes.como.filter((c) => typeof c === 'string') as ComoParou[]) : []
  const marcar = (c: ComoParou, sim: boolean): void => mudar({ ...ajustes, como: sim ? [...como.filter((x) => x !== c), c] : como.filter((x) => x !== c) })
  return (
    <>
      <Campo rotulo="Qual agente">
        <SeletorDeCartao rotulo="Qual agente" valor={ref(ajustes.agente)} ctx={ctx} qualquer="qualquer agente" somenteLer={somenteLer} mudar={(r) => mudar(sem({ ...ajustes, agente: r }))} />
      </Campo>
      <fieldset className="ed-campo ed-grupo">
        <legend className="ed-campo-rotulo">Quando ele</legend>
        {COMOS.map(([c, t]) => (
          <label key={c} className="ed-marcar">
            <input type="checkbox" checked={como.includes(c)} disabled={somenteLer} onChange={(e) => marcar(c, e.target.checked)} />
            {t}
          </label>
        ))}
      </fieldset>
    </>
  )
}

const quandoValido = (v: unknown): QuandoDaRotina => {
  const q = v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
  const n = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d)
  if (q.tipo === 'cada') return { tipo: 'cada', minutos: n(q.minutos, 15) }
  if (q.tipo === 'semanal') return { tipo: 'semanal', dia: n(q.dia, 1), hora: n(q.hora, 9), minuto: n(q.minuto, 0) }
  return { tipo: 'diario', hora: n(q.hora, 9), minuto: n(q.minuto, 0) }
}

export function FormRelogio({ ajustes, mudar, somenteLer }: PropsDoFormulario) {
  const q = quandoValido(ajustes.quando)
  const { minimo, teto } = notasDoRelogio(q)
  return (
    <Campo
      rotulo="Dispara"
      nota={
        minimo || teto ? (
          <>
            {minimo && <span className="ed-nota-linha" data-relogio-minimo>Intervalo: {minimo}.</span>}
            {teto && (
              <span className="ed-falta ed-nota-linha" role="status" data-relogio-teto>
                <TriangleAlert size={14} aria-hidden /> {teto}
              </span>
            )}
          </>
        ) : undefined
      }
    >
      <Horario q={q} minimo={MIN_MINUTOS_DA_AUTOMACAO} somenteLer={somenteLer} mudar={(quando) => mudar({ ...ajustes, quando })} />
    </Campo>
  )
}

export function FormManual() {
  return <p className="suave ed-nota">Dispara pelo botão Rodar fluxo, no alto do editor. Não tem ajustes.</p>
}
