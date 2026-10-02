import { TipoPessoa } from '@desbravadores/shared'
import { FileSpreadsheet, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { POR_PAGINA, useDesbravadores } from '../../../api/desbravadores'
import type { Desbravador, SituacaoDesbravador, TipoDesbravador } from '../../../api/desbravadores'
import { useClasses, useUnidades } from '../../../api/leitura'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { LinkDeFicha } from '../../../ui/LinkDeFicha'
import { Selecao } from '../../../ui/Selecao'
import { Tabela } from '../../../ui/Tabela'
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

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-texto">Desbravadores</h1>
          {consulta.data && <p className="text-base text-texto-2">{total === 1 ? '1 cadastrado' : `${total} cadastrados`}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" onClick={() => void navegar('/adm/desbravadores/importar')}>
            <FileSpreadsheet aria-hidden className="size-5" />
            Importar planilha
          </Botao>
          <Link to="/adm/desbravadores/novo" state={estadoDeVolta} className={estiloDoBotao()}>
            <Plus aria-hidden className="size-5" />
            Novo desbravador
          </Link>
        </div>
      </header>

      {importados !== null && (
        <p role="status" className="text-base font-semibold text-sucesso">
          {importados === 1 ? '1 desbravador importado.' : `${importados} desbravadores importados.`}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Campo rotulo="Buscar por nome" type="search" value={busca} onChange={(e) => filtrar('busca')(e.target.value)} />
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
      </div>

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
