# Image of mytasks-web: Vite build served by an unprivileged Nginx on port 8080.
# This Dockerfile is an exception to the Buildpacks default (research R13): a static SPA
# with a runtime-generated /config.js is not what the Node buildpack serves.
#
# The image is identical in every environment: nothing environment-specific is baked into
# the build. The container generates /config.js and the CSP from its environment variables
# on startup (nginx/docker-entrypoint.d/40-runtime-config.sh).
#
# Base images are pinned by digest (Principio III). To bump them, pull the new tag, copy
# its digest here and let the pipeline rebuild: the Dockerfile is part of the tree hash.

# node:22-alpine
FROM node@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# .dockerignore keeps .env*, node_modules and dist out of the context, so no VITE_*
# variable can leak into the bundle.
COPY . .
RUN npm run build

# nginxinc/nginx-unprivileged:stable-alpine (nginx 1.30)
FROM nginxinc/nginx-unprivileged@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3

USER root
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 nginx/docker-entrypoint.d/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh

# The startup script runs as the nginx user: it rewrites config.js and creates the
# headers snippet, so only those two paths are made writable for it.
RUN mkdir -p /etc/nginx/snippets \
    && chown nginx:nginx /etc/nginx/snippets /usr/share/nginx/html/config.js

USER 101
EXPOSE 8080
