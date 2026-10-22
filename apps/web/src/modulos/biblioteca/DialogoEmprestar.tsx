import { PRAZO_DE_EMPRESTIMO_EM_DIAS, somarDiasAData } from '@desbravadores/shared'
import type { EmprestimoEntrada } from '@desbravadores/shared'
import { useState } from 'react'
import type { FunctionComponent } from 'react'
import type { ItemFisico } from '../../api/biblioteca'
import { MINIMO_DE_LETRAS_DA_BUSCA, useBuscaDeDesbravadores, useDetalheDoLivro, useEmprestar } from '../../api/emprestimos'
import type { DesbravadorParaEmprestimo } from '../../api/emprestimos'
import { useConexao } from '../../offline'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { CampoData } from '../../ui/CampoData'
import { cn } from '../../ui/cn'
import { Confirmacao } from '../../ui/Confirmacao'
import { isoParaTexto } from '../../ui/mascaraData'
import { mensagemDe } from './DialogosDaBiblioteca'
import { hojeDaTela, unidadeOuSem } from './hoje'

/** O exemplar a emprestar quando a tela já escolheu (o detalhe do livro); sem ele, o diálogo pega o menor número livre. */
export interface ExemplarEscolhido {
  id: string
  numero: number
}

interface Propriedades {
  aberto: boolean
  /** O livro a emprestar; nulo com o diálogo fechado. */
  item: ItemFisico | null
  /** Exemplar já escolhido no detalhe do livro. */
  exemplar?: ExemplarEscolhido
  onFechar: () => void
}

const DIAS_PARA_TRAS = 60
const SEM_INTERNET = 'Registrar o empréstimo precisa de internet. Conecte-se para continuar.'
const SEM_EXEMPLAR_LIVRE = 'Todos os exemplares estão emprestados.'

