import { datasDoIntervalo, situacaoDaData } from '@desbravadores/shared'
import { Check, Shirt, Sun } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useConfiguracaoClube } from '../../../api/clube'
import { useEvento, useExcluirEvento } from '../../../api/calendario'
import type { EventoCalendario } from '../../../api/calendario'
import { hojeDoClube } from '../../../api/desbravadores'
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
import { FUSO_PADRAO_DO_CLUBE, dataPorExtenso, horaCurta, instanteCurto, juntarNomes, periodoPorExtenso } from '../formatos'
import { useAvisosDaFicha, useVoltarPara } from '../navegacao'
import { MESES, datasDoDiaDaSemana, diaDaSemana, diaPorExtenso, dosDiasDeReuniao, textoDosDias } from './datas'
import { ROTULOS_DO_TIPO, textoDoCancelamento } from './tipos'

const CALENDARIO = '/adm/calendario'
const TRACO = '—'

const nomeDoMes = (data: string): string => (MESES[Number(data.slice(5, 7)) - 1] ?? '').toLowerCase()

/** "sábado, 3 de outubro de 2026", como no quadro da ficha; vários dias: "… a domingo, 4 de outubro de 2026". */
const diaCompleto = (data: string): string => `${dataPorExtenso(data).replace(/^./, (letra) => letra.toLowerCase())} de ${data.slice(0, 4)}`
const datasPorExtensoCompletas = (inicio: string, fim: string): string => (inicio === fim ? diaCompleto(inicio) : `${diaCompleto(inicio)} a ${diaCompleto(fim)}`)

const desbravadores =(quantos: number): string => (quantos === 1 ? '1 desbravador' : `${quantos} desbravadores`)

type SituacaoDaLista = 'ANTES_DO_DIA' | 'SEM_MARCAS' | 'RASCUNHO' | 'CONCLUIDA'

/**
 * A lista de quem foi vem resumida em `evento.lista`: concluída tem `concluidaEm`; com marcas e sem
 * `concluidaEm` está começada; sem nada (nulo, ou zero marcas), é o dia do evento que decide se já abriu.
 */
function situacaoDaLista(evento: EventoCalendario, hoje: string): SituacaoDaLista {
  const lista = evento.lista
  if (lista?.concluidaEm) return 'CONCLUIDA'
  if (lista && lista.foram > 0) return 'RASCUNHO'
  return hoje < evento.inicio ? 'ANTES_DO_DIA' : 'SEM_MARCAS'
}

/** Quantos pontos já estão no ranking por causa deste evento: só a lista concluída os dá. */
const desbravadoresComPontos = (evento: EventoCalendario): number => (evento.lista?.concluidaEm ? evento.lista.foram : 0)

const NOME_DO_UNIFORME = { GALA: 'gala', CAMPO: 'campo' } as const

