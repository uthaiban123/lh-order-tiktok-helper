FROM node:20-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY public ./public
COPY src ./src
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json

USER node

EXPOSE 6600

CMD ["node", "src/server.js"]
