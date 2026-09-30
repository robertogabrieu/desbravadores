import { useSearchParams } from 'react-router-dom'
import { useClasses } from '../../../api/leitura'
import type { Classe } from '../../../api/leitura'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { cn } from '../../../ui/cn'
import { CorpoDaConsulta } from './CorpoDaConsulta'
import { DetalheDaClasse } from './DetalheDaClasse'

const rotuloDaIdade = (idade: number | null): string | null =>
  idade === null ? null : `${idade} anos`

function ListaDeClasses({
  titulo,
  classes,
  selecionadaId,
  aoEscolher,
}: {
  titulo: string
  classes: Classe[]
  selecionadaId: string
  aoEscolher: (id: string) => void
}) {
  if (classes.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <h2 className="px-2 text-sm font-bold uppercase text-texto-2">{titulo}</h2>
      {classes.map((classe) => (
        <button
          key={classe.id}
          type="button"
          aria-pressed={classe.id === selecionadaId}
          onClick={() => aoEscolher(classe.id)}
          className={cn(
            'flex min-h-[var(--touch-min)] items-center gap-3 rounded-botao px-3 text-left text-base text-texto focus-visible:outline-2 focus-visible:outline-marca',
            classe.id === selecionadaId
              ? 'bg-superficie-suave font-bold'
              : 'hover:bg-superficie-suave',
          )}
        >
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: `var(${classe.corToken})` }}
          />
          <span className="flex-1">{classe.nome}</span>
          {!classe.ativa && <span className="text-sm font-semibold text-texto-2">Inativa</span>}
          <span className="text-sm text-texto-2">{rotuloDaIdade(classe.idade)}</span>
        </button>
      ))}
    </div>
  )
}

export function PainelClasses() {
  const classes = useClasses()
  const [parametros, setParametros] = useSearchParams()

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
        const pedida = parametros.get('classe')
        const selecionada = lista.find((classe) => classe.id === pedida) ?? lista[0]
        const escolher = (id: string) => setParametros({ classe: id }, { replace: true })
        // As agrupadas são uma turma à parte (16 anos ou mais), com regular e avançada juntas.
        const individuais = lista.filter((c) => c.trilha !== 'AGRUPADAS')
        return (
          <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
            <nav aria-label="Classes" className="flex flex-col gap-4">
              <ListaDeClasses
                titulo="Regulares"
                classes={individuais.filter((c) => c.tipo === 'REGULAR')}
                selecionadaId={selecionada.id}
                aoEscolher={escolher}
              />
              <ListaDeClasses
                titulo="Avançadas"
                classes={individuais.filter((c) => c.tipo !== 'REGULAR')}
                selecionadaId={selecionada.id}
                aoEscolher={escolher}
              />
              <ListaDeClasses
                titulo="Agrupadas"
                classes={lista.filter((c) => c.trilha === 'AGRUPADAS')}
                selecionadaId={selecionada.id}
                aoEscolher={escolher}
              />
            </nav>
            <DetalheDaClasse key={selecionada.id} classe={selecionada} />
          </div>
        )
      }}
    </CorpoDaConsulta>
  )
}
