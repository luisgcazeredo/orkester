// O formulário de cada tipo de nó, e o ícone de cada tipo (lucide; nada do n8n).
import type { ComponentType } from 'react'
import { Bell, CirclePause, Clock, Code, Database, Globe, Plug, ListPlus, MessageSquare, MousePointerClick, PackageCheck, PencilLine, Split, SquareKanban, SquareTerminal, type LucideIcon } from 'lucide-react'
import type { TipoDeNo } from '../../../../../shared/fluxos/tipos'
import { FormCodigo } from './Codigo'
import type { PropsDoFormulario } from './comum'
import { FormEntrega, FormKanban, FormManual, FormParou, FormRelogio } from './Gatilhos'
import { FormHttp } from './Http'
import { FormMcp } from './Mcp'
import { FormDefinir, FormSe } from './Logica'
import { FormAvisar, FormComando, FormConsultar, FormRecado, FormTarefa } from './Orkester'

export { usarContextoDoEspaco, type ContextoDoEspaco } from './comum'

export const FORMULARIOS: Record<TipoDeNo, ComponentType<PropsDoFormulario>> = {
  'gatilho.kanban': FormKanban,
  'gatilho.entrega': FormEntrega,
  'gatilho.parou': FormParou,
  'gatilho.relogio': FormRelogio,
  'gatilho.manual': FormManual,
  'orkester.recado': FormRecado,
  'orkester.tarefa': FormTarefa,
  'orkester.comando': FormComando,
  'orkester.avisar': FormAvisar,
  'orkester.consultar': FormConsultar,
  'logica.se': FormSe,
  'logica.definir': FormDefinir,
  'fora.codigo': FormCodigo,
  'fora.http': FormHttp,
  'fora.mcp': FormMcp
}

export const ICONES: Record<TipoDeNo, LucideIcon> = {
  'gatilho.kanban': SquareKanban,
  'gatilho.entrega': PackageCheck,
  'gatilho.parou': CirclePause,
  'gatilho.relogio': Clock,
  'gatilho.manual': MousePointerClick,
  'orkester.recado': MessageSquare,
  'orkester.tarefa': ListPlus,
  'orkester.comando': SquareTerminal,
  'orkester.avisar': Bell,
  'orkester.consultar': Database,
  'logica.se': Split,
  'logica.definir': PencilLine,
  'fora.codigo': Code,
  'fora.http': Globe,
  'fora.mcp': Plug
}
