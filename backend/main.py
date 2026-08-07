from contextlib import asynccontextmanager

from decouple import config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.controllers.auth_controller import router as auth_router
from src.controllers.agent_controller import router as agent_router
from src.controllers.clientes_controller import router as clientes_router
from src.controllers.discord_controller import router as discord_router
from src.db import init_db
from src.discord_bot import start_discord_bot


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_discord_bot()
    yield


app = FastAPI(title="ATV Clients API", version="1.0.0", lifespan=lifespan)

origins = [origin.strip() for origin in config("CORS_ORIGINS", default="http://localhost:5173").split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])
app.include_router(clientes_router, prefix="/api/clientes", tags=["clientes"])
app.include_router(discord_router, prefix="/api/discord", tags=["discord"])


@app.get("/health")
def health():
    return {"status": "ok", "service": "atv-clients"}
