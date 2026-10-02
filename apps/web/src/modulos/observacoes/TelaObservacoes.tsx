import { ChevronLeft, Send } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import { hojeDoClube } from '../../api/desbravadores'
import { useAulas } from '../../api/aulas'
import type { AlvoDaObservacao, Observacao } from '../../api/observacoes'
import { useApagarObservacao, useCriarObservacao, useEditarObservacao, useObservacoes } from '../../api/observacoes'
import { useProgressoClasse } from '../../api/progresso'
import { useConexao } from '../../offline'
import { Abas } from '../../ui/Abas'
import { AreaTexto } from '../../ui/AreaTexto'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Cartao } from '../../ui/Cartao'
import { Confirmacao } from '../../ui/Confirmacao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Selecao } from '../../ui/Selecao'
import { Selo } from '../../ui/Selo'
import { ChipsDeClasse, useClasseEscolhida } from '../progresso/ChipsDeClasse'
import { diaEHora, diaEMesCurto } from '../progresso/formatos'

const MENSAGEM_PADRAO = 'Não foi possível concluir agora. Tente de novo.'
const mensagemDe = (erro: Error | null): string => (erro instanceof ErroDaApi ? erro.erro.mensagem : MENSAGEM_PADRAO)

const ABAS = [
  { id: 'AULA', rotulo: 'Por aula' },
  { id: 'DBV', rotulo: 'Por DBV' },
]

function CartaoObservacao({ observacao, aoApagar }: { observacao: Observacao; aoApagar: () => void }) {
  const editar = useEditarObservacao()
  const [editando, definirEditando] = useState(false)
  const [titulo, definirTitulo] = useState(observacao.titulo ?? '')
  const [texto, definirTexto] = useState(observacao.texto)
  const etiqueta = observacao.alvo === 'AULA' && observacao.aula ? `Aula · ${diaEMesCurto(observacao.aula.data)}` : (observacao.dbv?.nome ?? '')

  const salvar = (evento: FormEvent) => {
    evento.preventDefault()
    editar.mutate({ id: observacao.id, titulo: titulo.trim() === '' ? null : titulo.trim(), texto }, { onSuccess: () => definirEditando(false) })
  }

  return (
    <Cartao className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Selo tom={observacao.alvo === 'AULA' ? 'alerta' : 'neutro'}>
          <span>{etiqueta}</span>
        </Selo>
        <span className="text-sm text-texto-2">{`${observacao.autor} · ${diaEHora(observacao.criadaEm)}${observacao.editadaEm ? ' · editada' : ''}`}</span>
      </div>
      {editando ? (
        <form onSubmit={salvar} className="flex flex-col gap-3">
          <Campo rotulo="Título (opcional)" value={titulo} maxLength={80} onChange={(e) => definirTitulo(e.target.value)} />
          <AreaTexto rotulo="Editar observação" value={texto} maxLength={4000} onChange={(e) => definirTexto(e.target.value)} />
          {editar.isError && <p role="alert" className="text-sm font-medium text-perigo">{mensagemDe(editar.error)}</p>}
          <div className="flex gap-2">
            <Botao type="submit" carregando={editar.isPending} disabled={texto.trim() === ''}>Salvar</Botao>
            <Botao variante="secundario" onClick={() => definirEditando(false)}>Cancelar</Botao>
          </div>
        </form>
      ) : (
        <>
          {observacao.titulo && <span className="text-base font-bold text-texto">{observacao.titulo}</span>}
          <p className="whitespace-pre-line text-base text-texto">{observacao.texto}</p>
          {(observacao.podeEditar || observacao.podeApagar) && (
            <div className="flex gap-2">
              {observacao.podeEditar && <Botao variante="texto" onClick={() => definirEditando(true)}>Editar</Botao>}
              {observacao.podeApagar && <Botao variante="texto" onClick={aoApagar}>Apagar</Botao>}
            </div>
          )}
        </>
      )}
    </Cartao>
  )
}

