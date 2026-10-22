import { SituacaoDosEmprestimos, textoDeSituacao } from '@desbravadores/shared'
import { useEffect, useState } from 'react'
import type { FunctionComponent } from 'react'
import { useEmprestimos } from '../../api/emprestimos'
import type { LinhaDeEmprestimo } from '../../api/emprestimos'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Chip } from '../../ui/Chip'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Selecao } from '../../ui/Selecao'
import { Selo } from '../../ui/Selo'
import type { TomDoSelo } from '../../ui/Selo'
import { Tabela } from '../../ui/Tabela'
import type { ColunaTabela } from '../../ui/Tabela'
import { dataCurta } from '../aulas/datas'
import { DialogoDevolver } from './DialogoDevolver'
import type { EmprestimoParaDevolver } from './DialogoDevolver'
import { nomeComSituacao, unidadeOuSem } from './hoje'

interface Propriedades {
  /** Situação com que a aba abre (vem de `?situacao=` no endereço); sem ela, todas. */
  filtroInicial?: SituacaoDosEmprestimos
}

const POR_PAGINA = 20
const ESPERA_DA_BUSCA_EM_MS = 300

const NOME_DA_SITUACAO: Record<SituacaoDosEmprestimos, string> = {
  todas: 'Todas',
  atrasados: 'Atrasados',
  'vencem-hoje': 'Vencem hoje',
  'no-prazo': 'No prazo',
}

const TOM_DA_SITUACAO: Record<LinhaDeEmprestimo['situacao'], TomDoSelo> = { NO_PRAZO: 'neutro', VENCE_HOJE: 'alerta', ATRASADO: 'perigo' }

const paraDevolver = (linha: LinhaDeEmprestimo): EmprestimoParaDevolver => ({
  emprestimoId: linha.emprestimoId,
  titulo: linha.titulo,
  numeroDoExemplar: linha.numeroDoExemplar,
  desbravadorNome: linha.desbravadorNome,
  desbravadorAtivo: linha.desbravadorAtivo,
  unidade: linha.unidade,
  devolverAte: linha.devolverAte,
})

/** A busca só vai ao servidor depois que a pessoa para de digitar. */
function useValorAtrasado(valor: string): string {
  const [atrasado, definirAtrasado] = useState(valor)
  useEffect(() => {
    const espera = setTimeout(() => definirAtrasado(valor), ESPERA_DA_BUSCA_EM_MS)
    return () => clearTimeout(espera)
  }, [valor])
  return atrasado
}

function Totalizador({ valor, rotulo, tom, selecionado, aoEscolher }: { valor: number; rotulo: string; tom?: 'perigo'; selecionado: boolean; aoEscolher: () => void }) {
  return (
    <Chip selecionado={selecionado} aoAlternar={aoEscolher} className="min-h-14 flex-col gap-0 rounded-cartao px-5 py-1.5">
      <b className={tom === 'perigo' && valor > 0 ? 'text-xl text-perigo' : 'text-xl'}>{valor}</b>
      <span className="text-sm font-normal text-texto-2">{rotulo}</span>
    </Chip>
  )
}

