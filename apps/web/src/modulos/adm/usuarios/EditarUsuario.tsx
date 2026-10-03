import type { Papel } from '@desbravadores/shared'
import { useId, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useCriarUsuario, useEditarUsuario } from '../../../api/usuarios'
import type { Usuario } from '../../../api/usuarios'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Campo } from '../../../ui/Campo'
import { Carregando, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { RodapeDoFormulario } from '../../../ui/RodapeDoFormulario'
import { Selecao } from '../../../ui/Selecao'
import { useVoltar, useVoltarPara } from '../navegacao'
import { EscolhaDoEscopo } from './EscolhaDoEscopo'
import { EscolhaDoPapel } from './EscolhaDoPapel'
import { ComUsuario, SITUACAO } from './FichaUsuario'
import { useOpcoesDoEscopo } from './escopo'
import { ESCOPO_VAZIO, entradaDoVinculo, mensagemDeErro, primeiroNome, rascunhoVazio } from './vinculos'

type Genero = 'F' | 'M' | ''

const paraGenero = (valor: string): 'F' | 'M' | null => (valor === 'F' || valor === 'M' ? valor : null)

function SelecaoGenero({ valor, aoMudar }: { valor: Genero; aoMudar: (g: Genero) => void }) {
  return (
    <Selecao rotulo="Gênero" value={valor} onChange={(evento) => aoMudar(paraGenero(evento.target.value) ?? '')}>
      <option value="">Não informado</option>
      <option value="F">Feminino</option>
      <option value="M">Masculino</option>
    </Selecao>
  )
}

interface PropriedadesDoEscopoDoConvite {
  papel: 'CONSELHEIRO' | 'INSTRUTOR'
  escolhidos: string[]
  aoMudar: (ids: string[]) => void
  grupo: RefObject<HTMLDivElement | null>
  idErro?: string
}

/** O bloco de unidades ou classes (só ativas) que aparece depois do papel. */
function EscopoDoConvite({ papel, escolhidos, aoMudar, grupo, idErro }: PropriedadesDoEscopoDoConvite) {
  const opcoes = useOpcoesDoEscopo(papel)
  if (opcoes.estado === 'erro') return <ErroDeCarga erro={opcoes.erro instanceof Error ? opcoes.erro : null} aoTentarDeNovo={opcoes.refazer} />
  if (opcoes.estado === 'carregando') return <Carregando rotulo="Carregando as opções" />
  return <EscolhaDoEscopo ref={grupo} papel={papel} grupos={opcoes.grupos} escolhidos={escolhidos} aoMudar={aoMudar} idErro={idErro} />
}

/** Convite: dados, papel e escopo numa tela só, um Salvar. */
export function NovoUsuario() {
  const voltarPara = useVoltarPara('/adm/usuarios')
  const navegar = useNavigate()
  const criar = useCriarUsuario()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [genero, setGenero] = useState<Genero>('')
  const [papel, setPapel] = useState<Papel | null>(null)
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [erro, setErro] = useState<string>()
  const grupo = useRef<HTMLDivElement>(null)
  const idErro = useId()
  const quem = primeiroNome(nome) || 'a pessoa'

  const escolherPapel = (novo: Papel) => {
    setPapel(novo)
    setEscolhidos([])
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (!nome.trim() || !email.trim()) return setErro('Preencha o nome e o e-mail.')
    if (papel === null) return setErro('Escolha um papel.')
    if (papel !== 'ADM' && escolhidos.length === 0) {
      setErro(ESCOPO_VAZIO[papel])
      grupo.current?.focus()
      return
    }
    setErro(undefined)
    const rascunho = { ...rascunhoVazio(papel), ...(papel === 'CONSELHEIRO' ? { unidadeIds: escolhidos } : { classeIds: escolhidos }) }
    try {
      const criado = await criar.mutateAsync({ nome: nome.trim(), email: email.trim(), genero: paraGenero(genero), vinculos: [entradaDoVinculo(rascunho)] })
      void navegar(`/adm/usuarios/${criado.id}`, { replace: true, state: { voltarPara } })
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <CabecalhoDaPagina voltar={{ para: voltarPara, rotulo: 'Usuários' }} sobretitulo="Usuário" titulo="Novo usuário" />
      <form onSubmit={(evento) => void salvar(evento)} className="flex max-w-2xl flex-col gap-5">
        <div className="flex flex-col gap-4">
          <Campo rotulo="Nome" value={nome} onChange={(evento) => setNome(evento.target.value)} />
          <Campo rotulo="E-mail" type="email" value={email} onChange={(evento) => setEmail(evento.target.value)} />
          <SelecaoGenero valor={genero} aoMudar={setGenero} />
        </div>
        <h2 className="font-titulo text-lg font-bold text-texto">{`Que papel ${quem} vai ter?`}</h2>
        <EscolhaDoPapel escolhido={papel} aoEscolher={escolherPapel} />
        {papel !== null && papel !== 'ADM' && <EscopoDoConvite key={papel} papel={papel} escolhidos={escolhidos} aoMudar={setEscolhidos} grupo={grupo} idErro={erro ? idErro : undefined} />}
        <p className="text-sm text-texto-2">Começa com as permissões do papel. Outros papéis e ajustes, depois, na ficha.</p>
        {erro && (
          <p id={idErro} role="alert" className="text-sm font-medium text-perigo">
            {erro}
          </p>
        )}
        <RodapeDoFormulario cancelar={{ para: voltarPara }} salvando={criar.isPending} />
      </form>
    </div>
  )
}

/** Edição de nome e gênero; só de quem ainda está convidado. */
export const EditarUsuario = () => <ComUsuario aoCarregar={(usuario) => <EditarDeConvidado key={usuario.id} usuario={usuario} />} />

function EditarDeConvidado({ usuario }: { usuario: Usuario }) {
  const voltar = useVoltar({ para: '/adm/usuarios', rotulo: 'Usuários' })
  const aFicha = { para: `/adm/usuarios/${usuario.id}`, estado: { voltarPara: voltar.para, voltarRotulo: voltar.rotulo } }
  if (usuario.situacao !== 'CONVIDADO') return <Navigate to={aFicha.para} replace state={aFicha.estado} />
  return <FormularioDeConvidado usuario={usuario} aFicha={aFicha} />
}

function FormularioDeConvidado({ usuario, aFicha }: { usuario: Usuario; aFicha: { para: string; estado: object } }) {
  const navegar = useNavigate()
  const editar = useEditarUsuario()
  const [nome, setNome] = useState(usuario.nome)
  const [genero, setGenero] = useState<Genero>(usuario.genero ?? '')
  const [erro, setErro] = useState<string>()

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro(undefined)
    try {
      if (nome.trim() !== usuario.nome || paraGenero(genero) !== usuario.genero) {
        await editar.mutateAsync({ id: usuario.id, corpo: { nome: nome.trim(), genero: paraGenero(genero) } })
      }
      void navegar(aFicha.para, { replace: true, state: aFicha.estado })
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <>
      <CabecalhoDaPagina voltar={{ para: aFicha.para, rotulo: usuario.nome, estado: aFicha.estado }} sobretitulo={`Usuário · ${SITUACAO[usuario.situacao]}`} titulo="Editar usuário" />
      <form onSubmit={(evento) => void salvar(evento)} className="flex max-w-2xl flex-col gap-4">
        <Campo rotulo="Nome" value={nome} onChange={(evento) => setNome(evento.target.value)} />
        <SelecaoGenero valor={genero} aoMudar={setGenero} />
        {erro && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {erro}
          </p>
        )}
        <RodapeDoFormulario cancelar={{ para: aFicha.para, estado: aFicha.estado }} rotuloSalvar="Salvar alterações" salvando={editar.isPending} />
      </form>
    </>
  )
}
