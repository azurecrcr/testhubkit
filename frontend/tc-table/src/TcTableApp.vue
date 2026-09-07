<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  ensureTcVxeVirtualYGlobalDefaults,
  tcVxeShouldUseVirtualY,
  tcVxeIsVirtualYFlagEnabled,
  tcVxeBuildScrollYConfigVirtual,
  tcVxeBuildScrollYConfigDisabled,
  tcVxeReadVirtualYConfig,
} from './virtualY/tcVxeVirtualYConfig.js'
import {
  ensureTcVxeScrollIdleGlobalDefaults,
  tcVxeInstallScrollIdleGlobalHelpers,
  tcVxeIsScrollIdleEnabled,
  tcVxeReadScrollIdleConfig,
  tcVxeBuildScrollYConfigVirtualScrollIdle,
} from './virtualY/tcVxeScrollIdleConfig.js'

ensureTcVxeVirtualYGlobalDefaults()
ensureTcVxeScrollIdleGlobalDefaults()
tcVxeInstallScrollIdleGlobalHelpers()

const props = defineProps({
  onBridgeReady: { type: Function, default: null },
})

const gridRef = ref(null)
const shellRef = ref(null)
const gridHeight = ref(null)
const contextMenuRef = ref(null)
let layoutRo = null
let layoutRaf = 0
const columns = ref([])
const tableData = ref([])

const contextMenuState = ref({
  visible: false,
  x: 0,
  y: 0,
  type: 'body',
  row: null,
  column: null,
  groups: [],
})

const DEFAULT_ROW_HEIGHT = 52
const MIN_ROW_HEIGHT = 32
const MIN_COLUMN_WIDTH = 56
const TC_TABLE_BODY_ROW_GAP_HIT_PX = 8
const TC_VIRTUAL_SCROLL_ROW_THRESHOLD = 10
const TC_VIRTUAL_SCROLL_MIN_VIEWPORT_HEIGHT = 280

function g() {
  return window
}

function getDefaultRowHeight() {
  const d = g().TC_DEFAULT_ROW_HEIGHT
  return typeof d === 'number' && d > 0 ? d : DEFAULT_ROW_HEIGHT
}


function rowRecordHasContent(rec) {
  const cols = g().tableColumns || []
  if (!rec || !cols.length) return false
  for (let idx = 0; idx < cols.length; idx += 1) {
    if (String(normalizeCell(rec['c' + idx]) || '').trim()) return true
  }
  return false
}

async function materializeDisplayPadRow(row) {
  if (!row || !row._displayPad || row._rowIndex == null) return row
  if (typeof g().ensureTcTableRowMaterialized === 'function') {
    g().ensureTcTableRowMaterialized(row._rowIndex)
  }
  syncFromWindow()
  await nextTick()
  const $grid = gridRef.value
  if ($grid && typeof $grid.loadData === 'function' && tableData.value.length) {
    await $grid.loadData(tableData.value.slice())
  }
  return tableData.value.find((r) => r._rowIndex === row._rowIndex) || row
}

function normalizeCell(value) {
  if (value == null) return ''
  return String(value).replace(/<br\s*\/?>/gi, '\n')
}

function buildColumns() {
  const cols = g().tableColumns || []
  const meta = g().columnVisible || {}
  const widths = g().columnWidth || {}
  const list = cols.map((title, idx) => ({
    field: 'c' + idx,
    title: String(title || ('列' + (idx + 1))),
    minWidth: widths[idx] || 150,
    width: widths[idx] || undefined,
    visible: meta[idx] !== false,
    showOverflow: false,
    align: 'center',
    headerAlign: 'center',
    editRender: {
      name: 'VxeTextarea',
      props: {
        placeholder: '',
        resize: 'none',
      },
      attrs: {
        placeholder: '',
      },
    },
  }))
  list.unshift({
    type: 'seq',
    width: 52,
    fixed: 'left',
    title: '',
    rowResize: true,
    align: 'center',
    slots: { header: 'tc_seq_corner_header' },
  })
  return list
}

function getMinDisplayRowCount() {
  const fromFn = g().tcTableMinDisplayRowCount
  if (typeof fromFn === 'function') {
    const n = fromFn()
    if (typeof n === 'number' && n > 0) return n
  }
  const d = g().TC_TABLE_DEFAULT_EMPTY_ROWS
  return typeof d === 'number' && d > 0 ? d : 8
}

function buildRecords() {
  const cols = g().tableColumns || []
  const rows = g().testCasesData || []
  const minDisplay = getMinDisplayRowCount()
  const displayLen = Math.max(rows.length, minDisplay)
  const records = []
  for (let rowIndex = 0; rowIndex < displayLen; rowIndex += 1) {
    const row = rows[rowIndex]
    const isPad = rowIndex >= rows.length
    const rec = { _rowId: 'r' + rowIndex, _rowIndex: rowIndex, _displayPad: isPad }
    cols.forEach((_, idx) => {
      rec['c' + idx] = normalizeCell(Array.isArray(row) ? row[idx] : '')
    })
    records.push(rec)
  }
  return records
}

function syncFromWindow(opts = {}) {
  opts = opts || {}
  const cols = g().tableColumns || []
  const needRebuildCols =
    opts.rebuildColumns !== false &&
    (opts.rebuildColumns === true || columns.value.length !== cols.length + 1)
  if (needRebuildCols) columns.value = buildColumns()
  tableData.value = buildRecords()
}

function rowClassName({ row }) {
  const classes = []
  const marked = g().markedRows instanceof Set ? g().markedRows : new Set()
  if (marked.has(row._rowIndex)) classes.push('tc-vxe-row--marked')
  const prod = g().TcTableProductivity
  if (prod && typeof prod.isRowVisibleInFilter === 'function' && !prod.isRowVisibleInFilter(row._rowIndex)) {
    classes.push('tc-table-row--filtered-out')
  }
  return classes.join(' ')
}

async function waitGrid(maxTry = 30) {
  for (let i = 0; i < maxTry; i += 1) {
    if (gridRef.value) return gridRef.value
    await nextTick()
    await new Promise((r) => window.setTimeout(r, 16))
  }
  return null
}

function buildRowHeightConf() {
  const heights = g().rowHeights || {}
  const defaultH = getDefaultRowHeight()
  const conf = {}
  tableData.value.forEach((row) => {
    const h = parseInt(heights[row._rowIndex], 10)
    if (!Number.isNaN(h) && h >= MIN_ROW_HEIGHT && h !== defaultH) {
      conf[row._rowId] = h
    }
  })
  return conf
}

async function applyRowHeightsFromGlobal() {
  const $grid = await waitGrid()
  if (!$grid || typeof $grid.setRowHeightConf !== 'function') return false
  const conf = buildRowHeightConf()
  if (Object.keys(conf).length) {
    await $grid.setRowHeightConf(conf)
  }
  await nextTick()
  if ($grid.recalculate) await $grid.recalculate()
  return true
}

function syncRowHeightsToGlobal() {
  const $grid = gridRef.value
  if (!$grid || typeof $grid.getRowHeightConf !== 'function') return
  const conf = $grid.getRowHeightConf(true) || {}
  if (!conf || Object.keys(conf).length === 0) return
  const defaultH = getDefaultRowHeight()
  const next = Object.assign({}, g().rowHeights || {})
  let changed = false
  tableData.value.forEach((row) => {
    const rid = row._rowId
    if (!Object.prototype.hasOwnProperty.call(conf, rid)) return
    const h = parseInt(conf[rid], 10)
    if (Number.isNaN(h) || h < MIN_ROW_HEIGHT) return
    const idx = row._rowIndex
    if (h === defaultH) {
      if (next[idx] != null) {
        delete next[idx]
        changed = true
      }
    } else if (next[idx] !== h) {
      next[idx] = h
      changed = true
    }
  })
  if (changed) g().rowHeights = next
}

let pendingClickCloseTimer = null
let isSwitchingEditCell = false
let cellSwitchOptimisticSelect = false
let autoFitRowRaf = 0
let pendingAutoFitRowId = null
let cellEditOpening = false
let editOpChain = Promise.resolve()
let suppressClickCloseUntil = 0
let suppressRowClickUntil = 0
let rowSelectPointerAt = 0
let lastShellDblclickAt = 0
/** @type {null | { anchorRow: object, didDrag: boolean }} */
let rowDragSelectState = null
/** @type {null | { anchorRow: object, anchorColIndex: number, didDrag: boolean }} */
let cellDragSelectState = null
let suppressCellClickUntil = 0
let shellEditSwitchHandled = false
let rowAutoHeightMeasureEl = null
let lastMouseDownCell = null
let lastMouseDownAt = 0
let customCellAreaActive = false
/** @type {null | { kind: 'all' } | { kind: 'row', rowIndex: number } | { kind: 'rowRange', startRowIndex: number, endRowIndex: number } | { kind: 'col', colIndex: number } | { kind: 'cell', rowIndex: number, colIndex: number } | { kind: 'cellRange', startRowIndex: number, startColIndex: number, endRowIndex: number, endColIndex: number }} */
let currentAreaScope = null
/** 右键菜单打开时快照的多行索引，避免点击菜单项前 selection 被 pointerdown 清掉 */
let menuTargetRowIndexesSnapshot = null
/** @type {null | { rowIndex: number, colIndex: number, rowId: string, field: string }} */
let focusedCell = null
let cellImeComposing = false
let cellKeyboardBound = false



function getRowAutoHeightMeasureEl() {
  if (!rowAutoHeightMeasureEl) {
    rowAutoHeightMeasureEl = document.createElement('div')
    rowAutoHeightMeasureEl.setAttribute('aria-hidden', 'true')
    document.body.appendChild(rowAutoHeightMeasureEl)
  }
  return rowAutoHeightMeasureEl
}

function measureCellContentHeight(text, widthPx, styleSampleEl) {
  const el = getRowAutoHeightMeasureEl()
  const safeWidth = Math.max(40, widthPx - 16)
  let fontSize = '13px'
  let lineHeight = '1.45'
  let textAlign = 'center'
  let fontFamily = ''
  if (styleSampleEl && typeof getComputedStyle === 'function') {
    const cs = getComputedStyle(styleSampleEl)
    fontSize = cs.fontSize || fontSize
    lineHeight = cs.lineHeight || lineHeight
    textAlign = cs.textAlign || textAlign
    fontFamily = cs.fontFamily || fontFamily
  }
  el.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:0', 'visibility:hidden', 'pointer-events:none',
    `width:${safeWidth}px`, `font-size:${fontSize}`, `line-height:${lineHeight}`, `text-align:${textAlign}`,
    fontFamily ? `font-family:${fontFamily}` : '',
    'white-space:pre-wrap', 'word-break:break-word', 'padding:4px 8px', 'box-sizing:border-box',
  ].filter(Boolean).join(';')
  el.textContent = normalizeCell(text)
  return Math.max(MIN_ROW_HEIGHT, Math.ceil(el.offsetHeight))
}

function getRowResizeHitElement(event) {
  const target = event && event.target
  if (target && target.closest) {
    const direct = target.closest('.vxe-cell--row-resizable, .vxe-table--row-resizable-area, .vxe-table--resizable-row-bar, .vxe-table--resizable-bar')
    if (direct) return direct
  }
  if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return null
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount) return null
  const resizables = mount.querySelectorAll('.vxe-cell--row-resizable, .vxe-table--row-resizable-area')
  for (const el of resizables) {
    const rect = el.getBoundingClientRect()
    if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
      return el
    }
  }
  const seqCol = target && target.closest && target.closest('.vxe-body--column.col--seq')
  if (!seqCol) return null
  const rowEl = seqCol.closest('.vxe-body--row')
  if (!rowEl) return null
  const rowRect = rowEl.getBoundingClientRect()
  if (event.clientY >= rowRect.bottom - 14 && event.clientY <= rowRect.bottom + 8) {
    return rowEl.querySelector('.vxe-cell--row-resizable, .vxe-table--row-resizable-area')
  }
  return null
}

function isRowResizeTarget(event) {
  return !!getRowResizeHitElement(event)
}


function getBodyRowGapHitRowElement(event) {
  if (typeof event.clientY !== 'number' || typeof event.clientX !== 'number') return null
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount) return null
  const y = event.clientY
  const x = event.clientX
  const rows = mount.querySelectorAll('.vxe-body--row')
  for (const rowEl of rows) {
    const rowRect = rowEl.getBoundingClientRect()
    if (x < rowRect.left || x > rowRect.right) continue
    if (y >= rowRect.bottom - TC_TABLE_BODY_ROW_GAP_HIT_PX && y <= rowRect.bottom + TC_TABLE_BODY_ROW_GAP_HIT_PX) {
      return rowEl
    }
  }
  return null
}

function isTableBodyRowGapTarget(event) {
  return !!getBodyRowGapHitRowElement(event)
}

function isRowResizeOrBodyGapTarget(event) {
  return isRowResizeTarget(event) || isTableBodyRowGapTarget(event)
}

function resolveRowFromResizeOrGapTarget(event) {
  const fromResize = resolveRowFromResizeTarget(event)
  if (fromResize) return fromResize
  const rowEl = getBodyRowGapHitRowElement(event)
  if (!rowEl) return null
  const rowid = rowEl.getAttribute('rowid')
  return tableData.value.find((r) => r._rowId === rowid) || null
}


function isSeqRowSelectBlockedTarget(event) {
  const target = event && event.target
  if (!target || !target.closest) return false
  return !!target.closest('.vxe-cell--row-resizable, .vxe-table--row-resizable-area')
}

function isColumnResizeTarget(event) {
  const target = event && event.target
  if (!target || !target.closest) return false
  if (target.closest('.vxe-cell--col-resizable, .vxe-table--header-column-resizable-area, .vxe-table--resizable-column-bar')) {
    return true
  }
  if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return false
  const mount = document.getElementById('tc-vxe-table-mount')
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

function isContextMenuPointerTarget(target) {
  if (!target || !target.closest) return false
  return !!target.closest('.vxe-table--context-menu-wrapper, .tc-vxe-fallback-menu, .tc-vxe-context-menu, .vxe-context-menu--option')
}

function captureMenuTargetRowIndexes(row) {
  if (isAllCellsAreaSelected()) {
    menuTargetRowIndexesSnapshot = getAllTableRowIndexes().slice().sort((a, b) => a - b)
    return
  }
  const rowIndex = resolveRowIndex(row)
  const selected = getCurrentSelectedRowIndexes()
  if (selected.length > 1 && rowIndex >= 0 && isRowIndexInCurrentSelection(rowIndex)) {
    menuTargetRowIndexesSnapshot = selected.slice().sort((a, b) => a - b)
    return
  }
  menuTargetRowIndexesSnapshot = rowIndex >= 0 ? [rowIndex] : null
}

function clearMenuTargetRowIndexesSnapshot() {
  menuTargetRowIndexesSnapshot = null
}

function shouldPreserveAllCellsSelection(event) {
  const target = event && event.target
  if (!target || !target.closest) return false
  if (isContextMenuPointerTarget(target)) return true
  if (currentAreaScope && currentAreaScope.kind === 'all' && target.closest('.tc-vxe-table-shell')) return true
  if (target.closest('.tc-vxe-select-all-corner-btn')) return true
  if (isRowResizeOrBodyGapTarget(event)) return true
  if (isColumnResizeTarget(event)) return true
  if (target.closest('.vxe-header--column')) return true
  if (target.closest('.vxe-body--column.col--seq')) return true
  if (target.closest('.tc-vxe-cell-area-selected, .tc-vxe-cell-area-active, .tc-vxe-seq-area-selected')) return true
  const row = resolveRowFromDomEvent(event)
  if (row && isRowIndexInCurrentSelection(row._rowIndex)) return true
  return false
}

function getAllTableRowIndexes() {
  return tableData.value.map((r) => r._rowIndex)
}

function isAllCellsAreaSelected() {
  return !!(currentAreaScope && currentAreaScope.kind === 'all')
}

function getCurrentSelectedRowIndexes() {
  if (!currentAreaScope) return []
  if (currentAreaScope.kind === 'all') return getAllTableRowIndexes()
  if (currentAreaScope.kind === 'row') return [currentAreaScope.rowIndex]
  if (currentAreaScope.kind === 'rowRange' || currentAreaScope.kind === 'cellRange') {
    const indexes = []
    for (let i = currentAreaScope.startRowIndex; i <= currentAreaScope.endRowIndex; i += 1) indexes.push(i)
    return indexes
  }
  if (currentAreaScope.kind === 'cell') return [currentAreaScope.rowIndex]
  return []
}

function isRowIndexInCurrentSelection(rowIndex) {
  if (rowIndex == null || rowIndex < 0 || !currentAreaScope) return false
  if (currentAreaScope.kind === 'all') return true
  if (currentAreaScope.kind === 'row') return currentAreaScope.rowIndex === rowIndex
  if (currentAreaScope.kind === 'rowRange' || currentAreaScope.kind === 'cellRange') {
    return rowIndex >= currentAreaScope.startRowIndex && rowIndex <= currentAreaScope.endRowIndex
  }
  if (currentAreaScope.kind === 'cell') return currentAreaScope.rowIndex === rowIndex
  return false
}

async function ensureRowContextSelection(row) {
  if (!row) return
  if (isAllCellsAreaSelected()) {
    await selectAllCells({ reapply: true })
    return
  }
  if (isRowIndexInCurrentSelection(row._rowIndex)) {
    if (currentAreaScope && currentAreaScope.kind === 'rowRange') {
      const startRow = tableData.value.find((r) => r._rowIndex === currentAreaScope.startRowIndex)
      const endRow = tableData.value.find((r) => r._rowIndex === currentAreaScope.endRowIndex)
      if (startRow && endRow) await selectRowRange(startRow, endRow, { reapply: true })
    } else if (currentAreaScope && currentAreaScope.kind === 'cellRange') {
      await selectCellRange(
        currentAreaScope.startRowIndex,
        currentAreaScope.startColIndex,
        currentAreaScope.endRowIndex,
        currentAreaScope.endColIndex,
        { reapply: true },
      )
    }
    return
  }
  await selectRowArea(row)
}

function getMenuTargetRowIndexes(row) {
  const rowIndex = resolveRowIndex(row)
  if (isAllCellsAreaSelected()) {
    if (menuTargetRowIndexesSnapshot && menuTargetRowIndexesSnapshot.length) {
      return menuTargetRowIndexesSnapshot.slice().sort((a, b) => a - b)
    }
    return getAllTableRowIndexes().slice().sort((a, b) => a - b)
  }
  if (
    menuTargetRowIndexesSnapshot &&
    menuTargetRowIndexesSnapshot.length &&
    rowIndex >= 0 &&
    menuTargetRowIndexesSnapshot.includes(rowIndex)
  ) {
    return menuTargetRowIndexesSnapshot.slice()
  }
  const selected = getCurrentSelectedRowIndexes()
  if (selected.length > 1 && rowIndex >= 0 && isRowIndexInCurrentSelection(rowIndex)) {
    return selected.slice().sort((a, b) => a - b)
  }
  return rowIndex >= 0 ? [rowIndex] : []
}

function remapRowMetaAfterBatchDelete(indexSet) {
  const marked = g().markedRows
  if (marked instanceof Set) {
    const next = new Set()
    marked.forEach((i) => {
      let shift = 0
      indexSet.forEach((del) => { if (i > del) shift += 1 })
      if (!indexSet.has(i)) next.add(i - shift)
    })
    g().markedRows = next
  }
  const selected = g().selectedRows
  if (selected instanceof Set) {
    const next = new Set()
    selected.forEach((i) => {
      let shift = 0
      indexSet.forEach((del) => { if (i > del) shift += 1 })
      if (!indexSet.has(i)) next.add(i - shift)
    })
    g().selectedRows = next
  }
  const rh = g().rowHeights || {}
  const nextRh = {}
  Object.keys(rh).forEach((k) => {
    const i = parseInt(k, 10)
    if (Number.isNaN(i) || indexSet.has(i)) return
    let shift = 0
    indexSet.forEach((del) => { if (i > del) shift += 1 })
    nextRh[i - shift] = rh[k]
  })
  g().rowHeights = nextRh
}

async function deleteRowsAtIndexes(indexes) {
  const unique = [...new Set(indexes)].filter((i) => i >= 0).sort((a, b) => a - b)
  if (!unique.length) return false
  const count = unique.length
  let ok = true
  if (typeof g().tcAppConfirm === 'function') {
    ok = await g().tcAppConfirm(
      count === 1 ? '将删除该条用例行，且不可恢复。' : `将永久删除已选中的 ${count} 条用例，且不可恢复。`,
      {
        title: count === 1 ? '删除用例？' : '批量删除用例？',
        variant: 'warning',
        confirmText: count === 1 ? '删除' : `删除 ${count} 条`,
        cancelText: count === 1 ? '保留' : '取消',
      },
    )
  }
  if (!ok) return false
  const indexSet = new Set(unique)
  const rows = g().testCasesData || []
  const prov = g().testCasesProvenance || []
  const nextRows = []
  const nextProv = []
  rows.forEach((r, idx) => {
    if (indexSet.has(idx)) return
    nextRows.push(r)
    nextProv.push(prov[idx] || null)
  })
  g().testCasesData = nextRows
  if (Array.isArray(g().testCasesProvenance)) g().testCasesProvenance = nextProv
  remapRowMetaAfterBatchDelete(indexSet)
  if (typeof g().tcAppToast === 'function') {
    g().tcAppToast(count === 1 ? '已删除 1 条用例。' : `已删除 ${count} 条用例。`, { variant: 'success', duration: 2200 })
  }
  return true
}

function measureCellContentWidth(text, maxWidth = 480) {
  const el = getRowAutoHeightMeasureEl()
  el.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:0', 'visibility:hidden', 'pointer-events:none',
    'font-size:13px', 'line-height:1.45', 'white-space:nowrap', 'padding:4px 8px', 'box-sizing:border-box',
  ].join(';')
  const line = normalizeCell(text).split('\n')[0] || ' '
  el.textContent = line
  return Math.min(maxWidth, Math.max(64, Math.ceil(el.offsetWidth) + 20))
}

