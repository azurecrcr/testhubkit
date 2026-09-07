/**
 * 用例工作台双数据源隔离策略（列表 testCasesData / 导图 tcMindmapCasesData）
 * - AI 列表生成：仅写入列表存储
 * - AI 导图生成：仅写入导图存储，不自动同步表格
 * - 显式「表格→导图」转换按钮可跨视图同步
 */
(function (global) {
    'use strict';

    var OUTPUT_LIST = 'list';
    var OUTPUT_MINDMAP = 'mindmap';

    function resetStoreForGeneration(outputTarget) {
        if (typeof global.tcHasAppendGenerationBaseline === 'function' && global.tcHasAppendGenerationBaseline()) {
            return;
        }
        if (outputTarget === OUTPUT_MINDMAP) {
            if (typeof global.tcMindmapExternalMindData !== 'undefined') {
                global.tcMindmapExternalMindData = null;
            }
            if (typeof global.tcMindmapCasesData !== 'undefined') {
                global.tcMindmapCasesData = [];
            }
            if (typeof global.tcMindmapCasesProvenance !== 'undefined') {
                global.tcMindmapCasesProvenance = [];
            }
            return;
        }
        if (typeof global.testCasesData !== 'undefined') {
            global.testCasesData = [];
        }
        if (typeof global.testCasesProvenance !== 'undefined') {
            global.testCasesProvenance = [];
        }
        if (global.markedRows && typeof global.markedRows.clear === 'function') {
            global.markedRows.clear();
        } else if (global.markedRows instanceof Set) {
            global.markedRows = new Set();
        }
        if (global.selectedRows && typeof global.selectedRows.clear === 'function') {
            global.selectedRows.clear();
        }
    }

    /** 导图与表格数据隔离：不自动跨视图同步（显式「表格→导图」按钮除外） */
    var MINDMAP_TABLE_SYNC = 'manual';

    function shouldAutoSyncMindmapToTable() {
        return MINDMAP_TABLE_SYNC !== 'manual';
    }

    function shouldAutoHydrateMindmapFromTable() {
        return MINDMAP_TABLE_SYNC !== 'manual';
    }

    /** 恢复/切换视图时是否允许导图暂存写入列表 testCasesData（默认否） */
    function shouldSyncTableStoreOnMindmapStashRestore() {
        return false;
    }

    global.TcWorkbenchData = {
        OUTPUT_LIST: OUTPUT_LIST,
        OUTPUT_MINDMAP: OUTPUT_MINDMAP,
        MINDMAP_TABLE_SYNC: MINDMAP_TABLE_SYNC,
        resetStoreForGeneration: resetStoreForGeneration,
        shouldAutoSyncMindmapToTable: shouldAutoSyncMindmapToTable,
        shouldAutoHydrateMindmapFromTable: shouldAutoHydrateMindmapFromTable,
        shouldSyncTableStoreOnMindmapStashRestore: shouldSyncTableStoreOnMindmapStashRestore
    };
})(typeof window !== 'undefined' ? window : this);
