FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
RUN npm install

FROM deps AS build
COPY backend backend
WORKDIR /app/backend
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/backend/dist backend/dist
COPY backend/package.json backend/package.json
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
