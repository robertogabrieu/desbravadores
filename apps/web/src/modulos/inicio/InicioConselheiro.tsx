import { hojeNoFuso } from '@desbravadores/shared'
import type { Papel } from '@desbravadores/shared'
import { CalendarDays, ClipboardCheck, Image, Trophy, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import type { InicioConselheiro as InicioDaApi } from '../../api/inicio'
import { useInicioConselheiro } from '../../api/inicio'
import { useConexao, useFila, usePacote } from '../../offline'
import type { ItemFilaNaTela, PacoteGuardado } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Avatar } from '../../ui/Avatar'
import { Cartao } from '../../ui/Cartao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Esqueleto } from '../../ui/Esqueleto'
import { LinhaQueNavega } from '../../ui/LinhaQueNavega'
import { NomeDaFicha } from '../../ui/LinkDeFicha'
import { Selecao } from '../../ui/Selecao'
import { rotuloDoPapel } from '../acesso/papeis'
import { ConviteInstalacao } from './ConviteInstalacao'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'

type ProximaReuniao = NonNullable<InicioDaApi['proximaReuniao']>
type Pacote = NonNullable<PacoteGuardado['pacote']>

const TRACO = '—'
const MS_POR_DIA = 24 * 60 * 60 * 1000

const ATALHOS: Array<{ rotulo: string; para: string; icone: LucideIcon }> = [
  { rotulo: 'Unidade', para: '/unidade', icone: Users },
  { rotulo: 'Reuniões', para: '/reunioes', icone: ClipboardCheck },
  { rotulo: 'Galeria', para: '/galeria', icone: Image },
  { rotulo: 'Ranking', para: '/ranking', icone: Trophy },
]

const primeiraMaiuscula = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1)

