import { Check, ClipboardList, ChevronDown, Undo2 } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Botao } from '../../ui/Botao'
import { Chip } from '../../ui/Chip'
import { cn } from '../../ui/cn'
import { dataCurta } from './datas'
import { chaveItem, concluidoAntes, efetivamenteConcluido, efetivamenteEntregue, especialidadeConcluidaAntes, estaPresente } from './estado'
import type { EstadoAula, ItemDaTarefa, Membro, Requisito } from './estado'
import type { EspecialidadeDoCatalogo } from './fontes'

const MAXIMO_DO_CHIP = 17

interface TarefaDaClasse {
  id: string
  data: string
  encerrada: boolean
  itens: ItemDaTarefa[]
}

interface Propriedades {
  /** As tarefas a cobrar neste registro, a que abre primeiro. */
  tarefas: TarefaDaClasse[]
  /** Data do registro: é a data das entregas marcadas aqui. */
  data: string
  registroAulaId: string
  membros: Membro[]
  /** Requisitos da classe: dão o código e o texto dos itens. */
  requisitos: Requisito[]
  /** `null` = pacote antigo, sem catálogo. */
  catalogo: EspecialidadeDoCatalogo[] | null
  /** Só quem pode marcar requisito cobra especialidade. */
  podeEspecialidade: boolean
  estado: EstadoAula
  comFila: Set<string>
  especialidadesFila: ReadonlySet<string>
  /** Tarefas que a fila já manda encerrar. */
  encerradasNaFila: ReadonlySet<string>
  aoEntregarRequisito: (dbvId: string, requisitoId: string) => void
  aoEntregarEspecialidade: (dbvId: string, especialidadeId: string) => void
  aoEncerrar: (tarefaId: string) => void
  aoReabrir: (tarefaId: string) => void
}

interface ItemCobrado {
  item: ItemDaTarefa
  tipo: 'Requisito' | 'Especialidade'
  /** O que cabe no chip: o código do requisito ou o nome da especialidade cortado. */
  curto: string
  /** Como o item se chama nos rótulos de leitura de tela e na lista. */
  rotulo: string
  /** O nome inteiro, mostrado abaixo dos chips. */
  inteiro: string
}

const cortar = (nome: string): string => (nome.length > MAXIMO_DO_CHIP + 1 ? `${nome.slice(0, MAXIMO_DO_CHIP).trimEnd()}…` : nome)

/** Item de requisito que saiu da classe, ou de especialidade sem nome conhecido (ou sem permissão), não se cobra aqui. */
function descrever(item: ItemDaTarefa, requisitos: Requisito[], catalogo: EspecialidadeDoCatalogo[] | null, podeEspecialidade: boolean): ItemCobrado | null {
  if ('requisitoId' in item) {
    const requisito = requisitos.find((r) => r.id === item.requisitoId)
    return requisito ? { item, tipo: 'Requisito', curto: requisito.codigo, rotulo: requisito.codigo, inteiro: `${requisito.codigo} · ${requisito.texto}` } : null
  }
  const nome = podeEspecialidade ? catalogo?.find((e) => e.id === item.especialidadeId)?.nome : undefined
  return nome ? { item, tipo: 'Especialidade', curto: cortar(nome), rotulo: nome, inteiro: nome } : null
}

export function BlocoCobranca(props: Propriedades) {
  const [mostrandoAnteriores, setMostrandoAnteriores] = useState(false)
  const { requisitos, catalogo, podeEspecialidade } = props
  const cartoes = props.tarefas
    .map((tarefa) => ({ tarefa, itens: tarefa.itens.flatMap((item) => descrever(item, requisitos, catalogo, podeEspecialidade) ?? []) }))
    .filter(({ itens }) => itens.length > 0)
  const [principal, ...anteriores] = cartoes
  if (!principal) return null

  const alternar = (
    <button
      type="button"
      aria-expanded={mostrandoAnteriores}
      onClick={() => setMostrandoAnteriores(!mostrandoAnteriores)}
      className="flex min-h-[var(--touch-min)] w-full items-center justify-center gap-2 rounded-botao px-3 text-base font-semibold text-marca hover:bg-marca-suave focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
    >
      <ChevronDown aria-hidden className={cn('size-5', mostrandoAnteriores && 'rotate-180')} />
      {anteriores.length === 1 ? '+1 tarefa anterior' : `+${anteriores.length} tarefas anteriores`}
    </button>
  )

  return (
    <div className="flex flex-col gap-4">
      <CartaoDaTarefa {...props} tarefa={principal.tarefa} itens={principal.itens} principal rodape={anteriores.length > 0 ? alternar : null} />
      {mostrandoAnteriores && anteriores.map(({ tarefa, itens }) => <CartaoDaTarefa key={tarefa.id} {...props} tarefa={tarefa} itens={itens} principal={false} rodape={null} />)}
    </div>
  )
}

interface PropriedadesCartao extends Propriedades {
  tarefa: TarefaDaClasse
  itens: ItemCobrado[]
  principal: boolean
  /** O botão que abre as tarefas anteriores, no rodapé do primeiro cartão. */
  rodape: ReactNode
}

