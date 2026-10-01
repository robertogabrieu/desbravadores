import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAcrescentarVinculo, useCriarUsuario, useEditarUsuario, useEditarVinculo } from '../../../api/usuarios'
import type { Usuario, VinculoUsuario } from '../../../api/usuarios'
import { Botao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Campo } from '../../../ui/Campo'
import { RodapeDoFormulario } from '../../../ui/RodapeDoFormulario'
import { Selecao } from '../../../ui/Selecao'
import { useVoltar, useVoltarPara } from '../navegacao'
import { BlocoVinculo } from './BlocoVinculo'
import { ComUsuario, SITUACAO } from './FichaUsuario'
import { corpoDaEdicao, entradaDoVinculo, mensagemDeErro, mesmoRascunho, rascunhoDoVinculo, rascunhoVazio } from './vinculos'
import type { RascunhoVinculo } from './vinculos'

type Genero = 'F' | 'M' | ''

const paraGenero = (valor: string): 'F' | 'M' | null => (valor === 'F' || valor === 'M' ? valor : null)

interface BlocoNovo {
  chave: number
  rascunho: RascunhoVinculo
}

function SelecaoGenero({ valor, aoMudar, disabled, ajuda }: { valor: Genero; aoMudar: (g: Genero) => void; disabled?: boolean; ajuda?: string }) {
  return (
    <Selecao rotulo="Gênero" value={valor} disabled={disabled} ajuda={ajuda} onChange={(evento) => aoMudar(paraGenero(evento.target.value) ?? '')}>
      <option value="">Não informado</option>
      <option value="F">Feminino</option>
      <option value="M">Masculino</option>
    </Selecao>
  )
}

/** Cadastro de um usuário novo: dados e vínculos de uma vez, um Salvar. */
export function NovoUsuario() {
  const voltarPara = useVoltarPara('/adm/usuarios')
  const navegar = useNavigate()
  const criar = useCriarUsuario()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [genero, setGenero] = useState<Genero>('')
  const [blocos, setBlocos] = useState<BlocoNovo[]>([{ chave: 1, rascunho: rascunhoVazio() }])
  const [proximaChave, setProximaChave] = useState(2)
  const [erro, setErro] = useState<string>()

  const mudarBloco = (chave: number, rascunho: RascunhoVinculo) =>
    setBlocos((atuais) => atuais.map((b) => (b.chave === chave ? { chave, rascunho } : b)))

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (!nome.trim() || !email.trim()) {
      setErro('Preencha o nome e o e-mail.')
      return
    }
    setErro(undefined)
    try {
      const criado = await criar.mutateAsync({ nome: nome.trim(), email: email.trim(), genero: paraGenero(genero), vinculos: blocos.map((b) => entradaDoVinculo(b.rascunho)) })
      void navegar(`/adm/usuarios/${criado.id}`, { replace: true, state: { voltarPara } })
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <CabecalhoDaPagina voltar={{ para: voltarPara, rotulo: 'Usuários' }} sobretitulo="Usuário" titulo="Novo usuário" />
      <form onSubmit={(evento) => void salvar(evento)} className="flex max-w-2xl flex-col gap-4">
        <Campo rotulo="Nome" value={nome} onChange={(evento) => setNome(evento.target.value)} />
        <Campo rotulo="E-mail" type="email" value={email} onChange={(evento) => setEmail(evento.target.value)} />
        <SelecaoGenero valor={genero} aoMudar={setGenero} />
        {blocos.map((bloco, posicao) => (
          <BlocoVinculo
            key={bloco.chave}
            indice={posicao + 1}
            rascunho={bloco.rascunho}
            aoMudar={(rascunho) => mudarBloco(bloco.chave, rascunho)}
            acoes={
              blocos.length > 1 ? (
                <Botao variante="secundario" onClick={() => setBlocos((atuais) => atuais.filter((b) => b.chave !== bloco.chave))}>
                  Remover papel
                </Botao>
              ) : undefined
            }
          />
        ))}
        <Botao
          variante="texto"
          className="self-start"
          onClick={() => {
            setBlocos((atuais) => [...atuais, { chave: proximaChave, rascunho: rascunhoVazio() }])
            setProximaChave(proximaChave + 1)
          }}
        >
          + Acrescentar papel
        </Botao>
        {erro && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {erro}
          </p>
        )}
        <RodapeDoFormulario cancelar={{ para: voltarPara }} salvando={criar.isPending} />
      </form>
    </div>
  )
}

/** Edição de um usuário que existe: um Salvar grava dados e vínculos alterados, em sequência, e para no primeiro erro. */
export const EditarUsuario = () => <ComUsuario aoCarregar={(usuario) => <FormularioExistente key={usuario.id} usuario={usuario} />} />

