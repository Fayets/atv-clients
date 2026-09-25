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
        creado_en   TIMESTAMP    DEFAULT NOW()
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
        IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'discord_transcripts_canal_fecha_key'
        ) THEN
            ALTER TABLE clients.discord_transcripts
                DROP CONSTRAINT discord_transcripts_canal_fecha_key;
        END IF;
    END $$;
    """,
    "ALTER TABLE clients.discord_transcripts ADD COLUMN IF NOT EXISTS ultimo_mensaje_id VARCHAR(50);",
    """
    DO $$
    BEGIN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'clients'
            AND table_name = 'discord_transcripts'
            AND column_name = 'cliente'
        ) THEN
            ALTER TABLE clients.discord_transcripts RENAME COLUMN cliente TO cliente_id;
        END IF;
    END $$;
    """,
    """
    ALTER TABLE clients.clientes DROP CONSTRAINT IF EXISTS clientes_estado_cliente_check;
    ALTER TABLE clients.clientes ADD CONSTRAINT clientes_estado_cliente_check
        CHECK (estado_cliente IN (
            'vigente', 'proximo_a_vencer', 'vencido', 'pausa',
            'no_va_a_renovar', 'llamada_recompra', 'estan_bien', 'inactivo'
        ));
    """,
    """
    ALTER TABLE clients.cuotas DROP CONSTRAINT IF EXISTS cuotas_estado_check;
    ALTER TABLE clients.cuotas ADD CONSTRAINT cuotas_estado_check
        CHECK (estado IN ('pendiente', 'parcialmente_pagada', 'pagado', 'vencido')) NOT VALID;
    """,
    """
    CREATE TABLE IF NOT EXISTS clients.analisis_cash (
        id SERIAL PRIMARY KEY,
        total_usd NUMERIC(14, 2) NOT NULL DEFAULT 0,
        periodo VARCHAR(120) NOT NULL DEFAULT 'Últimos 3 meses',
        titulo VARCHAR(255) NOT NULL DEFAULT 'Cash collected',
        subtitulo VARCHAR(255) NOT NULL DEFAULT 'Lo que generaron nuestros clientes',
        historia TEXT NOT NULL DEFAULT '',
        fuentes TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc'),
        updated_by VARCHAR(255)
    );
    """,
    """
    INSERT INTO clients.analisis_cash (total_usd, periodo, titulo, subtitulo, historia, fuentes)
    SELECT
        2432780,
        'Últimos 3 meses',
        'Cash collected',
        'Lo que generaron nuestros clientes',
        'En los últimos 3 meses, los clientes de ATV generaron este resultado sumando el canal de wins, sus canales privados y el resto de la comunidad.',
        'Canal de wins · Canales privados · Boost / Mentoría / Advantage'
    WHERE NOT EXISTS (SELECT 1 FROM clients.analisis_cash);
    """,
    """
    CREATE TABLE IF NOT EXISTS clients.analisis_ia_runs (
        id SERIAL PRIMARY KEY,
        ejecutado_en TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc'),
        proximo_analisis_en TIMESTAMP,
        estado VARCHAR(20) NOT NULL DEFAULT 'ok',
        resultados TEXT,
        error TEXT,
        origen VARCHAR(20) NOT NULL DEFAULT 'programado'
    );
    """,
    """
    ALTER TABLE clients.analisis_ia_runs
    ADD COLUMN IF NOT EXISTS total_analizados INTEGER;
    """,
    """
    ALTER TABLE clients.analisis_ia_runs
    ADD COLUMN IF NOT EXISTS requieren_accion INTEGER;
    """,
    """
    ALTER TABLE clients.analisis_ia_runs
    ADD COLUMN IF NOT EXISTS clientes_procesados INTEGER;
    """,
    """
    ALTER TABLE clients.analisis_ia_runs
    ADD COLUMN IF NOT EXISTS clientes_con_error INTEGER;
    """,
    "ALTER TABLE clients.clientes ADD COLUMN IF NOT EXISTS responsable VARCHAR(20);",
    "ALTER TABLE clients.cuotas ADD COLUMN IF NOT EXISTS comprobante_path TEXT;",
    "ALTER TABLE clients.cuotas ADD COLUMN IF NOT EXISTS comprobante_nombre VARCHAR(255);",
    """
    CREATE TABLE IF NOT EXISTS clients.cuota_comprobantes (
        id SERIAL PRIMARY KEY,
        cuota_id INTEGER NOT NULL REFERENCES clients.cuotas(id) ON DELETE CASCADE,
        filepath TEXT NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuota_comprobantes_cuota_id ON clients.cuota_comprobantes(cuota_id);",
    """
    INSERT INTO clients.cuota_comprobantes (cuota_id, filepath, nombre, created_at)
    SELECT
        c.id,
        c.comprobante_path,
        COALESCE(NULLIF(TRIM(c.comprobante_nombre), ''), 'comprobante'),
        COALESCE(c.created_at, NOW() AT TIME ZONE 'utc')
    FROM clients.cuotas c
    WHERE c.comprobante_path IS NOT NULL
      AND TRIM(c.comprobante_path) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM clients.cuota_comprobantes cc
        WHERE cc.cuota_id = c.id
          AND cc.filepath = c.comprobante_path
      );
    """,
    "ALTER TABLE clients.cuotas DROP COLUMN IF EXISTS comprobante_path;",
    "ALTER TABLE clients.cuotas DROP COLUMN IF EXISTS comprobante_nombre;",
    """
    CREATE TABLE IF NOT EXISTS clients.caja_meta (
        id INTEGER PRIMARY KEY,
        cuotas_updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    """
    INSERT INTO clients.caja_meta (id, cuotas_updated_at)
    SELECT 1, GREATEST(
        COALESCE((SELECT MAX(created_at) FROM clients.cuotas), NOW() AT TIME ZONE 'utc'),
        COALESCE((SELECT MAX(created_at) FROM clients.cuota_comprobantes), '-infinity'::timestamp)
    )
    WHERE NOT EXISTS (SELECT 1 FROM clients.caja_meta WHERE id = 1);
    """,
    "ALTER TABLE clients.cuotas ADD COLUMN IF NOT EXISTS arrastre_usd NUMERIC(10, 2) NOT NULL DEFAULT 0;",
    "ALTER TABLE clients.cuotas ADD COLUMN IF NOT EXISTS transferido_usd NUMERIC(10, 2) NOT NULL DEFAULT 0;",
    """
    CREATE TABLE IF NOT EXISTS clients.pagos (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clients.clientes(id) ON DELETE CASCADE,
        monto_usd NUMERIC(10, 2) NOT NULL,
        fecha DATE NOT NULL,
        origen VARCHAR(40) DEFAULT 'manual',
        notas TEXT,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_pagos_cliente_id ON clients.pagos(cliente_id);",
    "CREATE INDEX IF NOT EXISTS idx_pagos_cliente_fecha ON clients.pagos(cliente_id, fecha DESC);",
    """
    CREATE TABLE IF NOT EXISTS clients.pago_imputaciones (
        id SERIAL PRIMARY KEY,
        pago_id INTEGER NOT NULL REFERENCES clients.pagos(id) ON DELETE CASCADE,
        cuota_id INTEGER NOT NULL REFERENCES clients.cuotas(id) ON DELETE CASCADE,
        monto_usd NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_pago_imputaciones_pago_id ON clients.pago_imputaciones(pago_id);",
    "CREATE INDEX IF NOT EXISTS idx_pago_imputaciones_cuota_id ON clients.pago_imputaciones(cuota_id);",
    """
    CREATE TABLE IF NOT EXISTS clients.cuota_eventos (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL REFERENCES clients.clientes(id) ON DELETE CASCADE,
        cuota_id INTEGER REFERENCES clients.cuotas(id) ON DELETE SET NULL,
        cuota_destino_id INTEGER REFERENCES clients.cuotas(id) ON DELETE SET NULL,
        tipo VARCHAR(40) NOT NULL,
        monto_usd NUMERIC(10, 2) NOT NULL,
        detalle TEXT,
        fecha DATE NOT NULL,
        created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'utc')
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_cuota_eventos_cliente_id ON clients.cuota_eventos(cliente_id);",
    "ALTER TABLE clients.clientes ADD COLUMN IF NOT EXISTS fecha_recompra DATE;",
    "ALTER TABLE clients.cuotas ADD COLUMN IF NOT EXISTS numero_cuota INTEGER;",
    "DELETE FROM clients.cuota_eventos WHERE tipo = 'acumulacion_vencimiento';",
    "ALTER TABLE clients.cuota_comprobantes ADD COLUMN IF NOT EXISTS pago_id INTEGER REFERENCES clients.pagos(id) ON DELETE SET NULL;",
    "ALTER TABLE clients.clientes ADD COLUMN IF NOT EXISTS emails_json TEXT;",
    # Canal de Discord del cliente: de ahí sale la clave del Classroom (#ema-romero → ema.romero).
    "ALTER TABLE clients.clientes ADD COLUMN IF NOT EXISTS canal_discord VARCHAR(100);",
    # Completa el canal de los que no lo tienen con el del transcript más reciente.
    """
    UPDATE clients.clientes c
    SET canal_discord = t.canal
    FROM (
        SELECT DISTINCT ON (cliente_id) cliente_id, canal
        FROM clients.discord_transcripts
        WHERE cliente_id IS NOT NULL
        ORDER BY cliente_id, creado_en DESC NULLS LAST, id DESC
    ) t
    WHERE t.cliente_id = c.id AND c.canal_discord IS NULL;
    """,
]


def _migrar_catalogo_tipos_cuota(cur) -> None:
    from src.cuota_notas import canonicalizar_valor_notas

    cur.execute("SELECT id, notas FROM clients.cuotas")
    for cuota_id, notas in cur.fetchall():
        nuevo = canonicalizar_valor_notas(notas)
        if nuevo != notas:
            cur.execute("UPDATE clients.cuotas SET notas = %s WHERE id = %s", (nuevo, cuota_id))


def _migrar_pagos_desde_cuotas_pagadas(cur) -> None:
    """Una fila de pago + imputación por cada cuota legacy ya marcada pagada."""
    cur.execute(
        """
        SELECT c.id, c.cliente_id, c.monto_usd,
               COALESCE(c.fecha_pago, c.fecha_vence, CURRENT_DATE)
        FROM clients.cuotas c
        WHERE c.estado = 'pagado'
          AND NOT EXISTS (
            SELECT 1 FROM clients.pago_imputaciones i WHERE i.cuota_id = c.id
          )
        ORDER BY c.id
        """
    )
    rows = cur.fetchall()
    for cuota_id, cliente_id, monto, fecha in rows:
        cur.execute(
            """
            INSERT INTO clients.pagos (cliente_id, monto_usd, fecha, origen, notas)
            VALUES (%s, %s, %s, 'migracion', 'migracion desde cuota pagada legacy')
            RETURNING id
            """,
            (cliente_id, monto, fecha),
        )
        pago_id = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO clients.pago_imputaciones (pago_id, cuota_id, monto_usd)
            VALUES (%s, %s, %s)
            """,
            (pago_id, cuota_id, monto),
        )


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
            try:
                _migrar_catalogo_tipos_cuota(cur)
            except Exception:
                pass
            try:
                _migrar_pagos_desde_cuotas_pagadas(cur)
            except Exception:
                pass
    finally:
        conn.close()


def init_db() -> None:
    import src.models  # noqa: F401

    run_migrations()
    db.bind(provider="postgres", dsn=config("DATABASE_URL"))
    db.generate_mapping(create_tables=False)
