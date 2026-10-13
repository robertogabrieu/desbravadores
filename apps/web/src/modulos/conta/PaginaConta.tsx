import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SeloPapel } from '../../layouts/SeloPapel'
import { useFila } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Botao, estiloDoBotao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { Confirmacao } from '../../ui/Confirmacao'
import { escopoDoVinculo, rotuloDoPapel, vinculosDoClube } from '../acesso/papeis'

type Saida = 'SAIR' | 'SAIR_DE_TODOS'

const ROTULO_DA_SAIDA: Record<Saida, string> = {
  SAIR: 'Sair',
  SAIR_DE_TODOS: 'Sair de todos os aparelhos',
}

/** Minha conta: quem sou, em que papel estou, trocar de papel e sair. Vale para os três papéis. */
export function PaginaConta() {
  const { eu, vinculos, vinculoAtivo, sair, sairDeTodos } = useSessao()
  const { contagem } = useFila()
  const [saidaPendente, definirSaidaPendente] = useState<Saida | null>(null)

  const itensNaFila = contagem.pendentes + contagem.erros
  const escopo = vinculoAtivo ? escopoDoVinculo(vinculoAtivo) : ''
  const papeisDoClube = vinculoAtivo ? vinculosDoClube(vinculos, vinculoAtivo).length : 0
  // O selo já troca entre os papéis do clube; a tela de papéis só acrescenta quando há vínculo em outro clube.
  const mostraSelo = papeisDoClube >= 2
  const mostraTelaDePapeis = vinculos.length >= 2 && (!mostraSelo || vinculos.length > papeisDoClube)

  const executar = (saida: Saida) => void (saida === 'SAIR' ? sair() : sairDeTodos())

  // Com itens esperando envio, a saída só acontece depois de a pessoa confirmar.
  const pedirSaida = (saida: Saida) => {
    if (itensNaFila > 0) definirSaidaPendente(saida)
    else executar(saida)
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4 in-data-[layout=adm]:px-0">
      <h1 className="font-titulo text-2xl font-extrabold text-texto">Minha conta</h1>

      <Cartao className="flex flex-col gap-1">
        <p className="text-lg font-bold text-texto">{eu?.usuario.nome}</p>
        {eu?.usuario.email && <p className="text-base break-words text-texto-2">{eu.usuario.email}</p>}
      </Cartao>

      {vinculoAtivo && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="text-base font-bold text-texto">Papel em uso</h2>
          <p className="text-base text-texto">
            {rotuloDoPapel(vinculoAtivo.papel)}
            {escopo && <span className="text-texto-2"> · {escopo}</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {mostraSelo && <SeloPapel />}
            {mostraTelaDePapeis && (
              <Link to="/papel" className={estiloDoBotao({ variante: 'secundario' })}>
                {mostraSelo ? 'Papéis em outros clubes' : 'Trocar de papel'}
              </Link>
            )}
          </div>
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="text-base font-bold text-texto">Sair</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Botao variante="secundario" onClick={() => pedirSaida('SAIR')}>
            {ROTULO_DA_SAIDA.SAIR}
          </Botao>
          <Botao variante="secundario" onClick={() => pedirSaida('SAIR_DE_TODOS')}>
            {ROTULO_DA_SAIDA.SAIR_DE_TODOS}
          </Botao>
        </div>
      </Cartao>

      <Confirmacao
        aberta={saidaPendente !== null}
        titulo="Sair mesmo assim?"
        rotuloConfirmar={saidaPendente ? ROTULO_DA_SAIDA[saidaPendente] : ''}
        aoCancelar={() => definirSaidaPendente(null)}
        aoConfirmar={() => {
          if (saidaPendente) executar(saidaPendente)
          definirSaidaPendente(null)
        }}
      >
        {itensNaFila === 1
          ? 'Há 1 item esperando envio. Ele fica guardado neste celular e só será enviado quando você entrar de novo.'
          : `Há ${itensNaFila} itens esperando envio. Eles ficam guardados neste celular e só serão enviados quando você entrar de novo.`}
      </Confirmacao>
    </div>
  )
}
