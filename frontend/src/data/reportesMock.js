/**
 * Datos de ejemplo del reporte semanal (Marketing + Ventas).
 *
 * TEMPORAL: se reemplaza campo por campo con el snapshot que traiga
 * ATV MKT. Cada bloque marca en `origen` de qué tabla de MKT sale,
 * para saber qué queda por conectar.
 *
 * Semana comercial: viernes a viernes.
 */

export const SEMANA = {
  inicio: '2026-08-21',
  fin: '2026-08-28',
  label: '21/08 – 28/08',
}

/** Funnel de la semana. Origen: MKT.lead (agregado). */
export const FUNNEL = {
  agendas: { valor: 6, anterior: 4 },
  shows: { valor: 4, anterior: 3 },
  no_shows: { valor: 2, anterior: 1 },
  cierres: { valor: 1, anterior: 1 },
  cash: { valor: 1500, anterior: 2100 },
}

/**
 * Ventas — una fila por lead.
 * Origen: MKT.lead → nombre, ig, avatar, via, vino_de_ads,
 * punto_agenda, estado, pago, closer.
 *
 * `via` = punto base (se lleva el cash).
 * `punto_agenda` = punto final (se mide por tasa de cierre, no por cash).
 */
export const LEADS = [
  {
    id: 1,
    nombre: 'Amin Scale',
    ig: 'aminscale',
    bio: 'Implemento sistemas de Marketing & IA para empresas de servicios',
    seguidores: '2.838',
    via: 'YT · hice $233.104 en 90 días y no reembolsé a nadie',
    via_tipo: 'youtube',
    via_fecha: '2025-07-14',
    via_thumb: '/mock/yt-roadmaps-233k.jpg',
    vino_de_ads: true,
    punto_agenda: 'Juan en un anuncio',
    estado: 'Cerrado',
    pago: 1500,
    debe: 0,
    closer: 'Nick',
  },
  {
    id: 2,
    nombre: 'Brenda',
    ig: 'brenfrutos',
    bio: 'Mentora de mujeres · Creadora digital',
    seguidores: '4.549',
    via: '',
    via_tipo: '',
    via_fecha: '',
    via_thumb: '',
    vino_de_ads: null,
    punto_agenda: '',
    estado: 'Re-agenda',
    pago: 0,
    debe: 0,
    closer: 'Nick',
  },
  {
    id: 3,
    nombre: 'Alejandro Ardila León',
    ig: 'dilamattic',
    bio: 'Exclusiva Agency · Ayudando a infoproductores a aumentar sus ventas con ADS',
    seguidores: '439',
    via: 'Reel · mejor decisión que tomé',
    via_tipo: 'reel',
    via_fecha: '2026-08-11',
    via_thumb: '/mock/reel-mejor-decision.jpg',
    vino_de_ads: true,
    punto_agenda: 'Juan en un anuncio',
    estado: 'No show',
    pago: 0,
    debe: 0,
    closer: 'Nick',
  },
  {
    id: 4,
    nombre: 'María Gil',
    ig: 'soymariagil',
    bio: 'Beauty Marketing · Ayudo a micropigmentadoras a facturar +5 cifras al mes',
    seguidores: '7.734',
    via: 'BIO',
    via_tipo: 'bio',
    via_fecha: '',
    via_thumb: '',
    vino_de_ads: false,
    punto_agenda: 'DM IG',
    estado: 'Seguimiento',
    pago: 0,
    debe: 0,
    closer: 'Nick',
  },
  {
    id: 5,
    nombre: 'Lusi',
    ig: '',
    bio: '',
    seguidores: '',
    via: '',
    via_tipo: '',
    via_fecha: '',
    via_thumb: '',
    vino_de_ads: null,
    punto_agenda: '',
    estado: 'No show',
    pago: 0,
    debe: 0,
    closer: 'Nick',
  },
  {
    id: 6,
    nombre: 'Diego Puchi',
    ig: 'puchidiego',
    bio: 'Marca Personal & Redes Sociales · Agendá una sesión 1 a 1',
    seguidores: '22.400',
    via: 'Reel · $11.000 en comisiones',
    via_tipo: 'reel',
    via_fecha: '2026-08-18',
    via_thumb: '/mock/reel-11000-comisiones.jpg',
    vino_de_ads: true,
    punto_agenda: 'Juan en un anuncio',
    estado: 'Seguimiento',
    pago: 0,
    debe: 0,
    closer: 'Nick',
  },
]

