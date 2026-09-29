import { Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { POR_PAGINA, useDesbravadores, useReativarDesbravador } from '../../../api/desbravadores'
import type { Aviso, Desbravador, SituacaoDesbravador } from '../../../api/desbravadores'
import { useClasses, useUnidades } from '../../../api/leitura'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { Selecao } from '../../../ui/Selecao'
import { Tabela } from '../../../ui/Tabela'
import type { ColunaTabela } from '../../../ui/Tabela'
import { ChipClasse } from './ChipClasse'
import { MENSAGEM_GENERICA, lerErroDaApi } from './erros'
import { FormularioDesbravador } from './FormularioDesbravador'
import { FormularioInativar } from './FormularioInativar'

type Painel = { tipo: 'novo' } | { tipo: 'editar' | 'inativar'; desbravador: Desbravador } | null

const SEM_UNIDADE = 'sem'

export function ListaDesbravadores() {
  const [busca, setBusca] = useState('')
  const [unidade, setUnidade] = useState('')
  const [classeId, setClasseId] = useState('')
  const [situacao, setSituacao] = useState<SituacaoDesbravador>('true')
  const [pagina, setPagina] = useState(1)
  const [painel, setPainel] = useState<Painel>(null)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [erroAcao, setErroAcao] = useState<string | null>(null)

  const unidades = useUnidades({ todas: true })
  const classes = useClasses({ tipo: 'REGULAR' })
  const reativar = useReativarDesbravador()
  const consulta = useDesbravadores({
    busca: busca.trim() || undefined,
    unidadeId: unidade && unidade !== SEM_UNIDADE ? unidade : undefined,
    semUnidade: unidade === SEM_UNIDADE || undefined,
    classeId: classeId || undefined,
    ativo: situacao,
    pagina,
  })

  const filtrar = <T,>(definir: (valor: T) => void) => (valor: T) => {
    definir(valor)
    setPagina(1)
  }

  const fecharPainel = useCallback(() => setPainel(null), [])

  async function reativarDesbravador(desbravador: Desbravador) {
    setErroAcao(null)
    try {
      await reativar.mutateAsync(desbravador.id)
    } catch (falha) {
      setErroAcao(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  const colunas: ColunaTabela<Desbravador>[] = [
    { chave: 'nome', titulo: 'Nome', celula: (d) => <span className="font-semibold">{d.nome}</span> },
    { chave: 'idade', titulo: 'Idade', celula: (d) => d.idade },
    { chave: 'unidade', titulo: 'Unidade', celula: (d) => (d.tipo === 'LIDER' ? '—' : (d.unidade?.nome ?? 'Sem unidade')) },
    { chave: 'classe', titulo: 'Classe', celula: (d) => (d.classeAtual ? <ChipClasse classe={d.classeAtual} /> : '—') },
    { chave: 'tipo', titulo: 'Tipo', celula: (d) => (d.tipo === 'LIDER' ? 'Líder' : 'Desbravador') },
    {
      chave: 'acoes',
      titulo: 'Ações',
      celula: (d) => (
        <div className="flex gap-1">
          <Botao variante="texto" aria-label={`Editar ${d.nome}`} onClick={() => setPainel({ tipo: 'editar', desbravador: d })}>
            Editar
          </Botao>
          {d.ativo ? (
            <Botao variante="texto" aria-label={`Inativar ${d.nome}`} onClick={() => setPainel({ tipo: 'inativar', desbravador: d })}>
              Inativar
            </Botao>
          ) : (
            <Botao variante="texto" aria-label={`Reativar ${d.nome}`} onClick={() => void reativarDesbravador(d)}>
              Reativar
            </Botao>
          )}
        </div>
      ),
    },
  ]

  const total = consulta.data?.total ?? 0
  const tituloDoPainel =
    painel?.tipo === 'novo' ? 'Novo desbravador' : painel ? `${painel.tipo === 'editar' ? 'Editar' : 'Inativar'} ${painel.desbravador.nome}` : ''

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-texto">Desbravadores</h1>
          {consulta.data && <p className="text-base text-texto-2">{total === 1 ? '1 cadastrado' : `${total} cadastrados`}</p>}
        </div>
        <Botao onClick={() => setPainel({ tipo: 'novo' })}>
          <Plus aria-hidden className="size-5" />
          Novo desbravador
        </Botao>
      </header>

      {avisos.length > 0 && (
        <div className="flex flex-col gap-2">
          {avisos.map((aviso) => (
            <FaixaAviso key={`${aviso.codigo}-${aviso.mensagem}`}>{aviso.mensagem}</FaixaAviso>
          ))}
          <Botao variante="texto" className="self-start" onClick={() => setAvisos([])}>
            Dispensar avisos
          </Botao>
        </div>
      )}
      {erroAcao && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroAcao}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Buscar por nome" type="search" value={busca} onChange={(e) => filtrar(setBusca)(e.target.value)} />
        <Selecao rotulo="Unidade" value={unidade} onChange={(e) => filtrar(setUnidade)(e.target.value)}>
          <option value="">Todas as unidades</option>
          <option value={SEM_UNIDADE}>Sem unidade</option>
          {unidades.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo="Classe" value={classeId} onChange={(e) => filtrar(setClasseId)(e.target.value)}>
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
          onChange={(e) => filtrar(setSituacao)(e.target.value === 'false' ? 'false' : e.target.value === 'todos' ? 'todos' : 'true')}
        >
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
          <option value="todos">Todos</option>
        </Selecao>
      </div>

      {consulta.isPending && <p className="text-base text-texto-2">Carregando…</p>}
      {consulta.isError && (
        <p role="alert" className="text-base font-medium text-perigo">
          Não foi possível carregar os desbravadores. Tente de novo.
        </p>
      )}
      {consulta.data && (
        <Tabela
          colunas={colunas}
          itens={consulta.data.itens}
          chaveItem={(d) => d.id}
          pagina={pagina}
          porPagina={POR_PAGINA}
          total={total}
          aoMudarPagina={setPagina}
          vazio={<EstadoVazio titulo="Nenhum desbravador encontrado" descricao="Mude os filtros ou cadastre um novo desbravador." />}
        />
      )}

      <FolhaLateral aberta={painel !== null} titulo={tituloDoPainel} aoFechar={fecharPainel}>
        {(painel?.tipo === 'novo' || painel?.tipo === 'editar') && (
          <FormularioDesbravador
            key={painel.tipo === 'editar' ? painel.desbravador.id : 'novo'}
            desbravador={painel.tipo === 'editar' ? painel.desbravador : undefined}
            aoConcluir={(novosAvisos) => {
              setAvisos(novosAvisos)
              fecharPainel()
            }}
            aoCancelar={fecharPainel}
          />
        )}
        {painel?.tipo === 'inativar' && (
          <FormularioInativar desbravador={painel.desbravador} aoConcluir={fecharPainel} aoCancelar={fecharPainel} />
        )}
      </FolhaLateral>
    </div>
  )
}
