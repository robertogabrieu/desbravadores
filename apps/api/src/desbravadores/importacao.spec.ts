import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { ImportacaoRecusada, LinhaImportada, PreviaImportacao } from '@desbravadores/shared'
import ExcelJS from 'exceljs'
import { performance } from 'node:perf_hooks'
import request from 'supertest'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  admDefinirClasseClube,
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { anoCorrente, corpo, criarClasseDoClube, hoje, nascimentoComIdade } from '../../test/p6'

type Previa = z.infer<typeof PreviaImportacao>
type Linha = z.infer<typeof LinhaImportada>
type Recusa = z.infer<typeof ImportacaoRecusada>
type Celula = string | number | Date | null

const CABECALHO = ['Nome', 'Data de nascimento', 'Sexo', 'Unidade', 'Classe', 'Responsável', 'Telefone', 'E-mail', 'Entrada no clube']

async function xlsx(linhas: Celula[][]): Promise<Buffer> {
  const pasta = new ExcelJS.Workbook()
  const planilha = pasta.addWorksheet('Desbravadores')
  for (const linha of linhas) planilha.addRow(linha)
  return Buffer.from(await pasta.xlsx.writeBuffer())
}

function csv(linhas: string[][], separador = ';'): Buffer {
  return Buffer.from(linhas.map((linha) => linha.map((c) => (c.includes(separador) ? `"${c}"` : c)).join(separador)).join('\n'), 'utf8')
}

/** Nome só de letras, diferente para cada `i`: a validação do nome não aceita dígitos. */
function nomeDaPessoa(i: number): string {
  const letra = (n: number) => String.fromCharCode(97 + (n % 26))
  return `Pessoa ${letra(i)}${letra(Math.floor(i / 26))} da Silva Albuquerque de Oliveira`
}

/** Troca, no diretório central do zip, o tamanho descompactado declarado de cada entrada. */
function mentirNoTamanhoDescompactado(zip: Buffer, tamanho: number): Buffer {
  const copia = Buffer.from(zip)
  const assinatura = Buffer.from([0x50, 0x4b, 0x01, 0x02])
  for (let i = copia.indexOf(assinatura); i !== -1; i = copia.indexOf(assinatura, i + 4)) copia.writeUInt32LE(tamanho, i + 24)
  return copia
}

