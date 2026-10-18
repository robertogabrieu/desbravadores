import { NomePasskey } from '@desbravadores/shared'
import { useState } from 'react'
import { ErroDaApi } from '../../api/cliente'
import { useRemoverPasskey, usePasskeys } from '../../api/passkeys'
import type { Passkey } from '../../api/passkeys'
import { useConexao } from '../../offline'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Cartao } from '../../ui/Cartao'
import { Confirmacao } from '../../ui/Confirmacao'
import { Carregando, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Esqueleto } from '../../ui/Esqueleto'
import { esquecerAparelho, lerAparelho } from '../passkey/aparelho'
import { aparelhoPermitePasskey, foiCancelamento, nomeSugeridoDoAparelho } from '../passkey/navegador'
import { useAtivarPasskey } from '../passkey/useAtivarPasskey'

const FUSO_DO_CLUBE = 'America/Sao_Paulo'
const MOTIVO_SEM_CONEXAO = 'Sem conexão: conecte-se à internet para ativar ou remover.'
const dataCurta = (instante: string): string => new Date(instante).toLocaleDateString('pt-BR', { timeZone: FUSO_DO_CLUBE })

const mensagemDoErro = (erro: unknown): string | null => {
  if (erro instanceof ErroDaApi) return erro.erro.mensagem
  return foiCancelamento(erro) ? null : 'Não foi possível ativar neste aparelho.'
}

/** Minha conta: as digitais e rostos que entram nesta conta, para ativar mais uma ou remover. */
export function CartaoPasskeys() {
  const suporta = aparelhoPermitePasskey()
  const { modo } = useConexao()
  const semConexao = modo === 'SEM_CONEXAO'
  const lista = usePasskeys(suporta)
  const ativar = useAtivarPasskey()
  const remover = useRemoverPasskey()
  const [ativando, definirAtivando] = useState(false)
  const [senha, definirSenha] = useState('')
  const [nome, definirNome] = useState('')
  const [erroAoAtivar, definirErroAoAtivar] = useState<string | null>(null)
  const [paraRemover, definirParaRemover] = useState<Passkey | null>(null)
  const [aparelho, definirAparelho] = useState(lerAparelho)

  const abrirAtivacao = () => {
    definirSenha('')
    definirNome(nomeSugeridoDoAparelho())
    definirErroAoAtivar(null)
    definirAtivando(true)
  }

  const fecharAtivacao = () => {
    definirSenha('')
    definirAtivando(false)
  }

  const confirmarAtivacao = async () => {
    definirErroAoAtivar(null)
    try {
      await ativar.mutateAsync({ senha, nome: nome.trim() })
      definirAparelho(lerAparelho())
      fecharAtivacao()
    } catch (erro) {
      definirErroAoAtivar(mensagemDoErro(erro))
    }
  }

  const confirmarRemocao = async () => {
    if (!paraRemover) return
    try {
      await remover.mutateAsync(paraRemover.id)
      definirParaRemover(null)
    } catch {
      // O erro fica em remover.error e aparece no painel, que segue aberto.
    }
  }

  const esquecer = () => {
    esquecerAparelho()
    definirAparelho(lerAparelho())
  }

  const nomeValido = NomePasskey.safeParse(nome).success

  return (
    <Cartao className="flex flex-col gap-3">
      <h2 className="text-base font-bold text-texto">Entrar com digital ou rosto</h2>
      {!suporta ? (
        <p className="text-base text-texto-2">Este aparelho não permite entrar com digital ou rosto.</p>
      ) : lista.isPending ? (
        <Carregando rotulo="Carregando digitais">
          <Esqueleto className="h-12" />
        </Carregando>
      ) : lista.isError ? (
        <>
          <ErroDeCarga erro={lista.error} aoTentarDeNovo={() => void lista.refetch()} />
          {semConexao && <p className="text-sm text-texto-2">{MOTIVO_SEM_CONEXAO}</p>}
        </>
      ) : (
        <>
          {lista.data.itens.length === 0 ? (
            <p className="text-base text-texto-2">Entre sem digitar a senha, usando a digital, o rosto ou o bloqueio de tela deste celular.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lista.data.itens.map((passkey) => (
                <li key={passkey.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-base font-semibold break-words text-texto">{passkey.nome}</span>
                    <span className="text-sm text-texto-2">
                      Criada em {dataCurta(passkey.criadoEm)}
                      {passkey.ultimoUsoEm ? ` · usada por último em ${dataCurta(passkey.ultimoUsoEm)}` : ' · ainda não usada'}
                    </span>
                  </div>
                  <Botao
                    variante="secundario"
                    disabled={semConexao}
                    aria-label={`Remover ${passkey.nome}`}
                    onClick={() => {
                      remover.reset()
                      definirParaRemover(passkey)
                    }}
                  >
                    Remover
                  </Botao>
                </li>
              ))}
            </ul>
          )}
          <Botao variante={lista.data.itens.length === 0 ? 'primario' : 'secundario'} className="w-fit" disabled={semConexao} onClick={abrirAtivacao}>
            {lista.data.itens.length === 0 ? 'Ativar neste aparelho' : 'Ativar outra'}
          </Botao>
          {semConexao && <p className="text-sm text-texto-2">{MOTIVO_SEM_CONEXAO}</p>}
        </>
      )}
      {suporta && (aparelho.passkey || aparelho.email) && (
        <Botao variante="texto" className="w-fit" onClick={esquecer}>
          Esquecer este aparelho
        </Botao>
      )}

      <Confirmacao
        aberta={ativando}
        titulo="Ativar digital ou rosto"
        rotuloConfirmar="Ativar"
        aoCancelar={fecharAtivacao}
        aoConfirmar={() => void confirmarAtivacao()}
        ocupada={ativar.isPending}
        confirmarDesabilitado={senha === '' || !nomeValido}
        erro={erroAoAtivar}
      >
        <div className="flex flex-col gap-3">
          <Campo
            rotulo="Sua senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(evento) => definirSenha(evento.target.value)}
          />
          <Campo
            rotulo="Nome deste aparelho"
            maxLength={60}
            value={nome}
            onChange={(evento) => definirNome(evento.target.value)}
          />
        </div>
      </Confirmacao>

      <Confirmacao
        aberta={paraRemover !== null}
        titulo="Remover esta digital?"
        rotuloConfirmar="Remover"
        perigo
        ocupada={remover.isPending}
        erro={remover.isError ? (remover.error instanceof ErroDaApi ? remover.error.erro.mensagem : 'Não foi possível remover agora.') : null}
        aoCancelar={() => definirParaRemover(null)}
        aoConfirmar={() => void confirmarRemocao()}
      >
        {paraRemover && `"${paraRemover.nome}" deixa de entrar na sua conta. A sua senha continua valendo.`}
      </Confirmacao>
    </Cartao>
  )
}
