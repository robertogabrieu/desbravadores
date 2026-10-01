import { Link } from 'react-router-dom'
import { useClasses } from '../../api/leitura'
import { useInicioInstrutor } from '../../api/instrutor'
import type { ClasseDoInstrutor } from '../../api/instrutor'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Esqueleto } from '../../ui/Esqueleto'
import { ClassesSemConexao } from '../aulas/RegistroSemConexao'
import { TRACO, formatarDiaMes } from '../cronograma/formatos'
import { corDaClasse } from './cores'

const LINK_ACAO =
  'flex min-h-[var(--touch-min)] items-center justify-center rounded-botao bg-fundo px-2 text-sm font-bold text-texto hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca'

function tipoEIdade(item: ClasseDoInstrutor, idade: number | null | undefined): string {
  const tipo = item.classe.tipo === 'AVANCADA' ? 'Classe avançada' : 'Classe regular'
  return idade ? `${tipo} · ${idade} anos` : tipo
}

function CartaoDaClasse({ item, idade }: { item: ClasseDoInstrutor; idade: number | null | undefined }) {
  const { classe, totalDbvs, progressoMedio, proximaAula, aulasDadas } = item
  return (
    <article className="flex flex-col overflow-hidden rounded-cartao border border-borda bg-superficie">
      <div className="flex flex-col gap-1 p-4 text-white" style={corDaClasse(classe.corToken)}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide">{tipoEIdade(item, idade)}</span>
          <span className="rounded-full bg-white/20 px-3 py-0.5 text-xs font-bold">{totalDbvs} DBVs</span>
        </div>
        <h2 className="font-titulo text-2xl font-extrabold">{classe.nome}</h2>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span className="font-semibold text-texto">Progresso médio</span>
            <span className="font-extrabold text-texto">{progressoMedio === null ? TRACO : `${progressoMedio}%`}</span>
          </div>
          {progressoMedio !== null && <BarraProgresso valor={progressoMedio} rotulo={`Progresso médio de ${classe.nome}`} />}
        </div>
        <div className="flex gap-4 text-sm text-texto-2">
          <span>{proximaAula ? `Próxima aula: ${formatarDiaMes(proximaAula.data)}` : 'Nenhuma aula publicada ainda'}</span>
          <span>{aulasDadas === 1 ? '1 aula dada' : `${aulasDadas} aulas dadas`}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link to={`/cronograma?classe=${classe.id}`} className={LINK_ACAO}>
            Cronograma
          </Link>
          <Link to={`/classes/${classe.id}/progresso`} className={LINK_ACAO}>
            Progresso
          </Link>
          <Link to={`/classes/${classe.id}/materiais`} className={LINK_ACAO}>
            Materiais
          </Link>
        </div>
      </div>
    </article>
  )
}

/** Minhas classes (I2): um cartão por classe do vínculo, na cor da classe. */
export function TelaClasses() {
  const { eu } = useSessao()
  const consulta = useInicioInstrutor()
  const classesDoClube = useClasses()
  const { modo } = useConexao()
  if (!eu) return null

  const idades = new Map(classesDoClube.data?.map((classe) => [classe.id, classe.idade]))

  let corpo
  if (consulta.data && consulta.data.classes.length === 0) {
    corpo = <EstadoVazio titulo="Você ainda não tem classes. O Adm do clube as atribui." />
  } else if (consulta.data) {
    corpo = (
      <div className="grid gap-4 md:grid-cols-2">
        {consulta.data.classes.map((item) => (
          <CartaoDaClasse key={item.classe.id} item={item} idade={idades.get(item.classe.id)} />
        ))}
      </div>
    )
  } else if (modo === 'SEM_CONEXAO') {
    corpo = <ClassesSemConexao />
  } else if (consulta.isError) {
    corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  } else {
    corpo = (
      <Carregando rotulo="Carregando as classes">
        <Esqueleto className="h-56" />
        <Esqueleto className="h-56" />
      </Carregando>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-texto-2">{eu.usuario.genero === 'F' ? 'Instrutora' : 'Instrutor'} {eu.usuario.nome}</span>
        <h1 className="font-titulo text-2xl font-bold text-texto">Minhas classes</h1>
      </header>
      {corpo}
      <p className="text-center text-sm text-texto-2">As classes são atribuídas pelo Adm do clube.</p>
    </div>
  )
}
