FROM oven/bun:1.2-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY migrations ./migrations
COPY src ./src

ENV PORT=4000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=5s \
  CMD curl -f http://127.0.0.1:4000/health || exit 1

CMD ["sh", "-c", "bun run src/config/migrator.ts && bun run src/server.ts"]
