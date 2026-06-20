FROM oven/bun:1-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash postgresql-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

RUN chmod +x ./scripts/db-migrate.sh

ENV NODE_ENV=production
EXPOSE 3001

CMD ["bash", "-lc", "./scripts/db-migrate.sh && bun src/server.ts"]
