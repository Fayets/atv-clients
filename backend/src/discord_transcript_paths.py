from __future__ import annotations

from pathlib import Path

from decouple import config

CANONICAL_TRANSCRIPTS_BASE = Path("/opt/atv-clients/transcripts")
_TRANSCRIPTS_SEGMENT = "/transcripts/"


def get_transcripts_base() -> Path:
    raw = config("DISCORD_TRANSCRIPTS_BASE_PATH", default="").strip()
    if raw:
        path = Path(raw)
        if not path.is_absolute():
            path = Path.cwd() / path
        return path
    return CANONICAL_TRANSCRIPTS_BASE


def canonical_transcript_filepath(categoria: str, canal_name: str) -> str:
    return str(CANONICAL_TRANSCRIPTS_BASE / categoria / canal_name / f"{canal_name}.txt")


def resolve_transcript_filepath(stored_filepath: str | None) -> Path | None:
    if not stored_filepath:
        return None
    direct = Path(stored_filepath)
    if direct.is_file():
        return direct
    normalized = stored_filepath.replace("\\", "/")
    if _TRANSCRIPTS_SEGMENT in normalized:
        relative = normalized.split(_TRANSCRIPTS_SEGMENT, 1)[1]
    else:
        parts = [p for p in normalized.split("/") if p]
        relative = "/".join(parts[-3:]) if len(parts) >= 3 else (parts[-1] if parts else normalized)
    return get_transcripts_base() / relative
