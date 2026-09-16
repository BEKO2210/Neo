# Neo — Command Center

A multi-account operations console: a 3D fleet view, multi-provider LLM chat
with real tool calls, a four-agent mission pipeline, live GitHub activity, and
device telemetry pushed by a single Python file you copy onto your own boxes.

Everything runs in your deployment. Each account signs in with its own email
and password, sees only its own machines, and brings its own API key — or runs
on yours, capped by a monthly token allowance you set.

![Command center](docs/screenshots/command.png)

<p align="center">
  <img src="docs/screenshots/terminal.png" width="49%" alt="Terminal with live fleet commands">
  <img src="docs/screenshots/system.png" width="49%" alt="System window showing configured integrations">
</p>

---

## What actually works

| Capability | State |
| --- | --- |
| Accounts: email + password, invite-gated signup | Works, required |
| Per-account isolation of fleet, events and keys | Works, enforced in the store |
| Per-account API keys, encrypted at rest | Works |
| Usage metering and monthly token quota | Works |
| 3D operations view (three.js, orbit, click-to-select) | Works |
| Chat with Anthropic / OpenAI / Google, streaming | Works, needs a key |
| Tool calling (fleet, node, events, repos, repo activity, clock) | Anthropic + OpenAI |
| Agent pipeline: Planner → Researcher → Engineer → Reviewer | Works, needs a key |
| GitHub repos, commits, PRs, issues, CI runs | Read-only, needs a token |
| Device telemetry from real machines | Works, `agent/neo_agent.py` |
| Terminal with real commands | Works |
| Voice input and spoken replies | Works in Chrome / Edge / Safari |
| Installable PWA (phone, tablet, desktop) | Works |
| Durable storage | Supabase — required for real use |

**Deliberately not included.** Neo never executes commands on your machines. It
reads state and proposes actions; running them stays your decision. There is no
sandboxed code execution, and Gemini is chat-only (no tool calling) — adding a
third function-calling dialect would buy nothing the other two do not already
give. There is no billing: Neo meters and caps usage, it does not charge for it.

---

## Who pays for the model calls

One environment variable decides, and nothing else changes.

**`NEO_SHARED_KEYS` unset (the default) — bring your own key.** Every account
enters its own API key in the Account panel. It is encrypted with AES-256-GCM
before it is stored and never sent back to a browser. Costs you nothing, and no
account is capped: it is their money.

**`NEO_SHARED_KEYS=true` — you pay.** Accounts without a key of their own fall
back to the deployment's keys, and `NEO_MONTHLY_TOKEN_LIMIT` caps each account
per calendar month. An account that adds its own key stops counting against
your allowance immediately.

A rough sense of what the second mode costs you, at published Anthropic prices:
one chat turn with a tool call runs about 8k input and 0.8k output tokens
(~$0.024 on Sonnet 5); a four-agent mission about 38k input and 3.6k output
(~$0.11). The default 200,000-token allowance is roughly 25 missions per
account per month. Set it deliberately.

---

## Quick start (local)

```bash
git clone <this repo>
cd Neo
npm install
cp .env.example .env.local
```

Fill in two values in `.env.local`:

```bash
NEO_SESSION_SECRET=$(openssl rand -base64 48)   # signs sessions AND encrypts stored keys
NEO_SIGNUP_CODE=$(openssl rand -hex 12)         # without it, nobody can sign up
```

Then:

```bash
npm run dev          # http://localhost:3000
```

Open `/signup`, create an account with your invite code — **the first account
becomes the owner** — then paste an API key into the Account panel. That is the
whole setup; no model key needs to live in the environment at all.

Want something on screen before wiring up real machines? Set
`NEO_DEMO_MODE=true` for four synthetic nodes, clearly labelled as demo data
and replaced the moment a real agent reports.

---

## Deploy to Vercel

1. Push this repository to GitHub.
2. In Vercel: **New Project → Import** the repository. The framework is detected
   automatically; no build settings to change.
3. Add the environment variables from `.env.example` under
   **Settings → Environment Variables**. `NEO_SESSION_SECRET` is mandatory;
   `NEO_SIGNUP_CODE` is what lets anyone create an account, including you.
4. Deploy, open the URL, sign in.

Chat and agent routes are capped at 60 seconds, the value every Vercel plan
accepts — a higher `maxDuration` than your plan allows is rejected at build
time. A four-agent mission can outlive that and will be cut off mid-stream; on
Pro you can raise `maxDuration` in `vercel.json` and in the two route files.
Self-hosting (`npm run build && npm run start`, or a container) has no such
limit at all.

**Storage is not optional on serverless.** Without Supabase, accounts live in
the instance's memory and disappear on every cold start — you would have to
sign up again each time. Apply `supabase/schema.sql`, set `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, and the HUD switches from `MEMORY` to `SUPABASE`
so you always know which one you are looking at.

GitHub Pages cannot host Neo: it serves static files only, and every useful
part of this app is a server route.

---

## Connect a machine

`agent/neo_agent.py` is one file with no dependencies beyond Python 3.9.

In Neo, open **Account → Machine tokens**, name the machine, and copy the token
it shows once. Each token belongs to one account, so a machine reports into
exactly one fleet.

On the machine you want to watch:

```bash
scp agent/neo_agent.py you@your-box:~/
ssh you@your-box

