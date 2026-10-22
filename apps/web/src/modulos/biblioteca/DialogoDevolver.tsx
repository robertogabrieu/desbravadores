import { situacaoDoEmprestimo, textoDeDias } from '@desbravadores/shared'
import type { FunctionComponent } from 'react'
import { useDevolver } from '../../api/emprestimos'
import { useConexao } from '../../offline'
import { Confirmacao } from '../../ui/Confirmacao'
import { isoParaTexto } from '../../ui/mascaraData'
import { dataCurta } from '../aulas/datas'
import { mensagemDe } from './DialogosDaBiblioteca'
import { hojeDaTela, nomeComSituacao, unidadeOuSem } from './hoje'

/** O que o diálogo precisa saber do empréstimo; a aba e o detalhe do livro montam isto de suas próprias linhas. */
export interface EmprestimoParaDevolver {
  emprestimoId: string
  titulo: string
  numeroDoExemplar: number
  desbravadorNome: string
  desbravadorAtivo: boolean
  unidade: string | null
  devolverAte: string
}

interface Propriedades {
  aberto: boolean
  /** O empréstimo a devolver; nulo com o diálogo fechado. */
  emprestimo: EmprestimoParaDevolver | null
  onFechar: () => void
}

const SEM_INTERNET = 'Registrar a devolução precisa de internet. Conecte-se para continuar.'

function Conteudo({ emprestimo, onFechar }: { emprestimo: EmprestimoParaDevolver; onFechar: () => void }) {
  const devolver = useDevolver()
  const { modo } = useConexao()
  const hoje = hojeDaTela()
  const atraso = situacaoDoEmprestimo(emprestimo.devolverAte, hoje)
  const semInternet = modo !== 'ONLINE'

  return (
    <Confirmacao
      aberta
      titulo="Registrar devolução"
      rotuloConfirmar="Registrar devolução"
      ocupada={devolver.isPending}
      confirmarDesabilitado={semInternet}
      erro={semInternet ? SEM_INTERNET : devolver.isError ? mensagemDe(devolver.error) : null}
      aoConfirmar={() => devolver.mutate(emprestimo.emprestimoId, { onSuccess: onFechar })}
      aoCancelar={onFechar}
    >
      <div className="flex flex-col gap-4">
        <p className="text-base text-texto">
          {`“${emprestimo.titulo}”, exemplar ${emprestimo.numeroDoExemplar}, volta de `}
          <b>{nomeComSituacao(emprestimo.desbravadorNome, emprestimo.desbravadorAtivo)}</b>
          {` (${unidadeOuSem(emprestimo.unidade)}).`}
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-texto">Devolvido em</span>
          <p className="min-h-[var(--touch-min)] rounded-controle border border-borda-controle bg-superficie-suave px-3.5 py-2.5 text-base text-texto">{isoParaTexto(hoje)}</p>
        </div>
        {atraso.situacao === 'ATRASADO' && (
          <p className="rounded-controle bg-alerta-fundo px-3 py-2.5 text-sm font-semibold text-alerta">
            {`Devolução prevista para ${dataCurta(emprestimo.devolverAte)}: ${textoDeDias(atraso.dias)} de atraso.`}
          </p>
        )}
      </div>
    </Confirmacao>
  )
}

/** Confirma a devolução. "Devolvido em" é só leitura: o servidor grava o "hoje" dele. Sem internet fica desligado. */
export const DialogoDevolver: FunctionComponent<Propriedades> = ({ aberto, emprestimo, onFechar }) =>
  aberto && emprestimo ? <Conteudo emprestimo={emprestimo} onFechar={onFechar} /> : null
