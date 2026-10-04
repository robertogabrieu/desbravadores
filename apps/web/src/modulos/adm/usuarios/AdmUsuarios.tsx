import { Papel as EsquemaPapel } from '@desbravadores/shared'
import type { Papel } from '@desbravadores/shared'
import { Ban, Check, ChevronRight, Clock, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { POR_PAGINA_USUARIOS, useUsuarios } from '../../../api/usuarios'
import type { Usuario } from '../../../api/usuarios'
import { useLarguraMenorQue } from '../../../layouts/useLarguraMenorQue'
import { Abas } from '../../../ui/Abas'
import { estiloDoBotao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { cn } from '../../../ui/cn'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { LinkDeFicha } from '../../../ui/LinkDeFicha'
import { LARGURA_DO_CELULAR, Tabela } from '../../../ui/Tabela'
import type { ColunaTabela } from '../../../ui/Tabela'
import { rotuloDoPapel } from '../../acesso/papeis'
import { useEstadoDeVolta, useFiltrosNaUrl } from '../navegacao'
import { SITUACAO } from './FichaUsuario'

const ABAS: { id: 'todos' | Papel; rotulo: string }[] = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'ADM', rotulo: 'Adm' },
  { id: 'CONSELHEIRO', rotulo: 'Conselheiros' },
  { id: 'INSTRUTOR', rotulo: 'Instrutores' },
]

/** Papéis distintos dos vínculos ativos, na ordem em que aparecem. */
const papeisDe = (usuario: Usuario): Papel[] => [...new Set(usuario.vinculos.filter((v) => v.ativo).map((v) => v.papel))]

const ICONE_DA_SITUACAO: Record<Usuario['situacao'], { Icone: LucideIcon; cor: string }> = {
  ATIVO: { Icone: Check, cor: 'text-sucesso' },
  CONVIDADO: { Icone: Clock, cor: 'text-alerta' },
  INATIVO: { Icone: Ban, cor: 'text-texto-2' },
}

function SelosDePapel({ usuario }: { usuario: Usuario }) {
  return (
    <div className="flex flex-wrap gap-1">
      {papeisDe(usuario).map((p) => (
        <span key={p} className="rounded-full bg-marca-suave px-2.5 py-0.5 text-sm font-semibold text-marca">
          {rotuloDoPapel(p)}
        </span>
      ))}
    </div>
  )
}

/** Situação com ícone e texto, para não depender só da cor. */
function Situacao({ usuario }: { usuario: Usuario }) {
  const { Icone, cor } = ICONE_DA_SITUACAO[usuario.situacao]
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
      <Icone aria-hidden className={cn('size-4 shrink-0', cor)} />
      {SITUACAO[usuario.situacao]}
    </span>
  )
}

export function AdmUsuarios() {
  const filtros = useFiltrosNaUrl()
  const estadoDeVolta = useEstadoDeVolta()
  const papelNoEndereco = EsquemaPapel.safeParse(filtros.ler('papel'))
  const papel = papelNoEndereco.success ? papelNoEndereco.data : undefined
  const buscaAplicada = filtros.ler('busca')
  const pagina = Number(filtros.ler('pagina')) || 1
  const [busca, setBusca] = useState(buscaAplicada)
  const aplicadaPeloCampo = useRef(buscaAplicada)
  const usuarios = useUsuarios({ papel, busca: buscaAplicada.trim(), pagina })
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)

  // Busca que mudou por fora do campo (limpar pelo menu, voltar e avançar no navegador) passa para o campo.
  useEffect(() => {
    if (buscaAplicada === aplicadaPeloCampo.current) return
    aplicadaPeloCampo.current = buscaAplicada
    setBusca(buscaAplicada)
  }, [buscaAplicada])

  useEffect(() => {
    if (busca === buscaAplicada) return
    const espera = setTimeout(() => {
      aplicadaPeloCampo.current = busca
      filtros.mudar({ busca, pagina: '' })
    }, 300)
    return () => clearTimeout(espera)
  }, [busca, buscaAplicada])

  const colunas: ColunaTabela<Usuario>[] = [
    {
      chave: 'usuario',
      titulo: 'Usuário',
      celula: (u) => (
        <div className="flex flex-col">
          <LinkDeFicha to={`/adm/usuarios/${u.id}`} state={estadoDeVolta} nome={u.nome} />
          <span className="text-sm text-texto-2">{u.email}</span>
        </div>
      ),
    },
    {
      chave: 'papeis',
      titulo: 'Papéis',
      celula: (u) => <SelosDePapel usuario={u} />,
    },
    { chave: 'situacao', titulo: 'Situação', celula: (u) => <Situacao usuario={u} /> },
  ]

  const cartao = (u: Usuario) => (
    <Link
      to={`/adm/usuarios/${u.id}`}
      state={estadoDeVolta}
      className="flex items-center gap-2 rounded-cartao border border-borda-controle bg-superficie py-3 pr-2 pl-4 text-texto focus-visible:outline-2 focus-visible:outline-marca"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold">{u.nome}</span>
        <span className="break-all text-sm text-texto-2">{u.email}</span>
        <SelosDePapel usuario={u} />
        <Situacao usuario={u} />
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-texto-2" />
    </Link>
  )

  return (
    <main className="flex flex-col gap-4 p-6">
      <header className={cn('flex gap-4', celular ? 'flex-col' : 'items-end justify-between')}>
        <h1 className="font-titulo text-3xl font-extrabold">Usuários</h1>
        <Link to="/adm/usuarios/novo" state={estadoDeVolta} className={cn(estiloDoBotao({ largura: celular ? 'total' : 'auto' }), 'whitespace-nowrap')}>
          <Plus aria-hidden className="size-5" />
          Convidar usuário
        </Link>
      </header>

      <Abas
        rotulo="Filtrar por papel"
        abas={ABAS.map((aba) => {
          const contagem = usuarios.data?.contagens[aba.id]
          return { id: aba.id, rotulo: contagem === undefined ? aba.rotulo : `${aba.rotulo} · ${contagem}` }
        })}
        ativa={papel ?? 'todos'}
        aoMudar={(id) => filtros.mudar({ papel: id === 'todos' ? '' : id, pagina: '' })}
      />

      <Campo
        rotulo="Buscar usuário"
        type="search"
        value={busca}
        onChange={(evento) => setBusca(evento.target.value)}
      />

      {usuarios.isPending ? (
        <p role="status">Carregando…</p>
      ) : usuarios.isError ? (
        <ErroDeCarga erro={usuarios.error} aoTentarDeNovo={() => void usuarios.refetch()} />
      ) : (
        <Tabela
          colunas={colunas}
          itens={usuarios.data.itens}
          chaveItem={(u) => u.id}
          cartao={cartao}
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
