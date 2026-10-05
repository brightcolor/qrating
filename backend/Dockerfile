FROM node:22-alpine

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend ./
COPY database /app/database
# The API runs as the unprivileged user "node" of the image (UID 1000) and reads its code as it
# was copied. It writes below /app/storage only, the cache of event images, so that folder
# belongs to it. A bind mount brings the owner of the folder on the host along (see README).
RUN mkdir -p /app/storage/event-images && chown -R node:node /app/storage
USER node
EXPOSE 4000
# Healthy means the API answers and reaches its database. The port follows the setting PORT;
# Compose can set the timing per service with "healthcheck:".
HEALTHCHECK CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-4000}/health/ready" || exit 1
CMD ["npm", "start"]
