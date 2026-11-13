import { Brain, Sparkle, SquareTerminal, type LucideIcon } from 'lucide-react'
import type { Agente } from '../../../shared/modelo'

export const ICONE_AGENTE: Record<Agente, LucideIcon> = {
  claude: Sparkle,
  codex: Brain,
  shell: SquareTerminal
}

export const COR_AGENTE: Record<Agente, string> = {
  claude: 'var(--agente-claude)',
  codex: 'var(--agente-codex)',
  shell: 'var(--agente-shell)'
}
