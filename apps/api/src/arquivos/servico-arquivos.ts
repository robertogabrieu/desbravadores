import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { variavel } from '../comum/ambiente'

export type VarianteArquivo = 'original' | 'miniatura'

export const VALIDADE_URL_SEGUNDOS = 600

/** Caminho no armazenamento, montado pelo servidor (SPEC Fase 1, 4.5). */
export function caminhoDaFoto(clubeId: string, arquivoId: string, ano: number, variante: VarianteArquivo): string {
  const sufixo = variante === 'miniatura' ? '-min' : ''
  return `clube/${clubeId}/fotos/${ano}/${arquivoId}${sufixo}.jpg`
}

/** Caminho de um material (documento), montado pelo servidor; `ext` vem da tabela de formatos, nunca do cliente. */
export function caminhoDoMaterial(clubeId: string, arquivoId: string, ext: string, ano: number = new Date().getUTCFullYear()): string {
  return `clube/${clubeId}/materiais/${ano}/${arquivoId}.${ext}`
}

@Injectable()
export class ServicoArquivos {
  /**
   * URL de 10 minutos. O `clubeId` viaja na URL porque a rota e publica e o arquivo so se acha
   * pelo par (clube, id); a assinatura cobre id, variante e validade, e um `clubeId` trocado so
   * leva a "nao encontrado".
   */
  urlAssinada(clubeId: string, arquivoId: string, variante: VarianteArquivo, agora: Date = new Date()): string {
    const exp = Math.floor(agora.getTime() / 1000) + VALIDADE_URL_SEGUNDOS
    const sig = this.assinar(arquivoId, variante, exp)
    return `/api/arquivos/${arquivoId}?c=${clubeId}&v=${variante}&exp=${exp}&sig=${sig}`
  }

  assinaturaConfere(arquivoId: string, variante: VarianteArquivo, exp: number, sig: string): boolean {
    const esperada = Buffer.from(this.assinar(arquivoId, variante, exp))
    const recebida = Buffer.from(sig)
    return esperada.length === recebida.length && timingSafeEqual(esperada, recebida)
  }

  private assinar(arquivoId: string, variante: VarianteArquivo, exp: number): string {
    return createHmac('sha256', variavel('ARQUIVOS_SEGREDO')).update(`${arquivoId}|${variante}|${exp}`).digest('base64url')
  }
}