function fieldFromDataColIndex(colIndex) {
  return 'c' + colIndex
}

function resolveFieldFromColumnEl(colEl) {
  if (!colEl) return null
  const direct = colEl.getAttribute('colid') || colEl.getAttribute('col-id') || colEl.getAttribute('data-colid')
  if (direct) return direct
  const cls = typeof colEl.className === 'string' ? colEl.className : ''
  const m = cls.match(/\bcol_?(c\d+)\b/i) || cls.match(/\bcol--(c\d+)\b/)
  return m ? m[1] : null
}

function findHeaderColumnElByField(field) {
  const mount = document.getElementById('tc-vxe-table-mount')
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
  for (let i = 0; i < headers.length; i += 1) {
    if (resolveFieldFromColumnEl(headers[i]) === field) return headers[i]
  }
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
  for (let i = 0; i < cells.length; i += 1) {
    if (resolveFieldFromColumnEl(cells[i]) === field) return cells[i]
  }
  return null
}

function findVisibleColumnDefByDataColIndex($grid, colIndex) {
  const field = fieldFromDataColIndex(colIndex)
  const dataCols = getVisibleDataColumns($grid)
  let column = dataCols.find((col) => col.field === field)
  if (column) return column
  if ($grid && typeof $grid.getColumnByField === 'function') {
    column = $grid.getColumnByField(field)
    if (column) return column
  }
  return columns.value.find((col) => col.field === field) || null
}

function getVisibleDataColumns($grid) {
  const tableCol = $grid && typeof $grid.getTableColumn === 'function' ? $grid.getTableColumn() : null
  const cols = tableCol && tableCol.visibleColumn ? tableCol.visibleColumn : columns.value
  return cols.filter((col) => col && col.field && col.field[0] === 'c')
}

function getVisibleDataRows($grid) {
  const tableDataResult = $grid && typeof $grid.getTableData === 'function' ? $grid.getTableData() : null
  if (tableDataResult && tableDataResult.visibleData) return tableDataResult.visibleData
  if (tableDataResult && tableDataResult.fullData) return tableDataResult.fullData
  return tableData.value
}

/** 虚拟滚动专用：业务全选/索引必须以全量行为准，禁止用 visibleData 当全表 */
function tcVxeGetFullDataRowsVirtual($grid) {
  if (tableData.value && tableData.value.length) return tableData.value.slice()
  const tableDataResult = $grid && typeof $grid.getTableData === 'function' ? $grid.getTableData() : null
  if (tableDataResult && tableDataResult.fullData && tableDataResult.fullData.length) {
    return tableDataResult.fullData.slice()
  }
  return getVisibleDataRows($grid)
}

/** 虚拟滚动专用：仅取当前视口行（用于重绘高亮） */
function tcVxeGetVisibleBodyRowsVirtual($grid) {
  const tableDataResult = $grid && typeof $grid.getTableData === 'function' ? $grid.getTableData() : null
  if (tableDataResult && tableDataResult.visibleData && tableDataResult.visibleData.length) {
    return tableDataResult.visibleData
  }
  return getVisibleDataRows($grid)
}


function isNativeCellAreaVisible() {
  const mount = document.getElementById('tc-vxe-table-mount')
  const main = mount && mount.querySelector('.vxe-table--cell-main-area')
  if (!main) return false
  const cs = getComputedStyle(main)
  return cs.display !== 'none' && main.offsetWidth > 8 && main.offsetHeight > 8
}

function clearCustomCellAreaSelection() {
  customCellAreaActive = false
  currentAreaScope = null
  focusedCell = null
  g().tcFocusedCell = null
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount) return
  mount.classList.remove('tc-vxe-grid--all-cells-selected', 'tc-vxe-grid--row-area-selected', 'tc-vxe-grid--col-area-selected', 'tc-vxe-grid--cell-focused', 'tc-vxe-grid--cell-range-selected')
  mount.querySelectorAll('.tc-vxe-cell-area-selected, .tc-vxe-header-area-selected, .tc-vxe-seq-area-selected, .tc-vxe-cell-area-active').forEach((el) => {
    el.classList.remove('tc-vxe-cell-area-selected', 'tc-vxe-header-area-selected', 'tc-vxe-seq-area-selected', 'tc-vxe-cell-area-active')
  })
}

function syncFocusedCellGlobal(rowIndex, colIndex) {
  g().tcFocusedCell = { row: rowIndex, col: colIndex }
}

function primeCellFocus(row, column) {
  if (!row || !column || !column.field) return false
  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return false
  focusedCell = { rowIndex: row._rowIndex, colIndex: colIdx, rowId: row._rowId, field: column.field }
  syncFocusedCellGlobal(row._rowIndex, colIdx)
  return true
}

function ensureTableShellFocus() {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount) return
  const active = document.activeElement
  if (active && active.closest && active.closest('#tc-vxe-table-mount')) {
    const $grid = gridRef.value
    const activeEdit = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
    const inEdit = active.closest('.vxe-cell--edit')
    if (!activeEdit && !inEdit && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      if (typeof active.blur === 'function') active.blur()
    }
  }
  const shell = mount.querySelector('.tc-vxe-table-shell')
  if (shell && typeof shell.focus === 'function') shell.focus()
}

function applyCustomSingleCellSelection(row, colIndex) {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount || !row || colIndex < 0) return false
  customCellAreaActive = false
  currentAreaScope = null
  mount.classList.remove('tc-vxe-grid--all-cells-selected', 'tc-vxe-grid--row-area-selected', 'tc-vxe-grid--col-area-selected', 'tc-vxe-grid--cell-focused', 'tc-vxe-grid--cell-range-selected')
  mount.querySelectorAll('.tc-vxe-cell-area-selected, .tc-vxe-header-area-selected, .tc-vxe-seq-area-selected, .tc-vxe-cell-area-active').forEach((el) => {
    el.classList.remove('tc-vxe-cell-area-selected', 'tc-vxe-header-area-selected', 'tc-vxe-seq-area-selected', 'tc-vxe-cell-area-active')
  })
  customCellAreaActive = true
  currentAreaScope = { kind: 'cell', rowIndex: row._rowIndex, colIndex }
  const field = fieldFromDataColIndex(colIndex)
  focusedCell = { rowIndex: row._rowIndex, colIndex, rowId: row._rowId, field }
  syncFocusedCellGlobal(row._rowIndex, colIndex)
  mount.classList.add('tc-vxe-grid--cell-focused')
  const rowEl = mount.querySelector(`.vxe-body--row[rowid="${row._rowId}"]`)
  if (!rowEl) return false
  const cell = findBodyColumnElByField(rowEl, field)
  if (cell) cell.classList.add('tc-vxe-cell-area-active')
  const shell = mount.querySelector('.tc-vxe-table-shell')
  if (shell && typeof shell.focus === 'function') shell.focus()
  return true
}

async function selectSingleCell(row, column) {
  if (!row || !column || !column.field || column.type === 'seq') return false
  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return false
  await clearNativeCellAreas(gridRef.value)
  return applyCustomSingleCellSelection(row, colIdx)
}

async function clearNativeCellAreas($grid) {
  const grid = $grid || gridRef.value
  if (grid && typeof grid.clearCellAreas === 'function') {
    await grid.clearCellAreas()
  }
}

async function clearAreaSelection($grid) {
  clearCustomCellAreaSelection()
  await clearNativeCellAreas($grid)
}

function isSameAreaScope(scope) {
  if (!scope || !currentAreaScope || scope.kind !== currentAreaScope.kind) return false
  if (scope.kind === 'all') return true
  if (scope.kind === 'row') return scope.rowIndex === currentAreaScope.rowIndex
  if (scope.kind === 'rowRange') {
    return scope.startRowIndex === currentAreaScope.startRowIndex && scope.endRowIndex === currentAreaScope.endRowIndex
  }
  if (scope.kind === 'col') return scope.colIndex === currentAreaScope.colIndex
  if (scope.kind === 'cell') return scope.rowIndex === currentAreaScope.rowIndex && scope.colIndex === currentAreaScope.colIndex
  if (scope.kind === 'cellRange') {
    return scope.startRowIndex === currentAreaScope.startRowIndex
      && scope.endRowIndex === currentAreaScope.endRowIndex
      && scope.startColIndex === currentAreaScope.startColIndex
      && scope.endColIndex === currentAreaScope.endColIndex
  }
  return false
}

function resolveRowFromDomEvent(event) {
  const target = event && event.target
  if (!target) return null
  let rowEl = target.closest ? target.closest('.vxe-body--row') : null
  if (!rowEl && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
    const hit = document.elementFromPoint(event.clientX, event.clientY)
    rowEl = hit && hit.closest ? hit.closest('.vxe-body--row') : null
  }
  if (!rowEl) return null
  const rowid = rowEl.getAttribute('rowid')
  if (!rowid) return null
  return tableData.value.find((r) => r._rowId === rowid) || null
}

function tryStartRowDragSelect(event) {
  if (event.button !== 0 || isRowResizeTarget(event)) return
  const target = event.target
  if (!target || !target.closest) return
  const seqCol = target.closest('.vxe-body--column.col--seq')
  if (!seqCol || !target.closest('.tc-vxe-table-shell')) return
  const row = resolveRowFromDomEvent(event)
  if (!row) return
  rowDragSelectState = { anchorRow: row, didDrag: false }
}

async function updateRowDragSelect(endRow) {
  if (!rowDragSelectState || !endRow) return
  const anchor = rowDragSelectState.anchorRow
  if (anchor._rowIndex === endRow._rowIndex) return
  rowDragSelectState.didDrag = true
  await selectRowRange(anchor, endRow, { reapply: true })
}

async function finishRowDragSelect(event) {
  if (!rowDragSelectState) return
  const { anchorRow, didDrag } = rowDragSelectState
  rowDragSelectState = null
  if (didDrag) {
    suppressRowClickUntil = Date.now() + 320
    return
  }
  if (!anchorRow || (event && event.button !== 0) || (event && isSeqRowSelectBlockedTarget(event))) return
  rowSelectPointerAt = Date.now()
  const $grid = gridRef.value
  const active = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (active) await closeActiveEdit($grid)
  await selectRowArea(anchorRow)
}

function onDocumentRowDragMove(event) {
  if (event.buttons !== 1) return
  if (rowDragSelectState) {
    const row = resolveRowFromDomEvent(event)
    if (row) void updateRowDragSelect(row)
    return
  }
  if (cellDragSelectState) {
    const resolved = resolveCellFromDom(event)
    if (!resolved || !resolved.column || !resolved.column.field) return
    const colIdx = parseInt(String(resolved.column.field).slice(1), 10)
    if (Number.isNaN(colIdx) || colIdx < 0) return
    void updateCellDragSelect(resolved.row, colIdx)
  }
}

function onDocumentRowDragEnd(event) {
  void finishRowDragSelect(event)
  void finishCellDragSelect(event)
}

function normalizeCellRange(r1, c1, r2, c2) {
  return {
    startRowIndex: Math.min(r1, r2),
    endRowIndex: Math.max(r1, r2),
    startColIndex: Math.min(c1, c2),
    endColIndex: Math.max(c1, c2),
  }
}

/** 矩形单元格选区视觉（新能力，不影响行/列/全选原逻辑） */
function applyCustomCellRangeSelection(startRowIndex, startColIndex, endRowIndex, endColIndex) {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount) return false
  const cols = g().tableColumns || []
  if (!cols.length) return false
  const range = normalizeCellRange(startRowIndex, startColIndex, endRowIndex, endColIndex)
  if (range.startColIndex < 0 || range.endColIndex >= cols.length) return false
  clearCustomCellAreaSelection()
  customCellAreaActive = true
  currentAreaScope = { kind: 'cellRange', ...range }
  mount.classList.add('tc-vxe-grid--cell-range-selected')
  const activeRowIndex = startRowIndex
  const activeColIndex = startColIndex
  mount.querySelectorAll('.vxe-body--row').forEach((rowEl) => {
    const rowid = rowEl.getAttribute('rowid')
    const row = rowid ? tableData.value.find((r) => r._rowId === rowid) : null
    if (!row) return
    const ri = row._rowIndex
    if (ri < range.startRowIndex || ri > range.endRowIndex) return
    for (let c = range.startColIndex; c <= range.endColIndex; c += 1) {
      const field = fieldFromDataColIndex(c)
      const cell = findBodyColumnElByField(rowEl, field)
      if (!cell) continue
      if (ri === activeRowIndex && c === activeColIndex) cell.classList.add('tc-vxe-cell-area-active')
      else cell.classList.add('tc-vxe-cell-area-selected')
    }
  })
  syncFocusedCellGlobal(activeRowIndex, activeColIndex)
  return true
}

async function selectCellRange(startRowIndex, startColIndex, endRowIndex, endColIndex, opts = {}) {
  const $grid = gridRef.value
  if (!$grid) return false
  const range = normalizeCellRange(startRowIndex, startColIndex, endRowIndex, endColIndex)
  const scope = { kind: 'cellRange', ...range }
  if (!opts.reapply && isSameAreaScope(scope)) {
    await clearAreaSelection($grid)
    return false
  }
  await closeActiveEdit($grid)
  await clearAreaSelection($grid)
  await clearNativeCellAreas($grid)
  if (applyCustomCellRangeSelection(startRowIndex, startColIndex, endRowIndex, endColIndex)) return true
  const startRow = tableData.value.find((r) => r._rowIndex === range.startRowIndex)
  const endRow = tableData.value.find((r) => r._rowIndex === range.endRowIndex)
  const startColumn = findVisibleColumnDefByDataColIndex($grid, range.startColIndex)
  const endColumn = findVisibleColumnDefByDataColIndex($grid, range.endColIndex)
  if (!startRow || !endRow || !startColumn || !endColumn) return false
  const activeRow = tableData.value.find((r) => r._rowIndex === startRowIndex) || startRow
  const activeColumn = findVisibleColumnDefByDataColIndex($grid, startColIndex) || startColumn
  if (await tryNativeCellArea($grid, startRow, endRow, startColumn, endColumn, activeRow, activeColumn)) {
    currentAreaScope = scope
    customCellAreaActive = true
    return true
  }
  return false
}

