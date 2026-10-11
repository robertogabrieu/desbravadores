import { EventoEntrada, MARCACOES_PADRAO, PontosDeEvento, TIPOS_EVENTO, validarEvento } from '@desbravadores/shared'
import type { UniformeEvento } from '@desbravadores/shared'
import { Check } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import type { z } from 'zod'
import { useConfiguracaoClube } from '../../../api/clube'
import { useCriarEvento, useEditarEvento } from '../../../api/calendario'
import type { EventoCalendario, EventoGravado, NovoEvento } from '../../../api/calendario'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Campo } from '../../../ui/Campo'
import { CampoData } from '../../../ui/CampoData'
import { Confirmacao } from '../../../ui/Confirmacao'
import { EscolhaUnica } from '../../../ui/EscolhaUnica'
import { ResumoDosErros, useErrosAVista } from '../../../ui/ErrosDoFormulario'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { RodapeDoFormulario } from '../../../ui/RodapeDoFormulario'
import { Selecao } from '../../../ui/Selecao'
import { lerErroDaApi } from '../desbravadores/erros'
import { dataCivilBr, juntarNomes } from '../formatos'
import { MESES, diaDaSemana, dosDiasDeReuniao } from './datas'
import { ROTULOS_DO_TIPO, TEXTO_DO_TIPO } from './tipos'
import type { TipoDeEvento } from './tipos'

type Uniforme = z.infer<typeof UniformeEvento>

interface Propriedades {
  /** Ausente: evento novo. */
  evento?: EventoCalendario
  /** Data que abre preenchida num evento novo. */
  dataInicial: string
  aoGravar: (gravado: EventoGravado) => void
  cancelar: { para: string; estado?: object }
}

const MENSAGENS_DE_CAMPO: Record<string, string> = {
  nome: 'Informe o nome do evento',
  tipo: 'Escolha o tipo do evento',
  inicio: 'Informe a data de início',
  fim: 'Informe a data de fim',
  horario: 'Informe o horário no formato 00:00',
}

/** Uniforme e pontos têm as mensagens próprias de `validarEvento`; o contrato só diria "Confira este campo". */
const CAMPOS_DO_ESPECIAL = ['uniforme', 'pontosParticipacao', 'pontosUniforme']

const UNIFORMES: Array<{ valor: Uniforme; rotulo: string }> = [
  { valor: 'GALA', rotulo: 'Uniforme de gala' },
  { valor: 'CAMPO', rotulo: 'Uniforme de campo' },
]

const NOME_CURTO_DO_UNIFORME: Record<Uniforme, string> = { GALA: 'gala', CAMPO: 'campo' }

interface Marcacoes {
  temReuniao: boolean
  temClasse: boolean
  bomParaCampo: boolean
}

/** O encontro da Classe Bíblica nasce e muda só pela edição dele. */
const TIPOS_DO_FORMULARIO = TIPOS_EVENTO.filter((t) => t !== 'CLASSE_BIBLICA')

const tipoConhecido = (valor: string): TipoDeEvento => TIPOS_DO_FORMULARIO.find((t) => t === valor) ?? 'EVENTO'

/** Vazio é "ainda não informado" (nulo); o resto vira número, e `validarEvento` diz se serve. */
const pontosDoTexto = (texto: string): number | null => (texto.trim() === '' ? null : Number(texto))

const pontosDoEvento = (pontos: number | null | undefined): string => (pontos == null ? '' : String(pontos))

const pontosPorExtenso = (pontos: number): string => (pontos === 1 ? '1 ponto' : `${pontos} pontos`)

const nomeDoMes = (data: string): string => (MESES[Number(data.slice(5, 7)) - 1] ?? '').toLowerCase()

