import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { estiloDoBotao } from '../../../ui/Botao'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { diaEMes, diaDaSemana, dosDiasDeReuniao } from '../calendario/datas'
import { useEstadoDeVolta } from '../navegacao'
import { caminhoDaChamadaCB } from './chamadaClasseBiblica'
import type { ChamadaPendente } from './chamadaClasseBiblica'
import { FecharDaFolha } from './FecharDaFolha'

interface Propriedades {
  aberta: boolean
  pares: ChamadaPendente[]
  aoFechar: () => void
}

/** "Encontro de domingo, 11/10". */
const textoDoEncontro = (data: string): string => `Encontro de ${dosDiasDeReuniao(diaDaSemana(data)).nome}, ${diaEMes(data)}`

/** Folha do atalho da Classe Bíblica: escolhe entre várias chamadas pendentes, ou diz que não há nenhuma. */
export function FolhaDaChamada({ aberta, pares, aoFechar }: Propriedades) {
  const estadoDeVolta = useEstadoDeVolta()
  const nenhuma = pares.length === 0

  return (
    <FolhaLateral aberta={aberta} titulo={nenhuma ? 'Nenhuma chamada pendente' : 'Qual chamada lançar?'} aoFechar={aoFechar}>
      {nenhuma ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 text-base text-texto">
            <Check aria-hidden className="size-5 shrink-0 text-sucesso" />
            As chamadas dos últimos 7 dias estão lançadas.
          </p>
          <Link to="/adm/classe-biblica" className={estiloDoBotao({ variante: 'secundario', largura: 'total' })}>
            Ver edições da Classe Bíblica
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-texto-2">Classe Bíblica</p>
          <ul className="flex flex-col gap-2">
            {pares.map((par) => (
              <li key={`${par.encontroId}-${par.grupoId}`}>
                <LinhaQueNavega to={caminhoDaChamadaCB(par)} state={estadoDeVolta} forma="cartao">
                  <span className="flex flex-col">
                    <span className="text-base font-semibold text-texto">{par.grupoNome}</span>
                    <span className="text-sm text-texto-2">{textoDoEncontro(par.data)}</span>
                  </span>
                </LinhaQueNavega>
              </li>
            ))}
          </ul>
        </div>
      )}
      <FecharDaFolha aoFechar={aoFechar} />
    </FolhaLateral>
  )
}
