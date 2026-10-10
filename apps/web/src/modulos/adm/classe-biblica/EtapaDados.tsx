import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Horario } from '@desbravadores/shared'
import { useEdicoesCB, usePainelDaEdicao } from '../../../api/classe-biblica'
import type { EdicaoCB, RascunhoDaEdicao } from '../../../api/classe-biblica'
import { useConexao } from '../../../offline'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Campo } from '../../../ui/Campo'
import { CampoData } from '../../../ui/CampoData'
import { ErroDeCarga, Carregando, DisponivelComInternet } from '../../../ui/EstadosDeCarga'
import { ResumoDosErros, useErrosAVista } from '../../../ui/ErrosDoFormulario'
import { IndicadorDeEtapas } from '../../../ui/IndicadorDeEtapas'
import { Selecao } from '../../../ui/Selecao'
import { dataCivilBr } from '../formatos'
import {
  AVISO_SEM_INTERNET,
  DIAS_DA_SEMANA,
  ETAPAS_DA_EDICAO,
  diasNoPlural,
  ocorrenciasDoDia,
  sobretituloDaEtapa,
  useRascunhoDaEdicao,
} from './useRascunhoDaEdicao'

const VOLTAR = { para: '/adm/classe-biblica', rotulo: 'Classe Bíblica' }

/** A linha do "Salvo às", em região viva educada: anuncia sem tirar o foco de onde a pessoa está. */
export function LinhaDoSalvo({ texto }: { texto: string | null }) {
  return (
    <p aria-live="polite" className="min-h-6 text-base text-texto-2">
      {texto}
    </p>
  )
}

export function textoDoSalvo(rascunho: { semConexao: boolean; salvoAs: string | null; erro: string | null }, completo: boolean): string | null {
  if (rascunho.semConexao) return AVISO_SEM_INTERNET
  if (rascunho.erro) return rascunho.erro
  if (!rascunho.salvoAs) return null
  return completo ? `Salvo às ${rascunho.salvoAs}. Pode sair e continuar depois de onde parou.` : `Salvo às ${rascunho.salvoAs}.`
}

interface Valores {
  nome: string
  inicio: string
  fim: string
  diaSemana: number
  horario: string
  local: string
}

type Erros = Partial<Record<keyof Valores, string>>

const erroDoFim = (inicio: string, fim: string): string | undefined =>
  inicio && fim && fim <= inicio ? `O fim precisa ser depois do início (${dataCivilBr(inicio)})` : undefined

function errosAoContinuar(valores: Valores): Erros {
  const erros: Erros = {}
  if (!valores.nome.trim()) erros.nome = 'Falta o nome da edição'
  if (!valores.inicio) erros.inicio = 'Falta a data de início'
  if (!valores.fim) erros.fim = 'Falta a data de fim'
  else if (erroDoFim(valores.inicio, valores.fim)) erros.fim = erroDoFim(valores.inicio, valores.fim)
  if (!Horario.safeParse(valores.horario).success) erros.horario = valores.horario ? 'Use o formato 14:00' : 'Falta o horário'
  return erros
}

/** O que vai ao servidor por campo; nulo quando o valor ainda não pode ser salvo. */
function campoParaSalvar(campo: keyof Valores, valores: Valores): RascunhoDaEdicao | null {
  switch (campo) {
    case 'nome': return { nome: valores.nome.trim() }
    case 'inicio': return { inicio: valores.inicio || null }
    case 'fim': return erroDoFim(valores.inicio, valores.fim) ? null : { fim: valores.fim || null }
    case 'diaSemana': return { diaSemana: valores.diaSemana }
    case 'horario': return valores.horario === '' ? { horario: null } : Horario.safeParse(valores.horario).success ? { horario: valores.horario } : null
    case 'local': return { local: valores.local.trim() || null }
  }
}