function tryStartCellDragSelect(event) {
  if (event.button !== 0 || isRowResizeTarget(event)) return
  if (rowDragSelectState) return
  const target = event.target
  if (!target || !target.closest) return
  if (!target.closest('.tc-vxe-table-shell')) return
  if (target.closest('.vxe-body--column.col--seq')) return
  if (target.closest('.vxe-header--column')) return
  if (target.closest('.vxe-cell--edit, textarea, input')) return
  const $grid = gridRef.value
  if ($grid && typeof $grid.getEditCell === 'function' && $grid.getEditCell()) return
  const resolved = resolveCellFromDom(event)
  if (!resolved || !resolved.row || !resolved.column || !resolved.column.field) return
  const colIdx = parseInt(String(resolved.column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return
  cellDragSelectState = {
    anchorRow: resolved.row,
    anchorColIndex: colIdx,
    didDrag: false,
  }
}

async function updateCellDragSelect(endRow, endColIndex) {
  if (!cellDragSelectState || !endRow || endColIndex < 0) return
  const { anchorRow, anchorColIndex } = cellDragSelectState
  if (anchorRow._rowIndex === endRow._rowIndex && anchorColIndex === endColIndex) return
  cellDragSelectState.didDrag = true
  await selectCellRange(anchorRow._rowIndex, anchorColIndex, endRow._rowIndex, endColIndex, { reapply: true })
}

async function finishCellDragSelect() {
  if (!cellDragSelectState) return
  const { didDrag } = cellDragSelectState
  cellDragSelectState = null
  if (didDrag) {
    suppressCellClickUntil = Date.now() + 320
    suppressRowClickUntil = Date.now() + 320
  }
}

async function tryNativeCellArea($grid, startRow, endRow, startColumn, endColumn, activeRow, activeColumn) {
  if (!$grid || typeof $grid.setCellAreas !== 'function') return false
  if ($grid.recalculate) await $grid.recalculate()
  await nextTick()
  await $grid.setCellAreas([
    {
      startRow,
      endRow,
      startColumn,
      endColumn,
    },
  ], {
    row: activeRow,
    column: activeColumn,
  })
  await nextTick()
  if (typeof $grid.handleRecalculateCellAreaEvent === 'function') {
    await $grid.handleRecalculateCellAreaEvent()
  } else if ($grid.recalculate) {
    await $grid.recalculate()
  }
  await nextTick()
  return isNativeCellAreaVisible()
}

function applyCustomCellAreaSelection() {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount) return false
  clearCustomCellAreaSelection()
  const cells = mount.querySelectorAll('.vxe-body--column:not(.col--seq)')
  if (!cells.length) return false
  customCellAreaActive = true
  currentAreaScope = { kind: 'all' }
  mount.classList.add('tc-vxe-grid--all-cells-selected')
  mount.querySelectorAll('.vxe-header--column:not(.col--seq)').forEach((el) => {
    el.classList.add('tc-vxe-header-area-selected')
  })
  mount.querySelectorAll('.vxe-body--column.col--seq').forEach((el) => {
    el.classList.add('tc-vxe-seq-area-selected')
  })
  cells.forEach((el) => el.classList.add('tc-vxe-cell-area-selected'))
  const firstDataCell = mount.querySelector('.vxe-body--row .vxe-body--column:not(.col--seq)')
  if (firstDataCell) {
    firstDataCell.classList.remove('tc-vxe-cell-area-selected')
    firstDataCell.classList.add('tc-vxe-cell-area-active')
  }
  return true
}

/**
 * 虚拟滚动专用全选视觉：scope 仍为全表，DOM 只给当前可见行打 class。
 * 不改 applyCustomCellAreaSelection。
 */
function applyCustomCellAreaSelectionVirtual() {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount) return false
  clearCustomCellAreaSelection()
  const cells = mount.querySelectorAll('.vxe-body--column:not(.col--seq)')
  if (!cells.length) return false
  customCellAreaActive = true
  currentAreaScope = { kind: 'all' }
  mount.classList.add('tc-vxe-grid--all-cells-selected')
  mount.querySelectorAll('.vxe-header--column:not(.col--seq)').forEach((el) => {
    el.classList.add('tc-vxe-header-area-selected')
  })
  mount.querySelectorAll('.vxe-body--column.col--seq').forEach((el) => {
    el.classList.add('tc-vxe-seq-area-selected')
  })
  cells.forEach((el) => el.classList.add('tc-vxe-cell-area-selected'))
  const firstDataCell = mount.querySelector('.vxe-body--row .vxe-body--column:not(.col--seq)')
  if (firstDataCell) {
    firstDataCell.classList.remove('tc-vxe-cell-area-selected')
    firstDataCell.classList.add('tc-vxe-cell-area-active')
  }
  return true
}

async function tryNativeSelectAllCells($grid, dataCols, dataRows) {
  return tryNativeCellArea(
    $grid,
    dataRows[0],
    dataRows[dataRows.length - 1],
    dataCols[0],
    dataCols[dataCols.length - 1],
    dataRows[0],
    dataCols[0],
  )
}

function applyCustomRowAreaSelection(row) {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount || !row) return false
  clearCustomCellAreaSelection()
  const rowEl = mount.querySelector(`.vxe-body--row[rowid="${row._rowId}"]`)
  if (!rowEl) return false
  customCellAreaActive = true
  currentAreaScope = { kind: 'row', rowIndex: row._rowIndex }
  mount.classList.add('tc-vxe-grid--row-area-selected')
  rowEl.querySelectorAll('.vxe-body--column.col--seq').forEach((el) => {
    el.classList.add('tc-vxe-seq-area-selected')
  })
  const dataCells = [...rowEl.querySelectorAll('.vxe-body--column:not(.col--seq)')]
  dataCells.forEach((el, idx) => {
    if (idx === 0) el.classList.add('tc-vxe-cell-area-active')
    else el.classList.add('tc-vxe-cell-area-selected')
  })
  return true
}

function applyCustomRowRangeSelection(minRowIndex, maxRowIndex) {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount) return false
  clearCustomCellAreaSelection()
  customCellAreaActive = true
  currentAreaScope = { kind: 'rowRange', startRowIndex: minRowIndex, endRowIndex: maxRowIndex }
  mount.classList.add('tc-vxe-grid--row-area-selected')
  let firstActiveApplied = false
  tableData.value.forEach((row) => {
    if (row._rowIndex < minRowIndex || row._rowIndex > maxRowIndex) return
    const rowEl = mount.querySelector(`.vxe-body--row[rowid="${row._rowId}"]`)
    if (!rowEl) return
    rowEl.querySelectorAll('.vxe-body--column.col--seq').forEach((el) => {
      el.classList.add('tc-vxe-seq-area-selected')
    })
    const dataCells = [...rowEl.querySelectorAll('.vxe-body--column:not(.col--seq)')]
    dataCells.forEach((cell, idx) => {
      if (!firstActiveApplied && idx === 0) {
        cell.classList.add('tc-vxe-cell-area-active')
        firstActiveApplied = true
      } else {
        cell.classList.add('tc-vxe-cell-area-selected')
      }
    })
  })
  return firstActiveApplied
}

async function selectRowRange(startRow, endRow, opts = {}) {
  const $grid = gridRef.value
  if (!$grid || !startRow || !endRow) return false
  const minIdx = Math.min(startRow._rowIndex, endRow._rowIndex)
  const maxIdx = Math.max(startRow._rowIndex, endRow._rowIndex)
  const scope = { kind: 'rowRange', startRowIndex: minIdx, endRowIndex: maxIdx }
  if (!opts.reapply && isSameAreaScope(scope)) {
    await clearAreaSelection($grid)
    return false
  }
  await closeActiveEdit($grid)
  if (!opts.reapply) await clearAreaSelection($grid)
  const dataCols = getVisibleDataColumns($grid)
  if (!dataCols.length) return false
  const startRec = tableData.value.find((r) => r._rowIndex === minIdx) || startRow
  const endRec = tableData.value.find((r) => r._rowIndex === maxIdx) || endRow
  if (await tryNativeCellArea(
    $grid,
    startRec,
    endRec,
    dataCols[0],
    dataCols[dataCols.length - 1],
    startRec,
    dataCols[0],
  )) {
    currentAreaScope = scope
    customCellAreaActive = true
    const mount = document.getElementById('tc-vxe-table-mount')
    if (mount) mount.classList.add('tc-vxe-grid--row-area-selected')
    return true
  }
  return applyCustomRowRangeSelection(minIdx, maxIdx)
}

function applyCustomColumnAreaSelection(colIndex) {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount || colIndex < 0) return false
  clearCustomCellAreaSelection()
  const field = fieldFromDataColIndex(colIndex)
  const headerCol = findHeaderColumnElByField(field)
  if (!headerCol) return false
  customCellAreaActive = true
  currentAreaScope = { kind: 'col', colIndex }
  mount.classList.add('tc-vxe-grid--col-area-selected')
  headerCol.classList.add('tc-vxe-header-area-selected', 'tc-vxe-cell-area-active')
  mount.querySelectorAll('.vxe-body--row').forEach((rowEl) => {
    const cell = findBodyColumnElByField(rowEl, field)
    if (cell) cell.classList.add('tc-vxe-cell-area-selected')
  })
  return true
}

async function selectRowArea(row, opts = {}) {
  const $grid = gridRef.value
  if (!$grid || !row) return false
  const scope = { kind: 'row', rowIndex: row._rowIndex }
  if (!opts.reapply && isSameAreaScope(scope)) {
    await clearAreaSelection($grid)
    return false
  }
  await closeActiveEdit($grid)
  await clearAreaSelection($grid)
  const dataCols = getVisibleDataColumns($grid)
  if (!dataCols.length) return false
  if (await tryNativeCellArea($grid, row, row, dataCols[0], dataCols[dataCols.length - 1], row, dataCols[0])) {
    currentAreaScope = scope
    const mount = document.getElementById('tc-vxe-table-mount')
    if (mount) mount.classList.add('tc-vxe-grid--row-area-selected')
    return true
  }
  return applyCustomRowAreaSelection(row)
}

async function selectColumnArea(colIndex, opts = {}) {
  const $grid = gridRef.value
  if (!$grid || colIndex < 0) return false
  const scope = { kind: 'col', colIndex }
  if (!opts.reapply && isSameAreaScope(scope)) {
    await clearAreaSelection($grid)
    return false
  }
  await closeActiveEdit($grid)
  await clearAreaSelection($grid)
  const dataRows = getVisibleDataRows($grid)
  const column = findVisibleColumnDefByDataColIndex($grid, colIndex)
  if (!column || !dataRows.length) return false
  await clearNativeCellAreas($grid)
  if (applyCustomColumnAreaSelection(colIndex)) {
    return true
  }
  if (await tryNativeCellArea(
    $grid,
    dataRows[0],
    dataRows[dataRows.length - 1],
    column,
    column,
    dataRows[0],
    column,
  )) {
    currentAreaScope = scope
    customCellAreaActive = true
    const mount = document.getElementById('tc-vxe-table-mount')
    if (mount) mount.classList.add('tc-vxe-grid--col-area-selected')
    return true
  }
  return false
}

async function reapplyAreaSelectionIfNeeded() {
  if (!currentAreaScope) return
  if (currentAreaScope.kind === 'all') {
    await selectAllCells({ reapply: true })
    return
  }
  if (currentAreaScope.kind === 'row') {
    const row = tableData.value.find((r) => r._rowIndex === currentAreaScope.rowIndex)
    if (row) await selectRowArea(row, { reapply: true })
    return
  }
  if (currentAreaScope.kind === 'rowRange') {
    const startRow = tableData.value.find((r) => r._rowIndex === currentAreaScope.startRowIndex)
    const endRow = tableData.value.find((r) => r._rowIndex === currentAreaScope.endRowIndex)
    if (startRow && endRow) await selectRowRange(startRow, endRow, { reapply: true })
    return
  }
  if (currentAreaScope.kind === 'col') {
    await selectColumnArea(currentAreaScope.colIndex, { reapply: true })
    return
  }
  if (currentAreaScope.kind === 'cellRange') {
    await selectCellRange(
      currentAreaScope.startRowIndex,
      currentAreaScope.startColIndex,
      currentAreaScope.endRowIndex,
      currentAreaScope.endColIndex,
      { reapply: true },
    )
    return
  }
  if (currentAreaScope.kind === 'cell') {
    const row = tableData.value.find((r) => r._rowIndex === currentAreaScope.rowIndex)
    if (row) applyCustomSingleCellSelection(row, currentAreaScope.colIndex)
  }
}

/**
 * 虚拟滚动专用选区重绘：全选走 Virtual 全选（可见行高亮 + 全表 scope）。
 * 不改 reapplyAreaSelectionIfNeeded。
 */
async function reapplyAreaSelectionIfNeededVirtual() {
  if (!currentAreaScope) return
  if (currentAreaScope.kind === 'all') {
    await selectAllCellsVirtual({ reapply: true })
    return
  }
  if (currentAreaScope.kind === 'row') {
    const row = tableData.value.find((r) => r._rowIndex === currentAreaScope.rowIndex)
    if (row) await selectRowArea(row, { reapply: true })
    return
  }
  if (currentAreaScope.kind === 'rowRange') {
    const startRow = tableData.value.find((r) => r._rowIndex === currentAreaScope.startRowIndex)
    const endRow = tableData.value.find((r) => r._rowIndex === currentAreaScope.endRowIndex)
    if (startRow && endRow) await selectRowRange(startRow, endRow, { reapply: true })
    return
  }
  if (currentAreaScope.kind === 'col') {
    await selectColumnArea(currentAreaScope.colIndex, { reapply: true })
    return
  }
  if (currentAreaScope.kind === 'cellRange') {
    await selectCellRange(
      currentAreaScope.startRowIndex,
      currentAreaScope.startColIndex,
      currentAreaScope.endRowIndex,
      currentAreaScope.endColIndex,
      { reapply: true },
    )
    return
  }
  if (currentAreaScope.kind === 'cell') {
    const row = tableData.value.find((r) => r._rowIndex === currentAreaScope.rowIndex)
    if (row) applyCustomSingleCellSelection(row, currentAreaScope.colIndex)
  }
}

let selectAllCellsLockUntil = 0
let isSyncingAllSelectLayout = false

async function selectAllCells(opts = {}) {
  const $grid = gridRef.value
  if (!$grid) return false
  const now = Date.now()
  if (!opts.reapply && now < selectAllCellsLockUntil) return false
  selectAllCellsLockUntil = now + 280
  const scope = { kind: 'all' }
  if (!opts.reapply && (customCellAreaActive || currentAreaScope) && isSameAreaScope(scope)) {
    await clearAreaSelection($grid)
    return false
  }
  await closeActiveEdit($grid)
  await clearAreaSelection($grid)
  const dataCols = getVisibleDataColumns($grid)
  const dataRows = getVisibleDataRows($grid)
  if (!dataCols.length || !dataRows.length) return false
  await tryNativeSelectAllCells($grid, dataCols, dataRows)
  return applyCustomCellAreaSelection()
}

/**
 * 虚拟滚动专用全选：业务索引用全量行，原生/视觉仅覆盖当前视口。
 * 不改 selectAllCells。
 */
async function selectAllCellsVirtual(opts = {}) {
  const $grid = gridRef.value
  if (!$grid) return false
  const now = Date.now()
  if (!opts.reapply && now < selectAllCellsLockUntil) return false
  selectAllCellsLockUntil = now + 280
  const scope = { kind: 'all' }
  if (!opts.reapply && (customCellAreaActive || currentAreaScope) && isSameAreaScope(scope)) {
    await clearAreaSelection($grid)
    return false
  }
  await closeActiveEdit($grid)
  await clearAreaSelection($grid)
  const dataCols = getVisibleDataColumns($grid)
  const fullRows = tcVxeGetFullDataRowsVirtual($grid)
  const visibleRows = tcVxeGetVisibleBodyRowsVirtual($grid)
  if (!dataCols.length || !fullRows.length) return false
  const paintRows = visibleRows.length ? visibleRows : fullRows.slice(0, Math.min(40, fullRows.length))
  await tryNativeSelectAllCells($grid, dataCols, paintRows)
  return applyCustomCellAreaSelectionVirtual()
}

async function onSelectAllCornerActivate(event) {
  if (event) {
    event.preventDefault()
    event.stopPropagation()
  }
  if (shouldUseVirtualYMode()) {
    await selectAllCellsVirtual()
  } else {
    await selectAllCells()
  }
}

function resolveRowFromResizeTarget(event) {
  const hit = getRowResizeHitElement(event)
  const rowEl = (hit && hit.closest('.vxe-body--row'))
    || (event.target && event.target.closest && event.target.closest('.vxe-body--row'))
  if (!rowEl) return null
  const rowid = rowEl.getAttribute('rowid')
  return tableData.value.find((r) => r._rowId === rowid) || null
}

async function autoFitAllRowHeights() {
  const $grid = gridRef.value
  if (!$grid) return false
  const rows = tableData.value.length ? tableData.value.slice() : getVisibleDataRows($grid)
  for (const row of rows) {
    await autoFitRowHeight(row)
  }
  if (currentAreaScope) await reapplyAreaSelectionIfNeeded()
  return true
}

async function autoFitColumnWidth(colIdx) {
  const $grid = gridRef.value
  if (!$grid || colIdx < 0) return false
  const rows = getVisibleDataRows($grid)
  const field = 'c' + colIdx
  let maxW = 64
  const titles = g().tableColumns || []
  if (titles[colIdx]) maxW = Math.max(maxW, measureCellContentWidth(titles[colIdx]))
  rows.forEach((row) => {
    maxW = Math.max(maxW, measureCellContentWidth(row[field]))
  })
  if (!g().columnWidth) g().columnWidth = {}
  g().columnWidth[colIdx] = maxW
  const col = columns.value.find((c) => c.field === field)
  if (col) {
    col.width = maxW
    col.minWidth = Math.min(col.minWidth || 64, maxW)
  }
  if (typeof $grid.setColumnWidth === 'function') {
    await $grid.setColumnWidth(field, maxW)
  } else {
    syncFromWindow()
    if ($grid.loadColumn) await $grid.loadColumn(columns.value)
  }
  await nextTick()
  if ($grid.recalculate) await $grid.recalculate()
  if (typeof g().tcTableRecordAfterMutation === 'function') g().tcTableRecordAfterMutation()
  if (currentAreaScope) await reapplyAreaSelectionIfNeeded()
  return true
}

async function autoFitAllColumnWidths() {
  const cols = g().tableColumns || []
  for (let idx = 0; idx < cols.length; idx += 1) {
    await autoFitColumnWidth(idx)
  }
  return true
}

function resolveColumnIndexFromHeaderTarget(event) {
  const target = event && event.target
  if (!target || !target.closest) return -1
  const headerCol = target.closest('.vxe-header--column:not(.col--seq)')
  if (!headerCol) return -1
  const field = resolveFieldFromColumnEl(headerCol)
  if (field && field[0] === 'c') {
    const idx = parseInt(String(field).slice(1), 10)
    if (!Number.isNaN(idx) && idx >= 0) return idx
  }
  const $grid = gridRef.value
  const dataCols = getVisibleDataColumns($grid)
  const mount = document.getElementById('tc-vxe-table-mount')
  const headerCols = mount ? [...mount.querySelectorAll('.vxe-header--column:not(.col--seq)')] : []
  const visibleIdx = headerCols.indexOf(headerCol)
  if (visibleIdx < 0) return -1
  const col = dataCols[visibleIdx]
  if (col && col.field && col.field[0] === 'c') {
    const logicalIdx = parseInt(String(col.field).slice(1), 10)
    if (!Number.isNaN(logicalIdx) && logicalIdx >= 0) return logicalIdx
  }
  return visibleIdx
}


function getRowRecordForMeasure(row) {
  if (!row) return null
  const $grid = gridRef.value
  if ($grid && typeof $grid.getTableData === 'function') {
    const table = $grid.getTableData()
    const full = table && table.fullData
    if (full && full.length) {
      const found = full.find((r) => r && r._rowId === row._rowId)
      if (found) return found
    }
  }
  return row
}

function getCellTextForRowMeasure(row, colIdx) {
  const rec = getRowRecordForMeasure(row)
  const field = 'c' + colIdx
  if (rec && rec[field] != null) return rec[field]
  const rowIndex = rec && rec._rowIndex != null ? rec._rowIndex : (row && row._rowIndex)
  const dataRow = rowIndex != null && g().testCasesData ? g().testCasesData[rowIndex] : null
  if (dataRow && dataRow[colIdx] != null) return dataRow[colIdx]
  return ''
}

function getColumnWidthForRowMeasure(colIdx, rowEl, visibleCols, colEls) {
  const stored = (g().columnWidth || {})[colIdx]
  if (rowEl && visibleCols && colEls) {
    const visIdx = visibleCols.findIndex((col) => col && col.field === 'c' + colIdx)
    if (visIdx >= 0 && colEls[visIdx]) {
      const domW = colEls[visIdx].clientWidth
      if (domW && domW > 0) return domW
    }
  }
  if (stored && stored > 0) return stored
  const colDef = columns.value.find((c) => c.field === 'c' + colIdx)
  if (colDef && colDef.width) return colDef.width
  return 150
}

