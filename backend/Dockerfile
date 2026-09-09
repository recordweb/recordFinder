FROM node:20-alpine
WORKDIR /app
COPY backend/package.json .
RUN npm install --production
COPY backend/server.js backend/fabricConnect.js backend/mockResolver.js .
COPY frontend ./frontend
EXPOSE 3000
CMD ["node", "server.js"]