#!/usr/bin/env python3
"""
Carga en la ficha de cada cliente los mails que mandó por su canal privado.

    docker exec atv-clients-backend python actualizar_mails_equipo.py            # muestra y no toca nada
    docker exec atv-clients-backend python actualizar_mails_equipo.py --aplicar  # escribe

Lee los transcripts que escribe el bot (los mismos que el contenedor ya tiene montados),
busca en cada canal el mensaje donde se pidieron los mails y junta los que vinieron después.

Tres cosas que el script NO hace, a propósito:

- **No adivina el principal.** `cliente.email` es con lo que esa persona entra: si se pone
  el que no es, el titular queda afuera y entra otro. Por eso el principal que ya está
  cargado se respeta siempre. Si el cliente mandó una lista donde ese mail no aparece, la
  ficha queda sin tocar y sale listada aparte, para decidirla a mano. Con
  `--primario-del-chat` se invierte la regla: manda el primero que escribió.
- **No saca mails.** Lo que ya estaba sigue estando: se agrega lo que falta. Se pidió a
  quién sumar, no quién queda, y sacar a alguien es sacarle el acceso.
- **No busca al cliente por parecido de nombre.** Solo por el canal cargado en la ficha.
  El que no matchea sale listado: una ficha equivocada acá es darle el acceso de un
  cliente a otro.
"""

import json
import re
import sys
import unicodedata
from pathlib import Path

from pony.orm import db_session

from src.db import init_db
from src.discord_transcript_paths import get_transcripts_base
from src.models import Cliente
from src.services.clientes_services import _emails_from_cliente, _normalize_email_list

ANCLA_DEFAULT = "dando de alta a todos en la plataforma nueva"
MSG = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] (.+)$", re.M)
MAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def plano(texto: str) -> str:
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def mensajes(texto: str) -> list[tuple[str, str, str]]:
    salida, marcas = [], list(MSG.finditer(texto))
    for i, m in enumerate(marcas):
        fin = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        salida.append((m.group(1), m.group(2).strip(), texto[m.end():fin].strip()))
    return salida


def mails_despues_del_pedido(mensajes_del_canal: list[tuple[str, str, str]], ancla: str) -> list[str]:
    """Los mails que se escribieron después del pedido. Vacío si el pedido no está."""
    desde = None
    for i, (_fecha, _autor, cuerpo) in enumerate(mensajes_del_canal):
        if ancla in plano(cuerpo):
            desde = i          # el último: si el pedido se repitió, vale la vuelta nueva
    if desde is None:
        return []
    mails: list[str] = []
    for _fecha, _autor, cuerpo in mensajes_del_canal[desde + 1:]:
        mails += MAIL.findall(cuerpo)
    return _normalize_email_list(mails)


def mails_por_canal(base: Path, ancla: str) -> dict[str, list[str]]:
    """canal -> mails que mandaron, en el orden en que los escribieron.

    Un canal es una CARPETA, no un archivo: en el VPS el bot parte el transcript en un
    archivo por día, así que los mensajes de un mismo canal vienen repartidos.
    """
    carpetas: dict[Path, list[Path]] = {}
    for f in sorted(base.glob("*/*/*.txt")):
        carpetas.setdefault(f.parent, []).append(f)

    salida: dict[str, list[str]] = {}
    for carpeta, archivos in sorted(carpetas.items()):
        crudos: list[tuple[str, str, str]] = []
        for f in archivos:
            try:
                crudos += mensajes(f.read_text(encoding="utf-8", errors="replace"))
            except OSError as e:
                print(f"!! {carpeta.name}: {e}", file=sys.stderr)
        todos = sorted(dict.fromkeys(crudos), key=lambda m: m[0])
        mails = mails_despues_del_pedido(todos, ancla)
        if mails:
            salida[carpeta.name.strip().lower()] = mails
    return salida


def decidir(actuales: list[str], email_actual: str | None, nuevos: list[str],
            del_chat: bool) -> tuple[list[str], str] | None:
    """La lista final y por qué. None = conflicto de principal, no se toca."""
    principal = (_normalize_email_list([email_actual]) or [None])[0]
    if del_chat or principal is None:
        nuevo_principal = nuevos[0]
    elif principal in nuevos:
        nuevo_principal = principal
    else:
        return None
    final = _normalize_email_list([nuevo_principal, *actuales, *nuevos])
    if final == actuales:
        return final, "igual"
    if set(final) == set(actuales):
        return final, "reordena"   # el principal no estaba primero en emails_json
    return final, "suma"