function computeRowContentFitHeight(row) {
  const $grid = gridRef.value
  if (!row) return getDefaultRowHeight()
  const cols = g().tableColumns || []
  const colVisible = g().columnVisible || {}
  const mount = document.getElementById('tc-vxe-table-mount')
  const rowEl = mount && mount.querySelector(`.vxe-body--row[rowid="${row._rowId}"]`)
  const visibleCols = $grid ? getVisibleDataColumns($grid) : []
  const colEls = rowEl ? [...rowEl.querySelectorAll('.vxe-body--column:not(.col--seq)')] : []
  const styleSample = rowEl && rowEl.querySelector('.vxe-body--column:not(.col--seq) .vxe-cell')
  let maxH = getDefaultRowHeight()
  cols.forEach((_, idx) => {
    if (colVisible[idx] === false) return
    const width = getColumnWidthForRowMeasure(idx, rowEl, visibleCols, colEls)
    const val = getCellTextForRowMeasure(row, idx)
    maxH = Math.max(maxH, measureCellContentHeight(val, width, styleSample))
  })
  return maxH
}

function scheduleAutoFitRowHeight(row, opts = {}) {
  if (!row || !row._rowId) return
  pendingAutoFitRowId = row._rowId
  const recordIfHeightChanged = opts.skipMutation === true
  if (autoFitRowRaf) return
  autoFitRowRaf = requestAnimationFrame(() => {
    autoFitRowRaf = 0
    const rid = pendingAutoFitRowId
    pendingAutoFitRowId = null
    if (!rid) return
    const target = tableData.value.find((r) => r._rowId === rid)
    if (!target) return
    void (async () => {
      const prevH = (g().rowHeights || {})[target._rowIndex]
      await autoFitRowHeight(target, { skipMutation: true })
      if (recordIfHeightChanged && typeof g().tcTableRecordAfterMutation === 'function') {
        const nextH = (g().rowHeights || {})[target._rowIndex]
        const defaultH = getDefaultRowHeight()
        const prevEffective = prevH != null ? prevH : defaultH
        const nextEffective = nextH != null ? nextH : defaultH
        if (prevEffective !== nextEffective) g().tcTableRecordAfterMutation()
      }
    })()
  })
}

async function autoFitRowHeight(row, opts = {}) {
  const $grid = gridRef.value
  if (!$grid || !row) return false
  flushActiveEditValueSync($grid)
  const maxH = computeRowContentFitHeight(row)
  const defaultH = getDefaultRowHeight()
  const next = Object.assign({}, g().rowHeights || {})
  if (maxH === defaultH) delete next[row._rowIndex]
  else next[row._rowIndex] = maxH
  g().rowHeights = next
  const conf = Object.assign({}, ($grid.getRowHeightConf && $grid.getRowHeightConf(true)) || {})
  conf[row._rowId] = maxH
  if ($grid.setRowHeightConf) await $grid.setRowHeightConf(conf)
  await nextTick()
  if ($grid.recalculate) await $grid.recalculate()
  if (!opts.skipMutation && typeof g().tcTableRecordAfterMutation === 'function') g().tcTableRecordAfterMutation()
  if (currentAreaScope) await reapplyAreaSelectionIfNeeded()
  return true
}

async function onShellRowResizeDblclick(event) {
  if (!isRowResizeOrBodyGapTarget(event)) return false
  event.preventDefault()
  event.stopPropagation()
  await nextTick()
  // 全选后双击行缝（含表格中间区域）：批量按内容自适应行高（WPS 风格）
  if (isAllCellsAreaSelected()) {
    await autoFitAllRowHeights()
    if (currentAreaScope) await reapplyAreaSelectionIfNeeded()
    return true
  }
  const row = resolveRowFromResizeOrGapTarget(event)
  if (!row) return false
  await autoFitRowHeight(row)
  return true
}

async function onShellHeaderColResizeDblclick(event) {
  if (!isColumnResizeTarget(event)) return false
  event.preventDefault()
  event.stopPropagation()
  await nextTick()
  if (customCellAreaActive && currentAreaScope?.kind === 'all') {
    await autoFitAllColumnWidths()
    return true
  }
  const colIdx = resolveColumnIndexFromHeaderTarget(event)
  if (colIdx < 0) return false
  await autoFitColumnWidth(colIdx)
  return true
}

function resolveCellFromDom(event) {
  const target = event && event.target
  if (!target) return null
  const colEl = target.closest ? target.closest('.vxe-body--column') : null
  if (!colEl || colEl.classList.contains('col--seq')) return null
  const rowEl = colEl.closest('.vxe-body--row')
  if (!rowEl) return null
  const rowid = rowEl.getAttribute('rowid')
  let row = rowid ? tableData.value.find((r) => r._rowId === rowid) : null
  if (!row) {
    const $grid = gridRef.value
    if ($grid && typeof $grid.getRowNode === 'function') {
      const rowNode = $grid.getRowNode(colEl)
      const nr = rowNode && (rowNode.item || rowNode.row)
      if (nr) row = resolveRowRecord(nr)
    }
  }
  if (!row) return null
  const field = resolveFieldFromColumnEl(colEl)
  if (!field || field[0] !== 'c') return null
  const column = columns.value.find((c) => c.field === field)
  if (!column || column.type === 'seq' || !column.field) return null
  return { row, column }
}

async function handleCellDblclick(row, column) {
  cancelDeferredClose()
  suppressClickCloseUntil = Date.now() + 500
  await openCellEdit(row, column)
}

function isSameEditCell(active, row, column) {
  if (!active || !active.row || !active.column || !column || !column.field) return false
  const activeRowId = active.row._rowId
  const rowId = row && row._rowId
  return activeRowId === rowId && active.column.field === column.field
}

function hasDomEditOnCell(row, column) {
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount || !row || !column || !column.field) return false
  const activeCol = mount.querySelector('.vxe-body--column.col--active')
  if (!activeCol) return false
  const rowEl = activeCol.closest('.vxe-body--row')
  if (!rowEl || rowEl.getAttribute('rowid') !== row._rowId) return false
  return resolveFieldFromColumnEl(activeCol) === column.field
}

function isEditingCell(row, column) {
  const $grid = gridRef.value
  const active = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  return isSameEditCell(active, row, column) && hasDomEditOnCell(row, column)
}

function resolveRowRecord(row) {
  if (!row || row._rowIndex == null) return row
  return tableData.value.find((r) => r._rowIndex === row._rowIndex) || row
}

function cancelDeferredClose() {
  if (pendingClickCloseTimer) {
    clearTimeout(pendingClickCloseTimer)
    pendingClickCloseTimer = null
  }
}

