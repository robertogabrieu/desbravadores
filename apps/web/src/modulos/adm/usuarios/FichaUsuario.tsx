import { useState } from 'react'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useCatalogoPermissoes } from '../../../api/leitura'
import type { CatalogoPermissao } from '../../../api/leitura'
import { useDesativarUsuario, useReenviarConvite, useUsuario } from '../../../api/usuarios'
import type { Usuario, VinculoUsuario } from '../../../api/usuarios'
import { useConexao } from '../../../offline'
import { useSessao } from '../../../sessao/useSessao'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Cartao } from '../../../ui/Cartao'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { ListaDePares } from '../../../ui/ListaDePares'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FUSO_PADRAO_DO_CLUBE, textoDoUltimoAcesso } from '../formatos'
import { useAvisosDaFicha, useVoltar } from '../navegacao'
import { CartaoDoPapel } from './CartaoDoPapel'
import { RemoverPapel, useDepoisDePerderOPapelDaSessao } from './RemoverPapel'
import { ativosEmOrdem } from './remover'
import { mensagemDeErro } from './vinculos'

export const SITUACAO: Record<Usuario['situacao'], string> = { ATIVO: 'Ativo', CONVIDADO: 'Convite enviado', INATIVO: 'Inativo' }

const GENERO: Record<'F' | 'M', string> = { F: 'Feminino', M: 'Masculino' }

function situacaoPorExtenso(usuario: Usuario): string {
  if (usuario.situacao === 'CONVIDADO') return SITUACAO.CONVIDADO
  if (usuario.situacao === 'INATIVO') return SITUACAO.INATIVO
  return `${usuario.genero === 'F' ? 'Ativa' : 'Ativo'} · ${textoDoUltimoAcesso(usuario.ultimoAcessoEm, new Date(), FUSO_PADRAO_DO_CLUBE)}`
}

const LISTA_DE_USUARIOS = { para: '/adm/usuarios', rotulo: 'Ver a lista de usuários' }

/** Carrega o usuário da rota e cuida dos estados de carga, erro, não encontrado e sem conexão. */
export function ComUsuario({ aoCarregar }: { aoCarregar: (usuario: Usuario) => ReactNode }) {
  const { id = '' } = useParams()
  const consulta = useUsuario(id)
  const { modo } = useConexao()

  let corpo: ReactNode
  if (consulta.data) corpo = aoCarregar(consulta.data)
  else if (consulta.isError && ehNaoEncontrado(consulta.error)) corpo = <EstadoNaoEncontrado registro="este usuário" lista={LISTA_DE_USUARIOS} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else corpo = <Carregando rotulo="Carregando o usuário" />

  return <div className="flex flex-col gap-5 py-4">{corpo}</div>
}

export const FichaUsuario = () => <ComUsuario aoCarregar={(usuario) => <FichaComCatalogo usuario={usuario} />} />

/** A ficha só aparece com o catálogo lido: sem ele "O que pode fazer" sairia vazio e depois se preencheria. */
function FichaComCatalogo({ usuario }: { usuario: Usuario }) {
  const catalogo = useCatalogoPermissoes()
  if (catalogo.isError) return <ErroDeCarga erro={catalogo.error} aoTentarDeNovo={() => void catalogo.refetch()} />
  if (!catalogo.data) return <Carregando rotulo="Carregando o usuário" />
  return <FichaCarregada usuario={usuario} catalogo={catalogo.data} />
}