function CartaoDaTarefa({ tarefa, itens, principal, rodape, data, registroAulaId, membros, estado, comFila, especialidadesFila, encerradasNaFila, aoEntregarRequisito, aoEntregarEspecialidade, aoEncerrar, aoReabrir }: PropriedadesCartao) {
  const idTitulo = useId()
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const atual = itens.find((i) => chaveItem(i.item) === escolhido) ?? itens[0]
  const aEncerrar = estado.tarefasEncerradas.includes(tarefa.id)
  const jaEncerrada = tarefa.encerrada || encerradasNaFila.has(tarefa.id)
  const dia = dataCurta(tarefa.data)
  if (!atual) return null

  const linhas = membros
    .filter((membro) => !membro.voce)
    .flatMap((membro) => {
      const item = atual.item
      const jaConcluido = 'requisitoId' in item ? concluidoAntes(membro, comFila, item.requisitoId) : especialidadeConcluidaAntes(membro, item.especialidadeId, registroAulaId)
      if (jaConcluido) return []
      const entregue = 'requisitoId' in item ? efetivamenteConcluido(estado, comFila, membro.dbvId, item.requisitoId) : efetivamenteEntregue(estado, especialidadesFila, membro.dbvId, item.especialidadeId)
      return jaEncerrada && !entregue ? [] : [{ membro, entregue }]
    })

  const entregar = (dbvId: string) => ('requisitoId' in atual.item ? aoEntregarRequisito(dbvId, atual.item.requisitoId) : aoEntregarEspecialidade(dbvId, atual.item.especialidadeId))

  return (
    <section aria-labelledby={idTitulo} className={cn('flex flex-col gap-4 rounded-cartao bg-superficie p-4', principal && 'border-2 border-marca')}>
      <div className="flex items-center gap-2 text-marca">
        {principal && <ClipboardList aria-hidden className="size-5" />}
        <h2 id={idTitulo} className="font-titulo text-lg font-bold text-texto">
          {principal ? `Cobrar tarefa de ${dia}` : `Tarefa de ${dia}`}
        </h2>
      </div>
      <div role="group" aria-label="Itens da tarefa" className="flex flex-wrap gap-2">
        {itens.map((item) => (
          <Chip key={chaveItem(item.item)} selecionado={chaveItem(item.item) === chaveItem(atual.item)} aoAlternar={() => setEscolhido(chaveItem(item.item))} aria-label={item.rotulo}>
            {item.curto}
          </Chip>
        ))}
      </div>
      <div className="flex flex-col gap-0.5 rounded-lg bg-marca-suave px-3 py-2.5">
        <span className="text-sm font-semibold text-texto-2">{atual.tipo}</span>
        <span className="text-base font-semibold">{atual.inteiro}</span>
      </div>
      <ul aria-label={`Quem deve ${atual.rotulo}`} className="flex flex-col">
        {linhas.map(({ membro, entregue }) => {
          const presente = estaPresente(estado, membro.dbvId)
          const situacao = presente ? 'Presente' : estado.presencas[membro.dbvId] === false ? 'Faltou' : 'Sem marcação'
          return (
            <li key={membro.dbvId} className="flex min-h-14 items-center justify-between gap-2 border-t border-borda py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="text-base font-bold">{membro.nome}</span>
                <span className="text-sm text-texto-2">{situacao}</span>
              </span>
              {entregue ? (
                <span className="flex items-center gap-1">
                  <span className="inline-flex items-center gap-1 text-base font-bold text-sucesso">
                    <Check aria-hidden className="size-4" />
                    Entregue
                  </span>
                  <Botao variante="texto" className="px-2.5" aria-label={`Entregue em ${dataCurta(data)} · ${membro.nome} · desfazer`} onClick={() => entregar(membro.dbvId)}>
                    <Undo2 aria-hidden className="size-4" />
                    Desfazer
                  </Botao>
                </span>
              ) : presente ? (
                <Botao className="px-4" aria-label={`Entregou: ${atual.rotulo} · ${membro.nome}`} onClick={() => entregar(membro.dbvId)}>
                  Entregou
                </Botao>
              ) : (
                <button type="button" disabled aria-label={`Entregou: ${atual.rotulo} · ${membro.nome} · faltou hoje`} className="min-h-[var(--touch-min)] px-3 text-base font-semibold text-texto-2 disabled:cursor-not-allowed">
                  Faltou hoje
                </button>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex flex-col gap-2 border-t border-borda pt-3">
        {jaEncerrada && <p className="text-sm text-texto-2">Tarefa encerrada. Aparece só quem entregou neste registro.</p>}
        {!jaEncerrada && aEncerrar && (
          <p className="flex items-center justify-between gap-2 text-base">
            <span className="font-semibold">Será encerrada ao salvar</span>
            <Botao variante="texto" onClick={() => aoReabrir(tarefa.id)}>
              Desfazer
            </Botao>
          </p>
        )}
        {!jaEncerrada && !aEncerrar && !confirmando && (
          <Botao variante="secundario" largura="total" onClick={() => setConfirmando(true)}>
            Encerrar tarefa
          </Botao>
        )}
        {!jaEncerrada && !aEncerrar && confirmando && (
          <div className="flex flex-col gap-2">
            <p className="text-base">{`Encerrar a tarefa de ${dia}? Quem não entregou deixa de aparecer para cobrar. O que já foi entregue continua registrado.`}</p>
            <Botao
              onClick={() => {
                aoEncerrar(tarefa.id)
                setConfirmando(false)
              }}
            >
              Encerrar
            </Botao>
            <Botao variante="texto" onClick={() => setConfirmando(false)}>
              Cancelar
            </Botao>
          </div>
        )}
        {rodape}
      </div>
    </section>
  )
}
