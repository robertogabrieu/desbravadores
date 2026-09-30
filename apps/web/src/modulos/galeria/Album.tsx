import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAlbum, useRemoverFoto } from '../../api/fotos'
import type { DetalheAlbum } from '../../api/fotos'
import { useConexao } from '../../offline'
import { Confirmacao } from '../../ui/Confirmacao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { diaMes } from './formatos'
import { estiloBotaoLink } from './Galeria'
import { FotoCheia } from './FotoCheia'
import { ResultadoConsulta } from './ResultadoConsulta'

type Foto = DetalheAlbum['fotos'][number]

function CorpoDoAlbum({ album }: { album: DetalheAlbum }) {
  const [aberta, setAberta] = useState<number | null>(null)
  const [aRemover, setARemover] = useState<Foto | null>(null)
  const remover = useRemoverFoto()
  const enviar = `/galeria/enviar?unidade=${album.unidade.id}&album=${album.id}`

  const confirmarRemocao = () => {
    if (!aRemover) return
    remover.mutate(aRemover.id, {
      onSuccess: () => {
        setARemover(null)
        setAberta(null)
      },
      onError: (erro) => {
        setARemover(null)
        toast.error(erro.message || 'Não foi possível remover a foto.')
      },
    })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-texto-2">
          {diaMes(album.data)} · {album.unidade.nome}
        </span>
        <h1 className="font-titulo text-2xl font-bold text-texto">{album.titulo}</h1>
      </header>
      {album.fotos.length === 0 ? (
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
          <ul className="grid grid-cols-3 gap-2">
            {album.fotos.map((foto, posicao) => (
              <li key={foto.id}>
                <button type="button" aria-label={`Abrir foto ${posicao + 1}`} onClick={() => setAberta(posicao)} className="block aspect-square w-full overflow-hidden rounded-botao bg-marca-suave">
                  <img src={foto.miniaturaUrl} alt={`Foto ${posicao + 1}`} className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
          <Link to={enviar} className={estiloBotaoLink}>
            Enviar fotos
          </Link>
        </>
      )}
      {aberta !== null && <FotoCheia fotos={album.fotos} indice={aberta} aoMudar={setAberta} aoFechar={() => setAberta(null)} aoRemover={setARemover} />}
      <Confirmacao aberta={aRemover !== null} titulo="Remover esta foto?" rotuloConfirmar="Remover" perigo aoConfirmar={confirmarRemocao} aoCancelar={() => setARemover(null)}>
        A foto some do álbum e o arquivo é apagado. Isso não pode ser desfeito.
      </Confirmacao>
    </div>
  )
}

/** Um álbum (C7): grade de miniaturas, foto em tela cheia e remoção pelo autor. */
export function Album() {
  const { albumId } = useParams()
  const { modo } = useConexao()
  const consulta = useAlbum(albumId, modo === 'ONLINE')
  return (
    <ResultadoConsulta consulta={consulta} rotuloCarga="Carregando o álbum">
      {(album) => <CorpoDoAlbum album={album} />}
    </ResultadoConsulta>
  )
}
