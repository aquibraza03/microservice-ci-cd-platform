FROM node:18-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY src ./src

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health')"

CMD ["node", "src/server.js"]
