FROM node:18-alpine

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

# SIN HEALTH CHECK - Easypanel lo manejará
# HEALTHCHECK removido temporalmente para debugging

# Iniciar la app
CMD ["node", "index.js"]
