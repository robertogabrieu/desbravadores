-- O usuario postgres (superusuario, com CREATEDB) cria os bancos de teste;
-- desbravador e o dono do banco de dev e dos bancos de teste, sem privilegio de criar bancos.
CREATE ROLE desbravador LOGIN PASSWORD 'desbravador';
CREATE DATABASE desbravador OWNER desbravador;
