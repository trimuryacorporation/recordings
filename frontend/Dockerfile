FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend/package.json package.json
RUN npm install

FROM deps AS build
COPY frontend .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
