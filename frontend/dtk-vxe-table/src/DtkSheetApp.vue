<script setup>
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { installDtkSheetTableInteractions } from './dtk_sheet_table_interactions.js'

const props = defineProps({
  onReady: { type: Function, default: null },
})

const DEFAULT_ROW_COUNT = 10
const MIN_COLUMN_COUNT = 12
const MIN_COLUMN_WIDTH = 56
const DEFAULT_ROW_HEIGHT = 40
const MIN_ROW_HEIGHT = 32
const MOUNT_ID = 'dtk-vxe-table-mount'

const shellRef = ref(null)
const gridRef = ref(null)
const gridHeight = ref(480)
const tableLayoutKey = ref(0)
const scrollXEnabled = ref(false)
const hasManualColumnLayout = ref(false)
const columns = ref([])
const tableData = ref([])
const manualColumnWidths = ref({})
const manualRowHeights = ref({})
const sheetMeta = ref({ loaded: false, colCount: 0 })
const manualColCount = ref(0)
const hiddenColIndexes = ref(new Set())
const sortedHiddenColIndexes = computed(() => [...hiddenColIndexes.value].sort((a, b) => a - b))
const contextMenuRef = ref(null)
const contextMenuState = ref({
  visible: false,
  x: 0,
  y: 0,
  menuType: 'header',
  row: null,
  column: null,
  groups: [],
})

let resizeObserver = null
let layoutFrame = 0
let currentAreaScope = null
let suppressClickCloseUntil = 0
let selectAllCellsLockUntil = 0
let isSyncingLayout = false
let dtkSheetInteractions = null

async function dtkAskConfirm(message) {
  if (typeof globalThis.dtkConfirmDelete === 'function') {
    return !!(await globalThis.dtkConfirmDelete(message))
  }
  return window.confirm(message)
}

function columnLetter(index) {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function normalizeCell(value) {
  if (value == null) return ''
  if (value instanceof Date) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value)
}

function fieldFromDataColIndex(colIndex) {
  return 'c' + colIndex
}

function columnStorageKey(column) {
  if (!column) return ''
  if (column.type === 'seq') return '__seq__'
  return column.field || ''
}

function getStoredColumnWidth(field, defaultWidth) {
  const stored = manualColumnWidths.value[field]
  if (stored != null && stored >= MIN_COLUMN_WIDTH) return stored
  return defaultWidth
}

function computeColumnLayout(shellWidth) {
  const safeWidth = Math.max(shellWidth, MIN_COLUMN_WIDTH * MIN_COLUMN_COUNT)
  const minFromWidth = Math.max(MIN_COLUMN_COUNT - 1, Math.floor(safeWidth / MIN_COLUMN_WIDTH) - 1)
  const excelCols = sheetMeta.value.loaded ? sheetMeta.value.colCount : 0
  const baseCols = manualColCount.value > 0 ? manualColCount.value : excelCols
  const dataColCount = Math.max(minFromWidth, baseCols)
  const totalCols = dataColCount + 1
  const fitWidth = Math.floor(safeWidth / totalCols)
  if (hasManualColumnLayout.value) {
    return { colWidth: Math.max(MIN_COLUMN_WIDTH, fitWidth), dataColCount, scrollX: true }
  }
  if (fitWidth >= MIN_COLUMN_WIDTH) {
    return { colWidth: fitWidth, dataColCount, scrollX: false }
  }
  return { colWidth: MIN_COLUMN_WIDTH, dataColCount, scrollX: true }
}

function buildColumns(defaultColWidth, dataColCount) {
  const cols = [
    {
      type: 'seq',
      width: getStoredColumnWidth('__seq__', defaultColWidth),
      minWidth: MIN_COLUMN_WIDTH,
      title: '',
      rowResize: true,
      align: 'center',
      headerAlign: 'center',
      slots: { header: 'dtk_seq_corner_header' },
    },
  ]
  for (let i = 0; i < dataColCount; i += 1) {
    const field = 'c' + i
    cols.push({
      field,
      title: columnLetter(i),
      width: getStoredColumnWidth(field, defaultColWidth),
      minWidth: MIN_COLUMN_WIDTH,
      visible: !hiddenColIndexes.value.has(i),
      align: 'center',
      headerAlign: 'center',
      showOverflow: false,
      headerClassName: 'dtk-vxe-header-clickable',
      className: 'dtk-vxe-data-cell',
      editRender: {
        name: 'VxeTextarea',
        props: {
          placeholder: '',
          resize: 'none',
        },
      },
    })
  }
  return cols
}

function createEmptyRows(count, dataColCount) {
  return Array.from({ length: count }, (_, index) => {
    const row = { _rowId: 'dtk-r' + index, _rowIndex: index }
    for (let c = 0; c < dataColCount; c += 1) {
      row['c' + c] = ''
    }
    return row
  })
}

function mergeRowData(prevRows, dataColCount) {
  return prevRows.map((row, index) => {
    const next = { _rowId: row._rowId || ('dtk-r' + index), _rowIndex: index }
    for (let c = 0; c < dataColCount; c += 1) {
      next['c' + c] = row['c' + c] ?? ''
    }
    return next
  })
}

async function waitEditIdle() {
  await nextTick()
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

async function closeActiveEdit($grid, opts = {}) {
  if (!$grid) return
  if (typeof $grid.clearEdit === 'function') {
    await $grid.clearEdit()
  } else if (typeof $grid.clearActived === 'function') {
    $grid.clearActived()
  }
  if (opts.fast) {
    await nextTick()
  } else {
    await waitEditIdle()
  }
}

function isSameEditCell(active, row, column) {
  if (!active || !active.row || !active.column || !column || !column.field) return false
  return active.row._rowId === row._rowId && active.column.field === column.field
}

function hasDomEditOnCell(row, column) {
  const mount = getMountEl()
  if (!mount || !row || !column || !column.field) return false
  const activeCol = mount.querySelector('.vxe-body--column.col--active')
  if (!activeCol) return false
  const rowEl = activeCol.closest('.vxe-body--row')
  if (!rowEl || rowEl.getAttribute('rowid') !== row._rowId) return false
  return findBodyColumnElByField(rowEl, column.field) === activeCol
}

function isEditingCell(row, column) {
  const $grid = gridRef.value
  const active = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  return isSameEditCell(active, row, column) && hasDomEditOnCell(row, column)
}

let dtkEditOpenScrollGuard = null

function snapshotDtkTableBodyScroll() {
  const mount = getMountEl()
  if (!mount) return []
  const snaps = []
  mount.querySelectorAll('.vxe-table--body-wrapper, .vxe-table--body-inner-wrapper').forEach((el) => {
    snaps.push({ el, top: el.scrollTop, left: el.scrollLeft })
  })
  return snaps
}

function restoreDtkTableBodyScroll(snaps) {
  if (!Array.isArray(snaps)) return
  snaps.forEach((snap) => {
    if (!snap || !snap.el) return
    if (snap.el.scrollTop !== snap.top) snap.el.scrollTop = snap.top
    if (snap.el.scrollLeft !== snap.left) snap.el.scrollLeft = snap.left
  })
}

function endDtkEditOpenScrollGuard() {
  if (!dtkEditOpenScrollGuard) return
  const guard = dtkEditOpenScrollGuard
  guard.snaps.forEach((snap) => {
    if (snap && snap.el) snap.el.removeEventListener('scroll', guard.onScroll, true)
  })
  clearInterval(guard.intervalId)
  if (guard.endTimer) clearTimeout(guard.endTimer)
  dtkEditOpenScrollGuard = null
}

function beginDtkEditOpenScrollGuard(snaps, durationMs = 520) {
  endDtkEditOpenScrollGuard()
  if (!Array.isArray(snaps) || !snaps.length) return
  const onScroll = () => restoreDtkTableBodyScroll(snaps)
  snaps.forEach((snap) => {
    if (snap && snap.el) snap.el.addEventListener('scroll', onScroll, { capture: true, passive: true })
  })
  const intervalId = setInterval(onScroll, 16)
  const endTimer = setTimeout(() => endDtkEditOpenScrollGuard(), durationMs)
  dtkEditOpenScrollGuard = { snaps, onScroll, intervalId, endTimer }
}

function stabilizeDtkEditOpenScroll(scrollSnaps) {
  restoreDtkTableBodyScroll(scrollSnaps)
  const mount = getMountEl()
  if (!mount) return
  const input = mount.querySelector('.vxe-body--column.col--active textarea, .vxe-body--column.col--active .vxe-textarea--inner, .vxe-body--column.col--active input, .vxe-cell--edit textarea, .vxe-cell--edit input, .vxe-textarea--inner')
  if (!input) return
  input.scrollTop = 0
  if (typeof input.scrollTo === 'function') input.scrollTo(0, 0)
}

function scheduleDtkEditOpenScrollStabilize(scrollSnaps) {
  stabilizeDtkEditOpenScroll(scrollSnaps)
  requestAnimationFrame(() => {
    stabilizeDtkEditOpenScroll(scrollSnaps)
    requestAnimationFrame(() => stabilizeDtkEditOpenScroll(scrollSnaps))
  })
}

function focusEditInput() {
  nextTick(() => {
    const mount = getMountEl()
    if (!mount) return
    const input = mount.querySelector('.vxe-cell--edit input, .vxe-cell--edit textarea, .vxe-textarea--inner')
    if (input && typeof input.focus === 'function') {
      try {
        input.focus({ preventScroll: true })
      } catch (e) {
        input.focus()
      }
    }
  })
}

async function applyStoredRowHeights() {
  await nextTick()
  const $grid = gridRef.value
  if (!$grid || typeof $grid.setRowHeightConf !== 'function') return
  const conf = {}
  tableData.value.forEach((row) => {
    const h = manualRowHeights.value[row._rowId]
    if (h && h >= MIN_ROW_HEIGHT) conf[row._rowId] = h
  })
  if (!Object.keys(conf).length) return
  await $grid.setRowHeightConf(conf)
  if ($grid.recalculate) await $grid.recalculate()
}

async function syncAllColumnWidths(width) {
  if (isSyncingLayout) return
  isSyncingLayout = true
  try {
    const safeWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(width))
    columns.value.forEach((col) => {
      const key = columnStorageKey(col)
      if (key) manualColumnWidths.value[key] = safeWidth
      col.width = safeWidth
    })
    hasManualColumnLayout.value = true
    scrollXEnabled.value = true
    const $grid = gridRef.value
    if (!$grid) return
    await nextTick()
    if (typeof $grid.setColumnWidth === 'function') {
      for (const col of columns.value) {
        const target = col.type === 'seq' ? col : col.field
        if (target) await $grid.setColumnWidth(target, safeWidth)
      }
    }
    if ($grid.recalculate) await $grid.recalculate()
  } finally {
    isSyncingLayout = false
  }
}

