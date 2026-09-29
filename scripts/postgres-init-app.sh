#!/bin/sh
# Roda uma vez, na criacao do volume: o app nao usa o superusuario do Postgres.
set -e
psql -v ON_ERROR_STOP=1 -U postgres -v senha="$APP_DB_SENHA" <<'SQL'
CREATE ROLE desbravador LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'senha';
CREATE DATABASE desbravador OWNER desbravador;
SQL
