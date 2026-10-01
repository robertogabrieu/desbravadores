import { Papel as EsquemaPapel } from '@desbravadores/shared'
import type { Papel } from '@desbravadores/shared'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { POR_PAGINA_USUARIOS, useUsuarios } from '../../../api/usuarios'
import type { Usuario } from '../../../api/usuarios'
import { estiloDoBotao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Tabela } from '../../../ui/Tabela'
import type { ColunaTabela } from '../../../ui/Tabela'
import { cn } from '../../../ui/cn'
import { rotuloDoPapel } from '../../acesso/papeis'
import { useEstadoDeVolta, useFiltrosNaUrl } from '../navegacao'
import { SITUACAO } from './FichaUsuario'

const ABAS: { papel: Papel | undefined; rotulo: string; contagem: 'todos' | Papel }[] = [
  { papel: undefined, rotulo: 'Todos', contagem: 'todos' },
  { papel: 'ADM', rotulo: 'Adm', contagem: 'ADM' },
  { papel: 'CONSELHEIRO', rotulo: 'Conselheiros', contagem: 'CONSELHEIRO' },
  { papel: 'INSTRUTOR', rotulo: 'Instrutores', contagem: 'INSTRUTOR' },
]

/** Papéis distintos dos vínculos ativos, na ordem em que aparecem. */
const papeisDe = (usuario: Usuario): Papel[] => [...new Set(usuario.vinculos.filter((v) => v.ativo).map((v) => v.papel))]

export function AdmUsuarios() {
  const filtros = useFiltrosNaUrl()
  const estadoDeVolta = useEstadoDeVolta()
  const papelNoEndereco = EsquemaPapel.safeParse(filtros.ler('papel'))
  const papel = papelNoEndereco.success ? papelNoEndereco.data : undefined
  const buscaAplicada = filtros.ler('busca')
  const pagina = Number(filtros.ler('pagina')) || 1
  const [busca, setBusca] = useState(buscaAplicada)
  const usuarios = useUsuarios({ papel, busca: buscaAplicada.trim(), pagina })

  useEffect(() => {
    if (busca === buscaAplicada) return
    const espera = setTimeout(() => filtros.mudar({ busca, pagina: '' }), 300)
    return () => clearTimeout(espera)
  }, [busca, buscaAplicada])

  const colunas: ColunaTabela<Usuario>[] = [
    {
      chave: 'usuario',
      titulo: 'Usuário',
      celula: (u) => (
        <div className="flex flex-col">
          <Link to={`/adm/usuarios/${u.id}`} state={estadoDeVolta} className="font-semibold text-marca underline-offset-2 hover:underline">
            {u.nome}
          </Link>
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
        <Link to="/adm/usuarios/novo" state={estadoDeVolta} className={estiloDoBotao()}>
          <Plus aria-hidden className="size-5" />
          Convidar usuário
        </Link>
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
              onClick={() => filtros.mudar({ papel: aba.papel ?? '', pagina: '' })}
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
        onChange={(evento) => setBusca(evento.target.value)}
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
          aoMudarPagina={(proxima) => filtros.mudar({ pagina: proxima > 1 ? String(proxima) : '' })}
          vazio={<EstadoVazio titulo="Nenhum usuário encontrado" descricao="Mude o filtro ou a busca, ou convide alguém." />}
        />
      )}
    </main>
  )
}