export const AbaEmprestimos: FunctionComponent<Propriedades> = ({ filtroInicial }) => {
  const [situacao, definirSituacao] = useState<SituacaoDosEmprestimos>(filtroInicial ?? 'todas')
  const [busca, definirBusca] = useState('')
  const [pagina, definirPagina] = useState(1)
  const [devolvendo, definirDevolvendo] = useState<EmprestimoParaDevolver | null>(null)
  const buscaEnviada = useValorAtrasado(busca.trim())
  // Os chips contam sempre o conjunto inteiro; com a aba em "Todas" e sem busca é a mesma consulta do selo da aba.
  const totais = useEmprestimos({})
  const lista = useEmprestimos({ situacao, busca: buscaEnviada })
  const comFiltro = situacao !== 'todas' || buscaEnviada !== ''

  const filtrar = (nova: SituacaoDosEmprestimos) => {
    definirSituacao(nova)
    definirPagina(1)
  }
  const limpar = () => {
    definirSituacao('todas')
    definirBusca('')
    definirPagina(1)
  }

  const colunas: ColunaTabela<LinhaDeEmprestimo>[] = [
    { chave: 'livro', titulo: 'Livro', celula: (linha) => <b>{`${linha.titulo} · ex. ${linha.numeroDoExemplar}`}</b> },
    {
      chave: 'desbravador',
      titulo: 'Com quem está',
      celula: (linha) => (
        <>
          {nomeComSituacao(linha.desbravadorNome, linha.desbravadorAtivo)}
          <div className="text-sm text-texto-2">{unidadeOuSem(linha.unidade)}</div>
        </>
      ),
    },
    { chave: 'emprestado', titulo: 'Emprestado em', celula: (linha) => dataCurta(linha.emprestadoEm) },
    { chave: 'devolver', titulo: 'Devolver até', celula: (linha) => dataCurta(linha.devolverAte) },
    { chave: 'situacao', titulo: 'Situação', celula: (linha) => <Selo tom={TOM_DA_SITUACAO[linha.situacao]}>{textoDeSituacao(linha.situacao, linha.dias)}</Selo> },
    {
      chave: 'acao',
      titulo: '',
      celula: (linha) => (
        <Botao variante="secundario" aria-label={`Devolver ${linha.titulo}, exemplar ${linha.numeroDoExemplar}`} onClick={() => definirDevolvendo(paraDevolver(linha))}>
          Devolver
        </Botao>
      ),
    },
  ]

  const cartao = (linha: LinhaDeEmprestimo) => (
    <div className="flex flex-col gap-2 rounded-cartao border border-borda-controle bg-superficie p-3">
      <div className="flex items-start justify-between gap-2">
        <b className="text-base text-texto">{`${linha.titulo} · ex. ${linha.numeroDoExemplar}`}</b>
        <Selo tom={TOM_DA_SITUACAO[linha.situacao]}>{textoDeSituacao(linha.situacao, linha.dias)}</Selo>
      </div>
      <p className="text-sm text-texto-2">{`${nomeComSituacao(linha.desbravadorNome, linha.desbravadorAtivo)} · ${unidadeOuSem(linha.unidade)}`}</p>
      <p className="text-sm text-texto-2">{`Emprestado em ${dataCurta(linha.emprestadoEm)} · devolver até ${dataCurta(linha.devolverAte)}`}</p>
      <Botao variante="secundario" aria-label={`Devolver ${linha.titulo}, exemplar ${linha.numeroDoExemplar}`} onClick={() => definirDevolvendo(paraDevolver(linha))}>
        Devolver
      </Botao>
    </div>
  )

  const corpo = (() => {
    if (!lista.data) {
      if (lista.isError) return <ErroDeCarga erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />
      if (lista.fetchStatus === 'paused') return <DisponivelComInternet />
      return <Carregando rotulo="Carregando os empréstimos" />
    }
    const itens = lista.data.itens
    const paginaVisivel = Math.min(pagina, Math.max(1, Math.ceil(itens.length / POR_PAGINA)))
    const vazio = comFiltro ? (
      <EstadoVazio
        titulo="Nenhum empréstimo com esses filtros"
        acao={
          <Botao variante="secundario" onClick={limpar}>
            Limpar a busca
          </Botao>
        }
      />
    ) : (
      <EstadoVazio titulo="Nenhum livro emprestado agora" descricao="Quando um livro físico for emprestado, ele aparece aqui até a devolução." />
    )
    return (
      <Tabela
        colunas={colunas}
        itens={itens.slice((paginaVisivel - 1) * POR_PAGINA, paginaVisivel * POR_PAGINA)}
        chaveItem={(linha) => linha.emprestimoId}
        pagina={paginaVisivel}
        porPagina={POR_PAGINA}
        total={itens.length}
        aoMudarPagina={definirPagina}
        cartao={cartao}
        vazio={vazio}
      />
    )
  })()

  return (
    <div className="flex flex-col gap-4">
      {totais.data && (
        <div className="flex flex-wrap gap-3">
          <Totalizador valor={totais.data.totais.emprestados} rotulo="Emprestados agora" selecionado={situacao === 'todas'} aoEscolher={() => filtrar('todas')} />
          <Totalizador valor={totais.data.totais.atrasados} rotulo="Atrasados" tom="perigo" selecionado={situacao === 'atrasados'} aoEscolher={() => filtrar(situacao === 'atrasados' ? 'todas' : 'atrasados')} />
          <Totalizador valor={totais.data.totais.vencemHoje} rotulo="Vencem hoje" selecionado={situacao === 'vencem-hoje'} aoEscolher={() => filtrar(situacao === 'vencem-hoje' ? 'todas' : 'vencem-hoje')} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-3xl">
        <Campo
          type="search"
          rotulo="Buscar livro ou desbravador"
          value={busca}
          autoComplete="off"
          onChange={(evento) => {
            definirBusca(evento.target.value)
            definirPagina(1)
          }}
        />
        <Selecao rotulo="Situação" value={situacao} onChange={(evento) => filtrar(SituacaoDosEmprestimos.parse(evento.target.value))}>
          {SituacaoDosEmprestimos.options.map((opcao) => (
            <option key={opcao} value={opcao}>
              {NOME_DA_SITUACAO[opcao]}
            </option>
          ))}
        </Selecao>
      </div>
      {corpo}
      <DialogoDevolver aberto={devolvendo !== null} emprestimo={devolvendo} onFechar={() => definirDevolvendo(null)} />
    </div>
  )
}
