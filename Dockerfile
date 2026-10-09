# Stage 1: build client and server
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/

RUN npm ci && npm ci --prefix client && npm ci --prefix server

COPY client/ ./client/
COPY server/ ./server/

RUN npm run build && npm prune --omit=dev --prefix server


# Stage 2: runtime
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3080

COPY --from=builder /app/client/dist ./client/dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/
# Defaults baked in; mount ./config and ./content/log over these on the NAS.
COPY config/homelab.example.yaml ./config/homelab.example.yaml
COPY content/ ./content/

USER node
EXPOSE 3080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
