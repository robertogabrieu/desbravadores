import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { hojeDoClube, useInativarDesbravador, useReativarDesbravador } from '../../../api/desbravadores'
import type { Desbravador } from '../../../api/desbravadores'
import { usePerfilDbv } from '../../../api/perfil'
import type { PerfilDbv } from '../../../api/perfil'
import { useProgressoDbv } from '../../../api/progresso'
import { useLarguraMenorQue } from '../../../layouts/useLarguraMenorQue'
import { useConexao } from '../../../offline'
import { Abas } from '../../../ui/Abas'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Campo } from '../../../ui/Campo'
import { Cartao } from '../../../ui/Cartao'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { LARGURA_DO_CELULAR } from '../../../ui/larguraDoCelular'
import { ListaDePares } from '../../../ui/ListaDePares'
import type { Par } from '../../../ui/ListaDePares'
import { cn } from '../../../ui/cn'
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

function Numero({ valor, rotulo, compacto }: { valor: string; rotulo: string; compacto: boolean }) {
  return (
    <Cartao className={cn('flex flex-col', compacto ? 'gap-0.5 p-3 text-center' : 'gap-1')}>
      <span className={cn('font-titulo font-extrabold text-texto', compacto ? 'text-xl' : 'text-2xl')}>{valor}</span>
      <span className="text-sm text-texto-2">{rotulo}</span>
    </Cartao>
  )
}

