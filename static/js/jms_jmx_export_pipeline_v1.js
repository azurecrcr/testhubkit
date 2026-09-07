/**
 * JMX 导出管道状态机 V1（export-only，隔离）
 */
(function (global) {
    'use strict';
    var STAGES = ['BASE_PREPARE', 'SNAPSHOT', 'MERGE_MATERIALIZE', 'CATALOG_SANITIZE', 'HTTP_DEDUPE', 'SCRIPT_SANITIZE', 'READY_FOR_GEN'];
    function markStage(data, stage) {
        if (!data || typeof data !== 'object') return data;
        data.__jmx_export_pipeline_state = data.__jmx_export_pipeline_state || {};
        data.__jmx_export_pipeline_state[stage] = { at: Date.now() };
        return data;
    }
    function isReady(data) {
        return !!(data && data.__jmx_export_pipeline_state && data.__jmx_export_pipeline_state.READY_FOR_GEN);
    }
    global.JmsJmxExportPipelineV1 = { STAGES: STAGES, markStage: markStage, isReady: isReady };
}(typeof window !== 'undefined' ? window : this));
