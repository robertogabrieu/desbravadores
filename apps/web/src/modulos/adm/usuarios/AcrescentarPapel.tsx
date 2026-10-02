import type { Papel } from '@desbravadores/shared'
import { useId, useRef, useState } from 'react'
import type { FormEvent, MutableRefObject } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAcrescentarVinculo } from '../../../api/usuarios'
import type { NovoVinculo, Usuario } from '../../../api/usuarios'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Carregando, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { RodapeDoFormulario } from '../../../ui/RodapeDoFormulario'
import { useVoltar } from '../navegacao'
import { ComUsuario } from './FichaUsuario'
import { EscolhaDoEscopo } from './EscolhaDoEscopo'
import { EscolhaDoPapel } from './EscolhaDoPapel'
import { useOpcoesDoEscopo } from './escopo'
import { ESCOPO_VAZIO, entradaDoVinculo, mensagemDeErro, papelDaUrl, papelNoGenero, primeiroNome, rascunhoVazio, urlDoPapel } from './vinculos'

const TODOS_OS_PAPEIS: Papel[] = ['ADM', 'CONSELHEIRO', 'INSTRUTOR']

const PERGUNTA_DO_ESCOPO = {
  CONSELHEIRO: (nome: string) => `Que unidades ${nome} vai acompanhar?`,
  INSTRUTOR: (nome: string) => `Que classes ${nome} vai instruir?`,
} as const

/** O papel que o passo 2 devolveu no estado do histórico, para o passo 1 abrir com ele marcado. */
function papelDoEstado(estado: unknown): Papel | null {
  const papel = typeof estado === 'object' && estado !== null && 'papelEscolhido' in estado ? estado.papelEscolhido : null
  return TODOS_OS_PAPEIS.find((candidato) => candidato === papel) ?? null
}

interface PropriedadesDoPasso {
  usuario: Usuario
  /** O que a ficha leva para devolver a lista de onde veio; viaja em todos os links e no navegar final. */
  estadoDaFicha: { voltarPara: string; voltarRotulo: string }
  /** Ligado enquanto grava: a ficha já mostra o papel novo e a tela não deve mandar a pessoa de volta ao passo 1. */
  gravando: MutableRefObject<boolean>
}

export const AcrescentarPapel = () => <ComUsuario aoCarregar={(usuario) => <PaginaDeAcrescentar usuario={usuario} />} />

function PaginaDeAcrescentar({ usuario }: { usuario: Usuario }) {
  const [parametros] = useSearchParams()
  const voltarDaFicha = useVoltar({ para: '/adm/usuarios', rotulo: 'Usuários' })
  const estadoDaFicha = { voltarPara: voltarDaFicha.para, voltarRotulo: voltarDaFicha.rotulo }
  const gravando = useRef(false)
  const papel = papelDaUrl(parametros.get('papel'))
  const jaTem = usuario.vinculos.filter((v) => v.ativo).map((v) => v.papel)
  const passo1 = `/adm/usuarios/${usuario.id}/papeis/novo`

  const papelInvalido = papel === null || papel === 'ADM' || jaTem.includes(papel)
  if (parametros.has('papel') && papelInvalido && !gravando.current) return <Navigate to={passo1} replace state={estadoDaFicha} />

  const voltar = { para: `/adm/usuarios/${usuario.id}`, rotulo: usuario.nome, estado: estadoDaFicha }
  const propriedades = { usuario, estadoDaFicha, gravando }
  if (papel === null || papel === 'ADM') return <PassoDoPapel {...propriedades} voltar={voltar} jaTem={jaTem} />
  return <PassoDoEscopo {...propriedades} voltar={voltar} papel={papel} passo1={passo1} />
}

type Voltar = { para: string; rotulo: string; estado: object }

