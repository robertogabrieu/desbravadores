import { useNavigate } from 'react-router-dom'
import { MenuCabecalho } from '../ui/MenuCabecalho'
import type { ItemMenu } from '../ui/MenuCabecalho'
import { useSessao } from '../sessao/useSessao'

/** Menu do cabeçalho: nome do usuário com trocar de papel, sair e sair de todos os aparelhos. */
export function MenuUsuario() {
  const { eu, vinculos, sair, sairDeTodos } = useSessao()
  const navegar = useNavigate()

  const itens: ItemMenu[] = []
  if (vinculos.length >= 2) itens.push({ rotulo: 'Trocar de papel', aoEscolher: () => void navegar('/papel') })
  itens.push({ rotulo: 'Sair', aoEscolher: () => void sair() })
  itens.push({ rotulo: 'Sair de todos os aparelhos', aoEscolher: () => void sairDeTodos() })

  return <MenuCabecalho rotulo={eu?.usuario.nome ?? 'Menu'} itens={itens} />
}
