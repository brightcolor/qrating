FROM node:22-alpine

WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY database ./database
WORKDIR /app/backend
EXPOSE 4000
CMD ["npm", "start"]
