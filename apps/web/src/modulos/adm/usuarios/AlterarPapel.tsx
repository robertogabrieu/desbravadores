import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCatalogoPermissoes } from '../../../api/leitura'
import type { CatalogoPermissao } from '../../../api/leitura'
import { useEditarVinculo } from '../../../api/usuarios'
import type { Usuario, VinculoUsuario } from '../../../api/usuarios'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Carregando, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { RodapeDoFormulario } from '../../../ui/RodapeDoFormulario'
import { useVoltar } from '../navegacao'
import { AjustesDoPapel } from './AjustesDoPapel'
import { EscolhaDoEscopo } from './EscolhaDoEscopo'
import { ComUsuario } from './FichaUsuario'
import { useOpcoesDoEscopo } from './escopo'
import { ESCOPO_VAZIO, corpoDaEdicao, mensagemDeErro, mesmoRascunho, papelNoGenero, rascunhoLimpo } from './vinculos'

type VinculoComEscopo = VinculoUsuario & { papel: 'CONSELHEIRO' | 'INSTRUTOR' }

const PAPEL_REMOVIDO = 'Este papel foi removido por outra pessoa.'

export const AlterarPapel = () => <ComUsuario aoCarregar={(usuario) => <ComVinculo usuario={usuario} />} />

/** Só papel ativo, com escopo (não Adm) e da própria pessoa tem Alterar. */
function ComVinculo({ usuario }: { usuario: Usuario }) {
  const { vinculoId = '' } = useParams()
  const vinculo = usuario.vinculos.find((v): v is VinculoComEscopo => v.id === vinculoId && v.ativo && v.papel !== 'ADM')
  if (vinculo === undefined) {
    return <EstadoNaoEncontrado registro="este papel" lista={{ para: `/adm/usuarios/${usuario.id}`, rotulo: 'Voltar para a ficha' }} />
  }
  return <ComCatalogo usuario={usuario} vinculo={vinculo} />
}

/** A tela só aparece com o catálogo e a lista de unidades ou classes lidos. */
function ComCatalogo({ usuario, vinculo }: { usuario: Usuario; vinculo: VinculoComEscopo }) {
  const catalogo = useCatalogoPermissoes()
  const opcoes = useOpcoesDoEscopo(vinculo.papel, { unidades: vinculo.unidades, classes: vinculo.classes })
  if (catalogo.isError) return <ErroDeCarga erro={catalogo.error} aoTentarDeNovo={() => void catalogo.refetch()} />
  if (opcoes.estado === 'erro') return <ErroDeCarga erro={opcoes.erro instanceof Error ? opcoes.erro : null} aoTentarDeNovo={opcoes.refazer} />
  if (!catalogo.data || opcoes.estado === 'carregando') return <Carregando rotulo="Carregando o papel" />
  return <FormularioDeAlteracao usuario={usuario} vinculo={vinculo} catalogo={catalogo.data} grupos={opcoes.grupos} />
}

interface PropriedadesDoFormulario {
  usuario: Usuario
  vinculo: VinculoComEscopo
  catalogo: CatalogoPermissao[]
  grupos: ReturnType<typeof useOpcoesDoEscopo>['grupos']
}

function FormularioDeAlteracao({ usuario, vinculo, catalogo, grupos }: PropriedadesDoFormulario) {
  const navegar = useNavigate()
  const editar = useEditarVinculo()
  const voltarDaFicha = useVoltar({ para: '/adm/usuarios', rotulo: 'Usuários' })
  const estadoDaFicha = { voltarPara: voltarDaFicha.para, voltarRotulo: voltarDaFicha.rotulo }
  const aFicha = `/adm/usuarios/${usuario.id}`
  const [inicial] = useState(() => rascunhoLimpo(vinculo, catalogo))
  const [rascunho, setRascunho] = useState(inicial)
  const [erro, setErro] = useState<string>()
  const grupo = useRef<HTMLDivElement>(null)
  const idErro = useId()
  const papel = vinculo.papel
  const escolhidos = papel === 'CONSELHEIRO' ? rascunho.unidadeIds : rascunho.classeIds
  const mudarEscolhidos = (ids: string[]) => setRascunho({ ...rascunho, ...(papel === 'CONSELHEIRO' ? { unidadeIds: ids } : { classeIds: ids }) })

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (escolhidos.length === 0) {
      setErro(ESCOPO_VAZIO[papel])
      grupo.current?.focus()
      return
    }
    setErro(undefined)
    if (mesmoRascunho(rascunho, inicial)) return void navegar(aFicha, { replace: true, state: estadoDaFicha })
    try {
      const gravado = await editar.mutateAsync({ vinculoId: vinculo.id, corpo: corpoDaEdicao(rascunho) })
      const removido = gravado.vinculos.some((v) => v.id === vinculo.id && !v.ativo)
      void navegar(aFicha, { replace: true, state: removido ? { ...estadoDaFicha, avisos: [PAPEL_REMOVIDO] } : estadoDaFicha })
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <>
      <CabecalhoDaPagina voltar={{ para: aFicha, rotulo: usuario.nome, estado: estadoDaFicha }} sobretitulo={`${usuario.nome} · Alterar papel`} titulo={papelNoGenero(papel, usuario.genero)} />
      <form onSubmit={(evento) => void salvar(evento)} className="flex max-w-2xl flex-col gap-5">
        <EscolhaDoEscopo ref={grupo} papel={papel} grupos={grupos} escolhidos={escolhidos} aoMudar={mudarEscolhidos} idErro={erro ? idErro : undefined} />
        <AjustesDoPapel rascunho={rascunho} catalogo={catalogo} aoMudar={setRascunho} />
        {erro && (
          <p id={idErro} role="alert" className="text-sm font-medium text-perigo">
            {erro}
          </p>
        )}
        <RodapeDoFormulario cancelar={{ para: aFicha, estado: estadoDaFicha }} rotuloSalvar="Salvar alterações" salvando={editar.isPending} />
      </form>
    </>
  )
}