/** Historias. Origen: MKT.storysequence + storyslide. */
export const HISTORIAS = [
  {
    id: 1,
    fecha: '2026-08-21',
    alcance: 11463,
    vistas_prom: 3006,
    chats: 1,
    agendas: 0,
    cash: 0,
    slides: 5,
    thumbs: [
      '/mock/historia-2108-1.jpg',
      '/mock/historia-2108-2.jpg',
      '/mock/historia-2108-3.jpg',
      '/mock/historia-2108-4.jpg',
      '/mock/historia-2108-5.jpg',
    ],
    dolor: '',
    angulo: '',
    cta: '',
  },
  {
    id: 2,
    fecha: '2026-08-23',
    alcance: 11183,
    vistas_prom: 2760,
    chats: 4,
    agendas: 0,
    cash: 0,
    slides: 5,
    thumbs: [
      '/mock/historia-2308-1.jpg',
      '/mock/historia-2308-2.jpg',
      '/mock/historia-2308-3.jpg',
      '/mock/historia-2308-4.jpg',
      '/mock/historia-2308-5.jpg',
    ],
    dolor: '',
    angulo: '',
    cta: '',
  },
]

/** Reels. Origen: MKT.reelcontent. */
export const REELS = [
  {
    id: 1,
    titulo: 'había invertido',
    fecha: '2026-08-22',
    thumb: '/mock/reel-habia-invertido.jpg',
    plays: 4820,
    reach: 3910,
    likes: 132,
    guardados: 41,
    chats: 2,
    agendas: 0,
    cash: 0,
    dolor: 'Miedo a perder la inversión',
    angulo: 'Historia personal',
    cta: 'DM "INFO"',
  },
  {
    id: 2,
    titulo: 'mejor decisión que tomé',
    fecha: '2026-08-11',
    thumb: '/mock/reel-mejor-decision.jpg',
    plays: 147000,
    reach: 121400,
    likes: 3180,
    guardados: 512,
    chats: 9,
    agendas: 1,
    cash: 0,
    dolor: 'Estancamiento',
    angulo: 'Antes y después',
    cta: 'DM "IA"',
  },
]

/** YouTube. Origen: MKT.youtubecontent. */
export const YOUTUBE = [
  {
    id: 1,
    titulo: 'armé 12 roadmaps en vivo para escalar a $100k, $200k y $300k/mes en 46 minutos',
    fecha: '2026-08-25',
    thumb: '/mock/yt-roadmaps.jpg',
    views: 2900,
    likes: 184,
    comentarios: 27,
    chats: 3,
    agendas: 1,
    cash: 0,
    dolor: 'No sabe cómo escalar',
    angulo: 'Demostración en vivo',
    cta: 'Link en descripción',
  },
]

/**
 * Ranking de contenido por cash. El cash va al PUNTO BASE
 * (la pieza que trajo al lead), nunca al punto final.
 * Origen: MKT.lead agrupado por `via`.
 */
export const RANKING_CASH = [
  {
    pieza: 'YT · hice $233.104 en 90 días y no reembolsé a nadie',
    tipo: 'youtube',
    publicada: '2025-07-14',
    thumb: '/mock/yt-roadmaps-233k.jpg',
    leads: 1,
    cash: 1500,
  },
  {
    pieza: 'Reel · mejor decisión que tomé',
    tipo: 'reel',
    publicada: '2026-08-11',
    thumb: '/mock/reel-mejor-decision.jpg',
    leads: 1,
    cash: 0,
  },
  {
    pieza: 'Reel · $11.000 en comisiones',
    tipo: 'reel',
    publicada: '2026-08-18',
    thumb: '/mock/reel-11000-comisiones.jpg',
    leads: 1,
    cash: 0,
  },
  { pieza: 'BIO', tipo: 'bio', publicada: '', leads: 1, cash: 0 },
  { pieza: 'DESCONOCIDO', tipo: 'desconocido', publicada: '', leads: 2, cash: 0 },
]

/**
 * Punto final por tasa de cierre. Sin cash asociado: mide
 * qué pieza convierte mejor delante del cierre.
 * Origen: MKT.lead agrupado por `punto_agenda`.
 */
export const PUNTO_FINAL = [
  { pieza: 'Juan en un anuncio', llamadas: 3, cierres: 1 },
  { pieza: 'DM IG', llamadas: 1, cierres: 0 },
  { pieza: 'Sin registrar', llamadas: 2, cierres: 0 },
]
