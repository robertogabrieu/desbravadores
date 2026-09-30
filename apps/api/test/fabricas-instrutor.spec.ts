import { classeOficial, criarArquivo, criarClube, criarMaterial, criarObservacao, criarRegistroAula, criarUsuario, desconectarPrismaDeTeste } from './fabricas'

describe('fabricas da fase 2', () => {
  afterAll(desconectarPrismaDeTeste)

  it('criarObservacao grava com o clube, o alvo pelo dbv e o texto', async () => {
    const clube = await criarClube()
    const classe = await classeOficial('Amigo')
    const autor = await criarUsuario()
    const registro = await criarRegistroAula({ clubeId: clube.id, classeId: classe.id, data: '2026-03-07' })

    const daAula = await criarObservacao({ clubeId: clube.id, classeId: classe.id, autorId: autor.id, texto: 'Boa aula', registroAulaId: registro.id })

    expect(daAula).toMatchObject({ clubeId: clube.id, alvo: 'AULA', registroAulaId: registro.id, dbvId: null, titulo: null })
  })

  it('criarMaterial cria link por padrão e arquivo quando informado', async () => {
    const clube = await criarClube()
    const classe = await classeOficial('Amigo')
    const autor = await criarUsuario()
    const arquivo = await criarArquivo({ clubeId: clube.id })

    const link = await criarMaterial({ clubeId: clube.id, classeId: classe.id, autorId: autor.id, titulo: 'Site' })
    const comArquivo = await criarMaterial({ clubeId: clube.id, classeId: classe.id, autorId: autor.id, titulo: 'Caderno', arquivo: arquivo.id })

    expect(link).toMatchObject({ clubeId: clube.id, tipo: 'LINK', arquivoId: null })
    expect(link.url).toBeTruthy()
    expect(comArquivo).toMatchObject({ clubeId: clube.id, arquivoId: arquivo.id, url: null })
  })
})