async function syncAllRowHeights(height) {
  if (isSyncingLayout) return
  isSyncingLayout = true
  try {
    const safeHeight = Math.max(MIN_ROW_HEIGHT, Math.round(height))
    const conf = {}
    tableData.value.forEach((row) => {
      manualRowHeights.value[row._rowId] = safeHeight
      conf[row._rowId] = safeHeight
    })
    const $grid = gridRef.value
    if (!$grid || typeof $grid.setRowHeightConf !== 'function') return
    await $grid.setRowHeightConf(conf)
    if ($grid.recalculate) await $grid.recalculate()
  } finally {
    isSyncingLayout = false
  }
}

function clearManualLayout() {
  manualColumnWidths.value = {}
  manualRowHeights.value = {}
  hasManualColumnLayout.value = false
  manualColCount.value = 0
  hiddenColIndexes.value = new Set()
}

function resolveDtkGridLayoutHeight() {
  const mount = getMountEl()
  const h = mount?.clientHeight || 480
  return h > 120 ? Math.floor(h) : 480
}

function applyLayout() {
  const shell = shellRef.value
  if (!shell) return

  const nextHeight = resolveDtkGridLayoutHeight()
  if (gridHeight.value !== nextHeight) {
    gridHeight.value = nextHeight
  }

  const { colWidth, dataColCount, scrollX } = computeColumnLayout(shell.clientWidth)
  scrollXEnabled.value = scrollX

  const prevDataColCount = Math.max(0, columns.value.length - 1)
  const countChanged = prevDataColCount !== dataColCount || !columns.value.length
  const widthChanged = !hasManualColumnLayout.value && columns.value[0]?.width !== colWidth

  if (countChanged || widthChanged) {
    columns.value = buildColumns(colWidth, dataColCount)
    if (countChanged) tableLayoutKey.value += 1
  }

  if (!tableData.value.length) {
    tableData.value = createEmptyRows(DEFAULT_ROW_COUNT, dataColCount)
  } else if (countChanged) {
    tableData.value = mergeRowData(tableData.value, dataColCount)
  }

  if (countChanged) {
    nextTick(() => applyStoredRowHeights())
  }
}

function scheduleLayout() {
  cancelAnimationFrame(layoutFrame)
  layoutFrame = requestAnimationFrame(applyLayout)
}

function getMountEl() {
  return document.getElementById(MOUNT_ID)
}

function isColumnResizeTarget(event) {
  const target = event && event.target
  if (!target || !target.closest) return false
  if (target.closest('.vxe-cell--col-resizable, .vxe-table--header-column-resizable-area, .vxe-table--resizable-column-bar')) {
    return true
  }
  if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return false
  const mount = getMountEl()
  if (!mount) return false
  const resizables = mount.querySelectorAll('.vxe-cell--col-resizable, .vxe-table--header-column-resizable-area')
  for (const el of resizables) {
    const rect = el.getBoundingClientRect()
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
      return true
    }
  }
  return false
}

function isSeqRowSelectBlockedTarget(event) {
  const target = event && event.target
  if (!target || !target.closest) return false
  return !!target.closest('.vxe-cell--row-resizable, .vxe-table--row-resizable-area, .vxe-table--resizable-row-bar')
}

function findHeaderColumnElByField(field) {
  const mount = getMountEl()
  if (!mount || !field) return null
  const direct = mount.querySelector(`.vxe-header--column[colid="${field}"], .vxe-header--column[col-id="${field}"]`)
  if (direct) return direct
  const $grid = gridRef.value
  const headers = [...mount.querySelectorAll('.vxe-header--column:not(.col--seq)')]
  if ($grid && typeof $grid.getColumnNode === 'function') {
    for (let i = 0; i < headers.length; i += 1) {
      const node = $grid.getColumnNode(headers[i])
      const col = node && node.item ? node.item : null
      if (col && col.field === field) return headers[i]
    }
  }
  const colIndex = parseInt(String(field).slice(1), 10)
  if (!Number.isNaN(colIndex) && headers[colIndex]) return headers[colIndex]
  return null
}

function findBodyColumnElByField(rowEl, field) {
  if (!rowEl || !field) return null
  const direct = rowEl.querySelector(`.vxe-body--column[colid="${field}"], .vxe-body--column[col-id="${field}"]`)
  if (direct) return direct
  const $grid = gridRef.value
  const cells = [...rowEl.querySelectorAll('.vxe-body--column:not(.col--seq)')]
  if ($grid && typeof $grid.getColumnNode === 'function') {
    for (let i = 0; i < cells.length; i += 1) {
      const node = $grid.getColumnNode(cells[i])
      const col = node && node.item ? node.item : null
      if (col && col.field === field) return cells[i]
    }
  }
  const colIndex = parseInt(String(field).slice(1), 10)
  if (!Number.isNaN(colIndex) && cells[colIndex]) return cells[colIndex]
  return null
}

function isAllCellsAreaSelected() {
  return !!(currentAreaScope && currentAreaScope.kind === 'all')
}

function clearCustomCellAreaSelection() {
  currentAreaScope = null
  const mount = getMountEl()
  if (!mount) return
  mount.classList.remove(
    'dtk-vxe-grid--all-cells-selected',
    'dtk-vxe-grid--row-area-selected',
    'dtk-vxe-grid--col-area-selected',
    'dtk-vxe-grid--cell-focused',
  )
  mount.querySelectorAll('.dtk-vxe-cell-area-selected, .dtk-vxe-header-area-selected, .dtk-vxe-seq-area-selected, .dtk-vxe-cell-area-active').forEach((el) => {
    el.classList.remove('dtk-vxe-cell-area-selected', 'dtk-vxe-header-area-selected', 'dtk-vxe-seq-area-selected', 'dtk-vxe-cell-area-active')
  })
}

function isSameAreaScope(scope) {
  if (!scope || !currentAreaScope || scope.kind !== currentAreaScope.kind) return false
  if (scope.kind === 'all') return true
  if (scope.kind === 'row') return scope.rowIndex === currentAreaScope.rowIndex
  if (scope.kind === 'rowRange') {
    return scope.startRowIndex === currentAreaScope.startRowIndex
      && scope.endRowIndex === currentAreaScope.endRowIndex
  }
  if (scope.kind === 'col') return scope.colIndex === currentAreaScope.colIndex
  if (scope.kind === 'colRange') {
    return scope.startColIndex === currentAreaScope.startColIndex
      && scope.endColIndex === currentAreaScope.endColIndex
  }
  if (scope.kind === 'cell') {
    return scope.rowIndex === currentAreaScope.rowIndex && scope.colIndex === currentAreaScope.colIndex
  }
  return false
}

function applyCustomAllCellsSelection() {
  const mount = getMountEl()
  if (!mount) return false
  clearCustomCellAreaSelection()
  const cells = mount.querySelectorAll('.vxe-body--column:not(.col--seq)')
  if (!cells.length) return false
  currentAreaScope = { kind: 'all' }
  mount.classList.add('dtk-vxe-grid--all-cells-selected')
  mount.querySelectorAll('.vxe-header--column:not(.col--seq)').forEach((el) => {
    el.classList.add('dtk-vxe-header-area-selected')
  })
  mount.querySelectorAll('.vxe-body--column.col--seq').forEach((el) => {
    el.classList.add('dtk-vxe-seq-area-selected')
  })
  cells.forEach((el) => el.classList.add('dtk-vxe-cell-area-selected'))
  const firstDataCell = mount.querySelector('.vxe-body--row .vxe-body--column:not(.col--seq)')
  if (firstDataCell) {
    firstDataCell.classList.remove('dtk-vxe-cell-area-selected')
    firstDataCell.classList.add('dtk-vxe-cell-area-active')
  }
  return true
}

async function selectAllCells(opts = {}) {
  const $grid = gridRef.value
  if (!$grid) return false
  const now = Date.now()
  if (!opts.reapply && now < selectAllCellsLockUntil) return false
  selectAllCellsLockUntil = now + 280
  const scope = { kind: 'all' }
  if (!opts.reapply && currentAreaScope && isSameAreaScope(scope)) {
    clearCustomCellAreaSelection()
    return false
  }
  await closeActiveEdit($grid)
  clearCustomCellAreaSelection()
  await nextTick()
  return applyCustomAllCellsSelection()
}

async function onSelectAllCornerActivate(event) {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }
  await selectAllCells()
}

function applyCustomSingleCellSelection(row, colIndex) {
  const mount = getMountEl()
  if (!mount || !row || colIndex < 0) return false
  clearCustomCellAreaSelection()
  currentAreaScope = { kind: 'cell', rowIndex: row._rowIndex, colIndex }
  mount.classList.add('dtk-vxe-grid--cell-focused')
  const field = fieldFromDataColIndex(colIndex)
  const rowEl = mount.querySelector(`.vxe-body--row[rowid="${row._rowId}"]`)
  if (!rowEl) return false
  const cell = findBodyColumnElByField(rowEl, field)
  if (cell) cell.classList.add('dtk-vxe-cell-area-active')
  const column = columns.value.find((c) => c.field === field)
  if (dtkSheetInteractions && column) dtkSheetInteractions.primeCellFocus(row, column)
  return true
}

async function selectSingleCell(row, column) {
  if (!row || !column || !column.field || column.type === 'seq') return false
  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return false
  return applyCustomSingleCellSelection(row, colIdx)
}

