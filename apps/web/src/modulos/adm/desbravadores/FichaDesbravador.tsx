import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { hojeDoClube, useInativarDesbravador, useReativarDesbravador } from '../../../api/desbravadores'
import type { Desbravador } from '../../../api/desbravadores'
import { usePerfilDbv } from '../../../api/perfil'
import type { PerfilDbv } from '../../../api/perfil'
import { useProgressoDbv } from '../../../api/progresso'
import { useConexao } from '../../../offline'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Campo } from '../../../ui/Campo'
import { Cartao } from '../../../ui/Cartao'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { ListaDePares } from '../../../ui/ListaDePares'
import type { Par } from '../../../ui/ListaDePares'
import { SecaoProgresso } from '../../perfil/SecaoProgresso'
import { dataCivilBr } from '../formatos'
import { useAvisosDaFicha, useVoltar } from '../navegacao'
import { AcessoAoApp } from './AcessoAoApp'
import { ChipClasse } from './ChipClasse'
import { MENSAGEM_GENERICA, lerErroDaApi } from './erros'
import { NOME_DO_TIPO } from './ListaDesbravadores'

const TRACO = '—'
const LISTA = '/adm/desbravadores'

const NOME_DO_SEXO: Record<Desbravador['sexo'], string> = { F: 'Feminino', M: 'Masculino' }

function usoDeImagem(dbv: Desbravador): string {
  if (!dbv.autorizacaoImagem) return 'Não autorizado'
  return dbv.autorizacaoImagemEm ? `Autorizado em ${dataCivilBr(dbv.autorizacaoImagemEm)}` : 'Autorizado'
}

function paresDoCadastro(dbv: Desbravador): Par[] {
  return [
    { rotulo: 'Nome público', valor: dbv.nomePublico },
    { rotulo: 'Tipo', valor: NOME_DO_TIPO[dbv.tipo] },
    { rotulo: 'Nascimento', valor: dataCivilBr(dbv.nascimento) },
    { rotulo: 'Sexo', valor: NOME_DO_SEXO[dbv.sexo] },
    { rotulo: 'Entrada no clube', valor: dataCivilBr(dbv.entradaEm) },
    ...(dbv.saidaEm ? [{ rotulo: 'Saída do clube', valor: dataCivilBr(dbv.saidaEm) }] : []),
    { rotulo: 'Unidade', valor: dbv.tipo === 'DBV' ? (dbv.unidade?.nome ?? 'Sem unidade') : TRACO },
    { rotulo: 'Classe do ano', valor: dbv.classeAtual ? <ChipClasse classe={dbv.classeAtual} /> : TRACO },
    { rotulo: 'Avançada', valor: dbv.avancadaAtual?.nome ?? TRACO },
    ...(dbv.instrui.length > 0 ? [{ rotulo: 'Instrui', valor: dbv.instrui.map((classe) => classe.nome).join(', ') }] : []),
    ...(dbv.aconselha.length > 0 ? [{ rotulo: 'Aconselha', valor: dbv.aconselha.map((unidade) => unidade.nome).join(', ') }] : []),
  ]
}

function Numero({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <Cartao className="flex flex-col gap-1">
      <span className="font-titulo text-2xl font-extrabold text-texto">{valor}</span>
      <span className="text-sm text-texto-2">{rotulo}</span>
    </Cartao>
  )
}

function NumerosDoMes({ perfil }: { perfil: PerfilDbv }) {
  const progresso = useProgressoDbv(perfil.dbv.id)
  const regular = progresso.data?.matriculas.find((matricula) => matricula.classe.tipo === 'REGULAR')
  const doProgresso = !progresso.data
    ? { valor: TRACO, rotulo: 'Progresso da classe' }
    : regular
      ? { valor: `${regular.percentual}%`, rotulo: `Progresso em ${regular.classe.nome}` }
      : { valor: TRACO, rotulo: 'Sem classe neste ano' }
  return (
    <section aria-label="Números do mês" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Numero valor={doProgresso.valor} rotulo={doProgresso.rotulo} />
      <Numero
        valor={`${perfil.pontosMes} pts`}
        rotulo={perfil.posicaoMes === null ? 'Fora do ranking do mês' : `${perfil.posicaoMes}º no ranking do mês`}
      />
      <Numero valor={perfil.frequenciaMes === null ? TRACO : `${perfil.frequenciaMes}%`} rotulo="Frequência no mês" />
    </section>
  )
}

function BlocoComTitulo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const idTitulo = useId()
  return (
    <section aria-labelledby={idTitulo}>
      <Cartao className="flex flex-col gap-4">
        <h2 id={idTitulo} className="font-titulo text-lg font-bold text-texto">
          {titulo}
        </h2>
        {children}
      </Cartao>
    </section>
  )
}

