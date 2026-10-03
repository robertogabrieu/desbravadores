import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditarVinculo } from '../../../api/usuarios'
import type { Usuario, VinculoUsuario } from '../../../api/usuarios'
import { useSessao } from '../../../sessao/useSessao'
import { Confirmacao } from '../../../ui/Confirmacao'
import { textosDaRemocao } from './remover'
import { mensagemDeErro } from './vinculos'

/** Depois de perder o papel em uso: a ficha não abre mais. Com papel em algum clube, vai à escolha; sem
 *  papel nenhum, a própria sessão termina ao reler e a guarda leva ao login com o aviso (ProvedorSessao). */
export function useDepoisDePerderOPapelDaSessao(): () => Promise<void> {
  const { relerSessao } = useSessao()
  const navegar = useNavigate()
  return async () => {
    const eu = await relerSessao()
    if (eu.vinculos.length > 0) void navegar('/papel', { replace: true })
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
