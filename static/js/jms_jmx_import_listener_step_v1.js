/**
 * JMX 导入 · 线程组级监听器按时间线写入 steps（隔离模块，不影响导出）
 */
(function (global) {
    'use strict';

    var LISTENER_MAP = {
        ViewResultsFullVisualizer: {
            alias: 'ViewResultsFullVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'ViewResultsFullVisualizer',
            category: 'listener',
            label_zh: '查看结果树'
        },
        StatVisualizer: {
            alias: 'StatVisualizer',
            testclass: 'ResultCollector',
            guiclass: 'StatVisualizer',
            category: 'listener',
            label_zh: '聚合报告'
        },
        BackendListenerGui: {
            alias: 'BackendListener',
            testclass: 'BackendListener',
            guiclass: 'BackendListenerGui',
            category: 'listener',
            label_zh: '后端监听器'
        },
        MailerVisualizer: {
            alias: 'MailerResultCollector',
            testclass: 'MailerResultCollector',
            guiclass: 'MailerVisualizer',
            category: 'listener',
            label_zh: '邮件观察仪'
        }
    };

    function isEnabled(node) {
        return node.getAttribute('enabled') !== 'false';
    }

    function getStringProp(node, name) {
        if (!node) return '';
        var el = node.querySelector('stringProp[name="' + name + '"]');
        return el && el.textContent != null ? String(el.textContent) : '';
    }

    function getBoolProp(node, name, fallback) {
        if (!node) return !!fallback;
        var el = node.querySelector('boolProp[name="' + name + '"]');
        if (!el || el.textContent == null || el.textContent === '') return !!fallback;
        return String(el.textContent).toLowerCase() === 'true';
    }

    function buildCatalogProps(node, gui, tc) {
        if (tc === 'BackendListener') {
            if (global.JmsBackendListenerJmx && typeof global.JmsBackendListenerJmx.parseBackendListenerEl === 'function') {
                return global.JmsBackendListenerJmx.parseBackendListenerEl(node) || {};
            }
            return { name: node.getAttribute('testname') || '后端监听器' };
        }
        if (tc === 'ResultCollector' && gui === 'ViewResultsFullVisualizer') {
            if (global.JmsTgViewResultsTreeJmx && typeof global.JmsTgViewResultsTreeJmx.parseFromJmxNode === 'function') {
                return global.JmsTgViewResultsTreeJmx.parseFromJmxNode(node) || {};
            }
        }
        if (tc === 'ResultCollector' && gui === 'StatVisualizer') {
            if (global.JmsTgAggregateReportJmx && typeof global.JmsTgAggregateReportJmx.parseFromJmxNode === 'function') {
                return global.JmsTgAggregateReportJmx.parseFromJmxNode(node) || {};
            }
        }
        if (tc === 'MailerResultCollector') {
            return {
                name: node.getAttribute('testname') || '邮件观察仪',
                subject: getStringProp(node, 'MailerModel.subject') || getStringProp(node, 'MailerResultCollector.subject'),
                from: getStringProp(node, 'MailerModel.fromAddress') || getStringProp(node, 'MailerResultCollector.fromAddress'),
                success_limit: getStringProp(node, 'MailerModel.successLimit') || getStringProp(node, 'MailerResultCollector.successLimit'),
                failure_limit: getStringProp(node, 'MailerModel.failureLimit') || getStringProp(node, 'MailerResultCollector.failureLimit'),
                failure_only: getBoolProp(node, 'MailerModel.failureOnly', false)
            };
        }
        return { name: node.getAttribute('testname') || '' };
    }

    function buildStep(node) {
        if (!node) return null;
        var tc = node.getAttribute('testclass') || '';
        var gui = node.getAttribute('guiclass') || '';
        var map = LISTENER_MAP[gui] || (tc === 'BackendListener' ? LISTENER_MAP.BackendListenerGui : null);
        if (!map && tc === 'MailerResultCollector') map = LISTENER_MAP.MailerVisualizer;
        if (!map) return null;
        var props = buildCatalogProps(node, gui, tc);
        var name = (props && props.name) || node.getAttribute('testname') || map.label_zh;
        return {
            type: 'catalog_element',
            name: name,
            enabled: isEnabled(node),
            alias: map.alias,
            testclass: map.testclass,
            guiclass: map.guiclass,
            category: map.category,
            label_zh: map.label_zh,
            container: false,
            scope: 'unified',
            catalog_props: props || {},
            jmx_fragment: ''
        };
    }

    global.JmsJmxImportListenerStepV1 = {
        buildStep: buildStep,
        buildMailerStep: function (node) {
            if (!node || node.getAttribute('testclass') !== 'MailerResultCollector') return null;
            return buildStep(node);
        }
    };
}(typeof window !== 'undefined' ? window : this));