function applyCustomRowAreaSelection(row) {
  const mount = getMountEl()
  if (!mount || !row) return false
  clearCustomCellAreaSelection()
  const rowEl = mount.querySelector(`.vxe-body--row[rowid="${row._rowId}"]`)
  if (!rowEl) return false
  currentAreaScope = { kind: 'row', rowIndex: row._rowIndex }
  mount.classList.add('dtk-vxe-grid--row-area-selected')
  rowEl.querySelectorAll('.vxe-body--column.col--seq').forEach((el) => {
    el.classList.add('dtk-vxe-seq-area-selected')
  })
  const dataCells = [...rowEl.querySelectorAll('.vxe-body--column:not(.col--seq)')]
  dataCells.forEach((el, idx) => {
    if (idx === 0) el.classList.add('dtk-vxe-cell-area-active')
    else el.classList.add('dtk-vxe-cell-area-selected')
  })
  return true
}

function applyCustomColumnAreaSelection(colIndex) {
  const mount = getMountEl()
  if (!mount || colIndex < 0) return false
  clearCustomCellAreaSelection()
  const field = fieldFromDataColIndex(colIndex)
  const headerCol = findHeaderColumnElByField(field)
  if (!headerCol) return false
  currentAreaScope = { kind: 'col', colIndex }
  mount.classList.add('dtk-vxe-grid--col-area-selected')
  headerCol.classList.add('dtk-vxe-header-area-selected', 'dtk-vxe-cell-area-active')
  mount.querySelectorAll('.vxe-body--row').forEach((rowEl) => {
    const cell = findBodyColumnElByField(rowEl, field)
    if (cell) cell.classList.add('dtk-vxe-cell-area-selected')
  })
  return true
}

function getSelectedColIndexes() {
  if (!currentAreaScope) return []
  if (currentAreaScope.kind === 'col') return [currentAreaScope.colIndex]
  if (currentAreaScope.kind === 'colRange') {
    const min = Math.min(currentAreaScope.startColIndex, currentAreaScope.endColIndex)
    const max = Math.max(currentAreaScope.startColIndex, currentAreaScope.endColIndex)
    const indexes = []
    for (let i = min; i <= max; i += 1) indexes.push(i)
    return indexes
  }
  return []
}

function isColumnAreaSelected() {
  return !!(currentAreaScope && (currentAreaScope.kind === 'col' || currentAreaScope.kind === 'colRange'))
}

function applyCustomColumnRangeSelection(minColIndex, maxColIndex) {
  const mount = getMountEl()
  if (!mount) return false
  clearCustomCellAreaSelection()
  currentAreaScope = { kind: 'colRange', startColIndex: minColIndex, endColIndex: maxColIndex }
  mount.classList.add('dtk-vxe-grid--col-area-selected')
  let firstActiveApplied = false
  for (let colIndex = minColIndex; colIndex <= maxColIndex; colIndex += 1) {
    const field = fieldFromDataColIndex(colIndex)
    const headerCol = findHeaderColumnElByField(field)
    if (headerCol) {
      if (!firstActiveApplied) {
        headerCol.classList.add('dtk-vxe-header-area-selected', 'dtk-vxe-cell-area-active')
        firstActiveApplied = true
      } else {
        headerCol.classList.add('dtk-vxe-header-area-selected')
      }
    }
    mount.querySelectorAll('.vxe-body--row').forEach((rowEl) => {
      const cell = findBodyColumnElByField(rowEl, field)
      if (cell) cell.classList.add('dtk-vxe-cell-area-selected')
    })
  }
  return firstActiveApplied
}

async function reapplyAreaSelectionIfNeeded() {
  if (!currentAreaScope) return
  await nextTick()
  if (currentAreaScope.kind === 'all') {
    applyCustomAllCellsSelection()
  } else if (currentAreaScope.kind === 'row') {
    const row = tableData.value.find((r) => r._rowIndex === currentAreaScope.rowIndex)
    if (row) applyCustomRowAreaSelection(row)
  } else if (currentAreaScope.kind === 'rowRange') {
    applyCustomRowRangeSelection(currentAreaScope.startRowIndex, currentAreaScope.endRowIndex)
  } else if (currentAreaScope.kind === 'col') {
    applyCustomColumnAreaSelection(currentAreaScope.colIndex)
  } else if (currentAreaScope.kind === 'colRange') {
    applyCustomColumnRangeSelection(currentAreaScope.startColIndex, currentAreaScope.endColIndex)
  } else if (currentAreaScope.kind === 'cell') {
    const row = tableData.value.find((r) => r._rowIndex === currentAreaScope.rowIndex)
    if (row) applyCustomSingleCellSelection(row, currentAreaScope.colIndex)
  }
}


function applyCustomRowRangeSelection(minRowIndex, maxRowIndex) {
  const mount = getMountEl()
  if (!mount) return false
  clearCustomCellAreaSelection()
  currentAreaScope = { kind: 'rowRange', startRowIndex: minRowIndex, endRowIndex: maxRowIndex }
  mount.classList.add('dtk-vxe-grid--row-area-selected')
  let firstActiveApplied = false
  tableData.value.forEach((row) => {
    if (row._rowIndex < minRowIndex || row._rowIndex > maxRowIndex) return
    const rowEl = mount.querySelector(`.vxe-body--row[rowid="${row._rowId}"]`)
    if (!rowEl) return
    rowEl.querySelectorAll('.vxe-body--column.col--seq').forEach((el) => {
      el.classList.add('dtk-vxe-seq-area-selected')
    })
    const dataCells = [...rowEl.querySelectorAll('.vxe-body--column:not(.col--seq)')]
    dataCells.forEach((cell, idx) => {
      if (!firstActiveApplied && idx === 0) {
        cell.classList.add('dtk-vxe-cell-area-active')
        firstActiveApplied = true
      } else {
        cell.classList.add('dtk-vxe-cell-area-selected')
      }
    })
  })
  return firstActiveApplied
}

async function selectRowRange(startRow, endRow, opts = {}) {
  if (!startRow || !endRow) return false
  const minIdx = Math.min(startRow._rowIndex, endRow._rowIndex)
  const maxIdx = Math.max(startRow._rowIndex, endRow._rowIndex)
  const scope = { kind: 'rowRange', startRowIndex: minIdx, endRowIndex: maxIdx }
  if (!opts.reapply && isSameAreaScope(scope)) {
    clearCustomCellAreaSelection()
    return false
  }
  const $grid = gridRef.value
  if ($grid) await closeActiveEdit($grid)
  if (!opts.reapply) clearCustomCellAreaSelection()
  await nextTick()
  return applyCustomRowRangeSelection(minIdx, maxIdx)
}

async function selectRowArea(row) {
  if (!row) return false
  const scope = { kind: 'row', rowIndex: row._rowIndex }
  if (isSameAreaScope(scope)) {
    clearCustomCellAreaSelection()
    return false
  }
  const $grid = gridRef.value
  if ($grid) await closeActiveEdit($grid)
  clearCustomCellAreaSelection()
  await nextTick()
  return applyCustomRowAreaSelection(row)
}

async function selectColumnArea(colIndex) {
  if (colIndex < 0) return false
  const scope = { kind: 'col', colIndex }
  if (isSameAreaScope(scope)) {
    clearCustomCellAreaSelection()
    return false
  }
  const $grid = gridRef.value
  if ($grid) await closeActiveEdit($grid)
  clearCustomCellAreaSelection()
  await nextTick()
  return applyCustomColumnAreaSelection(colIndex)
}

async function selectColumnRange(startColIdx, endColIdx, opts = {}) {
  if (startColIdx < 0 || endColIdx < 0) return false
  const minIdx = Math.min(startColIdx, endColIdx)
  const maxIdx = Math.max(startColIdx, endColIdx)
  const scope = { kind: 'colRange', startColIndex: minIdx, endColIndex: maxIdx }
  if (!opts.reapply && isSameAreaScope(scope)) {
    clearCustomCellAreaSelection()
    return false
  }
  const $grid = gridRef.value
  if ($grid) await closeActiveEdit($grid)
  if (!opts.reapply) clearCustomCellAreaSelection()
  await nextTick()
  return applyCustomColumnRangeSelection(minIdx, maxIdx)
}

async function ensureColumnContextSelection(colIdx) {
  if (colIdx < 0) return
  if (currentAreaScope && currentAreaScope.kind === 'colRange') {
    const min = Math.min(currentAreaScope.startColIndex, currentAreaScope.endColIndex)
    const max = Math.max(currentAreaScope.startColIndex, currentAreaScope.endColIndex)
    if (colIdx >= min && colIdx <= max) return
  }
  if (currentAreaScope && currentAreaScope.kind === 'col' && currentAreaScope.colIndex === colIdx) return
  await selectColumnArea(colIdx)
}

async function handleCellDblclick(row, column) {
  suppressClickCloseUntil = Date.now() + 500
  return openCellEdit(row, column)
}

async function openCellEdit(row, column, opts = {}) {
  if (!column || column.type === 'seq' || !column.field || !row) return false
  const $grid = gridRef.value
  if (!$grid || typeof $grid.setEditCell !== 'function') return false

  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return false

  const active = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (active && !isSameEditCell(active, row, column)) {
    await closeActiveEdit($grid)
  }

  const scrollSnap = snapshotDtkTableBodyScroll()
  beginDtkEditOpenScrollGuard(scrollSnap)
  applyCustomSingleCellSelection(row, colIdx)
  if ($grid.setSelectCell) await $grid.setSelectCell(row, column.field)
  await $grid.setEditCell(row, column.field)
  await waitEditIdle()
  focusEditInput()
  await nextTick()
  scheduleDtkEditOpenScrollStabilize(scrollSnap)
  if (opts.initialValue !== undefined) {
    await nextTick()
    const mount = getMountEl()
    const input = mount && mount.querySelector('.vxe-body--column.col--active textarea, .vxe-body--column.col--active .vxe-textarea--inner, .vxe-body--column.col--active input')
    if (input) {
      input.value = String(opts.initialValue)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      if (typeof input.setSelectionRange === 'function') {
        const len = input.value.length
        input.setSelectionRange(len, len)
      }
    }
  }
  if (dtkSheetInteractions) dtkSheetInteractions.primeCellFocus(row, column)
  return true
}

