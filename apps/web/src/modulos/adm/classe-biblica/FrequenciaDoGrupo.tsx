import { useFrequenciaDoGrupo } from '../../../api/classe-biblica'
import type { FrequenciaDoGrupo as Frequencia } from '../../../api/classe-biblica'
import { useConexao } from '../../../offline'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'

type Item = Frequencia['itens'][number]

const proporcao = (item: Item): number => (item.encontros === 0 ? 1 : item.presencas / item.encontros)

/** Do menor para o maior: quem precisa de atenção aparece primeiro. */
function ordenar(itens: Item[]): Item[] {
  return [...itens].sort((a, b) => proporcao(a) - proporcao(b) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

const vezes = (n: number, uma: string, varias: string) => (n === 1 ? `1 ${uma}` : `${n} ${varias}`)

/** A frequência de cada desbravador do grupo, aberta na própria página do painel (D12). */
export function FrequenciaDoGrupo({ grupoId }: { grupoId: string }) {
  const frequencia = useFrequenciaDoGrupo(grupoId)
  const { modo } = useConexao()

  if (frequencia.isError) return <ErroDeCarga erro={frequencia.error} aoTentarDeNovo={() => void frequencia.refetch()} />
  if (frequencia.isPending) return modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando a frequência" />

  const itens = ordenar(frequencia.data.itens)
  if (itens.length === 0) {
    return <p className="text-base text-texto-2">Ninguém deste grupo tem presença registrada ainda. A lista aparece depois da primeira chamada.</p>
  }
  return (
    <ul aria-label="Frequência de cada um" className="flex flex-col divide-y divide-borda-controle">
      {itens.map((item) => {
        const abaixo = item.encontros > 0 && item.presencas * 2 < item.encontros
        return (
          <li key={item.dbvId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
            <span className="flex flex-col">
              <span className="text-base font-semibold text-texto">{item.nome}</span>
              <span className="text-sm text-texto-2">{item.unidade}</span>
            </span>
            <span className="flex flex-col text-right">
              <span className={abaixo ? 'text-base font-semibold text-alerta' : 'text-base text-texto'}>
                {`${item.presencas} de ${vezes(item.encontros, 'encontro', 'encontros')}`}
                {abaixo && ' · menos da metade'}
              </span>
              <span className="text-sm text-texto-2">{`participou ativamente em ${item.participacoes}`}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
