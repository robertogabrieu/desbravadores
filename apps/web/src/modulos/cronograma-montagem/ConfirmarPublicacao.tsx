import type { ReactNode } from 'react'
import { Confirmacao } from '../../ui/Confirmacao'

interface Propriedades {
  nomeDaClasse: string
  /** Requisitos ainda sem data: acima de zero, a confirmação avisa que dá para colocá-los depois. */
  semData: number
  ocupada: boolean
  /** Faixa de erro da publicação (409, 422), dentro do diálogo para não ficar escondida atrás dele. */
  aviso?: ReactNode
  aoPublicar: () => void
  aoContinuar: () => void
}

/** Antes de publicar (celular e computador): diz o que acontece com os instrutores e com o que falta. */
export function ConfirmarPublicacao({ nomeDaClasse, semData, ocupada, aviso, aoPublicar, aoContinuar }: Propriedades) {
  return (
    <Confirmacao
      aberta
      titulo={`Publicar o cronograma de ${nomeDaClasse}?`}
      rotuloConfirmar="Publicar cronograma"
      rotuloCancelar="Continuar montando"
      ocupada={ocupada}
      aoConfirmar={aoPublicar}
      aoCancelar={aoContinuar}
    >
      <div className="flex flex-col gap-2">
        <p>Os instrutores da classe recebem um aviso e passam a ver as datas.</p>
        {semData > 0 && (
          <p>
            <strong className="text-texto">{semData === 1 ? '1 requisito ainda está sem data.' : `${semData} requisitos ainda estão sem data.`}</strong>{' '}
            Você pode colocá-los depois.
          </p>
        )}
        <p>Se você mudar algo depois, o cronograma volta a Rascunho até ser publicado de novo.</p>
        {aviso}
      </div>
    </Confirmacao>
  )
}
