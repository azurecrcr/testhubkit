/**
 * 线程组 · BeanShell PostProcessor JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

    function normalize(cfg) {
        cfg = cfg || {};
        return {
            type: 'beanshell_post',
            name: cfg.name ? String(cfg.name) : 'BeanShell PostProcessor',
            comments: cfg.comments != null ? String(cfg.comments) : '',
            enabled: cfg.enabled !== false,
            script: cfg.script != null ? String(cfg.script) : '',
            filename: cfg.filename != null ? String(cfg.filename) : '',
            script_file_original_name: cfg.script_file_original_name != null
                ? String(cfg.script_file_original_name) : '',
            parameters: cfg.parameters != null ? String(cfg.parameters) : '',
            reset_interpreter: !!cfg.reset_interpreter
        };
    }

    function getStringProp(el, name) {
        if (!el) return '';
        var nodes = el.getElementsByTagName('stringProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) return (nodes[i].textContent || '').trim();
        }
        return '';
    }

    function getBoolProp(el, name, defaultVal) {
        if (!el) return defaultVal;
        var nodes = el.getElementsByTagName('boolProp');
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].getAttribute('name') === name) {
                var t = (nodes[i].textContent || '').trim().toLowerCase();
                return t === 'true';
            }
        }
        return defaultVal;
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function parseElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'BeanShellPostProcessor') return null;
        return normalize({
            name: node.getAttribute('testname') || 'BeanShell PostProcessor',
            enabled: isEnabled(node),
            comments: getStringProp(node, 'TestPlan.comments') || '',
            script: getStringProp(node, 'script') || '',
            filename: getStringProp(node, 'filename') || '',
            parameters: getStringProp(node, 'parameters') || '',
            reset_interpreter: getBoolProp(node, 'resetInterpreter', false)
        });
    }

    function genXml(proc, indent, escapeXml) {
        proc = normalize(proc);
        var en = proc.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPostProcessor guiclass="TestBeanGUI" testclass="BeanShellPostProcessor" testname="' +
            escapeXml(proc.name) + '" enabled="' + en + '">\n';
        if (proc.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(proc.comments) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="filename">' + escapeXml(proc.filename || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="parameters">' + escapeXml(proc.parameters || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">' + (proc.reset_interpreter ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <stringProp name="script">' + escapeXml(proc.script || '') + '</stringProp>\n';
        xml += indent + '</BeanShellPostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsTgBeanshellPostJmx = {
        normalize: normalize,
        parseElement: parseElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));
