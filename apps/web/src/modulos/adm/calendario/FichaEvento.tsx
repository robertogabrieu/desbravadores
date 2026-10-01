import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
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
import { lerErroDaApi } from '../desbravadores/erros'
import { horaCurta, juntarNomes, periodoPorExtenso } from '../formatos'
import { useAvisosDaFicha, useVoltarPara } from '../navegacao'
import { ROTULOS_DO_TIPO } from './tipos'

const CALENDARIO = '/adm/calendario'
const TRACO = '—'

const simOuNao = (valor: boolean): string => (valor ? 'Sim' : 'Não')

/** Os domingos de `inicio` a `fim` (AAAA-MM-DD), como número do dia: sex 16 a dom 18 → [18]. */
function domingosDoPeriodo(inicio: string, fim: string): number[] {
  const domingos: number[] = []
  const dia = new Date(`${inicio}T00:00:00Z`)
  const ultimo = new Date(`${fim}T00:00:00Z`)
  for (; dia <= ultimo; dia.setUTCDate(dia.getUTCDate() + 1)) {
    if (dia.getUTCDay() === 0) domingos.push(dia.getUTCDate())
  }
  return domingos
}

/** "Cancela a reunião de domingo 18"; sem domingo no período (ou sem cancelar), o rótulo simples. */
function rotuloDoCancelamento(evento: EventoCalendario): string {
  const domingos = evento.cancelaReuniao ? domingosDoPeriodo(evento.inicio, evento.fim) : []
  if (domingos.length === 0) return 'Cancela a reunião'
  return domingos.length === 1
    ? `Cancela a reunião de domingo ${domingos[0]}`
    : `Cancela as reuniões de domingo ${juntarNomes(domingos.map(String))}`
}

function Conteudo({ evento }: { evento: EventoCalendario }) {
  const mes = `${CALENDARIO}?mes=${evento.inicio.slice(0, 7)}`
  const voltarPara = useVoltarPara(mes)
  const { avisos, dispensar } = useAvisosDaFicha()
  const navegar = useNavigate()
  const excluir = useExcluirEvento()
  const [confirmando, setConfirmando] = useState(false)
  const [erroDaExclusao, setErroDaExclusao] = useState<string | null>(null)

  async function confirmarExclusao() {
    setErroDaExclusao(null)
    setConfirmando(false)
    try {
      await excluir.mutateAsync(evento.id)
      void navegar(mes, { replace: true })
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
        <section aria-label="Aulas afetadas" className="flex flex-col gap-2">
          <h2 className="font-titulo text-lg font-bold text-texto">Aulas afetadas</h2>
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
              { rotulo: 'Datas', valor: periodoPorExtenso(evento.inicio, evento.fim) },
              { rotulo: 'Horário', valor: evento.horario ? horaCurta(evento.horario) : TRACO },
              { rotulo: 'Local', valor: evento.local ?? TRACO },
            ]}
          />
        </Cartao>
      </section>

      <section aria-label="O que muda no calendário">
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-titulo text-lg font-bold text-texto">O que muda no calendário</h2>
          <ListaDePares
            pares={[
              { rotulo: rotuloDoCancelamento(evento), valor: simOuNao(evento.cancelaReuniao) },
              { rotulo: 'Bloqueia aulas nessas datas', valor: simOuNao(evento.bloqueiaAula) },
              { rotulo: 'Bom para requisitos de campo', valor: simOuNao(evento.bomParaCampo) },
            ]}
          />
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

  return <div className="flex flex-col gap-4 p-4">{corpo}</div>
}