async function onCellClick({ row, column, $event }) {
  if (dtkSheetInteractions) {
    const enhanced = await dtkSheetInteractions.enhanceCellClick({ row, column, $event })
    if (enhanced.handled) return
  }
  if (column && column.type === 'seq') {
    if ($event && isSeqRowSelectBlockedTarget($event)) return
    const $grid = gridRef.value
    if ($grid) await closeActiveEdit($grid)
    await selectRowArea(row)
    return
  }

  if (!column || !column.field) return
  const $grid = gridRef.value
  if (!$grid) return

  const recentDblclick = Date.now() < suppressClickCloseUntil
  const active = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (active && isSameEditCell(active, row, column) && recentDblclick) {
    return
  }
  if (isEditingCell(row, column)) return

  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return
  const sameFocus = currentAreaScope
    && currentAreaScope.kind === 'cell'
    && currentAreaScope.rowIndex === row._rowIndex
    && currentAreaScope.colIndex === colIdx

  if (!sameFocus) {
    await selectSingleCell(row, column)
  } else {
    applyCustomSingleCellSelection(row, colIdx)
  }
  if (dtkSheetInteractions) dtkSheetInteractions.ensureShellFocus()
}

async function onCellDblclick({ row, column }) {
  if (!column || column.type === 'seq' || !column.field) return
  if (dtkSheetInteractions && dtkSheetInteractions.onCellDblclickGuard()) return
  await handleCellDblclick(row, column)
}

async function onHeaderCellClick({ column, $event }) {
  if (!column) return
  if (dtkSheetInteractions && dtkSheetInteractions.shouldSkipHeaderCellClick()) return
  if (column.type === 'seq') {
    if ($event && $event.target && $event.target.closest && $event.target.closest('.dtk-vxe-select-all-corner-btn')) return
    if ($event && isColumnResizeTarget($event)) return
    await selectAllCells()
    return
  }
  if (!column.field) return
  if ($event && isColumnResizeTarget($event)) return
  const $grid = gridRef.value
  if ($grid) await closeActiveEdit($grid)
  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return
  await selectColumnArea(colIdx)
}

async function syncDtkGridSelectCell(row, column) {
  const $grid = gridRef.value
  if (!$grid || !row || !column || !column.field) return
  if (typeof $grid.setSelectCell === 'function') {
    await $grid.setSelectCell(row, column.field)
  }
}

async function onEditClosed({ row, column }) {
  if (!row || !column || !column.field) return
  const closedColIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(closedColIdx) || closedColIdx < 0) return
  const closedRowIdx = row._rowIndex
  const focused = dtkSheetInteractions && typeof dtkSheetInteractions.getFocusedCell === 'function'
    ? dtkSheetInteractions.getFocusedCell()
    : null
  const optimistic = dtkSheetInteractions && typeof dtkSheetInteractions.isCellSwitchOptimisticSelect === 'function'
    ? dtkSheetInteractions.isCellSwitchOptimisticSelect()
    : false
  const focusMovedAway = focused
    && (focused.rowIndex !== closedRowIdx || focused.colIndex !== closedColIdx)

  if (focusMovedAway || optimistic) {
    await nextTick()
    if (focused) {
      const pendingRow = tableData.value.find((r) => r._rowIndex === focused.rowIndex)
      if (pendingRow) applyCustomSingleCellSelection(pendingRow, focused.colIndex)
    }
    if (dtkSheetInteractions) dtkSheetInteractions.ensureShellFocus()
    return
  }

  await nextTick()
  applyCustomSingleCellSelection(row, closedColIdx)
}



function shouldSuppressDtkGridColumnResizeEvent() {
  if (typeof globalThis === 'undefined') return false
  if (globalThis.__dtkCustomColDragActive) return true
  const until = globalThis.__dtkCustomColDragSuppressUntil
  return !!(until && Date.now() < until)
}

function onDtkGridResizableChange(payload) {
  if (shouldSuppressDtkGridColumnResizeEvent()) return
  onResizableChange(payload)
}

async function notifyColumnResizeDtk(columnOrPayload, resizeWidth) {
  let payload = columnOrPayload
  if (!(columnOrPayload && typeof columnOrPayload === 'object' && columnOrPayload.column && columnOrPayload.resizeWidth != null)) {
    payload = { column: columnOrPayload, resizeWidth: resizeWidth }
  }
  onResizableChange(payload)
  if (payload.fromCustomDrag) {
    await reapplyAreaSelectionIfNeeded()
    return
  }
  const column = payload.column
  const nextWidth = payload.resizeWidth
  if (!column || !nextWidth) return
  const grid = gridRef.value
  if (grid && column.field && typeof grid.setColumnWidth === 'function') {
    const safeWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(nextWidth))
    await grid.setColumnWidth(column.field, safeWidth)
    if (grid.recalculate) await grid.recalculate()
  }
  await reapplyAreaSelectionIfNeeded()
}

function onResizableChange({ column, resizeWidth }) {
  const key = columnStorageKey(column)
  if (!key || !resizeWidth) return
  const width = Math.max(MIN_COLUMN_WIDTH, Math.round(resizeWidth))
  if (isAllCellsAreaSelected()) {
    const colAutoFitFlag = typeof globalThis !== 'undefined'
      && globalThis.__dtkColAutoFitDblclickUntil > Date.now()
    if (colAutoFitFlag) {
      manualColumnWidths.value[key] = width
      hasManualColumnLayout.value = true
      scrollXEnabled.value = true
      void reapplyAreaSelectionIfNeeded()
      return
    }
    void syncAllColumnWidths(width)
    void reapplyAreaSelectionIfNeeded()
    return
  }
  manualColumnWidths.value[key] = width
  const colDef = columns.value.find((c) => columnStorageKey(c) === key)
  if (colDef) colDef.width = width
  hasManualColumnLayout.value = true
  scrollXEnabled.value = true
}


async function notifyRowResizeChangeDtk(rowOrPayload, height) {
  let row = rowOrPayload
  let nextHeight = height
  if (rowOrPayload && typeof rowOrPayload === 'object' && rowOrPayload.row && rowOrPayload.height != null) {
    row = rowOrPayload.row
    nextHeight = rowOrPayload.height
  }
  if (!row || !row._rowId || nextHeight == null) {
    onRowResizableChange()
    return
  }
  const safeHeight = Math.max(MIN_ROW_HEIGHT, Math.round(nextHeight))
  if (isAllCellsAreaSelected()) {
    const rowAutoFitFlag = typeof globalThis !== 'undefined'
      && globalThis.__dtkRowAutoFitDblclickUntil > Date.now()
    if (rowAutoFitFlag) {
      manualRowHeights.value[row._rowId] = safeHeight
      await reapplyAreaSelectionIfNeeded()
      return
    }
    await syncAllRowHeights(safeHeight)
    await reapplyAreaSelectionIfNeeded()
    return
  }
  manualRowHeights.value[row._rowId] = safeHeight
  const grid = gridRef.value
  if (grid && typeof grid.setRowHeightConf === 'function') {
    const conf = (grid.getRowHeightConf && grid.getRowHeightConf(true)) || {}
    conf[row._rowId] = safeHeight
    await grid.setRowHeightConf(conf)
    if (grid.recalculate) await grid.recalculate()
  }
  await reapplyAreaSelectionIfNeeded()
}

function onRowResizableChange() {
  if (isSyncingLayout) return
  nextTick(() => {
    requestAnimationFrame(async () => {
      if (isSyncingLayout) return
      const $grid = gridRef.value
      if (!$grid || typeof $grid.getRowHeightConf !== 'function') return
      const conf = $grid.getRowHeightConf(true) || {}

      if (isAllCellsAreaSelected()) {
        const rowAutoFitFlag = typeof globalThis !== 'undefined'
          && globalThis.__dtkRowAutoFitDblclickUntil > Date.now()
        if (rowAutoFitFlag) {
          const rid = globalThis.__dtkRowAutoFitRowId
          if (rid && Object.prototype.hasOwnProperty.call(conf, rid)) {
            const h = parseInt(conf[rid], 10)
            if (!Number.isNaN(h) && h >= MIN_ROW_HEIGHT) {
              manualRowHeights.value[rid] = h
            }
          }
          await reapplyAreaSelectionIfNeeded()
          return
        }
        let syncHeight = null
        tableData.value.forEach((row) => {
          if (!Object.prototype.hasOwnProperty.call(conf, row._rowId)) return
          const h = parseInt(conf[row._rowId], 10)
          if (Number.isNaN(h) || h < MIN_ROW_HEIGHT) return
          const prev = manualRowHeights.value[row._rowId]
          if (prev !== h) syncHeight = h
        })
        if (syncHeight != null) {
          await syncAllRowHeights(syncHeight)
        }
        await reapplyAreaSelectionIfNeeded()
        return
      }

      tableData.value.forEach((row) => {
        if (!Object.prototype.hasOwnProperty.call(conf, row._rowId)) return
        const h = parseInt(conf[row._rowId], 10)
        if (!Number.isNaN(h) && h >= MIN_ROW_HEIGHT) {
          manualRowHeights.value[row._rowId] = h
        }
      })
      await reapplyAreaSelectionIfNeeded()
    })
  })
}

function loadFromMatrix(aoa) {
  clearManualLayout()
  const matrix = Array.isArray(aoa) ? aoa : []
  const maxCols = matrix.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0)
  const colCount = Math.max(maxCols, MIN_COLUMN_COUNT - 1)
  sheetMeta.value = { loaded: true, colCount }
  manualColCount.value = colCount
  hiddenColIndexes.value = new Set()

  const rows = matrix.map((row, index) => {
    const rec = { _rowId: 'dtk-r' + index, _rowIndex: index }
    for (let c = 0; c < colCount; c += 1) {
      rec['c' + c] = normalizeCell(Array.isArray(row) ? row[c] : '')
    }
    return rec
  })

  tableData.value = rows.length ? rows : createEmptyRows(DEFAULT_ROW_COUNT, colCount)
  clearCustomCellAreaSelection()
  scheduleLayout()
}

function resetSheet() {
  sheetMeta.value = { loaded: false, colCount: 0 }
  clearManualLayout()
  tableData.value = []
  clearCustomCellAreaSelection()
  scheduleLayout()
}

