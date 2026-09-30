const CARACTERES_PROIBIDOS = '"\\/'

function ehControle(caractere: string): boolean {
  const codigo = caractere.codePointAt(0) ?? 0
  return codigo < 32 || codigo === 127
}

/** Titulo sem aspas, barras nem caracteres de controle: nao quebra o cabecalho nem monta caminho. */
function tituloLimpo(titulo: string): string {
  const limpo = [...titulo].filter((c) => !ehControle(c) && !CARACTERES_PROIBIDOS.includes(c)).join('').trim()
  return limpo || 'arquivo'
}

/** Sem acento e sem nada fora do ASCII visivel: o `filename` simples que todo navegador aceita. */
function nomeAscii(titulo: string): string {
  const semAcento = titulo.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim()
  return semAcento || 'arquivo'
}

/** RFC 5987: `encodeURIComponent` deixa passar ' ( ) *, que o `filename*` nao aceita crus. */
function codificarUtf8(texto: string): string {
  return encodeURIComponent(texto).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** `Content-Disposition` com o nome ASCII e o nome UTF-8 completo (`filename*`). */
export function cabecalhoDeDisposicao(tipo: 'inline' | 'attachment', titulo: string, ext: string): string {
  const limpo = tituloLimpo(titulo)
  return `${tipo}; filename="${nomeAscii(limpo)}.${ext}"; filename*=UTF-8''${codificarUtf8(`${limpo}.${ext}`)}`
}
