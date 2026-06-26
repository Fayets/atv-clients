"""
Importa clientes ATV desde la lista manual de slugs y planes.

Uso:
  cd backend
  python import_atv_clientes.py
"""

from __future__ import annotations

import sys
from datetime import timedelta
from decimal import Decimal

from pony.orm import db_session

from src.db import init_db
from src.models import Cliente
from src.services.clientes_services import DURACION_POR_PLAN, _today

CLIENTES = [
    ("oscar-y-laura", "boost"),
    ("alvaro-larraz", "boost"),
    ("juan-virola", "boost"),
    ("gianluca-absi", "boost"),
    ("enrique-culzoni", "boost"),
    ("momentum", "boost"),
    ("katherine-lindo", "boost"),
    ("federico-garbarino", "boost"),
    ("she-flows", "boost"),
    ("ruben-y-marcelo", "boost"),
    ("julian-lucero", "boost"),
    ("alejandro-fernandez", "boost"),
    ("julieta-tejeria", "boost"),
    ("har-program", "boost"),
    ("alicia-damian", "boost"),
    ("mario-hernandez", "boost"),
    ("nehuen", "boost"),
    ("patric-hlosta", "boost"),
    ("la-biblioteca-de-los-productos-digitales", "boost"),
    ("valentino-y-gaston", "boost"),
    ("scale-boost", "boost"),
    ("amp", "boost"),
    ("nico-migue", "boost"),
    ("scalify", "boost"),
    ("jesus-lopez-ideal", "boost"),
    ("juano-tu-imperio-youtube", "boost"),
    ("alexander-acosta", "boost"),
    ("tomi-y-nico", "boost"),
    ("leandro-aaron", "boost"),
    ("ema-romero", "advantage"),
    ("amy-y-hector", "advantage"),
    ("uriel-casaglia", "advantage"),
    ("tomas-valen-lauti", "mentoria"),
    ("alejo-lettos", "mentoria"),
    ("pedro-perez", "mentoria"),
    ("brian-sofi", "mentoria"),
    ("brayan-erika", "mentoria"),
    ("juanma-arias", "mentoria"),
    ("ismael-rogel", "mentoria"),
    ("benat-y-vicente", "mentoria"),
    ("ivo-binstein", "mentoria"),
    ("nicolas-nuñez", "mentoria"),
    ("gonza-vallejos", "mentoria"),
    ("ana-montana", "mentoria"),
    ("facundo-conca", "mentoria"),
    ("nati-y-marce", "mentoria"),
    ("antonio-rivero", "mentoria"),
    ("facundo-martinez", "mentoria"),
    ("alvaro-y-uxia", "mentoria"),
    ("martin-pinzon", "mentoria"),
    ("luis-sosa", "mentoria"),
    ("alex-aguirre", "mentoria"),
    ("oriol-ortega", "mentoria"),
    ("santiago-y-javier", "mentoria"),
    ("emmanuel-moises", "mentoria"),
    ("genaro-gerardo", "mentoria"),
    ("jader-petermina", "mentoria"),
    ("jose-narvaez", "mentoria"),
    ("kilian-idealsales", "mentoria"),
    ("santiago-lavarca", "mentoria"),
    ("felipe-francesco", "mentoria"),
    ("geronimo-robles", "mentoria"),
    ("vicente-drop", "mentoria"),
    ("diego-sanchez", "mentoria"),
    ("paul-vega", "mentoria"),
    ("conchi-marin", "mentoria"),
    ("andre-arroyo", "mentoria"),
    ("cristopher-gonzalez", "mentoria"),
]

LOWercase_WORDS = {"y", "de", "del", "la", "los", "las"}


def slug_to_nombre(slug: str) -> str:
    words = slug.replace("_", "-").split("-")
    parts = []
    for index, word in enumerate(words):
        lower = word.lower()
        if index > 0 and lower in LOWercase_WORDS:
            parts.append(lower)
        else:
            parts.append(lower.capitalize())
    return " ".join(parts)


def slug_to_email(slug: str) -> str:
    normalized = slug.lower().replace("_", "-")
    return f"{normalized}@clients.atvos.io"


@db_session
def import_clientes() -> None:
    created = 0
    skipped = 0
    hoy = _today()

    for slug, plan in CLIENTES:
        email = slug_to_email(slug)
        existing = Cliente.get(email=email)
        if existing:
            print(f"⏭️  {slug} ({plan}) — ya existe")
            skipped += 1
            continue

        duracion_dias = DURACION_POR_PLAN[plan]
        cliente = Cliente(
            nombre=slug_to_nombre(slug),
            email=email,
            plan_actual=plan,
            fecha_inicio=hoy,
            duracion_dias=duracion_dias,
            fecha_vencimiento=hoy + timedelta(days=duracion_dias),
            estado_cliente="vigente",
            total_pagado_usd=Decimal("0"),
            total_adeudado_usd=Decimal("0"),
        )

        created += 1
        print(f"✅ {cliente.nombre} — {plan} — {email}")

    print(f"\nListo: {created} creados, {skipped} omitidos, total en lista: {len(CLIENTES)}")


def main() -> int:
    init_db()
    import_clientes()
    return 0


if __name__ == "__main__":
    sys.exit(main())
