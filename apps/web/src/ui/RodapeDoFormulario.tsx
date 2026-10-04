import { Link } from 'react-router-dom'
import { useLarguraMenorQue } from '../layouts/useLarguraMenorQue'
import { Botao, estiloDoBotao } from './Botao'
import { cn } from './cn'

/** O mesmo limite em que o menu do Adm vira gaveta: abaixo dele, a tela é de celular. */
const LARGURA_DO_CELULAR = 900

interface Propriedades {
  cancelar: { para: string; estado?: object }
  rotuloSalvar?: string
  /** "Voltar" quando o link leva ao passo anterior em vez de desistir. */
  rotuloCancelar?: string
  salvando: boolean
}

export function RodapeDoFormulario({ cancelar, rotuloSalvar = 'Salvar', rotuloCancelar = 'Cancelar', salvando }: Propriedades) {
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  const salvar = (
    <Botao type="submit" carregando={salvando} className={celular ? 'flex-1' : 'w-full sm:w-auto'}>
      {rotuloSalvar}
    </Botao>
  )
  const linkCancelar = (
    <Link
      to={cancelar.para}
      state={cancelar.estado}
      className={celular ? estiloDoBotao({ variante: 'secundario' }) : cn(estiloDoBotao({ variante: 'texto' }), 'w-full sm:w-auto')}
    >
      {rotuloCancelar}
    </Link>
  )

  // No celular, a barra fica presa ao pé da tela; o espaço vazio antes dela impede que cubra o último campo.
  if (celular) {
    return (
      <>
        <div aria-hidden data-espaco-do-rodape className="h-16" />
        <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-divisor bg-superficie px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {linkCancelar}
          {salvar}
        </div>
      </>
    )
  }

  // DOM: Salvar antes de Cancelar; row-reverse põe Salvar na ponta direita e Cancelar à esquerda dele.
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-divisor pt-5 sm:flex-row-reverse sm:items-center">
      {salvar}
      {linkCancelar}
    </div>
  )
}
