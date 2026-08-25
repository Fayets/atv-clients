import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  correrMes,
  correrSemana,
  etiquetaMes,
  etiquetaSemana,
  fetchVentas,
  mesCalendario,
  semanaComercial,
} from '../api/reportes'
import Navbar from '../components/Navbar'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { formatUsd } from '../utils/format'
import { ESTADO_VARIANT, fechaConAnio, tasa, TIPO_ICON } from '../utils/reportes'
import { HeroReporte, PullSlot, Thumb } from './reportesShared'
import styles from './Reportes.module.css'

/** El handle enlaza al perfil; se abre en otra pestaña. */
function IgLink({ handle }) {
  if (!handle) return null
  return (
    <a
      className={styles.leadIg}
      href={`https://instagram.com/${encodeURIComponent(handle)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      @{handle}
    </a>
  )
}

function EstadoBadge({ estado }) {
  if (!estado) return <span className={styles.vacio}>sin cargar</span>
  const variant = ESTADO_VARIANT[estado.toLowerCase()] || 'estadoDefault'
  return <span className={`${styles.estado} ${styles[variant]}`}>{estado}</span>
}

function AdsFlag({ valor }) {
  if (valor === true) {
    return <i className={`ti ti-circle-check-filled ${styles.adsSi}`} title="Vino de ads" />
  }
  if (valor === false) {
    return <i className={`ti ti-circle-x-filled ${styles.adsNo}`} title="No vino de ads" />
  }
  return <span className={styles.adsDesconocido} title="Sin registrar">?</span>
}

/**
 * Punto base / punto final. Cuando la pieza tiene imagen, la miniatura ya la
 * identifica y el título largo solo estorba: se muestra imagen y fecha.
 * El texto queda solo para lo que no tiene imagen (texto libre u otros).
 */
const CON_IMAGEN = ['reel', 'historia', 'youtube', 'ads', 'bio']
const APAISADAS = ['youtube', 'ads']

const NOMBRE_TIPO = {
  reel: 'Reel',
  historia: 'Historia',
  youtube: 'YouTube',
  ads: 'ADS',
  bio: 'BIO',
}

function nombrePieza(pieza) {
  if (!pieza) return null
  return NOMBRE_TIPO[pieza.tipo] || pieza.label
}

function PiezaCelda({ pieza, vacio }) {
  if (!pieza) return <span className={styles.vacio}>{vacio}</span>

  const conImagen = CON_IMAGEN.includes(pieza.tipo)
  const nombre = nombrePieza(pieza)

  return (
    <div className={styles.puntoBase}>
      {conImagen ? (
        <Thumb
          src={pieza.thumb}
          tipo={pieza.tipo}
          alt={nombre}
          size="sm"
          formato={APAISADAS.includes(pieza.tipo) ? 'horizontal' : 'vertical'}
        />
      ) : null}
      <div className={styles.puntoBaseTexto}>
        <span className={styles.piezaRef}>{nombre}</span>
        {pieza.fecha ? <span className={styles.piezaRefFecha}>{fechaConAnio(pieza.fecha)}</span> : null}
      </div>
    </div>
  )
}

/** Bloque visual para mobile: miniatura + nombre debajo. */
function PiezaMini({ pieza, vacio }) {
  if (!pieza) return <span className={styles.vacio}>{vacio}</span>

  const conImagen = CON_IMAGEN.includes(pieza.tipo)
  const nombre = nombrePieza(pieza)

  return (
    <div className={styles.piezaMini}>
      {conImagen ? (
        <Thumb
          src={pieza.thumb}
          tipo={pieza.tipo}
          alt={nombre}
          size="sm"
          formato={APAISADAS.includes(pieza.tipo) ? 'horizontal' : 'vertical'}
        />
      ) : (
        <span className={`${styles.thumb} ${styles.thumbSm} ${styles.piezaMiniVacio}`}>
          <i className={`ti ${TIPO_ICON[pieza.tipo] || 'ti-help-circle'}`} />
        </span>
      )}
      <span className={styles.piezaMiniNombre}>{nombre}</span>
      {pieza.fecha ? (
        <span className={styles.piezaMiniFecha}>{fechaConAnio(pieza.fecha)}</span>
      ) : null}
    </div>
  )
}

/** ¿Tiene algo que mostrar más allá del nombre? */
function tieneDatos(lead) {
  return Boolean(lead.punto_base || lead.punto_final || lead.pago > 0)
}

function esCerrado(estado) {
  return String(estado || '').trim().toLowerCase() === 'cerrado'
}

/** Cerrados primero; dentro de cada grupo, llamada más reciente arriba. */
function ordenarLeads(leads) {
  return [...leads].sort((a, b) => {
    const ca = esCerrado(a.estado) ? 0 : 1
    const cb = esCerrado(b.estado) ? 0 : 1
    if (ca !== cb) return ca - cb
    return String(b.fecha_call || '').localeCompare(String(a.fecha_call || ''))
  })
}

/** Vista de mobile: datos del lead + puntos con miniatura. */
function LeadCard({ lead }) {
  return (
    <article className={styles.leadCard}>
      <div className={styles.leadCardBody}>
        <div className={styles.leadCardHead}>
          <span className={styles.leadNombre}>{lead.nombre}</span>
          <EstadoBadge estado={lead.estado} />
        </div>
        <IgLink handle={lead.ig} />

        <div className={styles.leadCardPuntos}>
          <div className={styles.leadCardPunto}>
            <span className={styles.leadCardPuntoLabel}>Punto base</span>
            <PiezaMini pieza={lead.punto_base} vacio="desconocido" />
          </div>
          <div className={styles.leadCardPunto}>
            <span className={styles.leadCardPuntoLabel}>Punto final</span>
            <PiezaMini pieza={lead.punto_final} vacio="sin registrar" />
          </div>
        </div>

        <dl className={styles.leadCardDatos}>
          <div>
            <dt>Ads</dt>
            <dd><AdsFlag valor={lead.vino_de_ads} /></dd>
          </div>
          <div>
            <dt>Llamada</dt>
            <dd>{fechaConAnio(lead.fecha_call)}</dd>
          </div>
        </dl>

        {lead.pago > 0 ? (
          <div className={styles.leadCardPago}>
            <span className={styles.pagoMonto}>{formatUsd(lead.pago)}</span>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function TablaLeads({ leads, periodo }) {
  const ordenados = useMemo(() => ordenarLeads(leads), [leads])
  const conDatos = ordenados.filter(tieneDatos)
  const ocultos = ordenados.length - conDatos.length
  const titulo = periodo === 'mes' ? 'Llamadas del mes' : 'Llamadas de la semana'
  const vacioMsg = periodo === 'mes'
    ? 'No hubo llamadas en este mes.'
    : 'No hubo llamadas en esta semana.'

  return (
    <section className={styles.seccion}>
      <header className={styles.seccionHead}>
        <div>
          <h2 className={styles.seccionTitulo}>{titulo}</h2>
          <p className={styles.seccionMeta}>
            {ordenados.length} {ordenados.length === 1 ? 'llamada' : 'llamadas'} · cerradas primero
          </p>
        </div>
      </header>

      {ordenados.length === 0 ? (
        <p className={styles.panelVacio}>{vacioMsg}</p>
      ) : (
        <>
        <div className={styles.soloMobile}>
          {conDatos.length === 0 ? (
            <p className={styles.panelVacio}>
              Ninguna de las {ordenados.length} llamadas tiene datos cargados todavía.
            </p>
          ) : (
            <>
              {conDatos.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
              {ocultos > 0 ? (
                <p className={styles.leadCardNota}>
                  {ocultos} {ocultos === 1 ? 'llamada más sin datos cargados' : 'llamadas más sin datos cargados'}
                </p>
              ) : null}
            </>
          )}
        </div>
        <div className={`${styles.tablaWrap} ${styles.soloDesktop}`}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Punto base</th>
                <th className={styles.colCentro}>Ads</th>
                <th>Punto final</th>
                <th>Estado</th>
                <th className={styles.colDerecha}>Pago</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <span className={styles.leadNombre}>{lead.nombre}</span>
                    <IgLink handle={lead.ig} />
                    <span className={styles.leadSeguidores}>{fechaConAnio(lead.fecha_call)}</span>
                  </td>
                  <td><PiezaCelda pieza={lead.punto_base} vacio="desconocido" /></td>
                  <td className={styles.colCentro}><AdsFlag valor={lead.vino_de_ads} /></td>
                  <td><PiezaCelda pieza={lead.punto_final} vacio="sin registrar" /></td>
                  <td><EstadoBadge estado={lead.estado} /></td>
                  <td className={styles.colDerecha}>
                    {lead.pago > 0 ? (
                      <span className={styles.pagoMonto}>{formatUsd(lead.pago)}</span>
                    ) : (
                      <span className={styles.vacio}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  )
}

function PuntoFinal({ filas }) {
  const sinRegistrar = filas.length === 1 && filas[0].label === 'Sin registrar'

  return (
    <section className={styles.seccion}>
      <header className={styles.seccionHead}>
        <div>
          <h2 className={styles.seccionTitulo}>Punto final</h2>
          <p className={styles.seccionMeta}>
            Qué pieza convierte mejor delante del cierre · se mide por tasa, no por cash
          </p>
        </div>
      </header>

      <div className={styles.panel}>
        {sinRegistrar ? (
          <p className={styles.panelVacio}>
            Ninguna llamada de esta semana tiene cargado el <strong>punto de agenda</strong> en
            ATV MKT, así que no se puede comparar qué pieza cierra mejor.
          </p>
        ) : (
          <ul className={styles.ranking}>
            {filas.map((row) => (
              <li key={row.label} className={styles.rankingRowSimple}>
                <div className={styles.rankingInfo}>
                  <span className={styles.rankingPieza}>{row.label}</span>
                  <span className={styles.rankingMeta}>
                    {row.cierres} de {row.llamadas} {row.llamadas === 1 ? 'llamada' : 'llamadas'}
                  </span>
                </div>
                <div className={styles.rankingBarra}>
                  <span
                    className={`${styles.rankingFill} ${styles.rankingFillAlt}`}
                    style={{ width: tasa(row.cierres, row.llamadas) === '—' ? 0 : tasa(row.cierres, row.llamadas) }}
                  />
                </div>
                <span className={styles.rankingCash}>{tasa(row.cierres, row.llamadas)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function VentasPage() {
  const [periodo, setPeriodo] = useState('semana')
  const [rango, setRango] = useState(() => semanaComercial())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cambiarPeriodo = (next) => {
    if (next === periodo) return
    setPeriodo(next)
    setRango(next === 'mes' ? mesCalendario() : semanaComercial())
  }

  const cargar = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      setData(await fetchVentas(rango))
    } catch (err) {
      if (!silent) setData(null)
      setError(err.message || 'Error al cargar el reporte')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [rango])

  useEffect(() => { cargar() }, [cargar])

  const onRefresh = useCallback(() => cargar({ silent: true }), [cargar])
  const { pageRef, pullPx, refreshing, pullThreshold } = usePullToRefresh(onRefresh)

  const f = data?.funnel
  const leads = data?.leads || []

  const subtitulo = loading
    ? 'Cargando…'
    : periodo === 'mes'
      ? `${etiquetaMes(rango.desde)} · mes calendario`
      : `Semana ${etiquetaSemana(rango.desde, rango.hasta)} (viernes a viernes)`

  return (
    <div className={styles.page} ref={pageRef}>
      <Navbar currentPath="/ventas" />

      <PullSlot pullPx={pullPx} refreshing={refreshing} threshold={pullThreshold} />

      <main className={styles.content}>
        <HeroReporte titulo="Ventas" subtitulo={subtitulo} enVivo>
          <div className={styles.heroNavCol}>
            <div className={styles.periodoToggle} role="group" aria-label="Periodo">
              <button
                type="button"
                className={periodo === 'semana' ? styles.periodoToggleOn : ''}
                onClick={() => cambiarPeriodo('semana')}
              >
                Semana
              </button>
              <button
                type="button"
                className={periodo === 'mes' ? styles.periodoToggleOn : ''}
                onClick={() => cambiarPeriodo('mes')}
              >
                Mes
              </button>
            </div>

            {periodo === 'semana' ? (
              <div className={styles.semanaNav}>
                <button type="button" onClick={() => setRango(correrSemana(rango.desde, -7))} aria-label="Semana anterior">
                  <i className="ti ti-chevron-left" />
                </button>
                <button type="button" className={styles.semanaHoy} onClick={() => setRango(semanaComercial())}>
                  Esta semana
                </button>
                <button type="button" onClick={() => setRango(correrSemana(rango.desde, 7))} aria-label="Semana siguiente">
                  <i className="ti ti-chevron-right" />
                </button>
              </div>
            ) : (
              <div className={styles.semanaNav}>
                <button type="button" onClick={() => setRango(correrMes(rango.desde, -1))} aria-label="Mes anterior">
                  <i className="ti ti-chevron-left" />
                </button>
                <button type="button" className={styles.semanaHoy} onClick={() => setRango(mesCalendario())}>
                  Este mes
                </button>
                <button type="button" onClick={() => setRango(correrMes(rango.desde, 1))} aria-label="Mes siguiente">
                  <i className="ti ti-chevron-right" />
                </button>
              </div>
            )}
          </div>
        </HeroReporte>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        {f ? (
          <>
            <TablaLeads leads={leads} periodo={periodo} />
            <PuntoFinal filas={data.punto_final || []} />
          </>
        ) : null}
      </main>
    </div>
  )
}
