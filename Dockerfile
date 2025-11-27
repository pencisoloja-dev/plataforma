FROM node:18-alpine

# Instalar dependencias del sistema primero
RUN apk add --no-cache curl python3 make g++

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json package-lock.json* ./

# Instalar dependencias con fallback
RUN npm ci --production --no-audit --no-fund || \
    (echo "Fallback to npm install..." && npm install --production --no-audit --no-fund)

# Copiar aplicación
COPY . .

# Configurar permisos
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

CMD ["node", "index.js"]
