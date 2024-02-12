FROM node:21.5-alpine as builder

WORKDIR /app
COPY package.json .
COPY package-lock.json .
RUN npm ci
COPY . .
RUN npx tsc

FROM node:21.5-alpine as release

RUN apk --no-cache add shadow \
&& deluser --remove-home node \
&& groupmod --gid 65532 users \
&& apk del shadow
WORKDIR /app
COPY docker-entrypoint.sh /usr/local/bin
COPY --from=builder /app/package.json .
COPY --from=builder /app/package-lock.json .
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist/src ./src
RUN npm prune --omit=dev

EXPOSE 3000

CMD ["node", "/app/src/index.js"]
