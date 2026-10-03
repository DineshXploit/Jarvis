# JARVIS

A cinematic, audio-reactive AI assistant. Fullscreen Electron interface with a
WebGL orb, voice conversation, web intelligence, and local PC control.

## Architecture

JARVIS runs **no AI model locally**. All inference happens on NVIDIA's cloud.
The local machine only renders, captures audio, moves bytes, and performs a
small allowlisted set of desktop actions.

```
  Microphone
      │
      ▼
  Renderer (Electron/Chromium)
    AudioWorklet capture → VAD → 16 kHz mono PCM → IPC
      │
      ▼
  Main process
    ┌──────────────────────────────────────────────┐
    │ Router  (openai/gpt-oss-20b, HTTP)           │
    │   ├── WEB_SEARCH → research() → SearXNG      │
    │   ├── PC_CONTROL → allowlisted local tools   │
    │   └── DIRECT_ANSWER                           │
    └──────────────────────────────────────────────┘
      │
      ▼
  python/nvcf/server.py   (localhost only, no model)
    NVCF function IDs resolved at startup, gRPC channel held open
      │
      ├── ASR  ai-nemotron-asr-streaming  ──┐
      └── TTS  ai-magpie-tts-multilingual ──┤ gRPC grpc.nvcf.nvidia.com:443
                                           │
      ◀──────────── audio back ────────────┘
      │
      ▼
  Speaker + audio-reactive orb
```

### Why there is a Python worker

NVIDIA's cloud speech NIMs have **no HTTP route**. They are NVCF functions served
over gRPC at `grpc.nvcf.nvidia.com:443`, selected by a function ID that rotates
between releases. `python/nvcf/server.py` resolves those IDs from the NVCF
catalogue at startup, keeps the channel open, and exposes a small localhost HTTP
API so the main process stays a plain HTTP client and the API key never enters
the renderer.

It loads no weights and initialises no CUDA context. The venv is ~240 MB and
holds only `nvidia-riva-client`, `numpy`, and `scipy`.

## Requirements

- Node.js 20+
- Python 3.12 (for the speech worker)
- Docker Desktop (only for the optional local SearXNG)
- An NVIDIA API key with access to the chat model and the speech NIMs

## Setup

```bash
npm install

# Create .env from the template and fill in NVIDIA_API_KEY
copy .env.example .env

# Python worker
python -m venv python\.venv
python\.venv\Scripts\python.exe -m pip install -r python\requirements.txt

# Optional: local web search
npm run search:up
```

## Run

```bash
npm run dev      # dev server + electron
npm start        # run the built app
npm run build    # production build
```

## Configuration

| Variable | Purpose |
|---|---|
| `NVIDIA_API_KEY` | Required. Backend only; never reaches the renderer. |
| `NVIDIA_BASE_URL` | LLM endpoint. Default `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | LLM. Default `openai/gpt-oss-20b` |
| `NVIDIA_ASR_FUNCTION` | NVCF ASR function name |
| `NVIDIA_TTS_FUNCTION` | NVCF TTS function name |
| `VOICE_TTS_ID` | Magpie voice, e.g. `Magpie-Multilingual.EN-US.Aria` |
| `NVCF_PORT` | Local speech worker port. Default `8758` |
| `SEARXNG_URL` | Local SearXNG. Default `http://localhost:8080` |

Function *names* are configured, not IDs: IDs rotate between releases, so the
worker resolves them from the NVCF catalogue on every start.

## Tests

```bash
npm run typecheck      # tsc
npm run speech:test    # NVIDIA ASR/TTS round-trip against the live service
npm run security:test  # PC control allowlist + prompt-injection routing
npm run nvidia:test    # LLM connectivity and router
npm run voice:vad:test # voice activity detection and barge-in (offline)
```

`speech:test` and `nvidia:test` require a valid `NVIDIA_API_KEY` and make real
network calls. They are the tests that decide whether the speech stack is
healthy, so they are not mocked.

## Security

- The NVIDIA API key lives only in the Electron main process and the speech
  worker's environment. It is passed to the worker via `env`, never `argv`,
  where it would be visible in a process listing. It never crosses the
  context bridge and is never logged unmasked.
