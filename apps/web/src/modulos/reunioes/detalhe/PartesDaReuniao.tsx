import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { z } from 'zod'
import type { LinhaChamadaSaida, ReuniaoDetalhe } from '@desbravadores/shared'
import { Chip } from '../../../ui/Chip'
import { cn } from '../../../ui/cn'

type Detalhe = z.infer<typeof ReuniaoDetalhe>
type Linha = z.infer<typeof LinhaChamadaSaida>
type Filtro = 'todos' | 'presentes' | 'ausentes'

const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const ehPresente = (linha: Linha): boolean => linha.situacao === 'PRESENTE' || linha.situacao === 'ATRASADO'

/** "10h40" no fuso do clube. */
export function horaNoFuso(instante: string, fuso: string): string {
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instante))
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '00'
  return `${valor('hour')}h${valor('minute')}`
}

export function diaDaSemana(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return DIAS_DA_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]
}

function Marca({ ligada, children }: { ligada: boolean; children: string }) {
  return (
    <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold', ligada ? 'bg-marca-suave text-marca' : 'bg-superficie-suave text-texto-2 line-through')}>{children}</span>
  )
}

function LinhaDbv({ linha, mostrarLicao }: { linha: Linha; mostrarLicao: boolean }) {
  const presente = ehPresente(linha)
  return (
    <li className="flex items-center gap-3 rounded-cartao border border-borda bg-superficie p-3">
      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', presente ? 'bg-sucesso' : 'bg-perigo')} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn('font-bold', !presente && 'text-texto-2')}>{linha.nome}</span>
        <span className="flex flex-wrap gap-1.5">
          {presente ? (
            <>
              <Marca ligada={linha.situacao === 'PRESENTE'}>{linha.situacao === 'ATRASADO' ? 'Atrasou' : 'Pontual'}</Marca>
              <Marca ligada={linha.uniforme}>Uniforme</Marca>
              <Marca ligada={linha.biblia}>Bíblia</Marca>
              {mostrarLicao && <Marca ligada={linha.licao}>Lição</Marca>}
            </>
          ) : (
            <span className="rounded-md bg-perigo/10 px-2 py-0.5 text-xs font-bold text-perigo">
              {linha.situacao === 'FALTA_JUSTIFICADA' ? 'Falta justificada' : 'Falta sem justificativa'}
            </span>
          )}
        </span>
      </span>
      <span className={cn('font-extrabold', presente ? 'text-marca' : 'text-texto-2')}>{presente ? `+${linha.pontos}` : String(linha.pontos)}</span>
    </li>
  )
}

function Indicador({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-titulo text-xl font-extrabold">{valor}</span>
      <span className="text-xs font-semibold text-texto-2">{rotulo}</span>
    </div>
  )
}

export function Indicadores({ dados, variante }: { dados: Detalhe; variante: 'conselheiro' | 'adm' }) {
  const { totais } = dados
  return (
    <div className="grid grid-cols-4 gap-2">
      <Indicador valor={`${totais.presentes}/${totais.total}`} rotulo="presentes" />
      <Indicador valor={String(totais.atrasos)} rotulo={totais.atrasos === 1 ? 'atraso' : 'atrasos'} />
      {variante === 'adm' ? (
        <>
          <Indicador valor={String(totais.uniformes)} rotulo="uniformes" />
          <Indicador valor={String(totais.biblias)} rotulo="Bíblias" />
        </>
      ) : (
        <>
          <Indicador valor={String(totais.uniformes)} rotulo="uniforme" />
          <Indicador valor={String(totais.pontos)} rotulo="pontos" />
        </>
      )}
    </div>
  )
}

/** Filtros Todos/Presentes/Ausentes e as linhas da chamada. */
export function ListaDaChamada({ dados, mostrarLicao }: { dados: Detalhe; mostrarLicao: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const presentes = dados.chamada.filter(ehPresente)
  const ausentes = dados.chamada.filter((linha) => !ehPresente(linha))
  const visiveis = filtro === 'presentes' ? presentes : filtro === 'ausentes' ? ausentes : dados.chamada
  const filtros: { id: Filtro; nome: string }[] = [
    { id: 'todos', nome: `Todos · ${dados.chamada.length}` },
    { id: 'presentes', nome: `Presentes · ${presentes.length}` },
    { id: 'ausentes', nome: `Ausentes · ${ausentes.length}` },
  ]
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <Chip key={f.id} selecionado={filtro === f.id} aoAlternar={() => setFiltro(f.id)}>
            {f.nome}
          </Chip>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {visiveis.map((linha) => (
          <LinhaDbv key={linha.dbvId} linha={linha} mostrarLicao={mostrarLicao} />
        ))}
      </ul>
    </>
  )
}

export interface LinksDaReuniao {
  album: ((albumId: string) => string) | null
  enviarFotos: ((reuniaoId: string) => string) | null
}

export function FotosDaReuniao({ dados, links }: { dados: Detalhe; links: LinksDaReuniao }) {
  if (!links.album && !links.enviarFotos) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-titulo text-lg font-bold">Fotos desta reunião</h2>
        {dados.album && links.album && (
          <Link to={links.album(dados.album.id)} className="text-base font-semibold text-marca">
            {`Ver álbum (${dados.album.totalFotos})`}
          </Link>
        )}
      </div>
      <div className="flex gap-2">
        {dados.album?.miniaturas.map((url) => (
          <img key={url} src={url} alt="Foto da reunião" className="size-16 rounded-botao object-cover" />
        ))}
        {links.enviarFotos && (
          <Link to={links.enviarFotos(dados.id)} aria-label="Adicionar fotos a esta reunião" className="flex size-16 items-center justify-center rounded-botao border border-dashed border-borda text-marca">
            <Plus aria-hidden className="size-6" />
          </Link>
        )}
      </div>
    </section>
  )
}