def main() -> None:
    aplicar = "--aplicar" in sys.argv
    del_chat = "--primario-del-chat" in sys.argv
    resto = [a for a in sys.argv[1:] if not a.startswith("--")]
    ancla = plano(resto[0] if resto else ANCLA_DEFAULT)

    base = get_transcripts_base()
    if not base.is_dir():
        raise SystemExit(f"No encuentro los transcripts en {base}.")
    por_canal = mails_por_canal(base, ancla)
    if not por_canal:
        raise SystemExit("Ningun canal tiene el pedido con mails despues. La frase es la correcta?")

    init_db()
    cambios, iguales, conflictos, sin_ficha = [], [], [], []
    with db_session:
        fichas = {(c.canal_discord or "").strip().lstrip("#").lower(): c
                  for c in list(Cliente.select()) if (c.canal_discord or "").strip()}
        for canal, nuevos in sorted(por_canal.items()):
            cliente = fichas.get(canal)
            if cliente is None:
                sin_ficha.append((canal, nuevos))
                continue
            # Todo lo que se vaya a imprimir se copia acá: afuera del db_session la
            # entidad de Pony ya no se puede leer.
            ficha = (cliente.id, cliente.nombre, cliente.plan_actual,
                     cliente.estado_cliente, cliente.email)
            actuales = _emails_from_cliente(cliente)
            decision = decidir(actuales, cliente.email, nuevos, del_chat)
            if decision is None:
                conflictos.append((canal, ficha, nuevos))
            elif decision[1] == "igual":
                iguales.append(canal)
            else:
                cambios.append((canal, ficha, actuales, decision[0], decision[1]))

    print(f"Canales con mails despues del pedido: {len(por_canal)}\n")
    print(f"{'=' * 72}\nSE ACTUALIZAN ({len(cambios)})\n{'=' * 72}")
    for canal, ficha, actuales, final, por_que in cambios:
        _id, nombre, plan, estado, email_viejo = ficha
        suma = [m for m in final if m not in actuales]
        print(f"\n## {canal} - {nombre} [{plan} / {estado}]")
        cambio_de_login = final[0] != (email_viejo or "").strip().lower()
        print(f"   entra con: {final[0]}"
              + (f"   <-- ANTES ERA {email_viejo}" if cambio_de_login else ""))
        print(f"   tenia: {', '.join(actuales) or '-'}")
        if por_que == "reordena":
            print("   suma:  - (solo se ordena: el mail de login no estaba primero)")
        else:
            print(f"   suma:  {', '.join(suma)}")
    if conflictos:
        print(f"\n{'=' * 72}\nNO SE TOCAN: EL MAIL DE LOGIN NO ESTA EN LO QUE MANDO ({len(conflictos)})"
              f"\n{'=' * 72}")
        for canal, ficha, nuevos in conflictos:
            _id, nombre, plan, estado, email_viejo = ficha
            print(f"\n## {canal} - {nombre} [{plan} / {estado}]")
            print(f"   hoy entra con: {email_viejo}")
            print(f"   mando:         {', '.join(nuevos)}")
    if sin_ficha:
        print(f"\n{'=' * 72}\nNINGUNA FICHA TIENE ESE CANAL ({len(sin_ficha)})\n{'=' * 72}")
        for canal, nuevos in sin_ficha:
            print(f"  {canal}: {', '.join(nuevos)}")
    if iguales:
        print(f"\n{'=' * 72}\nYA ESTABAN CARGADOS ({len(iguales)})\n{'=' * 72}")
        print("  " + ", ".join(iguales))

    if not aplicar:
        print(f"\nNo se escribio nada. Para aplicar los {len(cambios)}: --aplicar")
        return
    with db_session:
        for _canal, ficha, _actuales, final, _por_que in cambios:
            c = Cliente[ficha[0]]
            c.email = final[0]
            c.emails_json = json.dumps(final, ensure_ascii=False)
    print(f"\nListo: {len(cambios)} fichas actualizadas.")


if __name__ == "__main__":
    main()
