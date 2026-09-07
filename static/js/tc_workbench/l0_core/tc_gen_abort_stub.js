/**
 * 智能生成模块移除后的兼容桩：供 Agent 流式/质量检查等共用逻辑安全调用。
 */
(function (global) {
    'use strict';

    if (typeof global.syncTcPromptSendBtnState !== 'function') {
        global.syncTcPromptSendBtnState = function () {};
    }

    if (typeof global.abortActiveGenerationRun !== 'function') {
        global.abortActiveGenerationRun = function () {
            if (global.TcGenerationStreamClient &&
                typeof global.TcGenerationStreamClient.cancel === 'function') {
                global.TcGenerationStreamClient.cancel();
            }
            if (global.TcAgentOrchestrator &&
                typeof global.TcAgentOrchestrator.cancelAgentJob === 'function') {
                global.TcAgentOrchestrator.cancelAgentJob();
            }
        };
    }
})(typeof window !== 'undefined' ? window : this);
