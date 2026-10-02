import { zodResolver } from '@hookform/resolvers/zod'
import { LoginEntrada, NOME_SISTEMA } from '@desbravadores/shared'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { z } from 'zod'
import { useLogin } from '../../api/auth'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { MENSAGEM_LOGIN_RECUSADO } from './mensagens'
import { TelaAcesso } from './TelaAcesso'

/** O aviso que quem mandou para o login deixou no estado da navegação. */
const avisoDoEstado = (estado: unknown): string | undefined =>
  typeof estado === 'object' && estado !== null && 'aviso' in estado && typeof estado.aviso === 'string' ? estado.aviso : undefined

type CamposLogin = z.input<typeof LoginEntrada>

export function Login() {
  const { entrar } = useSessao()
  const navegar = useNavigate()
  const aviso = avisoDoEstado(useLocation().state)
  const login = useLogin()
  const [recusado, definirRecusado] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CamposLogin, unknown, z.output<typeof LoginEntrada>>({ resolver: zodResolver(LoginEntrada) })

  const enviar = handleSubmit(async (entrada) => {
    definirRecusado(false)
    try {
      const sessao = await login.mutateAsync(entrada)
      await entrar(sessao)
      void navegar('/', { replace: true })
    } catch {
      // Qualquer falha vira a mesma mensagem: a tela não diz se errou o e-mail ou a senha.
      definirRecusado(true)
    }
  })

  return (
    <TelaAcesso titulo={NOME_SISTEMA} subtitulo="Secretaria de unidade, classes e ranking em um só lugar.">
      {aviso && (
        <p role="status" className="text-base font-medium text-texto-2">
          {aviso}
        </p>
      )}
      <form onSubmit={(evento) => void enviar(evento)} noValidate className="flex flex-col gap-4">
        <Campo rotulo="E-mail" type="email" autoComplete="username" erro={errors.email?.message} {...register('email')} />
        <Campo rotulo="Senha" type="password" autoComplete="current-password" erro={errors.senha?.message} {...register('senha')} />
        {recusado && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {MENSAGEM_LOGIN_RECUSADO}
          </p>
        )}
        <Link to="/senha/esqueci" className="min-h-[var(--touch-min)] content-center text-base font-semibold text-marca">
          Esqueci minha senha
        </Link>
        <Botao type="submit" largura="total" carregando={login.isPending}>
          Entrar
        </Botao>
        <p className="text-sm text-texto-2">Seu perfil de acesso é definido pela diretoria do clube.</p>
      </form>
    </TelaAcesso>
  )
}