function getDataColCount() {
  return Math.max(0, columns.value.length - 1)
}

function resolveDataColIndex(column) {
  if (!column || !column.field || column.field[0] !== 'c') return -1
  const idx = parseInt(String(column.field).slice(1), 10)
  return Number.isNaN(idx) ? -1 : idx
}

function remapIndexSet(setVal, pivot, delta) {
  const next = new Set()
  setVal.forEach((i) => {
    if (delta > 0) {
      next.add(i >= pivot ? i + 1 : i)
    } else {
      if (i < pivot) next.add(i)
      else if (i > pivot) next.add(i - 1)
    }
  })
  return next
}

function remapWidthMap(obj, pivot, delta) {
  const next = {}
  Object.keys(obj || {}).forEach((k) => {
    if (k === '__seq__') {
      next[k] = obj[k]
      return
    }
    const i = parseInt(k.slice(1), 10)
    if (Number.isNaN(i)) return
    if (delta > 0) {
      next[i >= pivot ? 'c' + (i + 1) : k] = obj[k]
    } else {
      if (i < pivot) next[k] = obj[k]
      else if (i > pivot) next['c' + (i - 1)] = obj[k]
    }
  })
  return next
}

function shiftTableDataForInsert(insertAt) {
  const count = getDataColCount()
  tableData.value = tableData.value.map((row) => {
    const next = { _rowId: row._rowId, _rowIndex: row._rowIndex }
    for (let c = 0; c < count + 1; c += 1) {
      if (c < insertAt) next['c' + c] = row['c' + c] ?? ''
      else if (c === insertAt) next['c' + c] = ''
      else next['c' + c] = row['c' + (c - 1)] ?? ''
    }
    return next
  })
}

function shiftTableDataForDelete(deleteAt) {
  const count = getDataColCount()
  tableData.value = tableData.value.map((row) => {
    const next = { _rowId: row._rowId, _rowIndex: row._rowIndex }
    for (let c = 0; c < count - 1; c += 1) {
      if (c < deleteAt) next['c' + c] = row['c' + c] ?? ''
      else next['c' + c] = row['c' + (c + 1)] ?? ''
    }
    return next
  })
}

async function refreshColumnsAfterMutation(newCount) {
  manualColCount.value = newCount
  if (sheetMeta.value.loaded) {
    sheetMeta.value = { ...sheetMeta.value, colCount: newCount }
  }
  const shell = shellRef.value
  const shellWidth = shell?.clientWidth || 800
  const { colWidth } = computeColumnLayout(shellWidth)
  hasManualColumnLayout.value = true
  scrollXEnabled.value = true
  columns.value = buildColumns(colWidth, newCount)
  tableLayoutKey.value += 1
  await nextTick()
  const $grid = gridRef.value
  if ($grid) {
    for (const idx of hiddenColIndexes.value) {
      const field = 'c' + idx
      if (typeof $grid.hideColumn === 'function') await $grid.hideColumn(field)
    }
    if ($grid.recalculate) await $grid.recalculate()
  }
  clearCustomCellAreaSelection()
}

function clearColumnContentAt(colIndex) {
  const count = getDataColCount()
  if (colIndex < 0 || colIndex >= count) return false
  tableData.value.forEach((row) => {
    row['c' + colIndex] = ''
  })
  return true
}

function clearCellContentAt(row, colIndex) {
  if (!row || colIndex < 0) return false
  row['c' + colIndex] = ''
  return true
}

function reindexDtkTableRows(rows) {
  const dataColCount = getDataColCount()
  return rows.map((row, index) => {
    const next = { _rowId: row._rowId, _rowIndex: index }
    for (let c = 0; c < dataColCount; c += 1) {
      next['c' + c] = row['c' + c] ?? ''
    }
    return next
  })
}

