import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { z } from 'zod'
import type { PacoteSaida, ReuniaoDetalhe, ReuniaoEnvioSaida } from '@desbravadores/shared'
import { ErroDaApi } from '../../../api/cliente'
import { useCorrigirChamada, useReuniao } from '../../../api/reunioes'
import type { EntradaSalvarChamada } from '../../../api/reunioes'
import { useConexao, usePacote } from '../../../offline'
import { estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { EsqueletoChamada } from '../../reunioes/chamada/EstadosChamada'
import { FormularioChamada } from '../../reunioes/chamada/FormularioChamada'
import type { UnidadeDaChamada } from '../../reunioes/chamada/FormularioChamada'
import { baseDoDetalhe } from '../../reunioes/chamada/estado'
import { dataPorExtenso } from '../formatos'

type Detalhe = z.infer<typeof ReuniaoDetalhe>
type Pacote = z.infer<typeof PacoteSaida>
type SaidaDoEnvio = z.infer<typeof ReuniaoEnvioSaida>

type Retorno = { tipo: 'RECUSA'; mensagem: string } | { tipo: 'SALVO_COM_AVISOS'; saida: SaidaDoEnvio }

function mensagemDaRecusa(erro: Error): string {
  if (erro instanceof ErroDaApi) return erro.classe === 'REDE' ? 'Corrigir a chamada precisa de internet. Nada foi enviado.' : erro.erro.mensagem
  return 'Não foi possível salvar agora. Tente de novo.'
}

const nomes = (lista: { nome: string }[]): string => lista.map((item) => item.nome).join(', ')

function RetornoDaCorrecao({ retorno, ficha }: { retorno: Retorno; ficha: string }) {
  if (retorno.tipo === 'RECUSA') return <p role="alert" className="text-sm font-semibold text-perigo">{retorno.mensagem}</p>
  const { saida } = retorno
  return (
    <FaixaAviso>
      <div className="flex flex-col gap-2">
        <p className="font-bold">Chamada salva, com avisos</p>
        {saida.conflitoCabecalho && <p>O horário ou as observações tinham sido mudados por outra pessoa; a sua versão valeu.</p>}
        {saida.conflitos.length > 0 && (
          <p>{`${saida.conflitos.length} linhas tinham sido alteradas por outra pessoa; a sua versão valeu e a anterior ficou registrada: ${nomes(saida.conflitos)}.`}</p>
        )}
        {saida.ignorados.length > 0 && <p>{`${nomes(saida.ignorados)} não eram da unidade nessa data e ficaram fora.`}</p>}
        <Link to={ficha} className={estiloDoBotao({ variante: 'primario' })}>
          Ver a reunião
        </Link>
      </div>
    </FaixaAviso>
  )
}

function CorrecaoDoAdm({ detalhe, pacote, ficha }: { detalhe: Detalhe; pacote: Pacote; ficha: string }) {
  const navegar = useNavigate()
  const corrigir = useCorrigirChamada()
  const [retorno, setRetorno] = useState<Retorno | null>(null)
  // Quem era da unidade naquela data: as linhas da reunião, não os membros de hoje.
  const unidade: UnidadeDaChamada = {
    id: detalhe.unidade.id,
    nome: detalhe.unidade.nome,
    membros: detalhe.chamada.map((linha) => ({ dbvId: linha.dbvId, nome: linha.nome })),
  }

  function enviar(entrada: EntradaSalvarChamada) {
    setRetorno(null)
    corrigir.mutate(entrada, {
      onSuccess: (saida) => {
        const semAvisos = !saida.conflitoCabecalho && saida.conflitos.length === 0 && saida.ignorados.length === 0
        if (semAvisos) void navegar(ficha, { replace: true })
        else setRetorno({ tipo: 'SALVO_COM_AVISOS', saida })
      },
      onError: (erro) => setRetorno({ tipo: 'RECUSA', mensagem: mensagemDaRecusa(erro) }),
    })
  }

  return (
    <FormularioChamada
      pacote={pacote}
      baixadoEm={null}
      unidade={unidade}
      data={detalhe.data}
      base={baseDoDetalhe(detalhe)}
      envioDireto={{
        enviar,
        enviando: corrigir.isPending,
        bloqueado: retorno?.tipo === 'SALVO_COM_AVISOS',
        retorno: retorno && <RetornoDaCorrecao retorno={retorno} ficha={ficha} />,
      }}
    />
  )
}

export function CorrigirChamada() {
  const { id = '' } = useParams()
  const { modo } = useConexao()
  const detalhe = useReuniao(id)
  const { pacote, carregando } = usePacote()
  const dados = detalhe.data
  const ficha = `/adm/reunioes/${id}`

  let corpo: ReactNode
  if (modo === 'SEM_CONEXAO') corpo = <EstadoVazio titulo="Corrigir a chamada precisa de internet" descricao="Conecte-se e abra de novo. Nada foi alterado." />
  else if (detalhe.isPending || carregando) corpo = <EsqueletoChamada />
  else if (detalhe.isError)
    corpo = ehNaoEncontrado(detalhe.error) ? (
      <EstadoNaoEncontrado registro="esta reunião" lista={{ para: '/adm/unidades', rotulo: 'Ver as unidades' }} />
    ) : (
      <ErroDeCarga erro={detalhe.error} aoTentarDeNovo={() => void detalhe.refetch()} />
    )
  else if (!pacote) corpo = <EstadoVazio titulo="A configuração do clube ainda não chegou" descricao="Aguarde um instante e abra de novo." />
  else corpo = <CorrecaoDoAdm detalhe={detalhe.data} pacote={pacote} ficha={ficha} />

  return (
    <main className="flex flex-col gap-5 p-4">
      <CabecalhoDaPagina
        voltar={{ para: ficha, rotulo: 'Reunião' }}
        sobretitulo={dados ? `Unidade ${dados.unidade.nome} · ${dataPorExtenso(dados.data)}` : undefined}
        titulo="Corrigir chamada"
      />
      {corpo}
    </main>
  )
}
