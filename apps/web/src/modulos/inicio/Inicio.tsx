import { Hammer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSessao } from '../../sessao/useSessao'
import { Cartao } from '../../ui/Cartao'
import { rotuloDoPapel } from '../acesso/papeis'
import { ConviteInstalacao } from './ConviteInstalacao'

/** Início provisório: saudação, papel e o aviso de que o resto está a caminho. */
export function Inicio() {
  const { eu, papel, vinculoAtivo } = useSessao()
  if (!eu || !papel || !vinculoAtivo) return null

  const primeiroNome = eu.usuario.nome.split(' ')[0]
  const escopo = papel === 'CONSELHEIRO' ? vinculoAtivo.unidades.map((u) => u.nome).join(', ') : vinculoAtivo.clube.nome

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-texto-2">
          {rotuloDoPapel(papel)} · {escopo}
        </span>
        <h1 className="font-titulo text-2xl font-bold text-texto">Olá, {primeiroNome}</h1>
      </header>
      <Cartao className="flex items-center gap-3">
        <Hammer aria-hidden className="size-6 shrink-0 text-marca" />
        <div>
          <h2 className="font-titulo text-lg font-bold text-texto">Em construção</h2>
          <p className="text-base text-texto-2">Em breve você vai encontrar aqui o que precisa no dia a dia.</p>
        </div>
      </Cartao>
      {papel === 'CONSELHEIRO' && (
        <Link to="/unidade" className="flex min-h-[var(--touch-min)] items-center text-base font-semibold text-marca">
          Ver minha unidade
        </Link>
      )}
      <ConviteInstalacao />
    </div>
  )
}