/** Escrito, com camisa e contorno (cheio na gala, tracejado no campo): o uniforme nunca depende da cor. */
function SeloDoUniforme({ uniforme }: { uniforme: keyof typeof NOME_DO_UNIFORME }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-borda-controle bg-superficie px-3 py-0.5 text-base font-bold text-texto ${uniforme === 'GALA' ? 'border-solid' : 'border-dashed'}`}
    >
      <Shirt aria-hidden className="size-4 shrink-0" />
      {`Uniforme de ${NOME_DO_UNIFORME[uniforme]}`}
    </span>
  )
}

function CartaoDaLista({ evento, situacao, fuso }: { evento: EventoCalendario; situacao: SituacaoDaLista; fuso: string }) {
  const presenca = `${CALENDARIO}/eventos/${evento.id}/presenca`
  const lista = evento.lista
  const uniforme = evento.uniforme ? NOME_DO_UNIFORME[evento.uniforme] : 'gala'
  const dia = dataPorExtenso(evento.inicio).replace(/^./, (letra) => letra.toLowerCase())
  const pontosSoNoFim = <p className="text-sm text-texto-2">Os pontos só chegam ao ranking quando você concluir a lista.</p>

  let corpo: ReactNode
  if (situacao === 'ANTES_DO_DIA') {
    corpo = (
      <>
        <p className="text-base text-texto">{`A lista abre no dia do evento, ${dia}.`}</p>
        <p className="text-sm text-texto-2">Até lá, não há nada a registrar.</p>
      </>
    )
  } else if (situacao === 'SEM_MARCAS') {
    corpo = (
      <>
        <p className="text-base text-texto">{`O evento foi ${dia}. Ainda ninguém foi marcado.`}</p>
        {pontosSoNoFim}
        <Link to={presenca} className={estiloDoBotao({ className: 'self-start' })}>
          Registrar quem foi
        </Link>
      </>
    )
  } else if (situacao === 'RASCUNHO') {
    const marcados = lista?.foram ?? 0
    corpo = (
      <>
        <p className="text-base text-texto">{`Você começou a lista: ${marcados} ${marcados === 1 ? 'desbravador marcado' : 'desbravadores marcados'}. Falta concluir.`}</p>
        {pontosSoNoFim}
        <Link to={presenca} className={estiloDoBotao({ className: 'self-start' })}>
          Continuar a lista
        </Link>
      </>
    )
  } else {
    const foram = lista?.foram ?? 0
    corpo = (
      <>
        <p className="flex items-center gap-2 text-base font-semibold text-sucesso">
          <Check aria-hidden className="size-5 shrink-0" />
          {`Lista concluída em ${instanteCurto(lista?.concluidaEm ?? '', fuso)}`}
        </p>
        <p className="text-base text-texto">
          {foram === 0
            ? 'Ninguém foi ao evento: nenhum ponto foi para o ranking.'
            : `${foram === 1 ? '1 desbravador foi' : `${foram} desbravadores foram`}, ${lista?.uniformizados ?? 0} de ${uniforme}. Os pontos já estão no ranking de ${nomeDoMes(evento.inicio)}.`}
        </p>
        <Link to={presenca} className={estiloDoBotao({ variante: 'secundario', className: 'self-start' })}>
          Corrigir a lista
        </Link>
      </>
    )
  }

  return (
    <section aria-label="Quem foi ao evento">
      <Cartao className="flex flex-col gap-3">
        <h2 className="font-titulo text-lg font-bold text-texto">Quem foi ao evento</h2>
        {corpo}
      </Cartao>
    </section>
  )
}

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
  const encontro = evento.classeBiblica
  const mes = `${CALENDARIO}?mes=${evento.inicio.slice(0, 7)}`
  const voltarPara = useVoltarPara(mes)
  const { avisos, salvo, dispensar } = useAvisosDaFicha()
  const navegar = useNavigate()
  const excluir = useExcluirEvento()
  const configuracao = useConfiguracaoClube()
  const [confirmando, setConfirmando] = useState(false)
  const [erroDaExclusao, setErroDaExclusao] = useState<string | null>(null)
  const ehEspecial = evento.tipo === 'EVENTO_ESPECIAL'
  const situacao = ehEspecial ? situacaoDaLista(evento, hojeDoClube()) : null
  const comBotaoNaLista = situacao === 'SEM_MARCAS' || situacao === 'RASCUNHO' || situacao === 'CONCLUIDA'
  const comPontosNoRanking = desbravadoresComPontos(evento)

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
          encontro ? (
            <Link to={`/adm/classe-biblica/${encontro.edicaoId}`} className={estiloDoBotao()}>
              Abrir a edição
            </Link>
          ) : (
            <>
              <Botao variante="secundario" className="text-perigo" carregando={excluir.isPending} onClick={() => setConfirmando(true)}>
                Excluir
              </Botao>
              <Link to={`${CALENDARIO}/eventos/${evento.id}/editar`} state={{ voltarPara }} className={estiloDoBotao({ variante: comBotaoNaLista ? 'secundario' : 'primario' })}>
                Editar
              </Link>
            </>
          )
        }
      />

      {salvo && (
        <p role="status" className="flex items-start gap-2 text-base font-semibold text-sucesso">
          <Check aria-hidden className="mt-0.5 size-5 shrink-0" />
          Evento salvo. Conselheiros e instrutores o veem ao abrir o app com internet.
        </p>
      )}

      {encontro && <p className="text-base text-texto-2">Para remarcar ou cancelar, abra a edição: o encontro é dela, não do calendário.</p>}

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

      {situacao && <CartaoDaLista evento={evento} situacao={situacao} fuso={configuracao.data?.fuso ?? FUSO_PADRAO_DO_CLUBE} />}

      <section aria-label="Dados do evento">
        <Cartao>
          <ListaDePares
            colunas={3}
            pares={[
              { rotulo: evento.tipo === 'REUNIAO_EXTRA' ? 'Data' : 'Datas', valor: ehEspecial ? datasPorExtensoCompletas(evento.inicio, evento.fim) : periodoPorExtenso(evento.inicio, evento.fim) },
              { rotulo: 'Horário', valor: evento.horario ? horaCurta(evento.horario) : TRACO },
              { rotulo: 'Local', valor: evento.local ?? TRACO },
              ...(encontro
                ? [
                    { rotulo: 'Grupos', valor: encontro.grupos.length > 0 ? juntarNomes(encontro.grupos) : TRACO },
                    ...(encontro.cancelado ? [{ rotulo: 'Situação', valor: textoDoCancelamento(encontro.motivo) }] : []),
                  ]
                : []),
            ]}
          />
        </Cartao>
      </section>

      {ehEspecial && (
        <section aria-label="Pontos e uniforme">
          <Cartao className="flex flex-col gap-4">
            <h2 className="font-titulo text-lg font-bold text-texto">Pontos e uniforme</h2>
            <ListaDePares
              colunas={3}
              pares={[
                { rotulo: 'Pontos por ir ao evento', valor: evento.pontosParticipacao ?? TRACO },
                { rotulo: 'Uniforme', valor: evento.uniforme ? <SeloDoUniforme uniforme={evento.uniforme} /> : TRACO },
                { rotulo: 'Pontos por usar o uniforme', valor: evento.pontosUniforme ?? TRACO },
              ]}
            />
          </Cartao>
        </section>
      )}

      <section aria-label="O que muda no calendário">
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-titulo text-lg font-bold text-texto">O que muda no calendário</h2>
          {encontro ? (
            <p className="text-base text-texto">A reunião e a classe do dia continuam como estão.</p>
          ) : evento.tipo === 'FERIAS' ? (
            <p className="flex items-center gap-2 text-base text-texto">
              <Sun aria-hidden className="size-5 shrink-0 text-[var(--cal-ferias-fg)]" />
              {`Sem reunião e sem classe ${dosDiasDeReuniao(configuracao.data?.diaReuniao).nos} do período; acampamentos continuam valendo.`}
            </p>
          ) : (
            <ListaDePares pares={paresDoQueMuda(evento, configuracao.data?.diaReuniao)} />
          )}
        </Cartao>
      </section>

      {comPontosNoRanking > 0 ? (
        // O botão principal é o seguro; a exclusão fica no corpo, para Esc, o fundo e "Cancelar" nunca a dispararem.
        <Confirmacao
          aberta={confirmando}
          titulo={`Excluir ${evento.nome}?`}
          rotuloConfirmar="Manter o evento"
          aoConfirmar={() => setConfirmando(false)}
          aoCancelar={() => setConfirmando(false)}
        >
          <div className="flex flex-col gap-3">
            <p>{`Os pontos de ${desbravadores(comPontosNoRanking)} saem do ranking de ${nomeDoMes(evento.inicio)} e a lista de quem foi se perde. Não dá para desfazer.`}</p>
            <Botao variante="secundario" largura="total" className="text-perigo" onClick={() => void confirmarExclusao()}>
              Excluir e retirar os pontos
            </Botao>
          </div>
        </Confirmacao>
      ) : (
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
      )}
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