function PassoDoPapel({ usuario, estadoDaFicha, gravando, voltar, jaTem }: PropriedadesDoPasso & { voltar: Voltar; jaTem: Papel[] }) {
  const navegar = useNavigate()
  const estadoDoPasso = useLocation().state
  const acrescentar = useAcrescentarVinculo()
  const [escolhido, setEscolhido] = useState<Papel | null>(() => {
    const doEstado = papelDoEstado(estadoDoPasso)
    return doEstado !== null && !jaTem.includes(doEstado) ? doEstado : null
  })
  const [erro, setErro] = useState<string>()
  const idErro = useId()
  const nome = primeiroNome(usuario.nome)
  const temTodos = TODOS_OS_PAPEIS.every((papel) => jaTem.includes(papel))

  async function continuar(evento: FormEvent) {
    evento.preventDefault()
    setErro(undefined)
    if (escolhido === null) return setErro('Escolha um papel para continuar.')
    if (escolhido !== 'ADM') return void navegar({ search: `?papel=${urlDoPapel(escolhido)}` }, { state: estadoDaFicha })
    gravando.current = true
    try {
      await acrescentar.mutateAsync({ usuarioId: usuario.id, corpo: entradaDoVinculo(rascunhoVazio('ADM')) })
      void navegar(voltar.para, { replace: true, state: estadoDaFicha })
    } catch (falha) {
      gravando.current = false
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDaPagina voltar={voltar} sobretitulo="Acrescentar papel · passo 1 de 2" titulo={`Que papel ${nome} vai ter?`} />
      {temTodos ? (
        <p className="text-base text-texto-2">{nome} já tem todos os papéis</p>
      ) : (
        <form onSubmit={(evento) => void continuar(evento)} className="flex flex-col gap-4">
          <EscolhaDoPapel escolhido={escolhido} aoEscolher={setEscolhido} jaTem={jaTem} />
          {erro && (
            <p id={idErro} role="alert" className="text-sm font-medium text-perigo">
              {erro}
            </p>
          )}
          <RodapeDoFormulario cancelar={{ para: voltar.para, estado: estadoDaFicha }} rotuloSalvar={escolhido === 'ADM' ? 'Salvar' : 'Continuar'} salvando={acrescentar.isPending} />
        </form>
      )}
    </div>
  )
}

function PassoDoEscopo({ usuario, estadoDaFicha, gravando, voltar, papel, passo1 }: PropriedadesDoPasso & { voltar: Voltar; papel: 'CONSELHEIRO' | 'INSTRUTOR'; passo1: string }) {
  const navegar = useNavigate()
  const acrescentar = useAcrescentarVinculo()
  const opcoes = useOpcoesDoEscopo(papel)
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [erro, setErro] = useState<string>()
  const grupo = useRef<HTMLDivElement>(null)
  const idErro = useId()
  const nome = primeiroNome(usuario.nome)

  if (opcoes.estado === 'erro') return <ErroDeCarga erro={opcoes.erro instanceof Error ? opcoes.erro : null} aoTentarDeNovo={opcoes.refazer} />
  if (opcoes.estado === 'carregando') return <Carregando rotulo="Carregando as opções" />

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (escolhidos.length === 0) {
      setErro(ESCOPO_VAZIO[papel])
      grupo.current?.focus()
      return
    }
    setErro(undefined)
    const rascunho = { ...rascunhoVazio(papel), ...(papel === 'CONSELHEIRO' ? { unidadeIds: escolhidos } : { classeIds: escolhidos }) }
    const corpo: NovoVinculo = entradaDoVinculo(rascunho)
    gravando.current = true
    try {
      await acrescentar.mutateAsync({ usuarioId: usuario.id, corpo })
      void navegar(voltar.para, { replace: true, state: estadoDaFicha })
    } catch (falha) {
      gravando.current = false
      setErro(mensagemDeErro(falha))
    }
  }

  const sobretitulo = `Acrescentar papel · passo 2 de 2 · ${papelNoGenero(papel, usuario.genero)}`
  const escolha = (
    <EscolhaDoEscopo ref={grupo} papel={papel} grupos={opcoes.grupos} escolhidos={escolhidos} aoMudar={setEscolhidos} idErro={erro ? idErro : undefined} />
  )

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoDaPagina voltar={voltar} sobretitulo={sobretitulo} titulo={PERGUNTA_DO_ESCOPO[papel](nome)} />
      {opcoes.grupos.length === 0 ? (
        escolha
      ) : (
        <form onSubmit={(evento) => void salvar(evento)} className="flex flex-col gap-5">
          {escolha}
          <p className="text-sm text-texto-2">{`${nome} começa com as permissões de ${papelNoGenero(papel, usuario.genero).toLowerCase()}. Dá para ajustar depois, em Alterar.`}</p>
          {erro && (
            <p id={idErro} role="alert" className="text-sm font-medium text-perigo">
              {erro}
            </p>
          )}
          <RodapeDoFormulario cancelar={{ para: passo1, estado: { ...estadoDaFicha, papelEscolhido: papel } }} rotuloCancelar="Voltar" salvando={acrescentar.isPending} />
        </form>
      )}
    </div>
  )
}