/** A mensagem que `validarEvento` daria a este campo de pontos, com o resto do evento em ordem. */
function mensagemDosPontos(campo: 'pontosParticipacao' | 'pontosUniforme', texto: string, inicio: string): string | null {
  const pontos = pontosDoTexto(texto)
  const problemas = validarEvento({
    tipo: 'EVENTO_ESPECIAL',
    inicio,
    fim: inicio,
    temReuniao: true,
    temClasse: true,
    uniforme: 'GALA',
    pontosParticipacao: campo === 'pontosParticipacao' ? pontos : 0,
    pontosUniforme: campo === 'pontosUniforme' ? pontos : 0,
  })
  return problemas.find((problema) => problema.campo === campo)?.mensagem ?? null
}

const pontosValem = (texto: string): boolean => PontosDeEvento.safeParse(pontosDoTexto(texto)).success

/** "Os pontos por ir passam de 20 para 25 para quem foi ao Culto. O ranking de setembro muda. …" */
function textoDeRefazerPontos(evento: EventoCalendario, entrada: NovoEvento): string {
  const mudancas: string[] = []
  if (entrada.pontosParticipacao !== evento.pontosParticipacao) {
    mudancas.push(`os pontos por ir passam de ${evento.pontosParticipacao} para ${entrada.pontosParticipacao}`)
  }
  if (entrada.pontosUniforme !== evento.pontosUniforme) {
    mudancas.push(`os pontos por usar o uniforme passam de ${evento.pontosUniforme} para ${entrada.pontosUniforme}`)
  }
  const frases: string[] = []
  if (entrada.inicio !== evento.inicio) frases.push(`A data do evento passa de ${dataCivilBr(evento.inicio)} para ${dataCivilBr(entrada.inicio)}.`)
  if (mudancas.length > 0) {
    const texto = `${juntarNomes(mudancas)} para quem foi ao ${evento.nome}.`
    frases.push(texto.charAt(0).toUpperCase() + texto.slice(1))
  }
  const meses = [...new Set([nomeDoMes(evento.inicio), nomeDoMes(entrada.inicio)])]
  frases.push(meses.length === 1 ? `O ranking de ${meses[0]} muda.` : `Os rankings de ${juntarNomes(meses)} mudam.`)
  frases.push('Você pode mudar de novo depois.')
  return frases.join(' ')
}

function textoDoAvisoDeLista(foram: number): string {
  const quem = foram === 1 ? '1 desbravador foi' : `${foram} desbravadores foram`
  const pontos = foram === 1 ? 'os pontos dele serão refeitos' : `os pontos desses ${foram} serão refeitos`
  return `A lista deste evento já foi concluída: ${quem}. Se você mudar a data ou os pontos, ${pontos}.`
}