async function waitEditIdle() {
  await nextTick()
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

async function closeActiveEdit($grid, opts = {}) {
  if (!$grid) return
  cancelDeferredClose()
  if (typeof $grid.clearEdit === 'function') {
    await $grid.clearEdit()
  } else if (typeof $grid.clearActived === 'function') {
    $grid.clearActived()
  }
  if (opts.fast === true) {
    await nextTick()
  } else {
    await waitEditIdle()
  }
  if (!isSwitchingEditCell) ensureTableShellFocus()
}

function focusEditInput() {
  nextTick(() => {
    const mount = document.getElementById('tc-vxe-table-mount')
    if (!mount) return
    const input = mount.querySelector('.vxe-cell--edit textarea, .vxe-cell--edit input, .vxe-default-textarea, .vxe-textarea--inner')
    if (input && typeof input.focus === 'function') input.focus()
  })
}

async function openCellEdit(row, column, opts = {}) {
  const op = editOpChain.then(() => openCellEditCore(row, column, opts))
  editOpChain = op.catch(() => {})
  return op
}


async function appendActiveEditValue(text) {
  if (text == null || text === '') return false
  await nextTick()
  const mount = document.getElementById('tc-vxe-table-mount')
  const input = mount && mount.querySelector('.vxe-body--column.col--active textarea, .vxe-body--column.col--active .vxe-textarea--inner, .vxe-body--column.col--active input, .vxe-cell--edit textarea, .vxe-cell--edit input, .vxe-textarea--inner')
  if (!input) return false
  input.value = String(input.value || '') + String(text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  if (typeof input.focus === 'function') input.focus()
  const len = input.value.length
  if (typeof input.setSelectionRange === 'function') input.setSelectionRange(len, len)
  return true
}

async function setActiveEditValue(value) {
  await nextTick()
  await waitEditIdle()
  const mount = document.getElementById('tc-vxe-table-mount')
  const input = mount && mount.querySelector('.vxe-body--column.col--active textarea, .vxe-body--column.col--active .vxe-textarea--inner, .vxe-body--column.col--active input')
  if (!input) return false
  input.value = value == null ? '' : String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  if (typeof input.focus === 'function') input.focus()
  const len = input.value.length
  if (typeof input.setSelectionRange === 'function') input.setSelectionRange(len, len)
  return true
}

function isActiveGridEditVisible() {
  const $grid = gridRef.value
  const activeEdit = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (!activeEdit || !activeEdit.row || !activeEdit.column) return false
  return hasDomEditOnCell(activeEdit.row, activeEdit.column)
}

async function beginEditFromInput(initialValue) {
  if (!focusedCell) return false
  const $grid = gridRef.value
  if ($grid && typeof $grid.getEditCell === 'function') {
    const activeEdit = $grid.getEditCell()
    if (activeEdit && activeEdit.row && activeEdit.column) {
      if (initialValue !== undefined && initialValue !== '') {
        await appendActiveEditValue(initialValue)
      }
      return true
    }
  }
  if (cellEditOpening || isSwitchingEditCell) {
    if (initialValue !== undefined && initialValue !== '') {
      await appendActiveEditValue(initialValue)
    }
    return false
  }
  cellEditOpening = true
  try {
    if ($grid && isActiveGridEditVisible()) {
      await closeActiveEdit($grid)
      await waitEditIdle()
    }
    const row = tableData.value.find((r) => r._rowIndex === focusedCell.rowIndex)
    const column = columns.value.find((c) => c.field === focusedCell.field)
    if (!row || !column) return false
    if (initialValue === undefined) return openCellEdit(row, column)
    return openCellEdit(row, column, { initialValue })
  } finally {
    cellEditOpening = false
  }
}

function shouldHandleCellTypeInput() {
  if (isSwitchingEditCell || cellEditOpening) return false
  if (!focusedCell) return false
  const $grid = gridRef.value
  if ($grid && typeof $grid.getEditCell === 'function') {
    const activeEdit = $grid.getEditCell()
    if (activeEdit && activeEdit.row && activeEdit.column) return false
  }
  if (isActiveGridEditVisible()) return false
  const active = document.activeElement
  if (active && active.closest) {
    if (active.closest('#edit-modal, #left-panel, .tc-app-dialog, .tc-provenance-panel')) return false
    if (active.closest('.vxe-cell--edit')) return false
    if (active.closest('input, textarea, select, [contenteditable="true"]') && !active.closest('#tc-vxe-table-mount')) return false
  }
  const mount = document.getElementById('tc-vxe-table-mount')
  return !!(mount && mount.querySelector('.vxe-table'))
}


function shouldHandleCellNavigateKey(e, key) {
  if (!e || e.key !== key) return false
  if (e.ctrlKey || e.metaKey || e.altKey) return false
  if (isSwitchingEditCell || cellEditOpening || cellImeComposing) return false
  const active = document.activeElement
  if (active && active.closest) {
    if (active.closest('#edit-modal, #left-panel, .tc-app-dialog, .tc-provenance-panel')) return false
    if (active.closest('input, textarea, select, [contenteditable="true"]') && !active.closest('#tc-vxe-table-mount')) return false
  }
  const mount = document.getElementById('tc-vxe-table-mount')
  if (!mount || !mount.querySelector('.vxe-table')) return false
  const $grid = gridRef.value
  const activeEdit = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (activeEdit && activeEdit.row && activeEdit.column) return true
  return !!focusedCell
}

function shouldHandleCellTabNavigateKey(e) {
  return shouldHandleCellNavigateKey(e, 'Tab')
}

function shouldHandleCellEnterNavigateKey(e) {
  return shouldHandleCellNavigateKey(e, 'Enter')
}

function resolveAdjacentVisibleColIndex(currentColIndex, direction = 1) {
  const colCount = (g().tableColumns || []).length
  const colVisible = g().columnVisible || {}
  if (currentColIndex < 0 || colCount <= 0) return -1
  let idx = currentColIndex + direction
  while (idx >= 0 && idx < colCount) {
    if (colVisible[idx] !== false) return idx
    idx += direction
  }
  return -1
}

async function navigateFocusedCellInRow(direction = 1) {
  const $grid = gridRef.value
  if (!$grid) return false

  let rowIndex = -1
  let colIndex = -1
  const activeEdit = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (activeEdit && activeEdit.row && activeEdit.column && activeEdit.column.field) {
    rowIndex = activeEdit.row._rowIndex
    colIndex = parseInt(String(activeEdit.column.field).slice(1), 10)
  } else if (focusedCell) {
    rowIndex = focusedCell.rowIndex
    colIndex = focusedCell.colIndex
  } else {
    return false
  }

  if (rowIndex == null || rowIndex < 0 || Number.isNaN(colIndex) || colIndex < 0) return false

  const nextColIndex = resolveAdjacentVisibleColIndex(colIndex, direction)
  if (nextColIndex < 0) return false

  let targetRow = tableData.value.find((r) => r._rowIndex === rowIndex)
  if (!targetRow) return false
  targetRow = await materializeDisplayPadRow(targetRow)

  const nextColumn = findVisibleColumnDefByDataColIndex($grid, nextColIndex)
  if (!nextColumn) return false

  if (activeEdit) {
    cancelDeferredClose()
    primeCellFocus(targetRow, nextColumn)
    applyCustomSingleCellSelection(targetRow, nextColIndex)
    cellSwitchOptimisticSelect = true
    await closeActiveEdit($grid, { fast: true })
    cellSwitchOptimisticSelect = false
  } else {
    await selectSingleCell(targetRow, nextColumn)
  }

  ensureTableShellFocus()
  return true
}

function resolveAdjacentDataRowRecord(currentRowIndex, direction = 1) {
  if (currentRowIndex == null || currentRowIndex < 0) return null
  const prod = g().TcTableProductivity
  let maxRow = (g().testCasesData || []).length - 1
  tableData.value.forEach((row) => {
    if (row && row._rowIndex != null && row._rowIndex > maxRow) maxRow = row._rowIndex
  })
  let idx = currentRowIndex + direction
  while (idx >= 0 && idx <= maxRow) {
    if (prod && typeof prod.isRowVisibleInFilter === 'function' && !prod.isRowVisibleInFilter(idx)) {
      idx += direction
      continue
    }
    const row = tableData.value.find((r) => r._rowIndex === idx)
    if (row) return row
    idx += direction
  }
  return null
}

async function navigateFocusedCellInColumn(direction = 1) {
  const $grid = gridRef.value
  if (!$grid) return false

  let rowIndex = -1
  let colIndex = -1
  const activeEdit = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (activeEdit && activeEdit.row && activeEdit.column && activeEdit.column.field) {
    rowIndex = activeEdit.row._rowIndex
    colIndex = parseInt(String(activeEdit.column.field).slice(1), 10)
  } else if (focusedCell) {
    rowIndex = focusedCell.rowIndex
    colIndex = focusedCell.colIndex
  } else {
    return false
  }

  if (rowIndex == null || rowIndex < 0 || Number.isNaN(colIndex) || colIndex < 0) return false

  const nextRow = resolveAdjacentDataRowRecord(rowIndex, direction)
  if (!nextRow) return false

  let targetRow = await materializeDisplayPadRow(nextRow)
  const nextColumn = findVisibleColumnDefByDataColIndex($grid, colIndex)
  if (!nextColumn) return false

  if (activeEdit) {
    cancelDeferredClose()
    primeCellFocus(targetRow, nextColumn)
    applyCustomSingleCellSelection(targetRow, colIndex)
    cellSwitchOptimisticSelect = true
    await closeActiveEdit($grid, { fast: true })
    cellSwitchOptimisticSelect = false
  } else {
    await selectSingleCell(targetRow, nextColumn)
  }

  void scrollToRowIndex(targetRow._rowIndex)
  ensureTableShellFocus()
  return true
}

function onCellRowNavigateKeydown(e) {
  const direction = e.shiftKey ? -1 : 1
  if (e.key === 'Tab') {
    if (!shouldHandleCellTabNavigateKey(e)) return
    e.preventDefault()
    e.stopPropagation()
    void navigateFocusedCellInRow(direction)
    return
  }
  if (e.key === 'Enter') {
    if (!shouldHandleCellEnterNavigateKey(e)) return
    e.preventDefault()
    e.stopPropagation()
    void navigateFocusedCellInColumn(direction)
  }
}

function onCellTypeKeydown(e) {
  if (!shouldHandleCellTypeInput()) return
  if (cellImeComposing) return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === 'Escape') {
    e.preventDefault()
    void clearAreaSelection(gridRef.value)
    return
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault()
    void beginEditFromInput('')
    return
  }
  if (e.key.length === 1) {
    e.preventDefault()
    void beginEditFromInput(e.key)
  }
}

function onCellTypePaste(e) {
  if (!shouldHandleCellTypeInput()) return
  const text = (e.clipboardData && e.clipboardData.getData('text')) || ''
  if (text === '') return
  e.preventDefault()
  void beginEditFromInput(text)
}

function onCellCompositionStart() {
  if (shouldHandleCellTypeInput()) cellImeComposing = true
}

function onCellCompositionEnd(e) {
  if (!cellImeComposing) return
  cellImeComposing = false
  const $grid = gridRef.value
  const activeEdit = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (activeEdit || !focusedCell) return
  if (e.data) {
    e.preventDefault()
    void beginEditFromInput(e.data)
  }
}

function bindCellKeyboardInput() {
  if (cellKeyboardBound) return
  cellKeyboardBound = true
  document.addEventListener('keydown', onCellRowNavigateKeydown, true)
  document.addEventListener('keydown', onCellTypeKeydown, true)
  document.addEventListener('paste', onCellTypePaste, true)
  document.addEventListener('compositionstart', onCellCompositionStart, true)
  document.addEventListener('compositionend', onCellCompositionEnd, true)
}

function unbindCellKeyboardInput() {
  if (!cellKeyboardBound) return
  cellKeyboardBound = false
  document.removeEventListener('keydown', onCellRowNavigateKeydown, true)
  document.removeEventListener('keydown', onCellTypeKeydown, true)
  document.removeEventListener('paste', onCellTypePaste, true)
  document.removeEventListener('compositionstart', onCellCompositionStart, true)
  document.removeEventListener('compositionend', onCellCompositionEnd, true)
}

async function openCellEditCore(row, column, opts = {}) {
  if (!column || column.type === 'seq' || !column.field || !row) return false
  const $grid = gridRef.value
  if (!$grid || typeof $grid.setEditCell !== 'function') return false
  cancelDeferredClose()
  const active = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (isEditingCell(row, column)) {
    focusEditInput()
    if (opts.initialValue !== undefined) await appendActiveEditValue(opts.initialValue)
    return true
  }
  let targetRow = resolveRowRecord(row)
  targetRow = await materializeDisplayPadRow(targetRow)
  const field = column.field
  const tryOpen = async () => {
    const liveRow = resolveRowRecord(targetRow)
    if ($grid.setSelectCell) await $grid.setSelectCell(liveRow, field)
    await $grid.setEditCell(liveRow, field)
    await waitEditIdle()
    const nowActive = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
    return isSameEditCell(nowActive, liveRow, column)
  }
  isSwitchingEditCell = true
  try {
    const sameRow = active && active.row && active.row._rowId === targetRow._rowId
    if (sameRow && await tryOpen()) {
      focusEditInput()
      const colIdx = parseInt(field.slice(1), 10)
      if (!Number.isNaN(colIdx)) {
        focusedCell = { rowIndex: targetRow._rowIndex, colIndex: colIdx, rowId: targetRow._rowId, field }
        syncFocusedCellGlobal(targetRow._rowIndex, colIdx)
      }
      if (opts.initialValue !== undefined) await setActiveEditValue(opts.initialValue)
      return true
    }
    if (active) {
      await closeActiveEdit($grid)
      await waitEditIdle()
    }
    if (await tryOpen()) {
      focusEditInput()
      const colIdx = parseInt(field.slice(1), 10)
      if (!Number.isNaN(colIdx)) {
        focusedCell = { rowIndex: targetRow._rowIndex, colIndex: colIdx, rowId: targetRow._rowId, field }
        syncFocusedCellGlobal(targetRow._rowIndex, colIdx)
      }
      if (opts.initialValue !== undefined) await setActiveEditValue(opts.initialValue)
      return true
    }
    await closeActiveEdit($grid)
    await waitEditIdle()
    if (await tryOpen()) {
      focusEditInput()
      const colIdx = parseInt(field.slice(1), 10)
      if (!Number.isNaN(colIdx)) {
        focusedCell = { rowIndex: targetRow._rowIndex, colIndex: colIdx, rowId: targetRow._rowId, field }
        syncFocusedCellGlobal(targetRow._rowIndex, colIdx)
      }
      if (opts.initialValue !== undefined) await setActiveEditValue(opts.initialValue)
      return true
    }
    return false
  } catch (e) {
    return false
  } finally {
    await nextTick()
    await waitEditIdle()
    isSwitchingEditCell = false
  }
}

async function onShellMousedown(event) {
  if (isRowResizeTarget(event)) return
  if (event.button !== 0 || event.detail !== 2) return
  const $grid = gridRef.value
  if (!$grid || typeof $grid.getEditCell !== 'function') return
  const active = $grid.getEditCell()
  if (!active) return
  const resolved = resolveCellFromDom(event)
  if (!resolved || isSameEditCell(active, resolved.row, resolved.column)) return
  event.preventDefault()
  event.stopPropagation()
  shellEditSwitchHandled = true
  lastShellDblclickAt = Date.now()
  await handleCellDblclick(resolved.row, resolved.column)
}

async function onShellDblclick(event) {
  if (await onShellRowResizeDblclick(event)) return
  if (await onShellHeaderColResizeDblclick(event)) return
  if (shellEditSwitchHandled) {
    shellEditSwitchHandled = false
    return
  }
  const resolved = resolveCellFromDom(event)
  if (!resolved) return
  event.preventDefault()
  event.stopPropagation()
  lastShellDblclickAt = Date.now()
  await handleCellDblclick(resolved.row, resolved.column)
}

async function onCellClick({ row, column, $event }) {
  if (Date.now() < suppressCellClickUntil) return
  if (column && column.type === 'seq') {
    if ($event && isSeqRowSelectBlockedTarget($event)) return
    if (Date.now() < suppressRowClickUntil) return
    if (rowSelectPointerAt && Date.now() - rowSelectPointerAt < 400) {
      rowSelectPointerAt = 0
      return
    }
    const $grid = gridRef.value
    const active = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
    if (active) await closeActiveEdit($grid)
    await selectRowArea(row)
    return
  }
  if (!column || !column.field) return
  if (isSwitchingEditCell) return
  const $grid = gridRef.value
  if (!$grid) return
  const recentDblclick = Date.now() < suppressClickCloseUntil
  const active = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return

  if (active && !isSameEditCell(active, row, column)) {
    cancelDeferredClose()
    primeCellFocus(row, column)
    applyCustomSingleCellSelection(row, colIdx)
    cellSwitchOptimisticSelect = true
    await closeActiveEdit($grid, { fast: true })
    cellSwitchOptimisticSelect = false
    ensureTableShellFocus()
    return
  }

  primeCellFocus(row, column)
  if (active && isSameEditCell(active, row, column) && recentDblclick) {
    return
  }
  if (isEditingCell(row, column)) return
  const sameFocus = focusedCell && focusedCell.rowIndex === row._rowIndex && focusedCell.colIndex === colIdx
  if (!sameFocus) {
    await selectSingleCell(row, column)
  } else {
    applyCustomSingleCellSelection(row, colIdx)
  }
  ensureTableShellFocus()
}

async function onCellDblclick({ row, column }) {
  if (Date.now() - lastShellDblclickAt < 120) return
  await handleCellDblclick(row, column)
}

async function onHeaderCellClick({ column, $event }) {
  if (!column) return
  if (column.type === 'seq') {
    if ($event && $event.target && $event.target.closest && $event.target.closest('.tc-vxe-select-all-corner-btn')) return
    if ($event && isColumnResizeTarget($event)) return
    await selectAllCells()
    return
  }
  if (!column.field) return
  if ($event && isColumnResizeTarget($event)) return
  const $grid = gridRef.value
  const active = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
  if (active) await closeActiveEdit($grid)
  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return
  await selectColumnArea(colIdx)
}

const MULTI_ROW_HIDDEN_MENU_CODES = new Set([
  'TC_CELL_CLEAR',
  'TC_COL_CLEAR',
  'TC_ROW_INSERT_ABOVE',
  'TC_ROW_INSERT_BELOW',
  'TC_COL_INSERT_LEFT',
  'TC_COL_INSERT_RIGHT',
  'TC_COL_HIDE',
])

function getContextMenuMultiRowState(row) {
  if (isAllCellsAreaSelected()) {
    const count = (menuTargetRowIndexesSnapshot && menuTargetRowIndexesSnapshot.length)
      || getAllTableRowIndexes().length
    return { selectedRowCount: count, multiRow: count > 1 }
  }
  const liveSelected = getCurrentSelectedRowIndexes()
  const snapshot = menuTargetRowIndexesSnapshot
  const selectedRowCount = liveSelected.length > 1
    ? liveSelected.length
    : (snapshot && snapshot.length > 1 ? snapshot.length : liveSelected.length)
  return { selectedRowCount, multiRow: selectedRowCount > 1 }
}

function applyContextMenuItemState(item, { type, column, colCount, multiRow, selectedRowCount }) {
  const code = item.code || ''
  if (multiRow && MULTI_ROW_HIDDEN_MENU_CODES.has(code)) {
    if (!(code === 'TC_CELL_CLEAR' && currentAreaScope && currentAreaScope.kind === 'cellRange')) {
      item.visible = false
      item.disabled = false
      return
    }
  }
  const isDataColumn = !!(column && column.field && String(column.field).startsWith('c'))
  const hideColOps = type === 'body' && !isDataColumn
  if (code === 'TC_CELL_CLEAR') {
    item.visible = type === 'body' && isDataColumn
  } else if (code.startsWith('TC_COL_')) {
    item.visible = !hideColOps
    item.disabled = code === 'TC_COL_DELETE' && colCount <= 1
  } else {
    item.visible = true
    item.disabled = false
  }
  if (multiRow && code === 'TC_ROW_CLEAR') item.name = `清空 ${selectedRowCount} 行内容`
  if (multiRow && code === 'TC_ROW_DELETE') item.name = `删除 ${selectedRowCount} 行`
}

const menuConfig = {
  enabled: true,
  transfer: true,
  destroyOnClose: true,
  className: 'tc-vxe-context-menu',
  header: {
    options: [
      [
        { code: 'TC_COL_CLEAR', name: '清空列内容', prefixIcon: 'vxe-icon-ellipsis-h' },
        { code: 'TC_COL_HIDE', name: '隐藏列', prefixIcon: 'vxe-icon-eye-fill-close' },
      ],
      [
        { code: 'TC_COL_INSERT_LEFT', name: '在左侧插入列', prefixIcon: 'vxe-icon-arrow-left' },
        { code: 'TC_COL_INSERT_RIGHT', name: '在右侧插入列', prefixIcon: 'vxe-icon-arrow-right' },
      ],
      [
        { code: 'TC_COL_DELETE', name: '删除列', prefixIcon: 'vxe-icon-delete', className: 'tc-vxe-menu-danger' },
      ],
    ],
  },
  body: {
    options: [
      [
        { code: 'TC_CELL_CLEAR', name: '清空单元格', prefixIcon: 'vxe-icon-close' },
      ],
      [
        { code: 'TC_ROW_CLEAR', name: '清空行内容', prefixIcon: 'vxe-icon-ellipsis-h' },
        { code: 'TC_COL_CLEAR', name: '清空列内容', prefixIcon: 'vxe-icon-ellipsis-v' },
      ],
      [
        { code: 'TC_ROW_INSERT_ABOVE', name: '在上方插入行', prefixIcon: 'vxe-icon-arrow-up' },
        { code: 'TC_ROW_INSERT_BELOW', name: '在下方插入行', prefixIcon: 'vxe-icon-arrow-down' },
      ],
      [
        { code: 'TC_COL_INSERT_LEFT', name: '在左侧插入列', prefixIcon: 'vxe-icon-arrow-left' },
        { code: 'TC_COL_INSERT_RIGHT', name: '在右侧插入列', prefixIcon: 'vxe-icon-arrow-right' },
      ],
      [
        { code: 'TC_COL_HIDE', name: '隐藏列', prefixIcon: 'vxe-icon-eye-fill-close' },
      ],
      [
        { code: 'TC_ROW_DELETE', name: '删除行', prefixIcon: 'vxe-icon-delete', className: 'tc-vxe-menu-danger' },
        { code: 'TC_COL_DELETE', name: '删除列', prefixIcon: 'vxe-icon-delete', className: 'tc-vxe-menu-danger' },
      ],
    ],
  },
  visibleMethod({ type, column, options, row }) {
    if (type === 'header' && column && column.type === 'seq') return false
    captureMenuTargetRowIndexes(row)
    const colCount = (g().tableColumns || []).length
    const { selectedRowCount, multiRow } = getContextMenuMultiRowState(row)
    const menuType = isAllCellsAreaSelected() ? 'body' : type
    options.forEach((group) => {
      group.forEach((item) => {
        applyContextMenuItemState(item, { type: menuType, column, colCount, multiRow, selectedRowCount })
      })
    })
    if (isAllCellsAreaSelected()) {
      applyCustomCellAreaSelection()
    }
    return true
  },
}

function resolveDataColIndex(column) {
  if (!column || !column.field || column.field[0] !== 'c') return -1
  const idx = parseInt(String(column.field).slice(1), 10)
  return Number.isNaN(idx) ? -1 : idx
}

function resolveRowIndex(row) {
  if (!row || row._rowIndex == null) return -1
  return row._rowIndex
}

function shiftRowMetaAfterInsert(insertAt) {
  const marked = g().markedRows
  if (marked instanceof Set) {
    const next = new Set()
    marked.forEach((i) => next.add(i >= insertAt ? i + 1 : i))
    g().markedRows = next
  }
  const selected = g().selectedRows
  if (selected instanceof Set) {
    const next = new Set()
    selected.forEach((i) => next.add(i >= insertAt ? i + 1 : i))
    g().selectedRows = next
  }
  const rh = g().rowHeights || {}
  const nextRh = {}
  Object.keys(rh).forEach((k) => {
    const i = parseInt(k, 10)
    if (Number.isNaN(i)) return
    nextRh[i >= insertAt ? i + 1 : i] = rh[k]
  })
  g().rowHeights = nextRh
}

function remapIndexMap(obj, deletedIndex) {
  const next = {}
  Object.keys(obj || {}).forEach((k) => {
    const i = parseInt(k, 10)
    if (Number.isNaN(i)) return
    if (i < deletedIndex) next[i] = obj[k]
    else if (i > deletedIndex) next[i - 1] = obj[k]
  })
  return next
}

function remapIndexMapAfterInsert(obj, insertAt) {
  const next = {}
  Object.keys(obj || {}).forEach((k) => {
    const i = parseInt(k, 10)
    if (Number.isNaN(i)) return
    next[i >= insertAt ? i + 1 : i] = obj[k]
  })
  return next
}


function captureGridScrollSnapshot($grid) {
  if (!$grid || typeof $grid.getScroll !== 'function') return null
  try {
    const s = $grid.getScroll()
    if (!s) return null
    return { scrollLeft: s.scrollLeft || 0, scrollTop: s.scrollTop || 0 }
  } catch (e) {
    return null
  }
}

async function restoreGridScrollSnapshot($grid, snap) {
  if (!$grid || !snap) return
  await nextTick()
  try {
    if (typeof $grid.scrollTo === 'function') {
      await $grid.scrollTo(snap.scrollLeft, snap.scrollTop)
    }
  } catch (e) {
    /* ignore */
  }
}

async function commitTableMutation(opts = {}) {
  syncFromWindow({ rebuildColumns: opts.rebuildColumns })
  await applyData({
    reload: opts.reload !== false,
    preserveScroll: opts.preserveScroll === true,
    syncColumnVisibility: opts.syncColumnVisibility === true,
  })
  if (typeof g().tcTableRecordAfterMutation === 'function') g().tcTableRecordAfterMutation()
  syncProvenanceImmediateForMode()
  if (typeof g().syncTcTableTemplateChrome === 'function') g().syncTcTableTemplateChrome()
  if (opts.clearSelection !== false) await clearAreaSelection(gridRef.value)
}

/** 单元格/行/列内容变更：轻量同步，保持滚动位置 */
async function commitGridContentMutation() {
  await commitTableMutation({ reload: false, preserveScroll: true, clearSelection: false, rebuildColumns: false })
}

/** 行增删类变更：轻量刷新并保持滚动位置 */
async function commitRowStructureMutation() {
  await commitTableMutation({ reload: false, preserveScroll: true, clearSelection: false, rebuildColumns: false })
}

/** 列增删/隐藏类变更：重建列配置并保持滚动位置 */
async function commitColumnStructureMutation() {
  await commitTableMutation({
    reload: false,
    preserveScroll: true,
    clearSelection: false,
    rebuildColumns: true,
    syncColumnVisibility: true,
  })
}

function clearCellContentAt(rowIndex, colIndex) {
  const cols = g().tableColumns || []
  if (!cols.length || rowIndex < 0 || colIndex < 0 || colIndex >= cols.length) return false
  if (typeof g().ensureTcTableRowMaterialized === 'function') g().ensureTcTableRowMaterialized(rowIndex)
  const row = g().testCasesData[rowIndex]
  if (!row) return false
  row[colIndex] = ''
  return true
}

function clearRowContentAt(rowIndex) {
  const cols = g().tableColumns || []
  if (!cols.length || rowIndex < 0) return false
  if (typeof g().ensureTcTableRowMaterialized === 'function') g().ensureTcTableRowMaterialized(rowIndex)
  const row = g().testCasesData[rowIndex]
  if (!row) return false
  for (let i = 0; i < cols.length; i += 1) row[i] = ''
  return true
}

function clearColumnContentAt(colIndex) {
  const cols = g().tableColumns || []
  if (colIndex < 0 || colIndex >= cols.length) return false
  ;(g().testCasesData || []).forEach((row) => {
    if (row && row[colIndex] != null) row[colIndex] = ''
  })
  return true
}

function insertRowAt(rowIndex, position) {
  const cols = g().tableColumns || []
  if (!cols.length || rowIndex < 0) return false
  const rows = g().testCasesData || []
  let insertAt = position === 'below' ? rowIndex + 1 : rowIndex
  if (insertAt < 0) insertAt = 0
  if (insertAt > rows.length) insertAt = rows.length
  const emptyRow = cols.map(() => '')
  const store = g().TcWorkbenchStore && g().TcWorkbenchStore.table
  if (store && typeof store.insertRowAt === 'function') {
    const ok = store.insertRowAt(insertAt, emptyRow, {
      source: 'grid-insert-row',
      recordUndo: false,
      render: false,
    })
    if (ok) return true
  }
  if (!Array.isArray(g().testCasesData)) g().testCasesData = []
  g().testCasesData.splice(insertAt, 0, emptyRow)
  if (Array.isArray(g().testCasesProvenance)) g().testCasesProvenance.splice(insertAt, 0, null)
  shiftRowMetaAfterInsert(insertAt)
  return true
}

function insertColumnAt(colIndex, side) {
  const cols = g().tableColumns || []
  if (!cols.length || colIndex < 0) return false
  const insertAt = side === 'right' ? colIndex + 1 : colIndex
  const newName = `新列${cols.length + 1}`
  cols.splice(insertAt, 0, newName)
  g().tableColumns = cols
  ;(g().testCasesData || []).forEach((row) => {
    if (Array.isArray(row)) row.splice(insertAt, 0, '')
  })
  const nextColumnVisible = remapIndexMapAfterInsert(g().columnVisible || {}, insertAt)
  nextColumnVisible[insertAt] = true
  g().columnVisible = nextColumnVisible
  g().columnWidth = remapIndexMapAfterInsert(g().columnWidth || {}, insertAt)
  if (typeof g().renderColumnHeaderTags === 'function') g().renderColumnHeaderTags()
  return true
}

async function deleteColumnAt(colIndex) {
  const cols = g().tableColumns || []
  if (colIndex < 0 || colIndex >= cols.length) return false
  if (cols.length <= 1) {
    if (typeof g().tcAppAlert === 'function') {
      g().tcAppAlert('表格至少需要保留一列，无法继续删除。', { variant: 'info', title: '无法删除' })
    }
    return false
  }
  const colName = cols[colIndex] || `第 ${colIndex + 1} 列`
  let ok = true
  if (typeof g().tcAppConfirm === 'function') {
    ok = await g().tcAppConfirm(`将删除列「${colName}」，且不可恢复。`, {
      title: '删除列？',
      variant: 'warning',
      confirmText: '删除',
      cancelText: '保留',
    })
  }
  if (!ok) return false
  cols.splice(colIndex, 1)
  g().tableColumns = cols
  ;(g().testCasesData || []).forEach((row) => {
    if (Array.isArray(row)) row.splice(colIndex, 1)
  })
  g().columnVisible = remapIndexMap(g().columnVisible || {}, colIndex)
  g().columnWidth = remapIndexMap(g().columnWidth || {}, colIndex)
  if (typeof g().renderColumnHeaderTags === 'function') g().renderColumnHeaderTags()
  if (typeof g().tcAppToast === 'function') {
    g().tcAppToast('已删除 1 列。', { variant: 'success', duration: 2200 })
  }
  return true
}

async function onCellMenu({ row, $event }) {
  if ($event && isRowResizeTarget($event)) {
    $event.preventDefault()
    return
  }
  if (row) await ensureRowContextSelection(row)
  captureMenuTargetRowIndexes(row)
}

async function onHeaderCellMenu({ column, $event }) {
  if ($event && isColumnResizeTarget($event)) {
    $event.preventDefault()
    return
  }
  if (isAllCellsAreaSelected()) {
    captureMenuTargetRowIndexes(null)
    await selectAllCells({ reapply: true })
    return
  }
  const colIdx = resolveDataColIndex(column)
  if (colIdx >= 0) await selectColumnArea(colIdx)
}

async function onMenuClick({ menu, row, column, type }) {
  const code = menu && menu.code
  if (!code) {
    clearMenuTargetRowIndexesSnapshot()
    return
  }
  try {
  await closeActiveEdit(gridRef.value)
  const rowIndex = resolveRowIndex(row)
  const colIndex = resolveDataColIndex(column)

  if (code === 'TC_CELL_CLEAR') {
    if (currentAreaScope && currentAreaScope.kind === 'cellRange') {
      let changed = 0
      for (let r = currentAreaScope.startRowIndex; r <= currentAreaScope.endRowIndex; r += 1) {
        for (let c = currentAreaScope.startColIndex; c <= currentAreaScope.endColIndex; c += 1) {
          if (clearCellContentAt(r, c)) changed += 1
        }
      }
      if (!changed) return
      await commitGridContentMutation()
      if (typeof g().tcAppToast === 'function') {
        g().tcAppToast(changed > 1 ? `已清空 ${changed} 个单元格。` : '已清空单元格。', { variant: 'success', duration: 2000 })
      }
      return
    }
    if (rowIndex < 0 || colIndex < 0) return
    if (!clearCellContentAt(rowIndex, colIndex)) return
    await commitGridContentMutation()
    if (typeof g().tcAppToast === 'function') {
      g().tcAppToast('已清空单元格。', { variant: 'success', duration: 2000 })
    }
    return
  }
  if (code === 'TC_ROW_CLEAR') {
    const indexes = getMenuTargetRowIndexes(row)
    if (!indexes.length) return
    let changed = false
    indexes.forEach((idx) => {
      if (clearRowContentAt(idx)) changed = true
    })
    if (!changed) return
    await commitGridContentMutation()
    if (typeof g().tcAppToast === 'function') {
      const msg = indexes.length > 1 ? `已清空 ${indexes.length} 行内容。` : '已清空该行内容。'
      g().tcAppToast(msg, { variant: 'success', duration: 2000 })
    }
    return
  }
  if (code === 'TC_ROW_INSERT_ABOVE') {
    if (rowIndex < 0) return
    if (!insertRowAt(rowIndex, 'above')) return
    await commitRowStructureMutation()
    return
  }
  if (code === 'TC_ROW_INSERT_BELOW') {
    if (rowIndex < 0) return
    if (!insertRowAt(rowIndex, 'below')) return
    await commitRowStructureMutation()
    return
  }
  if (code === 'TC_ROW_DELETE') {
    const indexes = getMenuTargetRowIndexes(row)
    if (!indexes.length) return
    if (indexes.length === 1 && typeof g().deleteRow === 'function') {
      g().deleteRow(indexes[0])
      await clearAreaSelection(gridRef.value)
      return
    }
    if (await deleteRowsAtIndexes(indexes)) {
      await commitRowStructureMutation()
    }
    return
  }
  if (code === 'TC_COL_CLEAR') {
    if (colIndex < 0) return
    if (!clearColumnContentAt(colIndex)) return
    await commitGridContentMutation()
    if (typeof g().tcAppToast === 'function') {
      g().tcAppToast('已清空该列内容。', { variant: 'success', duration: 2000 })
    }
    return
  }
  if (code === 'TC_COL_HIDE') {
    if (colIndex < 0) return
    if (typeof g().initColumnState === 'function') g().initColumnState()
    const cv = g().columnVisible
    if (!cv || cv[colIndex] === false) return
    cv[colIndex] = false
    if (typeof g().updateRestoreButton === 'function') g().updateRestoreButton()
    await commitColumnStructureMutation()
    return
  }
  if (code === 'TC_COL_INSERT_LEFT') {
    if (colIndex < 0) return
    insertColumnAt(colIndex, 'left')
    await commitColumnStructureMutation()
    return
  }
  if (code === 'TC_COL_INSERT_RIGHT') {
    if (colIndex < 0) return
    insertColumnAt(colIndex, 'right')
    await commitColumnStructureMutation()
    return
  }
  if (code === 'TC_COL_DELETE') {
    if (colIndex < 0) return
    if (await deleteColumnAt(colIndex)) await commitColumnStructureMutation()
  }
  } finally {
    clearMenuTargetRowIndexesSnapshot()
  }
}

function resolveContextMenuGroups(type, column) {
  if (type === 'header' && column && column.type === 'seq') return []
  const section = type === 'header' ? menuConfig.header : menuConfig.body
  if (!section || !section.options) return []
  const groups = section.options.map((group) =>
    group.map((item) => ({ ...item, visible: item.visible !== false, disabled: !!item.disabled }))
  )
  const colCount = (g().tableColumns || []).length
  const { selectedRowCount, multiRow } = getContextMenuMultiRowState(null)
  groups.forEach((group) => {
    group.forEach((item) => {
      applyContextMenuItemState(item, { type, column, colCount, multiRow, selectedRowCount })
    })
  })
  return groups
    .map((group) => group.filter((item) => item.visible !== false))
    .filter((group) => group.length > 0)
}

function hideTcContextMenu() {
  contextMenuState.value.visible = false
  clearMenuTargetRowIndexesSnapshot()
}

function showTcContextMenu({ type, row, column, $event }) {
  captureMenuTargetRowIndexes(row)
  const menuType = isAllCellsAreaSelected() ? 'body' : type
  const groups = resolveContextMenuGroups(menuType, column)
  if (!groups.length || !$event) return
  const $grid = gridRef.value
  if ($grid && typeof $grid.closeMenu === 'function') $grid.closeMenu()
  contextMenuState.value = {
    visible: true,
    x: $event.clientX,
    y: $event.clientY,
    type: menuType,
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

async function onContextMenuItemClick(item) {
  if (!item || item.disabled || item.visible === false) return
  const { type, row, column } = contextMenuState.value
  hideTcContextMenu()
  await onMenuClick({ menu: item, row, column, type })
}

async function onShellContextmenu(event) {
  const target = event.target
  if (!target || !target.closest) return
  if (!target.closest('.tc-vxe-table-shell')) return
  if (target.closest('.tc-vxe-fallback-menu, .vxe-table--context-menu-wrapper')) return
  if (isRowResizeOrBodyGapTarget(event) || isColumnResizeTarget(event)) return

  const cellEl = target.closest('td.vxe-body--column, th.vxe-header--column')
  if (!cellEl) return

  event.preventDefault()

  const shouldKeepAllSelection = isAllCellsAreaSelected()
  const isHeader = cellEl.classList.contains('vxe-header--column')
  const type = isHeader ? 'header' : 'body'
  const $grid = gridRef.value
  if (!$grid) return

  const columnRest = typeof $grid.getColumnNode === 'function' ? $grid.getColumnNode(cellEl) : null
  const column = columnRest && columnRest.item ? columnRest.item : null
  if (type === 'header' && column && column.type === 'seq') return

  let row = null
  if (!isHeader) {
    const rowRest = typeof $grid.getRowNode === 'function' ? $grid.getRowNode(cellEl.parentNode) : null
    row = rowRest && rowRest.item ? rowRest.item : null
    if (row) await ensureRowContextSelection(row)
  } else if (!shouldKeepAllSelection) {
    const colIdx = resolveDataColIndex(column)
    if (colIdx >= 0) await selectColumnArea(colIdx)
  }

  if (shouldKeepAllSelection) {
    await selectAllCells({ reapply: true })
    captureMenuTargetRowIndexes(row)
  }

  await nextTick()
  await new Promise((resolve) => window.requestAnimationFrame(resolve))
  const nativeMenu = document.querySelector('.vxe-table--context-menu-wrapper.is--visible')
  if (nativeMenu) return

  showTcContextMenu({ type, row, column, $event: event })
}

function onDocumentPointerDown(event) {
  if (!isContextMenuPointerTarget(event.target)) {
    if (!event.target.closest || !event.target.closest('.tc-vxe-fallback-menu')) {
      hideTcContextMenu()
    }
  }
  if (event.target && event.target.closest && event.target.closest('.tc-vxe-select-all-corner-btn')) return
  tryStartRowDragSelect(event)
  tryStartCellDragSelect(event)
  const onDataCell = event.target.closest && event.target.closest('.vxe-body--column:not(.col--seq)')
  const inShell = event.target.closest && event.target.closest('.tc-vxe-table-shell')
  const $grid = gridRef.value
  if ($grid && typeof $grid.getEditCell === 'function' && onDataCell && inShell) {
    const active = $grid.getEditCell()
    if (active) {
      const resolved = resolveCellFromDom(event)
      if (resolved && !isSameEditCell(active, resolved.row, resolved.column)) {
        primeCellFocus(resolved.row, resolved.column)
      }
    }
  }
  if (!shouldPreserveAllCellsSelection(event)) {
    if (!(onDataCell && inShell)) {
      clearAreaSelection(gridRef.value)
    }
  }
  if (!$grid || typeof $grid.getEditCell !== 'function') return
  const active = $grid.getEditCell()
  if (!active) return
  if (event.target.closest('.tc-vxe-table-shell')) return
  closeActiveEdit($grid)
}

function onEditActived() {
  focusEditInput()
}

function flushActiveEditValueSync($grid) {
  if (!$grid || typeof $grid.getEditCell !== 'function') return
  const active = $grid.getEditCell()
  if (!active || !active.row || !active.column || !active.column.field) return
  const mount = document.getElementById('tc-vxe-table-mount')
  const input = mount && mount.querySelector('.vxe-cell--edit textarea, .vxe-cell--edit input, .vxe-textarea--inner')
  if (input && 'value' in input) {
    active.row[active.column.field] = normalizeCell(input.value)
  }
  if (typeof $grid.clearEdit === 'function') {
    try { $grid.clearEdit() } catch (e) { /* ignore */ }
  }
}

function syncToGlobalForStash() {
  const $grid = gridRef.value
  if ($grid) flushActiveEditValueSync($grid)
  return pullToGlobal({ skipVueSync: true })
}

function pullClosedEditCellToGlobal(row, column, opts = {}) {
  const grid = gridRef.value
  if (!grid || !row || !column || !column.field || row._displayPad || row._rowIndex == null) {
    return pullToGlobal(opts)
  }
  const colIdx = parseInt(String(column.field).slice(1), 10)
  if (Number.isNaN(colIdx) || colIdx < 0) return pullToGlobal(opts)

  flushActiveEditValueSync(grid)
  const field = column.field
  const val = normalizeCell(row[field])
  row[field] = val
  const rid = row._rowId
  if (rid) {
    const local = tableData.value.find((r) => r._rowId === rid)
    if (local) local[field] = val
  }
  if (typeof g().ensureTcTableRowMaterialized === 'function') {
    g().ensureTcTableRowMaterialized(row._rowIndex)
  }

  const store = g().TcWorkbenchStore && g().TcWorkbenchStore.table
  let synced = false
  if (store && typeof store.patchCell === 'function') {
    synced = store.patchCell(row._rowIndex, colIdx, val, { render: false, source: 'pullClosedEditCell' }) === true
  }
  if (!synced) {
    const data = g().testCasesData
    if (data && data[row._rowIndex]) {
      data[row._rowIndex][colIdx] = val
    } else {
      return pullToGlobal(opts)
    }
  }

  if (opts.skipVueSync !== true) {
    nextTick(() => applyRowHeightsFromGlobal())
  }
  if (typeof g().scheduleSyncTcProvenanceRail === 'function') {
    g().scheduleSyncTcProvenanceRail({ debounceMs: 240 })
  } else if (typeof g().syncTcTableTemplateChrome === 'function') {
    g().syncTcTableTemplateChrome()
  }
  return true
}

function pullToGlobalLegacy(opts = {}) {
  const grid = gridRef.value
  if (!grid) return false
  const cols = g().tableColumns || []
  if (!cols.length) return false
  flushActiveEditValueSync(grid)
  let records = tableData.value.slice()
  const table = grid.getTableData ? grid.getTableData() : null
  const fullData = table && table.fullData ? table.fullData : null
  if (fullData && fullData.length) {
    const byId = {}
    fullData.forEach((rec) => {
      if (rec && rec._rowId) byId[rec._rowId] = rec
    })
    records = records.map((rec) => byId[rec._rowId] || rec)
  }
  records.forEach((rec) => {
    if (!rec || rec._rowIndex == null || !rec._displayPad) return
    if (!rowRecordHasContent(rec)) return
    if (typeof g().ensureTcTableRowMaterialized === 'function') {
      g().ensureTcTableRowMaterialized(rec._rowIndex)
    }
    const dataRow = g().testCasesData && g().testCasesData[rec._rowIndex]
    if (dataRow) {
      cols.forEach((_, idx) => {
        dataRow[idx] = normalizeCell(rec['c' + idx])
      })
    }
  })
  let maxIdx = (g().testCasesData || []).length - 1
  records.forEach((rec) => {
    if (!rec || rec._rowIndex == null || rec._displayPad) return
    maxIdx = Math.max(maxIdx, rec._rowIndex)
  })
  const rows = []
  for (let i = 0; i <= maxIdx; i += 1) {
    const rec = records.find((r) => r._rowIndex === i && !r._displayPad)
    if (rec) {
      rows.push(cols.map((_, idx) => normalizeCell(rec['c' + idx])))
    } else {
      const fromData = g().testCasesData && g().testCasesData[i]
      rows.push(cols.map((_, idx) => normalizeCell(fromData ? fromData[idx] : '')))
    }
  }
  const normalizedRows = typeof g().tcNormalizeTableRowsForStorage === 'function'
    ? g().tcNormalizeTableRowsForStorage(rows)
    : rows
  var synced = false
  if (g().TcWorkbenchStore && g().TcWorkbenchStore.table && typeof g().TcWorkbenchStore.table.syncRowsFromGrid === 'function') {
    synced = g().TcWorkbenchStore.table.syncRowsFromGrid(normalizedRows, { render: false, source: 'pullToGlobal' }) === true
  }
  if (!synced) {
    g().testCasesData = normalizedRows
  }
  if (opts.skipVueSync !== true) {
    syncFromWindow()
    nextTick(() => applyRowHeightsFromGlobal())
  }
  if (typeof g().syncTcProvenanceRail === 'function') g().syncTcProvenanceRail()
  if (typeof g().syncTcTableTemplateChrome === 'function') g().syncTcTableTemplateChrome()
  return true
}

/**
 * 虚拟滚动专用回写：强制以 tableData/fullData 全量为准，禁止只用可见行。
 * 不改 pullToGlobalLegacy。
 */
function pullToGlobalVirtual(opts = {}) {
  const grid = gridRef.value
  if (!grid) return false
  const cols = g().tableColumns || []
  if (!cols.length) return false
  flushActiveEditValueSync(grid)
  let records = tcVxeGetFullDataRowsVirtual(grid)
  const table = grid.getTableData ? grid.getTableData() : null
  const fullData = table && table.fullData ? table.fullData : null
  if (fullData && fullData.length) {
    const byId = {}
    fullData.forEach((rec) => {
      if (rec && rec._rowId) byId[rec._rowId] = rec
    })
    records = records.map((rec) => byId[rec._rowId] || rec)
  }
  records.forEach((rec) => {
    if (!rec || rec._rowIndex == null || !rec._displayPad) return
    if (!rowRecordHasContent(rec)) return
    if (typeof g().ensureTcTableRowMaterialized === 'function') {
      g().ensureTcTableRowMaterialized(rec._rowIndex)
    }
    const dataRow = g().testCasesData && g().testCasesData[rec._rowIndex]
    if (dataRow) {
      cols.forEach((_, idx) => {
        dataRow[idx] = normalizeCell(rec['c' + idx])
      })
    }
  })
  let maxIdx = (g().testCasesData || []).length - 1
  records.forEach((rec) => {
    if (!rec || rec._rowIndex == null || rec._displayPad) return
    maxIdx = Math.max(maxIdx, rec._rowIndex)
  })
  const rows = []
  for (let i = 0; i <= maxIdx; i += 1) {
    const rec = records.find((r) => r._rowIndex === i && !r._displayPad)
    if (rec) {
      rows.push(cols.map((_, idx) => normalizeCell(rec['c' + idx])))
    } else {
      const fromData = g().testCasesData && g().testCasesData[i]
      rows.push(cols.map((_, idx) => normalizeCell(fromData ? fromData[idx] : '')))
    }
  }
  const normalizedRows = typeof g().tcNormalizeTableRowsForStorage === 'function'
    ? g().tcNormalizeTableRowsForStorage(rows)
    : rows
  var synced = false
  if (g().TcWorkbenchStore && g().TcWorkbenchStore.table && typeof g().TcWorkbenchStore.table.syncRowsFromGrid === 'function') {
    synced = g().TcWorkbenchStore.table.syncRowsFromGrid(normalizedRows, { render: false, source: 'pullToGlobalVirtual' }) === true
  }
  if (!synced) {
    g().testCasesData = normalizedRows
  }
  if (opts.skipVueSync !== true) {
    syncFromWindow()
    nextTick(() => applyRowHeightsFromGlobalVirtual())
  }
  syncProvenanceImmediateForMode()
  if (typeof g().syncTcTableTemplateChrome === 'function') g().syncTcTableTemplateChrome()
  return true
}

function pullToGlobal(opts = {}) {
  if (shouldUseVirtualYMode()) return pullToGlobalVirtual(opts)
  return pullToGlobalLegacy(opts)
}

async function syncGridColumnVisibility($grid) {
  if (!$grid) return false
  const meta = g().columnVisible || {}
  const colCount = (g().tableColumns || []).length
  let changed = false
  for (let idx = 0; idx < colCount; idx += 1) {
    const field = 'c' + idx
    const shouldShow = meta[idx] !== false
    const col = typeof $grid.getColumnByField === 'function' ? $grid.getColumnByField(field) : null
    if (!col) continue
    if (shouldShow && col.visible === false) {
      if (typeof $grid.showColumn === 'function') {
        await $grid.showColumn(field)
        changed = true
      }
    } else if (!shouldShow && col.visible !== false) {
      if (typeof $grid.hideColumn === 'function') {
        await $grid.hideColumn(field)
        changed = true
      }
    }
  }
  if (changed && $grid.recalculate) $grid.recalculate()
  return changed
}

async function fitColumnsToContainerWithRetry() {
  const attempt = () => {
    const mount = document.getElementById('tc-vxe-table-mount')
    const w = mount && mount.clientWidth
    if (!w) return false
    if (typeof g().tcFitColumnWidthsEvenly !== 'function') return false
    return g().tcFitColumnWidthsEvenly({ containerWidth: w }) === true
  }
  if (attempt()) return true
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(resolve))
  if (attempt()) return true
  await new Promise((resolve) => setTimeout(resolve, 100))
  return attempt()
}

function getMountEl() {
  return document.getElementById('tc-vxe-table-mount')
}

/** 仅用于 Vxe 表格视口布局：lanhu-fill 工作台须表内纵向滚动，与页面级滚动隔离 */
function isLanhuFillWorkbench() {
  return !!document.querySelector('.tc-workbench-scope--lanhu-fill')
}

function needsBoundedTableLayout() {
  return isLanhuFillWorkbench() || (gridHeight.value != null && gridHeight.value >= 80)
}

function hasBoundedGridHeight() {
  const h = gridHeight.value
  return h != null && h >= 80
}

function getDisplayRowCountForVirtualScroll() {
  const dataLen = Array.isArray(g().testCasesData) ? g().testCasesData.length : 0
  const displayLen = tableData.value.length
  return Math.max(dataLen, displayLen)
}

function isTcWorkbenchTablePanel() {
  return !!document.getElementById('tc-vxe-table-view-panel')
}

/**
 * Legacy：未开总开关时的阈值判断（不含「工作台强制」），保持可回滚。
 * 不在此函数内读 Virtual 新配置的 forceWorkbench。
 */
function shouldForceVerticalVirtualScrollLegacy() {
  if (hasBoundedGridHeight()) return true
  return getDisplayRowCountForVirtualScroll() >= TC_VIRTUAL_SCROLL_ROW_THRESHOLD
}

/** 工作台表格始终使用固定视口 + 虚拟滚动；其它场景按行数阈值降级（旧入口，语义保留） */
function shouldForceVerticalVirtualScroll() {
  if (isTcWorkbenchTablePanel()) return true
  if (hasBoundedGridHeight()) return true
  return getDisplayRowCountForVirtualScroll() >= TC_VIRTUAL_SCROLL_ROW_THRESHOLD
}

/** Virtual 路径统一入口：受 TC_VXE_VIRTUAL_Y.enabled 控制 */
function shouldUseVirtualYMode() {
  if (!tcVxeIsVirtualYFlagEnabled()) return false
  return tcVxeShouldUseVirtualY({
    isWorkbench: isTcWorkbenchTablePanel(),
    hasBoundedHeight: hasBoundedGridHeight(),
    displayRowCount: getDisplayRowCountForVirtualScroll(),
  })
}

function measurePanelGridHeight() {
  const panel = document.getElementById('tc-vxe-table-view-panel')
  if (!panel) return null
  const h = panel.clientHeight
  if (!h || h < 80) return null
  return Math.floor(h)
}

function measureFallbackVirtualScrollHeight() {
  const cfg = tcVxeReadVirtualYConfig()
  return measureBoundedGridHeight() || measurePanelGridHeight() || cfg.minHeight || TC_VIRTUAL_SCROLL_MIN_VIEWPORT_HEIGHT
}

function measureBoundedGridHeight() {
  const mount = getMountEl()
  if (!mount) return null
  const h = mount.clientHeight
  if (!h || h < 80) return null
  return Math.floor(h)
}

async function syncGridLayoutHeight() {
  await nextTick()
  const measured = measureBoundedGridHeight() || measurePanelGridHeight()
  let next = measured && measured >= 80 ? measured : null
  if (!next && shouldUseVirtualYMode()) {
    next = measureFallbackVirtualScrollHeight()
  }
  const prev = gridHeight.value
  if (prev !== next) gridHeight.value = next
  const $grid = gridRef.value
  if (!$grid) return true
  if (typeof $grid.recalculate === 'function') {
    try { await $grid.recalculate() } catch (e) { /* ignore */ }
  }
  if (prev !== next && next && shouldUseVirtualYMode()) {
    if (typeof $grid.refreshScroll === 'function') {
      try { await $grid.refreshScroll() } catch (e) { /* ignore */ }
    }
  }
  return true
}

function scheduleSyncGridLayoutHeight() {
  if (layoutRaf) return
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = 0
    void syncGridLayoutHeight()
  })
}

