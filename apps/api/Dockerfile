FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl wget python3 make g++

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
RUN npm install --workspace=@aviator/shared --workspace=@aviator/api --include-workspace-root

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build -w @aviator/shared
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
WORKDIR /app/apps/api
EXPOSE 4000
# Migrate + seed demo users, then start API
CMD ["sh", "-c", "npx prisma migrate deploy && (npx prisma db seed || true) && node dist/main.js"]
