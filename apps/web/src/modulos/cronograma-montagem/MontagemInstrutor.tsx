import { ChevronLeft } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import { useClasses } from '../../api/leitura'
import { useMontagem } from '../../api/montagem'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { DisponivelComInternet } from '../../ui/EstadosDeCarga'
import { FaixaAviso } from '../../ui/FaixaAviso'
import { Selecao } from '../../ui/Selecao'
import { ResultadoConsulta } from '../galeria/ResultadoConsulta'
import { AlternadorDeClasse } from './AlternadorDeClasse'
import { PainelInstrutor } from './PainelInstrutor'
import { SeloDoCronograma } from './SeloDoCronograma'
import { parDaClasse } from './classes'

/** I3b: o instrutor liberado monta o cronograma da classe no celular. */
export function MontagemInstrutor() {
  const [busca, definirBusca] = useSearchParams()
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const { vinculoAtivo } = useSessao()
  const classesDoInstrutor = vinculoAtivo?.classes ?? []
  const todas = useClasses()

  const pedida = busca.get('classe')
  const classeId = classesDoInstrutor.find((classe) => classe.id === pedida)?.id ?? classesDoInstrutor[0]?.id
  const montagem = useMontagem(classeId, undefined, online)

  const par = parDaClasse(todas.data ?? [], classeId)
  const doInstrutor = (id: string) => classesDoInstrutor.some((classe) => classe.id === id)
  const alternador = par && doInstrutor(par.regular.id) && doInstrutor(par.avancada.id) ? par : null
  const escolhaveis = classesDoInstrutor.filter((classe) => {
    const base = todas.data?.find((item) => item.id === classe.id)?.classeBaseId
    return !(classe.tipo === 'AVANCADA' && base && doInstrutor(base))
  })
  const escolherClasse = (id: string) => definirBusca({ classe: id }, { replace: true })

  if (classeId === undefined) {
    return <EstadoVazio titulo="Você ainda não tem classe" descricao="Peça ao Adm para vincular você a uma classe." />
  }
  if (montagem.error instanceof ErroDaApi && montagem.error.status === 403) {
    return <Navigate to={`/cronograma?classe=${classeId}`} replace />
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Link to={`/cronograma?classe=${classeId}`} aria-label="Voltar" className="flex size-[var(--touch-min)] items-center justify-center rounded-full text-texto hover:bg-superficie-suave">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <h1 className="flex-1 font-titulo text-xl font-extrabold text-texto">Montar cronograma</h1>
        {montagem.data?.cronograma && <SeloDoCronograma status={montagem.data.cronograma.status} />}
      </header>

      {escolhaveis.length > 1 && (
        <Selecao rotulo="Classe" value={alternador?.regular.id ?? classeId} onChange={(evento) => escolherClasse(evento.target.value)}>
          {escolhaveis.map((classe) => (
            <option key={classe.id} value={classe.id}>
              {classe.nome}
            </option>
          ))}
        </Selecao>
      )}
      {alternador && <AlternadorDeClasse par={alternador} atualId={classeId} aoMudar={escolherClasse} />}
      <FaixaAviso>Liberado pelo Adm. Você monta; o Adm revisa e publica.</FaixaAviso>

      {!online ? (
        <DisponivelComInternet />
      ) : (
        <ResultadoConsulta consulta={montagem} rotuloCarga="Carregando cronograma">
          {(dados) =>
            dados.cronograma === null ? (
              <EstadoVazio titulo="O cronograma ainda não foi criado" descricao="Peça ao Adm para criar o cronograma desta classe." />
            ) : (
              <PainelInstrutor montagem={dados} cronograma={dados.cronograma} ano={undefined} aoAtualizar={() => void montagem.refetch()} />
            )
          }
        </ResultadoConsulta>
      )}
    </div>
  )
}