/** Dia serial do Excel (base 1899-12-30) de uma data civil. */
function serialDoExcel(data: string): number {
  return (Date.parse(`${data}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function linhaPronta(parcial: Partial<Linha> = {}): Linha {
  return {
    linha: 2,
    nome: 'Maria da Silva',
    nascimento: nascimentoComIdade(10),
    sexo: 'F',
    unidadeId: null,
    classeId: null,
    responsavelNome: null,
    responsavelTelefone: null,
    responsavelEmail: null,
    entradaEm: '2026-02-01',
    ...parcial,
  }
}

describe('importacao de desbravadores por planilha', () => {
  let app: INestApplication
  const servidor = (): Server => app.getHttpServer() as Server
  const previa = (auth: string, arquivo: Buffer, nome = 'planilha.xlsx') =>
    request(servidor()).post('/api/desbravadores/importacao/previa').set('Authorization', auth).attach('arquivo', arquivo, nome)
  const confirmar = (auth: string, linhas: Linha[]) =>
    request(servidor()).post('/api/desbravadores/importacao').set('Authorization', auth).send({ linhas })

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function admDeClubeNovo() {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    return { clube, adm }
  }

  describe('POST /desbravadores/importacao/previa', () => {
    it('sem Nome, Data de nascimento e Sexo, nao traz linhas e diz quais colunas faltam', async () => {
      const { adm } = await admDeClubeNovo()
      const arquivo = await xlsx([['Unidade', 'Telefone'], ['Águias', '11 9999-0000']])
      const resposta = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(resposta.colunasFaltando).toEqual(['Nome', 'Data de nascimento', 'Sexo'])
      expect(resposta.linhas).toEqual([])
    })

    it('reconhece o cabecalho por trecho, sem acento, sem caixa e fora de ordem; ignora coluna desconhecida', async () => {
      const { adm } = await admDeClubeNovo()
      const arquivo = await xlsx([
        ['SEXO', 'Observação', 'nome completo', 'NASCIMENTO', 'Celular', 'email do responsavel'],
        ['f', 'qualquer', '  Ana Clara  ', '10/03/2015', '(11) 9999-0000', 'mae@exemplo.com'],
      ])
      const { colunasFaltando, linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(colunasFaltando).toEqual([])
      expect(linhas).toHaveLength(1)
      expect(linhas[0]).toMatchObject({
        linha: 2,
        nome: 'Ana Clara',
        nascimento: '2015-03-10',
        sexo: 'F',
        responsavelTelefone: '(11) 9999-0000',
        responsavelEmail: 'mae@exemplo.com',
        erros: [],
        duplicado: false,
      })
    })

    it('converte as datas em dd/mm/aaaa, aaaa-mm-dd e data do Excel, e o sexo por extenso', async () => {
      const { adm } = await admDeClubeNovo()
      const arquivo = await xlsx([
        ['Nome', 'Data de nascimento', 'Sexo'],
        ['Um Barra', '10/03/2015', 'Masculino'],
        ['Dois Traco', '2015-03-11', 'Feminino'],
        ['Tres Serial', serialDoExcel('2015-03-12'), 'M'],
        ['Quatro Data', new Date('2015-03-13T00:00:00Z'), 'F'],
        ['Cinco Ruim', '31/02/2015', 'X'],
      ])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas.map((l) => [l.nascimento, l.sexo])).toEqual([
        ['2015-03-10', 'M'],
        ['2015-03-11', 'F'],
        ['2015-03-12', 'M'],
        ['2015-03-13', 'F'],
        ['', ''],
      ])
      expect(linhas.slice(0, 4).every((l) => l.erros.length === 0)).toBe(true)
      expect(linhas[4]?.erros).toEqual(expect.arrayContaining(['Data de nascimento inválida: 31/02/2015', 'Sexo inválido: X']))
    })

    it('le .csv com ; ou , e aspas', async () => {
      const { adm } = await admDeClubeNovo()
      const comPontoEVirgula = csv([['Nome', 'Nascimento', 'Sexo'], ['Silva; Ana', '10/03/2015', 'F']])
      const r1 = corpo<Previa>(await previa(adm.autorizacao, comPontoEVirgula, 'lista.csv').expect(200))
      expect(r1.linhas[0]).toMatchObject({ nome: 'Silva; Ana', nascimento: '2015-03-10', sexo: 'F' })
      const comVirgula = csv([['Nome', 'Nascimento', 'Sexo'], ['Souza, Bia', '2015-03-11', 'F']], ',')
      const r2 = corpo<Previa>(await previa(adm.autorizacao, comVirgula, 'lista.csv').expect(200))
      expect(r2.linhas[0]).toMatchObject({ nome: 'Souza, Bia', nascimento: '2015-03-11' })
    })

    it('duplicado contra o banco (inclusive inativo) e entre linhas: aviso, nao erro', async () => {
      const { clube, adm } = await admDeClubeNovo()
      await criarDbv({ clubeId: clube.id, nome: 'João Pedro', nascimento: '2015-03-10' })
      await criarDbv({ clubeId: clube.id, nome: 'Lia Inativa', nascimento: '2014-01-01', ativo: false })
      const arquivo = await xlsx([
        ['Nome', 'Data de nascimento', 'Sexo'],
        ['joao   pedro', '10/03/2015', 'M'],
        ['LIA INATIVA', '01/01/2014', 'F'],
        ['Rui Novo', '05/05/2015', 'M'],
        ['Rui  Novo', '2015-05-05', 'M'],
        ['João Pedro', '11/03/2015', 'M'],
      ])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas.map((l) => l.duplicado)).toEqual([true, true, false, true, false])
      expect(linhas.every((l) => l.erros.length === 0)).toBe(true)
      expect(linhas[0]?.avisos.map((a) => a.codigo)).toContain('AVISO_DUPLICADO')
    })

    it('unidade e classe nao encontradas viram aviso e celula vazia; nao cria unidade', async () => {
      const { clube, adm } = await admDeClubeNovo()
      const aguias = await criarUnidade({ clubeId: clube.id, nome: 'Águias', tipo: 'MISTA' })
      const amigo = await classeOficial('Amigo')
      const arquivo = await xlsx([
        ['Nome', 'Data de nascimento', 'Sexo', 'Unidade', 'Classe'],
        ['Ana Um', '10/03/2015', 'F', 'aguias', 'AMIGO'],
        ['Ana Dois', '10/03/2015', 'F', 'Falcões', 'Classe Inventada'],
      ])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas[0]).toMatchObject({ unidadeId: aguias.id, classeId: amigo.id, avisos: [] })
      expect(linhas[1]).toMatchObject({ unidadeId: null, classeId: null, erros: [] })
      expect(linhas[1]?.avisos.map((a) => a.mensagem)).toEqual([
        'A unidade Falcões não existe no clube',
        'A classe Classe Inventada não existe',
      ])
      expect(await prismaDeTeste().unidade.count({ where: { clubeId: clube.id } })).toBe(1)
    })

    it('classe desativada no clube conta como inexistente', async () => {
      const { clube, adm } = await admDeClubeNovo()
      const amigo = await classeOficial('Amigo')
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, ativa: false })
      const arquivo = await xlsx([['Nome', 'Data de nascimento', 'Sexo', 'Classe'], ['Ana Um', '10/03/2015', 'F', 'Amigo']])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas[0]?.classeId).toBeNull()
      expect(linhas[0]?.avisos.map((a) => a.mensagem)).toContain('A classe Amigo não existe')
    })

    it('classe vazia e sugerida pela idade no inicio do ano do clube; idade sem classe fica sem classe', async () => {
      const { adm } = await admDeClubeNovo()
      const amigo = await classeOficial('Amigo')
      const arquivo = await xlsx([
        ['Nome', 'Data de nascimento', 'Sexo'],
        ['Dez Anos', nascimentoComIdade(10), 'F'],
        ['Tres Anos', nascimentoComIdade(3), 'F'],
      ])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas[0]?.classeId).toBe(amigo.id)
      expect(linhas[0]?.avisos.map((a) => a.mensagem)).toEqual(['Classe sugerida pela idade: Amigo'])
      expect(linhas[1]).toMatchObject({ classeId: null, avisos: [] })
    })

    it('avisa unidade de sexo diferente, como no cadastro', async () => {
      const { clube, adm } = await admDeClubeNovo()
      await criarUnidade({ clubeId: clube.id, nome: 'Tigres', tipo: 'MASCULINA' })
      const arquivo = await xlsx([['Nome', 'Data de nascimento', 'Sexo', 'Unidade', 'Classe'], ['Ana Um', '10/03/2015', 'F', 'Tigres', 'Amigo']])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas[0]?.avisos.map((a) => a.mensagem)).toContain('A unidade Tigres é masculina.')
    })

    it('e-mail invalido e nome curto sao erro; entrada vazia vira hoje', async () => {
      const { adm } = await admDeClubeNovo()
      const arquivo = await xlsx([
        ['Nome', 'Data de nascimento', 'Sexo', 'E-mail', 'Entrada'],
        ['A', '10/03/2015', 'F', 'nao-e-email', null],
      ])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas[0]?.erros).toEqual(expect.arrayContaining(['O nome precisa ter de 2 a 120 letras.', 'E-mail inválido: nao-e-email']))
      expect(linhas[0]?.entradaEm).toBe(hoje())
    })

    it('recusa planilha com mais de 500 linhas', async () => {
      const { adm } = await admDeClubeNovo()
      const linhas: Celula[][] = [['Nome', 'Data de nascimento', 'Sexo']]
      for (let i = 0; i < 501; i++) linhas.push([`Pessoa ${i}`, '10/03/2015', 'F'])
      const resposta = await previa(adm.autorizacao, await xlsx(linhas)).expect(422)
      expect(resposta.body).toMatchObject({ codigo: 'REGRA', mensagem: 'A planilha tem 501 linhas; o limite é 500. Divida a planilha.' })
    })

    it('recusa planilha de 600 linhas dizendo quantas ela tem, em .xlsx e em .csv', async () => {
      const { adm } = await admDeClubeNovo()
      const linhas: string[][] = [['Nome', 'Data de nascimento', 'Sexo']]
      for (let i = 0; i < 600; i++) linhas.push([nomeDaPessoa(i), '10/03/2015', 'F'])
      const mensagem = 'A planilha tem 600 linhas; o limite é 500. Divida a planilha.'
      expect((await previa(adm.autorizacao, await xlsx(linhas)).expect(422)).body).toMatchObject({ codigo: 'REGRA', mensagem })
      expect((await previa(adm.autorizacao, csv(linhas), 'planilha.csv').expect(422)).body).toMatchObject({ codigo: 'REGRA', mensagem })
    })

    it('ignora colunas alem da 50a, no .xlsx e no .csv', async () => {
      const { adm } = await admDeClubeNovo()
      const vazias = Array.from({ length: 48 }, () => '')
      const linhas = [
        ['Data de nascimento', 'Sexo', ...vazias, 'Nome'],
        ['10/03/2015', 'F', ...vazias, 'Ana Clara'],
      ]
      expect(corpo<Previa>(await previa(adm.autorizacao, await xlsx(linhas)).expect(200)).colunasFaltando).toEqual(['Nome'])
      expect(corpo<Previa>(await previa(adm.autorizacao, csv(linhas), 'planilha.csv').expect(200)).colunasFaltando).toEqual(['Nome'])
    })

    it('recusa rapido o .xlsx que descompactado passa do teto, mesmo se o zip mentir o tamanho', async () => {
      const { adm } = await admDeClubeNovo()
      const bomba = await xlsx([['Nome', 'Data de nascimento', 'Sexo'], ['A'.repeat(40_000_000), '10/03/2015', 'F']])
      expect(bomba.length).toBeLessThan(1024 * 1024)
      const mensagem = 'A planilha é grande demais para importar.'
      for (const arquivo of [bomba, mentirNoTamanhoDescompactado(bomba, 100)]) {
        const inicio = performance.now()
        expect((await previa(adm.autorizacao, arquivo).expect(422)).body).toMatchObject({ codigo: 'REGRA', mensagem })
        expect(performance.now() - inicio).toBeLessThan(5_000)
      }
    }, 60_000)

    it('recusa arquivo que nao e .xlsx nem .csv', async () => {
      const { adm } = await admDeClubeNovo()
      await previa(adm.autorizacao, Buffer.from('oi'), 'foto.png').expect(422)
    })
  })

  describe('POST /desbravadores/importacao', () => {
    it('grava DBV com nome publico, membro de unidade e matriculas regular e avancada', async () => {
      const { clube, adm } = await admDeClubeNovo()
      const unidade = await criarUnidade({ clubeId: clube.id, tipo: 'FEMININA' })
      const amigo = await classeOficial('Amigo')
      const resposta = await confirmar(adm.autorizacao, [
        linhaPronta({ unidadeId: unidade.id, classeId: amigo.id, responsavelEmail: 'MAE@Exemplo.com' }),
        linhaPronta({ linha: 3, nome: 'Rui Barbosa', sexo: 'M' }),
      ]).expect(201)
      expect(resposta.body).toEqual({ importados: 2 })
      const prisma = prismaDeTeste()
      const maria = await prisma.desbravador.findFirstOrThrow({ where: { clubeId: clube.id, nome: 'Maria da Silva' } })
      expect(maria).toMatchObject({ tipo: 'DBV', nomePublico: 'Maria S.', responsavelEmail: 'mae@exemplo.com' })
      const membro = await prisma.membroUnidade.findFirstOrThrow({ where: { clubeId: clube.id, dbvId: maria.id } })
      expect(membro).toMatchObject({ unidadeId: unidade.id, fim: null })
      const matriculas = await prisma.matriculaClasse.findMany({
        where: { clubeId: clube.id, dbvId: maria.id },
        include: { classe: { select: { tipo: true } } },
      })
      expect(matriculas.map((m) => m.classe.tipo).sort()).toEqual(['AVANCADA', 'REGULAR'])
      expect(matriculas.every((m) => m.anoClube === anoCorrente() && m.status === 'CURSANDO')).toBe(true)
      expect(await prisma.desbravador.count({ where: { clubeId: clube.id } })).toBe(2)
    })

    it('uma linha com erro: 422 com os erros por linha e nada gravado', async () => {
      const { clube, adm } = await admDeClubeNovo()
      const resposta = await confirmar(adm.autorizacao, [
        linhaPronta(),
        linhaPronta({ linha: 7, nome: 'Z', responsavelEmail: 'ruim' }),
      ]).expect(422)
      const recusa = corpo<Recusa>(resposta)
      expect(recusa.codigo).toBe('REGRA')
      expect(recusa.erros.map((erro) => erro.linha)).toEqual([7])
      expect(recusa.erros[0]?.mensagens).toEqual(expect.arrayContaining(['O nome precisa ter de 2 a 120 letras.', 'E-mail inválido: ruim']))
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('500 linhas com todos os campos preenchidos: grava as 500', async () => {
      const { clube, adm } = await admDeClubeNovo()
      const unidade = await criarUnidade({ clubeId: clube.id, tipo: 'FEMININA' })
      const amigo = await classeOficial('Amigo')
      const linhas = Array.from({ length: 500 }, (_, i) =>
        linhaPronta({
          linha: i + 2,
          nome: nomeDaPessoa(i),
          unidadeId: unidade.id,
          classeId: amigo.id,
          responsavelNome: 'Joana Maria da Silva Albuquerque de Oliveira',
          responsavelTelefone: '(11) 99999-0000',
          responsavelEmail: 'joana.maria.albuquerque.oliveira@exemplo.com.br',
        }),
      )
      expect(Buffer.byteLength(JSON.stringify({ linhas }))).toBeGreaterThan(100 * 1024)
      expect((await confirmar(adm.autorizacao, linhas).expect(201)).body).toEqual({ importados: 500 })
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id } })).toBe(500)
    }, 180_000)

    it('corpo acima do limite responde no formato de erro do app, nao em HTML', async () => {
      const { adm } = await admDeClubeNovo()
      const resposta = await confirmar(adm.autorizacao, [linhaPronta({ responsavelNome: 'x'.repeat(3 * 1024 * 1024) })])
      expect(resposta.status).toBe(422)
      expect(resposta.headers['content-type']).toContain('application/json')
      expect(resposta.body).toEqual({ codigo: 'REGRA', mensagem: 'O envio passou do tamanho permitido.' })
    })

    it('duplicado marcado pelo Adm e importado mesmo assim', async () => {
      const { clube, adm } = await admDeClubeNovo()
      await criarDbv({ clubeId: clube.id, nome: 'Maria da Silva', nascimento: nascimentoComIdade(10) })
      await confirmar(adm.autorizacao, [linhaPronta()]).expect(201)
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id } })).toBe(2)
    })
  })

  describe('isolamento entre clubes e permissao', () => {
    it('unidade e classe de outro clube respondem como inexistentes na previa e na confirmacao', async () => {
      const { clube, adm } = await admDeClubeNovo()
      const outro = await criarClube()
      const unidadeDeFora = await criarUnidade({ clubeId: outro.id, nome: 'Unidade de Fora' })
      const classeDeFora = await criarClasseDoClube(outro.id, 'Classe de Fora')
      const arquivo = await xlsx([
        ['Nome', 'Data de nascimento', 'Sexo', 'Unidade', 'Classe'],
        ['Ana Um', '10/03/2015', 'F', 'Unidade de Fora', 'Classe de Fora'],
      ])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas[0]).toMatchObject({ unidadeId: null, classeId: null })
      expect(linhas[0]?.avisos.map((a) => a.codigo)).toEqual(['AVISO_UNIDADE_INEXISTENTE', 'AVISO_CLASSE_INEXISTENTE'])

      const recusa = corpo<Recusa>(
        await confirmar(adm.autorizacao, [linhaPronta({ unidadeId: unidadeDeFora.id, classeId: classeDeFora.id })]).expect(422),
      )
      expect(recusa.erros[0]?.mensagens).toEqual(['A unidade escolhida não existe no clube.', 'A classe escolhida não existe.'])
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('duplicado so conta dentro do proprio clube', async () => {
      const { adm } = await admDeClubeNovo()
      const outro = await criarClube()
      await criarDbv({ clubeId: outro.id, nome: 'Maria da Silva', nascimento: '2015-03-10' })
      const arquivo = await xlsx([['Nome', 'Data de nascimento', 'Sexo'], ['Maria da Silva', '10/03/2015', 'F']])
      const { linhas } = corpo<Previa>(await previa(adm.autorizacao, arquivo).expect(200))
      expect(linhas[0]?.duplicado).toBe(false)
    })

    it('sem dbv.cadastrar: 403 no modelo, na previa e na confirmacao', async () => {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      await request(servidor()).get('/api/desbravadores/importacao/modelo').set('Authorization', cons.autorizacao).expect(403)
      await previa(cons.autorizacao, await xlsx([['Nome', 'Data de nascimento', 'Sexo']])).expect(403)
      await confirmar(cons.autorizacao, [linhaPronta()]).expect(403)
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id } })).toBe(0)
    })
  })

  describe('GET /desbravadores/importacao/modelo', () => {
    it('entrega um .xlsx com o cabecalho e uma linha de exemplo', async () => {
      const { adm } = await admDeClubeNovo()
      const resposta = await request(servidor())
        .get('/api/desbravadores/importacao/modelo')
        .set('Authorization', adm.autorizacao)
        .buffer(true)
        .parse((res, feito) => {
          const partes: Buffer[] = []
          res.on('data', (parte: Buffer) => partes.push(parte))
          res.on('end', () => feito(null, Buffer.concat(partes)))
        })
        .expect(200)
      expect(resposta.headers['content-type']).toContain('spreadsheetml')
      const pasta = new ExcelJS.Workbook()
      await pasta.xlsx.load(new Uint8Array(resposta.body as Buffer).buffer)
      const planilha = pasta.worksheets[0]
      const cabecalho = (planilha?.getRow(1).values as unknown[]).slice(1)
      expect(cabecalho).toEqual(CABECALHO)
      expect(planilha?.rowCount).toBe(2)
    })
  })
})