function FormularioExistente({ usuario }: { usuario: Usuario }) {
  const [parametros] = useSearchParams()
  const voltar = useVoltar({ para: '/adm/usuarios', rotulo: 'Usuários' })
  const navegar = useNavigate()
  const editar = useEditarUsuario()
  const editarVinculo = useEditarVinculo()
  const acrescentar = useAcrescentarVinculo()
  const convidado = usuario.situacao === 'CONVIDADO'
  const aFicha = { para: `/adm/usuarios/${usuario.id}`, estado: { voltarPara: voltar.para, voltarRotulo: voltar.rotulo } }
  // O que a API já tem; muda a cada gravação que deu certo.
  const [atual, setAtual] = useState(usuario)
  const [nome, setNome] = useState(usuario.nome)
  const [genero, setGenero] = useState<Genero>(usuario.genero ?? '')
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoVinculo>>({})
  const [novos, setNovos] = useState<BlocoNovo[]>(parametros.get('acrescentar') === '1' ? [{ chave: 1, rascunho: rascunhoVazio() }] : [])
  const [proximaChave, setProximaChave] = useState(2)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const ativos = atual.vinculos.filter((v) => v.ativo)
  const rascunhoDe = (vinculo: VinculoUsuario) => rascunhos[vinculo.id] ?? rascunhoDoVinculo(vinculo)

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErros({})
    setSalvando(true)
    let gravado = atual
    const passo = async (chave: string, acao: () => Promise<Usuario>) => {
      try {
        gravado = await acao()
      } catch (falha) {
        setErros({ [chave]: mensagemDeErro(falha) })
        throw falha
      }
    }
    try {
      if (convidado && (nome.trim() !== gravado.nome || paraGenero(genero) !== gravado.genero)) {
        await passo('dados', () => editar.mutateAsync({ id: usuario.id, corpo: { nome: nome.trim(), genero: paraGenero(genero) } }))
      }
      for (const vinculo of ativos) {
        if (mesmoRascunho(rascunhoDe(vinculo), rascunhoDoVinculo(vinculo))) continue
        await passo(vinculo.id, () => editarVinculo.mutateAsync({ vinculoId: vinculo.id, corpo: corpoDaEdicao(rascunhoDe(vinculo)) }))
      }
      for (const bloco of novos) {
        await passo(`novo-${bloco.chave}`, () => acrescentar.mutateAsync({ usuarioId: usuario.id, corpo: entradaDoVinculo(bloco.rascunho) }))
        setNovos((atuais) => atuais.filter((b) => b.chave !== bloco.chave))
      }
      void navegar(aFicha.para, { replace: true, state: aFicha.estado })
    } catch {
      // O erro já está no bloco que falhou; o que gravou antes dele fica gravado.
    } finally {
      setAtual(gravado)
      setSalvando(false)
    }
  }

  return (
    <>
      <CabecalhoDaPagina voltar={{ para: aFicha.para, rotulo: usuario.nome, estado: aFicha.estado }} sobretitulo={`Usuário · ${SITUACAO[usuario.situacao]}`} titulo="Editar usuário" />
      <form onSubmit={(evento) => void salvar(evento)} className="flex max-w-2xl flex-col gap-4">
        <Campo
          rotulo="Nome"
          value={nome}
          disabled={!convidado}
          ajuda={convidado ? undefined : 'Só quem ainda não aceitou o convite tem nome e gênero alterados pelo Adm.'}
          onChange={(evento) => setNome(evento.target.value)}
        />
        <Campo rotulo="E-mail" type="email" value={usuario.email} disabled readOnly />
        <SelecaoGenero valor={genero} aoMudar={setGenero} disabled={!convidado} />
        {erros['dados'] && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {erros['dados']}
          </p>
        )}

        {ativos.map((vinculo, posicao) => (
          <BlocoVinculo
            key={vinculo.id}
            indice={posicao + 1}
            rascunho={rascunhoDe(vinculo)}
            papelTravado
            erro={erros[vinculo.id]}
            aoMudar={(rascunho) => setRascunhos((atuais) => ({ ...atuais, [vinculo.id]: rascunho }))}
          />
        ))}
        {novos.map((bloco, posicao) => (
          <BlocoVinculo
            key={bloco.chave}
            indice={ativos.length + posicao + 1}
            rascunho={bloco.rascunho}
            erro={erros[`novo-${bloco.chave}`]}
            aoMudar={(rascunho) => setNovos((atuais) => atuais.map((b) => (b.chave === bloco.chave ? { chave: bloco.chave, rascunho } : b)))}
            acoes={
              <Botao variante="secundario" onClick={() => setNovos((atuais) => atuais.filter((b) => b.chave !== bloco.chave))}>
                Remover papel
              </Botao>
            }
          />
        ))}
        <Botao
          variante="texto"
          className="self-start"
          onClick={() => {
            setNovos((atuais) => [...atuais, { chave: proximaChave, rascunho: rascunhoVazio() }])
            setProximaChave(proximaChave + 1)
          }}
        >
          + Acrescentar papel
        </Botao>

        <RodapeDoFormulario cancelar={{ para: aFicha.para, estado: aFicha.estado }} rotuloSalvar="Salvar alterações" salvando={salvando} />
      </form>
    </>
  )
}
