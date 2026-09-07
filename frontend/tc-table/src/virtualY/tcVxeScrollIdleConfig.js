/**
 * 用例工作台 VXE 滚动空闲优化 — 独立配置（不改 VirtualY 旧默认语义）。
 * window.TC_VXE_VIRTUAL_Y.scrollIdle* 字段可覆盖；关闭 scrollIdleEnabled 即回旧 48ms 调度。
 */

import { ensureTcVxeVirtualYGlobalDefaults } from './tcVxeVirtualYConfig.js'

export const TC_VXE_SCROLL_IDLE_DEFAULTS = {
  scrollIdleEnabled: true,
  scrollIdleMs: 120,
  scrollIdleMaxWaitMs: 400,
  scrollIdleTuneBuffer: false,
  scrollIdleOSize: 10,
  scrollIdleRSize: 24,
}

function getGlobal() {
  return typeof window !== 'undefined' ? window : globalThis
}

/** 将 ScrollIdle 默认字段合并进 TC_VXE_VIRTUAL_Y（不覆盖已有显式配置） */
export function ensureTcVxeScrollIdleGlobalDefaults() {
  ensureTcVxeVirtualYGlobalDefaults()
  const g = getGlobal()
  const raw = g.TC_VXE_VIRTUAL_Y
  if (!raw || typeof raw !== 'object') return
  Object.keys(TC_VXE_SCROLL_IDLE_DEFAULTS).forEach((key) => {
    if (raw[key] === undefined) raw[key] = TC_VXE_SCROLL_IDLE_DEFAULTS[key]
  })
}

export function tcVxeReadScrollIdleConfig() {
  ensureTcVxeScrollIdleGlobalDefaults()
  const raw = (getGlobal().TC_VXE_VIRTUAL_Y && typeof getGlobal().TC_VXE_VIRTUAL_Y === 'object')
    ? getGlobal().TC_VXE_VIRTUAL_Y
    : {}
  return {
    enabled: raw.scrollIdleEnabled !== false,
    idleMs: typeof raw.scrollIdleMs === 'number' ? raw.scrollIdleMs : TC_VXE_SCROLL_IDLE_DEFAULTS.scrollIdleMs,
    maxWaitMs: typeof raw.scrollIdleMaxWaitMs === 'number'
      ? raw.scrollIdleMaxWaitMs
      : TC_VXE_SCROLL_IDLE_DEFAULTS.scrollIdleMaxWaitMs,
    tuneBuffer: raw.scrollIdleTuneBuffer === true,
    oSize: typeof raw.scrollIdleOSize === 'number' ? raw.scrollIdleOSize : TC_VXE_SCROLL_IDLE_DEFAULTS.scrollIdleOSize,
    rSize: typeof raw.scrollIdleRSize === 'number' ? raw.scrollIdleRSize : TC_VXE_SCROLL_IDLE_DEFAULTS.scrollIdleRSize,
  }
}

/** ScrollIdle 总开关（新方法） */
export function tcVxeIsScrollIdleEnabled() {
  return tcVxeReadScrollIdleConfig().enabled === true
}

/**
 * 供来源轨等非模块脚本判断（挂到 window，避免改旧 schedule 语义时无配置可读）。
 */
export function tcVxeInstallScrollIdleGlobalHelpers() {
  ensureTcVxeScrollIdleGlobalDefaults()
  const g = getGlobal()
  g.tcVxeIsScrollIdleEnabled = tcVxeIsScrollIdleEnabled
  g.tcVxeReadScrollIdleConfig = tcVxeReadScrollIdleConfig
}

/**
 * ScrollIdle 可选缓冲配置（新 builder，不改 tcVxeBuildScrollYConfigVirtual）。
 * 仅当 scrollIdleTuneBuffer===true 时使用更小 oSize/rSize。
 */
export function tcVxeBuildScrollYConfigVirtualScrollIdle() {
  const cfg = tcVxeReadScrollIdleConfig()
  return {
    enabled: true,
    gt: 0,
    oSize: cfg.oSize,
    rSize: cfg.rSize,
  }
}
