import { MesCivil } from '@desbravadores/shared'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { hojeDoClube } from '../../../api/desbravadores'
import { useReunioes } from '../../../api/reunioes'
import { Botao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { Carregando, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { somarMeses, nomeDoMes } from '../../reunioes/historico/datas'
import { dataPorExtenso } from '../formatos'
import { useEstadoDeVolta, useFiltrosNaUrl } from '../navegacao'

const plural = (n: number, singular: string, muitos: string): string => `${n} ${n === 1 ? singular : muitos}`

export function ReunioesDoMes({ unidadeId }: { unidadeId: string }) {
  const { ler, mudar } = useFiltrosNaUrl()
  const estado = useEstadoDeVolta()
  const pedido = MesCivil.safeParse(ler('mes'))
  const mes = pedido.success ? pedido.data : hojeDoClube().slice(0, 7)
  const nome = nomeDoMes(mes).toLowerCase()
  const reunioes = useReunioes(unidadeId, mes)

  let corpo: ReactNode
  if (reunioes.isError) corpo = <ErroDeCarga erro={reunioes.error} aoTentarDeNovo={() => void reunioes.refetch()} />
  else if (!reunioes.data) corpo = null
  else if (reunioes.data.length === 0) corpo = <p className="py-4 text-base text-texto-2">Nenhuma reunião em {nome}</p>
  else
    corpo = (
      <ul className="flex flex-col">
        {reunioes.data.map((reuniao) => {
          const faltas = reuniao.total - reuniao.presentes
          return (
            <li key={reuniao.id}>
              <Link
                to={`/adm/reunioes/${reuniao.id}`}
                state={estado}
                className="flex min-h-[var(--touch-min)] flex-col justify-center rounded-botao px-2 py-2 hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca"
              >
                <span className="text-base font-semibold text-texto">{dataPorExtenso(reuniao.data)}</span>
                <span className="text-sm text-texto-2">
                  {reuniao.presentes} de {reuniao.total} presentes
                  {reuniao.atrasos > 0 && ` · ${plural(reuniao.atrasos, 'atraso', 'atrasos')}`}
                  {faltas > 0 && ` · ${plural(faltas, 'falta', 'faltas')}`}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    )

  // Enquanto lê, só o aviso: a seção (e as setas) aparecem com a lista pronta, sem pular de conteúdo.
  if (!reunioes.data && !reunioes.isError) return <Carregando rotulo="Carregando as reuniões" />

  return (
    <Cartao role="region" aria-labelledby="titulo-reunioes" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="titulo-reunioes" className="font-titulo text-lg font-bold">
          Reuniões de {nome}
        </h2>
        <div className="flex gap-1">
          <Botao variante="texto" aria-label="Mês anterior" onClick={() => mudar({ mes: somarMeses(mes, -1) })}>
            <ChevronLeft aria-hidden className="size-5" />
          </Botao>
          <Botao variante="texto" aria-label="Próximo mês" onClick={() => mudar({ mes: somarMeses(mes, 1) })}>
            <ChevronRight aria-hidden className="size-5" />
          </Botao>
        </div>
      </div>
      {corpo}
    </Cartao>
  )
}