- The speech worker binds to `127.0.0.1` only and refuses any other host.
- PC control is a fixed allowlist of six actions. The action name arrives from a
  language model, so it is re-validated against the allowlist before use, and
  the application registry contains no shell binary. There is no `shell: true`
  and no `exec` anywhere in the tool layer.
- Retrieved web content is passed to the model inside a delimited evidence block
  and is explicitly labelled untrusted. It is never treated as instructions.

## Extending

Two seams are prepared for NVIDIA services that are not wired up yet:

- `src/backend/tools/research.ts` — `research(query, options)`. Add a
  `ResearchProvider` for multi-step research, source comparison, or a research
  timeline. The UI and the voice pipeline need no changes.
- `src/backend/tools/retrieval.ts` — `retrieve(query, options)`. Add a
  `RetrievalProvider` backed by an NVIDIA embedding or retrieval endpoint.
  Deliberately no local embedding or reranking model.

---

# Cloud Deployment

JARVIS runs in two modes from one codebase.

| | Desktop (default) | Cloud backend |
|---|---|---|
| Runs on | your Windows PC | Linux container |
| Provides | UI, microphone, speaker, PC control, screenshots | routing, NVIDIA LLM, web intelligence, self-improvement analysis |
| Speech | NVIDIA NVCF gRPC worker, local | **not included** — stays on the PC |
| PC control | yes | **blocked by policy** |

The split is enforced in code, not by convention: the cloud server constructs
the router with `CLOUD_ROUTER_POLICY`, which cannot return `PC_CONTROL`. A cloud
client asking "open Chrome" gets a text answer explaining the capability is
local.

## Prerequisites

- Node.js 22+ (Docker image uses Node 24)
- Docker, for local testing
- An NVIDIA API key
- Optional: a SearXNG instance for web intelligence

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NVIDIA_API_KEY` | yes | NVIDIA LLM. Backend only, never logged or returned. |
| `NVIDIA_BASE_URL` | no | Defaults to `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | no | Defaults to `openai/gpt-oss-20b` |
| `PORT` | no | **Do not set on Render** — it injects `10000`. App defaults to `3000`. |
| `HOST` | no | Defaults to `0.0.0.0`. **Do not set loopback on any PaaS.** |
| `SEARXNG_URL` | no | Web-search backend |
| `TELEMETRY_LEVEL` | no | `debug`\|`info`\|`warn`\|`error` |
| `JARVIS_BACKEND_URL` | desktop only | Cloud backend URL. Empty means local mode. |

Copy `.env.example` to `.env` and fill it in. `.env` is git-ignored and excluded
from the Docker build by `.dockerignore`.

## Local Docker build and run

```bash
docker build -t jarvis-backend .

docker run --rm -p 3000:3000 \
  -e NVIDIA_API_KEY=your-key \
  -e PORT=3000 \
  -v jarvis-data:/app/data \
  jarvis-backend
```

Or with compose:

```bash
docker compose up -d jarvis-backend
docker compose logs -f jarvis-backend
docker compose down --remove-orphans
```

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness. **Never calls NVIDIA**, so an upstream outage does not cause a restart loop. |
| GET | `/ready` | Readiness. Reports router state and config validity. |
| GET | `/version` | Name and version. |
| GET | `/metrics` | Router latency by stage and action. |
| GET | `/self-improvement` | Read-only proposals and ledger summary. |
| POST | `/route` | Routing decision only, no model call. |
| POST | `/chat` | Full answer from the NVIDIA LLM. |
| POST | `/research` | Grounded web research with sources. |

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"jarvis","version":"1.0.0","uptime":6}

