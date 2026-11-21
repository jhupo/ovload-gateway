FROM node:22-bookworm-slim AS web-build
WORKDIR /source/web
RUN npm install --global pnpm@10.17.0 \
    --registry=https://registry.npmjs.org \
    --fetch-timeout=30000 --fetch-retries=1 --fetch-retry-mintimeout=1000
COPY web/package.json web/pnpm-lock.yaml ./
RUN --mount=type=cache,id=ovload-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY web/ ./
RUN pnpm build

FROM rust:1.99.1-bookworm AS backend-build
RUN apt-get update && apt-get install --no-install-recommends -y cmake \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /source
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY deploy/config.example.yaml deploy/config.example.yaml
COPY src/ src/
COPY tests/ tests/
ARG CARGO_PROFILE=release
ARG CARGO_BUILD_JOBS=1
ARG RUN_BACKEND_TESTS=false
ARG CPR_GIT_SHA=unknown
ARG CPR_BUILD_TIME=unknown
ENV CARGO_PROFILE_DEV_DEBUG=0 \
    CARGO_PROFILE_DEV_INCREMENTAL=false \
    CARGO_PROFILE_DEV_OPT_LEVEL=0 \
    CARGO_PROFILE_TEST_DEBUG=0 \
    CARGO_PROFILE_TEST_INCREMENTAL=false \
    CPR_BUILD_TYPE=docker
# Keep temporary object files off small disks; only the stripped binary is layered.
RUN --mount=type=cache,id=ovload-cargo-registry,target=/usr/local/cargo/registry \
    --mount=type=cache,id=ovload-cargo-git,target=/usr/local/cargo/git \
    --mount=type=tmpfs,target=/source/target \
    set -eu; \
    if [ "$RUN_BACKEND_TESTS" = true ]; then \
      cargo test --locked -p ovload-gateway --test main bootstrap::; \
    fi; \
    cargo build --locked -p ovload-gateway --profile "$CARGO_PROFILE"; \
    profile_directory="$CARGO_PROFILE"; \
    if [ "$CARGO_PROFILE" = dev ]; then profile_directory=debug; fi; \
    mkdir /output; \
    strip "/source/target/$profile_directory/ovload-gateway" -o /output/ovload-gateway

FROM debian:bookworm-slim AS gateway
RUN apt-get update && apt-get install --no-install-recommends -y ca-certificates curl gnupg \
    && curl --fail --silent --show-error https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo 'deb [signed-by=/usr/share/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install --no-install-recommends -y postgresql-client-18 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 ovload && useradd --uid 10001 --gid ovload --no-create-home ovload \
    && install -d -o ovload -g ovload -m 0700 /app/.runtime \
    && install -d -o ovload -g ovload -m 0750 /app/deploy
WORKDIR /app
COPY --from=backend-build /output/ovload-gateway /usr/local/bin/ovload-gateway
COPY --from=web-build /source/web/dist /app/web
COPY LICENSE COPYING THIRD_PARTY_NOTICES.md /app/licenses/
ARG CPR_GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$CPR_GIT_SHA
USER 10001:10001
ENV CPR_SERVER_HOST=0.0.0.0 \
    CPR_SERVER_PORT=8080 \
    CPR_WEB_DIST_DIR=/app/web \
    CPR_DEPLOYMENT_MODE=docker \
    CPR_UPDATE_EXE_PATH=/usr/local/bin/ovload-gateway \
    CPR_ENABLE_SELF_RESTART=false
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
    CMD curl --fail --silent http://127.0.0.1:8080/healthz || exit 1
STOPSIGNAL SIGTERM
ENTRYPOINT ["ovload-gateway"]
CMD ["serve"]
