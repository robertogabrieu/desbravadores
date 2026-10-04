import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFila } from '../offline'
import { Confirmacao } from '../ui/Confirmacao'
import { MenuCabecalho } from '../ui/MenuCabecalho'
import type { ItemMenu } from '../ui/MenuCabecalho'
import { useSessao } from '../sessao/useSessao'

type Saida = 'SAIR' | 'SAIR_DE_TODOS'

const ROTULO_DA_SAIDA: Record<Saida, string> = {
  SAIR: 'Sair',
  SAIR_DE_TODOS: 'Sair de todos os aparelhos',
}

const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome

/**
 * Menu do cabeçalho: nome do usuário com trocar de papel, sair e sair de todos os aparelhos. Com
 * `soPrimeiroNome`, o botão encurta para o primeiro nome e o nome inteiro abre o menu.
 */
export function MenuUsuario({ soPrimeiroNome = false }: { soPrimeiroNome?: boolean }) {
  const { eu, vinculos, sair, sairDeTodos } = useSessao()
  const { contagem } = useFila()
  const navegar = useNavigate()
  const [saidaPendente, definirSaidaPendente] = useState<Saida | null>(null)

  const itensNaFila = contagem.pendentes + contagem.erros
  const nome = eu?.usuario.nome

  const executar = (saida: Saida) => void (saida === 'SAIR' ? sair() : sairDeTodos())

  // Com itens esperando envio, a saída só acontece depois de a pessoa confirmar.
  const pedirSaida = (saida: Saida) => {
    if (itensNaFila > 0) definirSaidaPendente(saida)
    else executar(saida)
  }

  const itens: ItemMenu[] = []
  if (vinculos.length >= 2) itens.push({ rotulo: 'Trocar de papel', aoEscolher: () => void navegar('/papel') })
  itens.push({ rotulo: ROTULO_DA_SAIDA.SAIR, aoEscolher: () => pedirSaida('SAIR') })
  itens.push({ rotulo: ROTULO_DA_SAIDA.SAIR_DE_TODOS, aoEscolher: () => pedirSaida('SAIR_DE_TODOS') })

  return (
    <>
      {nome && soPrimeiroNome ? (
        <MenuCabecalho rotulo={primeiroNome(nome)} rotuloAcessivel={nome} cabecalho={nome} itens={itens} />
      ) : (
        <MenuCabecalho rotulo={nome ?? 'Menu'} itens={itens} />
      )}
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
    </>
  )
}
