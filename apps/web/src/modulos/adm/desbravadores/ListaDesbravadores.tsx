import { TipoPessoa } from '@desbravadores/shared'
import { FileSpreadsheet, SlidersHorizontal, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLarguraMenorQue } from '../../../layouts/useLarguraMenorQue'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { POR_PAGINA, useDesbravadores } from '../../../api/desbravadores'
import type { Desbravador, SituacaoDesbravador, TipoDesbravador } from '../../../api/desbravadores'
import { useClasses, useUnidades } from '../../../api/leitura'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { LinkDeFicha } from '../../../ui/LinkDeFicha'
import { Selecao } from '../../../ui/Selecao'
import { Selo } from '../../../ui/Selo'
import { LARGURA_DO_CELULAR, Tabela } from '../../../ui/Tabela'
import type { ColunaTabela } from '../../../ui/Tabela'
import { useEstadoDeVolta, useFiltrosNaUrl } from '../navegacao'
import { ChipClasse } from './ChipClasse'
import type { ResultadoDaImportacao } from './ImportarDesbravadores'

const SEM_UNIDADE = 'sem'

export const NOME_DO_TIPO: Record<TipoDesbravador, string> = { DBV: 'Desbravador', DIRETORIA: 'Diretoria', LIDER: 'Líder' }

/** O valor da seleção vira Tipo; "Todos" (vazio) não filtra. */
const lerTipo = (valor: string): TipoDesbravador | '' => {
  const lido = TipoPessoa.safeParse(valor)
  return lido.success ? lido.data : ''
}

function ehResultadoDaImportacao(estado: unknown): estado is ResultadoDaImportacao {
  return typeof estado === 'object' && estado !== null && 'importados' in estado && typeof estado.importados === 'number'
}

/** Sem o parâmetro, a lista mostra só os ativos. */
const lerSituacao = (valor: string): SituacaoDesbravador => (valor === 'false' || valor === 'todos' ? valor : 'true')

