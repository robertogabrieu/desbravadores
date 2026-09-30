import { EventoEntrada, MARCACOES_PADRAO, TIPOS_EVENTO } from '@desbravadores/shared'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useCriarEvento, useEditarEvento } from '../../../api/calendario'
import type { EventoCalendario, EventoGravado } from '../../../api/calendario'
import { Botao } from '../../../ui/Botao'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Campo } from '../../../ui/Campo'
import { CampoData } from '../../../ui/CampoData'
import { Selecao } from '../../../ui/Selecao'
import { lerErroDaApi } from '../desbravadores/erros'
import { ROTULOS_DO_TIPO } from './tipos'
import type { TipoDeEvento } from './tipos'

interface Propriedades {
  /** Ausente: evento novo. */
  evento?: EventoCalendario
  /** Data que abre preenchida num evento novo. */
  dataInicial: string
  aoGravar: (gravado: EventoGravado) => void
  aoCancelar: () => void
  aoExcluir?: () => void
}

const MENSAGENS_DE_CAMPO: Record<string, string> = {
  nome: 'Informe o nome do evento',
  tipo: 'Escolha o tipo do evento',
  inicio: 'Informe a data de início',
  fim: 'Informe a data de fim',
  horario: 'Informe o horário no formato 00:00',
}

const tipoConhecido = (valor: string): TipoDeEvento => TIPOS_EVENTO.find((t) => t === valor) ?? 'EVENTO'

export function FormularioEvento({ evento, dataInicial, aoGravar, aoCancelar, aoExcluir }: Propriedades) {
  const [nome, setNome] = useState(evento?.nome ?? '')
  const [tipo, setTipo] = useState<TipoDeEvento>(evento?.tipo ?? 'EVENTO')
  const [inicio, setInicio] = useState(evento?.inicio ?? dataInicial)
  const [fim, setFim] = useState(evento?.fim ?? dataInicial)
  const [horario, setHorario] = useState(evento?.horario ?? '')
  const [local, setLocal] = useState(evento?.local ?? '')
  const [marcacoes, setMarcacoes] = useState(
    evento
      ? { cancelaReuniao: evento.cancelaReuniao, bloqueiaAula: evento.bloqueiaAula, bomParaCampo: evento.bomParaCampo }
      : { ...MARCACOES_PADRAO['EVENTO'] },
  )
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const criar = useCriarEvento()
  const editar = useEditarEvento()

  function trocarTipo(novo: TipoDeEvento) {
    setTipo(novo)
    setMarcacoes({ ...MARCACOES_PADRAO[novo] })
  }

  async function enviar(submissao: FormEvent) {
    submissao.preventDefault()
    setErros({})
    setErroGeral(null)
    const entrada = { nome, tipo, inicio, fim, horario: horario.trim() || null, local: local.trim() || null, ...marcacoes }
    const validacao = EventoEntrada.safeParse(entrada)
    if (!validacao.success) {
      const achados: Record<string, string> = {}
      for (const problema of validacao.error.issues) {
        const campo = String(problema.path[0] ?? '')
        if (campo && !(campo in achados)) achados[campo] = campo === 'fim' && inicio && fim ? problema.message : (MENSAGENS_DE_CAMPO[campo] ?? 'Confira este campo')
      }
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
    <form noValidate onSubmit={(submissao) => void enviar(submissao)} className="flex flex-col gap-4">
      <Campo rotulo="Nome" value={nome} erro={erros['nome']} onChange={(e) => setNome(e.target.value)} />
      <Selecao rotulo="Tipo" value={tipo} erro={erros['tipo']} onChange={(e) => trocarTipo(tipoConhecido(e.target.value))}>
        {TIPOS_EVENTO.map((t) => (
          <option key={t} value={t}>
            {ROTULOS_DO_TIPO[t]}
          </option>
        ))}
      </Selecao>
      <div className="grid grid-cols-2 gap-3">
        <CampoData rotulo="Início" value={inicio} erro={erros['inicio']} onChange={(e) => setInicio(e.target.value)} />
        <CampoData rotulo="Fim" value={fim} erro={erros['fim']} onChange={(e) => setFim(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Horário" type="time" value={horario} erro={erros['horario']} onChange={(e) => setHorario(e.target.value)} />
        <Campo rotulo="Local" value={local} erro={erros['local']} onChange={(e) => setLocal(e.target.value)} />
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-semibold text-texto">Para a reunião e as aulas</legend>
        <CaixaMarcacao rotulo="Não há reunião do clube" checked={marcacoes.cancelaReuniao} onChange={(e) => setMarcacoes({ ...marcacoes, cancelaReuniao: e.target.checked })} />
        <CaixaMarcacao rotulo="Não há aula de classe" checked={marcacoes.bloqueiaAula} onChange={(e) => setMarcacoes({ ...marcacoes, bloqueiaAula: e.target.checked })} />
        <CaixaMarcacao rotulo="Bom para requisitos de campo" checked={marcacoes.bomParaCampo} onChange={(e) => setMarcacoes({ ...marcacoes, bomParaCampo: e.target.checked })} />
      </fieldset>
      <p className="text-sm text-texto-2">Quem monta o cronograma vê este evento ao escolher as datas. Se já houver aulas marcadas no período, o instrutor é avisado.</p>
      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {aoExcluir ? (
          <Botao variante="texto" className="text-perigo" onClick={aoExcluir}>
            Excluir evento
          </Botao>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Botao variante="secundario" onClick={aoCancelar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={criar.isPending || editar.isPending}>
            Salvar
          </Botao>
        </div>
      </div>
    </form>
  )
}
