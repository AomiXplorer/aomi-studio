# Aomi

An AI coding agent and creative studio in one web app. You describe what you want,
Aomi plans it, writes real files into an isolated workspace, edits them, checks the
result and hands you a ZIP that actually contains the project.

Built with TypeScript, Next.js App Router, React, Tailwind CSS and Lucide icons.

## What it does

- **A public introduction, then a gate.** `/` is a landing page anyone can read; the
  workspace behind it still requires a signed session. Signed-in visitors are taken
  straight to `/chat` instead of being asked again.
- **Chat with an agent, not a chatbot.** Every turn can call tools that create, read,
  edit, rename and delete files in the current project workspace.
- **Code workspace.** File explorer, multi-tab editor (CodeMirror 6), per-file diff of
  what the agent changed, static project checks, HTML preview, download.
- **Projects.** One isolated workspace per project, stored under its own id.
- **Image studio.** Real text-to-image through the provider's image endpoint.
- **Audio studio.** Real text-to-speech through the provider's speech endpoint and voice
  catalogue.
- **Export.** Server-built ZIP of every file plus generated assets.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in BANGUNWEB_API_KEY
npm run dev                  # http://localhost:3000
```

Production check:

```bash
npm run build
npm run start
```

Optional headless UI check (needs a running server and a project id):

```bash
node scripts/ui-check.mjs <projectId>
```

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `BANGUNWEB_BASE_URL` | yes | Provider base URL, default `https://router.bangunweb.com/v1` |
| `BANGUNWEB_API_KEY` | yes | Server-only key. Never exposed to the client bundle. |
| `BANGUNWEB_MODEL` | yes | Default chat model, e.g. `bw-swift` |
| `BANGUNWEB_IMAGE_MODEL` | no | Default image model, e.g. `bwr-image` |
| `BANGUNWEB_AUDIO_MODEL` | no | Default speech model, e.g. `kokoro` |
| `BANGUNWEB_AUDIO_VOICE` | no | Default voice id |
| `AOMI_STORAGE` | no | `fs` (default) or `s3` |
| `AOMI_CLIENT_STORAGE` | no | `1` forces browser storage, `0` forces server storage; empty auto-detects from whether the disk persists |
| `AOMI_WORKSPACE_DIR` | no | Base directory for the `fs` driver |
| `S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_PREFIX` | for `s3` | Object storage for persistent workspaces |
| `AOMI_MAX_STEPS` | no | Max agent steps per turn (default 14) |
| `AOMI_RATE_LIMIT_PER_MIN` | no | Requests per minute per IP (default 30) |

## Provider capability matrix

Measured against the live router on 2026-11-14, not assumed:

| Capability | Endpoint | Status |
| --- | --- | --- |
| Chat completions | `POST /chat/completions` | Works |
| Streaming (SSE) | same, `stream: true` | Works, sends `: keep-alive` comments |
| Tool calling | same, `tools` + `tool_choice` | Works, parallel calls supported |
| Model catalogue | `GET /models` | Works, 73 models with capability metadata |
| Image generation | `POST /images/generations` | Endpoint works, billed 2,000,000 tokens per image |
| Voice catalogue | `GET /audio/voices` | Works |
| Speech generation | `POST /audio/speech` | Requires a purchased voice plan on the provider account |

Nothing is faked. When the provider refuses (quota, unpaid plan), Aomi shows the
provider's own message instead of a placeholder result.

## Architecture

```
src/
  app/
    page.tsx        public introduction (static, no session read)
    api/            route handlers (chat SSE, projects, files, assets, export, image, audio)
    chat/ projects/ studio/ settings/     pages (session required)
  components/
    chat/           conversation, markdown, tool timeline, status rail, composer
    workspace/      file tree, editor, diff, workspace shell
    studio/         image studio, audio studio
    settings/       model + provider + storage status
  lib/
    ai/             provider adapter, capability types, config
    agent/          engine loop, system prompt, tool registry
    agent/tools/    filesystem, project and code tools
    workspace/      storage drivers, path guards, projects service, templates
    services/       export (ZIP), analysis, dependency resolution, rate limit
```

### Routes and who may open them

| Route | Access | Notes |
| --- | --- | --- |
| `/` | public | Introduction. Static shell; the only per-visitor detail (a way back inside) is decided in the browser. |
| `/login` | public | The gate. A valid session here redirects to `/chat`. |
| `/buy`, `/buy/pay`, `/buy/success` | public | Checkout is protected by a per-order token, not by the session. |
| `/chat`, `/projects`, `/projects/[id]`, `/studio/*`, `/settings` | session | Redirect to `/login?next=…` without a cookie. |
| `/admin` | admin | 403 for a plain user, redirect for a visitor. |
| `/api/*` | session | Machine routes (`/webhook/austinpay`, `/api/telegram/webhook`, `/api/cron/backup`, `/api/ops/provider`) verify their own caller. |

`src/proxy.ts` enforces this before any handler runs; `lib/auth/headers.ts` holds the
public path list.

The provider sits behind one adapter (`lib/ai/bangunweb.ts`) that normalises model
metadata, streaming events, tool calls and errors. Adding another provider means
implementing the same surface and registering it, not editing the agent.

## Agent tools

Filesystem: `create_file`, `read_file`, `write_file`, `edit_file`, `delete_file`,
`rename_file`, `list_files`, `search_in_files`.

Project: `create_project`, `generate_project`, `analyze_project`, `inspect_structure`,
`install_dependencies`, `export_project`.

Code: `analyze_code` (static), `debug_code`, `refactor_code`, `review_code`,
`explain_code`.

