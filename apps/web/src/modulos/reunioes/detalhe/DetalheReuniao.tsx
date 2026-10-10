import { Pencil } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { SubstituicaoNoRegistro } from '@desbravadores/shared'
import type { z } from 'zod'
import { useReuniao } from '../../../api/reunioes'
import { usePacote } from '../../../offline'
import { Esqueleto } from '../../../ui/Esqueleto'
import { ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { diaEMes } from '../historico/datas'
import { FotosDaReuniao, Indicadores, ListaDaChamada, diaDaSemana, horaNoFuso } from './PartesDaReuniao'

const FUSO_PADRAO = 'America/Sao_Paulo'

const LINKS = { album: (id: string) => `/galeria/${id}`, enviarFotos: (id: string) => `/galeria/enviar?reuniao=${id}` }

export function DetalheReuniao() {
  const { id = '' } = useParams()
  const reuniao = useReuniao(id)
  const { pacote } = usePacote()

  if (reuniao.isPending) {
    return (
      <div role="status" aria-label="Carregando reunião" className="flex flex-col gap-3 p-4">
        <Esqueleto className="h-24" />
        <Esqueleto className="h-14" />
        <Esqueleto className="h-14" />
      </div>
    )
  }
  if (reuniao.isError) return <ErroDeCarga erro={reuniao.error} aoTentarDeNovo={() => void reuniao.refetch()} />

  const dados = reuniao.data
  const fuso = pacote?.clube.fuso ?? FUSO_PADRAO
  const criterioLicao = pacote?.criterios.find((c) => c.gatilho === 'LICAO')
  const mostrarLicao = criterioLicao?.ativo ?? false
  const { dia, mes } = diaEMes(dados.data)
  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h1 className="font-titulo text-2xl font-extrabold">{`Reunião · ${Number(dia)} ${mes.toLowerCase()}`}</h1>
          <span className="text-sm text-texto-2">{`${diaDaSemana(dados.data)} · Unidade ${dados.unidade.nome}`}</span>
        </div>
        {dados.podeEditar && (
          <Link to={`/reunioes/${dados.id}/editar`} className="inline-flex min-h-[var(--touch-min)] items-center gap-1.5 rounded-botao border border-borda bg-superficie px-4 text-base font-semibold">
            <Pencil aria-hidden className="size-4" />
            Editar
          </Link>
        )}
      </header>

      <section className="flex flex-col gap-3 rounded-cartao border border-borda-controle bg-superficie p-4">
        {dados.substituicao && <AvisoDeSubstituicao substituicao={dados.substituicao} />}
        <p className="text-sm text-texto-2">{`Registrada por ${dados.registradaPor.nome} às ${horaNoFuso(dados.registradaEm, fuso)}`}</p>
        {dados.alterada && <p className="text-sm text-texto-2">{`Alterada por ${dados.alterada.por} às ${horaNoFuso(dados.alterada.em, fuso)}`}</p>}
        {dados.alterada?.conflito && <p className="text-sm font-semibold text-alerta">Houve conflito entre aparelhos</p>}
        <Indicadores dados={dados} variante="conselheiro" />
      </section>

      <ListaDaChamada dados={dados} mostrarLicao={mostrarLicao} />

      {dados.observacoes && (
        <section className="flex flex-col gap-1">
          <h2 className="font-titulo text-lg font-bold">Observações</h2>
          <p className="text-base">{dados.observacoes}</p>
        </section>
      )}

      <FotosDaReuniao dados={dados} links={LINKS} />
      <p className="text-sm text-texto-2">Alterações na chamada recalculam os pontos do ranking e ficam registradas no histórico.</p>
    </main>
  )
}

/** R1: a chamada veio pelo link de substituição; quem lançou ou alterou e o Adm que gerou o link. */
export function AvisoDeSubstituicao({ substituicao }: { substituicao: z.infer<typeof SubstituicaoNoRegistro> }) {
  const { autor, semConta, geradoPor, lancou } = substituicao
  return (
    <p data-r1="substituicao" className="text-base text-texto">
      <b>Substituição.</b> {`Chamada ${lancou ? 'lançada' : 'alterada'} por `}
      <b>{autor}</b>
      {`${semConta ? ' (sem conta no app)' : ''}, pelo link que ${geradoPor} (Adm) gerou.`}
    </p>
  )
}
