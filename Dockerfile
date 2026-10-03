# JARVIS cloud backend
#
# Builds ONLY the Node backend bundle. The Electron desktop app, the renderer,
# three.js and the Python NVCF speech worker are deliberately excluded: none of
# them belong in a Linux container, and carrying them would add ~400 MB and a
# GUI dependency for nothing.
#
# Build:  docker build -t jarvis-backend .
# Run:    docker run -p 3000:3000 -e NVIDIA_API_KEY=... jarvis-backend

# ---------------------------------------------------------------------------
# Stage 1: install build-time dependencies and produce the bundle.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build

WORKDIR /app

# Copy manifests first so `npm ci` is cached independently of source changes.
# --include=dev because TypeScript and Vite are required to build; the runtime
# stage below installs production dependencies only.
#
# ELECTRON_SKIP_BINARY_DOWNLOAD avoids pulling a ~370 MB Electron binary into a
# Linux container that will never render a window. The package still resolves,
# it just ships without the prebuilt binary.
COPY package.json package-lock.json ./
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --include=dev --no-audit --no-fund

COPY tsconfig.json vite.cloud.config.ts ./
COPY src ./src

RUN npm run build:cloud

# ---------------------------------------------------------------------------
# Stage 2: production dependencies only.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps

WORKDIR /app
COPY package.json package-lock.json ./
# Only dependencies, not devDependencies: no Electron, Vite or TypeScript in
# the final image.
RUN npm ci --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stage 2b: the Python speech worker.
#
# NVIDIA's cloud speech NIMs are gRPC/NVCF functions with no HTTP route, so
# recognition and synthesis need the riva client. Putting it in the image is what
# lets the API expose /stt and /tts, which in turn is what lets a phone speak
# and listen: the worker cannot run on Android.
#
# No local model is installed or downloaded. This image relays gRPC to NVIDIA.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS pyspeech

# build-essential is needed by scipy/numpy wheels that have no manylinux build;
# it stays in this stage so it never reaches the runtime image.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip libsndfile1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /speech
COPY python/requirements.txt ./
RUN python3 -m venv /opt/speech-venv \
 && /opt/speech-venv/bin/pip install --no-cache-dir -r requirements.txt

# ---------------------------------------------------------------------------
# Stage 3: runtime.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

# dumb-init gives PID 1 correct signal forwarding, so SIGTERM reaches Node and
# the graceful shutdown path actually runs. Without it Node is PID 1 and
# signals can be swallowed, which on a container platform means a 30s kill.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init python3 libsndfile1 \
 && rm -rf /var/lib/apt/lists/*

# NODE_ENV and HOST are safe to fix here. PORT is deliberately NOT set.
#
# PaaS platforms inject PORT at runtime (Render uses 10000) and discover the
# bound port from outside the container's network namespace. An ENV default of
# 3000 can shadow the injected value, leaving the platform scanning a port
# nothing is listening on and failing the deploy. The application already falls
# back to 3000 when PORT is unset, which covers local `docker run`.
ENV NODE_ENV=production \
    HOST=0.0.0.0

WORKDIR /app

# node:24-bookworm-slim already ships a non-root `node` user (uid 1000).
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist-cloud ./dist-cloud

# The speech worker and its virtualenv. The worker is the same code the desktop
# app spawns, so there is one implementation rather than two.
COPY --from=pyspeech --chown=node:node /opt/speech-venv /opt/speech-venv
COPY --chown=node:node python/nvcf /app/python/nvcf
ENV SPEECH_PYTHON=/opt/speech-venv/bin/python

# Writable mount point for telemetry and the improvement ledger. Must be a
# volume to survive restarts; see README "Persistent storage".
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

# Uses /health, which never calls NVIDIA. A readiness probe that depended on
# NVIDIA would restart the container during an upstream outage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist-cloud/server.js"]