function Formulario({ edicao, padroes }: { edicao: EdicaoCB | null; padroes: { diaSemana: number; local: string | null } }) {
  const navegar = useNavigate()
  const inicial: Valores = {
    nome: edicao?.nome ?? '',
    inicio: edicao?.inicio ?? '',
    fim: edicao?.fim ?? '',
    diaSemana: edicao?.diaSemana ?? padroes.diaSemana,
    horario: edicao?.horario ?? '',
    local: edicao ? (edicao.local ?? '') : (padroes.local ?? ''),
  }
  // Regra 14 (D14): terminada, a edição já tem encontros nessas datas; só nome, horário e local mudam.
  const travada = edicao !== null && edicao.situacao !== 'NAO_TERMINADA'
  const [valores, setValores] = useState(inicial)
  const [salvos, setSalvos] = useState(inicial)
  const [erros, setErros] = useState<Erros>({})
  const [errosDoEnvio, setErrosDoEnvio] = useState<Erros>({})
  const [seguindo, setSeguindo] = useState(false)
  const rascunho = useRascunhoDaEdicao(edicao?.id ?? null, { diaSemana: padroes.diaSemana, local: padroes.local })
  const { formulario, pendencias } = useErrosAVista(errosDoEnvio)

  const mudar = <C extends keyof Valores>(campo: C, valor: Valores[C]) => {
    setValores((atual) => ({ ...atual, [campo]: valor }))
    if (erros[campo]) setErros((atual) => ({ ...atual, [campo]: undefined }))
  }

  const sair = (campo: keyof Valores, atuais: Valores = valores) => {
    if (campo === 'fim' || campo === 'inicio') setErros((atual) => ({ ...atual, fim: erroDoFim(atuais.inicio, atuais.fim) }))
    if (atuais[campo] === salvos[campo]) return
    const campos = campoParaSalvar(campo, atuais)
    if (!campos) return
    void rascunho.salvar(campos).then((salva) => {
      if (salva) setSalvos((atual) => ({ ...atual, [campo]: atuais[campo] }))
    })
  }

  const continuar = async (evento: FormEvent) => {
    evento.preventDefault()
    const encontrados = errosAoContinuar(valores)
    setErros(encontrados)
    setErrosDoEnvio(encontrados)
    if (Object.values(encontrados).some(Boolean) || rascunho.semConexao) return
    setSeguindo(true)
    const datas = travada ? {} : { inicio: valores.inicio, fim: valores.fim, diaSemana: valores.diaSemana }
    const salva = await rascunho.salvar({
      ...datas, nome: valores.nome.trim(), horario: valores.horario, local: valores.local.trim() || null, etapa: Math.max(2, edicao?.etapa ?? 1),
    })
    setSeguindo(false)
    if (salva) void navegar(`/adm/classe-biblica/${salva.id}/etapa/2`)
  }

  const quantos = valores.inicio && valores.fim && !erroDoFim(valores.inicio, valores.fim)
    ? ocorrenciasDoDia(valores.inicio, valores.fim, valores.diaSemana)
    : null

  return (
    <form ref={formulario} noValidate onSubmit={(evento) => void continuar(evento)} className="flex flex-col gap-5">
      <ResumoDosErros pendencias={pendencias} />
      <Campo
        rotulo="Nome da edição"
        ajuda="Ex.: Classe Bíblica 2027 · 1º semestre"
        value={valores.nome}
        erro={erros.nome}
        maxLength={120}
        onChange={(e) => mudar('nome', e.target.value)}
        onBlur={() => sair('nome')}
      />
      <div className="flex flex-col gap-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoData rotulo="Início" disabled={travada} value={valores.inicio} erro={erros.inicio} onChange={(e) => mudar('inicio', e.target.value)} onBlur={() => sair('inicio')} />
          <CampoData rotulo="Fim" disabled={travada} value={valores.fim} erro={erros.fim} onChange={(e) => mudar('fim', e.target.value)} onBlur={() => sair('fim')} />
        </div>
        {quantos !== null && <p className="text-sm text-texto-2">{`${quantos} ${diasNoPlural(valores.diaSemana)} entre as duas datas`}</p>}
        {travada && <p className="text-sm text-texto-2">Início, fim e dia da semana não mudam depois de a edição ser criada: os encontros já estão no calendário.</p>}
      </div>
      <Selecao
        rotulo="Dia da semana"
        ajuda={travada ? undefined : 'Veio das configurações do clube. Mude se a Classe Bíblica for em outro dia.'}
        value={String(valores.diaSemana)}
        disabled={travada}
        onChange={(e) => {
          const atuais = { ...valores, diaSemana: Number(e.target.value) }
          setValores(atuais)
          sair('diaSemana', atuais)
        }}
      >
        {DIAS_DA_SEMANA.map((dia, indice) => <option key={dia} value={indice}>{dia}</option>)}
      </Selecao>
      <Campo
        rotulo="Horário"
        ajuda="Ex.: 14:00"
        inputMode="numeric"
        maxLength={5}
        className="sm:max-w-40"
        value={valores.horario}
        erro={erros.horario}
        onChange={(e) => mudar('horario', e.target.value)}
        onBlur={() => sair('horario')}
      />
      <Campo
        rotulo="Local"
        ajuda="Veio das configurações do clube."
        value={valores.local}
        maxLength={120}
        onChange={(e) => mudar('local', e.target.value)}
        onBlur={() => sair('local')}
      />
      <LinhaDoSalvo texto={textoDoSalvo(rascunho, true)} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Botao type="submit" carregando={seguindo} disabled={rascunho.semConexao}>Continuar para os grupos</Botao>
        <Link to="/adm/classe-biblica" className={estiloDoBotao({ variante: 'texto' })}>Sair e continuar depois</Link>
      </div>
    </form>
  )
}

