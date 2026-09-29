# Contexto de build: a raiz do repositorio (docker-compose.prod.yml aponta para ela).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Sem scripts: o postinstall do repositorio precisa do codigo, que so entra depois.
RUN npm ci --ignore-scripts -w api -w @desbravadores/shared \
  && npm rebuild @prisma/engines \
  && mkdir -p apps/api/node_modules

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared \
  && npx -w api prisma generate \
  && npm run build -w api

FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app/apps/api
ENV NODE_ENV=production CARGA_DIR=/app/dados ARQUIVOS_DIR=/app/arquivos

# node_modules inteiro: o `prisma migrate deploy` da entrada precisa do CLI (devDependency).
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json
COPY --from=build /app/packages/shared/dist /app/packages/shared/dist
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./package.json
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/apps/api/dist ./dist
COPY docs/planejamento/dados /app/dados

# O volume `arquivos` herda o dono desta pasta na primeira subida.
RUN mkdir -p /app/arquivos && chown node:node /app/arquivos

USER node
EXPOSE 3001
# Scripts de operacao (dentro do container): node dist/scripts/clube-criar.js e node dist/scripts/carga.js
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
