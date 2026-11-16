FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production DB_PATH=/data/bot.db
VOLUME /data
EXPOSE 3000
CMD ["node", "src/server.js"]
