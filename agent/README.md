# Neo telemetry agent

One file, no dependencies, Python 3.9 or newer. Copy `neo_agent.py` onto any
machine you want to see in Neo and run it.

```bash
export NEO_URL=https://your-neo-deployment
export NEO_AGENT_TOKEN=<same value as the server's NEO_AGENT_TOKEN>
python3 neo_agent.py
```

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEO_URL` | — | **Required.** Base URL of the deployment. |
| `NEO_AGENT_TOKEN` | — | **Required.** Shared secret, must match the server. |
| `NEO_NODE_ID` | hostname | Stable id. Changing it creates a second node. |
| `NEO_NODE_NAME` | hostname | Display name. |
| `NEO_NODE_KIND` | `server` | `server`, `workstation`, `mobile`, `container`, `service`. |
| `NEO_NODE_TAGS` | — | Comma-separated, e.g. `home-lab,frankfurt`. |
| `NEO_INTERVAL` | `10` | Seconds between reports. Minimum 2. |
| `NEO_SERVICES` | — | Comma-separated systemd units, e.g. `docker,nginx`. |
| `NEO_DISK_PATH` | `/` | Filesystem to measure. |
| `NEO_INSECURE` | — | `1` skips TLS verification. Self-signed certificates only. |

## What it reports

| Metric | Linux | macOS |
| --- | --- | --- |
| CPU % | `/proc/stat` delta | `ps` sum ÷ cores |
| Memory | `/proc/meminfo` (`MemAvailable`) | `sysctl` + `vm_stat` |
| Disk | `shutil.disk_usage` | same |
| Load average | `os.getloadavg` | same |
| Temperature | `/sys/class/thermal/*` | not available |
| Uptime | `/proc/uptime` | `kern.boottime` |
| Processes | `/proc` entries | `ps -A` |
| Services | `systemctl is-active` | reported as `unknown` |

Metrics the machine cannot provide are sent as `null`. Neo treats a missing
metric as unknown, never as zero, so a node is not marked healthy for a reading
it never took.

## Behaviour

- **Health is derived on the server**, not here. Thresholds live in
  `src/lib/telemetry/health.ts`.
- **Backoff**: repeated failures slow reporting to at most 6× the interval, so
  an unreachable server is not hammered. Recovery is logged.
- **Fatal token errors exit.** A `401`/`403` stops the agent with a message
  rather than retrying forever with a wrong secret.
- **A node that stops reporting for 90 seconds goes `stale`** in the UI. That is
  a server-side decision, so a killed agent is visible rather than frozen at its
  last good reading.

## Running it permanently

systemd — see the unit file in the [root README](../README.md#connect-a-machine).

Or with Docker, mounting the host's `/proc` so the metrics describe the host
rather than the container:

```bash
docker run -d --restart=always --name neo-agent \
  --pid=host \
  -v /proc:/host/proc:ro \
  -e NEO_URL=https://your-neo-deployment \
  -e NEO_AGENT_TOKEN=<token> \
  -e NEO_NODE_NAME=docker-host \
  -e NEO_NODE_KIND=container \
  -v "$PWD/neo_agent.py:/neo_agent.py:ro" \
  python:3.12-alpine python3 /neo_agent.py
```

Note that with `--pid=host` the process count and CPU reflect the host, while
memory and disk still describe the container's view unless you also mount them.
For accurate host metrics, prefer systemd on the host itself.

## Verifying without a server

```bash
python3 - <<'PY'
import sys, time, json
sys.path.insert(0, 'agent')
import neo_agent

sampler = neo_agent.CpuSampler()
time.sleep(0.5)
print(json.dumps(neo_agent.build_payload(sampler, {
    'node_id': 'test', 'node_name': 'test', 'node_kind': 'server',
    'tags': [], 'services': [], 'disk_path': '/',
}), indent=2))
PY
```
