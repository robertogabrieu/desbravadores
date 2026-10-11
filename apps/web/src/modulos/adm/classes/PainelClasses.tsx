import { ChevronLeft } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useClasses } from '../../../api/leitura'
import type { Classe } from '../../../api/leitura'
import { useLarguraMenorQue } from '../../../layouts/useLarguraMenorQue'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { cn } from '../../../ui/cn'
import { LARGURA_DO_CELULAR } from '../../../ui/larguraDoCelular'
import { parDaClasse } from '../../cronograma-montagem/classes'
import { CorpoDaConsulta } from './CorpoDaConsulta'
import { DetalheDaClasse } from './DetalheDaClasse'

const rotuloDaIdade = (idade: number | null): string | null =>
  idade === null ? null : `${idade} anos`

/** Uma linha da lista: a avançada vai logo abaixo da regular dela, recuada e com a bolinha só no contorno. */
interface LinhaDaLista {
  classe: Classe
  avancada: boolean
}

function ListaDeClasses({
  titulo,
  linhas,
  selecionadaId,
  aoEscolher,
}: {
  titulo: string
  linhas: LinhaDaLista[]
  selecionadaId: string
  aoEscolher: (id: string) => void
}) {
  if (linhas.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <h2 className="px-2 text-sm font-bold uppercase text-texto-2">{titulo}</h2>
      {linhas.map(({ classe, avancada }) => (
        <button
          key={classe.id}
          type="button"
          aria-pressed={classe.id === selecionadaId}
          onClick={() => aoEscolher(classe.id)}
          className={cn(
            'flex min-h-[var(--touch-min)] items-center gap-3 rounded-botao px-3 text-left text-base text-texto focus-visible:outline-2 focus-visible:outline-marca',
            avancada && 'pl-9 text-texto-2',
            classe.id === selecionadaId
              ? 'bg-superficie-suave font-bold'
              : 'hover:bg-superficie-suave',
          )}
        >
          <span
            aria-hidden
            className={cn('shrink-0 rounded-full', avancada ? 'size-2.5 border-2' : 'size-3')}
            style={avancada ? { borderColor: `var(${classe.corToken})` } : { backgroundColor: `var(${classe.corToken})` }}
          />
          <span className="flex-1">{classe.nome}</span>
          {!classe.ativa && <span className="text-sm font-semibold text-texto-2">Inativa</span>}
          {!avancada && <span className="text-sm text-texto-2">{rotuloDaIdade(classe.idade)}</span>}
        </button>
      ))}
    </div>
  )
}

/** Cada regular seguida da avançada dela (mesmo desativada, para poder reativá-la); avançada sem regular na lista fica no fim, para não sumir. */
function linhasDosPares(individuais: Classe[]): LinhaDaLista[] {
  const regulares = individuais.filter((classe) => classe.tipo === 'REGULAR')
  const soltas = individuais.filter((classe) => classe.tipo !== 'REGULAR' && !parDaClasse(individuais, classe.id, true))
  return [
    ...regulares.flatMap((regular): LinhaDaLista[] => {
      const avancada = parDaClasse(individuais, regular.id, true)?.avancada
      return [{ classe: regular, avancada: false }, ...(avancada ? [{ classe: avancada, avancada: true }] : [])]
    }),
    ...soltas.map((classe) => ({ classe, avancada: true })),
  ]
}

/** Marca a entrada de histórico aberta pela lista, para o Voltar desfazê-la em vez de empilhar outra. */
const VEIO_DA_LISTA = { veioDaLista: true }

const veioDaLista = (estado: unknown): boolean =>
  typeof estado === 'object' && estado !== null && 'veioDaLista' in estado

function BotaoVoltar({ aoVoltar }: { aoVoltar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoVoltar}
      className="-ml-1 flex min-h-[var(--touch-min)] items-center gap-1 self-start rounded-botao px-1 text-base font-semibold text-marca focus-visible:outline-2 focus-visible:outline-marca"
    >
      <ChevronLeft aria-hidden className="size-5" />
      Voltar para Classes
    </button>
  )
}

export function PainelClasses() {
  const classes = useClasses()
  const [parametros, setParametros] = useSearchParams()
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  const local = useLocation()
  const navegar = useNavigate()

  // No celular a lista e o detalhe ocupam a mesma página: o detalhe abre do topo e a lista volta onde estava.
  const classeAberta = celular ? parametros.get('classe') : null
  const posicaoDaLista = useRef(0)
  const classeAntes = useRef(classeAberta)
  useEffect(() => {
    if (classeAberta === classeAntes.current) return
    classeAntes.current = classeAberta
    window.scrollTo({ top: classeAberta === null ? posicaoDaLista.current : 0 })
  }, [classeAberta])

  return (
    <CorpoDaConsulta consulta={classes} rotuloDeCarga="Carregando as classes">
      {(lista) => {
        if (lista.length === 0)
          return (
            <EstadoVazio
              titulo="Nenhuma classe no catálogo"
              descricao="As classes oficiais entram com a carga do catálogo."
            />
          )
        const pedida = lista.find((classe) => classe.id === parametros.get('classe'))
        const selecionada = pedida ?? lista[0]
        // No celular cada classe aberta é uma página do histórico, para o voltar do aparelho fechá-la.
        const escolher = (id: string) => {
          if (!celular) {
            setParametros({ classe: id }, { replace: true })
            return
          }
          posicaoDaLista.current = window.scrollY
          setParametros({ classe: id }, { state: VEIO_DA_LISTA })
        }
        const voltar = () => {
          if (veioDaLista(local.state)) void navegar(-1)
          else setParametros({}, { replace: true })
        }

        // As agrupadas são uma turma à parte (16 anos ou mais), com regular e avançada juntas; nunca entram num par.
        const individuais = lista.filter((c) => c.trilha !== 'AGRUPADAS')
        const detalheDe = (classe: Classe) => (
          <DetalheDaClasse key={classe.id} classe={classe} avancada={classe.tipo === 'REGULAR' ? parDaClasse(individuais, classe.id)?.avancada : undefined} />
        )

        // No celular a lista aparece sozinha: nenhuma classe está aberta ao lado para marcar.
        const marcadaId = celular ? '' : selecionada.id
        if (celular && pedida)
          return (
            <div className="flex flex-col gap-2">
              <BotaoVoltar aoVoltar={voltar} />
              {detalheDe(pedida)}
            </div>
          )
        return (
          <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
            <nav aria-label="Classes" className="flex flex-col gap-4">
              <ListaDeClasses
                titulo="Regulares e avançadas"
                linhas={linhasDosPares(individuais)}
                selecionadaId={marcadaId}
                aoEscolher={escolher}
              />
              <ListaDeClasses
                titulo="Agrupadas"
                linhas={lista.filter((c) => c.trilha === 'AGRUPADAS').map((classe) => ({ classe, avancada: false }))}
                selecionadaId={marcadaId}
                aoEscolher={escolher}
              />
            </nav>
            {!celular && detalheDe(selecionada)}
          </div>
        )
      }}
    </CorpoDaConsulta>
  )
}
