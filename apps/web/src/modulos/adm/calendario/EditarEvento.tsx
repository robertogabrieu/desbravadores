import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DataCivil } from '@desbravadores/shared'
import { useEvento } from '../../../api/calendario'
import type { AulaAfetada, EventoCalendario, EventoGravado } from '../../../api/calendario'
import { hojeDoClube } from '../../../api/desbravadores'
import { useConexao } from '../../../offline'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { juntarNomes } from '../formatos'
import { useVoltarPara } from '../navegacao'
import { diaEMes } from './datas'
import { EscolhaDoTipo } from './EscolhaDoTipo'
import { FormularioEvento, tipoDoEndereco } from './FormularioEvento'
import type { TipoDeEvento } from './tipos'

const CALENDARIO = '/adm/calendario'
const NAO_ENCONTRADO = { para: CALENDARIO, rotulo: 'Ver o calendário' }

/** "2 classes estavam marcadas nessas datas: Amigo (17/10) e Companheiro (18/10). Os instrutores foram avisados." */
export function textoDasAulasAfetadas(aulas: AulaAfetada[]): string {
  const lista = juntarNomes(aulas.map((aula) => `${aula.classe.nome} (${diaEMes(aula.data)})`))
  const inicio = aulas.length === 1 ? '1 classe estava marcada' : `${aulas.length} classes estavam marcadas`
  return `${inicio} nessas datas: ${lista}. Os instrutores foram avisados.`
}

const mesDe = (data: string): string => `${CALENDARIO}?mes=${data.slice(0, 7)}`

/** Atende `/novo` (sem `:id`) e `/:id/editar`; sair sem salvar não pergunta nada. */
export function EditarEvento() {
  const { id } = useParams()
  const editando = id !== undefined
  const [parametros] = useSearchParams()
  const navegar = useNavigate()
  const local = useLocation()
  const estadoDeChegada: unknown = local.state
  const consulta = useEvento(id ?? '', editando)
  const raiz = useRef<HTMLDivElement>(null)
  const { modo } = useConexao()

  const dataPedida = DataCivil.safeParse(parametros.get('data'))
  const dataInicial = dataPedida.success ? dataPedida.data : hojeDoClube()
  const voltarPadrao = mesDe(editando ? (consulta.data?.inicio ?? dataInicial) : dataInicial)
  const voltarPara = useVoltarPara(voltarPadrao)

  const aoGravar = (gravado: EventoGravado) =>
    void navegar(`${CALENDARIO}/eventos/${gravado.evento.id}`, {
      replace: true,
      state: {
        voltarPara,
        salvo: true,
        avisos: gravado.aulasAfetadas.length > 0 ? [textoDasAulasAfetadas(gravado.aulasAfetadas)] : [],
      },
    })

  // A escolha e o formulário são a mesma rota; o tipo vai em `?tipo=` e o resto do endereço (a data) segue junto.
  const tipoEscolhido = tipoDoEndereco(parametros.get('tipo'))
  const enderecoComTipo = (tipo: TipoDeEvento | null): string => {
    const restante = new URLSearchParams(parametros)
    restante.delete('tipo')
    if (tipo) restante.set('tipo', tipo)
    const busca = restante.toString()
    return busca ? `${local.pathname}?${busca}` : local.pathname
  }

  // O cartão da escolha desmonta ao abrir o formulário: o foco iria para o body.
  const abriuComTipo = !editando && tipoEscolhido !== null
  useEffect(() => {
    if (!abriuComTipo) return
    const titulo = raiz.current?.querySelector('h1')
    titulo?.setAttribute('tabindex', '-1')
    titulo?.classList.add('outline-none')
    titulo?.focus()
  }, [abriuComTipo])

  let corpo: ReactNode
  if (!editando && tipoEscolhido) {
    corpo = (
      <>
        <CabecalhoDaPagina voltar={{ para: voltarPara, rotulo: 'Calendário do clube' }} titulo="Novo evento" />
        <FormularioEvento
          key={tipoEscolhido}
          dataInicial={dataInicial}
          cancelar={{ para: voltarPara }}
          aoGravar={aoGravar}
          escolhido={{ tipo: tipoEscolhido, trocar: { para: enderecoComTipo(null), estado: estadoDeChegada } }}
        />
      </>
    )
  } else if (!editando) {
    corpo = <EscolhaDoTipo voltarPara={voltarPara} enderecoDoTipo={(tipo) => enderecoComTipo(tipo)} estado={estadoDeChegada} />
  } else if (consulta.data) {
    corpo = <EdicaoCarregada evento={consulta.data} voltarPara={voltarPara} aoGravar={aoGravar} />
  } else if (consulta.isError && ehNaoEncontrado(consulta.error)) {
    corpo = <EstadoNaoEncontrado registro="este evento" lista={NAO_ENCONTRADO} />
  } else if (modo === 'SEM_CONEXAO') {
    corpo = <DisponivelComInternet />
  } else if (consulta.isError) {
    corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  } else {
    corpo = (
      <Carregando rotulo="Carregando o evento">
        <Esqueleto className="h-20" />
        <Esqueleto className="h-32" />
      </Carregando>
    )
  }

  return (
    <div ref={raiz} className="flex flex-col gap-5 py-4">
      {corpo}
    </div>
  )
}

interface PropriedadesDaEdicao {
  evento: EventoCalendario
  voltarPara: string
  aoGravar: (gravado: EventoGravado) => void
}

function EdicaoCarregada({ evento, voltarPara, aoGravar }: PropriedadesDaEdicao) {
  const ficha = `${CALENDARIO}/eventos/${evento.id}`
  const estado = { voltarPara }
  return (
    <>
      <CabecalhoDaPagina voltar={{ para: ficha, rotulo: evento.nome, estado }} sobretitulo="Editar evento" titulo={evento.nome} />
      <FormularioEvento key={evento.id} evento={evento} dataInicial={evento.inicio} cancelar={{ para: ficha, estado }} aoGravar={aoGravar} />
    </>
  )
}
