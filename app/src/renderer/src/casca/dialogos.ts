import type { JSX } from 'react'
import { DialogoNovoAndar } from '../ui/Andares'
import { Atalhos } from '../ui/Atalhos'
import { MenuContexto } from '../ui/MenuContexto'
import { Paleta } from '../ui/Paleta'
import { Perguntas } from '../ui/Perguntas'

/** Menus e diálogos montados no fim do App, nesta ordem (a mesma de antes da casca: muda a ordem no DOM e o empilhamento). */
export const DIALOGOS: { id: string; Componente: () => JSX.Element | null }[] = [
  { id: 'menu-contexto', Componente: MenuContexto },
  { id: 'novo-andar', Componente: DialogoNovoAndar },
  { id: 'perguntas', Componente: Perguntas },
  { id: 'atalhos', Componente: Atalhos },
  { id: 'paleta', Componente: Paleta }
]
