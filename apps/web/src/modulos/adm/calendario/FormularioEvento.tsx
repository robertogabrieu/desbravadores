import { EventoEntrada, MARCACOES_PADRAO, TIPOS_EVENTO, validarEvento } from '@desbravadores/shared'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { useConfiguracaoClube } from '../../../api/clube'
import { useCriarEvento, useEditarEvento } from '../../../api/calendario'
import type { EventoCalendario, EventoGravado } from '../../../api/calendario'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Campo } from '../../../ui/Campo'
import { CampoData } from '../../../ui/CampoData'
import { ResumoDosErros, useErrosAVista } from '../../../ui/ErrosDoFormulario'
import { RodapeDoFormulario } from '../../../ui/RodapeDoFormulario'
import { Selecao } from '../../../ui/Selecao'
import { lerErroDaApi } from '../desbravadores/erros'
import { diaDaSemana, dosDiasDeReuniao } from './datas'
import { ROTULOS_DO_TIPO, TEXTO_DO_TIPO } from './tipos'
import type { TipoDeEvento } from './tipos'

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

interface Marcacoes {
  temReuniao: boolean
  temClasse: boolean
  bomParaCampo: boolean
}

/** O encontro da Classe Bíblica nasce e muda só pela edição dele. */
const TIPOS_DO_FORMULARIO = TIPOS_EVENTO.filter((t) => t !== 'CLASSE_BIBLICA')

const tipoConhecido = (valor: string): TipoDeEvento => TIPOS_DO_FORMULARIO.find((t) => t === valor) ?? 'EVENTO'

export function FormularioEvento({ evento, dataInicial, aoGravar, cancelar }: Propriedades) {
  const [nome, setNome] = useState(evento?.nome ?? '')
  const [tipo, setTipo] = useState<TipoDeEvento>(evento?.tipo ?? 'EVENTO')
  const [inicio, setInicio] = useState(evento?.inicio ?? dataInicial)
  const [fim, setFim] = useState(evento?.fim ?? dataInicial)
  const [horario, setHorario] = useState(evento?.horario ?? '')
  const [local, setLocal] = useState(evento?.local ?? '')
  const [marcacoes, setMarcacoes] = useState<Marcacoes>(
    evento
      ? { temReuniao: evento.temReuniao, temClasse: evento.temClasse, bomParaCampo: evento.bomParaCampo }
      : { ...MARCACOES_PADRAO['EVENTO'] },
  )
  const [erros, setErros] = useState<Record<string, string>>({})
  const { formulario, pendencias } = useErrosAVista(erros)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const idDoErroDoGrupo = useId()
  const idDoGrupo = useId()
  const criar = useCriarEvento()
  const editar = useEditarEvento()
  const diaReuniao = useConfiguracaoClube().data?.diaReuniao

  const ehFerias = tipo === 'FERIAS'
  const ehExtra = tipo === 'REUNIAO_EXTRA'
  const textoDeApoio = TEXTO_DO_TIPO[tipo]?.(diaReuniao)
  const extraNoDiaDaReuniao = ehExtra && diaReuniao !== undefined && diaDaSemana(inicio) === diaReuniao
  const classeSemComoAcontecer = !ehFerias && !ehExtra && marcacoes.temClasse && !marcacoes.temReuniao && !marcacoes.bomParaCampo
  const erroDoGrupo = erros['temReuniao']

  function trocarTipo(novo: TipoDeEvento) {
    setTipo(novo)
    setMarcacoes({ ...MARCACOES_PADRAO[novo] })
    if (novo === 'REUNIAO_EXTRA') setFim(inicio)
  }

  function mudarData(data: string) {
    setInicio(data)
    if (ehExtra) setFim(data)
  }

  /** O que o tipo esconde não vale: Férias leva o padrão e a extra nunca é de campo. */
  function marcacoesDoTipo(): Marcacoes {
    if (ehFerias) return { ...MARCACOES_PADRAO['FERIAS'] }
    if (ehExtra) return { ...marcacoes, bomParaCampo: false }
    return marcacoes
  }

  async function enviar(submissao: FormEvent) {
    submissao.preventDefault()
    setErros({})
    setErroGeral(null)
    const entrada = { nome, tipo, inicio, fim: ehExtra ? inicio : fim, horario: horario.trim() || null, local: local.trim() || null, ...marcacoesDoTipo() }
    const achados: Record<string, string> = {}
    const validacao = EventoEntrada.safeParse(entrada)
    if (!validacao.success) {
      for (const problema of validacao.error.issues) {
        const campo = String(problema.path[0] ?? '')
        if (campo && !(campo in achados)) achados[campo] = MENSAGENS_DE_CAMPO[campo] ?? 'Confira este campo'
      }
    }
    for (const problema of validarEvento(entrada)) {
      if (!(problema.campo in achados)) achados[problema.campo] = problema.mensagem
    }
    if (Object.keys(achados).length > 0) {
      setErros(achados)
      return
    }
    try {
      aoGravar(evento ? await editar.mutateAsync({ id: evento.id, entrada }) : await criar.mutateAsync(entrada))
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(campos)
      setErroGeral(geral)
    }
  }

  return (
    <form ref={formulario} noValidate onSubmit={(submissao) => void enviar(submissao)} className="flex flex-col gap-4">
      <ResumoDosErros pendencias={pendencias} />
      <Campo rotulo="Nome" value={nome} erro={erros['nome']} onChange={(e) => setNome(e.target.value)} />
      <Selecao rotulo="Tipo" value={tipo} ajuda={textoDeApoio} erro={erros['tipo']} onChange={(e) => trocarTipo(tipoConhecido(e.target.value))}>
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
          {classeSemComoAcontecer && <p className="text-sm text-texto-2">Sem reunião e sem campo, não há classe nesses dias.</p>}
          {erroDoGrupo && (
            <p id={idDoErroDoGrupo} role="alert" className="text-sm font-medium text-perigo">
              {erroDoGrupo}
            </p>
          )}
        </fieldset>
      )}
      <p className="text-sm text-texto-2">Quem monta o cronograma vê este evento ao escolher as datas. Se já houver classes marcadas no período, o instrutor é avisado.</p>
      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      <RodapeDoFormulario cancelar={cancelar} rotuloSalvar={evento ? 'Salvar alterações' : 'Salvar'} salvando={criar.isPending || editar.isPending} />
    </form>
  )
}
