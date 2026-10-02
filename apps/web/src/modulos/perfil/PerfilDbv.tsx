import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { PerfilDbv as PerfilDaApi } from '../../api/perfil'
import { usePerfilDbv } from '../../api/perfil'
import { useConexao } from '../../offline'
import { Avatar } from '../../ui/Avatar'
import { Esqueleto } from '../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { classeDoAvatar } from '../ranking/classeDoAvatar'
import { SecaoProgresso } from './SecaoProgresso'

const TRACO = '—'

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-cartao border border-borda-controle bg-superficie p-3">
      <span className="font-titulo text-2xl font-extrabold text-texto">{valor}</span>
      <span className="text-sm text-texto-2">{rotulo}</span>
    </div>
  )
}

function Conteudo({ perfil }: { perfil: PerfilDaApi }) {
  const { dbv } = perfil
  const contato = dbv.contato
  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-center gap-4">
        <Avatar nome={dbv.nome} classe={classeDoAvatar(dbv.classeAtual?.corToken)} className="size-16 text-xl" />
        <div className="flex flex-col gap-1">
          <h1 className="font-titulo text-2xl font-extrabold text-texto">{dbv.nome}</h1>
          <span className="text-base text-texto-2">
            {dbv.idade} anos · {dbv.unidade?.nome ?? 'Sem unidade'}
          </span>
          <span className="text-base font-semibold text-texto">
            {dbv.classeAtual ? `Classe ${dbv.classeAtual.nome}` : 'Sem classe atual'}
          </span>
          {dbv.avancadaAtual && <span className="text-sm text-texto-2">Avançada: {dbv.avancadaAtual.nome}</span>}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        <Numero valor={perfil.posicaoMes === null ? TRACO : `${perfil.posicaoMes}º`} rotulo="no ranking" />
        <Numero valor={String(perfil.pontosMes)} rotulo="pontos" />
        <Numero valor={perfil.frequenciaMes === null ? TRACO : `${perfil.frequenciaMes}%`} rotulo="frequência" />
      </section>

      <SecaoProgresso dbvId={dbv.id} />

      <section className="flex flex-col gap-2">
        <h2 className="font-titulo text-lg font-bold text-texto">Classes concluídas</h2>
        {perfil.classesInvestidas.length === 0 ? (
          <p className="text-base text-texto-2">Nenhuma classe investida ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {perfil.classesInvestidas.map(({ classe, anoClube }) => (
              <li key={`${classe.id}-${anoClube}`} className="flex items-center gap-3 rounded-cartao border border-borda-controle bg-superficie p-3">
                <Avatar nome={classe.nome} classe={classeDoAvatar(classe.corToken)} className="size-8 text-xs" />
                <span className="flex flex-col">
                  <span className="font-semibold text-texto">{classe.nome}</span>
                  <span className="text-sm text-texto-2">Investida em {anoClube}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {contato && (
        <section className="flex flex-col gap-1">
          <h2 className="font-titulo text-lg font-bold text-texto">Contato do responsável</h2>
          {contato.responsavelNome && <span className="text-base text-texto">{contato.responsavelNome}</span>}
          {contato.responsavelTelefone && <span className="text-base text-texto-2">{contato.responsavelTelefone}</span>}
          {contato.responsavelEmail && <span className="text-base text-texto-2">{contato.responsavelEmail}</span>}
        </section>
      )}
    </div>
  )
}

/** Perfil do desbravador (T3 parcial): sem anel, seções, especialidades e instrutor. */
export function PerfilDbv() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const consulta = usePerfilDbv(id)
  const { modo } = useConexao()

  let corpo: ReactNode
  if (consulta.data) corpo = <Conteudo perfil={consulta.data} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else
    corpo = (
      <Carregando rotulo="Carregando o perfil">
        <Esqueleto className="h-20" />
        <Esqueleto className="h-20" />
        <Esqueleto className="h-32" />
      </Carregando>
    )

  return (
    <div className="flex flex-col gap-4 p-4">
      <button
        type="button"
        aria-label="Voltar"
        onClick={() => void navegar(-1)}
        className="flex min-h-[var(--touch-min)] w-fit items-center gap-2 text-base font-semibold text-marca focus-visible:outline-2 focus-visible:outline-marca"
      >
        <ArrowLeft aria-hidden className="size-5" />
        Voltar
      </button>
      {corpo}
    </div>
  )
}
