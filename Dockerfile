# Usar la imagen oficial de Node.js 18
FROM node:18-alpine

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar los archivos de configuración de la aplicación
COPY package.json ./
COPY package-lock.json ./

# Instalar las dependencias de la aplicación
RUN npm install

# Copiar el resto del código de la aplicación
COPY . .

# Crear el directorio de subidas
RUN mkdir -p /app/uploads

# Exponer el puerto en el que la aplicación se ejecutará
EXPOSE 3000

# El comando para iniciar la aplicación
CMD ["node", "index.js"]