function FormularioNovaObservacao({ classeId }: { classeId: string }) {
  const aulas = useAulas(classeId)
  const progresso = useProgressoClasse(classeId)
  const criar = useCriarObservacao()
  const [alvo, definirAlvo] = useState<AlvoDaObservacao>('AULA')
  const [aulaEscolhida, definirAulaEscolhida] = useState<string | null>(null)
  const [dbvId, definirDbvId] = useState('')
  const [titulo, definirTitulo] = useState('')
  const [texto, definirTexto] = useState('')
  const [erro, definirErro] = useState<string | undefined>()

  const hoje = hojeDoClube()
  const aulasRegistradas = aulas.data ?? []
  const aulaPadrao = aulasRegistradas.find((aula) => aula.data === hoje) ?? aulasRegistradas[0]
  const aulaId = aulaEscolhida ?? aulaPadrao?.id ?? ''
  const desbravadores = progresso.data?.itens ?? []

  const salvar = (evento: FormEvent) => {
    evento.preventDefault()
    if (texto.trim() === '') return definirErro('Escreva a observação.')
    if (alvo === 'AULA' && aulaId === '') return definirErro('Escolha a aula.')
    if (alvo === 'DBV' && dbvId === '') return definirErro('Escolha o desbravador.')
    definirErro(undefined)
    criar.mutate(
      {
        classeId,
        alvo,
        registroAulaId: alvo === 'AULA' ? aulaId : null,
        dbvId: alvo === 'DBV' ? dbvId : null,
        titulo: titulo.trim() === '' ? null : titulo.trim(),
        texto,
      },
      {
        onSuccess: () => {
          definirTexto('')
          definirTitulo('')
        },
      },
    )
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-cartao border border-borda-controle bg-superficie p-4">
      <div role="radiogroup" aria-label="Sobre o quê" className="flex gap-4">
        {(['AULA', 'DBV'] as const).map((opcao) => (
          <label key={opcao} className="flex min-h-[var(--touch-min)] items-center gap-2 text-base font-semibold text-texto">
            <input type="radio" name="alvo" checked={alvo === opcao} onChange={() => definirAlvo(opcao)} className="size-5" />
            {opcao === 'AULA' ? 'Sobre uma aula' : 'Sobre um DBV'}
          </label>
        ))}
      </div>
      {alvo === 'AULA' ? (
        aulas.isPending ? (
          <p className="text-sm text-texto-2">Carregando aulas…</p>
        ) : aulasRegistradas.length === 0 ? (
          <p className="text-sm text-texto-2">Nenhuma aula registrada ainda: registre a aula para escrever sobre ela.</p>
        ) : (
          <Selecao rotulo="Aula" value={aulaId} onChange={(e) => definirAulaEscolhida(e.target.value)}>
            {aulasRegistradas.map((aula) => (
              <option key={aula.id} value={aula.id}>{aula.data === hoje ? `${diaEMesCurto(aula.data)} (hoje)` : diaEMesCurto(aula.data)}</option>
            ))}
          </Selecao>
        )
      ) : (
        <Selecao rotulo="Desbravador" value={dbvId} onChange={(e) => definirDbvId(e.target.value)}>
          <option value="">Escolha…</option>
          {desbravadores.map((item) => (
            <option key={item.dbvId} value={item.dbvId}>{item.nome}</option>
          ))}
        </Selecao>
      )}
      <Campo rotulo="Título (opcional)" value={titulo} maxLength={80} onChange={(e) => definirTitulo(e.target.value)} />
      <AreaTexto rotulo="Nova observação" rows={3} value={texto} maxLength={4000} placeholder="Escreva uma observação…" erro={erro} onChange={(e) => definirTexto(e.target.value)} />
      {criar.isError && <p role="alert" className="text-sm font-medium text-perigo">{mensagemDe(criar.error)}</p>}
      <Botao type="submit" aria-label="Salvar observação" carregando={criar.isPending} className="self-end">
        <Send aria-hidden className="size-5" />
        Salvar
      </Botao>
    </form>
  )
}

function ListaDeObservacoes({ classeId, alvo }: { classeId: string; alvo: AlvoDaObservacao }) {
  const observacoes = useObservacoes(classeId, alvo)
  const apagar = useApagarObservacao()
  const [aApagar, definirAApagar] = useState<Observacao | null>(null)
  const fecharApagar = () => {
    definirAApagar(null)
    apagar.reset()
  }

  if (observacoes.isPending) return <Carregando rotulo="Carregando observações" />
  if (observacoes.isError) return <ErroDeCarga erro={observacoes.error} aoTentarDeNovo={() => void observacoes.refetch()} />
  if (observacoes.data.length === 0) return <EstadoVazio titulo="Nenhuma observação ainda." />

  return (
    <>
      <div className="flex flex-col gap-3">
        {observacoes.data.map((observacao) => (
          <CartaoObservacao key={observacao.id} observacao={observacao} aoApagar={() => definirAApagar(observacao)} />
        ))}
      </div>
      <Confirmacao
        aberta={aApagar !== null}
        titulo="Apagar observação?"
        rotuloConfirmar="Apagar"
        perigo
        erro={apagar.isError ? mensagemDe(apagar.error) : null}
        aoCancelar={fecharApagar}
        aoConfirmar={() => {
          if (aApagar) apagar.mutate(aApagar.id, { onSuccess: fecharApagar })
        }}
      >
        O texto some para todos. Essa ação não pode ser desfeita.
      </Confirmacao>
    </>
  )
}

export function TelaObservacoes() {
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const { classes, classeId, escolher } = useClasseEscolhida()
  const [aba, definirAba] = useState<AlvoDaObservacao>('AULA')

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Link to="/inicio" aria-label="Voltar" className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-marca">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <div className="flex flex-col">
          <h1 className="font-titulo text-2xl font-extrabold text-texto">Observações</h1>
          <span className="text-sm font-semibold text-texto-2">Visível só para instrutores e Adm</span>
        </div>
      </header>
      {!online ? (
        <DisponivelComInternet />
      ) : classes.length === 0 ? (
        <EstadoVazio titulo="Você ainda não tem classes." descricao="O Adm do clube as atribui." />
      ) : (
        <>
          <ChipsDeClasse classes={classes} ativaId={classeId} aoEscolher={escolher} />
          <Abas rotulo="Agrupar" abas={ABAS} ativa={aba} aoMudar={(id) => definirAba(id === 'DBV' ? 'DBV' : 'AULA')} />
          <ListaDeObservacoes classeId={classeId} alvo={aba} />
          <FormularioNovaObservacao key={classeId} classeId={classeId} />
        </>
      )}
    </main>
  )
}
