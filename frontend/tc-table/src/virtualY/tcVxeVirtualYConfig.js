/**
 * 用例工作台 VXE 纵向虚拟滚动 — 配置与开关（独立模块，不改业务旧逻辑）。
 * window.TC_VXE_VIRTUAL_Y = { enabled, forceWorkbench, gt, oSize, rSize, minHeight }
 */

export const TC_VXE_VIRTUAL_Y_DEFAULTS = {
  enabled: true,
  forceWorkbench: true,
  gt: 0,
  oSize: 15,
  rSize: 30,
  minHeight: 280,
  rowThreshold: 10,
}

function getGlobal() {
  return typeof window !== 'undefined' ? window : globalThis
}

export function tcVxeReadVirtualYConfig() {
  const raw = (getGlobal().TC_VXE_VIRTUAL_Y && typeof getGlobal().TC_VXE_VIRTUAL_Y === 'object')
    ? getGlobal().TC_VXE_VIRTUAL_Y
    : {}
  return {
    enabled: raw.enabled !== false,
    forceWorkbench: raw.forceWorkbench !== false,
    gt: typeof raw.gt === 'number' ? raw.gt : TC_VXE_VIRTUAL_Y_DEFAULTS.gt,
    oSize: typeof raw.oSize === 'number' ? raw.oSize : TC_VXE_VIRTUAL_Y_DEFAULTS.oSize,
    rSize: typeof raw.rSize === 'number' ? raw.rSize : TC_VXE_VIRTUAL_Y_DEFAULTS.rSize,
    minHeight: typeof raw.minHeight === 'number' ? raw.minHeight : TC_VXE_VIRTUAL_Y_DEFAULTS.minHeight,
    rowThreshold: typeof raw.rowThreshold === 'number' ? raw.rowThreshold : TC_VXE_VIRTUAL_Y_DEFAULTS.rowThreshold,
  }
}

/** 总开关：关闭后工作台也不走虚拟滚动（回滚用） */
export function tcVxeIsVirtualYFlagEnabled() {
  return tcVxeReadVirtualYConfig().enabled === true
}

/**
 * 是否启用纵向虚拟滚动（新方法，供 Virtual 路径专用）。
 * @param {{ isWorkbench?: boolean, hasBoundedHeight?: boolean, displayRowCount?: number }} ctx
 */
export function tcVxeShouldUseVirtualY(ctx = {}) {
  const cfg = tcVxeReadVirtualYConfig()
  if (!cfg.enabled) return false
  if (cfg.forceWorkbench && ctx.isWorkbench) return true
  if (ctx.hasBoundedHeight) return true
  const count = typeof ctx.displayRowCount === 'number' ? ctx.displayRowCount : 0
  return count >= cfg.rowThreshold
}

export function tcVxeBuildScrollYConfigVirtual() {
  const cfg = tcVxeReadVirtualYConfig()
  return {
    enabled: true,
    gt: cfg.gt,
    oSize: cfg.oSize,
    rSize: cfg.rSize,
  }
}

export function tcVxeBuildScrollYConfigDisabled() {
  return { enabled: false }
}

export function ensureTcVxeVirtualYGlobalDefaults() {
  const g = getGlobal()
  if (!g.TC_VXE_VIRTUAL_Y || typeof g.TC_VXE_VIRTUAL_Y !== 'object') {
    g.TC_VXE_VIRTUAL_Y = Object.assign({}, TC_VXE_VIRTUAL_Y_DEFAULTS)
  }
}
