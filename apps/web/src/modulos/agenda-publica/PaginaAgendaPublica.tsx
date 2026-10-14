import { JANELA_DO_CALENDARIO_EM_DIAS } from '@desbravadores/shared'
import { WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import { useConexao } from '../../offline'
import { Botao } from '../../ui/Botao'
import { Carregando } from '../../ui/EstadosDeCarga'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Esqueleto } from '../../ui/Esqueleto'
import { useAgendaPublica } from './api'
import { CalendarioPublico } from './CalendarioPublico'
import { CartaoProximo } from './CartaoProximo'
import { aPartirDeHoje, iniciaisDoClube, mesesDaJanela, proximoCompromisso, somarDias } from './compromissos'
import { ListaPorMes } from './ListaPorMes'

/** A página fica fora dos buscadores: a meta sai junto com ela. */
function useSemBuscador() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}

/**
 * Faixa cosmética local: o navegador não decide comportamento (o `online` só dispara um novo pedido,
 * que a API confirma) e nada é escrito no estado global de conexão.
 */
function useOfflineLocal(aoVoltar: () => void) {
  const [offlineLocal, definirOfflineLocal] = useState(() => !navigator.onLine)
  const aoVoltarRef = useRef(aoVoltar)
  aoVoltarRef.current = aoVoltar

  useEffect(() => {
    const aoCair = () => definirOfflineLocal(true)
    const aoRetornar = () => {
      definirOfflineLocal(false)
      aoVoltarRef.current()
    }
    window.addEventListener('offline', aoCair)
    window.addEventListener('online', aoRetornar)
    return () => {
      window.removeEventListener('offline', aoCair)
      window.removeEventListener('online', aoRetornar)
    }
  }, [])

  return offlineLocal
}

/** O layout autenticado não cobre esta rota, então a faixa é montada aqui. */
function FaixaSemConexao() {
  return (
    <div role="status" aria-label="Sem conexão" className="flex items-center gap-3 bg-sem-conexao px-4 py-2 text-sm font-semibold text-sobre-sem-conexao">
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <span>Sem conexão. Mostrando o que já foi carregado.</span>
    </div>
  )
}

function Esqueletos() {
  return (
    <Carregando rotulo="Carregando a agenda">
      <Esqueleto className="h-52 rounded-cartao" />
      <Esqueleto className="h-16" />
      <Esqueleto className="h-16" />
      <Esqueleto className="h-16" />
    </Carregando>
  )
}

/** Rota pública /agenda/:slug: só leitura, sem login, sem buscador. */
export function PaginaAgendaPublica() {
  useSemBuscador()
  const { slug = '' } = useParams()
  const { modo } = useConexao()
  const consulta = useAgendaPublica(slug)
  const offlineLocal = useOfflineLocal(() => void consulta.refetch())
  const erro = consulta.error
  const semRede = modo === 'SEM_CONEXAO' || offlineLocal || (erro instanceof ErroDaApi && erro.classe === 'REDE')
  const naoEncontrada = erro instanceof ErroDaApi && erro.status === 404

  return (
    <div className="min-h-dvh bg-fundo text-texto">
      {semRede && <FaixaSemConexao />}
      <div className="mx-auto max-w-[1040px] px-4 pb-12">
        {consulta.data ? (
          <Agenda dados={consulta.data} />
        ) : naoEncontrada ? (
          <EstadoVazio titulo="Agenda não encontrada. Confira o link com a diretoria do clube." />
        ) : erro ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-base font-semibold text-perigo">Não foi possível carregar a agenda.</p>
            <Botao variante="secundario" onClick={() => void consulta.refetch()}>
              Tentar de novo
            </Botao>
          </div>
        ) : (
          <div className="pt-6">
            <Esqueletos />
          </div>
        )}
      </div>
    </div>
  )
}

function Agenda({ dados }: { dados: NonNullable<ReturnType<typeof useAgendaPublica>['data']> }) {
  const futuros = aPartirDeHoje(dados.compromissos, dados.hoje)
  const proximo = proximoCompromisso(futuros)
  const meses = mesesDaJanela(dados.hoje, somarDias(dados.hoje, JANELA_DO_CALENDARIO_EM_DIAS))

  return (
    <>
      <header className="flex items-center gap-4 py-6">
        <div aria-hidden className="grid size-14 flex-none place-items-center rounded-full bg-marca font-titulo text-[22px] font-bold text-creme">
          {iniciaisDoClube(dados.clube.nome)}
        </div>
        <div>
          <h1 className="text-2xl font-bold">{dados.clube.nome}</h1>
          <p className="m-0 text-base text-texto-2">Agenda para pais e responsáveis</p>
        </div>
      </header>

      {futuros.length === 0 ? (
        <EstadoVazio titulo="O clube ainda não publicou compromissos para os próximos meses. Volte em breve." />
      ) : (
        <>
          {proximo && <CartaoProximo compromisso={proximo} />}
          <main className="mt-8 grid items-start gap-8 min-[880px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <section aria-labelledby="lista-titulo">
              <h2 id="lista-titulo" className="mb-4 text-[22px] font-bold">
                Próximos compromissos
              </h2>
              <ListaPorMes compromissos={futuros} hoje={dados.hoje} />
            </section>
            <section aria-labelledby="cal-titulo">
              <h2 id="cal-titulo" className="mb-4 text-[22px] font-bold">
                Calendário do clube
              </h2>
              <CalendarioPublico compromissos={dados.compromissos} hoje={dados.hoje} meses={meses} />
            </section>
          </main>
        </>
      )}

      <footer className="mt-8 grid gap-1 border-t border-borda pt-6 text-sm text-texto-2">
        <p className="m-0">Dúvidas sobre horário ou local? Fale com a diretoria do clube.</p>
      </footer>
    </>
  )
}
