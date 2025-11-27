FROM node:18-alpine

# Instalar curl para health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copiar SOLO los archivos necesarios para instalar dependencias
COPY package*.json ./

# Verificar que package.json existe y mostrar información útil
RUN cat package.json && npm config list

# Limpiar cache de npm y instalar dependencias con verbose
RUN npm cache clean --force && \
    npm install --production --verbose

# Copiar el resto del código
COPY . .

# Crear directorio de uploads
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

CMD ["node", "index.js"]
