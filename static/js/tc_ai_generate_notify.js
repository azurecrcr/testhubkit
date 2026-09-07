/**
 * AI 生成成功后的批次条通知（从内联脚本抽离）
 */
(function (global) {
    'use strict';

    function notifyGenerationSuccess(rowCount, outputTarget, scope, extraMeta) {
        if (!rowCount) return;
        var isMindmap = outputTarget === 'mindmap';
        var core = global.tcGenBatchCore;
        var batchReady = !!(core && core.state && core.state.batchId && core.state.batchRowCount > 0);
        if (core) {
            if (batchReady) {
                if (isMindmap && typeof core.refreshMindmapGenerationBatch === 'function') {
                    core.refreshMindmapGenerationBatch(rowCount);
                } else if (!isMindmap && typeof core.refreshGenerationBatch === 'function') {
                    core.refreshGenerationBatch(rowCount);
                }
            } else if (isMindmap && typeof core.onMindmapGeneration === 'function') {
                core.onMindmapGeneration(rowCount);
            } else if (!isMindmap && typeof core.onGeneration === 'function') {
                core.onGeneration(rowCount);
            }
        }
        if (typeof global.tcInitGenBatchBarUi === 'function') {
            global.tcInitGenBatchBarUi();
        }
        var meta = { rowCount: rowCount, outputTarget: outputTarget, scope: scope };
        if (extraMeta && typeof extraMeta === 'object') {
            Object.keys(extraMeta).forEach(function (key) {
                meta[key] = extraMeta[key];
            });
        }
        if (meta.scope === 'legacy_freeform' && meta.userPrompt &&
            typeof global.pushTcGenUserPromptToHistory === 'function') {
            var batchId = global.tcGenBatchCore && global.tcGenBatchCore.state &&
                global.tcGenBatchCore.state.batchId;
            global.pushTcGenUserPromptToHistory(meta.userPrompt, batchId);
        }
        function fire() {
            if (global.TcWorkbenchEnhancements && typeof global.TcWorkbenchEnhancements.onGenerationSuccess === 'function') {
                if (typeof global.TcWorkbenchEnhancements.ensureInit === 'function') {
                    global.TcWorkbenchEnhancements.ensureInit();
                }
                global.TcWorkbenchEnhancements.onGenerationSuccess(meta);
                return true;
            }
            return false;
        }
        if (fire()) return;
        var tries = 0;
        var timer = global.setInterval(function () {
            if (fire() || ++tries >= 60) global.clearInterval(timer);
        }, 100);
    }

    global.tcNotifyListGenerationSuccess = notifyGenerationSuccess;

    global.tcCaptureGenAutoValidateForTask = function () {
        return false;
    };
})(typeof window !== 'undefined' ? window : this);
