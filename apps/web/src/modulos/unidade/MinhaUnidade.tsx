import { useState } from 'react'
import type { Membro } from '../../api/leitura'
import { useMembrosUnidade } from '../../api/leitura'
import { Campo } from '../../ui/Campo'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Selecao } from '../../ui/Selecao'
import { useSessao } from '../../sessao/useSessao'

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
        <p role="status">Carregando…</p>
      ) : membros.isError ? (
        <p role="alert">Não foi possível carregar a unidade. Tente de novo.</p>
      ) : membros.data.length === 0 ? (
        <EstadoVazio titulo="Nenhum desbravador nesta unidade. Avise o Adm." />
      ) : (
        <>
          <Campo rotulo="Buscar desbravador" type="search" value={busca} onChange={(evento) => setBusca(evento.target.value)} />
          <ul className="flex flex-col gap-2">
            {filtrados.map((membro) => (
              <li key={membro.dbvId} className="flex items-center gap-3 rounded-cartao border border-borda bg-superficie p-3">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-marca-suave text-sm font-bold text-marca">
                  {iniciais(membro.nome)}
                </span>
                <span className="flex flex-col">
                  <span className="font-semibold">{membro.nome}</span>
                  <span className="text-sm text-texto-2">{descricao(membro)}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
