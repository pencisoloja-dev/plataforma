FROM node:18-alpine

# Instalar curl para health checks (más ligero que wget)
RUN apk add --no-cache curl

WORKDIR /app

# Copiar package.json
COPY package.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto del código
COPY . .

# Crear directorio de uploads
RUN mkdir -p /app/uploads && chmod 755 /app/uploads

# Exponer el puerto 80
EXPOSE 80

# Health check mejorado - espera más tiempo al inicio y usa curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

# Iniciar la app
CMD ["node", "index.js"]
