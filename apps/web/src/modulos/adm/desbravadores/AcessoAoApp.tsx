import { useId, useState } from 'react'
import {
  useCancelarConviteAcesso,
  useGerarConviteAcesso,
  useSituacaoAcesso,
  type ConviteAcesso,
  type NovoConviteAcesso,
} from '../../../api/convite-acesso'
import { useClasses, useUnidades } from '../../../api/leitura'
import { useSessao } from '../../../sessao/useSessao'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { Selecao } from '../../../ui/Selecao'
import { rotuloDoPapel } from '../../acesso/papeis'
import { MENSAGEM_GENERICA, lerErroDaApi } from './erros'
import { descricaoDoPapelDoConvite, linkDoWhatsApp, mensagemDoConvite } from './mensagem-convite'

interface Propriedades {
  dbvId: string
  nome: string
}

const FUSO_DO_CLUBE = 'America/Sao_Paulo'
const dataCurta = (instante: string): string => new Date(instante).toLocaleDateString('pt-BR', { timeZone: FUSO_DO_CLUBE })
const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome

/** Seção "Acesso ao app" do painel de editar: gerar, enviar e cancelar o convite por link. */
export function AcessoAoApp({ dbvId, nome }: Propriedades) {
  const idTitulo = useId()
  const situacao = useSituacaoAcesso(dbvId)
  const [escolhendo, setEscolhendo] = useState(false)

  let conteudo = null
  if (situacao.isPending) {
    conteudo = (
      <Carregando rotulo="Carregando acesso ao app">
        <Esqueleto className="h-16" />
      </Carregando>
    )
  } else if (situacao.isError) {
    conteudo = <ErroDeCarga erro={situacao.error} aoTentarDeNovo={() => void situacao.refetch()} />
  } else if (situacao.data.conta) {
    const { email, papeis } = situacao.data.conta
    conteudo = (
      <>
        <p className="text-base text-texto">{`Tem acesso: ${email} · ${papeis.map(rotuloDoPapel).join(', ')}`}</p>
        <p className="text-sm text-texto-2">Para mudar o papel, use a tela Usuários.</p>
      </>
    )
  } else if (escolhendo) {
    conteudo = <EscolhaDoConvite dbvId={dbvId} aoVoltar={() => setEscolhendo(false)} aoGerar={() => setEscolhendo(false)} />
  } else if (situacao.data.convite) {
    conteudo = <ConviteAberto dbvId={dbvId} nome={nome} convite={situacao.data.convite} aoGerarOutro={() => setEscolhendo(true)} />
  } else {
    conteudo = (
      <>
        <p className="text-base text-texto-2">
          {`${primeiroNome(nome)} ainda não tem acesso ao app. Gere um link e envie pelo WhatsApp: a própria pessoa cria o acesso com e-mail e senha.`}
        </p>
        <Botao variante="secundario" className="self-start" onClick={() => setEscolhendo(true)}>
          Gerar convite de acesso
        </Botao>
      </>
    )
  }

  return (
    <section aria-labelledby={idTitulo} className="mt-6 flex flex-col gap-3 border-t border-divisor pt-6">
      <h3 id={idTitulo} className="text-lg font-bold text-texto">
        Acesso ao app
      </h3>
      {conteudo}
    </section>
  )
}