export function ListaDesbravadores() {
  const { ler, mudar } = useFiltrosNaUrl()
  const navegar = useNavigate()
  const local = useLocation()
  const estadoDeVolta = useEstadoDeVolta()
  const estadoDaRota: unknown = local.state
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [importados] = useState(() => (ehResultadoDaImportacao(estadoDaRota) ? estadoDaRota.importados : null))

  const busca = ler('busca')
  const unidade = ler('unidade')
  const classeId = ler('classe')
  const situacao = lerSituacao(ler('situacao'))
  const tipo = lerTipo(ler('tipo'))
  const pagina = Math.max(1, Number.parseInt(ler('pagina'), 10) || 1)

  // O resultado chega no estado da navegação, que sobrevive ao recarregar: lido uma vez, sai do histórico.
  useEffect(() => {
    if (ehResultadoDaImportacao(estadoDaRota)) void navegar({ pathname: local.pathname, search: local.search }, { replace: true, state: null })
  }, [estadoDaRota, local.pathname, local.search, navegar])

  const unidades = useUnidades({ todas: true })
  const classes = useClasses({ tipo: 'REGULAR' })
  const consulta = useDesbravadores({
    busca: busca.trim() || undefined,
    unidadeId: unidade && unidade !== SEM_UNIDADE ? unidade : undefined,
    semUnidade: unidade === SEM_UNIDADE || undefined,
    classeId: classeId || undefined,
    ativo: situacao,
    tipo: tipo || undefined,
    pagina,
  })

  const filtrar = (chave: string) => (valor: string) => mudar({ [chave]: valor, pagina: '' })
  const comFiltro = Boolean(busca.trim() || unidade || classeId || tipo) || situacao !== 'true'
  const limparFiltros = () => mudar({ busca: '', unidade: '', classe: '', situacao: '', tipo: '', pagina: '' })
  const filtrosLigados = [unidade, classeId, situacao !== 'true', tipo].filter(Boolean).length
  const limparFiltrosDaFolha = () => mudar({ unidade: '', classe: '', situacao: '', tipo: '', pagina: '' })

  const colunas: ColunaTabela<Desbravador>[] = [
    {
      chave: 'nome',
      titulo: 'Nome',
      celula: (d) => <LinkDeFicha to={`/adm/desbravadores/${d.id}`} state={estadoDeVolta} nome={d.nome} />,
    },
    { chave: 'idade', titulo: 'Idade', celula: (d) => d.idade },
    { chave: 'unidade', titulo: 'Unidade', celula: (d) => (d.tipo === 'DBV' ? (d.unidade?.nome ?? 'Sem unidade') : '—') },
    { chave: 'classe', titulo: 'Classe', celula: (d) => (d.classeAtual ? <ChipClasse classe={d.classeAtual} /> : '—') },
    { chave: 'tipo', titulo: 'Tipo', celula: (d) => NOME_DO_TIPO[d.tipo] },
  ]

  const total = consulta.data?.total ?? 0
  const irParaImportar = () => void navegar('/adm/desbravadores/importar')

  const cartao = (d: Desbravador) => {
    const unidadeDoCartao = d.tipo === 'DBV' ? ` · ${d.unidade?.nome ?? 'Sem unidade'}` : ''
    return (
      <LinhaQueNavega forma="cartao" to={`/adm/desbravadores/${d.id}`} state={estadoDeVolta}>
        <p className="break-words text-lg font-semibold">{d.nome}</p>
        <p className="mt-0.5 text-sm text-texto-2">
          {d.idade} anos{unidadeDoCartao}
        </p>
        {(d.classeAtual || d.tipo !== 'DBV') && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {d.classeAtual && <ChipClasse classe={d.classeAtual} />}
            {d.tipo !== 'DBV' && <Selo className="px-2.5 py-0.5 font-semibold">{NOME_DO_TIPO[d.tipo]}</Selo>}
          </div>
        )}
      </LinhaQueNavega>
    )
  }

  const rotuloDeMostrar = !consulta.data ? 'Mostrar desbravadores' : total === 1 ? 'Mostrar 1 desbravador' : `Mostrar ${total} desbravadores`

  const campoDeBusca = <Campo rotulo="Buscar por nome" type="search" value={busca} onChange={(e) => filtrar('busca')(e.target.value)} />

  const selecoesDeFiltro = (
    <>
      <Selecao rotulo="Unidade" value={unidade} onChange={(e) => filtrar('unidade')(e.target.value)}>
        <option value="">Todas as unidades</option>
        <option value={SEM_UNIDADE}>Sem unidade</option>
        {unidades.data?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome}
          </option>
        ))}
      </Selecao>
      <Selecao rotulo="Classe" value={classeId} onChange={(e) => filtrar('classe')(e.target.value)}>
        <option value="">Todas as classes</option>
        {classes.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </Selecao>
      <Selecao
        rotulo="Situação"
        value={situacao}
        onChange={(e) => filtrar('situacao')(e.target.value === 'true' ? '' : e.target.value)}
      >
        <option value="true">Ativos</option>
        <option value="false">Inativos</option>
        <option value="todos">Todos</option>
      </Selecao>
      <Selecao rotulo="Tipo" value={tipo} onChange={(e) => filtrar('tipo')(lerTipo(e.target.value))}>
        <option value="">Todos</option>
        <option value="DBV">{NOME_DO_TIPO.DBV}</option>
        <option value="DIRETORIA">{NOME_DO_TIPO.DIRETORIA}</option>
        <option value="LIDER">{NOME_DO_TIPO.LIDER}</option>
      </Selecao>
    </>
  )

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-texto">Desbravadores</h1>
          {consulta.data && <p className="text-base text-texto-2">{total === 1 ? '1 cadastrado' : `${total} cadastrados`}</p>}
        </div>
        {celular ? (
          <div className="grid w-full grid-cols-2 gap-2">
            <Link to="/adm/desbravadores/novo" state={estadoDeVolta} className={estiloDoBotao({ className: 'px-3' })}>
              <Plus aria-hidden className="size-5" />
              Novo desbravador
            </Link>
            <Botao variante="secundario" className="px-3" onClick={irParaImportar}>
              <FileSpreadsheet aria-hidden className="size-5" />
              Importar
            </Botao>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" onClick={irParaImportar}>
              <FileSpreadsheet aria-hidden className="size-5" />
              Importar planilha
            </Botao>
            <Link to="/adm/desbravadores/novo" state={estadoDeVolta} className={estiloDoBotao()}>
              <Plus aria-hidden className="size-5" />
              Novo desbravador
            </Link>
          </div>
        )}
      </header>

      {importados !== null && (
        <p role="status" className="text-base font-semibold text-sucesso">
          {importados === 1 ? '1 desbravador importado.' : `${importados} desbravadores importados.`}
        </p>
      )}

      {celular ? (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">{campoDeBusca}</div>
          <Botao
            variante="secundario"
            aria-label={filtrosLigados ? `Filtros, ${filtrosLigados} ligados` : 'Filtros'}
            onClick={() => setFiltrosAbertos(true)}
          >
            <SlidersHorizontal aria-hidden className="size-5" />
            Filtros
            {filtrosLigados > 0 && <Selo className="px-2 py-0">{filtrosLigados}</Selo>}
          </Botao>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {campoDeBusca}
          {selecoesDeFiltro}
        </div>
      )}

      {celular && (
        <FolhaLateral aberta={filtrosAbertos} titulo="Filtrar desbravadores" aoFechar={() => setFiltrosAbertos(false)}>
          <div className="flex flex-col gap-4">
            {selecoesDeFiltro}
            <div className="mt-2 flex gap-2">
              <Botao variante="secundario" className="px-3" onClick={limparFiltrosDaFolha}>
                Limpar filtros
              </Botao>
              <Botao className="flex-1 px-3" onClick={() => setFiltrosAbertos(false)}>
                {rotuloDeMostrar}
              </Botao>
            </div>
          </div>
        </FolhaLateral>
      )}

      {consulta.isPending && <p className="text-base text-texto-2">Carregando…</p>}
      {consulta.isError && <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />}
      {consulta.data && (
        <Tabela
          colunas={colunas}
          itens={consulta.data.itens}
          chaveItem={(d) => d.id}
          pagina={pagina}
          porPagina={POR_PAGINA}
          total={total}
          cartao={cartao}
          aoMudarPagina={(nova) => mudar({ pagina: nova === 1 ? '' : String(nova) })}
          vazio={
            comFiltro ? (
              <EstadoVazio
                titulo="Nenhum desbravador encontrado"
                descricao="Os filtros escolhidos escondem todos os cadastros. Limpe os filtros para ver a lista inteira."
                acao={
                  <Botao variante="secundario" onClick={limparFiltros}>
                    Limpar filtros
                  </Botao>
                }
              />
            ) : (
              <EstadoVazio titulo="Nenhum desbravador encontrado" descricao="Cadastre o primeiro desbravador pelo botão “Novo desbravador”." />
            )
          }
        />
      )}

    </div>
  )
}
