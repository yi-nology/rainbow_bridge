# syntax=docker/dockerfile:1

##
## Build configuration
##
ARG GO_VERSION=1.24

##
## Vue frontend build stage
##
FROM node:20-bookworm AS frontend-builder

ARG BASE_PATH

WORKDIR /frontend

COPY vue/package*.json ./
RUN npm ci

COPY vue/ ./

RUN if [ -n "$BASE_PATH" ]; then \
      export VITE_BASE_PATH="/${BASE_PATH}/"; \
    else \
      export VITE_BASE_PATH="/"; \
    fi && \
    npm run build -- --outDir dist

##
## Go build stage
##
FROM golang:${GO_VERSION}-bookworm AS go-builder

ARG TARGETOS
ARG TARGETARCH
ARG VERSION=dev
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ARG BASE_PATH

ENV CGO_ENABLED=0 \
    GOOS=${TARGETOS:-linux} \
    GOARCH=${TARGETARCH:-amd64} \
    GOPROXY=https://goproxy.cn,direct

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN mkdir -p pkg/static/web && touch pkg/static/web/.placeholder

RUN go build \
    -ldflags="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}' -X 'main.BasePath=${BASE_PATH}'" \
    -o /out/server ./cmd/server

RUN go build \
    -ldflags="-X 'main.Version=${VERSION}' -X 'main.GitCommit=${GIT_COMMIT}' -X 'main.BuildTime=${BUILD_TIME}' -X 'main.BasePath=${BASE_PATH}'" \
    -o /out/app ./cmd/app

##
## API runtime stage (target: api)
## Pure Go API server without frontend static files
##
FROM debian:bookworm-slim AS api

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 10001 rainbow

WORKDIR /app

COPY --from=go-builder /out/server /app/server
COPY config.yaml /app/config.yaml

RUN mkdir -p /app/data/uploads /var/lib/rainbow_bridge && chown -R rainbow:rainbow /app /var/lib/rainbow_bridge

USER rainbow

EXPOSE 8080

ENTRYPOINT ["/app/server"]
CMD ["--config", "/app/config.yaml"]

##
## App runtime stage (target: app)
## Full application with embedded frontend
##
FROM debian:bookworm-slim AS app

ARG BASE_PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget && \
    rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --uid 10001 rainbow

WORKDIR /app

COPY --from=go-builder /out/app /app/app
COPY --from=frontend-builder /frontend/dist/ /app/web/
COPY config.yaml /app/config.yaml

RUN mkdir -p /app/data/uploads /var/lib/rainbow_bridge && chown -R rainbow:rainbow /app /var/lib/rainbow_bridge

USER rainbow

EXPOSE 8080

ENTRYPOINT ["/app/app"]
CMD ["--config", "/app/config.yaml"]

##
## Frontend runtime stage (target: frontend)
## Nginx serving frontend static files, reverse proxy API to Go backend
##
FROM nginx:alpine AS frontend

ARG BASE_PATH

RUN rm -f /etc/nginx/conf.d/default.conf

COPY deploy/nginx/frontend.conf /etc/nginx/conf.d/default.conf

RUN if [ -n "$BASE_PATH" ]; then \
      mkdir -p /usr/share/nginx/html/${BASE_PATH}; \
      sed -i "s|location /api/|location /${BASE_PATH}/api/|g" /etc/nginx/conf.d/default.conf; \
      sed -i "s|location /ping|location /${BASE_PATH}/ping|g" /etc/nginx/conf.d/default.conf; \
      sed -i "s|location /assets/|location /${BASE_PATH}/assets/|g" /etc/nginx/conf.d/default.conf; \
      sed -i "s|location / {|location /${BASE_PATH}/ {|g" /etc/nginx/conf.d/default.conf; \
      sed -i "s|try_files \$uri \$uri/ /index.html|try_files \$uri \$uri/ /${BASE_PATH}/index.html|g" /etc/nginx/conf.d/default.conf; \
      sed -i "s|return 302 /;|return 302 /${BASE_PATH}/;|g" /etc/nginx/conf.d/default.conf; \
    fi

COPY --from=frontend-builder /frontend/dist/ /usr/share/nginx/html/${BASE_PATH}/

RUN if [ -n "$BASE_PATH" ]; then \
      echo 'return 302 /'${BASE_PATH}'/;' > /etc/nginx/conf.d/root-redirect.conf; \
    fi

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
