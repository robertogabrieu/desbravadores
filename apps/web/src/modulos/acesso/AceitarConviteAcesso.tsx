import { zodResolver } from '@hookform/resolvers/zod'
import { Email, Senha } from '@desbravadores/shared'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ErroDaApi } from '../../api/cliente'
import { useAceitarConviteAcesso, useConvitePublico } from '../../api/convite-acesso'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { descricaoDoPapelDoConvite } from '../adm/desbravadores/mensagem-convite'
import {
  MENSAGEM_CONTA_INATIVA,
  MENSAGEM_CONTA_PENDENTE,
  MENSAGEM_CONVITE_VENCIDO,
  MENSAGEM_LOGIN_RECUSADO,
  tokenRecusado,
} from './mensagens'
import { TelaAcesso } from './TelaAcesso'

const camposBase = z.object({ email: Email, confirmacaoEmail: z.string(), senha: z.string(), confirmacao: z.string() })
const emailsIguais = (campos: z.output<typeof camposBase>): boolean => campos.email === campos.confirmacaoEmail.trim().toLowerCase()
const MENSAGEM_EMAILS = { message: 'Os e-mails não são iguais', path: ['confirmacaoEmail'] }

/** Conta que existe mas não aceita senha por este link: a tela diz a saída em vez de pedir a senha. */
const MENSAGEM_DA_CONTA_RECUSADA: Partial<Record<string, string>> = {
  CONTA_PENDENTE: MENSAGEM_CONTA_PENDENTE,
  CONTA_INATIVA: MENSAGEM_CONTA_INATIVA,
}

/** Conta nova: senha pela regra do app e confirmada. */
const CamposContaNova = camposBase
  .extend({ senha: Senha })
  .refine(emailsIguais, MENSAGEM_EMAILS)
  .refine((campos) => campos.senha === campos.confirmacao, { message: 'As senhas não são iguais', path: ['confirmacao'] })

/** Conta que já existe: só a senha que a pessoa já usa. */
const CamposContaExistente = camposBase
  .extend({ senha: z.string().min(1, 'Digite a senha que você usa') })
  .refine(emailsIguais, MENSAGEM_EMAILS)

type Entrada = z.input<typeof camposBase>
type Saida = z.output<typeof camposBase>

export function AceitarConviteAcesso() {
  const { token = '' } = useParams()
  const convite = useConvitePublico(token)

  if (convite.isPending) {
    return (
      <TelaAcesso titulo="Criar meu acesso">
        <Carregando rotulo="Carregando convite" />
      </TelaAcesso>
    )
  }
  if (convite.isError) {
    return (
      <TelaAcesso titulo="Criar meu acesso">
        {tokenRecusado(convite.error) ? (
          <p role="alert" className="text-base font-semibold text-perigo">
            {MENSAGEM_CONVITE_VENCIDO}
          </p>
        ) : (
          <ErroDeCarga erro={convite.error} aoTentarDeNovo={() => void convite.refetch()} />
        )}
      </TelaAcesso>
    )
  }
  const { clube, nome, sexo } = convite.data
  return (
    <TelaAcesso
      titulo="Criar meu acesso"
      subtitulo={`O ${clube} convidou você, ${nome}, para ser ${descricaoDoPapelDoConvite(convite.data, sexo)}.`}
    >
      <FormularioDoAcesso token={token} />
    </TelaAcesso>
  )
}

function FormularioDoAcesso({ token }: { token: string }) {
  const { entrar } = useSessao()
  const navegar = useNavigate()
  const aceitar = useAceitarConviteAcesso(token)
  const [contaExistente, setContaExistente] = useState(false)
  // O resolver lê o modo pela ref: o useForm guarda as opções da primeira renderização.
  const modo = useRef(false)
  const resolver: Resolver<Entrada, unknown, Saida> = (valores, contexto, opcoes) =>
    (modo.current ? zodResolver(CamposContaExistente) : zodResolver(CamposContaNova))(valores, contexto, opcoes)
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Entrada, unknown, Saida>({ resolver })

  const enviar = handleSubmit(async ({ email, senha }) => {
    try {
      await entrar(await aceitar.mutateAsync({ email, senha }))
      void navegar('/', { replace: true })
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.erro.codigo === 'CONTA_EXISTENTE') {
        if (modo.current) {
          setError('root', { message: MENSAGEM_LOGIN_RECUSADO })
          return
        }
        modo.current = true
        setContaExistente(true)
        setValue('senha', '')
        return
      }
      const contaRecusada = erro instanceof ErroDaApi ? MENSAGEM_DA_CONTA_RECUSADA[erro.erro.codigo] : undefined
      if (contaRecusada) {
        setError('root', { message: contaRecusada })
        return
      }
      if (tokenRecusado(erro)) {
        setError('root', { message: MENSAGEM_CONVITE_VENCIDO })
        return
      }
      const campoSenha = erro instanceof ErroDaApi ? erro.erro.campos?.['senha'] : undefined
      if (campoSenha) setError('senha', { message: campoSenha })
      else setError('root', { message: erro instanceof ErroDaApi ? erro.message : 'Não foi possível concluir agora. Tente de novo.' })
    }
  })

  return (
    <form onSubmit={(evento) => void enviar(evento)} noValidate className="flex flex-col gap-4">
      <Campo rotulo="E-mail" type="email" autoComplete="username" erro={errors.email?.message} {...register('email')} />
      <Campo rotulo="Confirme o e-mail" type="email" autoComplete="off" erro={errors.confirmacaoEmail?.message} {...register('confirmacaoEmail')} />
      {contaExistente && (
        <p role="status" className="text-base font-semibold text-texto">
          Você já tem conta. Digite a senha que você usa.
        </p>
      )}
      <Campo
        rotulo="Senha"
        type="password"
        autoComplete={contaExistente ? 'current-password' : 'new-password'}
        erro={errors.senha?.message}
        {...register('senha')}
      />
      {!contaExistente && (
        <Campo rotulo="Confirme a senha" type="password" autoComplete="new-password" erro={errors.confirmacao?.message} {...register('confirmacao')} />
      )}
      {errors.root?.message && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {errors.root.message}
        </p>
      )}
      <Botao type="submit" largura="total" carregando={isSubmitting}>
        {contaExistente ? 'Entrar e aceitar o convite' : 'Criar meu acesso'}
      </Botao>
    </form>
  )
}
