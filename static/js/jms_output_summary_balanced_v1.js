(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function item(label, value, opts) {
        opts = opts || {};
        var cls = 'jms-output-summary-grid__item';
        if (opts.wide) cls += ' jms-output-summary-grid__item--wide';
        if (opts.plan) cls += ' jms-output-summary-grid__item--plan';
        if (opts.sub) cls += ' jms-output-summary-grid__item--sub';
        if (opts.warn) cls += ' jms-output-summary-balanced__item--warn';
        if (opts.err) cls += ' jms-output-summary-balanced__item--err';
        return '<li class="' + cls + '"><span class="jms-output-summary-grid__label">' + esc(label) + '</span><span class="jms-output-summary-grid__value">' + esc(value) + '</span></li>';
    }

    function render(data, jmxText, ctx) {
        var summaryBox = ctx && ctx.summaryBox;
        var summaryList = ctx && ctx.summaryList;
        if (!summaryBox || !summaryList) return;
        var inf = data.influxdb || {};
        var tags = inf.tags || {};
        var items = [];

        if (data.layout === 'scenario' && data.thread_groups && data.thread_groups.length) {
            var stats = (global.JmsOutputSummaryStats && global.JmsOutputSummaryStats.buildScenarioSummaryStats)
                ? global.JmsOutputSummaryStats.buildScenarioSummaryStats(data) : null;
            var totalSteps = stats ? stats.totalHttpSteps : 0;
            var totalExtract = stats ? stats.totalJsonExtract : 0;
            var tgCount = stats ? stats.tgCount : data.thread_groups.length;
            var jmxJson = (global.JmsOutputSummaryStats && global.JmsOutputSummaryStats.countJmxJsonExtractors)
                ? global.JmsOutputSummaryStats.countJmxJsonExtractors(jmxText) : null;
            if (jmxJson != null) totalExtract = jmxJson;

            items.push(item('场景', data.name || '—', { plan: true }));
            items.push(item('线程组', tgCount + ' 个'));
            items.push(item('HTTP 步骤', totalSteps + ' 个'));
            items.push(item('JSON 提取', totalExtract + ' 个'));
            items.push(item('application', inf.application || '—'));
            items.push(item('Backend', inf.enabled === false ? '未启用' : (inf.url || '—'), { wide: true }));
            if (tags.scenario || tags.env) {
                items.push(item('标签', 'scenario=' + (tags.scenario || '—') + ' · env=' + (tags.env || data.env || '—'), { wide: true }));
            }
            var tgRows = stats ? stats.threadGroups : null;
            if (tgRows && tgRows.length) {
                tgRows.forEach(function (row) {
                    items.push(item(row.name, row.users + ' 线程 · ' + row.httpSteps + ' HTTP', { sub: true }));
                });
            } else {
                (data.setup_thread_groups || []).concat(data.thread_groups || []).concat(data.post_thread_groups || []).forEach(function (tg) {
                    if (!tg) return;
                    var httpN = (global.JmxScenarioAdvanced && global.JmxScenarioAdvanced.countStepsRecursive)
                        ? global.JmxScenarioAdvanced.countStepsRecursive(tg.steps || [])
                        : (tg.steps || []).length;
                    items.push(item(tg.name || '—', (tg.load && tg.load.users != null ? tg.load.users : '—') + ' 线程 · ' + httpN + ' HTTP', { sub: true }));
                });
            }
        } else {
            var extractCount = (global.JmsOutputSummaryStats && global.JmsOutputSummaryStats.countJsonExtractRecursive)
                ? global.JmsOutputSummaryStats.countJsonExtractRecursive(data.steps || [])
                : (data.steps || []).filter(function (s) { return s && s.extract; }).length;
            var singleHttp = (global.JmsOutputSummaryStats && global.JmsOutputSummaryStats.countHttpSteps)
                ? global.JmsOutputSummaryStats.countHttpSteps(data.steps || [])
                : (data.steps || []).length;
            items.push(item('场景', data.name || '—', { plan: true }));
            items.push(item('ThreadGroup', (data.load && data.load.users != null ? data.load.users : '—') + ' 线程'));
            items.push(item('爬升 / 时长', (data.load && data.load.spawn_rate != null ? data.load.spawn_rate : '—') + 's · ' + (data.load && data.load.duration_sec != null ? data.load.duration_sec : '—') + 's'));
            items.push(item('HTTP 步骤', singleHttp + ' 个'));
            items.push(item('JSON 提取', extractCount + ' 个'));
            items.push(item('application', (inf.application || '—') + ' · scenario=' + (tags.scenario || '—'), { wide: true }));
            items.push(item('Backend', inf.enabled === false ? '未启用' : (inf.url || '—'), { wide: true }));
        }

        var selfCheck = (global.JmsJmxExportSelfCheckV5 && global.JmsJmxExportSelfCheckV5.getLast)
            ? global.JmsJmxExportSelfCheckV5.getLast() : null;
        if (selfCheck) {
            var level = (selfCheck.hard || 0) > 0 ? 'err' : ((selfCheck.warn || 0) > 0 ? 'warn' : null);
            if (level) {
                items.push(item('导出自检', 'hard ' + (selfCheck.hard || 0) + ' / warn ' + (selfCheck.warn || 0), { sub: true, err: level === 'err', warn: level === 'warn' }));
                (selfCheck.issues || []).slice(0, 3).forEach(function (issue) {
                    if (!issue) return;
                    var tag = issue.level === 'hard' ? '[阻断]' : '[提示]';
                    items.push(item('自检' + tag, issue.msg || '', { sub: true, err: issue.level === 'hard', warn: issue.level === 'warn' }));
                });
            }
        }

        summaryList.className = 'jms-output-summary-grid jms-output-summary-balanced';
        summaryList.innerHTML = items.join('');
        summaryBox.classList.remove('hidden');
        summaryBox.classList.remove('jms-output-summary--compact-v2');
        summaryBox.classList.add('jms-output-summary--balanced-v1');
    }

    global.JmsOutputSummaryBalancedV1 = { render: render };
})(typeof window !== 'undefined' ? window : this);
