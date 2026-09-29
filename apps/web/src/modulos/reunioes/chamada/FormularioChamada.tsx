import type { PacoteSaida } from '@desbravadores/shared'
import { hojeNoFuso } from '@desbravadores/shared'
import { useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import { useSalvarChamada } from '../../../api/reunioes'
import { gravarRascunho, itensDaChave, lerRascunho, useConexao, useFila } from '../../../offline'
import { useSessao } from '../../../sessao/useSessao'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { Chip } from '../../../ui/Chip'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { cn } from '../../../ui/cn'
import { EsqueletoChamada } from './EstadosChamada'
import { alternarAtraso, alternarJustificada, alternarPresenca, comporEstado, editarCabecalho, ehPresente, itensPendentes, lerRascunhoValido, montarEntrada, rascunhoDe, resumir, tocar } from './estado'
import type { BaseReuniao, EstadoChamada, Marca } from './estado'

type Pacote = z.infer<typeof PacoteSaida>
export type UnidadeDoPacote = Pacote['unidades'][number]

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function dataCurta(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

const diaDaSemana = (data: string): string => DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()] ?? ''

function horaNoFuso(instante: number, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hour12: false }).format(instante)
}

function listaAtualizada(baixadoEm: number | null, fuso: string): string | null {
  if (baixadoEm === null) return null
  const dia = hojeNoFuso(fuso, new Date(baixadoEm)) === hojeNoFuso(fuso, new Date()) ? 'hoje' : dataCurta(hojeNoFuso(fuso, new Date(baixadoEm)))
  return `Lista atualizada ${dia} às ${horaNoFuso(baixadoEm, fuso)}`
}

interface PropriedadesLinha {
  nome: string
  marca: Marca
  licaoAtiva: boolean
  aoMudar: (marca: Marca) => void
}

function LinhaDbv({ nome, marca, licaoAtiva, aoMudar }: PropriedadesLinha) {
  const presente = ehPresente(marca)
  const ausente = marca.situacao === 'FALTA' || marca.situacao === 'FALTA_JUSTIFICADA'
  return (
    <li
      aria-label={nome}
      className={cn('flex flex-col gap-2 rounded-cartao p-3', presente ? 'border border-superficie bg-superficie' : 'border border-dashed border-borda bg-superficie-suave')}
    >
      <button
        type="button"
        aria-pressed={presente}
        onClick={() => aoMudar(alternarPresenca(marca))}
        className="flex min-h-[var(--touch-min)] items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      >
        <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold', presente ? 'bg-marca text-white' : 'border-2 border-borda bg-superficie text-transparent')}>
          ✓
        </span>
        <span className="flex flex-col">
          <span className="font-semibold">{nome}</span>
          <span className="text-sm text-texto-2">{presente ? (marca.situacao === 'ATRASADO' ? 'Atrasou' : 'Pontual') : ausente ? 'Ausente' : 'Sem marcação'}</span>
        </span>
      </button>
      {presente && (
        <div className="flex flex-wrap gap-2">
          <Chip selecionado={marca.situacao === 'ATRASADO'} aoAlternar={() => aoMudar(alternarAtraso(marca))}>Atrasou</Chip>
          <Chip selecionado={marca.uniforme} aoAlternar={(valor) => aoMudar({ ...marca, uniforme: valor })}>Uniforme</Chip>
          <Chip selecionado={marca.biblia} aoAlternar={(valor) => aoMudar({ ...marca, biblia: valor })}>Bíblia</Chip>
          {licaoAtiva && <Chip selecionado={marca.licao} aoAlternar={(valor) => aoMudar({ ...marca, licao: valor })}>Lição</Chip>}
        </div>
      )}
      {ausente && (
        <div className="flex flex-wrap gap-2">
          <Chip selecionado={marca.situacao === 'FALTA_JUSTIFICADA'} aoAlternar={() => aoMudar(alternarJustificada(marca))}>Justificada</Chip>
        </div>
      )}
    </li>
  )
}

interface Propriedades {
  pacote: Pacote
  baixadoEm: number | null
  unidade: UnidadeDoPacote
  data: string
  /** A reunião como o servidor a tem; `null` = ainda não existe (chamada nova). */
  base: BaseReuniao | null
}

/** Carrega a fila e o rascunho da chave antes de mostrar; muda a chave (unidade ou data), remonta. */
export function FormularioChamada(props: Propriedades) {
  const { eu } = useSessao()
  const chave = `${props.unidade.id}:${props.data}`
  const [inicial, setInicial] = useState<EstadoChamada | null>(null)
  const reuniaoId = useRef<string>(props.base?.reuniaoId ?? crypto.randomUUID())

  useEffect(() => {
    let cancelado = false
    const usuarioId = eu?.usuario.id
    void Promise.all([itensDaChave(chave), usuarioId ? lerRascunho(usuarioId, chave) : null]).then(([itens, rascunho]) => {
      if (cancelado) return
      const fila = itensPendentes(itens)
      if (!props.base && fila[0]) reuniaoId.current = fila[0].reuniaoId
      setInicial(
        comporEstado({
          membros: props.unidade.membros,
          cabecalhoPadrao: { horario: props.pacote.clube.horaReuniao, local: props.pacote.clube.localReuniaoPadrao ?? '', observacoes: '' },
          base: props.base,
          fila,
          rascunho: lerRascunhoValido(rascunho),
        }),
      )
    })
    return () => {
      cancelado = true
    }
    // Recarrega só quando a chave muda: o pacote pode ser rebaixado no meio da chamada sem apagar os toques.
  }, [chave, eu?.usuario.id])

  if (!inicial) return <EsqueletoChamada />
  return <CorpoChamada {...props} chave={chave} reuniaoId={reuniaoId.current} inicial={inicial} />
}