Every tool validates its arguments with Zod before running, and every filesystem tool
goes through the same path guard.

## Security

- The API key is read server-side only and never appears in the client bundle or a
  response body.
- All provider calls happen in route handlers.
- Path traversal, absolute paths, drive letters and reserved directories are rejected
  (`lib/workspace/paths.ts`); failures return 400, not 500.
- Per-file size and total file caps; uploads are MIME- and size-validated.
- Per-IP rate limits on chat, image and audio routes.
- No shell execution and no user code execution on the server: project checks are
  static analysis, and they are labelled that way in the UI.

## Deploying to Vercel

`npm run build` passes on Next.js 16 with Turbopack, and the app has been deployed and
exercised on Vercel. Three things matter there:

1. **Storage.** Vercel functions get a fresh `/tmp` per instance, so a server-side
   workspace disappears between requests. Pick one:
   - Browser storage (automatic when the disk cannot persist, no extra service): the
     browser keeps projects, files and messages in localStorage and sends the workspace
     with each request; the server rebuilds it in memory for that request, so tools,
     checks and export keep working. Verified with `scripts/client-mode-check.mjs`.
   - `AOMI_STORAGE=s3` with an S3-compatible bucket (R2, B2, MinIO, AWS) when you want
     the server to own the files.
   The settings page reports which driver is active and whether it persists.
2. **Duration.** Route handlers use `maxDuration = 60`, the maximum this plan tier
   accepts. A longer agent run needs a host without that ceiling.
3. **Secrets.** `BANGUNWEB_API_KEY` belongs in the Vercel project's environment
   variables, never in the repository.

Also required: `BANGUNWEB_API_KEY`, `BANGUNWEB_BASE_URL`, `BANGUNWEB_MODEL` in the
project's environment variables. Nothing else is needed for the app to boot.

## Verified behaviour

Tested on 2026-11-14 against the live provider and a local production build:

- Agent build: "one-page programmer portfolio" produced `index.html`, `styles.css`,
  `script.js` with real content, then ran `analyze_project` (0 errors).
- `install_dependencies` resolved `zod` and `lucide-react` from the npm registry and
  wrote `package.json`.
- `export` returned a valid ZIP whose entries were byte-identical to the workspace files.
- Path traversal attempts on read and write returned 400.
- Upload accepted `text/plain` and rejected an executable MIME type with 415.
- Rate limiting returned 429 after the configured budget.
- Image generation returned the provider's 402 quota message; speech returned the
  provider's 403 plan message. Both surfaced word for word in the UI.
- Client storage mode end to end in headless Chrome: project created through the UI,
  agent wrote `catatan.txt`, workspace reloaded from browser storage and shown in the
  file tree, conversation intact. Repeated against the live Vercel deployment.
- ZIP download through the workspace button with browser-held files
  (`scripts/zip-check.mjs`): archive held both files plus `AOMI-PROJECT.md`.
- Static check flags an unclosed brace in a JS file and stays quiet on valid code.
- Headless Chrome check: no horizontal overflow on any page at 1440x900 or 390x844,
  background `#09090b`.
- Introduction page (2026-11-15): no horizontal overflow at 320, 360, 390, 430, 768,
  1024 and 1440; the hero's Get Started button stays above the fold on every phone
  width; all 17 scroll-reveal blocks resolve; the anchor from Explore Features lands
  82px clear of the sticky bar; with `prefers-reduced-motion: reduce` nothing is hidden
  and no parallax runs; every text node measured at 4.5:1 or better against `#08080a`.
- Routing (2026-11-15): `/`, `/login`, `/buy` answer 200 without a cookie, `/chat`,
  `/projects`, `/settings` and `/admin` answer 307 to `/login?next=…`, owner sign-in
  lands on `/chat`, a signed-in visit to `/login` goes to `/chat`, and the landing page
  swaps both of its calls to action for "Open workspace" once a session exists.

## Known limits

- Image and audio generation stay unverified end to end until the provider account has
  image quota and a voice plan. The code paths are real and their errors are honest.
- Static project checks are not a production build: no bundler, no type check of user
  code, no dependency install on the server.
- `install_dependencies` pins versions from the npm registry; installation happens on
  the machine that unpacks the exported ZIP.

## Owner credentials (private repo, optional but recommended)

The login reads its accounts from the first source that answers:

1. a **private GitHub repo** file, when `AOMI_CONFIG_REPO` and `AOMI_CONFIG_TOKEN` are set;
2. otherwise the `AOMI_AUTH_JSON` environment variable (base64 or raw JSON of the same file).

Only a scrypt hash is stored. The plaintext password exists nowhere: not in the repo, not in
the env vars, not in the bundle.

| Variable | Where it lives | Meaning |
| --- | --- | --- |
| `AOMI_CONFIG_REPO` | Vercel env | `owner/aomi-config` (private) |
| `AOMI_CONFIG_TOKEN` | Vercel env | read-only token for that repo (Contents: read) |
| `AOMI_CONFIG_PATH` | optional | defaults to `auth.json` |
| `AOMI_CONFIG_REF` | optional | defaults to `main` |
| `AOMI_AUTH_JSON` | Vercel env | fallback copy of the same JSON |

Setup: create a private repo, add `auth.json` built from `docs/auth.example.json` with the hash
printed by `npm run hash-password -- "<password>"`, then point `AOMI_CONFIG_REPO` at it.
The loader caches for five minutes, revalidates with an ETag, and falls back to the env copy or
the last good config if GitHub is unreachable, so a repo outage never locks the owner out.
`npm run check:config-source` exercises those paths against a stubbed GitHub API.

