import {
  Activity, BookOpen, Bot, Calendar, CalendarDays, ChartBar, ChartLine, ChartPie, Clock, Code, Compass, Database, FileText, Flag,
  Folder, Gauge, Globe, House, Inbox, Kanban, LayoutDashboard, Lightbulb, ListChecks, ListTodo, Mail, MessageSquare,
  MessagesSquare, Newspaper, Notebook, NotebookPen, Package, Palette, Puzzle, Rocket, Server, Sparkles, Star, Target, Terminal,
  Timer, Users, Wrench, Zap, Bell, type LucideIcon
} from 'lucide-react'
import { ICONES_LUCIDE } from '../../../../shared/paginas'
import type { IconeDePagina } from './contrato'
import { resolverIcone } from './textos'

type NomeDeIcone = (typeof ICONES_LUCIDE)[number]

/**
 * Os componentes dos ícones `lucide:<Nome>` que o manifesto aceita (a lista é a de shared/paginas.ts: faltar ou sobrar
 * um nome aqui é erro de tipo). Nome fora da lista vira a inicial: nunca um componente escolhido por nome livre.
 */
const ICONES: Readonly<Record<NomeDeIcone, LucideIcon>> = {
  LayoutDashboard, Gauge, ListChecks, ListTodo, Kanban, Calendar, CalendarDays, Clock, Timer, Bell, Inbox, Mail, MessageSquare,
  MessagesSquare, Notebook, NotebookPen, BookOpen, FileText, Folder, Database, Server, Globe, ChartBar, ChartLine, ChartPie,
  Activity, Star, Sparkles, Rocket, Zap, Wrench, Users, Bot, Terminal, Code, Package, Target, Flag, Compass, Lightbulb, Puzzle,
  Palette, Newspaper, House
}

export function iconeLucide(nome: string): LucideIcon | undefined {
  return Object.hasOwn(ICONES, nome) ? ICONES[nome as NomeDeIcone] : undefined
}

/** Ícone de uma página extra fora do webview (barra, moldura, diálogo, Conexões): lucide da lista, imagem embutida ou inicial. */
export function IconeDaPagina({ icone, nome, tamanho = 18 }: { icone: IconeDePagina | null | undefined; nome: string; tamanho?: number }) {
  const r = resolverIcone(icone, nome)
  if (r.tipo === 'lucide') {
    const Icone = iconeLucide(r.nome)
    if (Icone) return <Icone size={tamanho} strokeWidth={1.8} aria-hidden />
  }
  if (r.tipo === 'imagem') return <img className="extra-icone-img" src={r.src} width={tamanho} height={tamanho} alt="" draggable={false} />
  // lucide fora da lista também cai aqui
  const letra = r.tipo === 'inicial' ? r.letra : ([...nome.trim()][0]?.toUpperCase() ?? '?')
  return (
    <span className="extra-icone-inicial" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.6) }} aria-hidden>
      {letra}
    </span>
  )
}
