import { createApp } from 'vue'
import VxeUITable from 'vxe-table'
import 'vxe-table/lib/style.css'
import VxeUI from 'vxe-pc-ui'
import 'vxe-pc-ui/lib/style.css'
import DtkSheetApp from './DtkSheetApp.vue'

function getGlobal() {
  return typeof window !== 'undefined' ? window : globalThis
}

const state = {
  app: null,
  api: null,
  pendingLoads: [],
}

function flushPendingLoads() {
  if (!state.api || typeof state.api.loadFromMatrix !== 'function') return
  const queue = state.pendingLoads.splice(0)
  queue.forEach((item) => {
    try {
      if (item.type === 'load') state.api.loadFromMatrix(item.matrix)
      else if (item.type === 'reset') state.api.resetSheet()
    } catch (err) {
      if (typeof item.reject === 'function') item.reject(err)
      return
    }
    if (typeof item.resolve === 'function') item.resolve(state.api)
  })
}

function mountApp() {
  if (state.app) return state.api
  const mount = document.getElementById('dtk-vxe-table-mount')
  if (!mount) return null

  const app = createApp(DtkSheetApp, {
    onReady(api) {
      state.api = api
      flushPendingLoads()
    },
  })
  app.use(VxeUI)
  app.use(VxeUITable)
  app.mount(mount)
  state.app = app
  return state.api
}

function ensureReady() {
  mountApp()
  if (state.api) return Promise.resolve(state.api)
  return new Promise((resolve, reject) => {
    let tries = 0
    const timer = setInterval(() => {
      if (state.api) {
        clearInterval(timer)
        resolve(state.api)
      } else if (++tries > 120) {
        clearInterval(timer)
        reject(new Error('表格初始化超时'))
      }
    }, 50)
  })
}

function loadFromMatrix(matrix) {
  return ensureReady().then((api) => {
    if (api && typeof api.loadFromMatrix === 'function') {
      api.loadFromMatrix(matrix)
      return api
    }
    return new Promise((resolve, reject) => {
      state.pendingLoads.push({ type: 'load', matrix, resolve, reject })
    })
  })
}

function resetSheet() {
  return ensureReady().then((api) => {
    if (api && typeof api.resetSheet === 'function') {
      api.resetSheet()
      return api
    }
    return new Promise((resolve, reject) => {
      state.pendingLoads.push({ type: 'reset', resolve, reject })
    })
  })
}

function exportToMatrix() {
  return ensureReady().then((api) => {
    if (api && typeof api.exportToMatrix === 'function') {
      return api.exportToMatrix()
    }
    return []
  })
}

function bootDocToolsVxeTable() {
  if (!document.body.classList.contains('doc-tools-page')) return
  if (!document.getElementById('dtk-vxe-table-mount')) return
  mountApp()
}

getGlobal().DocToolsVxeTable = {
  init: mountApp,
  getApi: () => state.api,
  ensureReady,
  loadFromMatrix,
  resetSheet,
  exportToMatrix,
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootDocToolsVxeTable)
} else {
  bootDocToolsVxeTable()
}
