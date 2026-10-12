import { Check, Shirt } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useEvento } from '../../../../api/calendario'
import type { EventoCalendario } from '../../../../api/calendario'
import { useConfiguracaoClube } from '../../../../api/clube'
import { ErroDaApi } from '../../../../api/cliente'
import { useConcluirLista } from '../../../../api/presenca'
import type { LinhaDaPresenca, UnidadeDaPresenca } from '../../../../api/presenca'
import { useLarguraMenorQue } from '../../../../layouts/useLarguraMenorQue'
import { useConexao } from '../../../../offline'
import { Botao, estiloDoBotao } from '../../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../../ui/CabecalhoDaPagina'
import { Campo } from '../../../../ui/Campo'
import { Esqueleto } from '../../../../ui/Esqueleto'
import { Carregando, DisponivelComInternet } from '../../../../ui/EstadosDeCarga'
import { EstadoVazio } from '../../../../ui/EstadoVazio'
import { FaixaAviso } from '../../../../ui/FaixaAviso'
import { ehNaoEncontrado } from '../../../../ui/EstadoNaoEncontrado'
import { LARGURA_DO_CELULAR } from '../../../../ui/larguraDoCelular'
import { semAcento } from '../../../progresso/formatos'
import { FUSO_PADRAO_DO_CLUBE, dataPorExtenso, juntarNomes } from '../../formatos'
import { MESES } from '../datas'
import { AvisoDeListaMudou, ConfirmarConclusaoSemNinguem, ConfirmarTirada, pontosQueSaem } from './DialogosDaPresenca'
import type { PedidoDeTirada, ValoresDoEvento } from './DialogosDaPresenca'
import { LinhaDeMarca } from './LinhaDeMarca'
import type { NomeDoUniforme, ToquesDaLinha } from './LinhaDeMarca'
import { SecaoDaUnidade } from './SecaoDaUnidade'
import { TabelaDePresenca } from './TabelaDePresenca'
import { useMarcasDaPresenca } from './useMarcasDaPresenca'

const CALENDARIO = '/adm/calendario'
const SEM_UNIDADE = 'sem-unidade'

const NOME_DO_UNIFORME: Record<'GALA' | 'CAMPO', NomeDoUniforme> = { GALA: 'gala', CAMPO: 'campo' }

const nomeDoMes = (data: string): string => (MESES[Number(data.slice(5, 7)) - 1] ?? '').toLowerCase()
const diaPorExtenso = (data: string): string => dataPorExtenso(data).replace(/^./, (letra) => letra.toLowerCase())
const chaveDaUnidade = (unidade: UnidadeDaPresenca): string => unidade.unidadeId ?? SEM_UNIDADE

function horaNoFuso(instante: Date, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instante)
}

