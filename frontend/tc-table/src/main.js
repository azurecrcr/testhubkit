import { createApp, nextTick } from 'vue'
import VxeUITable from 'vxe-table'
import 'vxe-table/lib/style.css'
import VxeUI from 'vxe-pc-ui'
import 'vxe-pc-ui/lib/style.css'
import TcTableApp from './TcTableApp.vue'
import {
  ensureTcVxeVirtualYGlobalDefaults,
  tcVxeIsVirtualYFlagEnabled,
} from './virtualY/tcVxeVirtualYConfig.js'
import {
  ensureTcVxeScrollIdleGlobalDefaults,
  tcVxeInstallScrollIdleGlobalHelpers,
} from './virtualY/tcVxeScrollIdleConfig.js'

ensureTcVxeVirtualYGlobalDefaults()
ensureTcVxeScrollIdleGlobalDefaults()
tcVxeInstallScrollIdleGlobalHelpers()

function getGlobal() {
  return typeof window !== 'undefined' ? window : globalThis
}

const state = {
  visible: false,
  pendingOpen: false,
  syncTimer: null,
  app: null,
  api: null,
  bridgeApi: null,
  bridgeWaiters: [],
}

function getColumns() {
  const g = getGlobal()
  return g.tableColumns && g.tableColumns.length ? g.tableColumns.slice() : []
}

function ensurePanelVisible() {
  const panel = document.getElementById('tc-vxe-table-view-panel')
  if (panel) {
    panel.classList.remove('hidden')
    panel.setAttribute('aria-hidden', 'false')
  }
  state.visible = true
}

function resolveBridgeWaiters() {
  const waiters = state.bridgeWaiters.splice(0)
  waiters.forEach((fn) => {
    try { fn(state.bridgeApi) } catch (e) { /* ignore */ }
  })
}


function afterBridgeReady() {
  if (getGlobal().TcTableBridge && typeof getGlobal().TcTableBridge.registerViewBridge === 'function') {
    getGlobal().TcTableBridge.registerViewBridge()
  }
}

function setBridgeApi(api) {
  state.bridgeApi = api
  getGlobal().TcTableView._bridge = api
  getGlobal().tcVxeTableApi = {
    async recalculate() {
      const bridge = state.bridgeApi
      if (bridge && typeof bridge.recalculate === 'function') {
        return bridge.recalculate()
      }
      return false
    },
  }
  resolveBridgeWaiters()
  afterBridgeReady()
}

function waitForBridge(timeoutMs = 4000) {
  if (state.bridgeApi) return Promise.resolve(state.bridgeApi)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(state.bridgeApi), timeoutMs)
    state.bridgeWaiters.push((api) => {
      window.clearTimeout(timer)
      resolve(api)
    })
  })
}

function ensureMountEl() {
  let mount = document.getElementById('tc-vxe-table-mount')
  if (mount) return mount
  const panel = document.getElementById('tc-vxe-table-view-panel')
  if (!panel) return null
  mount = document.createElement('div')
  mount.id = 'tc-vxe-table-mount'
  mount.className = 'tc-vxe-table-mount'
  panel.appendChild(mount)
  return mount
}

function bridgeUsesVirtualY(bridge) {
  if (bridge && typeof bridge.shouldUseVirtualYMode === 'function') {
    try { return bridge.shouldUseVirtualYMode() === true } catch (e) { /* ignore */ }
  }
  return tcVxeIsVirtualYFlagEnabled()
}

