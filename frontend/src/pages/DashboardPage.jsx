import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchClientes, patchCliente } from '../api/clientes'
import InlineField from '../components/InlineField'
import Navbar from '../components/Navbar'
import NuevoClienteForm from '../components/NuevoClienteForm'
import PlanBadge from '../components/PlanBadge'
import StatusBadge from '../components/StatusBadge'
import { ESTADOS_CLIENTE, ESTADOS_FILTRO, OPORTUNIDADES, PLANES, PLANES_CLIENTE } from '../constants/options'
import { formatDate, formatOportunidad, formatUsd } from '../utils/format'
import { navigate } from '../utils/navigation'
import styles from './DashboardPage.module.css'

const PAGE_SIZE = 15

function truncateText(text, max = 48) {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export default function DashboardPage() {
  const [clientes, setClientes] = useState([])
  const [allClientes, setAllClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [estadoFilter, setEstadoFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [orden, setOrden] = useState('venc_asc')
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)
  const [miroModal, setMiroModal] = useState(null)
  const [pressedRowId, setPressedRowId] = useState(null)

  const loadAll = useCallback(async () => {
    const data = await fetchClientes()
    setAllClientes(data)
  }, [])

  const loadFiltered = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchClientes({
        estado: estadoFilter || undefined,
        plan: planFilter || undefined,
        q: search.trim() || undefined,
        orden,
      })
      setClientes(data)
    } catch {
      setClientes([])
    } finally {
      setLoading(false)
    }
  }, [estadoFilter, planFilter, orden, search])

  const refreshLists = useCallback(async () => {
    await Promise.all([loadAll(), loadFiltered()])
  }, [loadAll, loadFiltered])

  const handleClienteCreated = async (created) => {
    setShowCreate(false)
    await refreshLists()
    navigate(`/cliente/${created.id}`)
  }

  useEffect(() => {
    loadAll().catch(() => setAllClientes([]))
  }, [loadAll])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadFiltered()
    }, 250)
    return () => clearTimeout(timer)
  }, [loadFiltered])

  useEffect(() => {
    setPage(1)
  }, [search, estadoFilter, planFilter, orden])

  const totalPages = Math.max(1, Math.ceil(clientes.length / PAGE_SIZE))

  const paginatedClientes = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return clientes.slice(start, start + PAGE_SIZE)
  }, [clientes, page])

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const pageRange = useMemo(() => {
    if (!clientes.length) return { from: 0, to: 0 }
    const from = (page - 1) * PAGE_SIZE + 1
    const to = Math.min(page * PAGE_SIZE, clientes.length)
    return { from, to }
  }, [clientes.length, page])

  const metrics = useMemo(() => {
    const vigentes = allClientes.filter((c) => c.estado_efectivo === 'vigente' || c.estado_efectivo === 'estan_bien').length
    const proximos = allClientes.filter((c) => c.estado_efectivo === 'proximo_a_vencer').length
    const vencidos = allClientes.filter((c) => c.estado_efectivo === 'vencido').length
    const totalAdeudado = allClientes.reduce((sum, c) => sum + Number(c.total_adeudado_usd || 0), 0)
    return { vigentes, proximos, vencidos, totalAdeudado }
  }, [allClientes])

  const updateCliente = async (id, patch) => {
    const updated = await patchCliente(id, patch)
    setClientes((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)))
    setAllClientes((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)))
  }

  const toggleOrden = () => {
    setOrden((prev) => (prev === 'venc_asc' ? 'venc_desc' : 'venc_asc'))
  }

  const getMiroBoards = (cliente) => {
    if (cliente.miros?.length) return cliente.miros
    if (cliente.miro_url) {
      return [{ id: 'legacy', titulo: 'MIRO', url: cliente.miro_url }]
    }
    return []
  }

  const openMiroBoard = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleMiroClick = (cliente) => {
    const boards = getMiroBoards(cliente)
    if (!boards.length) return
    if (boards.length === 1) {
      openMiroBoard(boards[0].url)
      return
    }
    setMiroModal({ nombre: cliente.nombre, boards })
  }

  const closeMiroModal = () => setMiroModal(null)

  const goToCliente = (clienteId) => {
    navigate(`/cliente/${clienteId}`)
  }

  const stopRowNav = (event) => {
    event.stopPropagation()
  }

  const handleRowPressStart = (event, clienteId) => {
    if (event.target.closest('[data-row-action]')) return
    setPressedRowId(clienteId)
  }

  const handleRowPressEnd = () => {
    setPressedRowId(null)
  }

  const handleRowClick = (event, clienteId) => {
    if (event.target.closest('[data-row-action]')) return
    goToCliente(clienteId)
  }

  return (
    <div className={styles.page}>
      <Navbar currentPath="/" />

      <main className={styles.content}>
        <section className={styles.metricsGrid}>
          <div className={styles.metricCard}>
            <div className={styles.metricHead}>
              <span className={styles.metricLabel}>Vigentes</span>
              <i className="ti ti-circle-check" />
            </div>
            <div className={styles.metricNum}>{metrics.vigentes}</div>
          </div>
          <div className={`${styles.metricCard} ${styles.metricHighlight}`}>
            <div className={styles.metricHead}>
              <span className={styles.metricLabel}>Próximos a vencer</span>
              <i className="ti ti-clock" />
            </div>
            <div className={`${styles.metricNum} ${styles.metricNumRed}`}>{metrics.proximos}</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricHead}>
              <span className={styles.metricLabel}>Vencidos</span>
              <i className="ti ti-alert-triangle" />
            </div>
            <div className={styles.metricNum}>{metrics.vencidos}</div>
          </div>
          <div className={styles.metricCard}>
            <div className={styles.metricHead}>
              <span className={styles.metricLabel}>Total adeudado USD</span>
              <i className="ti ti-currency-dollar" />
            </div>
            <div className={styles.metricNum}>{formatUsd(metrics.totalAdeudado)}</div>
          </div>
        </section>

        {showCreate ? (
          <NuevoClienteForm
            onCreated={handleClienteCreated}
            onCancel={() => setShowCreate(false)}
          />
        ) : null}

        <section className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <label className={styles.searchWrap}>
              <i className="ti ti-search" />
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Buscar por nombre o email..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select className={styles.select} value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)}>
              {ESTADOS_FILTRO.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select className={styles.select} value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
              {PLANES.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button type="button" className={styles.sortBtn} onClick={toggleOrden}>
              <i className={`ti ${orden === 'venc_asc' ? 'ti-sort-ascending' : 'ti-sort-descending'}`} />
              Vencimiento {orden === 'venc_asc' ? '↑' : '↓'}
            </button>
          </div>
          <div className={styles.toolbarRight}>
            <button type="button" className={styles.createBtn} onClick={() => setShowCreate((prev) => !prev)}>
              <i className="ti ti-plus" />
              Nuevo cliente
            </button>
            <span className={styles.count}>
              {clientes.length
                ? `${pageRange.from}–${pageRange.to} de ${clientes.length} clientes`
                : '0 clientes'}
            </span>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th>Oportunidad</th>
                  <th>Próximos pasos</th>
                  <th>Miro</th>
                  <th>Última call</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className={styles.cellMuted}>Cargando...</td>
                  </tr>
                ) : clientes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.cellMuted}>No hay clientes con esos filtros</td>
                  </tr>
                ) : (
                  paginatedClientes.map((cliente) => (
                    <tr
                      key={cliente.id}
                      className={[
                        styles.rowClickable,
                        pressedRowId === cliente.id ? styles.rowPressed : '',
                        cliente.prioridad_cobro === 'alta' ? styles.rowPrioridadAlta : '',
                      ].filter(Boolean).join(' ')}
                      onMouseDown={(event) => handleRowPressStart(event, cliente.id)}
                      onMouseUp={handleRowPressEnd}
                      onMouseLeave={handleRowPressEnd}
                      onClick={(event) => handleRowClick(event, cliente.id)}
                    >
                      <td className={styles.cellName}>
                        {cliente.nombre}
                      </td>
                      <td className={styles.cellEditable}>
                        <span className={styles.cellInteractive} data-row-action onClick={stopRowNav}>
                          <InlineField
                            type="select"
                            variant="chip"
                            value={cliente.plan_actual}
                            displayValue={<PlanBadge plan={cliente.plan_actual} />}
                            options={PLANES_CLIENTE}
                            onSave={(value) => updateCliente(cliente.id, { plan_actual: value })}
                          />
                        </span>
                      </td>
                      <td className={styles.cellEditable}>
                        <span className={styles.cellInteractive} data-row-action onClick={stopRowNav}>
                          <InlineField
                            type="select"
                            variant="chip"
                            value={cliente.estado_cliente}
                            displayValue={<StatusBadge estado={cliente.estado_efectivo} />}
                            options={ESTADOS_CLIENTE}
                            onSave={(value) => updateCliente(cliente.id, { estado_cliente: value })}
                          />
                        </span>
                      </td>
                      <td className={styles.cellEditable}>
                        <span className={styles.cellInteractive} data-row-action onClick={stopRowNav}>
                          <InlineField
                            type="select"
                            variant="chip"
                            value={cliente.oportunidad || ''}
                            displayValue={formatOportunidad(cliente.oportunidad)}
                            options={OPORTUNIDADES}
                            onSave={(value) => updateCliente(cliente.id, { oportunidad: value || null })}
                          />
                        </span>
                      </td>
                      <td className={styles.cellMuted}>
                        {cliente.ultimo_proximos_pasos ? (
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            title={[
                              formatDate(cliente.ultimo_proximos_pasos.fecha_llamada),
                              cliente.ultimo_proximos_pasos.contenido && cliente.ultimo_proximos_pasos.contenido !== '—'
                                ? cliente.ultimo_proximos_pasos.contenido
                                : null,
                            ].filter(Boolean).join('\n')}
                          >
                            {cliente.ultimo_proximos_pasos.link ? (
                              <>
                                <a
                                  href={cliente.ultimo_proximos_pasos.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={styles.tableBrandLink}
                                  data-row-action
                                  onClick={stopRowNav}
                                  aria-label={`Google Docs — ${cliente.ultimo_proximos_pasos.mentor}`}
                                >
                                  <img src="/logos/google-docs.png" alt="" className={styles.tableBrandLogo} />
                                </a>
                                <span>{` - ${cliente.ultimo_proximos_pasos.mentor}`}</span>
                              </>
                            ) : (
                              <>
                                {cliente.ultimo_proximos_pasos.contenido && cliente.ultimo_proximos_pasos.contenido !== '—'
                                  ? `${truncateText(cliente.ultimo_proximos_pasos.contenido)} - `
                                  : `${formatDate(cliente.ultimo_proximos_pasos.fecha_llamada)} - `}
                                {cliente.ultimo_proximos_pasos.mentor}
                              </>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.cellBrand}>
                        {getMiroBoards(cliente).length ? (
                          <button
                            type="button"
                            className={styles.tableBrandBtn}
                            data-row-action
                            onClick={(event) => {
                              stopRowNav(event)
                              handleMiroClick(cliente)
                            }}
                            title={getMiroBoards(cliente).length > 1 ? 'Elegir board de Miro' : 'Abrir Miro'}
                          >
                            <img src="/logos/miro.png" alt="Miro" className={styles.tableBrandLogo} />
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.cellBrand}>
                        {cliente.fathom_last_call_url ? (
                          <a
                            href={cliente.fathom_last_call_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.tableBrandLink}
                            data-row-action
                            title={formatDate(cliente.fathom_last_call)}
                            onClick={stopRowNav}
                          >
                            <img src="/logos/fathom.png" alt="Abrir Fathom" className={styles.tableBrandLogoFathom} />
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {!loading && clientes.length > 0 ? (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.paginationBtn}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
              >
                <i className="ti ti-chevron-left" />
                Anterior
              </button>
              <span className={styles.paginationInfo}>
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                className={styles.paginationBtn}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
              >
                Siguiente
                <i className="ti ti-chevron-right" />
              </button>
            </div>
          ) : null}
        </section>

        {miroModal ? (
          <div className={styles.miroModalOverlay} onClick={closeMiroModal}>
            <div className={styles.miroModal} onClick={(event) => event.stopPropagation()}>
              <div className={styles.miroModalHeader}>
                <h3 className={styles.miroModalTitle}>Boards de Miro — {miroModal.nombre}</h3>
                <button type="button" className={styles.miroModalClose} onClick={closeMiroModal} aria-label="Cerrar">
                  <i className="ti ti-x" />
                </button>
              </div>
              <ul className={styles.miroModalList}>
                {miroModal.boards.map((board) => (
                  <li key={board.id}>
                    <button
                      type="button"
                      className={styles.miroModalItem}
                      onClick={() => {
                        openMiroBoard(board.url)
                        closeMiroModal()
                      }}
                    >
                      <img src="/logos/miro.png" alt="" className={styles.miroModalItemLogo} />
                      <span>{board.titulo}</span>
                      <i className="ti ti-external-link" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  )
}