/** No celular os três números ficam lado a lado, com rótulos curtos. */
function NumerosDoMes({ perfil, compactos }: { perfil: PerfilDbv; compactos: boolean }) {
  const progresso = useProgressoDbv(perfil.dbv.id)
  const regular = progresso.data?.matriculas.find((matricula) => matricula.classe.tipo === 'REGULAR')
  const doProgresso = !progresso.data
    ? { valor: TRACO, rotulo: compactos ? 'da classe' : 'Progresso da classe' }
    : regular
      ? { valor: `${regular.percentual}%`, rotulo: compactos ? 'da classe' : `Progresso em ${regular.classe.nome}` }
      : { valor: TRACO, rotulo: compactos ? 'sem classe' : 'Sem classe neste ano' }
  const foraDoRanking = compactos ? 'fora do ranking' : 'Fora do ranking do mês'
  const doRanking = perfil.posicaoMes === null ? foraDoRanking : `${perfil.posicaoMes}º ${compactos ? 'no mês' : 'no ranking do mês'}`
  return (
    <section aria-label="Números do mês" className={cn('grid gap-3', compactos ? 'grid-cols-3 gap-2' : 'grid-cols-1 sm:grid-cols-3')}>
      <Numero valor={doProgresso.valor} rotulo={doProgresso.rotulo} compacto={compactos} />
      <Numero valor={`${perfil.pontosMes} pts`} rotulo={doRanking} compacto={compactos} />
      <Numero
        valor={perfil.frequenciaMes === null ? TRACO : `${perfil.frequenciaMes}%`}
        rotulo={compactos ? 'frequência' : 'Frequência no mês'}
        compacto={compactos}
      />
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

function CartaoCadastro({ dbv, children }: { dbv: Desbravador; children?: ReactNode }) {
  const idCadastro = useId()
  return (
    <section aria-labelledby={idCadastro}>
      <Cartao className="flex flex-col gap-4">
        <h2 id={idCadastro} className="font-titulo text-lg font-bold text-texto">
          Cadastro
        </h2>
        <ListaDePares colunas={3} pares={paresDoCadastro(dbv)} />
        <AcessoAoApp dbvId={dbv.id} nome={dbv.nome} sexo={dbv.sexo} podeConvidar={dbv.ativo} />
        {children}
      </Cartao>
    </section>
  )
}

function CartaoResponsavel({ dbv, contato }: { dbv: Desbravador; contato: NonNullable<Desbravador['contato']> }) {
  return (
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
  )
}

function ErroDaAcao({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null
  return (
    <p role="alert" className="text-sm font-medium text-perigo">
      {mensagem}
    </p>
  )
}

type Parte = 'progresso' | 'cadastro' | 'responsavel'

const NOME_DA_PARTE: Record<Parte, string> = { progresso: 'Progresso', cadastro: 'Cadastro', responsavel: 'Responsável' }

/**
 * Parte da ficha aberta no celular, guardada em `?parte=` para o voltar do aparelho trocar de parte.
 * Sem parte válida no endereço, abre Progresso para o DBV ativo e Cadastro para os demais (como os números do mês).
 */
function useParteDaFicha(dbv: Desbravador): { partes: Parte[]; ativa: Parte; mudar: (parte: string) => void } {
  const [parametros] = useSearchParams()
  const local = useLocation()
  const navegar = useNavigate()
  const partes: Parte[] = dbv.contato === undefined ? ['progresso', 'cadastro'] : ['progresso', 'cadastro', 'responsavel']
  const pedida = partes.find((parte) => parte === parametros.get('parte'))
  const ativa = pedida ?? (dbv.tipo === 'DBV' && dbv.ativo ? 'progresso' : 'cadastro')
  // O estado do histórico leva o destino do Voltar (filtros da lista): trocar de parte não pode perdê-lo.
  const estadoDoHistorico: unknown = local.state
  const mudar = (parte: string) => void navegar({ search: `?parte=${parte}` }, { state: estadoDoHistorico })
  return { partes, ativa, mudar }
}

function PartesNoCelular({ dbv, rodape }: { dbv: Desbravador; rodape: ReactNode }) {
  const { partes, ativa, mudar } = useParteDaFicha(dbv)
  return (
    <>
      <Abas rotulo="Partes da ficha" abas={partes.map((parte) => ({ id: parte, rotulo: NOME_DA_PARTE[parte] }))} ativa={ativa} aoMudar={mudar} />
      <div role="tabpanel" aria-labelledby={`aba-${ativa}`} className="flex flex-col gap-5">
        {ativa === 'progresso' && <SecaoProgresso dbvId={dbv.id} compacta />}
        {ativa === 'cadastro' && <CartaoCadastro dbv={dbv}>{rodape}</CartaoCadastro>}
        {ativa === 'responsavel' && dbv.contato !== undefined && <CartaoResponsavel dbv={dbv} contato={dbv.contato} />}
      </div>
    </>
  )
}

function Conteudo({ perfil }: { perfil: PerfilDbv }) {
  const { dbv } = perfil
  const voltar = useVoltar({ para: LISTA, rotulo: 'Desbravadores' })
  const { avisos, dispensar } = useAvisosDaFicha()
  const [erroDaAcao, setErroDaAcao] = useState<string | null>(null)
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  const contato = dbv.contato

  const editar = (
    <Link to={`${LISTA}/${dbv.id}/editar`} state={{ voltarPara: voltar.para, voltarRotulo: voltar.rotulo }} className={cn(estiloDoBotao(), celular && 'ml-auto')}>
      Editar
    </Link>
  )
  const rodape = (
    <>
      <ErroDaAcao mensagem={erroDaAcao} />
      <Rodape dbv={dbv} aoErro={setErroDaAcao} />
    </>
  )

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
            {celular && editar}
          </>
        }
        acoes={celular ? undefined : editar}
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

      {celular ? (
        <>
          {dbv.tipo === 'DBV' && dbv.ativo && <NumerosDoMes perfil={perfil} compactos />}
          <PartesNoCelular dbv={dbv} rodape={rodape} />
        </>
      ) : (
        <>
          <CartaoCadastro dbv={dbv} />
          {dbv.tipo === 'DBV' && dbv.ativo && <NumerosDoMes perfil={perfil} compactos={false} />}
          <SecaoProgresso dbvId={dbv.id} />
          {contato !== undefined && <CartaoResponsavel dbv={dbv} contato={contato} />}
          {rodape}
        </>
      )}
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
