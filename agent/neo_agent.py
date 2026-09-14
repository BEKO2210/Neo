#!/usr/bin/env python3
"""Neo telemetry agent.

Reports CPU, memory, disk, temperature and service state of the machine it runs
on to a Neo deployment. Standard library only -- copy this single file onto any
Linux or macOS box with Python 3.9+ and run it.

    export NEO_URL=https://neo.example.com
    export NEO_AGENT_TOKEN=<the same value the server has>
    python3 neo_agent.py

Environment:
    NEO_URL           Base URL of the Neo deployment (required).
    NEO_AGENT_TOKEN   Shared secret, must match the server (required).
    NEO_NODE_ID       Stable id for this machine (default: hostname, slugified).
    NEO_NODE_NAME     Display name (default: hostname).
    NEO_NODE_KIND     server | workstation | mobile | container | service.
    NEO_NODE_TAGS     Comma-separated tags.
    NEO_INTERVAL      Seconds between reports (default 10, minimum 2).
    NEO_SERVICES      Comma-separated systemd units to report, e.g. "docker,nginx".
    NEO_DISK_PATH     Filesystem to measure (default "/").
    NEO_INSECURE      Set to 1 to skip TLS verification (self-signed only).
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

VERSION = "1.0.0"
USER_AGENT = f"neo-agent/{VERSION}"


# --- helpers ---------------------------------------------------------------


def env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-")
    return (cleaned or "node")[:64]


def read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except OSError:
        return ""


def is_linux() -> bool:
    return sys.platform.startswith("linux")


def is_macos() -> bool:
    return sys.platform == "darwin"


# --- metric collection -----------------------------------------------------


class CpuSampler:
    """CPU busy percentage from two /proc/stat samples (Linux) or ps (macOS)."""

    def __init__(self) -> None:
        self._previous = self._read_linux_jiffies()

    @staticmethod
    def _read_linux_jiffies():
        line = read_file("/proc/stat").split("\n", 1)[0]
        if not line.startswith("cpu "):
            return None
        fields = [int(value) for value in line.split()[1:] if value.isdigit()]
        if len(fields) < 4:
            return None
        idle = fields[3] + (fields[4] if len(fields) > 4 else 0)
        return sum(fields), idle

    def sample(self):
        if is_linux():
            current = self._read_linux_jiffies()
            if current is None or self._previous is None:
                self._previous = current
                return None
            total_delta = current[0] - self._previous[0]
            idle_delta = current[1] - self._previous[1]
            self._previous = current
            if total_delta <= 0:
                return None
            return round(max(0.0, min(100.0, (1 - idle_delta / total_delta) * 100)), 1)

        if is_macos():
            # `ps` sums per-process CPU, which can exceed 100% on multicore boxes.
            try:
                output = subprocess.run(
                    ["ps", "-A", "-o", "%cpu"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=False,
                ).stdout
            except (OSError, subprocess.SubprocessError):
                return None
            total = 0.0
            for line in output.split("\n")[1:]:
                try:
                    total += float(line.strip())
                except ValueError:
                    continue
            cores = os.cpu_count() or 1
            return round(max(0.0, min(100.0, total / cores)), 1)

        return None


def memory() -> "tuple[int | None, int | None]":
    if is_linux():
        info = {}
        for line in read_file("/proc/meminfo").split("\n"):
            parts = line.split(":")
            if len(parts) != 2:
                continue
            digits = parts[1].strip().split(" ")[0]
            if digits.isdigit():
                info[parts[0]] = int(digits) * 1024
        total = info.get("MemTotal")
        available = info.get("MemAvailable")
        if total is None:
            return None, None
        if available is None:
            free = info.get("MemFree", 0)
            cached = info.get("Cached", 0)
            buffers = info.get("Buffers", 0)
            available = free + cached + buffers
        return max(0, total - available), total

    if is_macos():
        try:
            total = int(
                subprocess.run(
                    ["sysctl", "-n", "hw.memsize"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=False,
                ).stdout.strip()
            )
            stats = subprocess.run(
                ["vm_stat"], capture_output=True, text=True, timeout=5, check=False
            ).stdout
        except (OSError, ValueError, subprocess.SubprocessError):
            return None, None
        page_size = 4096
        page_match = re.search(r"page size of (\d+) bytes", stats)
        if page_match:
            page_size = int(page_match.group(1))
        free_pages = 0
        for key in ("Pages free", "Pages inactive", "Pages speculative"):
            match = re.search(rf"{key}:\s+(\d+)", stats)
            if match:
                free_pages += int(match.group(1))
        return max(0, total - free_pages * page_size), total

    return None, None


def disk(path: str) -> "tuple[int | None, int | None]":
    try:
        usage = shutil.disk_usage(path)
        return usage.used, usage.total
    except OSError:
        return None, None


def load_average():
    try:
        one, five, fifteen = os.getloadavg()
        return [round(one, 2), round(five, 2), round(fifteen, 2)]
    except (OSError, AttributeError):
        return None


def temperature():
    if is_linux():
        best = None
        for index in range(12):
            raw = read_file(f"/sys/class/thermal/thermal_zone{index}/temp").strip()
            if not raw.lstrip("-").isdigit():
                continue
            value = int(raw)
            celsius = value / 1000.0 if abs(value) > 1000 else float(value)
            if -50 < celsius < 200 and (best is None or celsius > best):
                best = celsius
        if best is not None:
            return round(best, 1)
    return None


def uptime_seconds():
    if is_linux():
        raw = read_file("/proc/uptime").split(" ")
        try:
            return int(float(raw[0]))
        except (ValueError, IndexError):
            return None
    if is_macos():
        try:
            output = subprocess.run(
                ["sysctl", "-n", "kern.boottime"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            ).stdout
            match = re.search(r"sec\s*=\s*(\d+)", output)
            if match:
                return int(time.time() - int(match.group(1)))
        except (OSError, subprocess.SubprocessError):
            return None
    return None


def process_count():
    if is_linux():
        try:
            return sum(1 for entry in os.listdir("/proc") if entry.isdigit())
        except OSError:
            return None
    try:
        output = subprocess.run(
            ["ps", "-A"], capture_output=True, text=True, timeout=5, check=False
        ).stdout
        return max(0, len(output.strip().split("\n")) - 1)
    except (OSError, subprocess.SubprocessError):
        return None


def service_states(names):
    """Resolve systemd unit states; anything else reports "unknown"."""
    results = []
    systemctl = shutil.which("systemctl")
    for name in names:
        if not systemctl:
            results.append({"name": name, "state": "unknown", "detail": "systemctl not available"})
            continue
        try:
            completed = subprocess.run(
                [systemctl, "is-active", name],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            raw = completed.stdout.strip() or completed.stderr.strip()
        except (OSError, subprocess.SubprocessError) as error:
            results.append({"name": name, "state": "unknown", "detail": str(error)[:120]})
            continue
        if raw == "active":
            state = "up"
        elif raw in ("activating", "reloading", "deactivating"):
            state = "degraded"
        elif raw in ("inactive", "failed"):
            state = "down"
        else:
            state = "unknown"
        results.append({"name": name, "state": state, "detail": raw[:120] or None})
    return results


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.settimeout(0.4)
            # No packet is sent; this just asks the routing table for the source IP.
            probe.connect(("192.0.2.1", 80))
            return probe.getsockname()[0]
    except OSError:
        return None


# --- reporting -------------------------------------------------------------


def build_payload(sampler: CpuSampler, config) -> dict:
    used_memory, total_memory = memory()
    used_disk, total_disk = disk(config["disk_path"])
    return {
        "id": config["node_id"],
        "name": config["node_name"],
        "kind": config["node_kind"],
        "os": f"{platform.system()} {platform.release()}",
        "ip": local_ip(),
        "tags": config["tags"],
        "metrics": {
            "cpuPercent": sampler.sample(),
            "memoryUsedBytes": used_memory,
            "memoryTotalBytes": total_memory,
            "diskUsedBytes": used_disk,
            "diskTotalBytes": total_disk,
            "loadAverage": load_average(),
            "temperatureC": temperature(),
            "uptimeSeconds": uptime_seconds(),
            "processCount": process_count(),
        },
        "services": service_states(config["services"]),
    }


def post(url: str, token: str, payload: dict, insecure: bool) -> "tuple[int, str]":
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    context = ssl._create_unverified_context() if insecure else None
    try:
        with urllib.request.urlopen(request, timeout=15, context=context) as response:
            return response.status, response.read().decode("utf-8", "replace")[:200]
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", "replace")[:200]
    except (urllib.error.URLError, OSError, ssl.SSLError) as error:
        return 0, str(error)[:200]


def load_config():
    base = env("NEO_URL").rstrip("/")
    token = env("NEO_AGENT_TOKEN")
    if not base or not token:
        print("neo-agent: NEO_URL and NEO_AGENT_TOKEN are required.", file=sys.stderr)
        raise SystemExit(2)

    hostname = socket.gethostname()
    try:
        interval = max(2, int(env("NEO_INTERVAL", "10")))
    except ValueError:
        interval = 10

    kind = env("NEO_NODE_KIND", "server")
    if kind not in ("server", "workstation", "mobile", "container", "service"):
        print(f"neo-agent: unknown NEO_NODE_KIND '{kind}', falling back to 'server'.", file=sys.stderr)
        kind = "server"

    return {
        "url": f"{base}/api/telemetry/ingest",
        "token": token,
        "node_id": slugify(env("NEO_NODE_ID", hostname)),
        "node_name": env("NEO_NODE_NAME", hostname)[:80],
        "node_kind": kind,
        "tags": [tag.strip()[:32] for tag in env("NEO_NODE_TAGS").split(",") if tag.strip()][:12],
        "interval": interval,
        "services": [name.strip() for name in env("NEO_SERVICES").split(",") if name.strip()][:40],
        "disk_path": env("NEO_DISK_PATH", "/"),
        "insecure": env("NEO_INSECURE") == "1",
    }


def main() -> int:
    config = load_config()
    sampler = CpuSampler()
    print(f"neo-agent {VERSION}: reporting {config['node_id']} to {config['url']} every {config['interval']}s")

    failures = 0
    while True:
        payload = build_payload(sampler, config)
        status, body = post(config["url"], config["token"], payload, config["insecure"])

        if status == 200:
            if failures:
                print(f"neo-agent: recovered after {failures} failed report(s)")
            failures = 0
        else:
            failures += 1
            print(f"neo-agent: report failed (status {status}): {body}", file=sys.stderr)
            if status in (401, 403):
                print("neo-agent: token rejected -- check NEO_AGENT_TOKEN on both sides.", file=sys.stderr)
                return 1
            if status == 503:
                print("neo-agent: server has no NEO_AGENT_TOKEN configured yet.", file=sys.stderr)

        # Back off on repeated failures so an unreachable server is not hammered.
        delay = config["interval"] * min(6, 2 ** min(failures, 3)) if failures else config["interval"]
        time.sleep(delay)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nneo-agent: stopped")
