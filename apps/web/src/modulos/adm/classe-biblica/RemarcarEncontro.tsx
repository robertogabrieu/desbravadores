import { hojeNoFuso } from '@desbravadores/shared'
import { Check, CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCancelarEncontroCB, useDesfazerCancelamentoCB, useEncontroCB, useRemarcarEncontroCB } from '../../../api/classe-biblica'
import type { DetalheDoEncontro } from '../../../api/classe-biblica'
import { ErroDaApi } from '../../../api/cliente'
import { useConexao } from '../../../offline'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Campo } from '../../../ui/Campo'
import { CampoData } from '../../../ui/CampoData'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { FUSO_PADRAO_DO_CLUBE } from '../formatos'
import { DIAS_DA_SEMANA, diaDaSemanaDaData, diaMes } from './useRascunhoDaEdicao'

type Opcao = 'remarcar' | 'cancelar'

const diaDaSemanaDe = (data: string): number => new Date(`${data}T12:00:00Z`).getUTCDay()
const mensagemDe = (falha: Error | null): string | null =>
  falha === null ? null : falha instanceof ErroDaApi ? falha.erro.mensagem : 'Não deu para gravar agora. Tente de novo.'

/** O que a data escolhida significa: recusa (não se envia), aviso (deixa seguir) ou livre. */
type Leitura = { tipo: 'recusa'; texto: string } | { tipo: 'aviso'; texto: string } | { tipo: 'livre'; texto: string }

function lerData(data: string, detalhe: DetalheDoEncontro, hoje: string): Leitura {
  const { edicao, encontro, ocupadas, avisos } = detalhe
  if (data < hoje) return { tipo: 'recusa', texto: 'Escolha uma data a partir de hoje.' }
  if (data < edicao.inicio || data > edicao.fim) {
    return { tipo: 'recusa', texto: `Escolha uma data entre ${diaMes(edicao.inicio)} e ${diaMes(edicao.fim)}, o período da edição.` }
  }
  if (data === encontro.data) return { tipo: 'recusa', texto: 'O encontro já está nesta data. Escolha outra.' }
  if (ocupadas.includes(data)) return { tipo: 'recusa', texto: `Já há outro encontro desta edição em ${diaMes(data)}.` }
  const aviso = avisos.find((item) => item.data === data)
  if (aviso) return { tipo: 'aviso', texto: `${diaMes(data)} cai em ${aviso.motivo}.` }
  return { tipo: 'livre', texto: `${DIAS_DA_SEMANA[diaDaSemanaDe(data)]}, ${diaMes(data)} — dia livre no calendário` }
}

function valeParaOsGrupos(grupos: string[]): string {
  if (grupos.length === 1) return `Vale para o ${grupos[0]}.`
  if (grupos.length === 2) return 'Vale para os dois grupos.'
  return `Vale para os ${grupos.length} grupos.`
}

