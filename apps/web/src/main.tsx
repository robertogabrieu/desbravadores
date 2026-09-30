import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ErroDaApi, configurarCliente } from './api/cliente'
import './offline/tipos/todos'
import { rotas } from './rotas'
import { ProvedorSessao } from './sessao/ProvedorSessao'
import './ui/tema.css'

const MAXIMO_DE_TENTATIVAS = 2

const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      // Sem rede a consulta precisa falhar (erro de rede), não pausar: é a falha que leva o app ao
      // modo sem conexão; pausada, a tela fica em "carregando" para sempre.
      networkMode: 'always',
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Erro 4xx é resposta definitiva da API: repetir só atrasa a mensagem.
      retry: (tentativas, erro) =>
        !(erro instanceof ErroDaApi && erro.status >= 400 && erro.status < 500) && tentativas < MAXIMO_DE_TENTATIVAS,
    },
    // Gravar é enfileirar no aparelho: a mutação também não espera o navegador se dizer online.
    mutations: { networkMode: 'always' },
  },
})

const roteador = createBrowserRouter(rotas)
configurarCliente({ navegar: (caminho) => void roteador.navigate(caminho) })

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register('/sw.js')
}

const raiz = document.getElementById('raiz')
if (!raiz) throw new Error('Elemento #raiz nao encontrado')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <ProvedorSessao>
        <RouterProvider router={roteador} />
      </ProvedorSessao>
      <Toaster position="top-center" />
    </QueryClientProvider>
  </StrictMode>,
)
