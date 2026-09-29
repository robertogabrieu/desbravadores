import { zodResolver } from '@hookform/resolvers/zod'
import { Senha } from '@desbravadores/shared'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'

const CamposNovaSenha = z
  .object({ senha: Senha, confirmacao: z.string() })
  .refine((campos) => campos.senha === campos.confirmacao, { message: 'As senhas não são iguais', path: ['confirmacao'] })

interface Propriedades {
  rotuloBotao: string
  /** Recebe a senha já validada; devolve o texto de erro a mostrar, ou nada se deu certo. */
  aoEnviar: (senha: string) => Promise<string | undefined>
}

/** Senha + confirmação: o mesmo formulário do convite e da redefinição. */
export function FormularioNovaSenha({ rotuloBotao, aoEnviar }: Propriedades) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof CamposNovaSenha>, unknown, z.output<typeof CamposNovaSenha>>({
    resolver: zodResolver(CamposNovaSenha),
  })

  const enviar = handleSubmit(async ({ senha }) => {
    const erro = await aoEnviar(senha)
    if (erro) setError('root', { message: erro })
  })

  return (
    <form onSubmit={(evento) => void enviar(evento)} noValidate className="flex flex-col gap-4">
      <Campo rotulo="Senha" type="password" autoComplete="new-password" erro={errors.senha?.message} {...register('senha')} />
      <Campo
        rotulo="Confirme a senha"
        type="password"
        autoComplete="new-password"
        erro={errors.confirmacao?.message}
        {...register('confirmacao')}
      />
      {errors.root?.message && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {errors.root.message}
        </p>
      )}
      <Botao type="submit" largura="total" carregando={isSubmitting}>
        {rotuloBotao}
      </Botao>
    </form>
  )
}