function formatarData(data: string): string {
  const texto = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${data}T00:00:00Z`))
  return primeiraMaiuscula(texto)
}

/** "08:30" vira "8h30" e "09:00" vira "9h". */
function formatarHorario(horario: string): string {
  const [hora, minuto] = horario.split(':')
  return minuto === '00' ? `${Number(hora)}h` : `${Number(hora)}h${minuto}`
}

/** Próxima reunião calculada do pacote guardado: o próximo dia da semana do clube, hoje inclusive. A chamada também conta como feita se está na fila (descartada, sai da fila). */
function proximaReuniaoDoPacote(pacote: Pacote, unidadeId: string, chavesNaFila: Set<string>): ProximaReuniao {
  const { fuso, diaReuniao, horaReuniao, localReuniaoPadrao } = pacote.clube
  const hoje = hojeNoFuso(fuso, new Date())
  const inicioDeHoje = new Date(`${hoje}T00:00:00Z`)
  const diasAteReuniao = (diaReuniao - inicioDeHoje.getUTCDay() + 7) % 7
  const data = new Date(inicioDeHoje.getTime() + diasAteReuniao * MS_POR_DIA).toISOString().slice(0, 10)
  return {
    data,
    horario: horaReuniao,
    local: localReuniaoPadrao,
    ehHoje: data === hoje,
    chamadaFeita: chavesNaFila.has(`${unidadeId}:${data}`) || pacote.reunioesRecentes.some((reuniao) => reuniao.unidadeId === unidadeId && reuniao.data === data),
  }
}

/** Só item que ainda vai ou já foi para a API conta; o recusado (ERRO) deixa a chamada por fazer. */
function chavesDaChamadaFeita(itens: ItemFilaNaTela[]): Set<string> {
  return new Set(itens.filter((item) => item.estado !== 'ERRO').map((item) => item.chave))
}

function CartaoProximaReuniao({ reuniao }: { reuniao: ProximaReuniao | null }) {
  if (!reuniao) return <Cartao className="text-base text-texto-2">Nenhuma reunião marcada.</Cartao>
  const detalhe = [formatarHorario(reuniao.horario), reuniao.local].filter(Boolean).join(' · ')
  return (
    <Cartao className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-texto-2">
        <CalendarDays aria-hidden className="size-4" />
        Próxima reunião
      </div>
      <div className="flex flex-col">
        <span className="font-titulo text-lg font-bold text-texto">{formatarData(reuniao.data)}</span>
        <span className="text-base text-texto-2">{detalhe}</span>
      </div>
      {reuniao.chamadaFeita ? (
        <span className="flex items-center gap-2 text-base font-semibold text-sucesso">
          <ClipboardCheck aria-hidden className="size-5" />
          Chamada feita
        </span>
      ) : (
        reuniao.ehHoje && (
          <Link
            to="/reunioes/nova"
            className="flex min-h-[var(--touch-min)] items-center justify-center gap-2 rounded-botao bg-marca px-5 text-base font-semibold text-white hover:bg-marca-escura focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
          >
            <ClipboardCheck aria-hidden className="size-5" />
            Fazer chamada
          </Link>
        )
      )}
    </Cartao>
  )
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-cartao bg-marca-tinta p-3">
      <span className="font-titulo text-2xl font-extrabold text-texto">{valor}</span>
      <span className="text-center text-sm text-texto-2">{rotulo}</span>
    </div>
  )
}

function Numeros({ dados }: { dados: Pick<InicioDaApi, 'totalDbvs' | 'frequenciaMes' | 'posicaoUnidade'> | null }) {
  return (
    <section className="flex gap-2">
      <Numero valor={dados ? String(dados.totalDbvs) : TRACO} rotulo="DBVs na unidade" />
      <Numero valor={dados?.frequenciaMes == null ? TRACO : `${dados.frequenciaMes}%`} rotulo="Frequência no mês" />
      {dados?.posicaoUnidade && <Numero valor={`${dados.posicaoUnidade.posicao}º`} rotulo="Unidade no ranking" />}
    </section>
  )
}

function Atalhos() {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-titulo text-lg font-bold text-texto">Atalhos</h2>
      <div className="grid grid-cols-2 gap-2">
        {ATALHOS.map(({ rotulo, para, icone: Icone }) => (
          <LinhaQueNavega key={rotulo} to={para} forma="cartao" className="gap-2 p-3">
            <span className="flex flex-col items-start gap-1 text-base font-semibold break-words hyphens-auto">
              <Icone aria-hidden className="size-5 text-marca" />
              {rotulo}
            </span>
          </LinhaQueNavega>
        ))}
      </div>
    </section>
  )
}

function Destaques({ destaques }: { destaques: InicioDaApi['destaques'] }) {
  if (destaques.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-titulo text-lg font-bold text-texto">Destaques da unidade</h2>
        <Link to="/ranking" className="flex min-h-[var(--touch-min)] items-center text-base font-semibold text-marca">
          Ver ranking
        </Link>
      </div>
      <ol className="flex flex-col gap-2">
        {destaques.map((destaque) => (
          <li key={destaque.dbvId}>
            <LinhaQueNavega to={`/dbv/${destaque.dbvId}`} forma="cartao" sinal="ficha" className="min-h-[var(--touch-min)] p-3">
              <span className="flex items-center gap-3">
                <span className="w-5 text-center font-titulo font-bold text-texto-2">{destaque.posicao}</span>
                <Avatar nome={destaque.nome} />
                <NomeDaFicha nome={destaque.nome} className="flex-1 font-semibold text-texto" />
                <span className="text-base text-texto-2">{destaque.pontos} pts</span>
              </span>
            </LinhaQueNavega>
          </li>
        ))}
      </ol>
    </section>
  )
}

interface PropriedadesPainel {
  unidades: Array<{ id: string; nome: string }>
  papel: Papel
  primeiroNome: string
}

function PainelDaUnidade({ unidades, papel, primeiroNome }: PropriedadesPainel) {
  const [escolhida, setEscolhida] = useState<string>()
  const unidadeId = escolhida ?? unidades[0].id
  const nomeDaUnidade = unidades.find((u) => u.id === unidadeId)?.nome ?? unidades[0].nome
  const consulta = useInicioConselheiro(unidadeId)
  const { modo } = useConexao()
  const { pacote } = usePacote()
  const { itens: itensDaFila } = useFila()

  const falhaDeRede = consulta.error instanceof ErroDaApi && consulta.error.classe === 'REDE'

  let conteudo: ReactNode
  if (consulta.data) {
    conteudo = (
      <>
        <CartaoProximaReuniao reuniao={consulta.data.proximaReuniao} />
        <Numeros dados={consulta.data} />
        <Atalhos />
        <Destaques destaques={consulta.data.destaques} />
      </>
    )
  } else if (modo === 'SEM_CONEXAO' || falhaDeRede) {
    if (pacote) {
      conteudo = (
        <>
          <CartaoProximaReuniao reuniao={proximaReuniaoDoPacote(pacote, unidadeId, chavesDaChamadaFeita(itensDaFila))} />
          <Numeros dados={null} />
          <Atalhos />
        </>
      )
    } else if (modo === 'SEM_CONEXAO') {
      conteudo = (
        <>
          <EstadoVazio titulo="Disponível quando houver internet" descricao="Conecte-se para ver o início." />
          <Atalhos />
        </>
      )
    } else {
      conteudo = <ErroDeCarga erro={null} aoTentarDeNovo={() => void consulta.refetch()} />
    }
  } else if (consulta.isError) {
    conteudo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  } else {
    conteudo = (
      <Carregando rotulo="Carregando o início">
        <Esqueleto className="h-36" />
        <Esqueleto className="h-20" />
        <Esqueleto className="h-28" />
      </Carregando>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-texto-2">
          {rotuloDoPapel(papel)} · {nomeDaUnidade}
        </span>
        <h1 className="font-titulo text-2xl font-bold text-texto">Olá, {primeiroNome}</h1>
      </header>
      {unidades.length > 1 && (
        <Selecao rotulo="Unidade" value={unidadeId} onChange={(evento) => setEscolhida(evento.target.value)}>
          {unidades.map((unidade) => (
            <option key={unidade.id} value={unidade.id}>
              {unidade.nome}
            </option>
          ))}
        </Selecao>
      )}
      {conteudo}
      <ConviteInstalacao />
    </div>
  )
}

/** Início do conselheiro (C1): próxima reunião, números da unidade, atalhos e destaques. */
export function InicioConselheiro() {
  const { eu, papel, vinculoAtivo } = useSessao()
  if (!eu || !papel || !vinculoAtivo) return null

  if (vinculoAtivo.unidades.length === 0) {
    return (
      <div className="flex flex-col gap-5 p-4">
        <EstadoVazio titulo="Você ainda não tem unidade. Fale com o Adm do clube." />
        <ConviteInstalacao />
      </div>
    )
  }

  return <PainelDaUnidade unidades={vinculoAtivo.unidades} papel={papel} primeiroNome={eu.usuario.nome.split(' ')[0]} />
}
