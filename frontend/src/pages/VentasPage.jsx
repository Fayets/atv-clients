import { useCallback, useEffect, useState } from 'react'
import { correrSemana, etiquetaSemana, fetchVentas, semanaComercial } from '../api/reportes'
import Navbar from '../components/Navbar'
import { formatUsd } from '../utils/format'
import { ESTADO_VARIANT, fechaConAnio, tasa } from '../utils/reportes'
import { HeroReporte, Thumb } from './reportesShared'
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

const NOMBRE_TIPO = {
  reel: 'Reel',
  historia: 'Historia',
  youtube: 'YouTube',
  ads: 'ADS',
  bio: 'BIO',
}

/**
 * Texto corto de una pieza. Para las que tienen imagen se usa el canal y la
 * fecha: el título completo es largo y la miniatura ya la identifica.
 */
function resumenPieza(pieza) {
  if (!pieza) return null
  const nombre = NOMBRE_TIPO[pieza.tipo] || pieza.label
  if (!CON_IMAGEN.includes(pieza.tipo)) return pieza.label
  return pieza.fecha ? `${nombre} · ${fechaConAnio(pieza.fecha)}` : nombre
}

/** ¿Tiene algo que mostrar más allá del nombre? */
function tieneDatos(lead) {
  return Boolean(lead.punto_base || lead.punto_final || lead.pago > 0)
}

/** Vista de mobile: imagen a la izquierda, datos al lado. */
function LeadCard({ lead }) {
  const pieza = lead.punto_base || lead.punto_final
  const conImagen = pieza && CON_IMAGEN.includes(pieza.tipo)

  return (
    <article className={styles.leadCard}>
      {conImagen ? (
        <Thumb
          src={pieza.thumb}
          tipo={pieza.tipo}
          alt={pieza.label}
          size="sm"
          formato={APAISADAS.includes(pieza.tipo) ? 'horizontal' : 'vertical'}
        />
      ) : null}

      <div className={styles.leadCardBody}>
        <div className={styles.leadCardHead}>
          <span className={styles.leadNombre}>{lead.nombre}</span>
          <EstadoBadge estado={lead.estado} />
        </div>
        <IgLink handle={lead.ig} />

        <dl className={styles.leadCardDatos}>
          <div>
            <dt>Punto base</dt>
            <dd>{resumenPieza(lead.punto_base) || <span className={styles.vacio}>desconocido</span>}</dd>
          </div>
          <div>
            <dt>Punto final</dt>
            <dd>{resumenPieza(lead.punto_final) || <span className={styles.vacio}>sin registrar</span>}</dd>
          </div>
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

function TablaLeads({ leads }) {
  const conDatos = leads.filter(tieneDatos)
  const ocultos = leads.length - conDatos.length

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
        <>
        <div className={styles.soloMobile}>
          {conDatos.length === 0 ? (
            <p className={styles.panelVacio}>
              Ninguna de las {leads.length} llamadas tiene datos cargados todavía.
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
              {leads.map((lead) => (
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
