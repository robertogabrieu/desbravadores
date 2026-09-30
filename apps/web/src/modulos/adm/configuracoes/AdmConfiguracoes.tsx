import { ConfiguracaoClubeEntrada } from '@desbravadores/shared'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useConfiguracaoClube, useSalvarConfiguracao } from '../../../api/clube'
import type { ConfiguracaoClube } from '../../../api/clube'
import { useConexao } from '../../../offline'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { Selecao } from '../../../ui/Selecao'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { lerErroDaApi } from '../desbravadores/erros'

const DIAS_DA_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']

const MENSAGENS_DE_CAMPO: Record<string, string> = {
  diaReuniao: 'Escolha o dia da reunião',
  horaReuniao: 'Informe a hora da reunião',
  localReuniaoPadrao: 'O local pode ter até 120 letras',
  limiarFrequenciaAlerta: 'Informe um número de 0 a 100',
  limiarProgressoAlerta: 'Informe um número de 0 a 100',
  metaFrequencia: 'Informe um número de 0 a 100',
}

/** `MM-DD` → `DD/MM`. */
const diaEMesDoAno = (mesEDia: string): string => mesEDia.split('-').reverse().join('/')

export function AdmConfiguracoes() {
  const configuracao = useConfiguracaoClube()
  const { modo } = useConexao()

  let corpo
  if (configuracao.data) corpo = <FormularioConfiguracao atual={configuracao.data} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (configuracao.isError) corpo = <ErroDeCarga erro={configuracao.error} aoTentarDeNovo={() => void configuracao.refetch()} />
  else
    corpo = (
      <Carregando rotulo="Carregando as configurações">
        <Esqueleto className="h-14" />
        <Esqueleto className="h-14" />
        <Esqueleto className="h-14" />
      </Carregando>
    )

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <header>
        <p className="text-sm font-semibold text-texto-2">Regras que valem para o clube todo</p>
        <h1 className="font-titulo text-2xl font-extrabold text-texto">Configurações do clube</h1>
      </header>
      {corpo}
    </div>
  )
}

function FormularioConfiguracao({ atual }: { atual: ConfiguracaoClube }) {
  const [diaReuniao, setDiaReuniao] = useState(String(atual.diaReuniao))
  const [horaReuniao, setHoraReuniao] = useState(atual.horaReuniao)
  const [local, setLocal] = useState(atual.localReuniaoPadrao ?? '')
  const [limiarFrequencia, setLimiarFrequencia] = useState(String(atual.limiarFrequenciaAlerta))
  const [limiarProgresso, setLimiarProgresso] = useState(String(atual.limiarProgressoAlerta))
  const [meta, setMeta] = useState(String(atual.metaFrequencia))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const salvar = useSalvarConfiguracao()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErros({})
    setErroGeral(null)
    setSalvo(false)
    const entrada = {
      diaReuniao: Number(diaReuniao),
      horaReuniao,
      localReuniaoPadrao: local.trim() || null,
      limiarFrequenciaAlerta: limiarFrequencia.trim() === '' ? Number.NaN : Number(limiarFrequencia),
      limiarProgressoAlerta: limiarProgresso.trim() === '' ? Number.NaN : Number(limiarProgresso),
      metaFrequencia: meta.trim() === '' ? Number.NaN : Number(meta),
    }
    const validacao = ConfiguracaoClubeEntrada.safeParse(entrada)
    if (!validacao.success) {
      const achados: Record<string, string> = {}
      for (const problema of validacao.error.issues) {
        const campo = String(problema.path[0] ?? '')
        if (campo && !(campo in achados)) achados[campo] = MENSAGENS_DE_CAMPO[campo] ?? 'Confira este campo'
      }
      setErros(achados)
      return
    }
    try {
      await salvar.mutateAsync(entrada)
      setSalvo(true)
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(campos)
      setErroGeral(geral)
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-6">
      <Secao id="secao-reuniao" titulo="Reunião semanal" descricao="O dia define as datas de reunião no calendário e nos cronogramas.">
        <Selecao rotulo="Dia da reunião" value={diaReuniao} erro={erros['diaReuniao']} onChange={(e) => setDiaReuniao(e.target.value)}>
          {DIAS_DA_SEMANA.map((nome, indice) => (
            <option key={nome} value={indice}>
              {nome}
            </option>
          ))}
        </Selecao>
        <Campo rotulo="Hora da reunião" type="time" value={horaReuniao} erro={erros['horaReuniao']} onChange={(e) => setHoraReuniao(e.target.value)} />
        <div className="sm:col-span-2">
          <Campo rotulo="Local padrão" value={local} erro={erros['localReuniaoPadrao']} onChange={(e) => setLocal(e.target.value)} />
        </div>
      </Secao>

      <Secao id="secao-alertas" titulo="Alertas e meta" descricao="Abaixo dos alertas, o desbravador ou a classe aparecem destacados.">
        <Campo
          rotulo="Alerta de frequência (%)"
          ajuda="Abaixo disto o desbravador aparece com alerta."
          type="number"
          inputMode="numeric"
          value={limiarFrequencia}
          erro={erros['limiarFrequenciaAlerta']}
          onChange={(e) => setLimiarFrequencia(e.target.value)}
        />
        <Campo
          rotulo="Alerta de progresso (%)"
          ajuda="Abaixo disto o progresso da classe aparece com alerta."
          type="number"
          inputMode="numeric"
          value={limiarProgresso}
          erro={erros['limiarProgressoAlerta']}
          onChange={(e) => setLimiarProgresso(e.target.value)}
        />
        <Campo rotulo="Meta de frequência (%)" type="number" inputMode="numeric" value={meta} erro={erros['metaFrequencia']} onChange={(e) => setMeta(e.target.value)} />
      </Secao>

      <Secao id="secao-fixas" titulo="Definidas na implantação" descricao="Vêm da instalação do clube.">
        <Campo rotulo="Fuso horário" value={atual.fuso} readOnly disabled ajuda="Não pode ser alterado aqui." />
        <Campo rotulo="Início do ano do clube" value={diaEMesDoAno(atual.inicioAnoClube)} readOnly disabled ajuda="Não pode ser alterado aqui." />
      </Secao>

      {erroGeral && (
        <p role="alert" className="text-base font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      {salvo && (
        <p role="status" className="text-base font-semibold text-sucesso">
          Configurações salvas.
        </p>
      )}
      <div className="flex justify-end border-t border-divisor pt-4">
        <Botao type="submit" carregando={salvar.isPending}>
          Salvar
        </Botao>
      </div>
    </form>
  )
}

/** No computador, título e explicação à esquerda e campos em duas colunas à direita; no celular, empilhado. */
function Secao({ id, titulo, descricao, children }: { id: string; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 rounded-folha bg-superficie p-5 lg:grid-cols-[16rem_1fr] lg:gap-8 lg:p-6">
      <div>
        <h2 id={id} className="text-lg font-extrabold text-texto">
          {titulo}
        </h2>
        <p className="mt-1 text-sm text-texto-2">{descricao}</p>
      </div>
      <div className="grid content-start gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}