function ListaDeResultados({ desbravadores, escolhidoId, titulo, aoEscolher }: { desbravadores: DesbravadorParaEmprestimo[]; escolhidoId: string | undefined; titulo: string; aoEscolher: (desbravador: DesbravadorParaEmprestimo) => void }) {
  return (
    <ul className="flex max-h-56 flex-col overflow-y-auto rounded-controle border border-borda-controle">
      {desbravadores.map((desbravador) => {
        const ocupado = desbravador.livroEmAberto !== null
        return (
          <li key={desbravador.id} className="border-t border-divisor first:border-t-0">
            <button
              type="button"
              disabled={ocupado}
              aria-pressed={escolhidoId === desbravador.id}
              onClick={() => aoEscolher(desbravador)}
              className={cn(
                'flex min-h-[var(--touch-min)] w-full flex-col justify-center px-3.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-marca',
                ocupado ? 'cursor-not-allowed bg-superficie-suave text-texto-2' : 'text-texto hover:bg-superficie-suave',
                escolhidoId === desbravador.id && 'bg-marca-suave',
              )}
            >
              <span className="text-base font-semibold">{desbravador.nome}</span>
              <span className="text-sm text-texto-2">
                {ocupado
                  ? `${unidadeOuSem(desbravador.unidade)} · já está com “${desbravador.livroEmAberto?.titulo ?? titulo}”. Peça a devolução antes.`
                  : unidadeOuSem(desbravador.unidade)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function BuscaDoDesbravador({ titulo, escolhido, aoEscolher }: { titulo: string; escolhido: DesbravadorParaEmprestimo | null; aoEscolher: (desbravador: DesbravadorParaEmprestimo) => void }) {
  const [busca, definirBusca] = useState('')
  const consulta = useBuscaDeDesbravadores(busca)
  const curta = busca.trim().length < MINIMO_DE_LETRAS_DA_BUSCA
  const resultados = curta ? undefined : consulta.data

  return (
    <div className="flex flex-col gap-2">
      <Campo
        type="search"
        rotulo="Desbravador"
        value={busca}
        autoComplete="off"
        ajuda={curta ? 'Digite ao menos 2 letras' : undefined}
        onChange={(evento) => definirBusca(evento.target.value)}
      />
      {!curta && consulta.isError && (
        <p role="alert" className="text-sm font-medium text-perigo">
          Não foi possível buscar agora. Tente de novo.
        </p>
      )}
      {!curta && consulta.isPending && !consulta.isError && (
        <p role="status" className="text-sm text-texto-2">
          Buscando…
        </p>
      )}
      {resultados && resultados.length === 0 && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-base text-texto-2">Nenhum desbravador com esse nome</p>
          <Botao variante="secundario" onClick={() => definirBusca('')}>
            Limpar a busca
          </Botao>
        </div>
      )}
      {resultados && resultados.length > 0 && <ListaDeResultados desbravadores={resultados} escolhidoId={escolhido?.id} titulo={titulo} aoEscolher={aoEscolher} />}
      {escolhido && (
        <p className="text-base text-texto">
          {'Emprestar para '}
          <b>{escolhido.nome}</b>
          {` (${unidadeOuSem(escolhido.unidade)})`}
        </p>
      )}
    </div>
  )
}

function Conteudo({ item, exemplar, onFechar }: { item: ItemFisico; exemplar?: ExemplarEscolhido; onFechar: () => void }) {
  const detalhe = useDetalheDoLivro(item.id, exemplar === undefined)
  const emprestar = useEmprestar()
  const { modo } = useConexao()
  const hoje = hojeDaTela()
  const maisAntiga = somarDiasAData(hoje, -DIAS_PARA_TRAS)
  const [escolhido, definirEscolhido] = useState<DesbravadorParaEmprestimo | null>(null)
  const [data, definirData] = useState(hoje)

  const menorLivre = detalhe.data?.exemplares.filter((candidato) => candidato.situacao === 'DISPONIVEL').sort((a, b) => a.numero - b.numero)[0]
  const alvo: ExemplarEscolhido | undefined = exemplar ?? menorLivre
  const entrada = escolhido && escolhido.entradaEm > maisAntiga ? escolhido.entradaEm : maisAntiga
  const dataValida = data !== '' && data >= entrada && data <= hoje
  const semInternet = modo !== 'ONLINE'
  const pronto = alvo !== undefined && escolhido !== null && escolhido.livroEmAberto === null && dataValida

  const registrar = () => {
    if (!alvo || !escolhido || !pronto) return
    const corpo: EmprestimoEntrada = { exemplarId: alvo.id, desbravadorId: escolhido.id, ...(data === hoje ? {} : { emprestadoEm: data }) }
    emprestar.mutate(corpo, { onSuccess: onFechar })
  }

  const escolher = (desbravador: DesbravadorParaEmprestimo) => {
    emprestar.reset()
    definirEscolhido(desbravador)
  }

  const situacaoDoExemplar = (() => {
    if (alvo) return <p className="text-sm text-texto-2">{`Exemplar ${alvo.numero} · disponível`}</p>
    if (detalhe.isError) return <p role="alert" className="text-sm font-medium text-perigo">{mensagemDe(detalhe.error)}</p>
    if (detalhe.isPending) return <p role="status" className="text-sm text-texto-2">Carregando os exemplares…</p>
    return <p role="alert" className="text-sm font-medium text-perigo">{SEM_EXEMPLAR_LIVRE}</p>
  })()

  return (
    <Confirmacao
      aberta
      titulo={`Emprestar “${item.nome}”`}
      rotuloConfirmar="Registrar empréstimo"
      ocupada={emprestar.isPending}
      confirmarDesabilitado={semInternet || !pronto}
      erro={semInternet ? SEM_INTERNET : emprestar.isError ? mensagemDe(emprestar.error) : null}
      aoConfirmar={registrar}
      aoCancelar={onFechar}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          registrar()
        }}
      >
        {situacaoDoExemplar}
        <BuscaDoDesbravador titulo={item.nome} escolhido={escolhido} aoEscolher={escolher} />
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoData rotulo="Emprestado em" value={data} min={entrada} max={hoje} onChange={(nova) => { emprestar.reset(); definirData(nova) }} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-texto">Devolver até</span>
            <p className="min-h-[var(--touch-min)] rounded-controle border border-borda-controle bg-superficie-suave px-3.5 py-2.5 text-base text-texto">
              {data === '' ? '—' : isoParaTexto(somarDiasAData(data, PRAZO_DE_EMPRESTIMO_EM_DIAS))}
            </p>
          </div>
        </div>
        <p className="text-sm text-texto-2">{`A devolução é sempre ${PRAZO_DE_EMPRESTIMO_EM_DIAS} dias depois do empréstimo. Esta data não pode ser alterada.`}</p>
      </form>
    </Confirmacao>
  )
}

/** Empresta um exemplar: busca o desbravador no clube todo, escolhe a data do empréstimo e mostra o "devolver até" só para leitura. */
export const DialogoEmprestar: FunctionComponent<Propriedades> = ({ aberto, item, exemplar, onFechar }) =>
  aberto && item ? <Conteudo key={`${item.id}-${exemplar?.id ?? ''}`} item={item} exemplar={exemplar} onFechar={onFechar} /> : null
