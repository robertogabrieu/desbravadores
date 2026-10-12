import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExcluirEdicaoCB } from '../../../api/classe-biblica'
import type { PainelDaEdicao } from '../../../api/classe-biblica'
import { Botao } from '../../../ui/Botao'
import { ConfirmacaoDigitada } from '../../../ui/ConfirmacaoDigitada'
import { lerErroDaApi } from '../desbravadores/erros'

const NOME_PROVISORIO = 'Edição sem nome'

const AVISO_COM_CHAMADA =
  'Esta edição já tem chamada registrada e não pode ser excluída. Para tirá-la do calendário, cancele os encontros que ainda não aconteceram.'

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
    ? `Serão apagados ${plural(contagens.encontros, 'encontro', 'encontros')}.`
    : 'A edição ainda não tem encontros nem chamadas.'

  if (contagens && contagens.chamadas > 0) {
    return (
      <div className="flex flex-col gap-2">
        <Botao variante="texto" className="w-fit text-perigo" disabled aria-describedby={`sem-exclusao-${id}`}>
          Excluir edição
        </Botao>
        <p id={`sem-exclusao-${id}`} className="text-sm text-texto-2">{AVISO_COM_CHAMADA}</p>
      </div>
    )
  }

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
