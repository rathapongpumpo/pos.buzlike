FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts/prisma-provider.mjs ./scripts/prisma-provider.mjs
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_APP_URL=http://localhost:3100
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build
RUN mkdir -p data/slips && chown -R node:node /app
USER node
ENV NODE_ENV=production
EXPOSE 3100
CMD ["sh","-c","npx prisma migrate deploy && npx next start --hostname 0.0.0.0 --port 3100"]
