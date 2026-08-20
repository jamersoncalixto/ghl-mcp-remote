# Genérico — roda em qualquer plataforma que aceite uma imagem Docker (Render, Fly.io,
# Railway, Antigravity, ECS, um VPS com `docker run`, etc.). Nenhuma config específica
# de plataforma está embutida aqui de propósito.

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY db ./db
COPY ghl-icon.svg ./ghl-icon.svg

# A plataforma que fizer o deploy define $PORT; o processo lê essa env em runtime.
EXPOSE 8080
CMD ["node", "dist/index.js"]
