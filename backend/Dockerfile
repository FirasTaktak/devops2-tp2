# ---- 1. Build : dépendances + panneau d'administration ----
FROM node:22-alpine AS build
WORKDIR /opt/app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 2. Image d'exécution ----
FROM node:22-alpine
WORKDIR /opt/app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /opt/app ./
USER node
EXPOSE 1337
CMD ["npm", "run", "start"]
