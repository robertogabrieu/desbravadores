import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExcluirEdicaoCB } from '../../../api/classe-biblica'
import type { PainelDaEdicao } from '../../../api/classe-biblica'
import { Botao } from '../../../ui/Botao'
import { ConfirmacaoDigitada } from '../../../ui/ConfirmacaoDigitada'
import { lerErroDaApi } from '../desbravadores/erros'

const NOME_PROVISORIO = 'Edição sem nome'

const plural = (n: number, singular: string, pluralDe: string): string => `${n} ${n === 1 ? singular : pluralDe}`

interface Propriedades {
  id: string
  nome: string | null
  /** O que a exclusão leva; sem ele (rascunho, que ainda não tem encontros) o texto diz que não há nada lançado. */
  contagens?: PainelDaEdicao['aoExcluir']
}

/** "Excluir edição": botão discreto e a confirmação por digitação; depois volta à lista com o aviso. */
export function ExcluirEdicao({ id, nome, contagens }: Propriedades) {
  const [confirmando, setConfirmando] = useState(false)
  const excluir = useExcluirEdicaoCB()
  const navegar = useNavigate()
  const nomeExibido = nome ?? NOME_PROVISORIO

  const fechar = () => {
    setConfirmando(false)
    excluir.reset()
  }

  const confirmar = () =>
    excluir.mutate(id, {
      onSuccess: () => void navegar('/adm/classe-biblica', { replace: true, state: { avisos: [`A edição "${nomeExibido}" foi excluída.`] } }),
    })

  const apagados = contagens
    ? `Serão apagados ${plural(contagens.encontros, 'encontro', 'encontros')}, ${plural(contagens.chamadas, 'chamada', 'chamadas')} e ${plural(contagens.presencas, 'presença', 'presenças')}.`
    : 'A edição ainda não tem encontros nem chamadas.'

  return (
    <>
      <Botao variante="texto" className="w-fit text-perigo" onClick={() => setConfirmando(true)}>
        Excluir edição
      </Botao>
      <ConfirmacaoDigitada
        aberta={confirmando}
        titulo="Excluir a edição?"
        rotuloConfirmar="Excluir edição"
        textoEsperado={nomeExibido}
        pedido="Para confirmar, digite o nome da edição"
        ocupada={excluir.isPending}
        erro={excluir.error ? lerErroDaApi(excluir.error).geral : null}
        aoConfirmar={confirmar}
        aoCancelar={fechar}
      >
        {`Esta ação não pode ser desfeita. ${apagados}`}
      </ConfirmacaoDigitada>
    </>
  )
}
