import { UserRoundPlus } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { VisaoGeral } from '../../../api/visao-geral'
import { useSessao } from '../../../sessao/useSessao'
import { Botao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { caminhoDoLink } from '../substituicao/CartaoSubstituto'

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

/** Atalho "Gerar link de substituto": só para quem gerencia usuários; escolhe a unidade ou a classe e abre a tela de geração dela. */
export function AtalhoDeSubstituto({ visao }: { visao: VisaoGeral }) {
  const { pode } = useSessao()
  const [aberto, setAberto] = useState(false)
  const idDoPainel = useId()
  if (!pode('usuario.gerenciar')) return null

  const unidades = visao.unidadesResumo.map(({ id, nome }) => ({ id, nome }))
  const classes = visao.progressoClasses.map(({ classe }) => ({ id: classe.id, nome: classe.nome }))
  const semNada = unidades.length === 0 && classes.length === 0

  return (
    <Cartao className="flex flex-col gap-3">
      <Botao variante="secundario" aria-expanded={aberto} aria-controls={idDoPainel} onClick={() => setAberto(!aberto)} className="self-start">
        <UserRoundPlus aria-hidden className="size-5" />
        Gerar link de substituto
      </Botao>
      <div id={idDoPainel} hidden={!aberto} className="flex flex-col gap-3">
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
    </Cartao>
  )
}