function Formulario({ detalhe }: { detalhe: DetalheDoEncontro }) {
  const { encontro, edicao } = detalhe
  const navegar = useNavigate()
  const { modo } = useConexao()
  const semConexao = modo === 'SEM_CONEXAO'
  const [opcao, setOpcao] = useState<Opcao>('remarcar')
  const [data, setData] = useState('')
  const [horario, setHorario] = useState(encontro.horario)
  const [faltaData, setFaltaData] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroDoMotivo, setErroDoMotivo] = useState<string>()
  const [confirmando, setConfirmando] = useState(false)
  const remarcar = useRemarcarEncontroCB()
  const cancelar = useCancelarEncontroCB()

  const hoje = hojeNoFuso(FUSO_PADRAO_DO_CLUBE, new Date())
  const leitura = data ? lerData(data, detalhe, hoje) : null
  const voltarAoPainel = () => navegar(`/adm/classe-biblica/${edicao.id}`)
  const dataDoEncontro = diaMes(encontro.data)

  const enviarRemarcacao = () => {
    if (!data) return setFaltaData(true)
    if (!leitura || leitura.tipo === 'recusa') return
    const entrada = horario && horario !== encontro.horario ? { data, horario } : { data }
    remarcar.mutate({ id: encontro.id, entrada }, { onSuccess: voltarAoPainel })
  }

  const pedirConfirmacao = () => {
    if (!motivo.trim()) return setErroDoMotivo('Escreva o motivo')
    setErroDoMotivo(undefined)
    setConfirmando(true)
  }

  const confirmarCancelamento = () => {
    cancelar.mutate({ id: encontro.id, entrada: { motivo: motivo.trim() } }, { onSuccess: voltarAoPainel })
  }

  const rotuloDoRemarcar = leitura && leitura.tipo !== 'recusa'
    ? `Remarcar para ${diaDaSemanaDaData(data)}, ${diaMes(data)}`
    : 'Remarcar'
  const erroDaData = faltaData && !data ? 'Escolha a nova data.' : leitura?.tipo === 'recusa' ? leitura.texto : undefined
  const falhaAoGravar = mensagemDe(opcao === 'remarcar' ? remarcar.error : null)

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-base font-semibold text-texto">O que vai acontecer com este encontro?</legend>

        <div className="flex flex-col gap-4 rounded-cartao border border-borda-controle bg-superficie p-4">
          <label className="flex min-h-[var(--touch-min)] cursor-pointer items-center gap-3 text-base font-semibold text-texto">
            <input type="radio" name="opcao" className="size-5" checked={opcao === 'remarcar'} onChange={() => setOpcao('remarcar')} />
            Remarcar para outra data
          </label>
          {opcao === 'remarcar' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <CampoData
                  rotulo="Nova data"
                  min={hoje > edicao.inicio ? hoje : edicao.inicio}
                  max={edicao.fim}
                  value={data}
                  erro={erroDaData}
                  onChange={(e) => { setData(e.target.value); setFaltaData(false) }}
                />
                {leitura?.tipo === 'livre' && (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-sucesso">
                    <Check aria-hidden className="size-4" />
                    {leitura.texto}
                  </p>
                )}
                {leitura?.tipo === 'aviso' && <FaixaAviso>{leitura.texto}</FaixaAviso>}
              </div>
              <Campo rotulo="Horário" type="time" className="w-40" value={horario} onChange={(e) => setHorario(e.target.value)} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-cartao border border-borda-controle bg-superficie p-4">
          <label className="flex min-h-[var(--touch-min)] cursor-pointer items-center gap-3 text-base font-semibold text-texto">
            <input type="radio" name="opcao" className="size-5" checked={opcao === 'cancelar'} onChange={() => setOpcao('cancelar')} />
            Cancelar este encontro
          </label>
          {opcao === 'cancelar' && (
            <div className="flex flex-col gap-3">
              <Campo
                rotulo="Motivo (aparece no calendário)"
                maxLength={120}
                value={motivo}
                erro={erroDoMotivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <p className="text-base text-texto-2">O encontro sai das contas de frequência. Dá para desfazer até a data dele.</p>
            </div>
          )}
        </div>
      </fieldset>

      {semConexao && <p className="text-sm font-medium text-alerta">Sem internet: a mudança só vai com conexão.</p>}
      {falhaAoGravar && <p role="alert" className="text-sm font-medium text-perigo">{falhaAoGravar}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {opcao === 'remarcar' ? (
          <Botao carregando={remarcar.isPending} disabled={semConexao} onClick={enviarRemarcacao}>{rotuloDoRemarcar}</Botao>
        ) : (
          <Botao variante="perigo" disabled={semConexao} onClick={pedirConfirmacao}>{`Cancelar o encontro de ${dataDoEncontro}`}</Botao>
        )}
        <Link to={`/adm/classe-biblica/${edicao.id}`} className={estiloDoBotao({ variante: 'secundario' })}>Voltar sem mudar</Link>
      </div>

      <Confirmacao
        aberta={confirmando}
        titulo={`Cancelar o encontro de ${dataDoEncontro}?`}
        rotuloConfirmar="Cancelar o encontro"
        rotuloCancelar="Voltar"
        perigo
        ocupada={cancelar.isPending}
        erro={mensagemDe(cancelar.error)}
        aoConfirmar={confirmarCancelamento}
        aoCancelar={() => { setConfirmando(false); cancelar.reset() }}
      >
        {`Vale para todos os grupos. No calendário, o encontro aparece riscado com "Cancelado: ${motivo.trim()}". Dá para desfazer até ${dataDoEncontro}.`}
      </Confirmacao>
    </div>
  )
}

function Cancelado({ detalhe }: { detalhe: DetalheDoEncontro }) {
  const { encontro, edicao } = detalhe
  const navegar = useNavigate()
  const desfazer = useDesfazerCancelamentoCB()
  const falha = mensagemDe(desfazer.error)
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base font-semibold text-texto">{`Este encontro foi cancelado: ${encontro.motivo ?? 'sem motivo'}.`}</p>
      {encontro.podeDesfazer ? (
        <>
          <p className="text-base text-texto-2">{`Desfazer o cancelamento traz o encontro de volta para ${diaMes(encontro.data)}, nas contas e no calendário.`}</p>
          {falha && <p role="alert" className="text-sm font-medium text-perigo">{falha}</p>}
          <Botao
            className="w-fit"
            carregando={desfazer.isPending}
            onClick={() => desfazer.mutate({ id: encontro.id, entrada: null }, { onSuccess: () => navegar(`/adm/classe-biblica/${edicao.id}`) })}
          >
            Desfazer o cancelamento
          </Botao>
        </>
      ) : (
        <p className="text-base text-texto-2">O cancelamento só se desfaz até a data do encontro, e se nenhum outro encontro da edição estiver nessa data.</p>
      )}
    </div>
  )
}

function Conteudo({ detalhe }: { detalhe: DetalheDoEncontro }) {
  const { encontro, edicao, grupos } = detalhe
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDaPagina
        voltar={{ para: `/adm/classe-biblica/${edicao.id}`, rotulo: edicao.nome }}
        sobretitulo={edicao.nome}
        titulo={`Encontro de ${diaDaSemanaDaData(encontro.data)}, ${diaMes(encontro.data)}`}
        apoio={encontro.temChamada ? undefined : <span>{`${valeParaOsGrupos(grupos)} O calendário do clube muda junto.`}</span>}
      />
      {encontro.temChamada ? (
        <p className="flex items-start gap-2 text-base font-medium text-texto">
          <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-alerta" />
          <span>{`O encontro de ${diaMes(encontro.data)} já tem chamada feita, por isso não dá para remarcar nem cancelar.`}</span>
        </p>
      ) : encontro.cancelado ? (
        <Cancelado detalhe={detalhe} />
      ) : (
        <Formulario detalhe={detalhe} />
      )}
    </div>
  )
}

/** Remarcar, cancelar ou desfazer o cancelamento de um encontro da Classe Bíblica (regra 7). */
export function RemarcarEncontro() {
  const { id = '' } = useParams()
  const encontro = useEncontroCB(id)
  const { modo } = useConexao()
  return (
    <div className="flex flex-col gap-5 py-4">
      {encontro.isError && <ErroDeCarga erro={encontro.error} aoTentarDeNovo={() => void encontro.refetch()} />}
      {encontro.isPending && (modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando o encontro" />)}
      {encontro.data && <Conteudo detalhe={encontro.data} />}
    </div>
  )
}
