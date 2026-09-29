import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import type { Membro } from '../../api/leitura'
import { useMembrosUnidade } from '../../api/leitura'
import { useAvisarAdmUnidadeVazia } from '../../api/pedidos'
import { LIMIAR_FREQUENCIA_ALERTA } from '../../api/reunioes'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Esqueleto } from '../../ui/Esqueleto'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Selecao } from '../../ui/Selecao'
import { cn } from '../../ui/cn'
import { BlocoErro } from '../reunioes/historico/BlocoErro'

const semAcento = (texto: string): string =>
  texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const iniciais = (nome: string): string =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join('')

const descricao = (membro: Membro): string => `${membro.classeAtual?.nome ?? 'sem classe'} · ${membro.idade} anos`

function AvisarAdm({ unidadeId }: { unidadeId: string }) {
  const avisar = useAvisarAdmUnidadeVazia()
  if (avisar.isSuccess) return <p className="font-semibold text-sucesso">Adm avisado</p>
  return (
    <div className="flex flex-col items-center gap-2">
      <Botao carregando={avisar.isPending} onClick={() => avisar.mutate(unidadeId)}>
        Avisar o Adm
      </Botao>
      {avisar.isError && (
        <p role="alert" className="text-sm font-semibold text-perigo">
          {avisar.error instanceof ErroDaApi ? avisar.error.erro.mensagem : 'Não foi possível avisar agora. Tente de novo.'}
        </p>
      )}
    </div>
  )
}

export function MinhaUnidade() {
  const { vinculoAtivo } = useSessao()
  const unidades = [...(vinculoAtivo?.unidades ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const unidade = unidades.find((u) => u.id === escolhida) ?? unidades[0]
  const membros = useMembrosUnidade(unidade?.id)
  const [busca, setBusca] = useState('')

  if (!unidade) return <EstadoVazio titulo="Você ainda não tem unidade" descricao="Avise o Adm para ligar você a uma unidade." />

  const filtrados = (membros.data ?? []).filter((m) => semAcento(m.nome).includes(semAcento(busca.trim())))

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="font-titulo text-2xl font-extrabold">{unidade.nome}</h1>
      {unidades.length > 1 && (
        <Selecao rotulo="Unidade" value={unidade.id} onChange={(evento) => setEscolhida(evento.target.value)}>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Selecao>
      )}
      {membros.isPending ? (
        <div role="status" aria-label="Carregando unidade" className="flex flex-col gap-2">
          <Esqueleto className="h-16" />
          <Esqueleto className="h-16" />
          <Esqueleto className="h-16" />
        </div>
      ) : membros.isError ? (
        <BlocoErro erro={membros.error} aoTentarDeNovo={() => void membros.refetch()} />
      ) : membros.data.length === 0 ? (
        <EstadoVazio titulo="Nenhum desbravador nesta unidade." acao={<AvisarAdm key={unidade.id} unidadeId={unidade.id} />} />
      ) : (
        <>
          <Campo rotulo="Buscar desbravador" type="search" value={busca} onChange={(evento) => setBusca(evento.target.value)} />
          <ul className="flex flex-col gap-2">
            {filtrados.map((membro) => (
              <li key={membro.dbvId}>
                <Link to={`/dbv/${membro.dbvId}`} className="flex items-center gap-3 rounded-cartao border border-borda bg-superficie p-3">
                  <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-marca-suave text-sm font-bold text-marca">
                    {iniciais(membro.nome)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{membro.nome}</span>
                    <span className="text-sm text-texto-2">{descricao(membro)}</span>
                  </span>
                  <span className="flex flex-col items-end leading-tight">
                    <span className={cn('text-base font-extrabold', membro.frequencia != null && membro.frequencia < LIMIAR_FREQUENCIA_ALERTA ? 'text-perigo' : 'text-marca')}>
                      {membro.frequencia == null ? '—' : `${membro.frequencia}%`}
                    </span>
                    <span className="text-xs text-texto-2">frequência</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
