import { datasDoIntervalo, situacaoDaData } from '@desbravadores/shared'
import { Sun } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useConfiguracaoClube } from '../../../api/clube'
import { useEvento, useExcluirEvento } from '../../../api/calendario'
import type { EventoCalendario } from '../../../api/calendario'
import { useConexao } from '../../../offline'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Cartao } from '../../../ui/Cartao'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { ListaDePares } from '../../../ui/ListaDePares'
import type { Par } from '../../../ui/ListaDePares'
import { lerErroDaApi } from '../desbravadores/erros'
import { horaCurta, periodoPorExtenso } from '../formatos'
import { useAvisosDaFicha, useVoltarPara } from '../navegacao'
import { datasDoDiaDaSemana, diaDaSemana, diaPorExtenso, dosDiasDeReuniao, textoDosDias } from './datas'
import { ROTULOS_DO_TIPO } from './tipos'

const CALENDARIO = '/adm/calendario'
const TRACO = '—'

const simOuNao = (valor: boolean): string => (valor ? 'Sim' : 'Não')

/** Reunião ou classe pela regra do dia aplicada só a este evento: "Sim (domingo 18)", "Não (domingos 11 e 18)". */
function textoDaMarcacao(evento: EventoCalendario, diaReuniao: number | undefined, marcacao: 'temReuniao' | 'temClasse'): string {
  if (diaReuniao === undefined) return simOuNao(evento[marcacao])
  const datasComMarcacao = datasDoIntervalo(evento.inicio, evento.fim).filter((data) => situacaoDaData(data, diaReuniao, [evento])[marcacao])
  if (datasComMarcacao.length > 0) return `Sim (${textoDosDias(datasComMarcacao)})`
  const diasDeReuniao = datasDoDiaDaSemana(evento.inicio, evento.fim, diaReuniao)
  if (diasDeReuniao.length === 0) return `Não há ${dosDiasDeReuniao(diaReuniao).nome} no período`
  return `Não (${textoDosDias(diasDeReuniao)})`
}

/** A extra só acrescenta: no dia normal "Sim" é o horário e o local dela, e "Não" deixa o calendário como está. */
function textoDaMarcacaoDaExtra(evento: EventoCalendario, diaReuniao: number | undefined, marcacao: 'temReuniao' | 'temClasse'): string {
  if (diaReuniao === undefined) return simOuNao(evento[marcacao])
  const dia = diaPorExtenso(evento.inicio)
  const noDiaNormal = diaDaSemana(evento.inicio) === diaReuniao
  if (!evento[marcacao]) return noDiaNormal ? `Não acrescenta — ${dia} segue o calendário` : 'Não'
  if (marcacao === 'temReuniao' && noDiaNormal) return `Sim — ${dia} já tem reunião; vale o horário e o local deste evento`
  return `Sim (${dia})`
}

function paresDoQueMuda(evento: EventoCalendario, diaReuniao: number | undefined): Par[] {
  if (evento.tipo === 'REUNIAO_EXTRA') {
    return [
      { rotulo: 'Terá reunião', valor: textoDaMarcacaoDaExtra(evento, diaReuniao, 'temReuniao') },
      { rotulo: 'Terá classe', valor: textoDaMarcacaoDaExtra(evento, diaReuniao, 'temClasse') },
    ]
  }
  return [
    { rotulo: 'Terá reunião', valor: textoDaMarcacao(evento, diaReuniao, 'temReuniao') },
    { rotulo: 'Terá classe', valor: textoDaMarcacao(evento, diaReuniao, 'temClasse') },
    { rotulo: 'Terá atividade de campo', valor: simOuNao(evento.bomParaCampo) },
  ]
}

