import type { ApiFluxos } from './contrato'

// A costura entre a tela e os dados: `window.ork.fluxos` (o main, desde a S3).

export const apiDeFluxos = (): ApiFluxos => window.ork.fluxos
