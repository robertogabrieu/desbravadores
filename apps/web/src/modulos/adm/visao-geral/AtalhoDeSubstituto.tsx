import { UserRoundPlus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { VisaoGeral } from '../../../api/visao-geral'
import { useSessao } from '../../../sessao/useSessao'
import { Botao } from '../../../ui/Botao'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { cn } from '../../../ui/cn'
import { caminhoDoLink } from '../substituicao/CartaoSubstituto'
import { FecharDaFolha } from './FecharDaFolha'

interface Destino {
  id: string
  nome: string
}

function ListaDeDestinos({ titulo, tipo, destinos }: { titulo: string; tipo: 'unidade' | 'classe'; destinos: Destino[] }) {
  if (destinos.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-texto-2">{titulo}</h3>
      <ul className="flex flex-col">
        {destinos.map((destino) => (
          <li key={destino.id}>
            <LinhaQueNavega to={caminhoDoLink({ tipo, id: destino.id })}>
              <span className="text-base font-semibold text-texto">{destino.nome}</span>
            </LinhaQueNavega>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface Propriedades {
  visao: VisaoGeral
  className?: string
}

/** Atalho "Gerar link de substituto": só para quem gerencia usuários; a folha escolhe a unidade ou a classe e leva à tela de geração dela. */
export function AtalhoDeSubstituto({ visao, className }: Propriedades) {
  const { pode } = useSessao()
  const [aberta, setAberta] = useState(false)
  if (!pode('usuario.gerenciar')) return null

  const unidades = visao.unidadesResumo.map(({ id, nome }) => ({ id, nome }))
  // Regular e avançada são lecionadas juntas: o link é um só, o da regular.
  const classes = visao.progressoClasses
    .filter(({ classe }) => !(classe.tipo === 'AVANCADA' && classe.trilha === 'INDIVIDUAL'))
    .map(({ classe }) => ({ id: classe.id, nome: classe.nome }))
  const semNada = unidades.length === 0 && classes.length === 0
  const fechar = () => setAberta(false)

  return (
    <>
      <Botao aria-haspopup="dialog" onClick={() => setAberta(true)} className={cn('min-h-[56px]', className)}>
        <UserRoundPlus aria-hidden className="size-5" />
        Gerar link de substituto
      </Botao>
      <FolhaLateral aberta={aberta} titulo="Gerar link de substituto" aoFechar={fechar}>
        <div className="flex flex-col gap-3">
          {semNada ? (
            <p className="text-base text-texto">
              Para gerar o link, cadastre antes uma unidade ou uma classe.{' '}
              <Link to="/adm/unidades/nova" className="font-semibold text-marca underline">
                Cadastrar unidade
              </Link>
            </p>
          ) : (
            <>
              <p className="text-base text-texto">Para quem é o substituto?</p>
              <ListaDeDestinos titulo="Unidades" tipo="unidade" destinos={unidades} />
              <ListaDeDestinos titulo="Classes" tipo="classe" destinos={classes} />
            </>
          )}
        </div>
        <FecharDaFolha aoFechar={fechar} />
      </FolhaLateral>
    </>
  )
}
