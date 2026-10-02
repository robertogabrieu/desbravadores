import type { PacoteSaida } from '@desbravadores/shared'
import { useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import { useSalvarAula } from '../../api/aulas'
import { useCronograma } from '../../api/cronograma'
import type { Cronograma } from '../../api/cronograma'
import { gravarRascunho, itensDaChave, lerRascunho, useConexao, useFila } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { FaixaAviso } from '../../ui/FaixaAviso'
import { Selecao } from '../../ui/Selecao'
import { cn } from '../../ui/cn'
import { dataCurta, diaDaSemana, listaAtualizada } from './datas'
import { EsqueletoAula } from './EstadosAula'
import { BlocoCobranca } from './BlocoCobranca'
import { ParaCasa } from './ParaCasa'
import {
  acrescentarRequisito,
  alternarEntrega,
  alternarPresenca,
  alternarRequisito,
  chaveItem,
  comporEstado,
  concluidoAntes,
  concluidoEm,
  concluidosComFila,
  concluidosDoServidor,
  efetivamenteConcluido,
  encerradasNaFila,
  encerrarTarefa,
  especialidadesComFila,
  estaPresente,
  itensDaTarefa,
  itensEntreguesAqui,
  itensPendentes,
  lerRascunhoValido,
  montarEntrada,
  passarItem,
  passarOQueFaltou,
  pontosProvisorios,
  quemFalta,
  rascunhoDe,
  reabrirTarefa,
  requisitosVisiveis,
  tirarItem,
} from './estado'
import { catalogoDeEspecialidades, especialidadesConcluidasNoRegistro, itensEmOutraTarefaAberta, tarefasDaClasse, tarefasParaCobrar } from './fontes'
import type { BaseAula, EstadoAula, ItemPendente, Membro, Requisito } from './estado'

type Pacote = z.infer<typeof PacoteSaida>
export type ClasseDoPacote = NonNullable<Pacote['instrutor']>['classes'][number]

interface Propriedades {
  pacote: Pacote
  baixadoEm: number | null
  classe: ClasseDoPacote
  data: string
  /** A aula como o servidor a tem; `null` = ainda não existe (aula nova). */
  base: BaseAula | null
}

/** Carrega a fila e o rascunho da chave antes de mostrar; muda a chave (classe ou data), remonta. */
export function FormularioAula(props: Propriedades) {
  const { eu } = useSessao()
  const chave = `aula:${props.classe.classe.id}:${props.data}`
  const membros: Membro[] = props.classe.membros
  const [inicial, setInicial] = useState<{ estado: EstadoAula; fila: ItemPendente[] } | null>(null)
  const registroAulaId = useRef<string>(props.base?.registroAulaId ?? crypto.randomUUID())

  useEffect(() => {
    let cancelado = false
    const usuarioId = eu?.usuario.id
    void Promise.all([itensDaChave(chave), usuarioId ? lerRascunho(usuarioId, chave) : null]).then(([itens, rascunho]) => {
      if (cancelado) return
      const fila = itensPendentes(itens)
      if (!props.base && fila[0]) registroAulaId.current = fila[0].registroAulaId
      const tarefaDoRegistro = tarefasDaClasse(props.classe).find((tarefa) => tarefa.registroAulaId === props.base?.registroAulaId)
      setInicial({ estado: comporEstado({ membros, base: props.base, fila, rascunho: lerRascunhoValido(rascunho), tarefaDoRegistroId: tarefaDoRegistro?.id }), fila })
    })
    return () => {
      cancelado = true
    }
    // Recarrega só quando a chave muda: o pacote pode ser rebaixado no meio da aula sem apagar os toques.
  }, [chave, eu?.usuario.id])

  if (!inicial) return <EsqueletoAula />
  return <CorpoAula {...props} chave={chave} registroAulaId={registroAulaId.current} inicial={inicial.estado} fila={inicial.fila} />
}

interface AulaPlanejada {
  aulaPlanejadaId: string
  requisitoIds: string[]
}

interface FontesDaAulaPlanejada {
  cronograma: Cronograma | undefined
  aulasProximas: ClasseDoPacote['aulasProximas']
  base: BaseAula | null
  data: string
}

/** Com conexão o cronograma cobre também as datas passadas; sem ele (ou sem a data nele), vale o pacote. */
function aulaPlanejadaDaData({ cronograma, aulasProximas, base, data }: FontesDaAulaPlanejada): AulaPlanejada | undefined {
  const daCronograma = cronograma?.aulas.find(
    (aula) => aula.origem === 'PLANEJADA' && aula.id !== null && (base?.aulaPlanejadaId ? aula.id === base.aulaPlanejadaId : aula.data === data),
  )
  if (daCronograma?.id) return { aulaPlanejadaId: daCronograma.id, requisitoIds: daCronograma.requisitos.map((requisito) => requisito.id) }
  return aulasProximas.find((aula) => (base?.aulaPlanejadaId ? aula.aulaPlanejadaId === base.aulaPlanejadaId : aula.data === data))
}

interface PropriedadesCorpo extends Propriedades {
  chave: string
  registroAulaId: string
  inicial: EstadoAula
  fila: ItemPendente[]
}

function CorpoAula({ pacote, baixadoEm, classe, data, base, chave, registroAulaId, inicial, fila }: PropriedadesCorpo) {
  const { eu, pode } = useSessao()
  const { modo } = useConexao()
  const { avisos } = useFila()
  const salvar = useSalvarAula()
  const [estado, setEstado] = useState(inicial)

  const membros: Membro[] = classe.membros
  // Liga uma vez e nunca desliga: se o sinal cair no meio, o cronograma já lido continua valendo; se a tela abriu sem rede, passa a ler quando ela voltar.
  const [lerCronograma, definirLerCronograma] = useState(modo !== 'SEM_CONEXAO')
  useEffect(() => {
    if (modo !== 'SEM_CONEXAO') definirLerCronograma(true)
  }, [modo])
  const cronograma = useCronograma(lerCronograma ? classe.classe.id : undefined)
  const planejada = aulaPlanejadaDaData({ cronograma: cronograma.data, aulasProximas: classe.aulasProximas, base, data })

  const servidor = concluidosDoServidor(base)
  const comFila = concluidosComFila(servidor, fila)
  const especialidadesNoServidor = especialidadesConcluidasNoRegistro(classe, registroAulaId)
  const especialidadesFila = especialidadesComFila(especialidadesNoServidor, fila)
  const tarefas = tarefasDaClasse(classe)
  const entregues = itensEntreguesAqui({ itens: tarefas.flatMap((tarefa) => tarefa.itens), membros, estado, comFila, especialidadesFila })
  const tarefasACobrar = tarefasParaCobrar({ tarefas, registroAulaId, data, entregues })
  const daCobranca = new Set(tarefasACobrar.flatMap((tarefa) => tarefa.itens.flatMap((item) => ('requisitoId' in item ? [item.requisitoId] : []))))
  const requisitos = requisitosVisiveis({ daClasse: classe.requisitos, base, planejados: planejada?.requisitoIds ?? [], estado, daCobranca })
  const disponiveis = classe.requisitos.filter((r) => !requisitos.some((v) => v.id === r.id) && !daCobranca.has(r.id))

  const presentes = membros.filter((m) => estaPresente(estado, m.dbvId)).length
  const pontosDoPacote = pacote.instrutor
  const pontos = pontosProvisorios({
    membros,
    estado,
    servidor,
    comFila,
    requisitos: [...requisitos, ...classe.requisitos.filter((r) => daCobranca.has(r.id))],
    pontosRequisito: pontosDoPacote?.pontosRequisito ?? { pontos: 0, ativo: false },
    especialidades: { servidor: especialidadesNoServidor, comFila: especialidadesFila, pontos: pontosDoPacote?.pontosEspecialidade ?? { pontos: 0, ativo: false } },
  })
  const catalogo = catalogoDeEspecialidades(pacote)
  const entrada = montarEntrada({
    estado,
    membros,
    requisitos: [...requisitos, ...classe.requisitos],
    especialidades: catalogo ?? [],
    base,
    registroAulaId,
    aulaPlanejadaId: base ? base.aulaPlanejadaId : (planejada?.aulaPlanejadaId ?? null),
    classe: { id: classe.classe.id, nome: classe.classe.nome },
    data,
  })

  function mudar(proximo: EstadoAula) {
    setEstado(proximo)
    if (eu) void gravarRascunho(eu.usuario.id, chave, rascunhoDe(proximo))
  }

  const atualizada = listaAtualizada(baixadoEm, pacote.clube.fuso)
  const faltas = quemFalta(membros, estado, comFila, requisitos)
  const pontosAtivos = (pontosDoPacote?.pontosRequisito.ativo ?? false) || (pontosDoPacote?.pontosEspecialidade.ativo ?? false)

  const itensParaCasa = itensDaTarefa({ daTarefa: tarefas.find((tarefa) => tarefa.registroAulaId === registroAulaId)?.itens ?? [], fila, estado })
  const indisponiveis = new Set([...itensEmOutraTarefaAberta(tarefas, registroAulaId), ...itensParaCasa.map(chaveItem)])
  const haOQueFaltou = faltas.some(({ requisito, nomes }) => nomes.length > 0 && !indisponiveis.has(chaveItem({ requisitoId: requisito.id })))

  return (
    <div className="flex flex-col gap-4">
      {modo === 'SEM_CONEXAO' && <FaixaAviso>Sem conexão. A classe fica guardada no aparelho e é enviada quando a internet voltar.</FaixaAviso>}
      <header className="flex flex-col gap-1">
        <h1 className="font-titulo text-2xl font-extrabold">Registro de classe</h1>
        <p className="text-sm text-texto-2">{`${classe.classe.nome} · ${diaDaSemana(data)} ${dataCurta(data)}`}</p>
        {atualizada && <p className="text-sm text-texto-2">{atualizada}</p>}
      </header>

      <section aria-label="Presença e requisitos" className="flex flex-col gap-2">
        <p className="text-sm text-texto-2">Toque no nome para marcar presença ou falta. Depois marque os requisitos de quem veio.</p>
        <ul className="overflow-x-auto rounded-cartao bg-superficie">
          <li aria-hidden className="flex items-center gap-1 bg-superficie-suave px-3 py-2 text-xs font-extrabold text-texto-2">
            <span className="min-w-32 flex-1">Desbravador</span>
            {requisitos.map((requisito) => (
              <span key={requisito.id} className="w-12 shrink-0 text-center">{requisito.codigo}</span>
            ))}
          </li>
          {membros.map((membro) => (
            <LinhaDbv
              key={membro.dbvId}
              membro={membro}
              presente={estaPresente(estado, membro.dbvId)}
              situacao={estado.presencas[membro.dbvId] ?? null}
              requisitos={requisitos}
              estado={estado}
              comFila={comFila}
              aoAlternarPresenca={() => mudar(alternarPresenca(estado, membro.dbvId, { requisitos: comFila, especialidades: especialidadesFila }))}
              aoAlternarRequisito={(requisitoId) => mudar(alternarRequisito(estado, comFila, membro.dbvId, requisitoId))}
            />
          ))}
        </ul>
      </section>

      <BlocoCobranca
        tarefas={tarefasACobrar}
        data={data}
        registroAulaId={registroAulaId}
        membros={membros}
        requisitos={classe.requisitos}
        catalogo={catalogo}
        podeEspecialidade={pode('requisito.marcar')}
        estado={estado}
        comFila={comFila}
        especialidadesFila={especialidadesFila}
        encerradasNaFila={encerradasNaFila(fila)}
        aoEntregarRequisito={(dbvId, requisitoId) => mudar(alternarRequisito(estado, comFila, dbvId, requisitoId))}
        aoEntregarEspecialidade={(dbvId, especialidadeId) => mudar(alternarEntrega(estado, especialidadesFila, dbvId, especialidadeId))}
        aoEncerrar={(tarefaId) => mudar(encerrarTarefa(estado, tarefaId))}
        aoReabrir={(tarefaId) => mudar(reabrirTarefa(estado, tarefaId))}
      />

      <section aria-labelledby="titulo-requisitos" className="flex flex-col gap-2 rounded-cartao bg-superficie p-3">
        <h2 id="titulo-requisitos" className="text-sm font-bold text-texto-2">
          Requisitos desta classe
        </h2>
        {requisitos.length === 0 && <p className="text-sm text-texto-2">Nenhum requisito nesta classe. Use “+ Requisito” para acrescentar.</p>}
        <ul className="flex flex-col gap-2">
          {requisitos.map((requisito) => (
            <li key={requisito.id} className="flex items-start gap-3">
              <span className="w-12 shrink-0 rounded-md bg-superficie-suave py-0.5 text-center text-xs font-extrabold text-texto-2">{requisito.codigo}</span>
              <span className="text-sm">{requisito.texto}</span>
            </li>
          ))}
        </ul>
        {disponiveis.length > 0 && (
          <Selecao
            rotulo="+ Requisito"
            value=""
            onChange={(e) => {
              if (e.target.value) mudar(acrescentarRequisito(estado, e.target.value))
            }}
          >
            <option value="">Escolha um requisito</option>
            {disponiveis.map((requisito) => (
              <option key={requisito.id} value={requisito.id}>{`${requisito.codigo} · ${requisito.texto}`}</option>
            ))}
          </Selecao>
        )}
      </section>

      {requisitos.length > 0 && (
        <section aria-labelledby="titulo-falta" className="flex flex-col gap-1 rounded-cartao bg-alerta-fundo p-3 text-alerta">
          <h2 id="titulo-falta" className="text-sm font-bold">
            O que falta fazer
          </h2>
          {faltas.map(({ requisito, nomes }) => (
            <p key={requisito.id} className="text-sm">
              <strong>{requisito.codigo}</strong>
              {` · ${nomes.length > 0 ? nomes.map((nome) => nome.split(' ')[0]).join(', ') : 'Todos concluíram'}`}
            </p>
          ))}
        </section>
      )}

      <ParaCasa
        itens={itensParaCasa}
        requisitos={classe.requisitos}
        catalogo={catalogo}
        indisponiveis={indisponiveis}
        podeEspecialidade={pode('requisito.marcar')}
        haOQueFaltou={haOQueFaltou}
        aoPassarRequisito={(requisitoId) => mudar(passarItem(estado, { requisitoId }))}
        aoPassarEspecialidade={(especialidadeId) => mudar(passarItem(estado, { especialidadeId }))}
        aoTirar={(item) => mudar(tirarItem(estado, item))}
        aoPassarOQueFaltou={() => mudar(passarOQueFaltou(estado, faltas, indisponiveis))}
      />

      <div className="flex flex-col gap-2 border-t border-borda pt-4">
        {modo === 'SEM_CONEXAO' && avisos.instalarNaTelaInicial && <FaixaAviso>Instale o app na tela inicial para não perder classes guardadas</FaixaAviso>}
        {pontosAtivos && (
          <p className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{`${pontos} pts`}</span>
            <span className="rounded-full bg-alerta-fundo px-2 py-0.5 text-alerta">provisório</span>
          </p>
        )}
        <Botao
          largura="total"
          disabled={!entrada || salvar.isPending || cronograma.isLoading}
          carregando={salvar.isPending}
          onClick={() => {
            if (entrada) salvar.mutate(entrada)
          }}
        >
          {`Salvar classe · ${presentes} presentes`}
        </Botao>
      </div>
    </div>
  )
}

interface PropriedadesLinha {
  membro: Membro
  presente: boolean
  situacao: boolean | null
  requisitos: Requisito[]
  estado: EstadoAula
  comFila: Set<string>
  aoAlternarPresenca: () => void
  aoAlternarRequisito: (requisitoId: string) => void
}

function LinhaDbv({ membro, presente, situacao, requisitos, estado, comFila, aoAlternarPresenca, aoAlternarRequisito }: PropriedadesLinha) {
  return (
    <li aria-label={membro.nome} className="flex items-center gap-1 border-t border-borda px-3 py-1">
      <button
        type="button"
        aria-pressed={presente}
        onClick={aoAlternarPresenca}
        className="flex min-h-[var(--touch-min)] min-w-32 flex-1 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      >
        <span aria-hidden className={cn('size-3 shrink-0 rounded-full', presente ? 'bg-sucesso' : 'border-2 border-borda')} />
        <span className="flex flex-col">
          <span className={cn('flex items-baseline gap-2 text-sm font-bold', !presente && 'text-texto-2')}>
            {membro.nome}
            {membro.voce && <span className="rounded-full bg-marca-suave px-2 py-0.5 text-xs text-texto">você</span>}
          </span>
          <span className="text-xs text-texto-2">{presente ? 'Presente' : situacao === false ? 'Faltou' : 'Sem marcação'}</span>
        </span>
      </button>
      {membro.voce ? (
        presente && <span className="text-xs text-texto-2">Outro instrutor ou o Adm registra os seus requisitos.</span>
      ) : (
        requisitos.map((requisito) => {
          const antes = concluidoAntes(membro, comFila, requisito.id)
          const feito = antes || efetivamenteConcluido(estado, comFila, membro.dbvId, requisito.id)
          const dataAntes = antes ? concluidoEm(membro, requisito.id) : null
          const rotulo = `${requisito.codigo} · ${membro.nome}${antes ? ' · concluído antes' : ''}${dataAntes ? ` · feito em ${dataCurta(dataAntes)}` : ''}`
          return (
            <button
              key={requisito.id}
              type="button"
              aria-label={rotulo}
              aria-pressed={feito}
              disabled={!presente || antes}
              onClick={() => aoAlternarRequisito(requisito.id)}
              className={cn(
                'flex size-11 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca',
                !presente && 'border border-dashed border-borda bg-superficie-suave',
                presente && feito && 'bg-marca text-white',
                presente && !feito && 'border-2 border-borda bg-superficie',
                antes && 'opacity-60',
              )}
            >
              {dataAntes ? (
                <span aria-hidden className="flex flex-col items-center text-xs leading-tight">
                  <span>✓</span>
                  <span>{dataCurta(dataAntes)}</span>
                </span>
              ) : (
                <span aria-hidden>{feito ? '✓' : ''}</span>
              )}
            </button>
          )
        })
      )}
    </li>
  )
}
