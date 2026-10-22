import { textoDeDisponibilidade, textoDeSituacao } from '@desbravadores/shared'
import type { ExemplarSaida } from '@desbravadores/shared'
import { ChevronLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDetalheDoLivro } from '../../api/emprestimos'
import type { DetalheDoLivro as Detalhe } from '../../api/emprestimos'
import { useSessao } from '../../sessao/useSessao'
import { Botao, estiloDoBotao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { ehNaoEncontrado } from '../../ui/EstadoNaoEncontrado'
import { Selo } from '../../ui/Selo'
import type { TomDoSelo } from '../../ui/Selo'
import { ErroDaApi } from '../../api/cliente'
import { dataCurta } from '../aulas/datas'
import { CapaDoItem } from './CartaoDoItem'
import { DialogoDevolver } from './DialogoDevolver'
import type { EmprestimoParaDevolver } from './DialogoDevolver'
import { DialogoEmprestar } from './DialogoEmprestar'
import { DialogoAcrescentarExemplares, DialogoDarBaixa } from './DialogosDeExemplar'
import { nomeComSituacao, unidadeOuSem } from './hoje'

type Emprestimo = NonNullable<ExemplarSaida['emprestimo']>

const AJUDA_DE_QUEM_JA_LEU = 'Aparece quem já devolveu o livro. Devolver não prova que leu.'

function SituacaoDoExemplar({ exemplar }: { exemplar: ExemplarSaida }) {
  const emprestimo = exemplar.emprestimo
  if (!emprestimo) return <Selo>Disponível</Selo>
  const tom: TomDoSelo = emprestimo.situacao === 'ATRASADO' ? 'perigo' : emprestimo.situacao === 'VENCE_HOJE' ? 'alerta' : 'neutro'
  const texto = emprestimo.situacao === 'NO_PRAZO' ? `Emprestado até ${dataCurta(emprestimo.devolverAte)}` : textoDeSituacao(emprestimo.situacao, emprestimo.dias)
  return <Selo tom={tom}>{texto}</Selo>
}

function QuemTemOExemplar({ emprestimo }: { emprestimo: Emprestimo }) {
  return (
    <p className="text-sm text-texto-2">
      {'Com '}
      <b className="text-texto">{nomeComSituacao(emprestimo.desbravadorNome, emprestimo.desbravadorAtivo)}</b>
      {` · ${unidadeOuSem(emprestimo.unidade)}`}
      <br />
      {`Emprestado em ${dataCurta(emprestimo.emprestadoEm)} · devolver até ${dataCurta(emprestimo.devolverAte)}`}
    </p>
  )
}

interface AcoesDoExemplar {
  aoEmprestar: (exemplar: ExemplarSaida) => void
  aoDevolver: (exemplar: ExemplarSaida, emprestimo: Emprestimo) => void
  /** Só quem gerencia a estante pode dar baixa. */
  aoDarBaixa?: (exemplar: ExemplarSaida) => void
}

function LinhaDoExemplar({ exemplar, acoes }: { exemplar: ExemplarSaida; acoes: AcoesDoExemplar }) {
  const emprestimo = exemplar.emprestimo
  return (
    <li className="flex flex-col gap-2 border-t border-divisor px-4 py-3 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <b className="text-base text-texto">{`Exemplar ${exemplar.numero}`}</b>
        <SituacaoDoExemplar exemplar={exemplar} />
      </div>
      {emprestimo && <QuemTemOExemplar emprestimo={emprestimo} />}
      <div className="flex flex-wrap gap-2">
        {emprestimo ? (
          <Botao variante="secundario" aria-label={`Devolver o exemplar ${exemplar.numero}`} onClick={() => acoes.aoDevolver(exemplar, emprestimo)}>
            Devolver
          </Botao>
        ) : (
          <>
            <Botao aria-label={`Emprestar o exemplar ${exemplar.numero}`} onClick={() => acoes.aoEmprestar(exemplar)}>
              Emprestar
            </Botao>
            {acoes.aoDarBaixa && (
              <Botao variante="texto" aria-label={`Dar baixa no exemplar ${exemplar.numero}`} onClick={() => acoes.aoDarBaixa?.(exemplar)}>
                Dar baixa
              </Botao>
            )}
          </>
        )}
      </div>
    </li>
  )
}

function QuemJaLeu({ devolucoes }: { devolucoes: Detalhe['jaDevolveram'] }) {
  return (
    <section aria-labelledby="quem-ja-leu" className="flex flex-col gap-2">
      <h2 id="quem-ja-leu" className="font-titulo text-lg font-bold text-texto">
        Quem já leu
      </h2>
      <p className="text-sm text-texto-2">{AJUDA_DE_QUEM_JA_LEU}</p>
      {devolucoes.length === 0 ? (
        <p className="text-base text-texto-2">Ninguém devolveu este livro ainda.</p>
      ) : (
        <ul className="flex flex-col rounded-cartao border border-borda-controle bg-superficie">
          {devolucoes.map((devolucao) => (
            <li key={devolucao.desbravadorId} className="flex min-h-[52px] flex-col justify-center border-t border-divisor px-4 py-2 first:border-t-0">
              <b className="text-base text-texto">{devolucao.desbravadorNome}</b>
              <span className="text-sm text-texto-2">{`${unidadeOuSem(devolucao.unidade)} · devolveu em ${dataCurta(devolucao.devolvidoEm)}`}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type DialogoAberto =
  | { tipo: 'emprestar'; exemplar: ExemplarSaida }
  | { tipo: 'devolver'; devolucao: EmprestimoParaDevolver }
  | { tipo: 'baixa'; exemplar: ExemplarSaida }
  | { tipo: 'acrescentar' }

function Exemplares({ detalhe, gerencia }: { detalhe: Detalhe; gerencia: boolean }) {
  const [dialogo, definirDialogo] = useState<DialogoAberto | null>(null)
  const { item } = detalhe
  const ativos = detalhe.exemplares.filter((exemplar) => exemplar.situacao !== 'BAIXADO')
  const fechar = () => definirDialogo(null)
  const acoes: AcoesDoExemplar = {
    aoEmprestar: (exemplar) => definirDialogo({ tipo: 'emprestar', exemplar }),
    aoDevolver: (exemplar, emprestimo) =>
      definirDialogo({
        tipo: 'devolver',
        devolucao: {
          emprestimoId: emprestimo.id,
          titulo: item.nome,
          numeroDoExemplar: exemplar.numero,
          desbravadorNome: emprestimo.desbravadorNome,
          desbravadorAtivo: emprestimo.desbravadorAtivo,
          unidade: emprestimo.unidade,
          devolverAte: emprestimo.devolverAte,
        },
      }),
    aoDarBaixa: gerencia ? (exemplar) => definirDialogo({ tipo: 'baixa', exemplar }) : undefined,
  }

  return (
    <>
      <div className="flex items-start gap-4">
        <CapaDoItem nome={item.nome} capaUrl={item.capaUrl} className="w-28 shrink-0" />
        <div className="flex min-w-0 flex-col gap-2">
          {item.descricao && <p className="text-base text-texto-2">{item.descricao}</p>}
          <Selo tom={item.disponiveis > 0 ? 'neutro' : 'alerta'} className="self-start">
            {textoDeDisponibilidade(item.total, item.disponiveis)}
          </Selo>
          {gerencia && (
            <Botao variante="secundario" className="self-start" onClick={() => definirDialogo({ tipo: 'acrescentar' })}>
              <Plus aria-hidden className="size-5" />
              Acrescentar exemplares
            </Botao>
          )}
        </div>
      </div>
      {ativos.length === 0 ? (
        <EstadoVazio titulo="Nenhum exemplar para emprestar" descricao={gerencia ? 'Use “Acrescentar exemplares” para voltar a emprestar este livro.' : 'O Adm ainda não acrescentou exemplares.'} />
      ) : (
        <Cartao className="overflow-hidden p-0">
          <ul>
            {ativos.map((exemplar) => (
              <LinhaDoExemplar key={exemplar.id} exemplar={exemplar} acoes={acoes} />
            ))}
          </ul>
        </Cartao>
      )}
      <QuemJaLeu devolucoes={detalhe.jaDevolveram} />
      <DialogoEmprestar aberto={dialogo?.tipo === 'emprestar'} item={item} exemplar={dialogo?.tipo === 'emprestar' ? dialogo.exemplar : undefined} onFechar={fechar} />
      <DialogoDevolver aberto={dialogo?.tipo === 'devolver'} emprestimo={dialogo?.tipo === 'devolver' ? dialogo.devolucao : null} onFechar={fechar} />
      {dialogo?.tipo === 'baixa' && <DialogoDarBaixa itemId={item.id} titulo={item.nome} exemplar={dialogo.exemplar} aoFechar={fechar} />}
      {dialogo?.tipo === 'acrescentar' && <DialogoAcrescentarExemplares itemId={item.id} aoFechar={fechar} />}
    </>
  )
}

export function DetalheDoLivro() {
  const { id } = useParams()
  const { pode } = useSessao()
  const gerencia = pode('biblioteca.gerenciar')
  const podeEmprestar = pode('biblioteca.emprestar')
  const consulta = useDetalheDoLivro(id, podeEmprestar)
  const estante = gerencia ? '/adm/biblioteca?aba=fisicos' : '/biblioteca?aba=fisicos'
  const voltar = (
    <Link to={estante} className={estiloDoBotao({ variante: 'secundario' })}>
      Ir para a estante
    </Link>
  )

  const corpo = (() => {
    if (!podeEmprestar) return <EstadoVazio titulo="Você não pode ver os exemplares" descricao="Seu vínculo não tem a permissão de emprestar livros." acao={voltar} />
    if (consulta.data) return <Exemplares detalhe={consulta.data} gerencia={gerencia} />
    if (consulta.isError) {
      if (ehNaoEncontrado(consulta.error)) return <EstadoVazio titulo="Livro não encontrado." descricao="Ele pode ter sido removido da estante." acao={voltar} />
      if (consulta.error instanceof ErroDaApi && consulta.error.status === 403) {
        return <EstadoVazio titulo="Você não pode ver os exemplares" descricao="Seu vínculo não tem a permissão de emprestar livros." acao={voltar} />
      }
      return <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
    }
    if (consulta.fetchStatus === 'paused') return <DisponivelComInternet />
    return <Carregando rotulo="Carregando o livro" />
  })()

  return (
    <div className={gerencia ? 'flex flex-col gap-6' : 'flex flex-col gap-6 p-4'}>
      <header className="flex items-center gap-2">
        <Link to={estante} aria-label="Voltar para a estante" className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-marca">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <h1 className="font-titulo text-2xl font-extrabold text-texto">{consulta.data?.item.nome ?? 'Livro físico'}</h1>
      </header>
      {corpo}
    </div>
  )
}
