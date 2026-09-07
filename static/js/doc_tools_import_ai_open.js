/**
 * 智能编辑 · 导入 Excel 后自动打开 AI 助手（仅 doc-tools-page，与其他功能完全隔离）
 */
(function (global) {
    'use strict';

    if (!document.body || !document.body.classList.contains('doc-tools-page')) return;

    var openTimer = null;

    function openAiPanelAfterImport() {
        if (openTimer) return;
        openTimer = global.setTimeout(function () {
            openTimer = null;
            try {
                if (global.DocToolsAiPanel && typeof global.DocToolsAiPanel.syncImportState === 'function') {
                    global.DocToolsAiPanel.syncImportState(true);
                }
                if (global.DocToolsAiPanel && typeof global.DocToolsAiPanel.open === 'function') {
                    global.DocToolsAiPanel.open();
                    return;
                }
            } catch (e1) { /* fallback below */ }
            var fab = document.getElementById('cf-doc-ai-fab');
            var panel = document.getElementById('cf-doc-ai-panel');
            if (fab) {
                fab.classList.remove('hidden');
                fab.setAttribute('aria-expanded', 'true');
            }
            if (panel) {
                panel.classList.remove('hidden');
                panel.setAttribute('aria-hidden', 'false');
            }
        }, 280);
    }

    global.__openDocToolsAiPanelAfterImport = openAiPanelAfterImport;

    document.addEventListener('doc-tools-excel-imported', function () {
        openAiPanelAfterImport();
    });
})(typeof window !== 'undefined' ? window : globalThis);