function Rodape({ dbv, aoErro }: { dbv: Desbravador; aoErro: (mensagem: string | null) => void }) {
  const inativar = useInativarDesbravador()
  const reativar = useReativarDesbravador()
  const [confirmando, setConfirmando] = useState(false)
  const [saidaEm, setSaidaEm] = useState(hojeDoClube())

  async function executar(acao: () => Promise<unknown>) {
    aoErro(null)
    setConfirmando(false)
    try {
      await acao()
    } catch (falha) {
      aoErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  return (
    <div className="flex flex-wrap gap-2 border-t border-divisor pt-5">
      <Botao variante="secundario" carregando={inativar.isPending || reativar.isPending} onClick={() => setConfirmando(true)}>
        {dbv.ativo ? 'Inativar desbravador' : 'Reativar desbravador'}
      </Botao>
      {dbv.ativo ? (
        <Confirmacao
          aberta={confirmando}
          titulo={`Inativar ${dbv.nome}?`}
          rotuloConfirmar="Inativar"
          perigo
          aoConfirmar={() => void executar(() => inativar.mutateAsync({ id: dbv.id, saidaEm }))}
          aoCancelar={() => setConfirmando(false)}
        >
          <div className="flex flex-col gap-4">
            <p>{`${dbv.nome} sai do clube na data escolhida: deixa a unidade e as classes em curso ficam como desistência. O histórico permanece.`}</p>
            <Campo rotulo="Data de saída" type="date" value={saidaEm} onChange={(e) => setSaidaEm(e.target.value)} />
          </div>
        </Confirmacao>
      ) : (
        <Confirmacao
          aberta={confirmando}
          titulo={`Reativar ${dbv.nome}?`}
          rotuloConfirmar="Reativar"
          aoConfirmar={() => void executar(() => reativar.mutateAsync(dbv.id))}
          aoCancelar={() => setConfirmando(false)}
        >
          Volta para a lista de ativos. Unidade e classe se escolhem na edição.
        </Confirmacao>
      )}
    </div>
  )
}

function Conteudo({ perfil }: { perfil: PerfilDbv }) {
  const { dbv } = perfil
  const idCadastro = useId()
  const voltar = useVoltar({ para: LISTA, rotulo: 'Desbravadores' })
  const { avisos, dispensar } = useAvisosDaFicha()
  const [erroDaAcao, setErroDaAcao] = useState<string | null>(null)
  const contato = dbv.contato

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDaPagina
        voltar={voltar}
        sobretitulo={`${NOME_DO_TIPO[dbv.tipo]} · ${dbv.ativo ? 'Ativo' : 'Inativo'}`}
        titulo={dbv.nome}
        apoio={
          <>
            {dbv.tipo === 'DBV' ? `${dbv.idade} anos · ${dbv.unidade?.nome ?? 'Sem unidade'}` : `${dbv.idade} anos`}
            {dbv.classeAtual && <ChipClasse classe={dbv.classeAtual} />}
          </>
        }
        acoes={
          <Link to={`${LISTA}/${dbv.id}/editar`} state={{ voltarPara: voltar.para, voltarRotulo: voltar.rotulo }} className={estiloDoBotao()}>
            Editar
          </Link>
        }
      />

      {avisos.length > 0 && (
        <div className="flex flex-col gap-2">
          {avisos.map((aviso) => (
            <FaixaAviso key={aviso}>{aviso}</FaixaAviso>
          ))}
          <Botao variante="texto" className="self-start" onClick={dispensar}>
            Dispensar avisos
          </Botao>
        </div>
      )}

      <section aria-labelledby={idCadastro}>
        <Cartao className="flex flex-col gap-4">
          <h2 id={idCadastro} className="font-titulo text-lg font-bold text-texto">
            Cadastro
          </h2>
          <ListaDePares colunas={3} pares={paresDoCadastro(dbv)} />
          <AcessoAoApp dbvId={dbv.id} nome={dbv.nome} sexo={dbv.sexo} podeConvidar={dbv.ativo} />
        </Cartao>
      </section>

      {dbv.tipo === 'DBV' && dbv.ativo && <NumerosDoMes perfil={perfil} />}
      <SecaoProgresso dbvId={dbv.id} />

      {contato !== undefined && (
        <BlocoComTitulo titulo="Responsável">
          <ListaDePares
            pares={[
              { rotulo: 'Nome', valor: contato.responsavelNome ?? TRACO },
              { rotulo: 'Telefone', valor: contato.responsavelTelefone ?? TRACO },
              { rotulo: 'E-mail', valor: contato.responsavelEmail ?? TRACO },
              { rotulo: 'Uso de imagem', valor: usoDeImagem(dbv) },
            ]}
          />
        </BlocoComTitulo>
      )}

      {erroDaAcao && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroDaAcao}
        </p>
      )}
      <Rodape dbv={dbv} aoErro={setErroDaAcao} />
    </div>
  )
}

export function FichaDesbravador() {
  const { id = '' } = useParams()
  const consulta = usePerfilDbv(id)
  const { modo } = useConexao()

  let corpo: ReactNode
  if (consulta.data) corpo = <Conteudo perfil={consulta.data} />
  else if (consulta.isError && ehNaoEncontrado(consulta.error))
    corpo = <EstadoNaoEncontrado registro="este desbravador" lista={{ para: LISTA, rotulo: 'Ver a lista de desbravadores' }} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else
    corpo = (
      <Carregando rotulo="Carregando a ficha">
        <Esqueleto className="h-20" />
        <Esqueleto className="h-32" />
      </Carregando>
    )

  return <div className="flex flex-col gap-4 py-4">{corpo}</div>
}
