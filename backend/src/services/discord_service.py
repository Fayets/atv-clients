from datetime import date, datetime
from pathlib import Path

from pony.orm import db_session, select

from src.models import Cliente, DiscordTranscript

TRANSCRIPTS_BASE = Path("/opt/atv-clients/transcripts")

CATEGORIAS = {
    "boost": ["canales atv boost"],
    "advantage": ["canales atv adva", "canales atv advantage"],
    "mentoria": ["canales privados"],
}


def detectar_categoria(category_name: str) -> str | None:
    """Retorna 'boost', 'advantage', 'mentoria' o None."""
    import re
    # Eliminar emojis y caracteres especiales, pasar a minúsculas
    name = re.sub(r'[^\w\s]', '', category_name).lower().strip()
    # Colapsar espacios múltiples
    name = re.sub(r'\s+', ' ', name)
    for slug, keywords in CATEGORIAS.items():
        for kw in keywords:
            if kw in name:
                return slug
    return None


def canal_a_nombre(canal_name: str) -> str:
    """
    'katherine-lindo'   → 'Katherine Lindo'
    'benat-y-vicente'   → 'Benat y Vicente'
    'tomas-valen-lauti' → 'Tomas Valen Lauti'
    """
    partes = canal_name.split("-")
    return " ".join(p if p.lower() == "y" else p.capitalize() for p in partes)


@db_session
def buscar_cliente(canal_name: str) -> int | None:
    """Busca cliente en BD por nombre derivado del canal. Retorna id o None."""
    nombre = canal_a_nombre(canal_name)
    cliente = Cliente.get(lambda c: c.nombre.lower() == nombre.lower())
    if cliente:
        return cliente.id
    primera = nombre.split()[0].lower()
    candidatos = select(c for c in Cliente if primera in c.nombre.lower())[:]
    return candidatos[0].id if len(candidatos) == 1 else None


def guardar_transcript(
    canal_name: str,
    categoria: str,
    mensajes: list[dict],
    cliente_id: int | None,
) -> str:
    """Escribe el .txt y upserta el registro en BD. Retorna filepath."""
    hoy = date.today()
    carpeta = TRANSCRIPTS_BASE / categoria / canal_name
    carpeta.mkdir(parents=True, exist_ok=True)
    filepath = carpeta / f"{hoy.isoformat()}.txt"

    # 1. Escribir archivo — fuera de cualquier db_session
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"Canal:     #{canal_name}\n")
        f.write(f"Programa:  {categoria.upper()}\n")
        f.write(f"Extraído:  {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"Mensajes:  {len(mensajes)}\n")
        f.write("=" * 60 + "\n\n")
        for msg in mensajes:
            ts = msg["timestamp"].strftime("%Y-%m-%d %H:%M")
            f.write(f"[{ts}] {msg['author']}\n")
            f.write(f"{msg['content']}\n")
            for att in msg.get("attachments", []):
                f.write(f"  📎 {att}\n")
            f.write("\n")

    # 2. Upsert en BD — sesión propia y limpia
    _upsert_transcript(canal_name, categoria, hoy, str(filepath), len(mensajes), cliente_id)

    return str(filepath)


@db_session
def _upsert_transcript(
    canal_name: str,
    categoria: str,
    hoy: date,
    filepath: str,
    total_mensajes: int,
    cliente_id: int | None,
) -> None:
    existente = DiscordTranscript.get(canal=canal_name, fecha=hoy)
    if existente:
        existente.mensajes = total_mensajes
        existente.filepath = filepath
    else:
        cliente_obj = Cliente.get(id=cliente_id) if cliente_id else None
        DiscordTranscript(
            cliente=cliente_obj,
            canal=canal_name,
            categoria=categoria,
            fecha=hoy,
            filepath=filepath,
            mensajes=total_mensajes,
        )
