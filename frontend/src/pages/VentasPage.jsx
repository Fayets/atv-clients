import { useCallback, useEffect, useState } from 'react'
import { correrSemana, etiquetaSemana, fetchVentas, semanaComercial } from '../api/reportes'
import Navbar from '../components/Navbar'
import { formatUsd } from '../utils/format'
import { ESTADO_VARIANT, fechaConAnio, tasa } from '../utils/reportes'
import { HeroReporte, Thumb } from './reportesShared'
import styles from './Reportes.module.css'

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

/** Celda de punto base / punto final: miniatura + label, o el hueco explícito. */
/**
 * Punto base / punto final. Cuando la pieza tiene imagen, la miniatura ya la
 * identifica y el título largo solo estorba: se muestra imagen y fecha.
 * El texto queda solo para lo que no tiene imagen (bio, texto libre).
 */
const CON_IMAGEN = ['reel', 'historia', 'youtube', 'ads']
const APAISADAS = ['youtube', 'ads']

function PiezaCelda({ pieza, vacio }) {
  if (!pieza) return <span className={styles.vacio}>{vacio}</span>

  const conImagen = CON_IMAGEN.includes(pieza.tipo)

  return (
    <div className={styles.puntoBase}>
      {conImagen ? (
        <Thumb
          src={pieza.thumb}
          tipo={pieza.tipo}
          alt={pieza.label}
          size="sm"
          formato={APAISADAS.includes(pieza.tipo) ? 'horizontal' : 'vertical'}
        />
      ) : null}
      <div className={styles.puntoBaseTexto}>
        {conImagen ? null : <span className={styles.piezaRef}>{pieza.label}</span>}
        {pieza.fecha ? <span className={styles.piezaRefFecha}>{fechaConAnio(pieza.fecha)}</span> : null}
      </div>
    </div>
  )
}

function TablaLeads({ leads }) {
  return (
    <section className={styles.seccion}>
      <header className={styles.seccionHead}>
        <div>
          <h2 className={styles.seccionTitulo}>Llamadas de la semana</h2>
          <p className={styles.seccionMeta}>
            {leads.length} {leads.length === 1 ? 'llamada' : 'llamadas'} · una fila por lead que tuvo call
          </p>
        </div>
      </header>

      {leads.length === 0 ? (
        <p className={styles.panelVacio}>No hubo llamadas en esta semana.</p>
      ) : (
        <div className={styles.tablaWrap}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Lead</th>
                <th>Punto base</th>
                <th className={styles.colCentro}>Ads</th>
                <th>Punto final</th>
                <th>Estado</th>
                <th>Closer</th>
                <th className={styles.colDerecha}>Pago</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <span className={styles.leadNombre}>{lead.nombre}</span>
                    {lead.ig ? <span className={styles.leadIg}>@{lead.ig}</span> : null}
                    <span className={styles.leadSeguidores}>{fechaConAnio(lead.fecha_call)}</span>
                  </td>
                  <td><PiezaCelda pieza={lead.punto_base} vacio="desconocido" /></td>
                  <td className={styles.colCentro}><AdsFlag valor={lead.vino_de_ads} /></td>
                  <td><PiezaCelda pieza={lead.punto_final} vacio="sin registrar" /></td>
                  <td><EstadoBadge estado={lead.estado} /></td>
                  <td><span className={styles.leadCloser}>{lead.closer || '—'}</span></td>
                  <td className={styles.colDerecha}>
                    {lead.pago > 0 ? (
                      <span className={styles.pagoMonto}>{formatUsd(lead.pago)}</span>
                    ) : (
                      <span className={styles.vacio}>—</span>
                    )}
                    {lead.debe > 0 ? (
                      <span className={styles.pagoDebe}>debe {formatUsd(lead.debe)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [semana, setSemana] = useState(() => semanaComercial())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await fetchVentas(semana))
    } catch (err) {
      setData(null)
      setError(err.message || 'Error al cargar el reporte')
    } finally {
      setLoading(false)
    }
  }, [semana])

  useEffect(() => { cargar() }, [cargar])

  const f = data?.funnel
  const leads = data?.leads || []

  return (
    <div className={styles.page}>
      <Navbar currentPath="/ventas" />

      <main className={styles.content}>
        <HeroReporte
          titulo="Ventas"
          subtitulo={
            loading
              ? 'Cargando…'
              : `Semana ${etiquetaSemana(semana.desde, semana.hasta)} (viernes a viernes)`
          }
          enVivo
        >
          <div className={styles.semanaNav}>
            <button type="button" onClick={() => setSemana(correrSemana(semana.desde, -7))} aria-label="Semana anterior">
              <i className="ti ti-chevron-left" />
            </button>
            <button type="button" className={styles.semanaHoy} onClick={() => setSemana(semanaComercial())}>
              Esta semana
            </button>
            <button type="button" onClick={() => setSemana(correrSemana(semana.desde, 7))} aria-label="Semana siguiente">
              <i className="ti ti-chevron-right" />
            </button>
          </div>
        </HeroReporte>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        {f ? (
          <>
            <TablaLeads leads={leads} />
            <PuntoFinal filas={data.punto_final || []} />
          </>
        ) : null}
      </main>
    </div>
  )
}
