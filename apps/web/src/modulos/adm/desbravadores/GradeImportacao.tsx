import { Fragment } from 'react'
import type { ReactNode } from 'react'
import type { LinhaParaImportar } from '../../../api/importacao'
import { estiloControle } from '../../../ui/Campo'
import { cn } from '../../../ui/cn'
import type { CampoEditavel, LinhaEmRevisao } from './revisao-importacao'

interface Opcao {
  id: string
  nome: string
}

interface Propriedades {
  linhas: LinhaEmRevisao[]
  unidades: Opcao[]
  classes: Opcao[]
  aoEditar: <C extends CampoEditavel>(linha: number, campo: C, valor: LinhaParaImportar[C]) => void
  aoMarcar: (linha: number, marcada: boolean) => void
}

const COLUNAS = ['Importar', 'Nome', 'Nascimento', 'Sexo', 'Unidade', 'Classe', 'Responsável', 'Telefone', 'E-mail', 'Entrada no clube']

const textoOuNulo = (texto: string): string | null => (texto.trim() === '' ? null : texto)

function Celula({ children }: { children: ReactNode }) {
  return <td className="px-2 py-2 align-top">{children}</td>
}

/** Uma linha por pessoa; os erros e avisos dela vêm logo abaixo. A grade rola dentro de si no celular. */
export function GradeImportacao({ linhas, unidades, classes, aoEditar, aoMarcar }: Propriedades) {
  return (
    <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
      <table className="w-full border-collapse text-left text-base">
        <thead className="bg-superficie-suave text-sm text-texto-2">
          <tr>
            {COLUNAS.map((coluna) => (
              <th key={coluna} scope="col" className="whitespace-nowrap px-2 py-3 font-semibold">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const n = linha.linha
            const temErro = linha.erros.length > 0
            return (
              <Fragment key={n}>
                <tr className="border-t border-divisor">
                  <Celula>
                    <label className="flex min-h-[var(--touch-min)] items-center gap-2 whitespace-nowrap text-sm text-texto-2">
                      <input
                        type="checkbox"
                        aria-label={`Importar linha ${n}`}
                        className="size-5 shrink-0 accent-marca"
                        checked={linha.marcada}
                        disabled={temErro}
                        onChange={(e) => aoMarcar(n, e.target.checked)}
                      />
                      <span aria-hidden>{n}</span>
                    </label>
                  </Celula>
                  <Celula>
                    <input
                      aria-label={`Nome, linha ${n}`}
                      aria-invalid={temErro || undefined}
                      className={cn(estiloControle, 'min-w-56')}
                      value={linha.nome}
                      onChange={(e) => aoEditar(n, 'nome', e.target.value)}
                    />
                  </Celula>
                  <Celula>
                    <input
                      type="date"
                      aria-label={`Nascimento, linha ${n}`}
                      className={cn(estiloControle, 'min-w-40')}
                      value={linha.nascimento}
                      onChange={(e) => aoEditar(n, 'nascimento', e.target.value)}
                    />
                  </Celula>
                  <Celula>
                    <select
                      aria-label={`Sexo, linha ${n}`}
                      className={cn(estiloControle, 'min-w-32')}
                      value={linha.sexo}
                      onChange={(e) => aoEditar(n, 'sexo', e.target.value === 'F' ? 'F' : e.target.value === 'M' ? 'M' : '')}
                    >
                      <option value="">Escolha</option>
                      <option value="F">Feminino</option>
                      <option value="M">Masculino</option>
                    </select>
                  </Celula>
                  <Celula>
                    <select
                      aria-label={`Unidade, linha ${n}`}
                      className={cn(estiloControle, 'min-w-40')}
                      value={linha.unidadeId ?? ''}
                      onChange={(e) => aoEditar(n, 'unidadeId', e.target.value || null)}
                    >
                      <option value="">Sem unidade</option>
                      {unidades.map((unidade) => (
                        <option key={unidade.id} value={unidade.id}>
                          {unidade.nome}
                        </option>
                      ))}
                    </select>
                  </Celula>
                  <Celula>
                    <select
                      aria-label={`Classe, linha ${n}`}
                      className={cn(estiloControle, 'min-w-40')}
                      value={linha.classeId ?? ''}
                      onChange={(e) => aoEditar(n, 'classeId', e.target.value || null)}
                    >
                      <option value="">Sem classe</option>
                      {classes.map((classe) => (
                        <option key={classe.id} value={classe.id}>
                          {classe.nome}
                        </option>
                      ))}
                    </select>
                  </Celula>
                  <Celula>
                    <input
                      aria-label={`Responsável, linha ${n}`}
                      className={cn(estiloControle, 'min-w-48')}
                      value={linha.responsavelNome ?? ''}
                      onChange={(e) => aoEditar(n, 'responsavelNome', textoOuNulo(e.target.value))}
                    />
                  </Celula>
                  <Celula>
                    <input
                      type="tel"
                      aria-label={`Telefone, linha ${n}`}
                      className={cn(estiloControle, 'min-w-40')}
                      value={linha.responsavelTelefone ?? ''}
                      onChange={(e) => aoEditar(n, 'responsavelTelefone', textoOuNulo(e.target.value))}
                    />
                  </Celula>
                  <Celula>
                    <input
                      type="email"
                      aria-label={`E-mail, linha ${n}`}
                      className={cn(estiloControle, 'min-w-56')}
                      value={linha.responsavelEmail ?? ''}
                      onChange={(e) => aoEditar(n, 'responsavelEmail', textoOuNulo(e.target.value))}
                    />
                  </Celula>
                  <Celula>
                    <input
                      type="date"
                      aria-label={`Entrada no clube, linha ${n}`}
                      className={cn(estiloControle, 'min-w-40')}
                      value={linha.entradaEm}
                      onChange={(e) => aoEditar(n, 'entradaEm', e.target.value)}
                    />
                  </Celula>
                </tr>
                {(temErro || linha.avisos.length > 0) && (
                  <tr>
                    <td colSpan={COLUNAS.length} className="px-2 pb-3">
                      <ul className="sticky left-2 flex max-w-72 flex-col gap-1 text-sm font-medium">
                        {linha.erros.map((erro) => (
                          <li key={erro} className="text-perigo">
                            <span className="font-bold">Erro:</span> <span>{erro}</span>
                          </li>
                        ))}
                        {linha.avisos.map((aviso) => (
                          <li key={`${aviso.codigo}-${aviso.mensagem}`} className="text-alerta">
                            <span className="font-bold">Aviso:</span> <span>{aviso.mensagem}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
