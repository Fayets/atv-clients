from __future__ import annotations

import logging
import os
import subprocess

from decouple import config

logger = logging.getLogger("analisis_ia")

CLAUDE_BIN = config("CLAUDE_CLI_BIN", default="claude")
CLAUDE_TIMEOUT = int(config("ANALISIS_IA_CLAUDE_TIMEOUT", default="180"))


def invocar_claude(system_prompt: str, user_prompt: str) -> str:
    """Ejecuta Claude CLI en modo no interactivo (-p) con system prompt custom."""
    cmd = [
        CLAUDE_BIN,
        "-p",
        "--system-prompt",
        system_prompt,
        "--output-format",
        "text",
        "--max-turns",
        "1",
    ]
    env = os.environ.copy()
    result = subprocess.run(
        cmd,
        input=user_prompt,
        capture_output=True,
        text=True,
        timeout=CLAUDE_TIMEOUT,
        env=env,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "").strip()
        raise RuntimeError(detail or f"Claude CLI exit code {result.returncode}")
    output = (result.stdout or "").strip()
    if not output:
        raise RuntimeError("Claude CLI no devolvió output")
    return output
