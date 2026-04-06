# ── Stage 1: Build ────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.html ./
COPY tsconfig.json tsconfig.node.json ./
COPY vite.config.ts postcss.config.js tailwind.config.js ./
COPY src/ ./src/

RUN npm run build

# ── Stage 2: Production (nginx) ──────────────
FROM nginxinc/nginx-unprivileged:alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
