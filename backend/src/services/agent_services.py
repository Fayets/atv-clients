from fastapi import HTTPException

from src.services.clientes_services import ClientesServices, _sanitize_cliente_for_agent


class AgentServices:
    def __init__(self) -> None:
        self._clientes = ClientesServices()

    def buscar_clientes(self, q: str | None, cliente_id: int | None) -> dict | list[dict] | None:
        if cliente_id is not None:
            data = self._clientes.obtener_cliente(cliente_id)
            if not data:
                return None
            return _sanitize_cliente_for_agent(data)

        if not q or not q.strip():
            raise HTTPException(status_code=400, detail="Indicá q o id para buscar un cliente.")

        items = self._clientes.listar_clientes(q=q.strip())
        if not items:
            return None

        if len(items) == 1:
            data = self._clientes.obtener_cliente(items[0]["id"])
            if not data:
                return None
            return _sanitize_cliente_for_agent(data)

        return [
            {
                "id": item["id"],
                "nombre": item["nombre"],
                "plan_actual": item["plan_actual"],
                "estado_efectivo": item["estado_efectivo"],
            }
            for item in items
        ]

    def listar_discord_transcripts(self, cliente_id: int) -> list[dict] | None:
        return self._clientes.listar_discord_transcripts_cliente(cliente_id)

    def obtener_discord_transcript(self, cliente_id: int, transcript_id: int) -> dict | None:
        return self._clientes.obtener_discord_transcript_contenido(cliente_id, transcript_id)
