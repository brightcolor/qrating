FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# nginx runs as the unprivileged user "nginx" of the image: the process id goes to /tmp, and the
# buffers for the API proxy go to a cache folder that belongs to that user. Port 80 stays, since
# Docker 20.10 every user inside a container may open it. The two checks stop the build when a
# newer base image writes its configuration differently.
RUN sed -i -e '/^user /d' -e 's,^pid .*,pid /tmp/nginx.pid;,' /etc/nginx/nginx.conf \
  && grep -q '^pid /tmp/nginx.pid;' /etc/nginx/nginx.conf \
  && ! grep -q '^user ' /etc/nginx/nginx.conf \
  && mkdir -p /var/cache/nginx \
  && chown -R nginx:nginx /var/cache/nginx
USER nginx
EXPOSE 80
# Healthy means nginx serves the start page. Compose can set the timing per service with "healthcheck:".
HEALTHCHECK CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
