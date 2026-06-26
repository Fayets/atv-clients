import psycopg2
from decouple import config
from pony.orm import Database

db = Database()
DB_SCHEMA = config("DB_SCHEMA", default="clients")

MIGRATIONS = [
    "ALTER TABLE clients.clientes ADD COLUMN IF NOT EXISTS fathoms_url TEXT;",
    "ALTER TABLE clients.clientes ADD COLUMN IF NOT EXISTS arreglo_closer TEXT;",
    """
    CREATE TABLE IF NOT EXISTS clients.observaciones (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clients.clientes(id) ON DELETE CASCADE,
        autor VARCHAR(255) NOT NULL,
        texto TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    """
    INSERT INTO clients.observaciones (cliente_id, autor, texto)
    SELECT c.id, 'Historial', c.observaciones
    FROM clients.clientes c
    WHERE c.observaciones IS NOT NULL
      AND TRIM(c.observaciones) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM clients.observaciones o
        WHERE o.cliente_id = c.id AND o.autor = 'Historial'
      );
    """,
    """
    CREATE TABLE IF NOT EXISTS clients.miro_boards (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clients.clientes(id) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    """
    INSERT INTO clients.miro_boards (cliente_id, titulo, url)
    SELECT c.id, c.nombre || ' - Miro', c.miro_url
    FROM clients.clientes c
    WHERE c.miro_url IS NOT NULL
      AND TRIM(c.miro_url) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM clients.miro_boards m WHERE m.cliente_id = c.id
      );
    """,
    """
    UPDATE clients.miro_boards m
    SET titulo = c.nombre || ' - Miro'
    FROM clients.clientes c
    WHERE m.cliente_id = c.id AND m.titulo = 'Board principal';
    """,
    """
    CREATE TABLE IF NOT EXISTS clients.fathom_boards (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clients.clientes(id) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    """
    INSERT INTO clients.fathom_boards (cliente_id, titulo, url)
    SELECT c.id, UPPER(c.nombre || ' - Fathom'), c.fathoms_url
    FROM clients.clientes c
    WHERE c.fathoms_url IS NOT NULL
      AND TRIM(c.fathoms_url) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM clients.fathom_boards f WHERE f.cliente_id = c.id
      );
    """,
    """
    CREATE TABLE IF NOT EXISTS clients.discord_transcripts (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clients.clientes(id) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        nombre_archivo VARCHAR(255) NOT NULL,
        stored_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS clients.documento_links (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clients.clientes(id) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    "ALTER TABLE clients.clientes DROP COLUMN IF EXISTS dudas;",
    """
    CREATE TABLE IF NOT EXISTS clients.proximos_pasos (
        id            SERIAL PRIMARY KEY,
        cliente_id    INTEGER NOT NULL REFERENCES clients.clientes(id) ON DELETE CASCADE,
        fecha_llamada DATE NOT NULL,
        mentor        VARCHAR(100) NOT NULL,
        contenido     TEXT NOT NULL,
        created_at    TIMESTAMP DEFAULT NOW()
    );
    """,
    "ALTER TABLE clients.proximos_pasos ADD COLUMN IF NOT EXISTS link TEXT;",
    "CREATE INDEX IF NOT EXISTS idx_miro_boards_cliente_id ON clients.miro_boards(cliente_id);",
    "CREATE INDEX IF NOT EXISTS idx_fathom_boards_cliente_id ON clients.fathom_boards(cliente_id);",
    "CREATE INDEX IF NOT EXISTS idx_proximos_pasos_cliente_id ON clients.proximos_pasos(cliente_id);",
    "CREATE INDEX IF NOT EXISTS idx_proximos_pasos_cliente_fecha ON clients.proximos_pasos(cliente_id, fecha_llamada DESC);",
    "CREATE INDEX IF NOT EXISTS idx_cuotas_cliente_id ON clients.cuotas(cliente_id);",
    "CREATE INDEX IF NOT EXISTS idx_cuotas_cliente_estado_vence ON clients.cuotas(cliente_id, estado, fecha_vence);",
    "CREATE INDEX IF NOT EXISTS idx_observaciones_cliente_id ON clients.observaciones(cliente_id);",
    "CREATE INDEX IF NOT EXISTS idx_discord_transcripts_cliente_id ON clients.discord_transcripts(cliente_id);",
    "CREATE INDEX IF NOT EXISTS idx_documento_links_cliente_id ON clients.documento_links(cliente_id);",
    "CREATE INDEX IF NOT EXISTS idx_clientes_plan ON clients.clientes(plan_actual);",
    """
    CREATE TABLE IF NOT EXISTS clients.discord_transcripts (
        id          SERIAL PRIMARY KEY,
        cliente_id  INTEGER REFERENCES clients.clientes(id) ON DELETE SET NULL,
        canal       VARCHAR(100) NOT NULL,
        categoria   VARCHAR(50)  NOT NULL,
        fecha       DATE         NOT NULL,
        filepath    TEXT         NOT NULL,
        mensajes    INTEGER      DEFAULT 0,
        creado_en   TIMESTAMP    DEFAULT NOW(),
        UNIQUE(canal, fecha)
    );
    CREATE INDEX IF NOT EXISTS idx_transcripts_cliente_id
        ON clients.discord_transcripts(cliente_id);
    """,
    "ALTER TABLE clients.discord_transcripts ALTER COLUMN cliente_id DROP NOT NULL;",
    "ALTER TABLE clients.discord_transcripts ADD COLUMN IF NOT EXISTS canal VARCHAR(100);",
    "ALTER TABLE clients.discord_transcripts ADD COLUMN IF NOT EXISTS categoria VARCHAR(50);",
    "ALTER TABLE clients.discord_transcripts ADD COLUMN IF NOT EXISTS fecha DATE;",
    "ALTER TABLE clients.discord_transcripts ADD COLUMN IF NOT EXISTS filepath TEXT;",
    "ALTER TABLE clients.discord_transcripts ADD COLUMN IF NOT EXISTS mensajes INTEGER DEFAULT 0;",
    "ALTER TABLE clients.discord_transcripts ADD COLUMN IF NOT EXISTS creado_en TIMESTAMP DEFAULT NOW();",
    "ALTER TABLE clients.discord_transcripts DROP COLUMN IF EXISTS titulo;",
    "ALTER TABLE clients.discord_transcripts DROP COLUMN IF EXISTS nombre_archivo;",
    "ALTER TABLE clients.discord_transcripts DROP COLUMN IF EXISTS stored_name;",
    "ALTER TABLE clients.discord_transcripts DROP COLUMN IF EXISTS created_at;",
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'discord_transcripts_canal_fecha_key'
        ) THEN
            ALTER TABLE clients.discord_transcripts
                ADD CONSTRAINT discord_transcripts_canal_fecha_key UNIQUE (canal, fecha);
        END IF;
    END $$;
    """,
]


def run_migrations() -> None:
    database_url = config("DATABASE_URL", default="")
    if not database_url:
        return
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            for sql in MIGRATIONS:
                try:
                    cur.execute(sql)
                except Exception:
                    pass
    finally:
        conn.close()


def init_db() -> None:
    import src.models  # noqa: F401

    run_migrations()
    db.bind(provider="postgres", dsn=config("DATABASE_URL"))
    db.generate_mapping(create_tables=False)
