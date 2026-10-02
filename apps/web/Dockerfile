# Contexto de build: a raiz do repositorio (docker-compose.prod.yml aponta para ela).
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts -w web -w @desbravadores/shared

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# Só neste estágio: o token sobe os mapas do código ao Sentry e não chega à imagem final. Vazio, o
# build segue sem mapas.
ARG SENTRY_AUTH_TOKEN=""
ARG SENTRY_PROJECT=""
ARG SENTRY_RELEASE=""
RUN npm run build -w packages/shared && npm run build -w web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