const scrollYConfig = computed(() => {
  void tableData.value.length
  if (!shouldUseVirtualYMode()) {
    return tcVxeBuildScrollYConfigDisabled()
  }
  // Phase3 可选：仅 scrollIdleTuneBuffer=true 时用新 builder，默认仍走旧 Virtual 配置
  if (tcVxeIsScrollIdleEnabled()) {
    const idleCfg = tcVxeReadScrollIdleConfig()
    if (idleCfg.tuneBuffer) return tcVxeBuildScrollYConfigVirtualScrollIdle()
  }
  return tcVxeBuildScrollYConfigVirtual()
})

const effectiveGridHeight = computed(() => {
  void tableData.value.length
  if (!shouldUseVirtualYMode()) return null
  if (gridHeight.value != null && gridHeight.value >= 80) return gridHeight.value
  return measureFallbackVirtualScrollHeight()
})

const tableLayoutKey = computed(() => {
  void tableData.value.length
  if (shouldUseVirtualYMode()) return 'virtual-y'
  return hasBoundedGridHeight() ? 'bounded' : 'natural'
})

watch(gridHeight, async (next, prev) => {
  if (!next || next === prev || !shouldUseVirtualYMode()) return
  await nextTick()
  const $grid = gridRef.value
  if (!$grid) return
  if (typeof $grid.recalculate === 'function') {
    try { await $grid.recalculate() } catch (e) { /* ignore */ }
  }
  if (typeof $grid.refreshScroll === 'function') {
    try { await $grid.refreshScroll() } catch (e) { /* ignore */ }
  }
})

