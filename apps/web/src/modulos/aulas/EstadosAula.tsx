import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDestinos } from '../../substituicao/contextos'
import { Botao } from '../../ui/Botao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Esqueleto } from '../../ui/Esqueleto'

export function EsqueletoAula() {
  return (
    <div role="status" aria-label="Carregando a classe" className="flex flex-col gap-3">
      <Esqueleto className="h-8 w-2/3" />
      {[0, 1, 2, 3].map((n) => (
        <Esqueleto key={n} className="h-14 w-full" />
      ))}
    </div>
  )
}

export function AulaVazia({ titulo, descricao }: { titulo: string; descricao?: string }) {
  const { voltarDoRegistroDaClasse } = useDestinos()
  const voltar = (
    <Link to={voltarDoRegistroDaClasse.caminho} className="font-semibold text-marca underline">
      {voltarDoRegistroDaClasse.rotulo}
    </Link>
  )
  return <EstadoVazio titulo={titulo} descricao={descricao} acao={voltar} />
}

export function AulaErro({ mensagem, aoTentar }: { mensagem: string; aoTentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-base">{mensagem}</p>
      <Botao variante="secundario" onClick={aoTentar}>
        Tentar de novo
      </Botao>
    </div>
  )
}

export function AulaMoldura({ children }: { children: ReactNode }) {
  return <main className="flex flex-col gap-4 p-4">{children}</main>
}
