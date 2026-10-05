FROM node:22-alpine

WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY database ./database
# The API runs as the unprivileged user "node" of the image (UID 1000) and reads its code as it
# was copied. It writes below /app/storage only, the cache of event images, so that folder
# belongs to it. A bind mount brings the owner of the folder on the host along (see README).
RUN mkdir -p /app/storage/event-images && chown -R node:node /app/storage
USER node
WORKDIR /app/backend
EXPOSE 4000
CMD ["npm", "start"]
