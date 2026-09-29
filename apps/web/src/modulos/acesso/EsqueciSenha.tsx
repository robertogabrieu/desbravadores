import { zodResolver } from '@hookform/resolvers/zod'
import { EsqueciSenhaEntrada } from '@desbravadores/shared'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import type { z } from 'zod'
import { useEsqueciSenha } from '../../api/auth'
import { ErroDaApi } from '../../api/cliente'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { MENSAGEM_ESQUECI } from './mensagens'
import { TelaAcesso } from './TelaAcesso'

export function EsqueciSenha() {
  const esqueci = useEsqueciSenha()
  const [resposta, definirResposta] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof EsqueciSenhaEntrada>, unknown, z.output<typeof EsqueciSenhaEntrada>>({
    resolver: zodResolver(EsqueciSenhaEntrada),
  })

  const enviar = handleSubmit(async (entrada) => {
    try {
      await esqueci.mutateAsync(entrada)
      definirResposta(MENSAGEM_ESQUECI)
    } catch (erro) {
      definirResposta(erro instanceof ErroDaApi ? erro.message : 'Não foi possível concluir agora. Tente de novo.')
    }
  })

  return (
    <TelaAcesso titulo="Esqueci minha senha" subtitulo="Digite o e-mail da sua conta e enviamos um link para criar outra senha.">
      <form onSubmit={(evento) => void enviar(evento)} noValidate className="flex flex-col gap-4">
        <Campo rotulo="E-mail" type="email" autoComplete="username" erro={errors.email?.message} {...register('email')} />
        {resposta && (
          <p role="status" className="text-base font-medium text-texto">
            {resposta}
          </p>
        )}
        <Botao type="submit" largura="total" carregando={esqueci.isPending}>
          Enviar link
        </Botao>
        <Link to="/login" className="min-h-[var(--touch-min)] content-center text-base font-semibold text-marca">
          Voltar para entrar
        </Link>
      </form>
    </TelaAcesso>
  )
}
