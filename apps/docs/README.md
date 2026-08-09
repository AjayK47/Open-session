# Open Session API docs (Mintlify)

This folder is a self-contained [Mintlify](https://mintlify.com) project — the same style of docs SessionBoard itself links to (`sessionboard.mintlify.app`).

## What's in here

- `docs.json` — site config, nav, theme
- `openapi.json` — a snapshot of the live API's OpenAPI schema. Mintlify turns this into the full API Reference tab automatically — every endpoint, every request/response shape, with a live "Try it" panel, no hand-written page per route.
- `introduction.mdx`, `quickstart.mdx`, `authentication.mdx` — the hand-written guide pages.

## Refreshing the OpenAPI snapshot

Whenever the API's routes or schemas change, regenerate `openapi.json` from a running server:

```bash
# with the API running locally on :8000
curl -s http://localhost:8000/openapi.json > apps/docs/openapi.json
```

## Publishing

1. Create a free account at [mintlify.com](https://mintlify.com) and connect this GitHub repo.
2. Point it at the `apps/docs` directory.
3. Mintlify builds and deploys automatically on every push to this folder — no CLI install, no build step to run yourself.

To preview locally first (optional):

```bash
npm install -g mint
cd apps/docs
mint dev
```
