# Usar la imagen oficial de Node.js 18
FROM node:18-alpine

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias primero (para cache de Docker)
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar el resto del código
COPY . .

# Crear directorio de uploads con permisos
RUN mkdir -p /app/uploads && \
    chmod 755 /app/uploads

# Exponer el puerto
EXPOSE 3000

# Health check para Docker/Easypanel
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando para iniciar la aplicación
CMD ["node", "index.js"]
