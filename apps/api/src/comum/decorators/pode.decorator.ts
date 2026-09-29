import { SetMetadata } from '@nestjs/common'
import type { ChavePermissao } from '@desbravadores/shared'
import { ACESSO_PODE } from './acesso'

/** Exige vinculo ativo com a permissao (padrao do papel + ajustes lidos do banco). */
export const Pode = (permissao: ChavePermissao): MethodDecorator & ClassDecorator =>
  SetMetadata(ACESSO_PODE, permissao)