function scheduleProvenanceSyncForMode(isHeavySync) {
  if (shouldUseVirtualYMode()) {
    if (typeof g().scheduleSyncTcProvenanceRailVirtual === 'function') {
      g().scheduleSyncTcProvenanceRailVirtual({ debounceMs: isHeavySync ? 80 : 160 })
      return
    }
  }
  if (typeof g().scheduleSyncTcProvenanceRail === 'function') {
    g().scheduleSyncTcProvenanceRail({ debounceMs: isHeavySync ? 120 : 240 })
  } else if (typeof g().syncTcProvenanceRail === 'function' && isHeavySync) {
    void nextTick().then(() => g().syncTcProvenanceRail())
  }
}

function syncProvenanceImmediateForMode() {
  if (shouldUseVirtualYMode() && typeof g().syncTcProvenanceRailVirtual === 'function') {
    g().syncTcProvenanceRailVirtual()
    return
  }
  if (typeof g().syncTcProvenanceRail === 'function') g().syncTcProvenanceRail()
}

let virtualScrollReapplyTimer = 0
/** 旧滚动调度：冻结行为，ScrollIdle 关闭时仍由此路径工作 */
function onGridScrollVirtual() {
  if (!shouldUseVirtualYMode()) return
  if (virtualScrollReapplyTimer) window.clearTimeout(virtualScrollReapplyTimer)
  virtualScrollReapplyTimer = window.setTimeout(() => {
    virtualScrollReapplyTimer = 0
    if (currentAreaScope) void reapplyAreaSelectionIfNeededVirtual()
    scheduleProvenanceSyncForMode(false)
  }, 48)
}

/** ---------- ScrollIdle：滚动空闲调度（新路径，不改 onGridScrollVirtual） ---------- */
let scrollIdleSelectionDirty = false
let scrollIdleProvenanceDirty = false
let scrollIdleTimer = 0
let scrollIdleMaxWaitTimer = 0
let scrollIdleFlushGeneration = 0
let scrollIdleFlushing = false

function cancelVirtualScrollIdleFlush() {
  if (scrollIdleTimer) {
    window.clearTimeout(scrollIdleTimer)
    scrollIdleTimer = 0
  }
  if (scrollIdleMaxWaitTimer) {
    window.clearTimeout(scrollIdleMaxWaitTimer)
    scrollIdleMaxWaitTimer = 0
  }
}

function markVirtualScrollDirty() {
  if (currentAreaScope) scrollIdleSelectionDirty = true
  scrollIdleProvenanceDirty = true
}

function scheduleProvenanceSyncForScrollIdle() {
  if (typeof g().scheduleSyncTcProvenanceRailScrollIdle === 'function') {
    g().scheduleSyncTcProvenanceRailScrollIdle({ debounceMs: 0 })
    return
  }
  // 回退：仍走既有 Virtual 调度，不改旧方法
  scheduleProvenanceSyncForMode(false)
}

async function flushVirtualScrollIdle() {
  if (!shouldUseVirtualYMode()) return
  if (scrollIdleFlushing) return
  scrollIdleFlushing = true
  const token = ++scrollIdleFlushGeneration
  cancelVirtualScrollIdleFlush()
  const needSelection = scrollIdleSelectionDirty && !!currentAreaScope
  const needProvenance = scrollIdleProvenanceDirty
  scrollIdleSelectionDirty = false
  scrollIdleProvenanceDirty = false
  try {
    if (token !== scrollIdleFlushGeneration) return
    if (needSelection) await reapplyAreaSelectionIfNeededVirtual()
    if (token !== scrollIdleFlushGeneration) return
    if (needProvenance) scheduleProvenanceSyncForScrollIdle()
  } finally {
    if (token === scrollIdleFlushGeneration) scrollIdleFlushing = false
  }
}

function scheduleVirtualScrollIdleFlush() {
  const cfg = tcVxeReadScrollIdleConfig()
  const idleMs = cfg.idleMs > 0 ? cfg.idleMs : 120
  const maxWaitMs = cfg.maxWaitMs > 0 ? cfg.maxWaitMs : 400
  if (scrollIdleTimer) window.clearTimeout(scrollIdleTimer)
  scrollIdleTimer = window.setTimeout(() => {
    scrollIdleTimer = 0
    void flushVirtualScrollIdle()
  }, idleMs)
  if (!scrollIdleMaxWaitTimer) {
    scrollIdleMaxWaitTimer = window.setTimeout(() => {
      scrollIdleMaxWaitTimer = 0
      void flushVirtualScrollIdle()
    }, maxWaitMs)
  }
}

/** 新滚动入口：滚动中只打脏标记，停滑后再补齐选区/来源轨 */
function onGridScrollIdleVirtual() {
  if (!shouldUseVirtualYMode()) return
  if (!tcVxeIsScrollIdleEnabled()) {
    onGridScrollVirtual()
    return
  }
  markVirtualScrollDirty()
  scheduleVirtualScrollIdleFlush()
}

/** @scroll 分发：可开关回滚到旧 onGridScrollVirtual */
function onGridScrollDispatch() {
  if (shouldUseVirtualYMode() && tcVxeIsScrollIdleEnabled()) {
    onGridScrollIdleVirtual()
    return
  }
  onGridScrollVirtual()
}

/** Legacy 数据同步：冻结现有行为，供总开关关闭时使用 */
async function applyDataLegacy(opts = {}) {
  const isHeavySync = opts.reload !== false
  const preserveScroll = opts.preserveScroll === true
  if (opts.fitColumns) await fitColumnsToContainerWithRetry()
  syncFromWindow({ rebuildColumns: isHeavySync })
  const $grid = await waitGrid()
  if (!$grid) return false
  const scrollSnap = preserveScroll ? captureGridScrollSnapshot($grid) : null
  const records = tableData.value.slice()
  if (!columns.value.length || columns.value.length <= 1) {
    if ($grid.reloadData) await $grid.reloadData([])
    await syncGridLayoutHeight()
    return true
  }
  if (isHeavySync || opts.syncColumnVisibility === true) {
    await syncGridColumnVisibility($grid)
    if (typeof g().updateRestoreButton === 'function') g().updateRestoreButton()
  }
  if (opts.reload === false && $grid.loadData) await $grid.loadData(records)
  else if ($grid.reloadData) await $grid.reloadData(records)
  await nextTick()
  if (isHeavySync) {
    await applyRowHeightsFromGlobal()
    if ($grid.recalculate) $grid.recalculate()
    await syncGridLayoutHeight()
    if (shouldForceVerticalVirtualScrollLegacy() && typeof $grid.refreshScroll === 'function') {
      try { await $grid.refreshScroll() } catch (e) { /* ignore */ }
    }
    if (currentAreaScope) {
      await nextTick()
      await reapplyAreaSelectionIfNeeded()
    }
    if (typeof window.TcTableProductivity !== 'undefined' && window.TcTableProductivity.refreshFilter) {
      window.TcTableProductivity.refreshFilter()
    }
  } else {
    scheduleSyncGridLayoutHeight()
  }
  if (opts.skipProvenance !== true) {
    if (typeof g().scheduleSyncTcProvenanceRail === 'function') {
      g().scheduleSyncTcProvenanceRail({ debounceMs: isHeavySync ? 120 : 240 })
    } else if (typeof g().syncTcProvenanceRail === 'function' && isHeavySync) {
      await nextTick()
      g().syncTcProvenanceRail()
    }
  }
  if (preserveScroll && scrollSnap) {
    await restoreGridScrollSnapshot($grid, scrollSnap)
  }
  return true
}

/** 虚拟滚动专用同步：固定高度 + refreshScroll + Virtual 来源轨/选区 */
async function applyDataVirtual(opts = {}) {
  const isHeavySync = opts.reload !== false
  const preserveScroll = opts.preserveScroll === true
  if (opts.fitColumns) await fitColumnsToContainerWithRetry()
  syncFromWindow({ rebuildColumns: isHeavySync })
  const $grid = await waitGrid()
  if (!$grid) return false
  const scrollSnap = preserveScroll ? captureGridScrollSnapshotVirtual($grid) : null
  const records = tableData.value.slice()
  if (!columns.value.length || columns.value.length <= 1) {
    if ($grid.reloadData) await $grid.reloadData([])
    await syncGridLayoutHeight()
    return true
  }
  if (isHeavySync || opts.syncColumnVisibility === true) {
    await syncGridColumnVisibility($grid)
    if (typeof g().updateRestoreButton === 'function') g().updateRestoreButton()
  }
  if (opts.reload === false && $grid.loadData) await $grid.loadData(records)
  else if ($grid.reloadData) await $grid.reloadData(records)
  await nextTick()
  if (isHeavySync) {
    await applyRowHeightsFromGlobalVirtual()
    if ($grid.recalculate) $grid.recalculate()
    await syncGridLayoutHeight()
    if (typeof $grid.refreshScroll === 'function') {
      try { await $grid.refreshScroll() } catch (e) { /* ignore */ }
    }
    if (currentAreaScope) {
      await nextTick()
      await reapplyAreaSelectionIfNeededVirtual()
    }
    if (typeof window.TcTableProductivity !== 'undefined' && window.TcTableProductivity.refreshFilter) {
      window.TcTableProductivity.refreshFilter()
    }
  } else {
    scheduleSyncGridLayoutHeight()
    if (currentAreaScope) {
      await nextTick()
      await reapplyAreaSelectionIfNeededVirtual()
    }
  }
  if (opts.skipProvenance !== true) {
    scheduleProvenanceSyncForMode(isHeavySync)
  }
  if (preserveScroll && scrollSnap) {
    await restoreGridScrollSnapshotVirtual($grid, scrollSnap)
  }
  return true
}

async function applyData(opts = {}) {
  if (shouldUseVirtualYMode()) return applyDataVirtual(opts)
  return applyDataLegacy(opts)
}

function captureGridScrollSnapshotVirtual($grid) {
  return captureGridScrollSnapshot($grid)
}

async function restoreGridScrollSnapshotVirtual($grid, snap) {
  return restoreGridScrollSnapshot($grid, snap)
}

async function applyRowHeightsFromGlobalVirtual() {
  return applyRowHeightsFromGlobal()
}

async function scrollToRowIndexLegacy(rowIndex) {
  const $grid = await waitGrid()
  if (!$grid) return false
  const rec = tableData.value.find((r) => r._rowIndex === rowIndex)
  if (!rec) return false
  if ($grid.setCurrentRow) $grid.setCurrentRow(rec)
  if ($grid.scrollToRow) {
    try {
      await $grid.scrollToRow(rec)
      return true
    } catch (e) { /* fall through */ }
  }
  const mount = getMountEl()
  const rowEl = mount && mount.querySelector(`.vxe-body--row[rowid="${rec._rowId}"]`)
  if (rowEl && typeof rowEl.scrollIntoView === 'function') {
    rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    return true
  }
  return true
}

/** 虚拟滚动定位：scrollToRow 后等待行挂载，再重绘选区/来源轨 */
async function scrollToRowIndexVirtual(rowIndex) {
  const $grid = await waitGrid()
  if (!$grid) return false
  const rec = tableData.value.find((r) => r._rowIndex === rowIndex)
  if (!rec) return false
  if ($grid.setCurrentRow) $grid.setCurrentRow(rec)
  if ($grid.scrollToRow) {
    try {
      await $grid.scrollToRow(rec)
    } catch (e) { /* ignore */ }
  }
  await nextTick()
  const mount = getMountEl()
  let rowEl = mount && mount.querySelector(`.vxe-body--row[rowid="${rec._rowId}"]`)
  if (!rowEl) {
    await new Promise((r) => window.setTimeout(r, 32))
    rowEl = mount && mount.querySelector(`.vxe-body--row[rowid="${rec._rowId}"]`)
  }
  if (rowEl && typeof rowEl.scrollIntoView === 'function') {
    rowEl.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }
  if (currentAreaScope) await reapplyAreaSelectionIfNeededVirtual()
  scheduleProvenanceSyncForMode(false)
  return true
}

async function scrollToRowIndex(rowIndex) {
  if (shouldUseVirtualYMode()) return scrollToRowIndexVirtual(rowIndex)
  return scrollToRowIndexLegacy(rowIndex)
}

async function onEditClosed({ row, column }) {
  if (row && column && column.field) {
    const field = column.field
    const val = normalizeCell(row[field])
    const rid = row._rowId
    if (rid) {
      const local = tableData.value.find((r) => r._rowId === rid)
      if (local) local[field] = val
    }
  }
  const targetRow = resolveRowRecord(row)
  const closedColIdx = column && column.field ? parseInt(String(column.field).slice(1), 10) : -1
  const closedRowIdx = targetRow && targetRow._rowIndex != null ? targetRow._rowIndex : -1
  const focusMovedAway =
    focusedCell &&
    (focusedCell.rowIndex !== closedRowIdx || focusedCell.colIndex !== closedColIdx)
  const useFastCellPull = !isSwitchingEditCell && (focusMovedAway || cellSwitchOptimisticSelect)

  if (useFastCellPull && targetRow && column) {
    pullClosedEditCellToGlobal(targetRow, column, { skipVueSync: true })
  } else {
    await nextTick()
    pullToGlobal({ skipVueSync: isSwitchingEditCell })
  }

  if (!isSwitchingEditCell && typeof g().tcTableRecordAfterMutation === 'function') {
    g().tcTableRecordAfterMutation()
  }

  if (targetRow) {
    if (useFastCellPull) {
      scheduleAutoFitRowHeight(targetRow, { skipMutation: true })
      if (focusMovedAway && focusedCell) {
        const pendingRow = tableData.value.find((r) => r._rowIndex === focusedCell.rowIndex)
        if (pendingRow) applyCustomSingleCellSelection(pendingRow, focusedCell.colIndex)
      }
    } else {
      await nextTick()
      await autoFitRowHeight(targetRow)
      if (focusMovedAway) {
        const pendingRow = tableData.value.find((r) => r._rowIndex === focusedCell.rowIndex)
        if (pendingRow) applyCustomSingleCellSelection(pendingRow, focusedCell.colIndex)
      } else if (closedColIdx >= 0) {
        applyCustomSingleCellSelection(targetRow, closedColIdx)
      }
    }
  }
  ensureTableShellFocus()
}


