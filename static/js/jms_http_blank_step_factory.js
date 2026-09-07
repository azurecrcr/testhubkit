/**
 * HTTP 空白步骤工厂（隔离模块）
 * 用户主动添加 HTTP 请求时使用，不预置断言/定时器/用户参数。
 */
(function (global) {
    'use strict';

    function createBlankHttpStep(uid) {
        var idFn = typeof uid === 'function' ? uid : function () {
            return 'jms-' + Math.random().toString(36).slice(2, 10);
        };
        return {
            id: idFn(),
            name: 'HTTP 请求',
            method: 'GET',
            path: '/',
            encoding: '',
            body_content_mode: 'json',
            body_type: 'none',
            body: '',
            body_params: [],
            multipart_fields: [],
            upload_files: [],
            headers: [],
            query: [],
            extract_json_path: '',
            extract_var: '',
            extractors: [],
            assert_status: '',
            assertions: [],
            step_listeners: { view_results_tree: false, aggregate_report: false },
            step_listener_items: [],
            processors: [],
            pre_processors: [],
            logic_controllers: [],
            editMode: 'form'
        };
    }

    global.JmsHttpBlankStepFactory = {
        createBlankHttpStep: createBlankHttpStep
    };
})(typeof window !== 'undefined' ? window : this);
