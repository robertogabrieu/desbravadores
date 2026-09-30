/**
 * Semeador dos specs do e2e: as mesmas fábricas do Jest (`apps/api/test/fabricas.ts`), apontadas
 * para o banco que o `global-setup` criou. A lógica das fábricas não é duplicada aqui.
 *
 * O cliente das fábricas nasce na primeira chamada e lê `DATABASE_URL`; por isso a variável é
 * trocada pela do e2e antes de qualquer fábrica rodar, ao importar este arquivo.
 */
const urlDoBancoDoE2e = process.env['E2E_DATABASE_URL']
if (!urlDoBancoDoE2e) throw new Error('E2E_DATABASE_URL ausente: o semeador só roda dentro do Playwright (global-setup)')
process.env['DATABASE_URL'] = urlDoBancoDoE2e

export * from '../../apps/api/test/fabricas'