/** `edicao` indefinida enquanto carrega: o cabeçalho ainda não sabe se é criação ou edição. */
function Pagina({ edicao, children }: { edicao: EdicaoCB | null | undefined; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5 py-4">
      <CabecalhoDaPagina voltar={VOLTAR} sobretitulo={sobretituloDaEtapa(edicao)} titulo="Dados da edição" />
      <IndicadorDeEtapas etapas={ETAPAS_DA_EDICAO} atual={1} />
      <p className="text-base text-texto-2">
        Leva uns 5 minutos. O material de estudo de cada grupo (um PDF ou um link) pode ir agora ou depois. O que você preencher fica salvo.
      </p>
      {children}
    </div>
  )
}

function EdicaoNova() {
  const lista = useEdicoesCB()
  const { modo } = useConexao()
  let conteudo
  if (lista.isPending) conteudo = modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando a edição" />
  else if (lista.isError) conteudo = <ErroDeCarga erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />
  else conteudo = <Formulario edicao={null} padroes={lista.data.padroes} />
  return <Pagina edicao={null}>{conteudo}</Pagina>
}

function EdicaoExistente({ id }: { id: string }) {
  const painel = usePainelDaEdicao(id)
  const { modo } = useConexao()
  let conteudo
  if (painel.isPending) conteudo = modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando a edição" />
  else if (painel.isError) conteudo = <ErroDeCarga erro={painel.error} aoTentarDeNovo={() => void painel.refetch()} />
  else conteudo = <Formulario edicao={painel.data.edicao} padroes={{ diaSemana: painel.data.edicao.diaSemana, local: painel.data.edicao.local }} />
  return <Pagina edicao={painel.data?.edicao}>{conteudo}</Pagina>
}

/** Etapa 1: `/adm/classe-biblica/nova` (sem id) ou `/adm/classe-biblica/:id/etapa/1`. */
export function EtapaDados() {
  const { id } = useParams()
  return id ? <EdicaoExistente id={id} /> : <EdicaoNova />
}