/** Escrito, com camisa e contorno (cheio na gala, tracejado no campo): o uniforme nunca depende da cor. */
function SeloDoUniforme({ uniforme }: { uniforme: NomeDoUniforme }) {
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 border-borda-controle bg-superficie px-3 py-0.5 text-base font-bold text-texto ${uniforme === 'gala' ? 'border-solid' : 'border-dashed'}`}
    >
      <Shirt aria-hidden className="size-4 shrink-0" />
      {`Uniforme de ${uniforme}`}
    </span>
  )
}

/** O efeito dito antes do botão: quem ganha o quê quando a lista for concluída. */
function efeitoDeConcluir(foram: number, uniformizados: number, uniforme: NomeDoUniforme): string {
  if (foram === 0) return 'Ninguém foi marcado ainda. Se concluir assim, o evento fica sem pontos para ninguém.'
  const quem = foram === 1 ? 'o 1 que foi ganha' : `os ${foram} que foram ganham`
  const doUniforme = uniformizados === 0 ? '' : `, e ${uniformizados === 1 ? 'o 1' : `os ${uniformizados}`} de ${uniforme} ${uniformizados === 1 ? 'ganha' : 'ganham'} também os do uniforme`
  return `Ao concluir, ${quem} os pontos de ir ao evento${doUniforme}. Depois você ainda pode corrigir a lista.`
}

const quantosForam = (foram: number): string => (foram === 1 ? '1 desbravador foi' : `${foram} desbravadores foram`)

function EventoNaoEncontrado() {
  return (
    <EstadoVazio
      titulo="Não encontramos este evento"
      descricao="Ele pode ter sido excluído, ou não ter lista de quem foi. Volte ao calendário e escolha o evento de novo."
      acao={
        <Link to={CALENDARIO} className={estiloDoBotao({ variante: 'secundario' })}>
          Voltar ao calendário
        </Link>
      }
    />
  )
}

function ErroAoAbrir({ aoTentarDeNovo }: { aoTentarDeNovo: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 mx-6 my-10 text-center">
      <p className="text-base font-semibold text-perigo">Não conseguimos abrir a lista agora. Confira a internet e tente de novo.</p>
      <Botao variante="secundario" onClick={aoTentarDeNovo}>
        Tentar de novo
      </Botao>
    </div>
  )
}

interface PropriedadesDaLista {
  evento: EventoCalendario
}

function ListaDoEvento({ evento }: PropriedadesDaLista) {
  const uniforme = NOME_DO_UNIFORME[evento.uniforme ?? 'GALA']
  const mes = nomeDoMes(evento.inicio)
  const valores: ValoresDoEvento = { pontosParticipacao: evento.pontosParticipacao ?? 0, pontosUniforme: evento.pontosUniforme ?? 0, uniforme, mes }
  const voltar = `${CALENDARIO}/eventos/${evento.id}`

  const { consulta, marcaDe, marcar, marcarEmMassa, tentarDeNovo, salvoAs, pendentes, idsPendentes, totais } = useMarcasDaPresenca(evento.id)
  const configuracao = useConfiguracaoClube()
  const concluir = useConcluirLista(evento.id)
  const { modo } = useConexao()
  const semInternet = modo === 'SEM_CONEXAO'
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)

  const [busca, setBusca] = useState('')
  const [abertas, setAbertas] = useState<Set<string> | null>(null)
  const [tirada, setTirada] = useState<PedidoDeTirada | null>(null)
  const [concluindoSemNinguem, setConcluindoSemNinguem] = useState(false)
  const [recusa, setRecusa] = useState<{ mensagem: string; listaMudou: boolean } | null>(null)
  const tituloDoFechamento = useRef<HTMLHeadingElement>(null)
  const focarNoFechamento = useRef(false)

  const dados = consulta.data
  const concluida = dados?.listaConcluidaEm != null

  useEffect(() => {
    if (concluida && focarNoFechamento.current) {
      focarNoFechamento.current = false
      tituloDoFechamento.current?.focus()
    }
  }, [concluida])

  const cabecalho = (
    <CabecalhoDaPagina
      voltar={{ para: voltar, rotulo: evento.nome }}
      titulo="Quem foi"
      apoio={
        <>
          <span>{`${evento.nome} · ${diaPorExtenso(evento.inicio)}`}</span>
          <SeloDoUniforme uniforme={uniforme} />
        </>
      }
    />
  )

  if (!dados) {
    if (consulta.isError && ehNaoEncontrado(consulta.error)) {
      return <EventoNaoEncontrado />
    }
    let corpo: ReactNode
    if (semInternet) corpo = <DisponivelComInternet />
    else if (consulta.isError)
      corpo = <ErroAoAbrir aoTentarDeNovo={() => void consulta.refetch()} />
    else
      corpo = (
        <Carregando rotulo="Carregando a lista">
          <Esqueleto className="h-16" />
          <Esqueleto className="h-16" />
          <Esqueleto className="h-16" />
          <Esqueleto className="h-16" />
        </Carregando>
      )
    return (
      <>
        {cabecalho}
        {corpo}
      </>
    )
  }

  if (!dados.aberta) {
    return (
      <>
        {cabecalho}
        <EstadoVazio
          titulo="A lista abre no dia do evento"
          descricao={`${evento.nome} é ${diaPorExtenso(evento.inicio)}. A lista abre nesse dia.`}
          acao={
            <Link to={voltar} className={estiloDoBotao({ variante: 'secundario' })}>
              Ver o evento
            </Link>
          }
        />
      </>
    )
  }

  if (dados.unidades.length === 0 || totais.total === 0) {
    return (
      <>
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum desbravador ativo no clube"
          descricao="A lista mostra os desbravadores ativos. Cadastre o primeiro para marcar quem foi ao evento."
          acao={
            <Link to="/adm/desbravadores/novo" className={estiloDoBotao()}>
              Cadastrar desbravador
            </Link>
          }
        />
      </>
    )
  }

  const unidades = dados.unidades
  const todas = unidades.flatMap((unidade) => unidade.linhas)
  const nomes = new Map(todas.map((linha) => [linha.dbvId, linha.nome]))
  const buscando = busca.trim() !== ''
  const termo = semAcento(busca.trim())
  const abertasAgora = abertas ?? new Set(concluida || !unidades[0] ? [] : [chaveDaUnidade(unidades[0])])
  const visiveis = unidades
    .map((unidade) => ({ unidade, linhas: buscando ? unidade.linhas.filter((linha) => semAcento(linha.nome).includes(termo)) : unidade.linhas }))
    .filter(({ linhas }) => !buscando || linhas.length > 0)
  const fuso = configuracao.data?.fuso ?? FUSO_PADRAO_DO_CLUBE
  const salvando = idsPendentes.filter((dbvId) => marcaDe(dbvId).situacao === 'salvando').length

  function alternar(chave: string) {
    const novas = new Set(abertasAgora)
    if (!novas.delete(chave)) novas.add(chave)
    setAbertas(novas)
  }

  function aoTocarNome(linha: LinhaDaPresenca) {
    const marca = marcaDe(linha.dbvId)
    if (!marca.foi) return marcar(linha.dbvId, { foi: true })
    const pedido: PedidoDeTirada = { tipo: 'pessoa', dbvId: linha.dbvId, nome: linha.nome, comUniforme: marca.comUniforme }
    if (concluida && pontosQueSaem(pedido, valores) > 0) return setTirada(pedido)
    marcar(linha.dbvId, { foi: false })
  }

  function aoTocarUniforme(linha: LinhaDaPresenca) {
    const marca = marcaDe(linha.dbvId)
    if (!marca.comUniforme) return marcar(linha.dbvId, { comUniforme: true })
    const pedido: PedidoDeTirada = { tipo: 'uniforme', dbvId: linha.dbvId, nome: linha.nome, comUniforme: true }
    if (concluida && pontosQueSaem(pedido, valores) > 0) return setTirada(pedido)
    marcar(linha.dbvId, { comUniforme: false })
  }

  function tirar(pedido: PedidoDeTirada) {
    setTirada(null)
    marcar(pedido.dbvId, pedido.tipo === 'pessoa' ? { foi: false } : { comUniforme: false })
  }

  const toquesDe = (dbvId: string): ToquesDaLinha => {
    const linha = todas.find((candidata) => candidata.dbvId === dbvId)
    return {
      aoTocarNome: () => linha && aoTocarNome(linha),
      aoTocarUniforme: () => linha && aoTocarUniforme(linha),
      aoTentarDeNovo: () => tentarDeNovo(dbvId),
    }
  }

  async function concluirAgora() {
    setConcluindoSemNinguem(false)
    setRecusa(null)
    try {
      focarNoFechamento.current = true
      await concluir.mutateAsync({ foram: totais.foram, uniformizados: totais.uniformizados })
    } catch (falha) {
      focarNoFechamento.current = false
      if (falha instanceof ErroDaApi && falha.status === 422) setRecusa({ mensagem: falha.erro.mensagem, listaMudou: true })
      else setRecusa({ mensagem: 'Não foi possível concluir agora. Confira a internet e tente de novo.', listaMudou: false })
    }
  }

  function aoConcluir() {
    if (totais.foram === 0) setConcluindoSemNinguem(true)
    else void concluirAgora()
  }

  function verALista() {
    setRecusa(null)
    void consulta.refetch()
  }

  const statusDoSalvamento = salvando > 0 ? 'Salvando…' : pendentes === 0 && salvoAs ? `Salvo às ${horaNoFuso(salvoAs, fuso)}.` : ''

  const faixaSemInternet = semInternet && (
    <FaixaAviso>
      {pendentes === 0
        ? 'Sem internet. Conecte-se para marcar mais gente. O que você marcou antes já está salvo.'
        : `Sem internet. ${pendentes === 1 ? '1 marca ainda não foi salva' : `${pendentes} marcas ainda não foram salvas`}: ${juntarNomes(idsPendentes.map((dbvId) => nomes.get(dbvId) ?? ''))}. Quando a internet voltar, toque em “Tentar de novo”. Se você fechar esta tela antes, ${pendentes === 1 ? 'essa marca se perde' : `essas ${pendentes} marcas se perdem`}.`}
    </FaixaAviso>
  )

  const contagens = (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <p className="font-titulo text-xl font-extrabold text-texto">{`${totais.foram} de ${totais.total} foram`}</p>
      <p className="text-lg font-bold text-texto">{`${totais.uniformizados} de ${uniforme}`}</p>
      <p role="status" aria-live="polite" className="flex min-h-6 items-center gap-1.5 text-sm text-texto-2">
        {statusDoSalvamento && <Check aria-hidden className="size-4 shrink-0" />}
        {statusDoSalvamento}
      </p>
    </div>
  )

  const parados = semInternet || pendentes > 0
  const emMassa = !concluida && (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <Botao variante="secundario" disabled={parados} onClick={() => marcarEmMassa(todas.filter((linha) => !marcaDe(linha.dbvId).foi).map((linha) => ({ dbvId: linha.dbvId, foi: true })))}>
        Marcar todos como presentes
      </Botao>
      <Botao
        variante="secundario"
        disabled={parados}
        onClick={() =>
          marcarEmMassa(
            todas
              .filter((linha) => {
                const marca = marcaDe(linha.dbvId)
                return marca.foi && !marca.comUniforme
              })
              .map((linha) => ({ dbvId: linha.dbvId, comUniforme: true })),
          )
        }
      >
        {`Marcar de ${uniforme} todos que foram`}
      </Botao>
    </div>
  )

  const campoDeBusca = (
    <Campo
      type="search"
      rotulo="Buscar pelo nome"
      value={busca}
      onChange={(entrada) => setBusca(entrada.target.value)}
      className={celular ? undefined : 'max-w-sm'}
    />
  )

  const secoes =
    visiveis.length === 0 ? (
      <div className="flex flex-col items-center gap-3 mx-6 my-8 text-center">
        <p className="text-base text-texto">{`Ninguém com “${busca.trim()}” na lista.`}</p>
        <Botao variante="secundario" onClick={() => setBusca('')}>
          Limpar a busca
        </Botao>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        {visiveis.map(({ unidade, linhas }) => {
          const chave = chaveDaUnidade(unidade)
          const foram = unidade.linhas.filter((linha) => marcaDe(linha.dbvId).foi).length
          const uniformizados = unidade.linhas.filter((linha) => marcaDe(linha.dbvId).foi && marcaDe(linha.dbvId).comUniforme).length
          return (
            <SecaoDaUnidade
              key={chave}
              nome={unidade.nome}
              foram={foram}
              uniformizados={uniformizados}
              total={unidade.linhas.length}
              uniforme={uniforme}
              aberta={abertasAgora.has(chave)}
              fixa={buscando}
              aoAlternar={() => alternar(chave)}
            >
              {celular ? (
                <ul className="flex flex-col gap-1">
                  {linhas.map((linha) => (
                    <LinhaDeMarca key={linha.dbvId} nome={linha.nome} marca={marcaDe(linha.dbvId)} uniforme={uniforme} semInternet={semInternet} {...toquesDe(linha.dbvId)} />
                  ))}
                </ul>
              ) : (
                <TabelaDePresenca linhas={linhas} uniforme={uniforme} semInternet={semInternet} marcaDe={marcaDe} toquesDe={toquesDe} />
              )}
            </SecaoDaUnidade>
          )
        })}
      </div>
    )

  const fechamento = concluida ? (
    <>
      <section aria-labelledby="lista-concluida" className="flex flex-col gap-2 rounded-cartao border border-borda-controle bg-superficie p-4">
        <h2 id="lista-concluida" ref={tituloDoFechamento} tabIndex={-1} className="flex items-center gap-2 font-titulo text-xl font-bold text-sucesso outline-none">
          <Check aria-hidden className="size-6 shrink-0" />
          Lista concluída
        </h2>
        <p className="text-base text-texto">{`${quantosForam(totais.foram)}, ${totais.uniformizados} de ${uniforme}. Os pontos já estão no ranking de ${mes}.`}</p>
        <p className="text-base text-texto-2">Para corrigir, abra a unidade e mude a marca. É salvo na hora e os pontos acompanham.</p>
      </section>
      {contagens}
      {faixaSemInternet}
      {campoDeBusca}
      {secoes}
      <Link to={voltar} className={estiloDoBotao({ className: 'self-start' })}>
        Voltar ao evento
      </Link>
    </>
  ) : (
    <>
      <p className="text-base text-texto-2">{`${celular ? 'Toque no nome de quem foi' : 'Marque quem foi'}. Depois marque quem veio de ${uniforme}. Tudo é salvo sozinho: pode sair e voltar.`}</p>
      {contagens}
      {faixaSemInternet}
      {emMassa}
      {campoDeBusca}
      {secoes}
      <div className="flex flex-col gap-3 border-t border-borda pt-4">
        <p className="text-base text-texto">{efeitoDeConcluir(totais.foram, totais.uniformizados, uniforme)}</p>
        {recusa &&
          (recusa.listaMudou ? (
            <AvisoDeListaMudou mensagem={recusa.mensagem} aoVerALista={verALista} />
          ) : (
            <p role="alert" className="text-sm font-medium text-perigo">
              {recusa.mensagem}
            </p>
          ))}
        <Botao largura={celular ? 'total' : 'auto'} className={celular ? undefined : 'self-start'} carregando={concluir.isPending} disabled={parados} onClick={aoConcluir}>
          Concluir a lista
        </Botao>
      </div>
    </>
  )

  return (
    <>
      {cabecalho}
      {fechamento}
      <ConfirmarTirada pedido={tirada} valores={valores} aoManter={() => setTirada(null)} aoTirar={tirar} />
      <ConfirmarConclusaoSemNinguem aberta={concluindoSemNinguem} ocupada={concluir.isPending} aoVoltar={() => setConcluindoSemNinguem(false)} aoConcluir={() => void concluirAgora()} />
    </>
  )
}

/** A lista "Quem foi" de um evento especial: o Adm marca quem foi e quem veio de uniforme, e conclui para os pontos entrarem no ranking. */
export function PresencaDoEvento() {
  const { id = '' } = useParams()
  const evento = useEvento(id)
  const { modo } = useConexao()

  let corpo: ReactNode
  if (evento.data && evento.data.tipo === 'EVENTO_ESPECIAL') corpo = <ListaDoEvento evento={evento.data} />
  else if (evento.data || (evento.isError && ehNaoEncontrado(evento.error)))
    corpo = <EventoNaoEncontrado />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (evento.isError)
    corpo = <ErroAoAbrir aoTentarDeNovo={() => void evento.refetch()} />
  else
    corpo = (
      <Carregando rotulo="Carregando a lista">
        <Esqueleto className="h-16" />
        <Esqueleto className="h-16" />
        <Esqueleto className="h-16" />
      </Carregando>
    )

  return <div className="flex flex-col gap-4 py-4">{corpo}</div>
}
