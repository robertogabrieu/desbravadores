import { z } from 'zod'
import { DataCivil, InstanteIso, Uuid } from './comum'
import { RefUnidade } from './auth'

/** Campo `dados` (JSON) do multipart de PUT /api/sync/fotos/:uuid; o campo `arquivo` é a imagem. */
export const FotoEnvioDados = z.object({
  versaoPayload: z.literal(1),
  album: z.discriminatedUnion('tipo', [
    /** Álbum da reunião (unidade, data): a reunião precisa existir no servidor (a fila garante a ordem). */
    z.object({ tipo: z.literal('REUNIAO'), unidadeId: Uuid, data: DataCivil }),
    /** Álbum já existente (do pacote ou criado antes por esta mesma fila). */
    z.object({ tipo: z.literal('EXISTENTE'), id: Uuid }),
    /** Álbum novo, com id gerado no aparelho; reenvio com o mesmo id reaproveita. */
    z.object({ tipo: z.literal('NOVO'), id: Uuid, unidadeId: Uuid, titulo: z.string().trim().min(1).max(80), data: DataCivil }),
  ]),
  legenda: z.string().trim().max(300).nullable(),
})
export const FotoEnvioSaida = z.object({ fotoId: Uuid, albumId: Uuid })

export const AlbumFiltro = z.object({ unidadeId: Uuid })
export const AlbumResumo = z.object({
  id: Uuid,
  titulo: z.string(),
  data: DataCivil,
  reuniaoId: Uuid.nullable(),
  totalFotos: z.number().int(),
  capaUrl: z.string().nullable(),
  enviadoPor: z.array(z.string()), // nomes distintos; a tela mostra "Thiago" ou "Thiago e mais 2"
})
// GET /api/albuns?unidadeId → AlbumResumo[] (data decrescente; só com foto não removida).
// O total do cabeçalho da galeria é a soma de totalFotos (front).
export const FotoSaida = z.object({
  id: Uuid,
  legenda: z.string().nullable(),
  enviadaPor: z.string(),
  enviadaEm: InstanteIso,
  url: z.string(),
  miniaturaUrl: z.string(),
  podeRemover: z.boolean(),
})
export const AlbumDetalhe = z.object({
  id: Uuid, titulo: z.string(), data: DataCivil, unidade: RefUnidade, reuniaoId: Uuid.nullable(),
  fotos: z.array(FotoSaida), // enviadaEm crescente; só não removidas
})
// GET /api/albuns/:id → AlbumDetalhe · DELETE /api/fotos/:id → 204
export const SemAutorizacaoSaida = z.object({ nomes: z.array(z.string()) }) // nomePublico, ordem alfabética
