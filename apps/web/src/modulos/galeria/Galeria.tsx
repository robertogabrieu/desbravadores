import { Camera, Image } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAlbuns } from '../../api/fotos'
import type { Album } from '../../api/fotos'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { LinhaQueNavega } from '../../ui/LinhaQueNavega'
import { Selecao } from '../../ui/Selecao'
import { contarFotos, diaMes, quemEnviou } from './formatos'
import { ResultadoConsulta } from './ResultadoConsulta'

export const estiloBotaoLink =
  'flex min-h-[var(--touch-min)] items-center justify-center gap-2 rounded-botao bg-marca px-5 text-base font-semibold text-white hover:bg-marca-escura focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca'

function CartaoAlbum({ album }: { album: Album }) {
  const autores = quemEnviou(album.enviadoPor)
  return (
    <li>
      <LinhaQueNavega to={`/galeria/${album.id}`} forma="cartao" className="min-h-[var(--touch-min)] p-3">
        <span className="flex items-center gap-3">
          {album.capaUrl ? (
            <img src={album.capaUrl} alt={`Capa de ${album.titulo}`} className="size-16 shrink-0 rounded-botao object-cover" />
          ) : (
            <span className="flex size-16 shrink-0 items-center justify-center rounded-botao bg-marca-suave text-marca">
              <Image aria-hidden className="size-6" />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-titulo text-lg font-bold text-texto">{album.titulo}</span>
            <span className="text-sm text-texto-2">
              <span>{diaMes(album.data)}</span> · <span>{contarFotos(album.totalFotos)}</span>
            </span>
            {autores && <span className="text-sm text-texto-2">{autores}</span>}
          </span>
        </span>
      </LinhaQueNavega>
    </li>
  )
}

/** Galeria da unidade (C7): os álbuns com capa, e o caminho para enviar fotos. */
export function Galeria() {
  const { vinculoAtivo } = useSessao()
  const { modo } = useConexao()
  const unidades = vinculoAtivo?.unidades ?? []
  const [escolhida, setEscolhida] = useState<string>()
  const unidade = unidades.find((u) => u.id === escolhida) ?? unidades[0]
  const consulta = useAlbuns(unidade?.id ?? '', unidade !== undefined && modo === 'ONLINE')

  if (!unidade) return <EstadoVazio titulo="Você ainda não tem unidade. Fale com o Adm do clube." />

  const enviar = `/galeria/enviar?unidade=${unidade.id}`
  const total = consulta.data?.reduce((soma, album) => soma + album.totalFotos, 0)

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-texto-2">Galeria da unidade</span>
        <h1 className="font-titulo text-2xl font-bold text-texto">{total === undefined ? unidade.nome : `${unidade.nome} · ${contarFotos(total)}`}</h1>
      </header>
      {unidades.length > 1 && (
        <Selecao rotulo="Unidade" value={unidade.id} onChange={(evento) => setEscolhida(evento.target.value)}>
          {unidades.map((opcao) => (
            <option key={opcao.id} value={opcao.id}>
              {opcao.nome}
            </option>
          ))}
        </Selecao>
      )}
      <ResultadoConsulta consulta={consulta} rotuloCarga="Carregando a galeria">
        {(albuns) =>
          albuns.length === 0 ? (
            <EstadoVazio
              titulo="Nenhuma foto ainda."
              acao={
                <Link to={enviar} className={estiloBotaoLink}>
                  Enviar primeiras fotos
                </Link>
              }
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {albuns.map((album) => (
                  <CartaoAlbum key={album.id} album={album} />
                ))}
              </ul>
              <Link to={enviar} className={estiloBotaoLink}>
                <Camera aria-hidden className="size-5" />
                Enviar fotos
              </Link>
            </>
          )
        }
      </ResultadoConsulta>
    </div>
  )
}
