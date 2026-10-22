import { textoDeDias } from '@desbravadores/shared'
import { Check, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import type { VisaoGeral } from '../../../api/visao-geral'
import { Cartao } from '../../../ui/Cartao'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { Selo } from '../../../ui/Selo'
import { diaDaSemana, diaEMes, dosDiasDeReuniao } from '../calendario/datas'
import { useEstadoDeVolta } from '../navegacao'

const MAXIMO_DE_UNIDADES = 5
const ABA_DE_ATRASADOS = '/adm/biblioteca?aba=emprestimos&situacao=atrasados'

const plural = (n: number, singular: string, muitos: string): string => `${n} ${n === 1 ? singular : muitos}`

interface PropriedadesDoCartao {
  titulo: string
  /** Nome do cartão para quem ouve: diz o que o número conta ("2 classes sem cronograma"). */
  nome: string
  subtitulo?: string
  total: number
  emDia: string
  children: ReactNode
}

function CartaoDePendencia({ titulo, nome, subtitulo, total, emDia, children }: PropriedadesDoCartao) {
  return (
    <Cartao role="region" aria-label={nome} className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h3 className="font-titulo text-lg font-bold text-texto">{titulo}</h3>
          {subtitulo && <span className="text-sm text-texto-2">{subtitulo}</span>}
        </div>
        {total > 0 && (
          <Selo tom="alerta">
            <TriangleAlert aria-hidden className="size-4" />
            {total}
          </Selo>
        )}
      </div>
      {total === 0 ? (
        <p className="flex items-center gap-2 text-base text-texto">
          <Check aria-hidden className="size-5 shrink-0 text-sucesso" />
          {emDia}
        </p>
      ) : (
        children
      )}
    </Cartao>
  )
}

function ClassesSemCronograma({ classes }: { classes: VisaoGeral['classesSemCronograma'] }) {
  return (
    <CartaoDePendencia
      titulo="Classes sem cronograma"
      nome={classes.length > 0 ? plural(classes.length, 'classe sem cronograma', 'classes sem cronograma') : 'Classes sem cronograma'}
      total={classes.length}
      emDia="Todas as classes têm cronograma."
    >
      <ul className="flex flex-col">
        {classes.map(({ classe, idade }) => (
          <li key={classe.id}>
            <LinhaQueNavega to={`/adm/cronogramas?classe=${classe.id}`}>
              <span className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold text-texto">{idade === null ? classe.nome : `${classe.nome} · ${plural(idade, 'ano', 'anos')}`}</span>
                <span className="text-base font-semibold text-marca">Montar</span>
              </span>
            </LinhaQueNavega>
          </li>
        ))}
      </ul>
    </CartaoDePendencia>
  )
}

function UnidadesSemChamada({ pendencia }: { pendencia: NonNullable<VisaoGeral['unidadesSemChamada']> }) {
  const estadoDeVolta = useEstadoDeVolta()
  const { reuniao, unidades } = pendencia
  const visiveis = unidades.slice(0, MAXIMO_DE_UNIDADES)
  const restantes = unidades.length - visiveis.length
  return (
    <CartaoDePendencia
      titulo="Unidades sem chamada"
      nome={unidades.length > 0 ? plural(unidades.length, 'unidade sem chamada', 'unidades sem chamada') : 'Unidades sem chamada'}
      subtitulo={`Reunião de ${dosDiasDeReuniao(diaDaSemana(reuniao)).nome}, ${diaEMes(reuniao)}`}
      total={unidades.length}
      emDia="Todas as unidades lançaram a chamada."
    >
      <ul className="flex flex-col">
        {visiveis.map((unidade) => (
          <li key={unidade.id}>
            <LinhaQueNavega to={`/adm/unidades/${unidade.id}`} state={estadoDeVolta}>
              <span className="flex flex-col">
                <span className="text-base font-semibold text-texto">{unidade.nome}</span>
                <span className="text-sm text-texto-2">{unidade.conselheiros.length === 0 ? 'Sem conselheiro' : unidade.conselheiros.join(', ')}</span>
              </span>
            </LinhaQueNavega>
          </li>
        ))}
        {restantes > 0 && (
          <li>
            <LinhaQueNavega to="/adm/unidades" state={estadoDeVolta}>
              <span className="text-base font-semibold text-marca">{`E mais ${plural(restantes, 'unidade', 'unidades')}`}</span>
            </LinhaQueNavega>
          </li>
        )}
      </ul>
    </CartaoDePendencia>
  )
}

function LivrosAtrasados({ pendencia }: { pendencia: NonNullable<VisaoGeral['livrosAtrasados']> }) {
  const { total, itens } = pendencia
  const restantes = total - itens.length
  return (
    <CartaoDePendencia
      titulo="Livros atrasados"
      nome={total > 0 ? plural(total, 'livro atrasado', 'livros atrasados') : 'Livros atrasados'}
      total={total}
      emDia="Nenhum livro atrasado."
    >
      <ul className="flex flex-col">
        {itens.map((atrasado) => (
          <li key={atrasado.emprestimoId}>
            <LinhaQueNavega to={ABA_DE_ATRASADOS}>
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-col">
                  <span className="text-base font-semibold break-words text-texto">{`${atrasado.titulo} · ${atrasado.desbravadorNome}`}</span>
                  <span className="text-sm text-texto-2">{atrasado.unidade ?? 'Sem unidade'}</span>
                </span>
                <span className="shrink-0 text-base font-semibold text-alerta">{textoDeDias(atrasado.dias)}</span>
              </span>
            </LinhaQueNavega>
          </li>
        ))}
        {restantes > 0 && (
          <li>
            <LinhaQueNavega to={ABA_DE_ATRASADOS}>
              <span className="text-base font-semibold text-marca">{`E mais ${plural(restantes, 'livro', 'livros')}`}</span>
            </LinhaQueNavega>
          </li>
        )}
      </ul>
    </CartaoDePendencia>
  )
}

/** Classes sem cronograma, unidades sem chamada e livros atrasados; sem unidade ativa (ou sem dia de reunião no calendário) o cartão de chamada não existe, e sem livro físico no clube o de livros também não. */
export function Pendencias({ visao }: { visao: VisaoGeral }) {
  const chamada = visao.unidades > 0 ? visao.unidadesSemChamada : null
  return (
    <section aria-label="Pendências" className="flex flex-col gap-3">
      <h2 className="font-titulo text-lg font-bold text-texto">Pendências</h2>
      <ClassesSemCronograma classes={visao.classesSemCronograma} />
      {chamada && <UnidadesSemChamada pendencia={chamada} />}
      {visao.livrosAtrasados && <LivrosAtrasados pendencia={visao.livrosAtrasados} />}
    </section>
  )
}