function createEmptyRowRecord(dataColCount) {
  const row = { _rowId: 'dtk-r-new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), _rowIndex: 0 }
  for (let c = 0; c < dataColCount; c += 1) {
    row['c' + c] = ''
  }
  return row
}

async function refreshRowsAfterMutation() {
  await nextTick()
  const $grid = gridRef.value
  if ($grid && typeof $grid.recalculate === 'function') await $grid.recalculate()
  await applyStoredRowHeights()
}

function clearRowContentAt(row) {
  if (!row) return false
  const dataColCount = getDataColCount()
  for (let c = 0; c < dataColCount; c += 1) {
    row['c' + c] = ''
  }
  return true
}

async function insertRowAt(rowIndex, position) {
  const count = tableData.value.length
  if (rowIndex < 0 || rowIndex >= count) return false
  const insertAt = position === 'below' ? rowIndex + 1 : rowIndex
  const rows = [...tableData.value]
  rows.splice(insertAt, 0, createEmptyRowRecord(getDataColCount()))
  tableData.value = reindexDtkTableRows(rows)
  await refreshRowsAfterMutation()
  clearCustomCellAreaSelection()
  return true
}

async function deleteRowAt(rowIndex) {
  const count = tableData.value.length
  if (rowIndex < 0 || rowIndex >= count) return false
  if (count <= 1) {
    window.alert('表格至少需要保留一行，无法继续删除。')
    return false
  }
  if (!(await dtkAskConfirm('将删除第 ' + (rowIndex + 1) + ' 行，且不可恢复。'))) return false
  const deleted = tableData.value[rowIndex]
  const rows = tableData.value.filter((_, i) => i !== rowIndex)
  if (deleted && deleted._rowId && manualRowHeights.value[deleted._rowId]) {
    const nextHeights = { ...manualRowHeights.value }
    delete nextHeights[deleted._rowId]
    manualRowHeights.value = nextHeights
  }
  tableData.value = reindexDtkTableRows(rows)
  await refreshRowsAfterMutation()
  clearCustomCellAreaSelection()
  return true
}

function clearAllCellsContentAt() {
  const dataColCount = getDataColCount()
  if (!dataColCount) return false
  tableData.value.forEach((row) => {
    for (let c = 0; c < dataColCount; c += 1) {
      row['c' + c] = ''
    }
  })
  return true
}

async function deleteAllRowsAt() {
  if (!(await dtkAskConfirm('将删除所有行，表格将保留一行空行。此操作不可恢复。'))) return false
  const dataColCount = getDataColCount()
  manualRowHeights.value = {}
  tableData.value = reindexDtkTableRows(createEmptyRows(1, dataColCount))
  await refreshRowsAfterMutation()
  clearCustomCellAreaSelection()
  return true
}

async function deleteAllColumnsAt() {
  const count = getDataColCount()
  if (count <= 1) {
    window.alert('表格至少需要保留一列，无法继续删除。')
    return false
  }
  if (!(await dtkAskConfirm('将删除所有列，表格将保留一列空列。此操作不可恢复。'))) return false
  tableData.value = tableData.value.map((row) => ({ _rowId: row._rowId, _rowIndex: row._rowIndex, c0: '' }))
  tableData.value = reindexDtkTableRows(tableData.value)
  hiddenColIndexes.value = new Set()
  manualColumnWidths.value = {}
  manualColCount.value = 1
  if (sheetMeta.value.loaded) {
    sheetMeta.value = { ...sheetMeta.value, colCount: 1 }
  }
  hasManualColumnLayout.value = true
  const shell = shellRef.value
  const shellWidth = shell?.clientWidth || 800
  const { colWidth } = computeColumnLayout(shellWidth)
  scrollXEnabled.value = true
  columns.value = buildColumns(colWidth, 1)
  tableLayoutKey.value += 1
  await nextTick()
  const $grid = gridRef.value
  if ($grid && typeof $grid.recalculate === 'function') await $grid.recalculate()
  clearCustomCellAreaSelection()
  return true
}

async function insertColumnAt(colIndex, side) {
  const count = getDataColCount()
  if (colIndex < 0 || colIndex >= count) return false
  const insertAt = side === 'right' ? colIndex + 1 : colIndex
  shiftTableDataForInsert(insertAt)
  hiddenColIndexes.value = remapIndexSet(hiddenColIndexes.value, insertAt, 1)
  manualColumnWidths.value = remapWidthMap(manualColumnWidths.value, insertAt, 1)
  await refreshColumnsAfterMutation(count + 1)
  return true
}

async function deleteColumnAt(colIndex) {
  const count = getDataColCount()
  if (colIndex < 0 || colIndex >= count) return false
  if (count <= 1) {
    window.alert('表格至少需要保留一列，无法继续删除。')
    return false
  }
  const letter = columnLetter(colIndex)
  if (!(await dtkAskConfirm('将删除列「' + letter + '」，且不可恢复。'))) return false
  shiftTableDataForDelete(colIndex)
  hiddenColIndexes.value = remapIndexSet(hiddenColIndexes.value, colIndex, -1)
  manualColumnWidths.value = remapWidthMap(manualColumnWidths.value, colIndex, -1)
  await refreshColumnsAfterMutation(count - 1)
  return true
}

async function hideColumnAt(colIndex) {
  const $grid = gridRef.value
  if (!$grid || colIndex < 0) return false
  const field = 'c' + colIndex
  hiddenColIndexes.value = new Set([...hiddenColIndexes.value, colIndex])
  if (typeof $grid.hideColumn === 'function') {
    await $grid.hideColumn(field)
  }
  if ($grid.recalculate) await $grid.recalculate()
  clearCustomCellAreaSelection()
  return true
}

function resolveColumnIndexesForMenu(fallbackColIndex) {
  const selected = getSelectedColIndexes()
  if (selected.length) return selected
  if (fallbackColIndex >= 0) return [fallbackColIndex]
  return []
}

async function deleteColumnsAt(colIndexes) {
  const unique = [...new Set(colIndexes)].filter((i) => i >= 0).sort((a, b) => a - b)
  if (!unique.length) return false
  const count = getDataColCount()
  if (count - unique.length < 1) {
    window.alert('表格至少需要保留一列，无法继续删除。')
    return false
  }
  const letters = unique.map((i) => columnLetter(i)).join('、')
  const confirmMsg = unique.length > 1
    ? '将删除列「' + letters + '」（共 ' + unique.length + ' 列），且不可恢复。'
    : '将删除列「' + letters + '」，且不可恢复。'
  if (!(await dtkAskConfirm(confirmMsg))) return false
  const sortedDesc = [...unique].sort((a, b) => b - a)
  for (const idx of sortedDesc) {
    shiftTableDataForDelete(idx)
    hiddenColIndexes.value = remapIndexSet(hiddenColIndexes.value, idx, -1)
    manualColumnWidths.value = remapWidthMap(manualColumnWidths.value, idx, -1)
  }
  await refreshColumnsAfterMutation(count - unique.length)
  return true
}

async function hideColumnsAt(colIndexes) {
  const unique = [...new Set(colIndexes)].filter((i) => i >= 0)
  if (!unique.length) return false
  for (const idx of unique) {
    await hideColumnAt(idx)
  }
  return true
}

async function showColumnsAt(colIndexes) {
  const $grid = gridRef.value
  if (!$grid) return false
  const unique = [...new Set(colIndexes)].filter((i) => i >= 0).sort((a, b) => a - b)
  if (!unique.length) return false
  const next = new Set(hiddenColIndexes.value)
  for (const idx of unique) {
    if (!next.has(idx)) continue
    next.delete(idx)
    const field = 'c' + idx
    if (typeof $grid.showColumn === 'function') {
      await $grid.showColumn(field)
    }
  }
  hiddenColIndexes.value = next
  if ($grid.recalculate) await $grid.recalculate()
  await reapplyAreaSelectionIfNeeded()
  return true
}

async function showColumnAt(colIndex) {
  if (colIndex < 0 || !hiddenColIndexes.value.has(colIndex)) return false
  return showColumnsAt([colIndex])
}

async function showAllHiddenColumns() {
  return showColumnsAt([...hiddenColIndexes.value])
}

const dtkColumnMenuGroups = [
  [
    { code: 'DTK_COL_CLEAR', name: '清空列内容', prefixIcon: 'vxe-icon-ellipsis-h' },
    { code: 'DTK_COL_HIDE', name: '隐藏列', prefixIcon: 'vxe-icon-eye-fill-close' },
  ],
  [
    { code: 'DTK_COL_INSERT_LEFT', name: '在左侧插入列', prefixIcon: 'vxe-icon-arrow-left' },
    { code: 'DTK_COL_INSERT_RIGHT', name: '在右侧插入列', prefixIcon: 'vxe-icon-arrow-right' },
  ],
  [
    { code: 'DTK_COL_DELETE', name: '删除列', prefixIcon: 'vxe-icon-delete', className: 'dtk-vxe-menu-danger' },
  ],
]

const dtkRowMenuGroups = [
  [
    { code: 'DTK_ROW_CLEAR', name: '清空行内容', prefixIcon: 'vxe-icon-ellipsis-h' },
  ],
  [
    { code: 'DTK_ROW_INSERT_ABOVE', name: '在上方插入行', prefixIcon: 'vxe-icon-arrow-up' },
    { code: 'DTK_ROW_INSERT_BELOW', name: '在下方插入行', prefixIcon: 'vxe-icon-arrow-down' },
  ],
  [
    { code: 'DTK_ROW_DELETE', name: '删除行', prefixIcon: 'vxe-icon-delete', className: 'dtk-vxe-menu-danger' },
  ],
]

const dtkAllSelectMenuGroups = [
  [
    { code: 'DTK_ALL_CELLS_CLEAR', name: '清空所有单元格内容', prefixIcon: 'vxe-icon-close' },
  ],
  [
    { code: 'DTK_ALL_ROWS_DELETE', name: '删除所有行', prefixIcon: 'vxe-icon-delete', className: 'dtk-vxe-menu-danger' },
    { code: 'DTK_ALL_COLS_DELETE', name: '删除所有列', prefixIcon: 'vxe-icon-delete', className: 'dtk-vxe-menu-danger' },
  ],
]

const menuConfig = {
  enabled: true,
  transfer: true,
  className: 'dtk-vxe-context-menu',
  header: {
    options: dtkColumnMenuGroups,
  },
  body: {
    options: [
      [
        { code: 'DTK_CELL_CLEAR', name: '清空单元格', prefixIcon: 'vxe-icon-close' },
      ],
      ...dtkColumnMenuGroups,
    ],
  },
  visibleMethod({ type, column, options }) {
    if (type === 'header' && column && column.type === 'seq') return false
    if (type === 'body' && column && column.type === 'seq') return false
    const colCount = getDataColCount()
    options.forEach((group) => {
      group.forEach((item) => {
        if (item.code === 'DTK_COL_DELETE') {
          item.disabled = colCount <= 1
        } else if (item.code === 'DTK_COL_HIDE') {
          const idx = resolveDataColIndex(column)
          item.disabled = idx >= 0 && hiddenColIndexes.value.has(idx)
        } else {
          item.disabled = false
        }
      })
    })
    return true
  },
}

async function onHeaderCellMenu({ column, $event }) {
  if ($event && isColumnResizeTarget($event)) {
    $event.preventDefault()
    return
  }
  const colIdx = resolveDataColIndex(column)
  if (colIdx >= 0) await ensureColumnContextSelection(colIdx)
}

async function onCellMenu({ row, column, $event }) {
  if ($event && isSeqRowSelectBlockedTarget($event)) return
  if (column && column.type === 'seq' && row) {
    await selectRowArea(row)
    return
  }
  if (row && column && column.field) {
    await selectSingleCell(row, column)
  }
}

async function onMenuClick({ menu, column, row }) {
  const code = menu && menu.code
  if (!code) return
  const $grid = gridRef.value
  if ($grid) await closeActiveEdit($grid)

  if (code === 'DTK_ALL_CELLS_CLEAR') {
    if (clearAllCellsContentAt()) {
      await nextTick()
      await reapplyAreaSelectionIfNeeded()
    }
    return
  }
  if (code === 'DTK_ALL_ROWS_DELETE') {
    await deleteAllRowsAt()
    return
  }
  if (code === 'DTK_ALL_COLS_DELETE') {
    await deleteAllColumnsAt()
    return
  }

  if (code === 'DTK_ROW_CLEAR') {
    if (!row) return
    if (clearRowContentAt(row)) {
      await nextTick()
      await reapplyAreaSelectionIfNeeded()
    }
    return
  }
  if (code === 'DTK_ROW_INSERT_ABOVE') {
    if (!row || row._rowIndex == null) return
    await insertRowAt(row._rowIndex, 'above')
    return
  }
  if (code === 'DTK_ROW_INSERT_BELOW') {
    if (!row || row._rowIndex == null) return
    await insertRowAt(row._rowIndex, 'below')
    return
  }
  if (code === 'DTK_ROW_DELETE') {
    if (!row || row._rowIndex == null) return
    await deleteRowAt(row._rowIndex)
    return
  }

  const colIndex = resolveDataColIndex(column)
  const colIndexes = resolveColumnIndexesForMenu(colIndex)

  if (code === 'DTK_CELL_CLEAR') {
    if (!row || colIndex < 0) return
    if (clearCellContentAt(row, colIndex)) {
      await nextTick()
      await reapplyAreaSelectionIfNeeded()
    }
    return
  }

  if (colIndex < 0 && !colIndexes.length) return

  if (code === 'DTK_COL_CLEAR') {
    let changed = false
    colIndexes.forEach((idx) => {
      if (clearColumnContentAt(idx)) changed = true
    })
    if (changed) {
      await nextTick()
      await reapplyAreaSelectionIfNeeded()
    }
    return
  }
  if (code === 'DTK_COL_HIDE') {
    if (colIndexes.length > 1) {
      await hideColumnsAt(colIndexes)
    } else if (colIndexes.length === 1) {
      await hideColumnAt(colIndexes[0])
    }
    return
  }
  if (code === 'DTK_COL_INSERT_LEFT') {
    await insertColumnAt(colIndex, 'left')
    return
  }
  if (code === 'DTK_COL_INSERT_RIGHT') {
    await insertColumnAt(colIndex, 'right')
    return
  }
  if (code === 'DTK_COL_DELETE') {
    if (colIndexes.length > 1) {
      await deleteColumnsAt(colIndexes)
    } else if (colIndexes.length === 1) {
      await deleteColumnAt(colIndexes[0])
    }
  }
}


function applyDtkAllSelectContextMenuItemState(item) {
  if (item.code === 'DTK_ALL_COLS_DELETE') {
    item.disabled = getDataColCount() <= 1
  } else {
    item.disabled = false
  }
}

function resolveDtkAllSelectContextMenuGroups() {
  const groups = dtkAllSelectMenuGroups.map((group) =>
    group.map((item) => ({ ...item, visible: item.visible !== false, disabled: !!item.disabled }))
  )
  groups.forEach((group) => {
    group.forEach((item) => applyDtkAllSelectContextMenuItemState(item))
  })
  return groups.filter((group) => group.length > 0)
}

function showDtkAllSelectContextMenu({ $event }) {
  const groups = resolveDtkAllSelectContextMenuGroups()
  if (!groups.length || !$event) return
  const $grid = gridRef.value
  if ($grid && typeof $grid.closeMenu === 'function') $grid.closeMenu()
  contextMenuState.value = {
    visible: true,
    x: $event.clientX,
    y: $event.clientY,
    menuType: 'all',
    row: null,
    column: null,
    groups,
  }
  nextTick(() => {
    const el = contextMenuRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (contextMenuState.value.y + rect.height > vh - 4) {
      contextMenuState.value.y = Math.max(4, contextMenuState.value.y - rect.height)
    }
    if (contextMenuState.value.x + rect.width > vw - 4) {
      contextMenuState.value.x = Math.max(4, contextMenuState.value.x - rect.width)
    }
  })
}

async function showDtkAllSelectContextMenuAfterReapply(event) {
  await selectAllCells({ reapply: true })
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const $grid = gridRef.value
  if ($grid && typeof $grid.closeMenu === 'function') await $grid.closeMenu()
  showDtkAllSelectContextMenu({ $event: event })
}

function applyDtkRowContextMenuItemState(item) {
  if (item.code === 'DTK_ROW_DELETE') {
    item.disabled = tableData.value.length <= 1
  } else {
    item.disabled = false
  }
}

function resolveDtkRowContextMenuGroups(row) {
  if (!row) return []
  const groups = dtkRowMenuGroups.map((group) =>
    group.map((item) => ({ ...item, visible: item.visible !== false, disabled: !!item.disabled }))
  )
  groups.forEach((group) => {
    group.forEach((item) => applyDtkRowContextMenuItemState(item))
  })
  return groups.filter((group) => group.length > 0)
}

function showDtkRowContextMenu({ row, $event }) {
  const groups = resolveDtkRowContextMenuGroups(row)
  if (!groups.length || !$event) return
  const $grid = gridRef.value
  if ($grid && typeof $grid.closeMenu === 'function') $grid.closeMenu()
  contextMenuState.value = {
    visible: true,
    x: $event.clientX,
    y: $event.clientY,
    menuType: 'row',
    row,
    column: null,
    groups,
  }
  nextTick(() => {
    const el = contextMenuRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (contextMenuState.value.y + rect.height > vh - 4) {
      contextMenuState.value.y = Math.max(4, contextMenuState.value.y - rect.height)
    }
    if (contextMenuState.value.x + rect.width > vw - 4) {
      contextMenuState.value.x = Math.max(4, contextMenuState.value.x - rect.width)
    }
  })
}

function applyDtkContextMenuItemState(item, column) {
  const colCount = getDataColCount()
  const selected = getSelectedColIndexes()
  const selectedCount = selected.length || (resolveDataColIndex(column) >= 0 ? 1 : 0)
  if (item.code === 'DTK_COL_DELETE') {
    item.disabled = colCount - selectedCount < 1
  } else if (item.code === 'DTK_COL_HIDE') {
    if (selected.length > 1) {
      item.disabled = selected.every((idx) => hiddenColIndexes.value.has(idx))
    } else {
      const idx = selected.length === 1 ? selected[0] : resolveDataColIndex(column)
      item.disabled = idx >= 0 && hiddenColIndexes.value.has(idx)
    }
  } else {
    item.disabled = false
  }
}

function resolveDtkContextMenuGroups(column, menuType) {
  if (!column || column.type === 'seq') return []
  const section = menuType === 'body' ? menuConfig.body : menuConfig.header
  if (!section || !section.options) return []
  const groups = section.options.map((group) =>
    group.map((item) => ({ ...item, visible: item.visible !== false, disabled: !!item.disabled }))
  )
  groups.forEach((group) => {
    group.forEach((item) => applyDtkContextMenuItemState(item, column))
  })
  return groups.filter((group) => group.length > 0)
}

function hideDtkContextMenu() {
  contextMenuState.value.visible = false
}

function showDtkContextMenu({ column, row, menuType, $event }) {
  const groups = resolveDtkContextMenuGroups(column, menuType)
  if (!groups.length || !$event) return
  const $grid = gridRef.value
  if ($grid && typeof $grid.closeMenu === 'function') $grid.closeMenu()
  contextMenuState.value = {
    visible: true,
    x: $event.clientX,
    y: $event.clientY,
    menuType,
    row,
    column,
    groups,
  }
  nextTick(() => {
    const el = contextMenuRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (contextMenuState.value.y + rect.height > vh - 4) {
      contextMenuState.value.y = Math.max(4, contextMenuState.value.y - rect.height)
    }
    if (contextMenuState.value.x + rect.width > vw - 4) {
      contextMenuState.value.x = Math.max(4, contextMenuState.value.x - rect.width)
    }
  })
}

async function onDtkContextMenuItemClick(item) {
  if (!item || item.disabled || item.visible === false) return
  const { column, row } = contextMenuState.value
  hideDtkContextMenu()
  await onMenuClick({ menu: item, column, row })
}

async function onDtkShellContextmenu(event) {
  const target = event.target
  if (!target || !target.closest) return
  if (!target.closest('.dtk-vxe-table-shell')) return
  if (target.closest('.dtk-vxe-fallback-menu, .vxe-table--context-menu-wrapper')) return
  if (isColumnResizeTarget(event)) return

  const cellEl = target.closest('td.vxe-body--column, th.vxe-header--column')
  if (!cellEl) return

  event.preventDefault()

  const isHeader = cellEl.classList.contains('vxe-header--column')
  const shouldKeepAllSelection = isAllCellsAreaSelected()
  const $grid = gridRef.value
  if (!$grid) return

  const columnRest = typeof $grid.getColumnNode === 'function' ? $grid.getColumnNode(cellEl) : null
  const column = columnRest && columnRest.item ? columnRest.item : null
  if (!column) return

  await closeActiveEdit($grid)

  if (shouldKeepAllSelection && !isHeader) {
    await showDtkAllSelectContextMenuAfterReapply(event)
    return
  }

  if (column.type === 'seq') {
    if (isHeader) return
    if (isSeqRowSelectBlockedTarget(event)) return
    const rowRest = typeof $grid.getRowNode === 'function' ? $grid.getRowNode(cellEl.parentNode) : null
    const row = rowRest && rowRest.item ? rowRest.item : null
    if (!row) return
    await selectRowArea(row)
    await nextTick()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const nativeMenu = document.querySelector('.vxe-table--context-menu-wrapper.is--visible')
    if (nativeMenu) return
    showDtkRowContextMenu({ row, $event: event })
    return
  }

  const colIdx = resolveDataColIndex(column)
  let row = null
  if (isHeader) {
    if (colIdx >= 0) await ensureColumnContextSelection(colIdx)
  } else {
    const rowRest = typeof $grid.getRowNode === 'function' ? $grid.getRowNode(cellEl.parentNode) : null
    row = rowRest && rowRest.item ? rowRest.item : null
    if (row && colIdx >= 0) await selectSingleCell(row, column)
  }

  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const nativeMenu = document.querySelector('.vxe-table--context-menu-wrapper.is--visible')
  if (nativeMenu) return

  showDtkContextMenu({ column, row, menuType: isHeader ? 'header' : 'body', $event: event })
}

function onDtkDocumentPointerDown(event) {
  if (!contextMenuState.value.visible) return
  if (event.target && event.target.closest && event.target.closest('.dtk-vxe-fallback-menu')) return
  hideDtkContextMenu()
}


function exportToMatrix() {
  const colCount = getDataColCount()
  if (!colCount || !tableData.value.length) return []
  return tableData.value.map((row) => {
    const line = []
    for (let c = 0; c < colCount; c += 1) {
      line.push(normalizeCell(row['c' + c]))
    }
    return line
  })
}

function getRowCount() {
  return tableData.value.length
}

function onDtkShellMousedown(event) {
  if (dtkSheetInteractions) void dtkSheetInteractions.onShellMousedown(event)
}

function onDtkShellDblclick(event) {
  if (dtkSheetInteractions) void dtkSheetInteractions.onShellDblclick(event)
}

onMounted(() => {
  scheduleLayout()
  const mountEl = getMountEl()
  const layoutEl = mountEl?.parentElement || mountEl
  if (layoutEl) {
    resizeObserver = new ResizeObserver(scheduleLayout)
    resizeObserver.observe(layoutEl)
  }
  window.addEventListener('resize', scheduleLayout)
  document.addEventListener('mousedown', onDtkDocumentPointerDown)
  dtkSheetInteractions = installDtkSheetTableInteractions({
    MIN_COL_WIDTH: MIN_COLUMN_WIDTH,
    DEFAULT_ROW_HEIGHT,
    MIN_ROW_HEIGHT,
    getGrid: () => gridRef.value,
    getMount: getMountEl,
    getShell: () => shellRef.value,
    getTableData: () => tableData.value,
    getColumns: () => columns.value,
    getHiddenColIndexes: () => hiddenColIndexes.value,
    nextTick,
    waitEditIdle,
    closeActiveEdit,
    openCellEdit,
    selectSingleCell,
    selectRowArea,
    selectRowRange,
    selectColumnArea,
    selectColumnRange,
    clearCustomCellAreaSelection,
    applyCustomSingleCellSelection,
    syncGridSelectCell: syncDtkGridSelectCell,
    handleCellDblclick,
    isSameEditCell,
    hasDomEditOnCell,
    isSeqRowSelectBlockedTarget,
    isColumnResizeTarget,
  })
  dtkSheetInteractions.bind()
  if (typeof props.onReady === 'function') {
    props.onReady({
      getRowCount,
      gridRef,
      loadFromMatrix,
      resetSheet,
      exportToMatrix,
      clearSelection: clearCustomCellAreaSelection,
      notifyColumnResize: notifyColumnResizeDtk,
      notifyRowResizeChange: notifyRowResizeChangeDtk,
    })
  }
})

onUnmounted(() => {
  cancelAnimationFrame(layoutFrame)
  resizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleLayout)
  document.removeEventListener('mousedown', onDtkDocumentPointerDown)
  if (dtkSheetInteractions) dtkSheetInteractions.unbind()
  hideDtkContextMenu()
})
</script>

