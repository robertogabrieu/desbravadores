import { useSessao } from '../../sessao/useSessao'
import { MontagemAdm } from './MontagemAdm'
import { MontagemInstrutor } from './MontagemInstrutor'

/** G12: um endereço, a tela do papel — Adm monta em A7, instrutor em I3b (o 403 dele vira redirecionamento lá dentro). */
export function PaginaMontar() {
  const { papel } = useSessao()
  return papel === 'ADM' ? <MontagemAdm /> : <MontagemInstrutor />
}
