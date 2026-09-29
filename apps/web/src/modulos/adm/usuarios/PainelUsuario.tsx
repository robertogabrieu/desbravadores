import { useState } from 'react'
import { useAcrescentarVinculo, useCriarUsuario, useDesativarUsuario, useEditarUsuario, useEditarVinculo, useReenviarConvite } from '../../../api/usuarios'
import type { Usuario } from '../../../api/usuarios'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { Selecao } from '../../../ui/Selecao'
import { BlocoSalvavel, BlocoVinculo } from './BlocoVinculo'
import { ajustesDoRascunho, entradaDoVinculo, mensagemDeErro, rascunhoDoVinculo, rascunhoVazio } from './vinculos'
import type { RascunhoVinculo } from './vinculos'

type Genero = 'F' | 'M' | ''

const paraGenero = (valor: string): 'F' | 'M' | null => (valor === 'F' || valor === 'M' ? valor : null)

interface Propriedades {
  /** Nulo = usuário novo. */
  usuario: Usuario | null
  aoAtualizar: (usuario: Usuario) => void
  aoFechar: () => void
}

function SelecaoGenero({ valor, aoMudar, disabled }: { valor: Genero; aoMudar: (g: Genero) => void; disabled?: boolean }) {
  return (
    <Selecao rotulo="Gênero" value={valor} disabled={disabled} onChange={(evento) => aoMudar(paraGenero(evento.target.value) ?? '')}>
      <option value="">Não informado</option>
      <option value="F">Feminino</option>
      <option value="M">Masculino</option>
    </Selecao>
  )
}

/** Conteúdo da folha lateral: cadastro de um usuário novo (um Salvar) ou edição de um existente (cada bloco salva sozinho). */
export function PainelUsuario({ usuario, aoAtualizar, aoFechar }: Propriedades) {
  return usuario ? (
    <PainelExistente usuario={usuario} aoAtualizar={aoAtualizar} />
  ) : (
    <PainelNovo aoCriado={aoFechar} />
  )
}

function PainelNovo({ aoCriado }: { aoCriado: () => void }) {
  const criar = useCriarUsuario()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [genero, setGenero] = useState<Genero>('')
  const [blocos, setBlocos] = useState<{ chave: number; rascunho: RascunhoVinculo }[]>([{ chave: 1, rascunho: rascunhoVazio() }])
  const [proximaChave, setProximaChave] = useState(2)
  const [erro, setErro] = useState<string>()

  const mudarBloco = (chave: number, rascunho: RascunhoVinculo) =>
    setBlocos((atuais) => atuais.map((b) => (b.chave === chave ? { chave, rascunho } : b)))

  const salvar = async () => {
    if (!nome.trim() || !email.trim()) {
      setErro('Preencha o nome e o e-mail.')
      return
    }
    setErro(undefined)
    try {
      await criar.mutateAsync({ nome: nome.trim(), email: email.trim(), genero: paraGenero(genero), vinculos: blocos.map((b) => entradaDoVinculo(b.rascunho)) })
      aoCriado()
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
      <Botao largura="total" carregando={criar.isPending} onClick={() => void salvar()}>
        Salvar
      </Botao>
    </div>
  )
}

function PainelExistente({ usuario, aoAtualizar }: { usuario: Usuario; aoAtualizar: (usuario: Usuario) => void }) {
  const editar = useEditarUsuario()
  const desativar = useDesativarUsuario()
  const acrescentar = useAcrescentarVinculo()
  const editarVinculo = useEditarVinculo()
  const reenviar = useReenviarConvite()
  const convidado = usuario.situacao === 'CONVIDADO'
  const [nome, setNome] = useState(usuario.nome)
  const [genero, setGenero] = useState<Genero>(usuario.genero ?? '')
  const [novos, setNovos] = useState<number[]>([])
  const [proximaChave, setProximaChave] = useState(1)
  const [erro, setErro] = useState<string>()
  const [aviso, setAviso] = useState<string>()
  const [confirmando, setConfirmando] = useState(false)
  const salvos = usuario.vinculos.filter((v) => v.ativo)

  const tentar = async (acao: () => Promise<Usuario | void>, sucesso?: string) => {
    setErro(undefined)
    setAviso(undefined)
    try {
      const atualizado = await acao()
      if (atualizado) aoAtualizar(atualizado)
      setAviso(sucesso)
    } catch (falha) {
      setErro(mensagemDeErro(falha))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Campo rotulo="Nome" value={nome} disabled={!convidado} onChange={(evento) => setNome(evento.target.value)} />
      <Campo rotulo="E-mail" type="email" value={usuario.email} disabled readOnly />
      <SelecaoGenero valor={genero} aoMudar={setGenero} disabled={!convidado} />
      {convidado && (
        <div className="flex flex-wrap gap-2">
          <Botao carregando={editar.isPending} onClick={() => void tentar(() => editar.mutateAsync({ id: usuario.id, corpo: { nome: nome.trim(), genero: paraGenero(genero) } }))}>
            Salvar dados
          </Botao>
          <Botao variante="secundario" carregando={reenviar.isPending} onClick={() => void tentar(() => reenviar.mutateAsync(usuario.id), 'Convite reenviado.')}>
            Reenviar convite
          </Botao>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      {aviso && <p role="status" className="text-sm font-medium text-texto-2">{aviso}</p>}

      {salvos.map((vinculo, posicao) => (
        <BlocoSalvavel
          key={vinculo.id}
          indice={posicao + 1}
          inicial={rascunhoDoVinculo(vinculo)}
          papelTravado
          aoSalvo={aoAtualizar}
          salvar={(rascunho) =>
            editarVinculo.mutateAsync({
              vinculoId: vinculo.id,
              corpo: {
                ...(rascunho.papel === 'CONSELHEIRO' && { unidadeIds: rascunho.unidadeIds }),
                ...(rascunho.papel === 'INSTRUTOR' && { classeIds: rascunho.classeIds }),
                ajustes: ajustesDoRascunho(rascunho),
              },
            })
          }
        />
      ))}
      {novos.map((chave, posicao) => (
        <BlocoSalvavel
          key={chave}
          indice={salvos.length + posicao + 1}
          inicial={rascunhoVazio()}
          aoSalvo={(atualizado) => {
            setNovos((atuais) => atuais.filter((c) => c !== chave))
            aoAtualizar(atualizado)
          }}
          salvar={(rascunho) => acrescentar.mutateAsync({ usuarioId: usuario.id, corpo: entradaDoVinculo(rascunho) })}
        />
      ))}
      <Botao
        variante="texto"
        onClick={() => {
          setNovos((atuais) => [...atuais, proximaChave])
          setProximaChave(proximaChave + 1)
        }}
      >
        + Acrescentar papel
      </Botao>
      {salvos.length > 0 &&
        (confirmando ? (
          <div className="flex flex-col gap-2 rounded-cartao border border-perigo p-4">
            <p className="font-medium">{`Desativar ${usuario.nome} neste clube? A pessoa perde o acesso a este clube na hora.`}</p>
            <div className="flex flex-wrap gap-2">
              <Botao
                variante="perigo"
                carregando={desativar.isPending}
                onClick={() => {
                  setConfirmando(false)
                  void tentar(() => desativar.mutateAsync(usuario.id))
                }}
              >
                Desativar
              </Botao>
              <Botao variante="secundario" onClick={() => setConfirmando(false)}>
                Cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <Botao variante="perigo" onClick={() => setConfirmando(true)}>
            Desativar neste clube
          </Botao>
        ))}
    </div>
  )
}
