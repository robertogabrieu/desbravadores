import { ConfiguracaoClubeEntrada, PontosCBEntrada } from '@desbravadores/shared'
import { useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { usePontosCB, useSalvarPontosCB } from '../../../api/classe-biblica'
import type { PontosCB } from '../../../api/classe-biblica'
import { useConfiguracaoClube, useSalvarConfiguracao } from '../../../api/clube'
import type { ConfiguracaoClube } from '../../../api/clube'
import { useConexao } from '../../../offline'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { Interruptor } from '../../../ui/Interruptor'
import { Selecao } from '../../../ui/Selecao'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { lerErroDaApi } from '../desbravadores/erros'

const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

const MENSAGENS_DE_CAMPO: Record<string, string> = {
  diaReuniao: 'Escolha o dia da reunião',
  horaReuniao: 'Informe a hora da reunião',
  localReuniaoPadrao: 'O local pode ter até 120 letras',
  limiarFrequenciaAlerta: 'Informe um número de 0 a 100',
  limiarProgressoAlerta: 'Informe um número de 0 a 100',
  metaFrequencia: 'Informe um número de 0 a 100',
}

type ItemDosPontos = PontosCB['itens'][number]
/** O valor fica como texto enquanto se edita, igual aos outros números da tela. */
type RascunhoDoPonto = Omit<ItemDosPontos, 'pontos'> & { pontos: string }

const AJUDA_DO_PONTO: Record<ItemDosPontos['gatilho'], string> = {
  CLASSE_BIBLICA_PRESENCA: 'Lançados a cada encontro em que o desbravador está presente.',
  CLASSE_BIBLICA_PARTICIPACAO: 'Lançados quando a chamada marca que ele participou ativamente.',
}

const MENSAGEM_DO_PONTO = 'Informe um número de 0 a 1000'

const chaveDoPonto = (gatilho: string): string => `pontos-${gatilho}`

/** `MM-DD` → `DD/MM`. */
const diaEMesDoAno = (mesEDia: string): string => mesEDia.split('-').reverse().join('/')

export function AdmConfiguracoes() {
  const configuracao = useConfiguracaoClube()
  const { modo } = useConexao()

  let corpo
  if (configuracao.data) corpo = <FormularioConfiguracao atual={configuracao.data} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (configuracao.isError)
    corpo = (
      <ErroDeCarga erro={configuracao.error} aoTentarDeNovo={() => void configuracao.refetch()} />
    )
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
  // Sem campo na tela (nenhuma tela usa a meta ainda): o valor gravado volta como veio.
  const meta = String(atual.metaFrequencia)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const salvar = useSalvarConfiguracao()
  const pontos = usePontosCB()
  const salvarPontos = useSalvarPontosCB()
  const [rascunhoDosPontos, setRascunhoDosPontos] = useState<RascunhoDoPonto[] | null>(null)
  const itensDosPontos = rascunhoDosPontos ?? pontos.data?.itens.map((item) => ({ ...item, pontos: String(item.pontos) })) ?? null

  function mudarPonto(gatilho: string, mudanca: Partial<RascunhoDoPonto>) {
    setRascunhoDosPontos((itensDosPontos ?? []).map((item) => (item.gatilho === gatilho ? { ...item, ...mudanca } : item)))
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErros({})
    setErroGeral(null)
    setSalvo(false)
    const entrada = {
      diaReuniao: Number(diaReuniao),
      horaReuniao,
      localReuniaoPadrao: local.trim() || null,
      limiarFrequenciaAlerta:
        limiarFrequencia.trim() === '' ? Number.NaN : Number(limiarFrequencia),
      limiarProgressoAlerta: limiarProgresso.trim() === '' ? Number.NaN : Number(limiarProgresso),
      metaFrequencia: meta.trim() === '' ? Number.NaN : Number(meta),
    }
    // Sem os pontos lidos (falha ou ainda carregando), o resto da tela salva sozinho.
    const entradaDosPontos = itensDosPontos && {
      itens: itensDosPontos.map(({ gatilho, pontos: valor, ativo }) => ({
        gatilho,
        pontos: valor.trim() === '' ? Number.NaN : Number(valor),
        ativo,
      })),
    }
    const achados: Record<string, string> = {}
    const validacao = ConfiguracaoClubeEntrada.safeParse(entrada)
    if (!validacao.success) {
      for (const problema of validacao.error.issues) {
        const campo = String(problema.path[0] ?? '')
        if (campo && !(campo in achados))
          achados[campo] = MENSAGENS_DE_CAMPO[campo] ?? 'Confira este campo'
      }
    }
    const validacaoDosPontos = entradaDosPontos && PontosCBEntrada.safeParse(entradaDosPontos)
    if (validacaoDosPontos && !validacaoDosPontos.success) {
      for (const problema of validacaoDosPontos.error.issues) {
        const item = entradaDosPontos.itens[Number(problema.path[1])]
        if (item) achados[chaveDoPonto(item.gatilho)] = MENSAGEM_DO_PONTO
      }
    }
    if (Object.keys(achados).length > 0) {
      setErros(achados)
      return
    }
    try {
      await salvar.mutateAsync(entrada)
      if (entradaDosPontos) {
        const gravados = await salvarPontos.mutateAsync(entradaDosPontos)
        setRascunhoDosPontos(gravados.itens.map((item) => ({ ...item, pontos: String(item.pontos) })))
      }
      setSalvo(true)
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(campos)
      setErroGeral(geral)
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Secao id="secao-reuniao" titulo="Reunião semanal">
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-56">
              <Selecao
                rotulo="Dia da reunião"
                ajuda="Define as datas de reunião no calendário e nos cronogramas."
                value={diaReuniao}
                erro={erros['diaReuniao']}
                onChange={(e) => setDiaReuniao(e.target.value)}
              >
                {DIAS_DA_SEMANA.map((nome, indice) => (
                  <option key={nome} value={indice}>
                    {nome}
                  </option>
                ))}
              </Selecao>
            </div>
            <div className="w-40">
              <Campo
                rotulo="Hora"
                type="time"
                value={horaReuniao}
                erro={erros['horaReuniao']}
                onChange={(e) => setHoraReuniao(e.target.value)}
              />
            </div>
          </div>
          <Campo
            rotulo="Local padrão"
            ajuda="Hora e local já vêm preenchidos na chamada e aparecem no início do conselheiro."
            value={local}
            erro={erros['localReuniaoPadrao']}
            onChange={(e) => setLocal(e.target.value)}
          />
        </Secao>

        <Secao id="secao-alertas" titulo="Alertas">
          <Campo
            rotulo="Alerta de frequência"
            ajuda="Na visão geral, a unidade com presença abaixo disto aparece com alerta."
            type="number"
            inputMode="numeric"
            sufixo="%"
            value={limiarFrequencia}
            erro={erros['limiarFrequenciaAlerta']}
            onChange={(e) => setLimiarFrequencia(e.target.value)}
            className="w-24"
          />
          <Campo
            rotulo="Alerta de progresso"
            ajuda="No progresso da classe, conta quantos desbravadores cumpriram menos que isto dos requisitos."
            type="number"
            inputMode="numeric"
            sufixo="%"
            value={limiarProgresso}
            erro={erros['limiarProgressoAlerta']}
            onChange={(e) => setLimiarProgresso(e.target.value)}
            className="w-24"
          />
        </Secao>

        <Secao id="secao-pontos-cb" titulo="Pontos da Classe Bíblica">
          <p className="text-sm text-texto-2">
            Valem para as próximas chamadas; o que já foi lançado não muda.
          </p>
          {itensDosPontos ? (
            itensDosPontos.map((item) => (
              <PontoDaClasseBiblica
                key={item.gatilho}
                item={item}
                erro={erros[chaveDoPonto(item.gatilho)]}
                aoMudar={(mudanca) => mudarPonto(item.gatilho, mudanca)}
              />
            ))
          ) : pontos.isError ? (
            <ErroDeCarga erro={pontos.error} aoTentarDeNovo={() => void pontos.refetch()} />
          ) : (
            <Carregando rotulo="Carregando os pontos da Classe Bíblica">
              <Esqueleto className="h-14" />
              <Esqueleto className="h-14" />
            </Carregando>
          )}
        </Secao>
      </div>

      <p className="text-sm text-texto-2">
        Fuso horário {atual.fuso} e início do ano do clube em {diaEMesDoAno(atual.inicioAnoClube)}:
        vêm da instalação e não mudam aqui.
      </p>

      {erroGeral && (
        <p role="alert" className="text-base font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-divisor pt-4">
        {salvo && (
          <p role="status" className="text-base font-semibold text-sucesso">
            Configurações salvas.
          </p>
        )}
        <Botao type="submit" carregando={salvar.isPending || salvarPontos.isPending}>
          Salvar configurações
        </Botao>
      </div>
    </form>
  )
}

interface PropriedadesDoPonto {
  item: RascunhoDoPonto
  erro: string | undefined
  aoMudar: (mudanca: Partial<RascunhoDoPonto>) => void
}

/** Valor do critério e o "Contar" dele, lado a lado; o nome do critério completa o nome do interruptor. */
function PontoDaClasseBiblica({ item, erro, aoMudar }: PropriedadesDoPonto) {
  const idContar = useId()
  const idNome = useId()
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <Campo
          rotulo={item.nome}
          ajuda={AJUDA_DO_PONTO[item.gatilho]}
          type="number"
          inputMode="numeric"
          sufixo="pontos"
          value={item.pontos}
          erro={erro}
          onChange={(e) => aoMudar({ pontos: e.target.value })}
          className="w-24"
        />
      </div>
      <div className="flex items-center gap-2 pt-6">
        <span id={idContar} className="text-sm font-semibold text-texto">
          Contar
        </span>
        <span id={idNome} className="sr-only">
          {item.nome}
        </span>
        <Interruptor ligado={item.ativo} aoAlternar={(ativo) => aoMudar({ ativo })} idRotulo={`${idContar} ${idNome}`} />
      </div>
    </div>
  )
}

/** Grupo de campos com título; a distância entre grupos é maior que a entre campos. */
function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-folha bg-superficie p-6">
      <h2 id={id} className="text-lg font-extrabold text-texto">
        {titulo}
      </h2>
      {children}
    </section>
  )
}
