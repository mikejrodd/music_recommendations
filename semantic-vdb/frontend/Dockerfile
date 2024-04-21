FROM node:18.18.1-alpine AS deps
WORKDIR /app

RUN apk add libc6-compat

COPY public/ public/
COPY package* ./
COPY next* ./
COPY postcss* ./
COPY tsconfig.json ./
COPY tailwind.config.ts ./

RUN npm install 

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
RUN mkdir -p .next
RUN chown nextjs:nodejs .next


USER nextjs

EXPOSE 8000
ENV PORT 8000
ENV HOSTNAME "0.0.0.0"

CMD [ "npm", "run", "dev"]
