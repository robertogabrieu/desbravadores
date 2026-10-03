import { Flag, GraduationCap, Shield } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogoPermissao } from '../../../api/leitura'
import type { Usuario, VinculoUsuario } from '../../../api/usuarios'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { Selo } from '../../../ui/Selo'
import type { EstadoDaFicha } from '../navegacao'
import { contarAjustes, escopoDoPapel, frasesDosAjustes, papelNoGenero, textoDoSelo } from './vinculos'

const ICONE_DO_PAPEL: Record<VinculoUsuario['papel'], ComponentType<{ 'aria-hidden': boolean; className: string }>> = {
  ADM: Shield,
  CONSELHEIRO: Flag,
  INSTRUTOR: GraduationCap,
}

interface Propriedades {
  usuarioId: string
  vinculo: VinculoUsuario
  genero: Usuario['genero']
  catalogo: CatalogoPermissao[]
  estadoDeVolta: EstadoDaFicha
  aoRemover: () => void
}

/** Um papel ativo da pessoa: escopo, selo de ajustes e as ações Alterar (fora o Adm) e Remover papel. */
export function CartaoDoPapel({ usuarioId, vinculo, genero, catalogo, estadoDeVolta, aoRemover }: Propriedades) {
  const idTitulo = `papel-${vinculo.id}`
  const Icone = ICONE_DO_PAPEL[vinculo.papel]
  const ajustes = contarAjustes(vinculo, catalogo)
  return (
    <Cartao role="region" aria-labelledby={idTitulo} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-botao bg-marca-suave text-marca">
          <Icone aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 grow flex-col gap-1">
          <h3 id={idTitulo} className="font-titulo text-xl font-bold">
            {papelNoGenero(vinculo.papel, genero)}
          </h3>
          <p className="text-base">{escopoDoPapel(vinculo)}</p>
          <p className="flex flex-wrap items-center gap-2 text-base text-texto-2">
            {vinculo.papel === 'ADM' ? (
              'Todas as permissões do clube'
            ) : (
              <>
                Permissões do papel <Selo tom={ajustes > 0 ? 'alerta' : 'neutro'}>{textoDoSelo(ajustes)}</Selo>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {vinculo.papel !== 'ADM' && (
            <Link to={`/adm/usuarios/${usuarioId}/papeis/${vinculo.id}`} state={estadoDeVolta} className={estiloDoBotao({ variante: 'secundario' })}>
              Alterar
            </Link>
          )}
          <Botao variante="secundario" className="text-perigo" onClick={aoRemover}>
            Remover papel
          </Botao>
        </div>
      </div>
      {vinculo.papel !== 'ADM' &&
        frasesDosAjustes(vinculo, catalogo).map((frase) => (
          <p key={frase} className="border-t border-borda pt-3 text-sm text-texto-2">
            {frase}
          </p>
        ))}
    </Cartao>
  )
}
