import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCancelarSubstituicao, useSubstituicaoDoAlvo } from '../../../api/substituicao'
import type { AlvoDaSubstituicao, SubstituicaoAberta } from '../../../api/substituicao'
import { usePacote } from '../../../offline'
import { useSessao } from '../../../sessao/useSessao'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { cn } from '../../../ui/cn'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { ListaDePares } from '../../../ui/ListaDePares'
import { Selo } from '../../../ui/Selo'
import { MENSAGEM_GENERICA, lerErroDaApi } from '../desbravadores/erros'
import { FUSO_PADRAO_DO_CLUBE } from '../formatos'
import { diaCurto, horaNoFuso, janelaEmHoras } from './mensagem-substituicao'
import type { AlvoComNome } from './mensagem-substituicao'

type Alvo = AlvoDaSubstituicao & AlvoComNome

interface Propriedades {
  alvo: Alvo
  /** Unidade ou classe inativa no clube não oferece o link. */
  ativo: boolean
  nivelDoTitulo?: 2 | 3
}

export const caminhoDoLink = (alvo: AlvoDaSubstituicao): string =>
  `/adm/${alvo.tipo === 'unidade' ? 'unidades' : 'classes'}/${alvo.id}/substituicao`

const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome

/** Cartão "Substituto para um dia": só para quem gerencia usuários, e só com o alvo ativo. */
export function CartaoSubstituto({ alvo, ativo, nivelDoTitulo = 2 }: Propriedades) {
  const { pode } = useSessao()
  if (!ativo || !pode('usuario.gerenciar')) return null
  return <CartaoVisivel alvo={alvo} nivelDoTitulo={nivelDoTitulo} />
}

function CartaoVisivel({ alvo, nivelDoTitulo }: { alvo: Alvo; nivelDoTitulo: 2 | 3 }) {
  const idTitulo = useId()
  const consulta = useSubstituicaoDoAlvo(alvo)
  const Titulo = nivelDoTitulo === 2 ? 'h2' : 'h3'

  let corpo: ReactNode
  if (consulta.isPending) {
    corpo = (
      <Carregando rotulo="Carregando o link de substituição">
        <Esqueleto className="h-16" />
      </Carregando>
    )
  } else if (consulta.isError) {
    corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  } else if (consulta.data) {
    corpo = <LinkEmUso alvo={alvo} substituicao={consulta.data} />
  } else {
    corpo = (
      <>
        <p className="text-base text-texto">
          {alvo.tipo === 'unidade'
            ? 'Se nenhum conselheiro puder vir, mande um link para outra pessoa fazer a chamada. Ela não precisa de conta.'
            : `Se nenhum instrutor puder vir, mande um link para outra pessoa fazer o registro da classe ${alvo.nome}. Ela não precisa de conta.`}
        </p>
        <Link to={caminhoDoLink(alvo)} className={cn(estiloDoBotao({ variante: 'primario' }), 'self-start')}>
          Gerar link de substituição
        </Link>
      </>
    )
  }

  return (
    <Cartao role="region" aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <Titulo id={idTitulo} className="font-titulo text-lg font-bold text-texto">
        Substituto para um dia
      </Titulo>
      {corpo}
    </Cartao>
  )
}

function LinkEmUso({ alvo, substituicao }: { alvo: Alvo; substituicao: SubstituicaoAberta }) {
  const { pacote } = usePacote()
  const fuso = pacote?.clube.fuso ?? FUSO_PADRAO_DO_CLUBE
  const cancelar = useCancelarSubstituicao(alvo)
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const { substituto, identificadaEm } = substituicao
  const quem = substituto ? primeiroNome(substituto.nome) : 'Quem recebeu o link'

  async function cancelarLink() {
    setErro(null)
    try {
      await cancelar.mutateAsync()
      setConfirmando(false)
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  return (
    <>
      <ListaDePares pares={[{ rotulo: 'Reunião', valor: `${diaCurto(substituicao.data)}, ${janelaEmHoras(substituicao, fuso)}` }]} />
      {substituto && identificadaEm ? (
        <Selo tom="sucesso" className="self-start">{`Aberto por ${substituto.nome} às ${horaNoFuso(identificadaEm, fuso)}`}</Selo>
      ) : (
        <Selo className="self-start">Ainda não foi aberto</Selo>
      )}
      <Botao variante="perigo" className="self-start" onClick={() => setConfirmando(true)}>
        Cancelar link
      </Botao>
      <Confirmacao
        aberta={confirmando}
        titulo="Cancelar?"
        rotuloConfirmar="Sim, cancelar"
        rotuloCancelar="Voltar"
        perigo
        ocupada={cancelar.isPending}
        erro={erro}
        aoConfirmar={() => void cancelarLink()}
        aoCancelar={() => setConfirmando(false)}
      >
        {`${quem} não vai conseguir lançar mais nada por este link.`}
      </Confirmacao>
    </>
  )
}
