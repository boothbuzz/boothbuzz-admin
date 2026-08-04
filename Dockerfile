# --- Build stage ---
FROM node:20-alpine AS build

WORKDIR /app

# Vite bakes VITE_* vars at build time, so accept them as build args
ARG VITE_API_URL
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_APP_NAME="BoothBuzz Admin"
ARG VITE_APP_VERSION="1.0.0"
# Path prefix when served at https://boothbuzz.in/admin/
ARG VITE_BASE=/admin/

ENV VITE_API_URL=$VITE_API_URL \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_BASE=$VITE_BASE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Serve stage ---
FROM nginx:alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
