FROM node:18-alpine AS dependencies

# Instalar herramientas de compilación para dependencias nativas
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl

WORKDIR /app

# Copiar solo los archivos de dependencias
COPY package.json package-lock.json* ./

# Instalar todas las dependencias (incluyendo dev para building)
RUN npm ci --no-audit --no-fund

FROM node:18-alpine AS runtime

# Solo curl para health checks en runtime
RUN apk add --no-cache curl

WORKDIR /app

# Copiar node_modules desde la etapa de dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copiar el resto de la aplicación
COPY . .

# Crear directorio de uploads
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

CMD ["node", "index.js"]
