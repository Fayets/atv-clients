import { useCallback, useEffect, useState } from 'react'
import { correrSemana, etiquetaSemana, fetchContenido, fetchVentas, semanaComercial } from '../api/reportes'
import Navbar from '../components/Navbar'
import { formatUsd } from '../utils/format'
import { fechaConAnio, numero } from '../utils/reportes'
import { HeroReporte, Metricas, PiezaCard, Thumb } from './reportesShared'
import styles from './Reportes.module.css'

/** Normaliza una pieza de MKT al shape que espera PiezaCard. */
function aPieza(row, tipo) {
  if (tipo === 'historia') {
    return {
      ...row,
      titulo: row.titulo || `Secuencia de ${row.slides_count} historias`,
      slides: row.slides_count,
      thumbs: (row.slides || []).map((s) => s.image_url),
      // la barra de historias de MKT muestra replies, no el campo `chats`
      chats: row.replies,
    }
  }
  return { ...row, thumb: row.thumbnail_url }
}

function Canal({ titulo, piezas, tipo, metricas }) {
  return (
    <div className={styles.canal}>
      <h3 className={styles.canalTitulo}>
        {titulo} <span className={styles.canalCount}>{piezas.length}</span>
      </h3>
      {piezas.length === 0 ? (
        <p className={styles.canalVacio}>Sin publicaciones esta semana</p>
      ) : (
        piezas.map((row) => {
          const pieza = aPieza(row, tipo)
          return (
            <PiezaCard key={`${tipo}-${row.id}`} pieza={pieza} tipo={tipo}>
              <Metricas items={metricas(row)} />
            </PiezaCard>
          )
        })
      )}
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
 * Cash de la semana agrupado por punto de agenda.
 *
 * Parte de los leads que pagaron, no de las piezas publicadas en el rango: una
 * venta de esta semana suele venir de contenido de hace meses, o de ads, y esas
 * piezas no aparecen en el listado semanal.
 */
function rankingDesdeLeads(leads) {
  const porPieza = new Map()

  for (const lead of leads) {
    if (!(lead.pago > 0)) continue
    const pieza = lead.punto_final
    const clave = pieza?.label || 'Sin registrar'
    const acum = porPieza.get(clave) || {
      clave,
      label: pieza?.label || 'Sin registrar',
      tipo: pieza?.tipo || 'desconocido',
      thumb: pieza?.thumb || '',
      fecha: pieza?.fecha || '',
      cierres: 0,
      cash: 0,
    }
    acum.cierres += 1
    acum.cash += lead.pago
    porPieza.set(clave, acum)
  }

  return [...porPieza.values()].sort((a, b) => b.cash - a.cash)
}

function RankingCash({ leads }) {
  const filas = rankingDesdeLeads(leads)
  const maxCash = Math.max(...filas.map((f) => f.cash), 1)

  return (
    <section className={styles.seccion}>
      <header className={styles.seccionHead}>
        <div>
          <h2 className={styles.seccionTitulo}>Cash por pieza</h2>
          <p className={styles.seccionMeta}>
            Cobrado esta semana, atribuido al punto de agenda de cada venta
          </p>
        </div>
      </header>

      <div className={styles.panel}>
        {filas.length === 0 ? (
          <p className={styles.panelVacio}>
            No hubo cobros esta semana. El cash aparece acá cuando un lead con pago tiene
            cargado el <strong>punto de agenda</strong> en ATV MKT.
          </p>
        ) : (
          <ul className={styles.ranking}>
            {filas.map((row) => (
              <li key={row.clave} className={styles.rankingRow}>
                <Thumb
                  src={row.thumb}
                  tipo={row.tipo}
                  alt={row.label}
                  size="xs"
                  formato={row.tipo === 'youtube' || row.tipo === 'ads' ? 'horizontal' : 'vertical'}
                />
                <div className={styles.rankingInfo}>
                  <span className={styles.rankingPieza}>
                    {NOMBRE_TIPO[row.tipo] || row.label}
                  </span>
                  <span className={styles.rankingMeta}>
                    {row.cierres} {row.cierres === 1 ? 'venta' : 'ventas'}
                    {row.fecha ? ` · publicada ${fechaConAnio(row.fecha)}` : ''}
                  </span>
                </div>
                <div className={styles.rankingBarra}>
                  <span className={styles.rankingFill} style={{ width: `${(row.cash / maxCash) * 100}%` }} />
                </div>
                <span className={styles.rankingCash}>{formatUsd(row.cash)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function MarketingPage() {
  const [semana, setSemana] = useState(() => semanaComercial())
  const [data, setData] = useState(null)
  const [ventas, setVentas] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // las ventas son para el ranking de cash: el contenido de la semana no
      // alcanza, porque el cash suele venir de piezas más viejas o de ads
      const [contenido, vts] = await Promise.all([
        fetchContenido(semana),
        fetchVentas(semana).catch(() => null),
      ])
      setData(contenido)
      setVentas(vts)
    } catch (err) {
      setData(null)
      setError(err.message || 'Error al cargar el reporte')
    } finally {
      setLoading(false)
    }
  }, [semana])

  useEffect(() => { cargar() }, [cargar])

  const reels = data?.reels || []
  const historias = data?.historias || []
  const youtube = data?.youtube || []
  const totales = data?.totales

  const subtitulo = loading
    ? 'Cargando…'
    : totales
      ? `Semana ${etiquetaSemana(semana.desde, semana.hasta)} (viernes a viernes) · ${totales.piezas} piezas · ${numero(totales.chats)} chats · ${totales.agendas} agendas`
      : `Semana ${etiquetaSemana(semana.desde, semana.hasta)} (viernes a viernes)`

  return (
    <div className={styles.page}>
      <Navbar currentPath="/marketing" />

      <main className={styles.content}>
        <HeroReporte titulo="Marketing" subtitulo={subtitulo} enVivo>
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

        <section className={styles.seccion}>
          <div className={styles.canales}>
            <Canal
              titulo="Reels" piezas={reels} tipo="reel"
              metricas={(r) => [
                { label: 'Plays', valor: numero(r.plays) },
                { label: 'Alcance', valor: numero(r.reach) },
                { label: 'Guardados', valor: numero(r.guardados) },
                { label: 'Chats', valor: numero(r.chats), destacado: true },
                { label: 'Agendas', valor: numero(r.agendas), destacado: true },
              ]}
            />
            <Canal
              titulo="Historias" piezas={historias} tipo="historia"
              metricas={(h) => [
                { label: 'Alcance', valor: numero(h.alcance) },
                { label: 'Vis. prom.', valor: numero(h.vistas_prom) },
                { label: 'Chats', valor: numero(h.replies), destacado: true },
                { label: 'Agendas', valor: numero(h.agendas), destacado: true },
              ]}
            />
            <Canal
              titulo="YouTube" piezas={youtube} tipo="youtube"
              metricas={(v) => [
                { label: 'Views', valor: numero(v.views) },
                { label: 'Likes', valor: numero(v.likes) },
                { label: 'Coment.', valor: numero(v.comentarios) },
                { label: 'Chats', valor: numero(v.chats), destacado: true },
                { label: 'Agendas', valor: numero(v.agendas), destacado: true },
              ]}
            />
          </div>
        </section>

        {!loading && !error ? <RankingCash leads={ventas?.leads || []} /> : null}
      </main>
    </div>
  )
}
