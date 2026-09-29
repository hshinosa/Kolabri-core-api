# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS base
WORKDIR /app

RUN apk update && apk add --no-cache python3 make g++ openssl

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

# Compile TypeScript to dist/ and drop devDependencies (tsx, vitest, typescript, ...)
# prisma CLI stays: entrypoint runs `npx prisma migrate deploy` at boot.
RUN npm run build \
    && npm prune --omit=dev

FROM node:20-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl

# Owned by the unprivileged `node` user so the app can write exports/uploads.
COPY --from=base --chown=node:node /app/node_modules ./node_modules
COPY --from=base --chown=node:node /app/dist ./dist
COPY --from=base --chown=node:node /app/prisma ./prisma
COPY --from=base --chown=node:node /app/package.json ./package.json
COPY --chown=node:node entrypoint.sh ./

RUN chmod +x entrypoint.sh \
    && mkdir -p /app/exports /app/uploads /app/logs \
    && chown node:node /app/exports /app/uploads /app/logs

USER node

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/server.js"]
