/**
 * 智能编辑表格 · 单元格键盘/拖拽/壳层交互
 * 行为对齐用例工作台 TcTableApp，代码完全独立，不引用 tc-table 模块。
 */
export function installDtkSheetTableInteractions(ctx) {
  const DTK_BODY_ROW_GAP_HIT_PX = 14
  const MIN_COL_WIDTH = ctx.MIN_COL_WIDTH || 56
  const DEFAULT_ROW_HEIGHT = ctx.DEFAULT_ROW_HEIGHT || 40
  const MIN_ROW_HEIGHT = ctx.MIN_ROW_HEIGHT || 32

  let focusedCell = null
  let cellKeyboardBound = false
  let keyboardShellEl = null
  let cellImeComposing = false
  let cellEditOpening = false
  let isSwitchingEditCell = false
  let cellSwitchOptimisticSelect = false
  let rowDragSelectState = null
  let colDragSelectState = null
  let suppressRowClickUntil = 0
  let suppressHeaderClickUntil = 0
  let headerSelectPointerAt = 0
  let rowSelectPointerAt = 0
  let shellEditSwitchHandled = false
  let lastShellDblclickAt = 0
  let rowAutoHeightMeasureEl = null

  function getGrid() {
    return ctx.getGrid()
  }

  function getMount() {
    return ctx.getMount()
  }

  function getShell() {
    return ctx.getShell()
  }

  function getTableData() {
    return ctx.getTableData() || []
  }

  function getColumns() {
    return ctx.getColumns() || []
  }

  function getHiddenColIndexes() {
    return ctx.getHiddenColIndexes ? ctx.getHiddenColIndexes() : new Set()
  }

  function getDataColCount() {
    return Math.max(0, getColumns().length - 1)
  }

  function resolveColumnIndexFromHeaderEvent(event) {
    const target = event && event.target
    if (!target || !target.closest) return -1
    const headerCol = target.closest('.vxe-header--column:not(.col--seq)')
    if (!headerCol || !target.closest('.dtk-vxe-table-shell')) return -1
    const $grid = getGrid()
    if ($grid && typeof $grid.getColumnNode === 'function') {
      const node = $grid.getColumnNode(headerCol)
      const col = node && node.item ? node.item : null
      if (col && col.field) {
        const idx = parseInt(String(col.field).slice(1), 10)
        if (!Number.isNaN(idx) && idx >= 0) return idx
      }
    }
    const mount = getMount()
    if (!mount) return -1
    const headers = [...mount.querySelectorAll('.vxe-header--column:not(.col--seq)')]
    const headerIdx = headers.indexOf(headerCol)
    return headerIdx >= 0 ? headerIdx : -1
  }

  function primeCellFocus(row, column) {
    if (!row || !column || !column.field) return
    const colIdx = parseInt(String(column.field).slice(1), 10)
    if (Number.isNaN(colIdx) || colIdx < 0) return
    focusedCell = { rowIndex: row._rowIndex, colIndex: colIdx, rowId: row._rowId, field: column.field }
  }

  function clearFocusedCell() {
    focusedCell = null
  }

  function ensureShellFocus() {
    const shell = getShell()
    const $grid = getGrid()
    if ($grid && typeof $grid.getEditCell === 'function') {
      const activeEdit = $grid.getEditCell()
      if (activeEdit && activeEdit.column && typeof activeEdit.column.blur === 'function') {
        activeEdit.column.blur()
      }
    }
    if (shell && typeof shell.focus === 'function') shell.focus()
  }

  function getRowResizeHitElement(event) {
    const target = event && event.target
    if (target && target.closest) {
      const direct = target.closest('.vxe-cell--row-resizable, .vxe-table--row-resizable-area, .vxe-table--resizable-row-bar, .vxe-table--resizable-bar')
      if (direct) return direct
    }
    if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return null
    const mount = getMount()
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
    const mount = getMount()
    if (!mount) return null
    const y = event.clientY
    const x = event.clientX
    const rows = mount.querySelectorAll('.vxe-body--row')
    for (const rowEl of rows) {
      const rowRect = rowEl.getBoundingClientRect()
      if (x < rowRect.left || x > rowRect.right) continue
      if (y >= rowRect.bottom - DTK_BODY_ROW_GAP_HIT_PX && y <= rowRect.bottom + DTK_BODY_ROW_GAP_HIT_PX) {
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
    return getTableData().find((r) => r._rowId === rowid) || null
  }

  function resolveRowFromResizeOrGapTarget(event) {
    const hit = getRowResizeHitElement(event)
    const rowEl = (hit && hit.closest('.vxe-body--row'))
      || getBodyRowGapHitRowElement(event)
      || (event.target && event.target.closest && event.target.closest('.vxe-body--row'))
    if (!rowEl) return null
    const rowid = rowEl.getAttribute('rowid')
    return getTableData().find((r) => r._rowId === rowid) || null
  }

  function resolveFieldFromColumnEl(colEl) {
    if (!colEl) return null
    const colId = colEl.getAttribute('colid') || colEl.getAttribute('col-id')
    if (colId) return colId
    const $grid = getGrid()
    if ($grid && typeof $grid.getColumnNode === 'function') {
      const node = $grid.getColumnNode(colEl)
      const col = node && node.item ? node.item : null
      if (col && col.field) return col.field
    }
    return null
  }

  function resolveCellFromDom(event) {
    const target = event && event.target
    if (!target) return null
    const colEl = target.closest ? target.closest('.vxe-body--column') : null
    if (!colEl || colEl.classList.contains('col--seq')) return null
    const rowEl = colEl.closest('.vxe-body--row')
    if (!rowEl) return null
    const rowid = rowEl.getAttribute('rowid')
    let row = rowid ? getTableData().find((r) => r._rowId === rowid) : null
    if (!row) {
      const $grid = getGrid()
      if ($grid && typeof $grid.getRowNode === 'function') {
        const rowNode = $grid.getRowNode(colEl)
        const nr = rowNode && (rowNode.item || rowNode.row)
        if (nr) row = nr
      }
    }
    if (!row) return null
    const field = resolveFieldFromColumnEl(colEl)
    if (!field || field[0] !== 'c') return null
    const column = getColumns().find((c) => c.field === field)
    if (!column || column.type === 'seq' || !column.field) return null
    return { row, column }
  }

  function findVisibleColumnDefByDataColIndex(colIndex) {
    const hidden = getHiddenColIndexes()
    if (hidden.has(colIndex)) return null
    return getColumns().find((c) => c.field === 'c' + colIndex) || null
  }

  function resolveAdjacentVisibleColIndex(currentColIndex, direction = 1) {
    const colCount = getDataColCount()
    const hidden = getHiddenColIndexes()
    if (currentColIndex < 0 || colCount <= 0) return -1
    let idx = currentColIndex + direction
    while (idx >= 0 && idx < colCount) {
      if (!hidden.has(idx)) return idx
      idx += direction
    }
    return -1
  }

  function resolveAdjacentDataRowRecord(currentRowIndex, direction = 1) {
    if (currentRowIndex == null || currentRowIndex < 0) return null
    const rows = getTableData()
    let maxRow = rows.length - 1
    rows.forEach((row) => {
      if (row && row._rowIndex != null && row._rowIndex > maxRow) maxRow = row._rowIndex
    })
    let idx = currentRowIndex + direction
    while (idx >= 0 && idx <= maxRow) {
      const row = rows.find((r) => r._rowIndex === idx)
      if (row) return row
      idx += direction
    }
    return null
  }

  async function scrollToRowIndex(rowIndex) {
    const $grid = getGrid()
    if (!$grid) return false
    const rec = getTableData().find((r) => r._rowIndex === rowIndex)
    if (!rec) return false
    if ($grid.setCurrentRow) $grid.setCurrentRow(rec)
    if ($grid.scrollToRow) {
      try {
        await $grid.scrollToRow(rec)
        return true
      } catch (e) { /* ignore */ }
    }
    const mount = getMount()
    const rowEl = mount && mount.querySelector(`.vxe-body--row[rowid="${rec._rowId}"]`)
    if (rowEl && typeof rowEl.scrollIntoView === 'function') {
      rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    return true
  }

  function isActiveGridEditVisible() {
    const $grid = getGrid()
    const activeEdit = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
    if (!activeEdit || !activeEdit.row || !activeEdit.column) return false
    return ctx.hasDomEditOnCell(activeEdit.row, activeEdit.column)
  }

  async function appendActiveEditValue(text) {
    await ctx.nextTick()
    await ctx.waitEditIdle()
    const mount = getMount()
    const input = mount && mount.querySelector('.vxe-body--column.col--active textarea, .vxe-body--column.col--active .vxe-textarea--inner, .vxe-body--column.col--active input')
    if (!input) return false
    input.value = String(input.value || '') + String(text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    if (typeof input.focus === 'function') input.focus()
    const len = input.value.length
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(len, len)
    return true
  }

  async function setActiveEditValue(value) {
    await ctx.nextTick()
    await ctx.waitEditIdle()
    const mount = getMount()
    const input = mount && mount.querySelector('.vxe-body--column.col--active textarea, .vxe-body--column.col--active .vxe-textarea--inner, .vxe-body--column.col--active input')
    if (!input) return false
    input.value = value == null ? '' : String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    if (typeof input.focus === 'function') input.focus()
    const len = input.value.length
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(len, len)
    return true
  }

  async function beginEditFromInput(initialValue) {
    if (!focusedCell) return false
    const $grid = getGrid()
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
        await ctx.closeActiveEdit($grid)
        await ctx.waitEditIdle()
      }
      const row = getTableData().find((r) => r._rowIndex === focusedCell.rowIndex)
      const column = getColumns().find((c) => c.field === focusedCell.field)
      if (!row || !column) return false
      if (initialValue === undefined) return ctx.openCellEdit(row, column)
      return ctx.openCellEdit(row, column, { initialValue })
    } finally {
      cellEditOpening = false
    }
  }

  function shouldHandleCellTypeInput() {
    if (isSwitchingEditCell || cellEditOpening) return false
    if (!focusedCell) return false
    const $grid = getGrid()
    if ($grid && typeof $grid.getEditCell === 'function') {
      const activeEdit = $grid.getEditCell()
      if (activeEdit && activeEdit.row && activeEdit.column) return false
    }
    if (isActiveGridEditVisible()) return false
    const active = document.activeElement
    if (active && active.closest) {
      if (active.closest('.cf-doc-ai-panel, .cf-export-confirm-modal, .dtk-delete-confirm-modal, .cf-nav-leave-modal')) return false
      if (active.closest('.vxe-cell--edit')) return false
      if (active.closest('input, textarea, select, [contenteditable="true"]') && !active.closest('#dtk-vxe-table-mount')) return false
    }
    const mount = getMount()
    return !!(mount && mount.querySelector('.vxe-table'))
  }

  function isDtkTableEditInputActive() {
    const active = document.activeElement
    if (!active || !active.closest) return false
    return !!active.closest('.dtk-vxe-table-shell .vxe-cell--edit, .dtk-vxe-table-shell .vxe-body--column.col--active')
  }

  function shouldHandleCellNavigateKey(e, key) {
    if (!e || e.key !== key) return false
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    if (isSwitchingEditCell || cellEditOpening || cellImeComposing) return false
    const active = document.activeElement
    if (active && active.closest) {
      if (active.closest('.cf-doc-ai-panel, .cf-export-confirm-modal, .dtk-delete-confirm-modal')) return false
      if (active.closest('input, textarea, select, [contenteditable="true"]') && !active.closest('#dtk-vxe-table-mount')) return false
    }
    const mount = getMount()
    if (!mount || !mount.querySelector('.vxe-table')) return false
    const $grid = getGrid()
    const activeEdit = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
    if (activeEdit && activeEdit.row && activeEdit.column) return true
    if (isDtkTableEditInputActive()) return true
    return !!focusedCell
  }

  async function navigateFocusedCellInRow(direction = 1) {
    const $grid = getGrid()
    if (!$grid) return false

    let rowIndex = -1
    let colIndex = -1
    const activeEdit = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
    const wasEditing = !!(activeEdit && activeEdit.row && activeEdit.column) || isDtkTableEditInputActive()
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

    const targetRow = getTableData().find((r) => r._rowIndex === rowIndex)
    if (!targetRow) return false

    const nextColumn = findVisibleColumnDefByDataColIndex(nextColIndex)
    if (!nextColumn) return false

    if (activeEdit || wasEditing) {
      primeCellFocus(targetRow, nextColumn)
      ctx.applyCustomSingleCellSelection(targetRow, nextColIndex)
      if (ctx.syncGridSelectCell) await ctx.syncGridSelectCell(targetRow, nextColumn)
      cellSwitchOptimisticSelect = true
      await ctx.closeActiveEdit($grid, { fast: true })
      cellSwitchOptimisticSelect = false
    } else {
      await ctx.selectSingleCell(targetRow, nextColumn)
    }

    ensureShellFocus()
    return true
  }

  async function navigateFocusedCellInColumn(direction = 1) {
    const $grid = getGrid()
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

    const nextColumn = findVisibleColumnDefByDataColIndex(colIndex)
    if (!nextColumn) return false

    if (activeEdit) {
      primeCellFocus(nextRow, nextColumn)
      ctx.applyCustomSingleCellSelection(nextRow, colIndex)
      if (ctx.syncGridSelectCell) await ctx.syncGridSelectCell(nextRow, nextColumn)
      cellSwitchOptimisticSelect = true
      await ctx.closeActiveEdit($grid, { fast: true })
      cellSwitchOptimisticSelect = false
    } else {
      await ctx.selectSingleCell(nextRow, nextColumn)
    }

    void scrollToRowIndex(nextRow._rowIndex)
    ensureShellFocus()
    return true
  }

  function suppressNavigateKeyEvent(e) {
    e.preventDefault()
    e.stopPropagation()
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation()
  }

  function onCellRowNavigateKeydown(e) {
    const direction = e.shiftKey ? -1 : 1
    if (e.key === 'Tab') {
      if (!shouldHandleCellNavigateKey(e, 'Tab')) return
      suppressNavigateKeyEvent(e)
      void navigateFocusedCellInRow(direction)
      return
    }
    if (e.key === 'Enter') {
      if (!shouldHandleCellNavigateKey(e, 'Enter')) return
      suppressNavigateKeyEvent(e)
      void navigateFocusedCellInColumn(direction)
    }
  }

  function onShellEditNavigateKeydown(e) {
    if (e.key !== 'Tab') return
    if (!isDtkTableEditInputActive()) return
    if (!shouldHandleCellNavigateKey(e, 'Tab')) return
    suppressNavigateKeyEvent(e)
    const direction = e.shiftKey ? -1 : 1
    void navigateFocusedCellInRow(direction)
  }

  function onCellTypeKeydown(e) {
    if (!shouldHandleCellTypeInput()) return
    if (cellImeComposing) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Escape') {
      e.preventDefault()
      ctx.clearCustomCellAreaSelection()
      clearFocusedCell()
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
    const $grid = getGrid()
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
    const shell = getShell()
    if (shell) {
      keyboardShellEl = shell
      shell.addEventListener('keydown', onShellEditNavigateKeydown, true)
    }
  }

  function unbindCellKeyboardInput() {
    if (!cellKeyboardBound) return
    cellKeyboardBound = false
    document.removeEventListener('keydown', onCellRowNavigateKeydown, true)
    document.removeEventListener('keydown', onCellTypeKeydown, true)
    document.removeEventListener('paste', onCellTypePaste, true)
    document.removeEventListener('compositionstart', onCellCompositionStart, true)
    document.removeEventListener('compositionend', onCellCompositionEnd, true)
    if (keyboardShellEl) {
      keyboardShellEl.removeEventListener('keydown', onShellEditNavigateKeydown, true)
      keyboardShellEl = null
    }
  }

  function tryStartColDragSelect(event) {
    if (event.button !== 0 || ctx.isColumnResizeTarget(event)) return
    const target = event.target
    if (!target || !target.closest) return
    const headerCol = target.closest('.vxe-header--column:not(.col--seq)')
    if (!headerCol || !target.closest('.dtk-vxe-table-shell')) return
    const colIdx = resolveColumnIndexFromHeaderEvent(event)
    if (colIdx < 0) return
    colDragSelectState = { anchorColIdx: colIdx, didDrag: false }
  }

  async function updateColDragSelect(endColIdx) {
    if (!colDragSelectState || endColIdx < 0) return
    const anchor = colDragSelectState.anchorColIdx
    if (anchor === endColIdx) return
    colDragSelectState.didDrag = true
    await ctx.selectColumnRange(anchor, endColIdx, { reapply: true })
  }

  async function finishColDragSelect(event) {
    if (!colDragSelectState) return
    const { anchorColIdx, didDrag } = colDragSelectState
    colDragSelectState = null
    if (didDrag) {
      suppressHeaderClickUntil = Date.now() + 320
      return
    }
    if (!event || event.button !== 0 || ctx.isColumnResizeTarget(event)) return
    headerSelectPointerAt = Date.now()
    const $grid = getGrid()
    if ($grid) await ctx.closeActiveEdit($grid)
    await ctx.selectColumnArea(anchorColIdx)
  }

  function onDocumentColDragMove(event) {
    if (!colDragSelectState || event.buttons !== 1) return
    const colIdx = resolveColumnIndexFromHeaderEvent(event)
    if (colIdx >= 0) void updateColDragSelect(colIdx)
  }

  function onDocumentColDragEnd(event) {
    void finishColDragSelect(event)
  }

  function tryStartRowDragSelect(event) {
    if (event.button !== 0 || isRowResizeTarget(event)) return
    const target = event.target
    if (!target || !target.closest) return
    const seqCol = target.closest('.vxe-body--column.col--seq')
    if (!seqCol || !target.closest('.dtk-vxe-table-shell')) return
    const row = resolveRowFromDomEvent(event)
    if (!row) return
    rowDragSelectState = { anchorRow: row, didDrag: false }
  }

  async function updateRowDragSelect(endRow) {
    if (!rowDragSelectState || !endRow) return
    const anchor = rowDragSelectState.anchorRow
    if (anchor._rowIndex === endRow._rowIndex) return
    rowDragSelectState.didDrag = true
    await ctx.selectRowRange(anchor, endRow, { reapply: true })
  }

  async function finishRowDragSelect(event) {
    if (!rowDragSelectState) return
    const { anchorRow, didDrag } = rowDragSelectState
    rowDragSelectState = null
    if (didDrag) {
      suppressRowClickUntil = Date.now() + 320
      return
    }
    if (!anchorRow || (event && event.button !== 0) || (event && ctx.isSeqRowSelectBlockedTarget(event))) return
    rowSelectPointerAt = Date.now()
    const $grid = getGrid()
    const active = $grid && typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null
    if (active) await ctx.closeActiveEdit($grid)
    await ctx.selectRowArea(anchorRow)
  }

  function onDocumentRowDragMove(event) {
    if (!rowDragSelectState || event.buttons !== 1) return
    const row = resolveRowFromDomEvent(event)
    if (row) void updateRowDragSelect(row)
  }

  function onDocumentRowDragEnd(event) {
    void finishRowDragSelect(event)
  }

  function onDocumentPointerDown(event) {
    if (event.target && event.target.closest && event.target.closest('.dtk-vxe-select-all-corner-btn')) return
    tryStartColDragSelect(event)
    tryStartRowDragSelect(event)
    const onDataCell = event.target.closest && event.target.closest('.vxe-body--column:not(.col--seq)')
    const inShell = event.target.closest && event.target.closest('.dtk-vxe-table-shell')
    const $grid = getGrid()
    if ($grid && typeof $grid.getEditCell === 'function' && onDataCell && inShell) {
      const active = $grid.getEditCell()
      if (active) {
        const resolved = resolveCellFromDom(event)
        if (resolved && !ctx.isSameEditCell(active, resolved.row, resolved.column)) {
          primeCellFocus(resolved.row, resolved.column)
        }
      }
    }
  }

  async function onShellMousedown(event) {
    if (isRowResizeTarget(event)) return
    if (event.button !== 0 || event.detail !== 2) return
    const $grid = getGrid()
    if (!$grid || typeof $grid.getEditCell !== 'function') return
    const active = $grid.getEditCell()
    if (!active) return
    const resolved = resolveCellFromDom(event)
    if (!resolved || ctx.isSameEditCell(active, resolved.row, resolved.column)) return
    event.preventDefault()
    event.stopPropagation()
    shellEditSwitchHandled = true
    lastShellDblclickAt = Date.now()
    await ctx.handleCellDblclick(resolved.row, resolved.column)
  }

  async function onShellDblclick(event) {
    if (shellEditSwitchHandled) {
      shellEditSwitchHandled = false
      return
    }
    const resolved = resolveCellFromDom(event)
    if (!resolved) return
    if (isRowResizeOrBodyGapTarget(event) || ctx.isColumnResizeTarget(event)) return
    event.preventDefault()
    event.stopPropagation()
    lastShellDblclickAt = Date.now()
    await ctx.handleCellDblclick(resolved.row, resolved.column)
  }

  async function enhanceCellClick({ row, column, $event }) {
    if (column && column.type === 'seq') {
      if ($event && ctx.isSeqRowSelectBlockedTarget($event)) return { handled: false }
      if (Date.now() < suppressRowClickUntil) return { handled: true }
      if (rowSelectPointerAt && Date.now() - rowSelectPointerAt < 400) {
        rowSelectPointerAt = 0
        return { handled: true }
      }
      return { handled: false }
    }
    if (!column || !column.field) return { handled: false }
    if (isSwitchingEditCell) return { handled: true }

    const $grid = getGrid()
    if (!$grid) return { handled: false }

    const colIdx = parseInt(String(column.field).slice(1), 10)
    if (Number.isNaN(colIdx) || colIdx < 0) return { handled: false }

    const active = typeof $grid.getEditCell === 'function' ? $grid.getEditCell() : null

    if (active && !ctx.isSameEditCell(active, row, column)) {
      primeCellFocus(row, column)
      ctx.applyCustomSingleCellSelection(row, colIdx)
      cellSwitchOptimisticSelect = true
      await ctx.closeActiveEdit($grid, { fast: true })
      cellSwitchOptimisticSelect = false
      ensureShellFocus()
      return { handled: true }
    }

    primeCellFocus(row, column)
    return { handled: false, colIdx }
  }

  function onCellDblclickGuard() {
    return Date.now() - lastShellDblclickAt < 120
  }

  function bind() {
    bindCellKeyboardInput()
    document.addEventListener('mousedown', onDocumentPointerDown, true)
    document.addEventListener('mousemove', onDocumentRowDragMove, true)
    document.addEventListener('mousemove', onDocumentColDragMove, true)
    document.addEventListener('mouseup', onDocumentRowDragEnd, true)
    document.addEventListener('mouseup', onDocumentColDragEnd, true)
  }

  function unbind() {
    unbindCellKeyboardInput()
    document.removeEventListener('mousedown', onDocumentPointerDown, true)
    document.removeEventListener('mousemove', onDocumentRowDragMove, true)
    document.removeEventListener('mousemove', onDocumentColDragMove, true)
    document.removeEventListener('mouseup', onDocumentRowDragEnd, true)
    document.removeEventListener('mouseup', onDocumentColDragEnd, true)
    rowDragSelectState = null
    colDragSelectState = null
    if (rowAutoHeightMeasureEl && rowAutoHeightMeasureEl.parentNode) {
      rowAutoHeightMeasureEl.parentNode.removeChild(rowAutoHeightMeasureEl)
      rowAutoHeightMeasureEl = null
    }
  }

  return {
    bind,
    unbind,
    primeCellFocus,
    clearFocusedCell,
    ensureShellFocus,
    onShellMousedown,
    onShellDblclick,
    enhanceCellClick,
    onCellDblclickGuard,
    isCellSwitchOptimisticSelect: () => cellSwitchOptimisticSelect,
    getFocusedCell: () => focusedCell,
    shouldSkipHeaderCellClick: () => {
      if (Date.now() < suppressHeaderClickUntil) return true
      if (headerSelectPointerAt && Date.now() - headerSelectPointerAt < 400) {
        headerSelectPointerAt = 0
        return true
      }
      return false
    },
  }
}