interface PropriedadesCorpo extends Propriedades {
  chave: string
  reuniaoId: string
  inicial: EstadoChamada
}

function CorpoChamada({ pacote, baixadoEm, unidade, data, base, chave, reuniaoId, inicial }: PropriedadesCorpo) {
  const { eu } = useSessao()
  const { modo } = useConexao()
  const { avisos } = useFila()
  const salvar = useSalvarChamada()
  const [estado, setEstado] = useState(inicial)

  const resumo = resumir(estado, pacote)
  const licaoAtiva = pacote.criterios.some((criterio) => criterio.gatilho === 'LICAO' && criterio.ativo)
  const exigeTodos = base === null
  const nadaTocado = estado.tocadas.length === 0 && !estado.cabecalhoTocado
  const faltam = exigeTodos ? resumo.semMarca : 0
  const podeSalvar = !salvar.isPending && (exigeTodos ? faltam === 0 : !nadaTocado)

  function mudar(proximo: EstadoChamada) {
    setEstado(proximo)
    if (eu) void gravarRascunho(eu.usuario.id, chave, rascunhoDe(proximo))
  }

  function aoSalvar() {
    const entrada = montarEntrada({ estado, membros: unidade.membros, base, reuniaoId, unidade, data, pontos: resumo.pontos })
    if (entrada) salvar.mutate(entrada)
  }

  const atualizada = listaAtualizada(baixadoEm, pacote.clube.fuso)
  const cabecalho = estado.cabecalho

  return (
    <div className="flex flex-col gap-4">
      {modo === 'SEM_CONEXAO' && (
        <FaixaAviso>Sem conexão. A chamada fica guardada no aparelho e é enviada quando a internet voltar.</FaixaAviso>
      )}
      <header className="flex flex-col gap-1">
        <h1 className="font-titulo text-2xl font-extrabold">Registro de reunião</h1>
        <p className="text-sm text-texto-2">{`${diaDaSemana(data)} ${dataCurta(data)} · ${unidade.nome}`}</p>
        {atualizada && <p className="text-sm text-texto-2">{atualizada}</p>}
      </header>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        <span>{`${resumo.presentes}/${unidade.membros.length} presentes`}</span>
        <span>{`${resumo.atrasos} atrasos`}</span>
        <span>{`${resumo.uniformes} uniformes`}</span>
        <span>{`${resumo.biblias} Bíblias`}</span>
      </div>
      <p className="text-sm text-texto-2">Toque no nome para marcar presença. Depois marque atraso, uniforme e Bíblia.</p>
      <ul className="flex flex-col gap-2">
        {unidade.membros.map((membro) => (
          <LinhaDbv
            key={membro.dbvId}
            nome={membro.nome}
            marca={estado.marcas[membro.dbvId] ?? { situacao: null, uniforme: false, biblia: false, licao: false }}
            licaoAtiva={licaoAtiva}
            aoMudar={(marca) => mudar(tocar(estado, membro.dbvId, marca))}
          />
        ))}
      </ul>
      <section className="flex flex-col gap-3">
        <Campo rotulo="Horário" type="time" value={cabecalho.horario} onChange={(e) => mudar(editarCabecalho(estado, { horario: e.target.value }))} />
        <Campo rotulo="Local" value={cabecalho.local} maxLength={120} onChange={(e) => mudar(editarCabecalho(estado, { local: e.target.value }))} />
        <Campo rotulo="Observações" value={cabecalho.observacoes} maxLength={2000} onChange={(e) => mudar(editarCabecalho(estado, { observacoes: e.target.value }))} />
      </section>
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-borda bg-superficie py-3">
        {modo === 'SEM_CONEXAO' && avisos.instalarNaTelaInicial && (
          <FaixaAviso>Instale o app na tela inicial para não perder chamadas guardadas</FaixaAviso>
        )}
        {faltam > 0 && <p className="text-sm text-texto-2">{faltam === 1 ? 'Marque o 1 que falta' : `Marque os ${faltam} que faltam`}</p>}
        <p className="flex items-center gap-2 text-sm">
          <span className="font-semibold">{`${resumo.pontos} pts`}</span>
          <span className="rounded-full bg-alerta-fundo px-2 text-alerta">provisório</span>
        </p>
        <Botao largura="total" disabled={!podeSalvar} carregando={salvar.isPending} onClick={aoSalvar}>
          {`Salvar chamada · ${resumo.pontos} pts`}
        </Botao>
      </div>
    </div>
  )
}
