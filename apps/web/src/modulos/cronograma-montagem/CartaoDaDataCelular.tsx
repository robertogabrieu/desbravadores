import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Botao } from '../../ui/Botao'
import { Confirmacao } from '../../ui/Confirmacao'
import { Selo } from '../../ui/Selo'
import { cn } from '../../ui/cn'
import { EtiquetaDoLado } from './EtiquetaDoLado'
import { MedidorDeOcupacao } from './MedidorDeOcupacao'
import type { DataDaMontagem } from '../../api/montagem'
import { aulaDadaPorTodas, classeDada, diaPodeMudar, type RequisitoComLado } from './vista'
import { dataBloqueada, detalheDaAula, diaDaSemanaEData, textoDaData } from './datas'

interface Propriedades {
  dado: DataDaMontagem
  /** Requisitos que estão nesta data, na ordem do caderno. */
  requisitos: RequisitoComLado[]
  desabilitada: boolean
  /** Regular com avançada: etiqueta em cada requisito e medidor de ocupação na data. */
  comAvancada?: boolean
  /** "Trocar data" e "Escolher outra data": abrem a folha "Em qual data?" para o requisito. */
  aoEscolherData: (requisito: RequisitoComLado) => void
  aoTirar: (requisito: RequisitoComLado) => void
  aoEditar: (dado: DataDaMontagem) => void
  aoRemoverAula: (dado: DataDaMontagem) => void
}

/** Vista "Por data" do Adm no celular: um cartão por data, com as ações de cada requisito nela. */
export function CartaoDaDataCelular({ dado, requisitos, comAvancada = false, desabilitada, aoEscolherData, aoTirar, aoEditar, aoRemoverAula }: Propriedades) {
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)
  const texto = textoDaData(dado) || 'Dia de classe'
  const detalhe = detalheDaAula(dado)
  const bloqueada = dataBloqueada(dado)
  const podeEditar = diaPodeMudar(dado)
  // Classe dada só em parte das classes da data: o selo vai nos requisitos delas; em todas, na data.
  const dadaNosDois = aulaDadaPorTodas(dado, requisitos)

  return (
    <li
      data-data={dado.data}
      data-estado={dado.conflito ? 'conflito' : bloqueada ? 'bloqueada' : 'livre'}
      className={cn(
        'flex flex-col gap-3 rounded-cartao border bg-superficie p-4',
        dado.conflito ? 'border-2 border-perigo' : 'border-divisor',
        !dado.conflito && bloqueada && 'bg-superficie-suave',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-titulo text-lg font-bold text-texto">{diaDaSemanaEData(dado.data)}</span>
        <span className="text-sm font-semibold text-texto-2">{texto}</span>
        {dadaNosDois && <Selo className="ml-auto">Classe dada</Selo>}
      </div>
      {comAvancada && !bloqueada && <MedidorDeOcupacao quantidade={requisitos.length} />}
      {detalhe && <span className="text-sm text-texto-2">{detalhe}</span>}
      {dado.conflito && !dadaNosDois && (
        <p className="text-sm font-bold text-perigo">Não haverá classe nesta data. Escolha outra para o requisito abaixo.</p>
      )}

      {requisitos.length > 0 && (
        <ul className="flex flex-col gap-3">
          {requisitos.map((requisito) => {
            const dada = classeDada(dado, requisito.classeId)
            return (
            <li key={requisito.id} className="flex flex-col gap-2 border-t border-divisor pt-3 first:border-t-0 first:pt-0">
              <p className="flex flex-wrap items-center gap-2 text-base text-texto">
                {comAvancada && <EtiquetaDoLado requisito={requisito} />}
                <span>
                  <strong className="text-marca">{requisito.codigo}</strong> · {requisito.texto}
                </span>
                {dada && !dadaNosDois && <Selo>Classe dada</Selo>}
              </p>
              {!dada &&
                (requisito.foraDoPar ? (
                  <Botao
                    variante="texto"
                    className="self-start"
                    aria-label={`Tirar ${requisito.codigo} da data`}
                    disabled={desabilitada}
                    onClick={() => aoTirar(requisito)}
                  >
                    Tirar da data
                  </Botao>
                ) : dado.conflito ? (
                  <Botao
                    variante="secundario"
                    className="self-start"
                    aria-label={`Escolher outra data para ${requisito.codigo}`}
                    disabled={desabilitada}
                    onClick={() => aoEscolherData(requisito)}
                  >
                    Escolher outra data
                  </Botao>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Botao
                      variante="secundario"
                      aria-label={`Trocar data do ${requisito.codigo}`}
                      disabled={desabilitada}
                      onClick={() => aoEscolherData(requisito)}
                    >
                      Trocar data
                    </Botao>
                    <Botao
                      variante="texto"
                      aria-label={`Tirar ${requisito.codigo} da data`}
                      disabled={desabilitada}
                      onClick={() => aoTirar(requisito)}
                    >
                      Tirar da data
                    </Botao>
                  </div>
                ))}
            </li>
            )
          })}
        </ul>
      )}

      {podeEditar && (
        <div className="flex flex-col items-start border-t border-divisor pt-2">
          <Botao variante="texto" className="px-2" disabled={desabilitada} onClick={() => aoEditar(dado)}>
            <Pencil aria-hidden className="size-4" />
            Editar horário, local e título
          </Botao>
          <Botao variante="texto" className="px-2 text-perigo" disabled={desabilitada} onClick={() => setConfirmandoRemocao(true)}>
            <Trash2 aria-hidden className="size-4" />
            Remover dia de classe
          </Botao>
        </div>
      )}

      <Confirmacao
        aberta={confirmandoRemocao}
        titulo="Remover este dia de classe?"
        rotuloConfirmar="Remover"
        perigo
        aoConfirmar={() => {
          setConfirmandoRemocao(false)
          aoRemoverAula(dado)
        }}
        aoCancelar={() => setConfirmandoRemocao(false)}
      >
        {comAvancada ? 'Os requisitos das duas classes neste dia voltam a ficar sem data.' : 'Os requisitos deste dia de classe voltam a ficar sem data.'}
      </Confirmacao>
    </li>
  )
}