function EscolhaDoConvite({ dbvId, aoVoltar, aoGerar }: { dbvId: string; aoVoltar: () => void; aoGerar: () => void }) {
  const [papel, setPapel] = useState<NovoConviteAcesso['papel']>('CONSELHEIRO')
  const [marcados, setMarcados] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const unidades = useUnidades()
  const classes = useClasses()
  const gerar = useGerarConviteAcesso(dbvId)
  const conselheiro = papel === 'CONSELHEIRO'
  const opcoes = (conselheiro ? unidades.data : classes.data) ?? []

  function alternar(id: string, marcado: boolean) {
    setMarcados((atuais) => (marcado ? [...atuais, id] : atuais.filter((atual) => atual !== id)))
  }

  async function confirmar() {
    setErro(null)
    if (marcados.length === 0) {
      setErro(conselheiro ? 'Escolha pelo menos uma unidade.' : 'Escolha pelo menos uma classe.')
      return
    }
    const entrada: NovoConviteAcesso = conselheiro ? { papel, unidadeIds: marcados } : { papel: 'INSTRUTOR', classeIds: marcados }
    try {
      await gerar.mutateAsync(entrada)
      aoGerar()
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Selecao
        rotulo="Papel"
        value={papel}
        onChange={(e) => {
          setPapel(e.target.value === 'INSTRUTOR' ? 'INSTRUTOR' : 'CONSELHEIRO')
          setMarcados([])
        }}
      >
        <option value="CONSELHEIRO">Conselheiro</option>
        <option value="INSTRUTOR">Instrutor</option>
      </Selecao>
      <fieldset className="flex flex-col">
        <legend className="text-base font-semibold text-texto">{conselheiro ? 'De qual unidade' : 'De qual classe'}</legend>
        {opcoes.map((opcao) => (
          <CaixaMarcacao
            key={opcao.id}
            rotulo={opcao.nome}
            checked={marcados.includes(opcao.id)}
            onChange={(e) => alternar(opcao.id, e.target.checked)}
          />
        ))}
      </fieldset>
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Botao variante="texto" onClick={aoVoltar}>
          Voltar
        </Botao>
        <Botao carregando={gerar.isPending} onClick={() => void confirmar()}>
          Gerar link
        </Botao>
      </div>
    </div>
  )
}

function ConviteAberto({
  dbvId,
  nome,
  convite,
  aoGerarOutro,
}: {
  dbvId: string
  nome: string
  convite: ConviteAcesso
  aoGerarOutro: () => void
}) {
  const { vinculoAtivo } = useSessao()
  const cancelar = useCancelarConviteAcesso(dbvId)
  const [confirmando, setConfirmando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const { link } = convite

  async function copiar(texto: string) {
    setErro(null)
    try {
      await navigator.clipboard.writeText(texto)
      setAviso('Link copiado.')
    } catch {
      setErro('Não foi possível copiar. Selecione o link e copie.')
    }
  }

  async function cancelarConvite() {
    setConfirmando(false)
    setErro(null)
    try {
      await cancelar.mutateAsync()
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-texto">
        {`Convite aberto para ${descricaoDoPapelDoConvite(convite)}, vale até ${dataCurta(convite.expiraEm)}.`}
      </p>
      {link ? (
        <>
          <p className="break-all rounded-botao bg-superficie-suave p-3 text-base text-texto">{link}</p>
          <div className="flex flex-wrap gap-2">
            <a
              className={estiloDoBotao({ variante: 'primario' })}
              href={linkDoWhatsApp(mensagemDoConvite({ nome, clube: vinculoAtivo?.clube.nome ?? '', convite, link }))}
              target="_blank"
              rel="noreferrer"
            >
              Enviar pelo WhatsApp
            </a>
            <Botao variante="secundario" onClick={() => void copiar(link)}>
              Copiar link
            </Botao>
          </div>
        </>
      ) : (
        <p className="text-sm text-texto-2">O link aparece só na hora em que é gerado. Para enviar de novo, gere outro.</p>
      )}
      {aviso && (
        <p role="status" className="text-sm font-semibold text-sucesso">
          {aviso}
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao variante="secundario" onClick={aoGerarOutro}>
          Gerar outro
        </Botao>
        <Botao variante="texto" carregando={cancelar.isPending} onClick={() => setConfirmando(true)}>
          Cancelar convite
        </Botao>
      </div>
      <Confirmacao
        aberta={confirmando}
        titulo="Cancelar o convite?"
        rotuloConfirmar="Sim, cancelar convite"
        perigo
        aoConfirmar={() => void cancelarConvite()}
        aoCancelar={() => setConfirmando(false)}
      >
        O link enviado deixa de funcionar. Depois, se precisar, gere outro.
      </Confirmacao>
    </div>
  )
}
