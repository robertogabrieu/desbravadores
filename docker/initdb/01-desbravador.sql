-- O usuario postgres (superusuario) cria os bancos de teste, com OWNER desbravador.
-- Em dev, desbravador tambem tem CREATEDB: o `prisma migrate dev` cria e apaga um banco-sombra
-- para calcular a migration. O compose de producao nao usa este script.
CREATE ROLE desbravador LOGIN CREATEDB PASSWORD 'desbravador';
CREATE DATABASE desbravador OWNER desbravador;
