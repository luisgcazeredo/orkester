/**
 * O símbolo do Orkester: três peças orbitando um núcleo. É a mesma geometria do ícone do app
 * (`app/build/icon.png`), simplificada para tamanho de interface — nestes 18 px o rabo fino das
 * faixas viraria sujeira, então aqui elas são arcos de espessura constante com ponta redonda.
 */
export function Simbolo({ tamanho = 18 }: { tamanho?: number }) {
  // peças a -90°, 30° e 150°, no raio 34 de uma caixa 100x100
  const pecas = [-90, 30, 150].map((grau) => {
    const r = (grau * Math.PI) / 180
    return { x: 50 + Math.cos(r) * 34, y: 50 + Math.sin(r) * 34 }
  })
  // cada arco vai de uma peça à seguinte, com folga nas duas pontas para não encostar nelas
  const arcos = [-90, 30, 150].map((grau) => {
    const ponta = (g: number): string => {
      const r = (g * Math.PI) / 180
      return `${(50 + Math.cos(r) * 34).toFixed(1)} ${(50 + Math.sin(r) * 34).toFixed(1)}`
    }
    return `M ${ponta(grau + 26)} A 34 34 0 0 1 ${ponta(grau + 94)}`
  })

  return (
    <svg className="simbolo" width={tamanho} height={tamanho} viewBox="0 0 100 100" aria-hidden="true">
      {arcos.map((d) => (
        <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      ))}
      {pecas.map((p) => (
        <circle key={`${p.x}`} cx={p.x} cy={p.y} r="13" fill="currentColor" />
      ))}
      <circle cx="50" cy="50" r="15" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

/** Símbolo + nome, no topo da barra lateral. */
export function Marca() {
  return (
    <div className="marca" title="Orkester">
      <Simbolo tamanho={20} />
      <span>Orkester</span>
    </div>
  )
}
