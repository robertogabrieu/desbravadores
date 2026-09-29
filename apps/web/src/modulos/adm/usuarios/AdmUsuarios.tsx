import type { Papel } from '@desbravadores/shared'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { POR_PAGINA_USUARIOS, useUsuarios } from '../../../api/usuarios'
import type { Usuario } from '../../../api/usuarios'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { Tabela } from '../../../ui/Tabela'
import type { ColunaTabela } from '../../../ui/Tabela'
import { cn } from '../../../ui/cn'
import { rotuloDoPapel } from '../../acesso/papeis'
import { PainelUsuario } from './PainelUsuario'

const SITUACAO: Record<Usuario['situacao'], string> = { ATIVO: 'Ativo', CONVIDADO: 'Convite enviado', INATIVO: 'Inativo' }

const ABAS: { papel: Papel | undefined; rotulo: string; contagem: 'todos' | Papel }[] = [
  { papel: undefined, rotulo: 'Todos', contagem: 'todos' },
  { papel: 'ADM', rotulo: 'Adm', contagem: 'ADM' },
  { papel: 'CONSELHEIRO', rotulo: 'Conselheiros', contagem: 'CONSELHEIRO' },
  { papel: 'INSTRUTOR', rotulo: 'Instrutores', contagem: 'INSTRUTOR' },
]

/** Papéis distintos dos vínculos ativos, na ordem em que aparecem. */
const papeisDe = (usuario: Usuario): Papel[] => [...new Set(usuario.vinculos.filter((v) => v.ativo).map((v) => v.papel))]

type Painel = { aberto: false } | { aberto: true; usuario: Usuario | null }

export function AdmUsuarios() {
  const [papel, setPapel] = useState<Papel>()
  const [pagina, setPagina] = useState(1)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [painel, setPainel] = useState<Painel>({ aberto: false })
  const usuarios = useUsuarios({ papel, busca: buscaAplicada.trim(), pagina })

  useEffect(() => {
    const espera = setTimeout(() => setBuscaAplicada(busca), 300)
    return () => clearTimeout(espera)
  }, [busca])

  const colunas: ColunaTabela<Usuario>[] = [
    {
      chave: 'usuario',
      titulo: 'Usuário',
      celula: (u) => (
        <div className="flex flex-col">
          <button type="button" onClick={() => setPainel({ aberto: true, usuario: u })} className="text-left font-semibold text-marca underline-offset-2 hover:underline">
            {u.nome}
          </button>
          <span className="text-sm text-texto-2">{u.email}</span>
        </div>
      ),
    },
    {
      chave: 'papeis',
      titulo: 'Papéis',
      celula: (u) => (
        <div className="flex flex-wrap gap-1">
          {papeisDe(u).map((p) => (
            <span key={p} className="rounded-full bg-marca-suave px-2.5 py-0.5 text-xs font-bold text-marca">
              {rotuloDoPapel(p)}
            </span>
          ))}
        </div>
      ),
    },
    { chave: 'situacao', titulo: 'Situação', celula: (u) => SITUACAO[u.situacao] },
  ]

  return (
    <main className="flex flex-col gap-4 p-6">
      <header className="flex items-end justify-between gap-4">
        <h1 className="font-titulo text-3xl font-extrabold">Usuários</h1>
        <Botao onClick={() => setPainel({ aberto: true, usuario: null })}>
          <Plus aria-hidden className="size-5" />
          Convidar usuário
        </Botao>
      </header>

      <div role="tablist" aria-label="Filtrar por papel" className="flex flex-wrap gap-2">
        {ABAS.map((aba) => {
          const selecionada = aba.papel === papel
          const contagem = usuarios.data?.contagens[aba.contagem]
          return (
            <button
              key={aba.rotulo}
              type="button"
              role="tab"
              aria-selected={selecionada}
              onClick={() => {
                setPapel(aba.papel)
                setPagina(1)
              }}
              className={cn(
                'min-h-[var(--touch-min)] rounded-full border px-4 text-sm font-bold',
                selecionada ? 'border-texto bg-texto text-white' : 'border-borda bg-superficie text-texto',
              )}
            >
              {contagem === undefined ? aba.rotulo : `${aba.rotulo} · ${contagem}`}
            </button>
          )
        })}
      </div>

      <Campo
        rotulo="Buscar usuário"
        type="search"
        value={busca}
        onChange={(evento) => {
          setBusca(evento.target.value)
          setPagina(1)
        }}
      />

      {usuarios.isPending ? (
        <p role="status">Carregando…</p>
      ) : usuarios.isError ? (
        <p role="alert">Não foi possível carregar os usuários. Tente de novo.</p>
      ) : (
        <Tabela
          colunas={colunas}
          itens={usuarios.data.itens}
          chaveItem={(u) => u.id}
          pagina={pagina}
          porPagina={POR_PAGINA_USUARIOS}
          total={usuarios.data.total}
          aoMudarPagina={setPagina}
          vazio={<EstadoVazio titulo="Nenhum usuário encontrado" descricao="Mude o filtro ou a busca, ou convide alguém." />}
        />
      )}

      <FolhaLateral
        aberta={painel.aberto}
        titulo={painel.aberto && painel.usuario ? painel.usuario.nome : 'Novo usuário'}
        aoFechar={() => setPainel({ aberto: false })}
      >
        {painel.aberto && (
          <PainelUsuario
            key={painel.usuario?.id ?? 'novo'}
            usuario={painel.usuario}
            aoAtualizar={(usuario) => setPainel({ aberto: true, usuario })}
            aoFechar={() => setPainel({ aberto: false })}
          />
        )}
      </FolhaLateral>
    </main>
  )
}
