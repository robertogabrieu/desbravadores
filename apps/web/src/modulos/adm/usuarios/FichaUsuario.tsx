import { useState } from 'react'
import type { ReactNode } from 'react'
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
import { Selo } from '../../../ui/Selo'
import { FUSO_PADRAO_DO_CLUBE, textoDoUltimoAcesso } from '../formatos'
import { useVoltarPara } from '../navegacao'
import { escopoDoPapel, mensagemDeErro, oQuePodeFazer } from './vinculos'

export const SITUACAO: Record<Usuario['situacao'], string> = { ATIVO: 'Ativo', CONVIDADO: 'Convite enviado', INATIVO: 'Inativo' }

const GENERO: Record<'F' | 'M', string> = { F: 'Feminino', M: 'Masculino' }

const PAPEL_NO_FEMININO = { ADM: 'Adm', CONSELHEIRO: 'Conselheira', INSTRUTOR: 'Instrutora' } as const
const PAPEL_NO_MASCULINO = { ADM: 'Adm', CONSELHEIRO: 'Conselheiro', INSTRUTOR: 'Instrutor' } as const

const tituloDoPapel = (vinculo: VinculoUsuario, genero: Usuario['genero']): string =>
  (genero === 'F' ? PAPEL_NO_FEMININO : PAPEL_NO_MASCULINO)[vinculo.papel]

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

  return <main className="flex flex-col gap-6 p-6">{corpo}</main>
}

export const FichaUsuario = () => <ComUsuario aoCarregar={(usuario) => <FichaComCatalogo usuario={usuario} />} />

/** A ficha só aparece com o catálogo lido: sem ele "O que pode fazer" sairia vazio e depois se preencheria. */
function FichaComCatalogo({ usuario }: { usuario: Usuario }) {
  const catalogo = useCatalogoPermissoes()
  if (catalogo.isError) return <ErroDeCarga erro={catalogo.error} aoTentarDeNovo={() => void catalogo.refetch()} />
  if (!catalogo.data) return <Carregando rotulo="Carregando o usuário" />
  return <FichaCarregada usuario={usuario} catalogo={catalogo.data} />
}

function CartaoDoPapel({ vinculo, genero, catalogo }: { vinculo: VinculoUsuario; genero: Usuario['genero']; catalogo: CatalogoPermissao[] }) {
  const titulo = tituloDoPapel(vinculo, genero)
  const idTitulo = `papel-${vinculo.id}`
  const permissoes = oQuePodeFazer(vinculo, catalogo)
  return (
    <Cartao role="region" aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id={idTitulo} className="font-titulo text-lg font-bold">
          {titulo}
        </h2>
        <Selo tom="sucesso">Ativo</Selo>
      </div>
      <ListaDePares
        pares={[
          { rotulo: 'Escopo', valor: escopoDoPapel(vinculo) },
          {
            rotulo: 'O que pode fazer',
            valor:
              vinculo.papel === 'ADM' ? (
                'Todas as permissões do clube'
              ) : (
                <ul className="flex list-disc flex-col gap-1 pl-5 font-normal">
                  {permissoes.map((rotulo) => (
                    <li key={rotulo}>{rotulo}</li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
    </Cartao>
  )
}

function FichaCarregada({ usuario, catalogo }: { usuario: Usuario; catalogo: CatalogoPermissao[] }) {
  const voltarPara = useVoltarPara('/adm/usuarios')
  const { eu } = useSessao()
  const desativar = useDesativarUsuario()
  const reenviar = useReenviarConvite()
  const [confirmando, setConfirmando] = useState(false)
  const [aviso, setAviso] = useState<string>()
  const [erro, setErro] = useState<string>()
  const ativos = usuario.vinculos.filter((v) => v.ativo)
  const ehVoce = eu?.usuario.id === usuario.id
  const caminhoDaEdicao = `/adm/usuarios/${usuario.id}/editar`

  const tentar = async (acao: () => Promise<unknown>, sucesso?: string) => {
    setErro(undefined)
    setAviso(undefined)
    try {
      await acao()
      setAviso(sucesso)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <>
      <CabecalhoDaPagina
        voltar={{ para: voltarPara, rotulo: 'Usuários' }}
        sobretitulo={`Usuário · ${SITUACAO[usuario.situacao]}`}
        titulo={usuario.nome}
        acoes={
          <Link to={caminhoDaEdicao} state={{ voltarPara }} className={estiloDoBotao()}>
            Editar
          </Link>
        }
      />

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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ativos.map((vinculo) => (
          <CartaoDoPapel key={vinculo.id} vinculo={vinculo} genero={usuario.genero} catalogo={catalogo} />
        ))}
      </div>

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

      <div className="flex flex-wrap justify-between gap-3">
        {usuario.situacao === 'CONVIDADO' ? (
          <Botao variante="secundario" carregando={reenviar.isPending} onClick={() => void tentar(() => reenviar.mutateAsync(usuario.id), 'Convite reenviado.')}>
            Reenviar convite
          </Botao>
        ) : (
          <span />
        )}
        {ativos.length > 0 ? (
          <Botao variante="perigo" onClick={() => setConfirmando(true)}>
            Desativar neste clube
          </Botao>
        ) : (
          <Link to={`${caminhoDaEdicao}?acrescentar=1`} state={{ voltarPara }} className={estiloDoBotao({ variante: 'secundario' })}>
            Acrescentar papel
          </Link>
        )}
      </div>

      <Confirmacao
        aberta={confirmando}
        titulo={ehVoce ? 'Desativar o seu próprio acesso?' : `Desativar ${usuario.nome} neste clube?`}
        rotuloConfirmar="Desativar"
        perigo
        aoCancelar={() => setConfirmando(false)}
        aoConfirmar={() => {
          setConfirmando(false)
          void tentar(() => desativar.mutateAsync(usuario.id))
        }}
      >
        {ehVoce ? 'Este é o seu usuário. Ao desativar, você perde o acesso a este clube na hora.' : 'A pessoa perde o acesso a este clube na hora.'}
      </Confirmacao>
    </>
  )
}
