import asyncio
import logging

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from src.services import analisis_ia_services as service

logger = logging.getLogger("analisis_ia")

_scheduler = AsyncIOScheduler()
AR = pytz.timezone("America/Argentina/Buenos_Aires")

_JOB_IDS = {
    6: "analisis_ia_cron_dom",
    1: "analisis_ia_cron_mar",
    3: "analisis_ia_cron_jue",
}
_DOW_CRON = {6: "sun", 1: "tue", 3: "thu"}


def _run_sync() -> None:
    service.ejecutar(origen="programado")


async def _ciclo_programado() -> None:
    if not service.puede_ejecutar_programado():
        logger.info("Análisis IA programado: omitido (ejecución reciente o en curso).")
        return
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run_sync)


def _programar_horarios_fijos() -> None:
    for dow, hour, minute in service.HORARIOS_PROGRAMADOS_AR:
        _scheduler.add_job(
            _ciclo_programado,
            "cron",
            day_of_week=_DOW_CRON[dow],
            hour=hour,
            minute=minute,
            timezone=AR,
            id=_JOB_IDS[dow],
            replace_existing=True,
        )


def start_analisis_scheduler() -> None:
    loop = asyncio.get_running_loop()
    _programar_horarios_fijos()
    if not _scheduler.running:
        _scheduler.start()
    logger.info(
        "Scheduler análisis IA activo — 3 horarios fijos AR: dom 10:00, mar 23:10, jue 18:00"
    )
    for job in _scheduler.get_jobs():
        if job.id.startswith("analisis_ia_cron_"):
            logger.info("Added job %s — trigger: %s", job.id, job.trigger)
    loop.create_task(_ciclo_inicial())


async def _ciclo_inicial() -> None:
    """Solo corre si nunca hubo una corrida en BD (bootstrap inicial)."""
    await asyncio.sleep(3)
    if service.es_primera_vez():
        if not service.puede_ejecutar_programado():
            return
        logger.info("Análisis IA inicial — primera corrida (sin historial en BD)...")
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _run_sync)
    else:
        estado = service.obtener_estado()
        logger.info(
            "Análisis IA — último: %s · próximo: %s",
            estado.get("ultimo_analisis_en"),
            estado.get("proximo_analisis_en"),
        )