async function syncAllColumnWidthsOnSelectAll(width) {
  if (isSyncingAllSelectLayout) return
  isSyncingAllSelectLayout = true
  try {
    const safeWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(width))
    const colCount = (g().tableColumns || []).length
    if (!g().columnWidth) g().columnWidth = {}
    for (let idx = 0; idx < colCount; idx += 1) {
      g().columnWidth[idx] = safeWidth
    }
    columns.value.forEach((col) => {
      if (!col.field || col.field[0] !== 'c') return
      col.width = safeWidth
      col.minWidth = Math.min(col.minWidth || MIN_COLUMN_WIDTH, safeWidth)
    })
    const $grid = gridRef.value
    if (!$grid) return
    await nextTick()
    if (typeof $grid.setColumnWidth === 'function') {
      for (const col of columns.value) {
        if (!col.field || col.field[0] !== 'c') continue
        await $grid.setColumnWidth(col.field, safeWidth)
      }
    } else {
      syncFromWindow()
      if ($grid.loadColumn) await $grid.loadColumn(columns.value)
    }
    if ($grid.recalculate) await $grid.recalculate()
    if (typeof g().tcTableRecordAfterMutation === 'function') g().tcTableRecordAfterMutation()
  } finally {
    isSyncingAllSelectLayout = false
  }
}

async function syncAllRowHeightsOnSelectAll(height) {
  if (isSyncingAllSelectLayout) return
  isSyncingAllSelectLayout = true
  try {
    const safeHeight = Math.max(MIN_ROW_HEIGHT, Math.round(height))
    const defaultH = getDefaultRowHeight()
    const next = {}
    if (safeHeight !== defaultH) {
      tableData.value.forEach((row) => {
        next[row._rowIndex] = safeHeight
      })
    }
    g().rowHeights = next
    const conf = {}
    tableData.value.forEach((row) => {
      conf[row._rowId] = safeHeight
    })
    const $grid = gridRef.value
    if (!$grid || typeof $grid.setRowHeightConf !== 'function') return
    await $grid.setRowHeightConf(conf)
    await nextTick()
    if ($grid.recalculate) await $grid.recalculate()
    if (typeof g().tcTableRecordAfterMutation === 'function') g().tcTableRecordAfterMutation()
  } finally {
    isSyncingAllSelectLayout = false
  }
}

function onResizableChange({ column, resizeWidth }) {
  const field = column && column.field
  if (!field || field[0] !== 'c') return
  const idx = parseInt(field.slice(1), 10)
  if (Number.isNaN(idx) || !resizeWidth) return
  const width = Math.max(MIN_COLUMN_WIDTH, Math.round(resizeWidth))
  if (isAllCellsAreaSelected()) {
    void syncAllColumnWidthsOnSelectAll(width)
    if (currentAreaScope) void reapplyAreaSelectionIfNeeded()
    return
  }
  if (!g().columnWidth) g().columnWidth = {}
  g().columnWidth[idx] = width
}

function onRowResizableChange() {
  if (isSyncingAllSelectLayout) return
  nextTick(() => {
    requestAnimationFrame(async () => {
      if (isSyncingAllSelectLayout) return
      const $grid = gridRef.value
      if (!$grid || typeof $grid.getRowHeightConf !== 'function') return
      const conf = $grid.getRowHeightConf(true) || {}

      if (isAllCellsAreaSelected()) {
        let syncHeight = null
        const prevHeights = g().rowHeights || {}
        const defaultH = getDefaultRowHeight()
        tableData.value.forEach((row) => {
          if (!Object.prototype.hasOwnProperty.call(conf, row._rowId)) return
          const h = parseInt(conf[row._rowId], 10)
          if (Number.isNaN(h) || h < MIN_ROW_HEIGHT) return
          const prev = prevHeights[row._rowIndex] != null ? prevHeights[row._rowIndex] : defaultH
          if (prev !== h) syncHeight = h
        })
        if (syncHeight != null) {
          await syncAllRowHeightsOnSelectAll(syncHeight)
        }
        if (currentAreaScope) await reapplyAreaSelectionIfNeeded()
        return
      }

      syncRowHeightsToGlobal()
      if (typeof g().tcTableRecordAfterMutation === 'function') g().tcTableRecordAfterMutation()
      if (currentAreaScope) reapplyAreaSelectionIfNeeded()
    })
  })
}

function syncLayoutToGlobal() {
  syncRowHeightsToGlobal()
  const $grid = gridRef.value
  if (!$grid) return false
  let cols = []
  try {
    const tableCol = $grid.getTableColumn ? $grid.getTableColumn() : null
    cols = tableCol && tableCol.fullColumn ? tableCol.fullColumn : []
  } catch (e) {
    cols = []
  }
  if (!cols.length) {
    cols = columns.value.filter((col) => col.field && String(col.field).startsWith('c'))
  }
  if (!g().columnWidth) g().columnWidth = {}
  cols.forEach((col) => {
    const field = col && col.field
    if (!field || field[0] !== 'c') return
    const idx = parseInt(field.slice(1), 10)
    if (Number.isNaN(idx)) return
    const w = col.renderWidth || col.resizeWidth || col.width
    if (w && w > 0) g().columnWidth[idx] = Math.round(w)
  })
  return true
}

const bridge = {
  applyData,
  applyDataVirtual,
  applyDataLegacy,
  pullToGlobal,
  pullToGlobalVirtual,
  pullToGlobalLegacy,
  syncToGlobalForStash,
  scrollToRowIndex,
  scrollToRowIndexVirtual,
  scrollToRowIndexLegacy,
  applyRowHeightsFromGlobal,
  applyRowHeightsFromGlobalVirtual,
  syncLayoutToGlobal,
  recalculate: syncGridLayoutHeight,
  shouldUseVirtualYMode,
}

onMounted(async () => {
  document.addEventListener('mousedown', onDocumentPointerDown, true)
  document.addEventListener('mousemove', onDocumentRowDragMove, true)
  document.addEventListener('mouseup', onDocumentRowDragEnd, true)
  bindCellKeyboardInput()
  const mount = getMountEl()
  if (mount && typeof ResizeObserver !== 'undefined') {
    layoutRo = new ResizeObserver(() => scheduleSyncGridLayoutHeight())
    layoutRo.observe(mount)
    const panel = document.getElementById('tc-vxe-table-view-panel')
    if (panel) layoutRo.observe(panel)
  }
  window.addEventListener('resize', scheduleSyncGridLayoutHeight)
  await nextTick()
  await syncGridLayoutHeight()
  if (typeof props.onBridgeReady === 'function') props.onBridgeReady(bridge)
  await applyData({ reload: true })
  await syncGridLayoutHeight()
})

onUnmounted(() => {
  if (layoutRo) {
    layoutRo.disconnect()
    layoutRo = null
  }
  if (layoutRaf) {
    cancelAnimationFrame(layoutRaf)
    layoutRaf = 0
  }
  if (virtualScrollReapplyTimer) {
    window.clearTimeout(virtualScrollReapplyTimer)
    virtualScrollReapplyTimer = 0
  }
  cancelVirtualScrollIdleFlush()
  scrollIdleFlushGeneration += 1
  window.removeEventListener('resize', scheduleSyncGridLayoutHeight)
  document.removeEventListener('mousedown', onDocumentPointerDown, true)
  document.removeEventListener('mousemove', onDocumentRowDragMove, true)
  document.removeEventListener('mouseup', onDocumentRowDragEnd, true)
  rowDragSelectState = null
  unbindCellKeyboardInput()
  hideTcContextMenu()
  cancelDeferredClose()
  if (rowAutoHeightMeasureEl && rowAutoHeightMeasureEl.parentNode) {
    rowAutoHeightMeasureEl.parentNode.removeChild(rowAutoHeightMeasureEl)
    rowAutoHeightMeasureEl = null
  }
})
</script>

<template>
  <div ref="shellRef" class="tc-vxe-table-shell" tabindex="-1" @mousedown.capture="onShellMousedown" @dblclick.capture="onShellDblclick" @contextmenu.capture="onShellContextmenu">
    <vxe-grid
      :key="tableLayoutKey"
      ref="gridRef"
      :columns="columns"
      :data="tableData"
      border
      stripe
      keep-source
      :height="effectiveGridHeight ?? undefined"
      :row-config="{ isHover: true, keyField: '_rowId', useKey: true, resizable: true }"
      :column-config="{ resizable: true }"
      :cell-config="{ height: getDefaultRowHeight(), verticalAlign: 'middle', padding: false }"
      :resizable-config="{ minHeight: MIN_ROW_HEIGHT, isDblclickAutoHeight: false, showDragTip: false }"
      :menu-config="menuConfig"
      :edit-config="{ trigger: 'manual', mode: 'cell', autoFocus: true, autoPos: true, autoClear: false, showIcon: false }"
      :scroll-y="scrollYConfig"
      :row-class-name="rowClassName"
      class="tc-vxe-grid tc-vxe-grid--inline-edit"
      @scroll="onGridScrollDispatch"
      @cell-click="onCellClick"
      @cell-dblclick="onCellDblclick"
      @header-cell-click="onHeaderCellClick"
      @cell-menu="onCellMenu"
      @header-cell-menu="onHeaderCellMenu"
      @menu-click="onMenuClick"
      @edit-actived="onEditActived"
      @edit-closed="onEditClosed"
      @resizable-change="onResizableChange"
      @row-resizable-change="onRowResizableChange"
    >
      <template #tc_seq_corner_header>
        <button
          type="button"
          class="tc-vxe-select-all-corner-btn"
          title="全选所有单元格"
          aria-label="全选所有单元格"
          @mousedown.stop
          @click.stop="onSelectAllCornerActivate"
        ></button>
      </template>
    </vxe-grid>
    <Teleport to="body">
      <div
        v-if="contextMenuState.visible"
        ref="contextMenuRef"
        class="tc-vxe-fallback-menu tc-vxe-context-menu vxe-table--context-menu-wrapper is--visible"
        :style="{ top: contextMenuState.y + 'px', left: contextMenuState.x + 'px', zIndex: 6000 }"
        @mousedown.stop
        @contextmenu.prevent
      >
        <ul
          v-for="(group, groupIndex) in contextMenuState.groups"
          :key="'menu-group-' + groupIndex"
          class="vxe-table--context-menu-group-wrapper"
        >
          <li
            v-for="item in group"
            v-show="item.visible !== false"
            :key="item.code"
            class="vxe-table--context-menu--option"
            :class="{ 'link--disabled': item.disabled, 'tc-vxe-menu-danger': item.className === 'tc-vxe-menu-danger' }"
            @click="onContextMenuItemClick(item)"
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
.tc-vxe-table-shell {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  outline: none;
}
.tc-vxe-grid {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}
:deep(.tc-vxe-row--marked) {
  background-color: #fef9c3 !important;
}
:deep(.vxe-body--column.col--seq .vxe-cell) {
  position: relative;
  overflow: visible;
  cursor: pointer;
  user-select: none;
}
:deep(.vxe-body--column.col--seq .vxe-cell .vxe-cell--wrapper) {
  pointer-events: auto;
}
:deep(.vxe-header--column:not(.col--seq) .vxe-cell) {
  cursor: pointer;
}
:deep(.vxe-body--column.col--seq .vxe-cell--row-resizable) {
  z-index: 5;
  pointer-events: auto;
  cursor: row-resize;
}
:deep(.vxe-table--row-resizable-area) {
  cursor: row-resize;
}
/* 左上角：Excel 风格全选角按钮 */
:deep(.vxe-header--column.col--seq .vxe-cell) {
  position: relative;
  padding: 0 !important;
  background: #f8fafc !important;
  min-height: 48px;
}
:deep(.vxe-header--column.col--seq .vxe-cell--wrapper) {
  width: 100%;
  height: 100%;
  min-height: 48px;
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
:deep(.tc-vxe-select-all-corner-btn) {
  display: block;
  width: 100%;
  height: 48px;
  min-height: 48px;
  margin: 0;
  padding: 0;
  border: none;
  background: #f8fafc;
  cursor: pointer;
  position: relative;
  box-sizing: border-box;
}
:deep(.tc-vxe-select-all-corner-btn:hover) {
  background: #eef2f7;
}
/* WPS 风格：全选后灰色蒙层 */
:deep(.tc-vxe-grid--all-cells-selected .vxe-body--column > .vxe-cell) {
  position: relative;
}
:deep(.tc-vxe-cell-area-selected > .vxe-cell::after),
:deep(.tc-vxe-header-area-selected > .vxe-cell::after),
:deep(.tc-vxe-seq-area-selected > .vxe-cell::after) {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(168, 178, 191, 0.42);
  pointer-events: none;
  z-index: 2;
}
:deep(.tc-vxe-header-area-selected > .vxe-cell::after) {
  background: rgba(148, 158, 173, 0.48);
}
:deep(.tc-vxe-cell-area-active > .vxe-cell) {
  background: #fff !important;
  box-shadow: inset 0 0 0 2px #217346 !important;
  z-index: 3;
}
:deep(.tc-vxe-cell-area-active > .vxe-cell::after) {
  display: none;
}
:deep(.tc-vxe-grid--cell-focused .tc-vxe-cell-area-active > .vxe-cell) {
  background: #fff !important;
  box-shadow: inset 0 0 0 2px #217346 !important;
  z-index: 3;
}
:deep(.tc-vxe-grid--all-cells-selected .tc-vxe-select-all-corner-btn) {
  background: rgba(168, 178, 191, 0.55) !important;
}
:deep(.tc-vxe-grid--all-cells-selected .vxe-cell--row-resizable),
:deep(.tc-vxe-grid--all-cells-selected .vxe-cell--col-resizable) {
  z-index: 6;
}

:deep(.tc-vxe-select-all-corner-btn::after) {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 0 11px 11px;
  border-color: transparent transparent #64748b transparent;
  pointer-events: none;
}
/* 编辑态：保留 WPS 绿色边框；输入区沿用 VxeTextarea，仅拉伸至整格高度 */
:deep(.tc-vxe-grid--inline-edit .vxe-body--column.col--active > .vxe-cell) {
  box-shadow: inset 0 0 0 2px #217346 !important;
  outline: none !important;
  background: #fff !important;
  align-items: stretch !important;
}
:deep(.tc-vxe-grid--inline-edit .vxe-body--column.col--active .vxe-cell--wrapper),
:deep(.tc-vxe-grid--inline-edit .vxe-body--column.col--active .vxe-textarea) {
  align-self: stretch !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  flex: 1 1 auto !important;
}
:deep(.tc-vxe-grid--inline-edit .vxe-body--column.col--active .vxe-textarea--inner),
:deep(.tc-vxe-grid--inline-edit .vxe-body--column.col--active textarea) {
  width: 100% !important;
  height: 100% !important;
  min-height: 100% !important;
  box-sizing: border-box !important;
}
:deep(.tc-vxe-grid--inline-edit .vxe-body--column.col--active > .vxe-cell::after) {
  content: '';
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 6px;
  height: 6px;
  background: #217346;
  border: 1px solid #fff;
  box-sizing: border-box;
  z-index: 3;
  pointer-events: none;
}
:deep(.tc-vxe-grid--inline-edit .vxe-cell--edit .vxe-textarea--inner),
:deep(.tc-vxe-grid--inline-edit .vxe-cell--edit .vxe-default-textarea),
:deep(.tc-vxe-grid--inline-edit .vxe-cell--edit textarea) {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  text-align: center;
  font-family: inherit;
  border-radius: 0 !important;
}
:deep(.tc-vxe-grid--inline-edit .vxe-cell--edit .vxe-textarea--inner:focus),
:deep(.tc-vxe-grid--inline-edit .vxe-cell--edit textarea:focus) {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}
:deep(.tc-vxe-grid--inline-edit .vxe-cell--edit .vxe-textarea--count) {
  display: none !important;
}
</style>

<style>
/* 表格右键菜单：Excel 风格，fallback 与 vxe 原生菜单共用 */
.tc-vxe-context-menu.vxe-table--context-menu-wrapper {
  min-width: 268px;
  max-width: 340px;
  font-size: 14px;
  line-height: 1.45;
  padding: 6px 0;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06);
  color: #1f2937;
  overflow: hidden;
  user-select: none;
}

.tc-vxe-context-menu .vxe-table--context-menu-group-wrapper {
  margin: 0;
  padding: 4px 0;
  list-style: none;
  border-bottom: 1px solid #e5e7eb;
}

.tc-vxe-context-menu .vxe-table--context-menu-group-wrapper:last-child {
  border-bottom: none;
  padding-bottom: 2px;
}

.tc-vxe-context-menu .vxe-table--context-menu-group-wrapper:first-child {
  padding-top: 2px;
}

.tc-vxe-context-menu .vxe-table--context-menu--option {
  margin: 2px 6px;
  border-radius: 4px;
  list-style: none;
}

.tc-vxe-context-menu .vxe-context-menu--link {
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 36px;
  padding: 0 12px 0 8px;
  line-height: 1.45;
  cursor: pointer;
  color: inherit;
  text-decoration: none;
  width: 100%;
  box-sizing: border-box;
}

.tc-vxe-context-menu .vxe-context-menu--link-prefix {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  min-width: 28px;
  margin-right: 4px;
  flex-shrink: 0;
  color: #64748b;
  font-size: 16px;
}

.tc-vxe-context-menu .vxe-context-menu--link-prefix:empty {
  width: 8px;
  min-width: 8px;
}

.tc-vxe-context-menu .vxe-context-menu--link-content {
  flex: 1;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tc-vxe-context-menu .vxe-table--context-menu--option:hover:not(.link--disabled) {
  background: #f3f4f6;
}

.tc-vxe-context-menu .vxe-table--context-menu--option.link--active {
  background: #eef2f7;
}

.tc-vxe-context-menu .tc-vxe-menu-danger:not(.link--disabled) .vxe-context-menu--link-content {
  color: #be123c;
}

.tc-vxe-context-menu .tc-vxe-menu-danger:not(.link--disabled):hover {
  background: #fff1f2;
}

.tc-vxe-context-menu .vxe-table--context-menu--option.link--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.tc-vxe-context-menu .vxe-table--context-menu--option.link--disabled .vxe-context-menu--link {
  cursor: not-allowed;
}
</style>