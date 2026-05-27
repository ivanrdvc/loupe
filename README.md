# loupe

[![CI](https://github.com/ivanrdvc/loupe/actions/workflows/ci.yml/badge.svg)](https://github.com/ivanrdvc/loupe/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ivanrdvc/loupe?include_prereleases&sort=semver)](https://github.com/ivanrdvc/loupe/releases)

Inspect AI agent traces, sessions, evals, and MCP activity in one local dashboard.

## Features

- Sessions, traces, and spans
- **Inspector**: the central view. Conversation, context stack, span tree, tool calls, and live messages for any session or trace.
- Prompts and notes
- Evals
- MCP

## Requirements

- Node 22, pnpm 10
- A telemetry backend that exposes OTel spans:
  - [OpenObserve](https://openobserve.ai) (default; works zero-config against the Docker image)
  - Azure Application Insights

## Quickstart

```bash
pnpm install
cp .env.example .env  # edit if not using local OpenObserve
pnpm dev
```

Open http://localhost:3000.

## Docs

See [`docs/`](docs/README.md) for architecture, attribute reference, and design plans.