export function FormularioEvento({ evento, dataInicial, aoGravar, cancelar }: Propriedades) {
  const [nome, setNome] = useState(evento?.nome ?? '')
  const [tipo, setTipo] = useState<TipoDeEvento>(evento?.tipo ?? 'EVENTO')
  const [inicio, setInicio] = useState(evento?.inicio ?? dataInicial)
  const [fim, setFim] = useState(evento?.fim ?? dataInicial)
  const [horario, setHorario] = useState(evento?.horario ?? '')
  const [local, setLocal] = useState(evento?.local ?? '')
  const [uniforme, setUniforme] = useState<Uniforme | null>(evento?.uniforme ?? null)
  const [pontosDeIr, setPontosDeIr] = useState(pontosDoEvento(evento?.pontosParticipacao))
  const [pontosDoUniforme, setPontosDoUniforme] = useState(pontosDoEvento(evento?.pontosUniforme))
  const [marcacoes, setMarcacoes] = useState<Marcacoes>(
    evento
      ? { temReuniao: evento.temReuniao, temClasse: evento.temClasse, bomParaCampo: evento.bomParaCampo }
      : { ...MARCACOES_PADRAO['EVENTO'] },
  )
  const [erros, setErros] = useState<Record<string, string>>({})
  // O erro dos campos de pontos ao sair deles: fora de `erros` de propósito, senão `useErrosAVista` tiraria o foco de quem está digitando.
  const [errosAoSair, setErrosAoSair] = useState<Record<string, string | null>>({})
  const { formulario, pendencias } = useErrosAVista(erros)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [aRefazer, setARefazer] = useState<NovoEvento | null>(null)
  const idDoErroDoGrupo = useId()
  const idDoGrupo = useId()
  const criar = useCriarEvento()
  const editar = useEditarEvento()
  const diaReuniao = useConfiguracaoClube().data?.diaReuniao

  const ehFerias = tipo === 'FERIAS'
  const ehExtra = tipo === 'REUNIAO_EXTRA'
  const ehEspecial = tipo === 'EVENTO_ESPECIAL'
  const lista = evento?.lista
  const listaComecada = !!lista && (lista.concluidaEm !== null || lista.foram > 0)
  const pontosJaDados = lista?.concluidaEm != null && lista.foram > 0 ? lista.foram : 0
  const textoDeApoio = listaComecada ? 'O tipo não muda depois que a lista é começada.' : TEXTO_DO_TIPO[tipo]?.(diaReuniao)
  const extraNoDiaDaReuniao = ehExtra && diaReuniao !== undefined && diaDaSemana(inicio) === diaReuniao
  const classeSemComoAcontecer = !ehFerias && !ehExtra && marcacoes.temClasse && !marcacoes.temReuniao && !marcacoes.bomParaCampo
  const instrutorAvisado = ehFerias || !marcacoes.temClasse
  const erroDoGrupo = erros['temReuniao']
  const erroDosPontos = (campo: 'pontosParticipacao' | 'pontosUniforme'): string | undefined =>
    campo in errosAoSair ? (errosAoSair[campo] ?? undefined) : erros[campo]
  const fraseDeEfeito =
    uniforme && pontosValem(pontosDeIr) && pontosValem(pontosDoUniforme)
      ? `Quem for ganha ${pontosPorExtenso(Number(pontosDeIr))}. Quem for com o uniforme de ${NOME_CURTO_DO_UNIFORME[uniforme]} ganha mais ${Number(pontosDoUniforme)}.`
      : null

  function trocarTipo(novo: TipoDeEvento) {
    setTipo(novo)
    setMarcacoes({ ...MARCACOES_PADRAO[novo] })
    if (novo === 'REUNIAO_EXTRA') setFim(inicio)
  }

  function mudarData(data: string) {
    setInicio(data)
    if (ehExtra) setFim(data)
  }

  function digitarPontos(campo: 'pontosParticipacao' | 'pontosUniforme', texto: string) {
    if (campo === 'pontosParticipacao') setPontosDeIr(texto)
    else setPontosDoUniforme(texto)
    setErrosAoSair((atuais) => ({ ...atuais, [campo]: null }))
  }

  function sairDosPontos(campo: 'pontosParticipacao' | 'pontosUniforme') {
    const texto = campo === 'pontosParticipacao' ? pontosDeIr : pontosDoUniforme
    setErrosAoSair((atuais) => ({ ...atuais, [campo]: mensagemDosPontos(campo, texto, inicio) }))
  }

  /** O que o tipo esconde não vale: Férias leva o padrão e a extra nunca é de campo. */
  function marcacoesDoTipo(): Marcacoes {
    if (ehFerias) return { ...MARCACOES_PADRAO['FERIAS'] }
    if (ehExtra) return { ...marcacoes, bomParaCampo: false }
    return marcacoes
  }

  async function gravar(entrada: NovoEvento) {
    try {
      aoGravar(evento ? await editar.mutateAsync({ id: evento.id, entrada }) : await criar.mutateAsync(entrada))
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(campos)
      setErroGeral(geral)
    }
  }

  function refazerPontosConfirmados() {
    const entrada = aRefazer
    setARefazer(null)
    if (entrada) void gravar(entrada)
  }

  async function enviar(submissao: FormEvent) {
    submissao.preventDefault()
    setErros({})
    setErrosAoSair({})
    setErroGeral(null)
    const entrada: NovoEvento = {
      nome,
      tipo,
      inicio,
      fim: ehExtra ? inicio : fim,
      horario: horario.trim() || null,
      local: local.trim() || null,
      ...marcacoesDoTipo(),
      ...(ehEspecial && { uniforme, pontosParticipacao: pontosDoTexto(pontosDeIr), pontosUniforme: pontosDoTexto(pontosDoUniforme) }),
    }
    const achados: Record<string, string> = {}
    const validacao = EventoEntrada.safeParse(entrada)
    if (!validacao.success) {
      for (const problema of validacao.error.issues) {
        const campo = String(problema.path[0] ?? '')
        if (campo && !CAMPOS_DO_ESPECIAL.includes(campo) && !(campo in achados)) achados[campo] = MENSAGENS_DE_CAMPO[campo] ?? 'Confira este campo'
      }
    }
    for (const problema of validarEvento(entrada)) {
      if (!(problema.campo in achados)) achados[problema.campo] = problema.mensagem
    }
    if (Object.keys(achados).length > 0) {
      setErros(achados)
      return
    }
    const mudouOQueRefazOsPontos =
      evento !== undefined &&
      pontosJaDados > 0 &&
      (entrada.inicio !== evento.inicio || entrada.pontosParticipacao !== evento.pontosParticipacao || entrada.pontosUniforme !== evento.pontosUniforme)
    if (mudouOQueRefazOsPontos) {
      setARefazer(entrada)
      return
    }
    await gravar(entrada)
  }

  return (
    <form ref={formulario} noValidate onSubmit={(submissao) => void enviar(submissao)} className="flex flex-col gap-4">
      <ResumoDosErros pendencias={pendencias} />
      {pontosJaDados > 0 && <FaixaAviso>{textoDoAvisoDeLista(pontosJaDados)}</FaixaAviso>}
      <Campo rotulo="Nome" value={nome} erro={erros['nome']} onChange={(e) => setNome(e.target.value)} />
      <Selecao rotulo="Tipo" value={tipo} disabled={listaComecada} ajuda={textoDeApoio} erro={erros['tipo']} onChange={(e) => trocarTipo(tipoConhecido(e.target.value))}>
        {TIPOS_DO_FORMULARIO.map((t) => (
          <option key={t} value={t}>
            {ROTULOS_DO_TIPO[t]}
          </option>
        ))}
      </Selecao>
      {ehExtra ? (
        <CampoData
          rotulo="Data"
          value={inicio}
          ajuda={extraNoDiaDaReuniao ? `${dosDiasDeReuniao(diaReuniao).nome.replace(/^./, (letra) => letra.toUpperCase())} já tem reunião: esta reunião extra só muda nome, horário e local.` : undefined}
          erro={erros['inicio'] ?? erros['fim']}
          onChange={(e) => mudarData(e.target.value)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoData rotulo="Início" value={inicio} erro={erros['inicio']} onChange={(e) => setInicio(e.target.value)} />
          <CampoData rotulo="Fim" value={fim} erro={erros['fim']} onChange={(e) => setFim(e.target.value)} />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Horário" type="time" value={horario} erro={erros['horario']} onChange={(e) => setHorario(e.target.value)} />
        <Campo rotulo="Local" value={local} erro={erros['local']} onChange={(e) => setLocal(e.target.value)} />
      </div>
      {ehEspecial && (
        <fieldset className="m-0 flex flex-col gap-4 border-0 p-0">
          <legend className="mb-3 p-0 font-titulo text-lg font-bold text-texto">Uniforme e pontos</legend>
          <Campo
            rotulo="Pontos por ir ao evento"
            type="number"
            inputMode="numeric"
            className="max-w-36"
            value={pontosDeIr}
            ajuda="Quem for ganha estes pontos no ranking. Pode ser 0."
            erro={erroDosPontos('pontosParticipacao')}
            onChange={(e) => digitarPontos('pontosParticipacao', e.target.value)}
            onBlur={() => sairDosPontos('pontosParticipacao')}
          />
          <EscolhaUnica
            id="uniforme"
            legenda="Uniforme do evento"
            opcoes={UNIFORMES}
            valor={uniforme}
            aoEscolher={setUniforme}
            erro={uniforme ? undefined : erros['uniforme']}
            ajuda={listaComecada ? 'Se você trocar o uniforme, as marcas de quem foi com o uniforme continuam como estão. Confira a lista depois.' : undefined}
          />
          <Campo
            rotulo="Pontos por usar o uniforme"
            type="number"
            inputMode="numeric"
            className="max-w-36"
            value={pontosDoUniforme}
            ajuda="Só quem for com o uniforme pedido ganha estes pontos, além dos de ir. Pode ser 0."
            erro={erroDosPontos('pontosUniforme')}
            onChange={(e) => digitarPontos('pontosUniforme', e.target.value)}
            onBlur={() => sairDosPontos('pontosUniforme')}
          />
          {fraseDeEfeito && (
            <p className="flex items-start gap-2 rounded-botao bg-marca-suave px-3 py-3 text-base font-semibold text-marca">
              <Check aria-hidden className="mt-0.5 size-5 shrink-0" />
              {fraseDeEfeito}
            </p>
          )}
        </fieldset>
      )}
      {!ehFerias && (
        <fieldset
          id={idDoGrupo}
          data-com-erro={erroDoGrupo ? true : undefined}
          aria-describedby={erroDoGrupo ? idDoErroDoGrupo : undefined}
          className="flex flex-col gap-1"
        >
          <legend className="mb-1 text-sm font-semibold text-texto">Para a reunião e as classes</legend>
          <CaixaMarcacao rotulo="Terá reunião" checked={marcacoes.temReuniao} onChange={(e) => setMarcacoes({ ...marcacoes, temReuniao: e.target.checked })} />
          <CaixaMarcacao rotulo="Terá classe" checked={marcacoes.temClasse} onChange={(e) => setMarcacoes({ ...marcacoes, temClasse: e.target.checked })} />
          {!ehExtra && (
            <CaixaMarcacao rotulo="Terá atividade de campo" checked={marcacoes.bomParaCampo} onChange={(e) => setMarcacoes({ ...marcacoes, bomParaCampo: e.target.checked })} />
          )}
          {ehEspecial && (
            <p className="text-sm text-texto-2">Já vem marcado para a reunião e a classe do dia continuarem. Desmarque “Terá reunião” se o evento toma o lugar dela.</p>
          )}
          {classeSemComoAcontecer && <p className="text-sm text-texto-2">Sem reunião e sem campo, não há classe nesses dias.</p>}
          {erroDoGrupo && (
            <p id={idDoErroDoGrupo} role="alert" className="text-sm font-medium text-perigo">
              {erroDoGrupo}
            </p>
          )}
        </fieldset>
      )}
      <p className="text-sm text-texto-2">
        {`Quem monta o cronograma vê este evento ao escolher as datas.${instrutorAvisado ? ' Se já houver classes marcadas no período, o instrutor é avisado.' : ''}`}
      </p>
      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      <RodapeDoFormulario cancelar={cancelar} rotuloSalvar={evento ? 'Salvar alterações' : 'Salvar'} salvando={criar.isPending || editar.isPending} />
      <Confirmacao
        aberta={aRefazer !== null}
        titulo={`Refazer os pontos de ${pontosJaDados === 1 ? '1 desbravador' : `${pontosJaDados} desbravadores`}?`}
        rotuloConfirmar="Refazer os pontos"
        rotuloCancelar="Voltar ao formulário"
        ocupada={editar.isPending}
        aoConfirmar={refazerPontosConfirmados}
        aoCancelar={() => setARefazer(null)}
      >
        {evento && aRefazer ? textoDeRefazerPontos(evento, aRefazer) : null}
      </Confirmacao>
    </form>
  )
}
