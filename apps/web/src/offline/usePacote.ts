import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { useSessao } from '../sessao/useSessao'
import { banco } from './banco'
import type { RegistroPacote } from './banco'
import type { UsePacote } from './tipos'

interface Leitura {
  /** Par lido, para descartar a leitura do vínculo anterior enquanto a nova não chega. */
  chave: string
  registro: RegistroPacote | undefined
}

/** Pacote guardado do usuário e vínculo da sessão; o `liveQuery` do Dexie reemite a cada gravação no banco local. */
export const usePacote: UsePacote = () => {
  const { eu, vinculoAtivo } = useSessao()
  const usuarioId = eu?.usuario.id
  const vinculoId = vinculoAtivo?.id
  const chave = usuarioId && vinculoId ? `${usuarioId}|${vinculoId}` : null
  const [leitura, setLeitura] = useState<Leitura | null>(null)

  useEffect(() => {
    if (!usuarioId || !vinculoId || !chave) return
    const assinatura = liveQuery(() => banco.pacotes.get([usuarioId, vinculoId])).subscribe({
      next: (registro) => setLeitura({ chave, registro }),
      error: () => setLeitura({ chave, registro: undefined }),
    })
    return () => assinatura.unsubscribe()
  }, [usuarioId, vinculoId, chave])

  if (!chave) return { pacote: null, carregando: false, baixadoEm: null }
  if (leitura?.chave !== chave) return { pacote: null, carregando: true, baixadoEm: null }
  return { pacote: leitura.registro?.pacote ?? null, carregando: false, baixadoEm: leitura.registro?.baixadoEm ?? null }
}
