import { zodResolver } from '@hookform/resolvers/zod'
import { LoginEntrada, NOME_SISTEMA } from '@desbravadores/shared'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { z } from 'zod'
import { useLogin } from '../../api/auth'
import { ErroDaApi } from '../../api/cliente'
import { useLoginPasskey, useOpcoesLoginPasskey } from '../../api/passkeys'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { esquecerAparelho, lerAparelho } from '../passkey/aparelho'
import { destinoAposSenha } from '../passkey/convite'
import { aparelhoPermitePasskey, assinarDesafio } from '../passkey/navegador'
import { MENSAGEM_LOGIN_RECUSADO } from './mensagens'
import { TelaAcesso } from './TelaAcesso'

/** O aviso que quem mandou para o login deixou no estado da navegação. */
const avisoDoEstado = (estado: unknown): string | undefined =>
  typeof estado === 'object' && estado !== null && 'aviso' in estado && typeof estado.aviso === 'string' ? estado.aviso : undefined

const MENSAGEM_TENTE_DE_NOVO = 'Tente de novo em instantes.'

type CamposLogin = z.input<typeof LoginEntrada>

export function Login() {
  const { entrar, dispensarAvisoDeSaida } = useSessao()
  const navegar = useNavigate()
  const local = useLocation()
  const avisoDoHistorico = avisoDoEstado(local.state)
  const [aviso, definirAviso] = useState(avisoDoHistorico)
  // Um aviso que chega com a tela já aberta entra na mesma renderização, sem esperar o efeito.
  if (avisoDoHistorico !== undefined && avisoDoHistorico !== aviso) definirAviso(avisoDoHistorico)
  const login = useLogin()
  const [recusado, definirRecusado] = useState(false)
  const opcoesDeLogin = useOpcoesLoginPasskey()
  const loginPasskey = useLoginPasskey()
  const [aparelho, definirAparelho] = useState(lerAparelho)
  const suportaPasskey = aparelhoPermitePasskey()
  // Com a marca, a tela abre só com o botão da digital; "Usar senha" (ou uma recusa do servidor) abre a senha.
  const marcado = suportaPasskey && aparelho.passkey === true
  const [usarSenha, definirUsarSenha] = useState(false)
  const [focarSenha, definirFocarSenha] = useState(false)
  const [recusaDaPasskey, definirRecusaDaPasskey] = useState<string | null>(null)
  const mostrarSenha = !marcado || usarSenha
  const {
    register,
    handleSubmit,
    setFocus,
    setValue,
    formState: { errors },
  } = useForm<CamposLogin, unknown, z.output<typeof LoginEntrada>>({
    resolver: zodResolver(LoginEntrada),
    defaultValues: { email: aparelho.email ?? '' },
  })

  useEffect(() => {
    if (!focarSenha || !mostrarSenha) return
    setFocus('senha')
    definirFocarSenha(false)
  }, [focarSenha, mostrarSenha, setFocus])

  // Lido uma vez: o aviso fica no estado local e sai do histórico e da sessão, para não voltar no F5, no
  // Voltar nem para a próxima pessoa que cair no login neste aparelho.
  useEffect(() => {
    if (avisoDoHistorico === undefined) return
    dispensarAvisoDeSaida()
    void navegar({ pathname: local.pathname, search: local.search }, { replace: true })
  }, [avisoDoHistorico, local.pathname, local.search, navegar, dispensarAvisoDeSaida])

  const enviar = handleSubmit(async (entrada) => {
    definirRecusado(false)
    try {
      const sessao = await login.mutateAsync(entrada)
      await entrar(sessao)
      void navegar(destinoAposSenha(entrada.senha), { replace: true })
    } catch {
      // Qualquer falha vira a mesma mensagem: a tela não diz se errou o e-mail ou a senha.
      definirRecusado(true)
    }
  })

  // Cancelar ou errar no celular não diz nada (o navegador não separa "cancelou" de "não achei") e a marca fica.
  // Só a recusa do servidor aparece, e leva a pessoa à senha.
  const entrarComPasskey = async () => {
    definirRecusaDaPasskey(null)
    try {
      const { desafioId, opcoes } = await opcoesDeLogin.mutateAsync()
      const resposta = await assinarDesafio(opcoes)
      await entrar(await loginPasskey.mutateAsync({ desafioId, resposta }))
      void navegar('/', { replace: true })
    } catch (erro) {
      if (!(erro instanceof ErroDaApi)) return
      if (erro.erro.codigo !== 'CREDENCIAIS') {
        // Limite de tentativas traz a mensagem da API; o resto (servidor, rede) nao diz nada sobre a digital.
        definirRecusaDaPasskey(erro.status === 429 ? erro.erro.mensagem : MENSAGEM_TENTE_DE_NOVO)
        return
      }
      definirRecusaDaPasskey(erro.erro.mensagem)
      definirUsarSenha(true)
      definirFocarSenha(true)
    }
  }

  const esquecer = () => {
    esquecerAparelho()
    definirAparelho(lerAparelho())
    setValue('email', '')
    definirUsarSenha(false)
  }

  const botaoDaPasskey = suportaPasskey && (
    <Botao
      variante={marcado ? 'primario' : 'secundario'}
      largura="total"
      carregando={opcoesDeLogin.isPending || loginPasskey.isPending}
      onClick={() => void entrarComPasskey()}
    >
      Entrar com digital ou rosto
    </Botao>
  )

  return (
    <TelaAcesso titulo={NOME_SISTEMA} subtitulo="Secretaria de unidade, classes e ranking em um só lugar.">
      {aviso && (
        <p role="status" className="text-base font-medium text-texto-2">
          {aviso}
        </p>
      )}
      <form onSubmit={(evento) => void enviar(evento)} noValidate className="flex flex-col gap-4">
        <Campo rotulo="E-mail" type="email" autoComplete="username" erro={errors.email?.message} {...register('email')} />
        {marcado && botaoDaPasskey}
        {recusaDaPasskey && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {recusaDaPasskey}
          </p>
        )}
        {mostrarSenha && (
          <>
            <Campo rotulo="Senha" type="password" autoComplete="current-password" erro={errors.senha?.message} {...register('senha')} />
            {recusado && (
              <p role="alert" className="text-sm font-medium text-perigo">
                {MENSAGEM_LOGIN_RECUSADO}
              </p>
            )}
            <Link to="/senha/esqueci" className="min-h-[var(--touch-min)] content-center text-base font-semibold text-marca">
              Esqueci minha senha
            </Link>
            <Botao type="submit" variante={marcado ? 'secundario' : 'primario'} largura="total" carregando={login.isPending}>
              Entrar
            </Botao>
          </>
        )}
        {marcado && (
          <div className="flex flex-col gap-1">
            <Botao
              variante="texto"
              onClick={() => {
                definirUsarSenha(true)
                definirFocarSenha(true)
              }}
            >
              Usar senha
            </Botao>
            <Botao variante="texto" onClick={esquecer}>
              Esquecer este aparelho
            </Botao>
          </div>
        )}
        {!marcado && botaoDaPasskey}
        <p className="text-sm text-texto-2">Seu perfil de acesso é definido pela diretoria do clube.</p>
      </form>
    </TelaAcesso>
  )
}
