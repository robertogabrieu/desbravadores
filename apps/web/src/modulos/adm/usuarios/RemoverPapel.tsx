import { EuSaida } from '@desbravadores/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { requisitar } from '../../../api/cliente'
import { useEditarVinculo } from '../../../api/usuarios'
import type { Usuario, VinculoUsuario } from '../../../api/usuarios'
import { useSessao } from '../../../sessao/useSessao'
import { Confirmacao } from '../../../ui/Confirmacao'
import { SEM_ACESSO } from '../../acesso/EscolherPapel'
import { textosDaRemocao } from './remover'
import { mensagemDeErro } from './vinculos'

/** Depois de perder o papel em uso: a ficha não abre mais. Com papel em algum clube, escolha; sem, login. */
export function useDepoisDePerderOPapelDaSessao(): () => Promise<void> {
  const { relerSessao, sair } = useSessao()
  const navegar = useNavigate()
  return async () => {
    // Lê sem aplicar à sessão: aplicada sem vínculo, a guarda de rota levaria a /papel e, ao sair, de volta
    // a /login sem o aviso. Com a sessão intacta, o aviso vai ao /login (pública) e só então ela termina.
    const eu = await requisitar('/api/eu', EuSaida)
    if (eu.vinculos.length > 0) {
      await relerSessao()
      void navegar('/papel', { replace: true })
      return
    }
    void navegar('/login', { replace: true, state: { aviso: SEM_ACESSO } })
    await sair()
  }
}

interface Propriedades {
  usuario: Usuario
  /** O papel a remover; nulo com a confirmação fechada. */
  vinculo: VinculoUsuario | null
  aoFechar: () => void
}

/** Confirmação de "Remover papel": fecha só no sucesso; o erro da API fica dentro dela. */
export function RemoverPapel({ usuario, vinculo, aoFechar }: Propriedades) {
  const { eu, vinculoAtivo } = useSessao()
  const editar = useEditarVinculo()
  const depoisDePerderOPapel = useDepoisDePerderOPapelDaSessao()
  const [erro, setErro] = useState<string>()

  const fechar = () => {
    setErro(undefined)
    aoFechar()
  }

  const remover = async (alvo: VinculoUsuario) => {
    if (editar.isPending) return
    setErro(undefined)
    try {
      await editar.mutateAsync({ vinculoId: alvo.id, corpo: { ativo: false } })
      if (alvo.id === vinculoAtivo?.id) await depoisDePerderOPapel()
      else fechar()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  const textos = vinculo ? textosDaRemocao({ usuario, vinculo, ehVoce: eu?.usuario.id === usuario.id }) : null
  return (
    <Confirmacao
      aberta={vinculo !== null}
      titulo={textos?.titulo ?? ''}
      rotuloConfirmar="Remover papel"
      perigo
      erro={erro}
      aoCancelar={fechar}
      aoConfirmar={() => vinculo && void remover(vinculo)}
    >
      <div className="flex flex-col gap-2">
        {textos?.paragrafos.map((paragrafo) => (
          <p key={paragrafo}>{paragrafo}</p>
        ))}
      </div>
    </Confirmacao>
  )
}
