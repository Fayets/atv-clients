import { useCallback, useEffect, useState } from 'react'
import { correrSemana, etiquetaSemana, fetchContenido, semanaComercial } from '../api/reportes'
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

function RankingCash({ piezas }) {
  const conCash = piezas.filter((p) => p.cash > 0).sort((a, b) => b.cash - a.cash)
  const maxCash = Math.max(...conCash.map((p) => p.cash), 1)

  return (
    <section className={styles.seccion}>
      <header className={styles.seccionHead}>
        <div>
          <h2 className={styles.seccionTitulo}>Cash por pieza</h2>
          <p className={styles.seccionMeta}>
            Sale de los leads cuyo punto de agenda apunta a la pieza
          </p>
        </div>
      </header>

      <div className={styles.panel}>
        {conCash.length === 0 ? (
          <p className={styles.panelVacio}>
            Ninguna pieza de esta semana tiene cash asociado. El cash aparece acá cuando
            el lead cerrado tiene cargado el <strong>punto de agenda</strong> en ATV MKT.
          </p>
        ) : (
          <ul className={styles.ranking}>
            {conCash.map((row) => (
              <li key={`${row.tipo}-${row.id}`} className={styles.rankingRow}>
                <Thumb
                  src={row.thumbnail_url || (row.slides || [])[0]?.image_url}
                  tipo={row.tipo}
                  alt={row.titulo}
                  size="xs"
                  formato={row.tipo === 'youtube' ? 'horizontal' : 'vertical'}
                />
                <div className={styles.rankingInfo}>
                  <span className={styles.rankingPieza}>{row.titulo || '(sin título)'}</span>
                  <span className={styles.rankingMeta}>
                    {row.agendas} {row.agendas === 1 ? 'agenda' : 'agendas'} · publicada {fechaConAnio(row.fecha)}
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await fetchContenido(semana))
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
  const todas = [
    ...reels.map((p) => ({ ...p, tipo: 'reel' })),
    ...historias.map((p) => ({ ...p, tipo: 'historia' })),
    ...youtube.map((p) => ({ ...p, tipo: 'youtube' })),
  ]

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

        {!loading && !error ? <RankingCash piezas={todas} /> : null}
      </main>
    </div>
  )
}
