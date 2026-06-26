"""
Vacía todos los datos del schema clients (clientes y tablas relacionadas)
y elimina los archivos subidos de Discord.

Uso:
  cd backend
  python clear_db.py --yes
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

import psycopg2
from decouple import config

from src.db import DB_SCHEMA, init_db
from src.services.clientes_services import UPLOAD_DIR

CLIENTS_TABLES = [
    "proximos_pasos",
    "observaciones",
    "documento_links",
    "discord_transcripts",
    "fathom_boards",
    "miro_boards",
    "cuotas",
    "clientes",
]


def _count_rows(cur) -> dict[str, int]:
    counts = {}
    for table in CLIENTS_TABLES:
        cur.execute(f"SELECT COUNT(*) FROM {DB_SCHEMA}.{table}")
        counts[table] = cur.fetchone()[0]
    return counts


def clear_uploads() -> int:
    discord_dir = UPLOAD_DIR / "discord"
    if not discord_dir.exists():
        return 0
    removed = 0
    for path in discord_dir.iterdir():
        if path.is_dir():
            shutil.rmtree(path)
            removed += 1
        elif path.is_file():
            path.unlink()
            removed += 1
    return removed


def clear_database() -> dict[str, int]:
    database_url = config("DATABASE_URL", default="")
    if not database_url:
        raise RuntimeError("DATABASE_URL no está configurada.")

    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            before = _count_rows(cur)
            cur.execute(f"TRUNCATE TABLE {DB_SCHEMA}.clientes RESTART IDENTITY CASCADE")
            after = _count_rows(cur)
        return {"before": before, "after": after}
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Borra todos los datos de ATV Clients.")
    parser.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="Confirmar borrado sin preguntar",
    )
    args = parser.parse_args()

    if not args.yes:
        print("⚠️  Esto borra TODOS los clientes y datos relacionados.")
        print("   Ejecutá con --yes para confirmar:")
        print("   python clear_db.py --yes")
        return 1

    init_db()

    print("🗑️  Borrando datos de la base...")
    result = clear_database()
    before = result["before"]
    total_rows = sum(before.values())

    print("🗑️  Borrando uploads de Discord...")
    upload_dirs = clear_uploads()

    print("\n✅ Base vaciada")
    for table, count in before.items():
        if count:
            print(f"   - {DB_SCHEMA}.{table}: {count} filas eliminadas")

    if not total_rows:
        print("   (no había registros)")

    if upload_dirs:
        print(f"   - uploads/discord: {upload_dirs} carpetas/archivos eliminados")
    else:
        print("   - uploads/discord: sin archivos")

    print("\nListo para cargar datos reales.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