curl -X POST http://localhost:3000/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"What is the capital of France?"}'
```

## Persistent storage

The container filesystem is ephemeral. Mount a volume at `/app/data`:

| Path | Contents | Loss impact |
|---|---|---|
| `/app/data/telemetry.jsonl` | latency and failure events | Level 1 loses history |
| `/app/data/self-improvement/` | `ledger.json`, `audit.jsonl` | proposals and approvals lost |

Without a volume both regenerate, and the self-improvement subsystem restarts
from nothing each deploy. Logs are written to stdout, which the platform
captures, so no log volume is needed.

On Render: attach a **Persistent Disk** mounted at `/app/data`. Note that
Render does not support persistent disks on the Free instance type, so either
use a paid instance or accept losing this history.

## Render deployment

The repository includes a `render.yaml` Blueprint. Render builds from the
`Dockerfile` at the repo root; it does not use Compose, require a GPU, or need
Docker-in-Docker.

**Security warning:** Render web services are publicly reachable, and this
backend currently has no API authentication. Anyone who finds the service URL
can use its chat and research endpoints against your NVIDIA account. Do not
deploy it publicly with a paid API key until you add an authentication layer or
otherwise restrict access.

1. Push the repository to GitHub, making sure `.env` is not committed. It is
  ignored by Git; enter secrets in Render instead.
2. In Render, choose **New → Blueprint**, connect the GitHub repository, and
  apply the configuration from `render.yaml`.
3. Enter `NVIDIA_API_KEY` when Render prompts for the secret. `NVIDIA_MODEL`
  defaults to `openai/gpt-oss-20b`.
4. Deploy. The Blueprint uses the root `Dockerfile`, checks `/health`, and
  selects a Free instance by default.

Do not set `PORT`: Render injects it at runtime. `SEARXNG_URL` is optional; set
it to a reachable SearXNG instance if you need web search. The local Compose
service is not deployed to Render.

Your service is reachable at `https://<name>.onrender.com`.

### Verify after deploying

```bash
curl https://<name>.onrender.com/health
# {"status":"ok","service":"jarvis","version":"1.0.0","uptime":6}

curl https://<name>.onrender.com/ready
```

`/health` returns 200 without contacting NVIDIA, so an upstream outage will
never fail your deploy or trigger a restart loop.

### Render-specific behaviour worth knowing

- **Free instances sleep** after a period of inactivity. The first request
  after sleep is slow while the container restarts, and the restart re-reads
  nothing persistent. This is acceptable for chat, but it means the self-
  improvement ledger resets on every sleep cycle without a disk.
- **Health checks must return 2xx within 5 seconds.** `/health` does. `/ready`
  may return 503 when configuration is invalid — do not use `/ready` as the
  health check path, or a missing API key will block the deploy.
- **Deploys are triggered by pushes** to the connected branch.

## Northflank deployment

Northflank also builds from the repo `Dockerfile`, so the configuration is
equivalent.

1. **Push to GitHub.** The repository must be public or Northflank granted access.
2. **Create service → Combined → "Build and deploy a Git repo"** → pick the repo.
   (The "Deployment → Deploy a Docker image" path is *not* what you want: that
   expects a prebuilt image from a registry.)
3. **Environment variables:** `NVIDIA_API_KEY`, `HOST=0.0.0.0`, `NVIDIA_MODEL`,
   `SEARXNG_URL`. Again, leave `PORT` unset.
4. **Health check path:** `/health`
5. **Region:** prefer **Asia East** if you are in India.
6. **Volume:** attach persistent storage at `/app/data`.
7. **Deploy.** A payment method is required even on the Free tier, though the
   service is not charged.

## Switching between local and cloud

The desktop app decides at startup:

```bash
# Local mode (default). Everything in-process, no network dependency.
JARVIS_BACKEND_URL=

# Cloud mode. Only the text round trip moves; speech and PC control stay local.
JARVIS_BACKEND_URL=https://<your-service>.onrender.com
```

Restart the app after changing it. `/ready` on the cloud backend reports which
mode its clients are in.

## Security notes

- **No authentication.** The API is unauthenticated. **Do not expose it to the
  public internet without putting an auth layer in front.** Render's free\r\n  tier also exposes a public onrender.com hostname.
- **No shell, no filesystem, no arbitrary execution.** There is no endpoint for
  it, and a test asserts that `/exec`, `/shell`, `/file`, `/run` and similar all
  return 404.
- **PC control is impossible from the cloud**, enforced by the router policy.
- **Secrets never leave the backend.** Responses are scanned and the API key is
  redacted from every error before it is returned or logged.
- **Request limits:** 64 KB body cap, 120 s request timeout, structured JSON
  errors. Malformed input returns 4xx, not 5xx, so clients do not retry forever.
- **`JARVIS_BACKEND_URL` is scheme-validated**, so it cannot be pointed at
  `file://` or `javascript:`.
- Retrieved web content is untrusted data and is never executed.

## Verifying the deployment

```bash
npm run cloud:test   # 28 checks: startup, health, policy, validation, shutdown
npm run build:cloud  # build the bundle locally
npm run typecheck
npm run test         # the full desktop regression suite
```