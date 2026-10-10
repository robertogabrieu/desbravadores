import { EntrarNoLink } from '@desbravadores/shared'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { z } from 'zod'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Cartao } from '../../ui/Cartao'
import { dataPorExtenso } from '../adm/formatos'
import { MolduraDoLink, hora, tituloDoLink } from './EstadosDoLink'
import type { SobreOLink } from './EstadosDoLink'

type Corpo = z.infer<typeof EntrarNoLink>

const NomeDoSubstituto = EntrarNoLink.shape.nome.unwrap()
const MENSAGEM_DO_NOME = 'Escreva seu nome e sobrenome'

interface Propriedades {
  sobre: SobreOLink
  /** Nome da conta reconhecida neste navegador (S3); nulo leva direto a S2. */
  conta: { nome: string } | null
  /** Recusa com estado do link é do pai (troca a tela); outra falha volta lançada, e a tela mostra a mensagem. */
  aoEntrar: (corpo: Corpo) => Promise<void>
}

/** S2 (o nome) ou S3 (a conta do navegador): uma pergunta, e o link fica preso a este celular. */
export function IdentificarSubstituto({ sobre, conta, aoEntrar }: Propriedades) {
  const [usarConta, setUsarConta] = useState(conta !== null)
  const [enviando, setEnviando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const comecar = sobre.tipo === 'CHAMADA' ? 'Começar a chamada' : 'Começar o registro da classe'

  const entrar = async (corpo: Corpo) => {
    setEnviando(true)
    setFalha(null)
    try {
      await aoEntrar(corpo)
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : 'Não foi possível entrar agora. Tente de novo.')
      setEnviando(false)
    }
  }

  return (
    <MolduraDoLink titulo={tituloDoLink(sobre)}>
      <p className="text-base font-semibold text-texto-2">
        {dataPorExtenso(sobre.data)} · até {hora(sobre.fimEm, sobre.fuso)}
      </p>
      {usarConta && conta ? (
        <ComConta nome={conta.nome} tipo={sobre.tipo} comecar={comecar} enviando={enviando} aoComecar={() => void entrar({ usarConta: true })} aoNaoSou={() => setUsarConta(false)} />
      ) : (
        <PeloNome tipo={sobre.tipo} comecar={comecar} enviando={enviando} aoComecar={(nome) => void entrar({ nome })} />
      )}
      {falha && (
        <p role="alert" className="text-base font-semibold text-perigo">
          {falha}
        </p>
      )}
    </MolduraDoLink>
  )
}

function ComConta({
  nome,
  tipo,
  comecar,
  enviando,
  aoComecar,
  aoNaoSou,
}: {
  nome: string
  tipo: SobreOLink['tipo']
  comecar: string
  enviando: boolean
  aoComecar: () => void
  aoNaoSou: () => void
}) {
  const primeiroNome = nome.split(' ')[0]
  return (
    <>
      <Cartao className="flex flex-col gap-1">
        <p className="text-base text-texto-2">Você vai lançar como</p>
        <h2 className="font-titulo text-xl font-bold text-texto">{nome}</h2>
        <p className="mt-2 text-base text-texto-2">
          Seus papéis no app não mudam. {tipo === 'CHAMADA' ? 'Esta chamada fica separada' : 'Este registro da classe fica separado'} do que você já faz.
        </p>
      </Cartao>
      <div className="flex flex-col gap-2">
        <Botao largura="total" carregando={enviando} onClick={aoComecar}>
          {comecar}
        </Botao>
        <Botao variante="texto" largura="total" disabled={enviando} onClick={aoNaoSou}>
          Não sou {primeiroNome}
        </Botao>
      </div>
    </>
  )
}

function PeloNome({ tipo, comecar, enviando, aoComecar }: { tipo: SobreOLink['tipo']; comecar: string; enviando: boolean; aoComecar: (nome: string) => void }) {
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | undefined>(undefined)

  const conferir = (): string | null => {
    const lido = NomeDoSubstituto.safeParse(nome)
    setErro(lido.success ? undefined : MENSAGEM_DO_NOME)
    return lido.success ? lido.data : null
  }

  const enviar = (evento: FormEvent) => {
    evento.preventDefault()
    const valido = conferir()
    if (valido) aoComecar(valido)
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
      <Campo
        rotulo="Qual é o seu nome?"
        ajuda={`Ex.: Ana Souza. Ele fica registrado ${tipo === 'CHAMADA' ? 'na chamada' : 'no registro da classe'} como quem lançou.`}
        placeholder="Seu nome e sobrenome"
        autoComplete="name"
        value={nome}
        onChange={(evento) => setNome(evento.target.value)}
        onBlur={() => void conferir()}
        erro={erro}
      />
      <Botao type="submit" largura="total" carregando={enviando}>
        {comecar}
      </Botao>
    </form>
  )
}
