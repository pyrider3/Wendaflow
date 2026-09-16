FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/postgres-server.mjs ./server/postgres-server.mjs
COPY deployment/migrate-legacy.mjs ./deployment/migrate-legacy.mjs
EXPOSE 8788
CMD ["node", "server/postgres-server.mjs"]
