# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS web-build
WORKDIR /source/web
RUN npm install --global pnpm@10.17.0
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM rust:1.97.0-bookworm AS backend-build
WORKDIR /source
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
COPY tests/ tests/
RUN cargo build --release --locked -p ovload-server

FROM debian:bookworm-slim AS gateway
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 ovload && useradd --uid 10001 --gid ovload --no-create-home ovload
WORKDIR /app
COPY --from=backend-build /source/target/release/ovload-gateway /usr/local/bin/ovload-gateway
COPY --from=web-build /source/web/dist /app/web
COPY LICENSE COPYING THIRD_PARTY_NOTICES.md /app/licenses/
USER 10001:10001
ENV OVLOAD_LISTEN=0.0.0.0:8080 OVLOAD_WEB_DIR=/app/web
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 CMD curl --fail --silent http://127.0.0.1:8080/readyz || exit 1
STOPSIGNAL SIGTERM
ENTRYPOINT ["ovload-gateway"]
