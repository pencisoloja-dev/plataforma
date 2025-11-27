FROM node:16-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json ./

RUN npm install --production --no-audit --no-fund --legacy-peer-deps --no-optional

COPY . .

RUN mkdir -p /app/uploads && chmod 755 /app/uploads

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

CMD ["node", "index.js"]
