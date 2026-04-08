FROM node:22-alpine

WORKDIR /app

COPY server.js .
COPY index.html .
COPY admin.html .

RUN mkdir -p /app/data

EXPOSE 80

CMD ["node", "server.js"]