<template>
  <Teleport to="#dtk-hidden-columns-slot">
    <div
      v-if="sortedHiddenColIndexes.length"
      class="dtk-vxe-hidden-columns-bar"
      role="region"
      aria-label="已隐藏列，点击可恢复显示"
    >
      <div class="dtk-vxe-hidden-columns-bar__head">
        <span class="dtk-vxe-hidden-columns-bar__label">已隐藏列</span>
        <span class="dtk-vxe-hidden-columns-bar__count">{{ sortedHiddenColIndexes.length }} 列</span>
      </div>
      <div class="dtk-vxe-hidden-columns-bar__chips">
        <button
          v-for="idx in sortedHiddenColIndexes"
          :key="'dtk-hidden-col-' + idx"
          type="button"
          class="dtk-vxe-hidden-columns-bar__chip"
          :title="'恢复显示列「' + columnLetter(idx) + '」'"
          :aria-label="'恢复显示列 ' + columnLetter(idx)"
          @click="showColumnAt(idx)"
        >{{ columnLetter(idx) }}</button>
      </div>
      <button
        v-if="sortedHiddenColIndexes.length > 1"
        type="button"
        class="dtk-vxe-hidden-columns-bar__show-all"
        @click="showAllHiddenColumns"
      >全部显示</button>
    </div>
  </Teleport>
  <div ref="shellRef" class="dtk-vxe-table-shell" tabindex="-1" @mousedown.capture="onDtkShellMousedown" @dblclick.capture="onDtkShellDblclick" @contextmenu.capture="onDtkShellContextmenu">
    <vxe-grid
      :key="tableLayoutKey"
      ref="gridRef"
      class="dtk-vxe-grid dtk-vxe-grid--inline-edit"
      border
      round
      keep-source
      show-header-overflow
      :height="gridHeight"
      :columns="columns"
      :data="tableData"
      :row-config="{ isHover: true, keyField: '_rowId', resizable: true }"
      :column-config="{ resizable: true }"
      :cell-config="{ height: DEFAULT_ROW_HEIGHT, verticalAlign: 'middle' }"
      :resizable-config="{ minHeight: MIN_ROW_HEIGHT, isDblclickAutoHeight: false, showDragTip: false }"
      :edit-config="{ trigger: 'manual', mode: 'cell', autoFocus: true, autoPos: false, autoClear: false, showIcon: false }"
      :scroll-x="{ enabled: scrollXEnabled }"
      :menu-config="menuConfig"
      @cell-click="onCellClick"
      @cell-dblclick="onCellDblclick"
      @header-cell-click="onHeaderCellClick"
      @header-cell-menu="onHeaderCellMenu"
      @cell-menu="onCellMenu"
      @menu-click="onMenuClick"
      @edit-closed="onEditClosed"
      @resizable-change="onDtkGridResizableChange"
      @row-resizable-change="onRowResizableChange"
    >
      <template #dtk_seq_corner_header>
        <button
          type="button"
          class="dtk-vxe-select-all-corner-btn"
          title="???????"
          aria-label="???????"
          @mousedown.stop
          @click.stop="onSelectAllCornerActivate"
        >#</button>
      </template>
    </vxe-grid>
    <Teleport to="body">
      <div
        v-if="contextMenuState.visible"
        ref="contextMenuRef"
        class="dtk-vxe-fallback-menu dtk-vxe-context-menu dtk-vxe-context-menu--sheet vxe-table--context-menu-wrapper is--visible"
        :style="{ top: contextMenuState.y + 'px', left: contextMenuState.x + 'px', zIndex: 6000 }"
        @mousedown.stop
        @contextmenu.prevent
      >
        <ul
          v-for="(group, groupIndex) in contextMenuState.groups"
          :key="'dtk-menu-group-' + groupIndex"
          class="vxe-table--context-menu-group-wrapper"
        >
          <li
            v-for="item in group"
            v-show="item.visible !== false"
            :key="item.code"
            class="vxe-table--context-menu--option"
            :class="{ 'link--disabled': item.disabled, 'dtk-vxe-menu-danger': item.className === 'dtk-vxe-menu-danger' }"
            @click="onDtkContextMenuItemClick(item)"
          >
            <a class="vxe-context-menu--link" @click.prevent>
              <div class="vxe-context-menu--link-prefix">
                <i v-if="item.prefixIcon" :class="item.prefixIcon"></i>
              </div>
              <div class="vxe-context-menu--link-content">{{ item.name }}</div>
            </a>
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dtk-vxe-table-shell {
  width: 100%;
  height: 100%;
  outline: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.dtk-vxe-grid {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

:deep(.vxe-body--column:not(.col--seq) .vxe-cell) {
  cursor: cell;
  align-items: flex-start !important;
  justify-content: center !important;
}

:deep(.vxe-body--column:not(.col--seq) .vxe-cell--wrapper) {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 0;
}

:deep(.vxe-body--column:not(.col--seq) .vxe-cell--label) {
  width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  text-align: center;
  line-height: 1.45;
  padding: 4px 6px;
  box-sizing: border-box;
  align-self: flex-start;
}

:deep(.vxe-body--column.col--seq .vxe-cell) {
  justify-content: center;
  color: #64748b;
  font-weight: 500;
  user-select: none;
  cursor: pointer;
}

:deep(.vxe-header--column.col--seq),
:deep(.vxe-body--column.col--seq) {
  background-color: #f1f5f9;
}

:deep(.vxe-header--column.col--seq .vxe-cell) {
  position: relative;
  padding: 0 !important;
  background: #f1f5f9 !important;
}

:deep(.vxe-header--column.col--seq .vxe-cell--wrapper) {
  width: 100%;
  height: 100%;
}

:deep(.vxe-header--column.col--seq .vxe-cell--title) {
  display: block !important;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

:deep(.vxe-header--column.col--seq .vxe-cell--title > span) {
  display: block;
  width: 100%;
  height: 100%;
}

:deep(.dtk-vxe-select-all-corner-btn) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 40px;
  margin: 0;
  padding: 0;
  border: none;
  background: #f1f5f9;
  cursor: pointer;
  position: relative;
  box-sizing: border-box;
  font-size: 0.875rem;
  font-weight: 700;
  color: #64748b;
  line-height: 1;
}

:deep(.dtk-vxe-select-all-corner-btn:hover) {
  background: #e2e8f0;
}

:deep(.dtk-vxe-grid--all-cells-selected .dtk-vxe-select-all-corner-btn) {
  background: rgba(168, 178, 191, 0.55) !important;
}

:deep(.dtk-vxe-grid--all-cells-selected .vxe-body--column > .vxe-cell) {
  position: relative;
}

:deep(.dtk-vxe-header-clickable .vxe-cell) {
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  color: #475569;
}

:deep(.vxe-body--column.col--seq .vxe-cell--row-resizable),
:deep(.vxe-table--row-resizable-area) {
  z-index: 5;
  pointer-events: auto;
  cursor: row-resize;
}

:deep(.vxe-cell--col-resizable),
:deep(.vxe-table--header-column-resizable-area) {
  cursor: col-resize;
  pointer-events: auto;
  z-index: 10;
}

:deep(.dtk-vxe-grid--all-cells-selected .vxe-cell--col-resizable),
:deep(.dtk-vxe-grid--all-cells-selected .vxe-table--header-column-resizable-area),
:deep(.dtk-vxe-grid--all-cells-selected .vxe-cell--row-resizable),
:deep(.dtk-vxe-grid--all-cells-selected .vxe-table--row-resizable-area) {
  z-index: 20;
  pointer-events: auto;
}

:deep(.vxe-cell--col-resizable),
:deep(.vxe-table--header-column-resizable-area) {
  pointer-events: auto;
  z-index: 10;
}

:deep(.dtk-vxe-cell-area-selected > .vxe-cell::after),
:deep(.dtk-vxe-header-area-selected > .vxe-cell::after),
:deep(.dtk-vxe-seq-area-selected > .vxe-cell::after) {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(168, 178, 191, 0.42);
  pointer-events: none;
  z-index: 2;
}

:deep(.dtk-vxe-header-area-selected > .vxe-cell::after) {
  background: rgba(148, 158, 173, 0.48);
}

:deep(.dtk-vxe-cell-area-active > .vxe-cell) {
  background: #fff !important;
  box-shadow: inset 0 0 0 2px #217346 !important;
  z-index: 3;
}

:deep(.dtk-vxe-cell-area-active > .vxe-cell::after) {
  display: none;
}

:deep(.dtk-vxe-grid--inline-edit .vxe-body--column.col--active > .vxe-cell) {
  box-shadow: inset 0 0 0 2px #217346 !important;
  outline: none !important;
  background: #fff !important;
  align-items: stretch !important;
}

:deep(.dtk-vxe-grid--inline-edit .vxe-body--column.col--active .vxe-cell--wrapper),
:deep(.dtk-vxe-grid--inline-edit .vxe-body--column.col--active .vxe-textarea) {
  align-self: stretch !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  flex: 1 1 auto !important;
}

:deep(.dtk-vxe-grid--inline-edit .vxe-body--column.col--active .vxe-textarea--inner),
:deep(.dtk-vxe-grid--inline-edit .vxe-body--column.col--active textarea) {
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  box-sizing: border-box !important;
  border: none !important;
  outline: none !important;
  background: transparent !important;
  text-align: center !important;
  white-space: pre-wrap !important;
  word-break: break-word !important;
  line-height: 1.45 !important;
  resize: none !important;
  vertical-align: top !important;
}

:deep(.dtk-vxe-grid--row-area-selected .vxe-cell--row-resizable),
:deep(.dtk-vxe-grid--col-area-selected .vxe-cell--col-resizable) {
  z-index: 6;
}

:deep(.dtk-vxe-context-menu--sheet .vxe-context-menu--link) {
  border: none;
  box-shadow: none;
}

:deep(.dtk-vxe-context-menu .dtk-vxe-menu-danger) {
  color: #dc2626;
}

.dtk-vxe-hidden-columns-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem 0.55rem;
  width: 100%;
}

.dtk-vxe-hidden-columns-bar__head {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
}

.dtk-vxe-hidden-columns-bar__label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}

.dtk-vxe-hidden-columns-bar__count {
  font-size: 0.68rem;
  font-weight: 600;
  color: #6366f1;
  background: rgba(99, 102, 241, 0.12);
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  white-space: nowrap;
}

.dtk-vxe-hidden-columns-bar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  min-width: 0;
  flex: 1 1 auto;
}

.dtk-vxe-hidden-columns-bar__chip,
.dtk-vxe-hidden-columns-bar__show-all {
  flex: 0 0 auto;
  white-space: nowrap;
  border: 1px solid #c7d2fe;
  background: #fff;
  color: #4338ca;
  padding: 0.22rem 0.55rem;
  border-radius: 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.2;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.dtk-vxe-hidden-columns-bar__chip:hover,
.dtk-vxe-hidden-columns-bar__show-all:hover {
  background: #eef2ff;
  border-color: #a5b4fc;
  color: #3730a3;
  box-shadow: 0 1px 4px rgba(79, 70, 229, 0.12);
}

.dtk-vxe-hidden-columns-bar__show-all {
  margin-left: auto;
  color: #4f46e5;
  border-color: #a5b4fc;
  background: rgba(238, 242, 255, 0.85);
}
</style>