export NEO_URL=https://your-neo-deployment
export NEO_AGENT_TOKEN=<the token you just copied>
export NEO_NODE_NAME=core-01
export NEO_SERVICES=docker,postgres,caddy    # optional, systemd units
python3 neo_agent.py
```

It reports CPU, memory, disk, load, temperature, uptime, process count and
systemd unit states every 10 seconds, retries with backoff when the server is
unreachable, and exits with a clear message if the token is rejected.

Run it permanently with systemd:

```ini
# /etc/systemd/system/neo-agent.service
[Unit]
Description=Neo telemetry agent
After=network-online.target

[Service]
Environment=NEO_URL=https://your-neo-deployment
Environment=NEO_AGENT_TOKEN=<token>
Environment=NEO_NODE_NAME=core-01
ExecStart=/usr/bin/python3 /opt/neo/neo_agent.py
Restart=always
RestartSec=10
User=nobody

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now neo-agent
```

Full agent reference: [`agent/README.md`](agent/README.md).

---

## Using it

**Dock** (bottom): Chat, Agents, Fleet, GitHub, Terminal, Account. Windows drag,
resize, minimise and maximise on desktop; on a phone the dock switches between
full-screen panels.

**3D view**: drag to orbit, scroll to zoom, click a node to select it and open
its metrics.

**Chat** answers with tools. Ask *"which node is in trouble?"* and it calls
`fleet_status` before answering — the tool chips above each reply show exactly
what it looked at.

**Agents** run a mission through four roles in sequence. Each one sees the
previous output, and the Reviewer ends with `VERDICT: proceed` or
`VERDICT: hold — <reason>`.

**Terminal** commands:

```
help                 list commands
status               fleet and configuration summary
nodes                every reporting machine
node <id>            inspect one machine, select it in 3D
events [n]           recent system events
repos                repositories the token can see
ask <question>       ask Neo directly, streams into the terminal
run <mission>        hand a mission to the agent pipeline
open <app>           open a window
clear                clear the terminal
```

Tab completes, ↑/↓ walks history.

**Install as an app**: Chrome/Edge → install icon in the address bar; iOS Safari
→ Share → Add to Home Screen.

---

## Architecture

```
src/
  app/
    api/            route handlers (auth, chat, agents, github, telemetry, health)
    command/        the HUD shell
    login/
  components/
    apps/           chat, agents, fleet, github, terminal, system
    os/             window manager, dock, responsive layout
    scene/          three.js engine + React wrapper
    hud/            top bar, icons
  lib/
    ai/             provider adapters, SSE reader, tool registry, tool-calling loop
    agents/         agent roster and mission orchestrator
    github/         REST client
    store/          memory + Supabase adapters behind one interface
    telemetry/      payload schema, health derivation
agent/neo_agent.py  the telemetry agent
```

Two decisions worth knowing about:

**No LLM SDK.** The three providers are reached over their own HTTP APIs
(`src/lib/ai/anthropic.ts`, `openai.ts`, `google.ts`) behind one `Provider`
interface. That costs about 500 lines and buys full control over streaming and
tool events, no dependency that breaks on a major version, and adapters that
are directly testable against recorded SSE frames — which is what
`tests/stream-adapters.test.ts` does.

**No React 3D renderer.** The scene is plain three.js in one long-lived
imperative engine (`src/components/scene/scene-engine.ts`) driven by prop
changes. React never rebuilds GPU resources, and the frame loop is independent
of the component tree.

---

## Security

- Passwords are hashed with scrypt and a per-password salt; verification is
  constant-time. A wrong email and a wrong password return the same response
  after the same delay, so the endpoint cannot be used to enumerate accounts.
- Account API keys are encrypted with AES-256-GCM under a key derived from
  `NEO_SESSION_SECRET` via HKDF — domain-separated from the JWT signing use of
  the same secret. The plaintext never leaves the server; the UI only ever sees
  a masked tail. Rotating the secret invalidates stored keys by design.
- Machine tokens are stored only as a SHA-256 digest, so a database dump cannot
  be replayed against the ingest endpoint. Each token resolves to exactly one
  account.
- Every store method that touches account data takes a `userId`, so isolation is
  enforced in one place rather than remembered at each call site. `tests/store.test.ts`
  asserts that one account cannot read, delete, or resolve another's data.
- Signup is closed unless `NEO_SIGNUP_CODE` is set. An open signup form on a
  deployment with shared keys is an open invitation to spend your money.
- Every API route except `/api/health` and the auth endpoints requires a
  session; `/api/health` reports only which integrations are configured, never
  their values. Deployment configuration is visible to the owner account only.
- The session cookie is `httpOnly`, `sameSite=lax`, and `secure` in production,
  and is re-checked against the store so a deleted account cannot keep using it.
- The Supabase service role key is used server-side only and never reaches the
  browser; the schema leaves RLS on with no permissive policy.

---

## Development

```bash
npm run dev         # dev server
npm run test        # vitest
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run build       # production build
npm run verify      # all of the above
```

CI runs the same checks plus a Python 3.9 compile and a live metric collection
of the agent on every push.

---

## Licence

MIT. See [LICENSE](LICENSE).
