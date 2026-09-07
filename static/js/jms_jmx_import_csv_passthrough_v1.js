/**
 * JMX 导入 · CSV 路径直通（隔离模块）
 * 保留 JMX 内原始 filename，不要求用户上传 CSV，不校验文件是否存在。
 */
(function (global) {
    'use strict';

    function trimStr(v) {
        return v == null ? '' : String(v).trim();
    }

    function applyCsvPassthrough(csv) {
        if (!csv || typeof csv !== 'object') return;
        var src = trimStr(csv.source_path);
        if (!src) src = trimStr(csv.filename);
        if (!src) return;
        csv.filename = src;
        csv.source_path = src;
        csv.file_content = '';
    }

    function walkStepsCsv(steps) {
        (steps || []).forEach(function (step) {
            if (!step || typeof step !== 'object') return;
            if (step.type === 'catalog_element' && step.alias === 'CSVDataSet' && step.catalog_props) {
                applyCsvPassthrough(step.catalog_props);
            }
            if (step.catalog_props && step.alias === 'CSVDataSet') {
                applyCsvPassthrough(step.catalog_props);
            }
            if (Array.isArray(step.catalog_hash_children)) walkStepsCsv(step.catalog_hash_children);
            if (Array.isArray(step.children)) walkStepsCsv(step.children);
        });
    }

    function passthroughCsvInScenario(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        var groups = (scenario.setup_thread_groups || [])
            .concat(scenario.thread_groups || [])
            .concat(scenario.post_thread_groups || []);
        groups.forEach(function (tg) {
            if (!tg) return;
            if (tg.http_managers && tg.http_managers.csv_data_set) {
                applyCsvPassthrough(tg.http_managers.csv_data_set);
            }
            (tg.config_items || []).forEach(function (item) {
                if (!item || item.type !== 'csv_data_set' || !item.data) return;
                applyCsvPassthrough(item.data);
            });
            walkStepsCsv(tg.steps);
        });
        walkStepsCsv(scenario.plan_catalog_items);
        return scenario;
    }

    function stripCsvAttachments(report) {
        if (!report || typeof report !== 'object') return report;
        report.csvAttachments = [];
        return report;
    }

    function hideCsvPanel() {
        if (!global.document) return;
        var panel = global.document.getElementById('jmx-import-csv-panel');
        if (panel) panel.classList.add('hidden');
        var list = global.document.getElementById('jmx-import-csv-list');
        if (list) list.innerHTML = '';
    }

    function patchParser() {
        var P = global.JmxImportParser;
        if (!P || P.__csvPassthroughV1) return;
        P.__csvPassthroughV1 = true;

        if (typeof P.parseJmxXml === 'function') {
            var origParse = P.parseJmxXml;
            P.parseJmxXml = function (xml, opts) {
                var scenario = origParse(xml, opts);
                passthroughCsvInScenario(scenario);
                if (scenario && scenario._import_report) {
                    stripCsvAttachments(scenario._import_report);
                }
                return scenario;
            };
        }

        if (typeof P.buildImportReport === 'function') {
            var origReport = P.buildImportReport;
            P.buildImportReport = function (scenario, meta) {
                passthroughCsvInScenario(scenario);
                return stripCsvAttachments(origReport(scenario, meta));
            };
        }
    }

    function patchModalUi() {
        var UI = global.JmxImportModalUi;
        if (!UI || UI.__csvPassthroughV1) return;
        UI.__csvPassthroughV1 = true;

        if (typeof UI.renderCsvList === 'function') {
            UI.renderCsvList = function (listEl) {
                if (listEl) listEl.innerHTML = '';
                hideCsvPanel();
            };
        }

        if (typeof UI.applyCsvFilesToVisualBuilder === 'function') {
            UI.applyCsvFilesToVisualBuilder = function () {
                return Promise.resolve({});
            };
        }

        if (typeof UI.renderSummary === 'function') {
            var origSummary = UI.renderSummary;
            UI.renderSummary = function (el, summary) {
                if (summary) stripCsvAttachments(summary);
                return origSummary(el, summary);
            };
        }
    }

    function patchScenarioAdvanced() {
        var A = global.JmxScenarioAdvanced;
        if (!A || A.__csvPassthroughV1 || typeof A.formatImportReport !== 'function') return;
        A.__csvPassthroughV1 = true;
        var origFmt = A.formatImportReport;
        A.formatImportReport = function (summary) {
            if (summary) stripCsvAttachments(summary);
            return origFmt(summary);
        };
    }

    function boot() {
        patchParser();
        patchModalUi();
        patchScenarioAdvanced();
    }

    global.JmsJmxImportCsvPassthroughV1 = {
        applyCsvPassthrough: applyCsvPassthrough,
        passthroughCsvInScenario: passthroughCsvInScenario,
        stripCsvAttachments: stripCsvAttachments,
        patch: boot
    };

    boot();
}(typeof window !== 'undefined' ? window : this));