function Conteudo({ evento }: { evento: EventoCalendario }) {
  const mes = `${CALENDARIO}?mes=${evento.inicio.slice(0, 7)}`
  const voltarPara = useVoltarPara(mes)
  const { avisos, dispensar } = useAvisosDaFicha()
  const navegar = useNavigate()
  const excluir = useExcluirEvento()
  const configuracao = useConfiguracaoClube()
  const [confirmando, setConfirmando] = useState(false)
  const [erroDaExclusao, setErroDaExclusao] = useState<string | null>(null)

  async function confirmarExclusao() {
    setErroDaExclusao(null)
    setConfirmando(false)
    try {
      await excluir.mutateAsync(evento.id)
      void navegar(voltarPara, { replace: true })
    } catch (falha) {
      setErroDaExclusao(lerErroDaApi(falha).geral)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDaPagina
        voltar={{ para: voltarPara, rotulo: 'Calendário do clube' }}
        sobretitulo={ROTULOS_DO_TIPO[evento.tipo]}
        titulo={evento.nome}
        acoes={
          <>
            <Botao variante="secundario" className="text-perigo" carregando={excluir.isPending} onClick={() => setConfirmando(true)}>
              Excluir
            </Botao>
            <Link to={`${CALENDARIO}/eventos/${evento.id}/editar`} state={{ voltarPara }} className={estiloDoBotao()}>
              Editar
            </Link>
          </>
        }
      />

      {avisos.length > 0 && (
        <section aria-label="Classes afetadas" className="flex flex-col gap-2">
          <h2 className="font-titulo text-lg font-bold text-texto">Classes afetadas</h2>
          {avisos.map((aviso) => (
            <FaixaAviso key={aviso}>{aviso}</FaixaAviso>
          ))}
          <Botao variante="texto" className="self-start" onClick={dispensar}>
            Dispensar avisos
          </Botao>
        </section>
      )}

      {erroDaExclusao && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroDaExclusao}
        </p>
      )}

      <section aria-label="Dados do evento">
        <Cartao>
          <ListaDePares
            colunas={3}
            pares={[
              { rotulo: evento.tipo === 'REUNIAO_EXTRA' ? 'Data' : 'Datas', valor: periodoPorExtenso(evento.inicio, evento.fim) },
              { rotulo: 'Horário', valor: evento.horario ? horaCurta(evento.horario) : TRACO },
              { rotulo: 'Local', valor: evento.local ?? TRACO },
            ]}
          />
        </Cartao>
      </section>

      <section aria-label="O que muda no calendário">
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-titulo text-lg font-bold text-texto">O que muda no calendário</h2>
          {evento.tipo === 'FERIAS' ? (
            <p className="flex items-center gap-2 text-base text-texto">
              <Sun aria-hidden className="size-5 shrink-0 text-[var(--cal-ferias-fg)]" />
              {`Sem reunião e sem classe ${dosDiasDeReuniao(configuracao.data?.diaReuniao).nos} do período; acampamentos continuam valendo.`}
            </p>
          ) : (
            <ListaDePares pares={paresDoQueMuda(evento, configuracao.data?.diaReuniao)} />
          )}
        </Cartao>
      </section>

      <Confirmacao
        aberta={confirmando}
        titulo={`Excluir ${evento.nome}?`}
        rotuloConfirmar="Excluir"
        perigo
        aoConfirmar={() => void confirmarExclusao()}
        aoCancelar={() => setConfirmando(false)}
      >
        O evento sai do calendário do clube.
      </Confirmacao>
    </div>
  )
}

export function FichaEvento() {
  const { id = '' } = useParams()
  const consulta = useEvento(id)
  const { modo } = useConexao()

  let corpo: ReactNode
  if (consulta.data) corpo = <Conteudo evento={consulta.data} />
  else if (consulta.isError && ehNaoEncontrado(consulta.error))
    corpo = <EstadoNaoEncontrado registro="este evento" lista={{ para: CALENDARIO, rotulo: 'Ver o calendário' }} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else
    corpo = (
      <Carregando rotulo="Carregando a ficha">
        <Esqueleto className="h-20" />
        <Esqueleto className="h-32" />
      </Carregando>
    )

  return <div className="flex flex-col gap-4 py-4">{corpo}</div>
}