function mountApp() {
  if (state.app) return state.api
  const mount = ensureMountEl()
  if (!mount) return null
  const app = createApp(TcTableApp, {
    onBridgeReady: setBridgeApi,
  })
  app.use(VxeUI)
  app.use(VxeUITable)
  app.mount(mount)
  state.app = app
  state.api = {
    async refresh(opts = {}) {
      await nextTick()
      const bridge = await waitForBridge()
      if (!bridge) return false
      if (bridgeUsesVirtualY(bridge) && typeof bridge.applyDataVirtual === 'function') {
        return bridge.applyDataVirtual(opts)
      }
      if (!bridgeUsesVirtualY(bridge) && typeof bridge.applyDataLegacy === 'function') {
        return bridge.applyDataLegacy(opts)
      }
      return bridge.applyData(opts)
    },
    async pullRows() {
      await nextTick()
      const bridge = await waitForBridge()
      if (!bridge) return false
      if (bridgeUsesVirtualY(bridge) && typeof bridge.pullToGlobalVirtual === 'function') {
        return bridge.pullToGlobalVirtual()
      }
      if (!bridgeUsesVirtualY(bridge) && typeof bridge.pullToGlobalLegacy === 'function') {
        return bridge.pullToGlobalLegacy()
      }
      return bridge.pullToGlobal()
    },
    async scrollToRow(rowIndex) {
      await nextTick()
      const bridge = await waitForBridge()
      if (!bridge) return false
      if (bridgeUsesVirtualY(bridge) && typeof bridge.scrollToRowIndexVirtual === 'function') {
        return bridge.scrollToRowIndexVirtual(rowIndex)
      }
      if (!bridgeUsesVirtualY(bridge) && typeof bridge.scrollToRowIndexLegacy === 'function') {
        return bridge.scrollToRowIndexLegacy(rowIndex)
      }
      return bridge.scrollToRowIndex(rowIndex)
    },
    destroy() {
      if (state.app) {
        state.app.unmount()
        state.app = null
      }
      state.api = null
      state.bridgeApi = null
      const mountEl = document.getElementById('tc-vxe-table-mount')
      if (mountEl) mountEl.innerHTML = ''
    },
  }
  return state.api
}

function openEditor(opts = {}) {
  if (!getColumns().length) return Promise.resolve(false)
  ensurePanelVisible()
  state.pendingOpen = true
  const g = getGlobal()
  if (opts.keepRows === false && g.testCasesData) g.testCasesData = []
  const api = mountApp()
  if (!api) {
    state.pendingOpen = false
    return Promise.resolve(false)
  }
  const fitColumns = opts.fitColumns === true || opts.layoutColumns === true || opts.resetColumnLayout === true
  return waitForBridge().then(() => api.refresh({ reload: true, immediate: true, fitColumns })).then((ok) => {
    state.pendingOpen = false
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return ok
  }).catch((err) => {
    state.pendingOpen = false
    if (typeof g.tcAppToast === 'function') {
      g.tcAppToast(err.message || '表格加载失败', { variant: 'error', duration: 4000 })
    }
    return false
  })
}

function syncFromData(opts = {}) {
  opts = opts || {}
  if (!getColumns().length) return Promise.resolve(false)
  if (state.pendingOpen) return Promise.resolve(false)
  if (!state.api) return openEditor(opts)
  if (state.syncTimer) window.clearTimeout(state.syncTimer)
  return new Promise((resolve) => {
    state.syncTimer = window.setTimeout(() => {
      state.syncTimer = null
      waitForBridge().then((bridge) => {
        if (!bridge) return resolve(false)
        return state.api.refresh({
          reload: opts.reload !== false,
          immediate: opts.immediate === true,
          skipProvenance: opts.skipProvenance === true,
          preserveScroll: opts.preserveScroll === true,
        })
      }).then(resolve).catch(() => resolve(false))
    }, opts.immediate ? 0 : 120)
  })
}

/** 虚拟滚动专用同步入口（不改 syncFromData 签名/调用方） */
function syncFromDataVirtual(opts = {}) {
  return syncFromData(opts)
}

function pullRowsFromTable() {
  if (!state.api) return Promise.resolve(false)
  return state.api.pullRows()
}

function pullRowsVirtual() {
  return pullRowsFromTable()
}

function onViewShow() {
  state.visible = true
  ensurePanelVisible()
  if (!state.api && getColumns().length) openEditor()
  else if (state.api) state.api.refresh({ reload: false, immediate: true })
}

function onViewHide() {
  state.visible = false
  if (state.api) state.api.pullRows()
}

function resetDocument() {
  if (state.syncTimer) {
    window.clearTimeout(state.syncTimer)
    state.syncTimer = null
  }
  if (state.api) state.api.destroy()
}

function scrollToRow(rowIndex) {
  if (!state.api) return Promise.resolve(false)
  return state.api.scrollToRow(rowIndex)
}

function scrollToRowVirtual(rowIndex) {
  return scrollToRow(rowIndex)
}

const bridge = {
  open: openEditor,
  syncFromData,
  syncFromDataVirtual,
  pullRows: pullRowsFromTable,
  pullRowsVirtual,
  reset: resetDocument,
  onViewShow,
  onViewHide,
  getDocId: () => null,
  scrollToRow,
  scrollToRowVirtual,
}

getGlobal().TcTableView = bridge
function bootWhenReady() {
  if (!document.getElementById('tc-vxe-table-view-panel')) return
  window.setTimeout(function () {
    ensurePanelVisible()
    mountApp()
  }, 60)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootWhenReady)
} else {
  bootWhenReady()
}
