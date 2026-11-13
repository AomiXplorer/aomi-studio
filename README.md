# Aomi

An AI coding agent and creative studio in one web app. You describe what you want,
Aomi plans it, writes real files into an isolated workspace, edits them, checks the
result and hands you a ZIP that actually contains the project.

Built with TypeScript, Next.js App Router, React, Tailwind CSS and Lucide icons.

## What it does

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
    api/            route handlers (chat SSE, projects, files, assets, export, image, audio)
    chat/ projects/ studio/ settings/     pages
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

`npm run build` passes on Next.js 16 with Turbopack. Two things matter on Vercel:

1. **Storage.** The default `fs` driver writes to the instance filesystem, which is
   ephemeral on Vercel. Set `AOMI_STORAGE=s3` with an S3-compatible bucket
   (Cloudflare R2, Backblaze B2, MinIO, AWS) for workspaces that survive redeploys.
   The settings page reports the active driver and whether it persists.
2. **Time.** Chat runs stream through a route handler with `maxDuration = 300`. Hobby
   plans cap function duration lower; long agent runs should be given the duration your
   plan allows, or run on a Node host without that ceiling.

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
- Headless Chrome check: no horizontal overflow on any page at 1440x900 or 390x844,
  background `#09090b`.

## Known limits

- Image and audio generation stay unverified end to end until the provider account has
  image quota and a voice plan. The code paths are real and their errors are honest.
- Static project checks are not a production build: no bundler, no type check of user
  code, no dependency install on the server.
- `install_dependencies` pins versions from the npm registry; installation happens on
  the machine that unpacks the exported ZIP.
