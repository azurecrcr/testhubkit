(function (global) {
    'use strict';

    function isLogicContainer(st) {
        if (global.JmxScenarioAdvanced && typeof global.JmxScenarioAdvanced.isLogicContainer === 'function') {
            return global.JmxScenarioAdvanced.isLogicContainer(st);
        }
        var t = st && st.type;
        return t === 'if_controller' || t === 'loop_controller' || t === 'while_controller' ||
            t === 'foreach_controller' || t === 'transaction_controller' || t === 'simple_controller' ||
            t === 'random_controller' || t === 'switch_controller';
    }

    function countHttpSteps(steps) {
        if (global.JmxScenarioAdvanced && typeof global.JmxScenarioAdvanced.countStepsRecursive === 'function') {
            return global.JmxScenarioAdvanced.countStepsRecursive(steps);
        }
        var n = 0;
        (steps || []).forEach(function (st) {
            if (!st) return;
            if (isLogicContainer(st)) n += countHttpSteps(st.children);
            else if (st.method) n += 1;
        });
        return n;
    }

    function countJsonExtractRecursive(steps) {
        var n = 0;
        (steps || []).forEach(function (st) {
            if (!st) return;
            if (st.extract && st.extract.json_path) n += 1;
            if (Array.isArray(st.extractors)) {
                st.extractors.forEach(function (ex) {
                    if (ex && ex.json_path) n += 1;
                });
            }
            if (isLogicContainer(st)) n += countJsonExtractRecursive(st.children);
        });
        return n;
    }

    function pushThreadGroupRows(rows, list) {
        (list || []).forEach(function (tg) {
            if (!tg) return;
            var load = tg.load || {};
            rows.push({
                name: tg.name || '—',
                users: load.users != null ? load.users : '—',
                httpSteps: countHttpSteps(tg.steps || [])
            });
        });
    }

    function buildScenarioSummaryStats(data) {
        if (!data || typeof data !== 'object') {
            return { tgCount: 0, totalHttpSteps: 0, totalJsonExtract: 0, threadGroups: [] };
        }
        var rows = [];
        pushThreadGroupRows(rows, data.setup_thread_groups);
        pushThreadGroupRows(rows, data.thread_groups);
        pushThreadGroupRows(rows, data.post_thread_groups);

        var totalHttp = 0;
        var totalJson = 0;
        rows.forEach(function (row) { totalHttp += row.httpSteps; });
        (data.setup_thread_groups || []).concat(data.thread_groups || []).concat(data.post_thread_groups || []).forEach(function (tg) {
            totalJson += countJsonExtractRecursive(tg.steps || []);
        });

        return {
            tgCount: rows.length,
            totalHttpSteps: totalHttp,
            totalJsonExtract: totalJson,
            threadGroups: rows
        };
    }


    function countJmxJsonExtractors(jmxText) {
        if (!jmxText) return null;
        var m = String(jmxText).match(/testclass=\"JSONPostProcessor\"/g);
        return m ? m.length : 0;
    }

    global.JmsOutputSummaryStats = {
        buildScenarioSummaryStats: buildScenarioSummaryStats,
        countHttpSteps: countHttpSteps,
        countJsonExtractRecursive: countJsonExtractRecursive,
        countJmxJsonExtractors: countJmxJsonExtractors
    };
})(typeof window !== 'undefined' ? window : this);
