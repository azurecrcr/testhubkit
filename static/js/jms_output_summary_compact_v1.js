(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function chip(label, value, cls) {
        var c = 'jms-output-summary-compact__chip' + (cls ? ' ' + cls : '');
        return '<span class="' + c + '"><span class="jms-output-summary-compact__label">' + esc(label) + '</span><span class="jms-output-summary-compact__value">' + esc(value) + '</span></span>';
    }

    function statChip(text, cls) {
        return '<span class="jms-output-summary-compact__chip' + (cls ? ' ' + cls : '') + '">' + esc(text) + '</span>';
    }

    function countHttpSteps(data) {
        if (global.JmsOutputSummaryStats && typeof global.JmsOutputSummaryStats.buildScenarioSummaryStats === 'function') {
            var st = global.JmsOutputSummaryStats.buildScenarioSummaryStats(data);
            if (st) return { http: st.totalHttpSteps, tg: st.tgCount, extract: st.totalJsonExtract };
        }
        var http = 0, extract = 0, tg = 0;
        if (data.layout === 'scenario' && data.thread_groups && data.thread_groups.length) {
            tg = data.thread_groups.length;
            (data.setup_thread_groups || []).forEach(function (g) { http += (g.steps || []).length; });
            data.thread_groups.forEach(function (g) {
                if (global.JmxScenarioAdvanced && global.JmxScenarioAdvanced.countStepsRecursive) {
                    http += global.JmxScenarioAdvanced.countStepsRecursive(g.steps || []);
                } else {
                    http += (g.steps || []).length;
                }
            });
            (data.post_thread_groups || []).forEach(function (g) { http += (g.steps || []).length; });
        } else {
            tg = 1;
            http = (data.steps || []).length;
            extract = (data.steps || []).filter(function (s) { return s && s.extract; }).length;
        }
        if (global.JmsOutputSummaryStats && global.JmsOutputSummaryStats.countJsonExtractRecursive) {
            extract = global.JmsOutputSummaryStats.countJsonExtractRecursive(data.thread_groups ? [].concat.apply([], (data.thread_groups || []).map(function (g) { return g.steps || []; })) : (data.steps || []));
        }
        return { http: http, tg: tg, extract: extract };
    }

    function render(data, jmxText, ctx) {
        var summaryBox = ctx && ctx.summaryBox;
        var summaryList = ctx && ctx.summaryList;
        if (!summaryBox || !summaryList) return;
        var inf = data.influxdb || {};
        var stats = countHttpSteps(data);
        var jmxJson = (global.JmsOutputSummaryStats && global.JmsOutputSummaryStats.countJmxJsonExtractors)
            ? global.JmsOutputSummaryStats.countJmxJsonExtractors(jmxText) : null;
        if (jmxJson != null) stats.extract = jmxJson;

        var parts = [];
        parts.push(statChip(data.name || '—', 'jms-output-summary-compact__chip--name'));
        parts.push('<span class="jms-output-summary-compact__sep" aria-hidden="true">|</span>');
        if (data.layout === 'scenario' && data.thread_groups && data.thread_groups.length) {
            parts.push(statChip(stats.tg + ' 线程组 · ' + stats.http + ' HTTP · ' + stats.extract + ' 提取'));
        } else {
            parts.push(statChip((data.load && data.load.users ? data.load.users : '—') + ' 线程 · ' + stats.http + ' HTTP · ' + stats.extract + ' 提取'));
        }
        var influxShort = inf.enabled === false ? 'Backend 未启用' : ((inf.application || '—') + (inf.url ? ' @ ' + inf.url : ''));
        parts.push('<span class="jms-output-summary-compact__sep" aria-hidden="true">|</span>');
        parts.push(statChip(influxShort));

        var selfCheck = (global.JmsJmxExportSelfCheckV5 && global.JmsJmxExportSelfCheckV5.getLast)
            ? global.JmsJmxExportSelfCheckV5.getLast() : null;
        if (selfCheck && ((selfCheck.hard || 0) > 0 || (selfCheck.warn || 0) > 0)) {
            parts.push('<span class="jms-output-summary-compact__sep" aria-hidden="true">|</span>');
            var cls = (selfCheck.hard || 0) > 0 ? 'jms-output-summary-compact__chip--err' : 'jms-output-summary-compact__chip--warn';
            parts.push(statChip('自检 hard ' + (selfCheck.hard || 0) + ' / warn ' + (selfCheck.warn || 0), cls));
        }

        summaryList.innerHTML = parts.join('');
        summaryBox.classList.remove('hidden');
        summaryBox.classList.add('jms-output-summary--compact-v2');
    }

    global.JmsOutputSummaryCompactV1 = { render: render };
})(typeof window !== 'undefined' ? window : this);