function FichaCarregada({ usuario, catalogo }: { usuario: Usuario; catalogo: CatalogoPermissao[] }) {
  const voltar = useVoltar({ para: '/adm/usuarios', rotulo: 'Usuários' })
  const estadoDeVolta = { voltarPara: voltar.para, voltarRotulo: voltar.rotulo }
  const { eu } = useSessao()
  const { avisos, dispensar } = useAvisosDaFicha()
  const desativar = useDesativarUsuario()
  const reenviar = useReenviarConvite()
  const depoisDePerderOPapel = useDepoisDePerderOPapelDaSessao()
  const [removendo, setRemovendo] = useState<VinculoUsuario | null>(null)
  const [desativando, setDesativando] = useState(false)
  const [erroAoDesativar, setErroAoDesativar] = useState<string>()
  const [aviso, setAviso] = useState<string>()
  const [erro, setErro] = useState<string>()
  const ativos = ativosEmOrdem(usuario.vinculos)
  const ehVoce = eu?.usuario.id === usuario.id
  const caminhoDaEdicao = `/adm/usuarios/${usuario.id}/editar`
  const acrescentar = (
    <Link to={`/adm/usuarios/${usuario.id}/papeis/novo`} state={estadoDeVolta} className={estiloDoBotao({ variante: 'secundario' })}>
      <Plus aria-hidden className="size-4" />
      Acrescentar papel
    </Link>
  )

  const reenviarConvite = async () => {
    setErro(undefined)
    setAviso(undefined)
    dispensar()
    try {
      await reenviar.mutateAsync(usuario.id)
      setAviso('Convite reenviado.')
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  const fecharDesativacao = () => {
    setErroAoDesativar(undefined)
    setDesativando(false)
  }

  const desativarNoClube = async () => {
    if (desativar.isPending) return
    setErroAoDesativar(undefined)
    try {
      await desativar.mutateAsync(usuario.id)
      if (ehVoce) await depoisDePerderOPapel()
      else fecharDesativacao()
    } catch (falha) {
      setErroAoDesativar(mensagemDeErro(falha))
    }
  }

  return (
    <>
      <CabecalhoDaPagina
        voltar={voltar}
        sobretitulo={`Usuário · ${SITUACAO[usuario.situacao]}`}
        titulo={usuario.nome}
        acoes={
          usuario.situacao === 'CONVIDADO' && (
            <>
              <Link to={caminhoDaEdicao} state={estadoDeVolta} className={estiloDoBotao({ variante: 'secundario' })}>
                Editar
              </Link>
              <Botao variante="secundario" carregando={reenviar.isPending} onClick={() => void reenviarConvite()}>
                Reenviar convite
              </Botao>
            </>
          )
        }
      />

      {avisos.map((texto) => (
        <p key={texto} role="status" className="text-sm font-medium text-texto-2">
          {texto}
        </p>
      ))}
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="text-sm font-medium text-texto-2">
          {aviso}
        </p>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-titulo text-lg font-bold">Dados</h2>
        <ListaDePares
          colunas={3}
          pares={[
            { rotulo: 'E-mail', valor: usuario.email },
            { rotulo: 'Gênero', valor: usuario.genero ? GENERO[usuario.genero] : 'Não informado' },
            { rotulo: 'Situação', valor: situacaoPorExtenso(usuario) },
          ]}
        />
      </Cartao>

      <section aria-labelledby="papeis-no-clube" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="papeis-no-clube" className="font-titulo text-xl font-bold">
            Papéis no clube
          </h2>
          {acrescentar}
        </div>
        {ativos.length === 0 ? (
          <EstadoVazio titulo="Nenhum papel neste clube" descricao="Sem papel, a pessoa não entra no clube." />
        ) : (
          <div className="flex flex-col gap-4">
            {ativos.map((vinculo) => (
              <CartaoDoPapel
                key={vinculo.id}
                usuarioId={usuario.id}
                vinculo={vinculo}
                genero={usuario.genero}
                catalogo={catalogo}
                estadoDeVolta={estadoDeVolta}
                aoRemover={() => setRemovendo(vinculo)}
              />
            ))}
          </div>
        )}
      </section>

      {ativos.length > 0 && (
        <div className="flex justify-end">
          <Botao variante="texto" className="text-perigo hover:bg-perigo/10" onClick={() => setDesativando(true)}>
            Desativar neste clube
          </Botao>
        </div>
      )}

      <RemoverPapel usuario={usuario} vinculo={removendo} aoFechar={() => setRemovendo(null)} />

      <Confirmacao
        aberta={desativando}
        titulo={ehVoce ? 'Desativar o seu próprio acesso?' : `Desativar ${usuario.nome} neste clube?`}
        rotuloConfirmar="Desativar"
        perigo
        erro={erroAoDesativar}
        aoCancelar={fecharDesativacao}
        aoConfirmar={() => void desativarNoClube()}
      >
        {ehVoce ? 'Este é o seu usuário. Ao desativar, você perde o acesso a este clube na hora.' : 'A pessoa perde o acesso a este clube na hora.'}
      </Confirmacao>
    </>
  )
}
