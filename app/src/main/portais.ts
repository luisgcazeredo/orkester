// Os portais do navegador embutido: lê o que há guardado em cada partição e limpa o login quando o usuário pede.
// A decisão do que é "login guardado" está em shared/portais.ts; aqui só o que precisa do Electron.
// O valor de um cookie nunca sai daqui: só o domínio e se ele persiste.
import { ipcMain, session } from 'electron'
import { CANAIS_PORTAIS } from '../shared/api'
import { PARTICOES_DE_PORTAL, particaoConhecida, resumirPortal, type ResumoDePortal } from '../shared/portais'

async function listar(): Promise<ResumoDePortal[]> {
  return Promise.all(
    PARTICOES_DE_PORTAL.map(async ({ particao, nome }) => {
      const cookies = await session.fromPartition(particao).cookies.get({})
      return resumirPortal(
        particao,
        nome,
        cookies.map((c) => ({ domain: c.domain, session: c.session }))
      )
    })
  )
}

async function limpar(particao: unknown): Promise<boolean> {
  if (!particaoConhecida(particao)) return false
  const sessao = session.fromPartition(particao)
  await sessao.clearStorageData()
  await sessao.clearCache()
  return true
}

export function registrarPortais(): void {
  ipcMain.handle(CANAIS_PORTAIS.listar, () => listar())
  ipcMain.handle(CANAIS_PORTAIS.limpar, (_e, particao: unknown) => limpar(particao))
}
