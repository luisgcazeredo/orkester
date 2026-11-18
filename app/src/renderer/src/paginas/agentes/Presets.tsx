import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { MODELOS_PADRAO, esforcosDoMotor, modeloValido, type Esforco } from '../../../../shared/modelos'
import { PRESETS_PADRAO, type Agente, type PresetAgente } from '../../../../shared/modelo'
import { definirPresets, lerEstado } from '../../estado/loja'
import { COR_AGENTE, ICONE_AGENTE } from '../../nos/icones'

// Presets de agente: o que aparece no botão de terminal. Cada um é um nome, o tipo de agente (ícone, retomar conversa)
// e a linha digitada no PowerShell quando o terminal abre (ex.: `claude --model opus`).

const AGENTES: Array<[Agente, string]> = [
  ['claude', 'Claude Code'],
  ['codex', 'Codex'],
  ['shell', 'Só o PowerShell']
]

/** O comando vai digitado no shell: uma linha só. */
const comandoValido = (p: PresetAgente): boolean => !/[\r\n]/.test(p.comando) && p.comando.length <= 500 && (p.modelo === undefined || modeloValido(p.modelo)) && (p.esforco === undefined || esforcosDoMotor(p.agente, p.modelo, MODELOS_PADRAO).includes(p.esforco))

export function EditorDePresets() {
  const doEstado = (): PresetAgente[] => lerEstado().preferencias.presets.map((p) => ({ ...p }))
  const [lista, setLista] = useState<PresetAgente[]>(doEstado)
  const mudar = (id: string, parcial: Partial<PresetAgente>): void => setLista((l) => l.map((p) => (p.id === id ? { ...p, ...parcial } : p)))
  const valida = lista.length > 0 && lista.every((p) => p.nome.trim() && comandoValido(p))

  function salvar(): void {
    if (!valida) return
    definirPresets(lista.map((p) => ({ ...p, nome: p.nome.trim().slice(0, 80), comando: p.comando.trim() })))
  }

  return (
    <div className="editor-pagina" data-editor="presets">
      <p className="dialogo-texto suave">O comando é digitado no PowerShell quando o terminal abre, na pasta do espaço.</p>
      <div className="presets">
        {lista.map((p) => {
          const Icone = ICONE_AGENTE[p.agente]
          return (
            <div key={p.id} className="preset-linha" data-preset={p.id}>
              <Icone size={15} style={{ color: COR_AGENTE[p.agente] }} />
              <input className="preset-nome" value={p.nome} placeholder="Nome" onChange={(e) => mudar(p.id, { nome: e.target.value })} />
              <select value={p.agente} onChange={(e) => {
                  const agente = e.target.value as Agente
                  const ok = p.esforco !== undefined && esforcosDoMotor(agente, p.modelo, MODELOS_PADRAO).includes(p.esforco)
                  mudar(p.id, ok ? { agente } : { agente, esforco: undefined })
                }} title="Tipo de agente">
                {AGENTES.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
              <input
                className="preset-comando"
                value={p.comando}
                placeholder={p.agente === 'shell' ? '(nada: só o shell)' : p.agente}
                spellCheck={false}
                onChange={(e) => mudar(p.id, { comando: e.target.value })}
              />
              <input
                className="preset-modelo"
                value={p.modelo ?? ''}
                placeholder="modelo"
                title="Modelo (ex.: opus, sonnet, gpt-5.6-terra). Vazio: o do comando ou o padrão do motor."
                spellCheck={false}
                onChange={(e) => mudar(p.id, { modelo: e.target.value.trim() || undefined })}
              />
              <select
                className="preset-esforco"
                value={p.esforco ?? ''}
                title="Esforço de raciocínio"
                onChange={(e) => mudar(p.id, { esforco: (e.target.value || undefined) as Esforco | undefined })}
              >
                <option value="">esforço</option>
                {esforcosDoMotor(p.agente, p.modelo, MODELOS_PADRAO).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <button
                className="preset-apagar"
                title="Apagar preset"
                disabled={lista.length === 1}
                onClick={() => setLista((l) => l.filter((x) => x.id !== p.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>
      <button
        className="preset-novo"
        onClick={() => setLista((l) => [...l, { id: crypto.randomUUID(), nome: 'Novo agente', agente: 'claude', comando: 'claude' }])}
      >
        <Plus size={14} /> Novo preset
      </button>
      <div className="dialogo-acoes">
        <button onClick={() => setLista(PRESETS_PADRAO.map((p) => ({ ...p })))}>Restaurar padrão</button>
        <span className="espaco-flex" />
        <button onClick={() => setLista(doEstado())}>Desfazer alterações</button>
        <button className="primario" disabled={!valida} onClick={salvar}>
          Salvar
        </button>
      </div>
    </div>
  )
}
