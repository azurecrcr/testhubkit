/**
 * HTTP 步骤 BeanShell PreProcessor · JMX 解析/生成（隔离模块）
 */
(function (global) {
    'use strict';

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
        if (!node || (node.getAttribute('testclass') || '') !== 'BeanShellPreProcessor') return null;
        return {
            type: 'beanshell_pre',
            name: node.getAttribute('testname') || 'BeanShell PreProcessor',
            enabled: isEnabled(node),
            comments: getStringProp(node, 'TestPlan.comments') || '',
            script: getStringProp(node, 'script') || '',
            filename: getStringProp(node, 'filename') || '',
            parameters: getStringProp(node, 'parameters') || '',
            reset_interpreter: getBoolProp(node, 'resetInterpreter', false)
        };
    }

    function parseUserParametersElement(node) {
        if (!node || (node.getAttribute('testclass') || '') !== 'UserParameters') return null;
        var params = [];
        var namesColl = node.querySelector('collectionProp[name="UserParameters.names"]');
        var threadValues = node.querySelector('collectionProp[name="UserParameters.thread_values"]');
        var names = [];
        if (namesColl) {
            var nameProps = namesColl.getElementsByTagName('stringProp');
            for (var i = 0; i < nameProps.length; i++) {
                names.push((nameProps[i].textContent || '').trim());
            }
        }
        var userColls = [];
        if (threadValues) {
            var children = threadValues.children || [];
            for (var c = 0; c < children.length; c++) {
                if ((children[c].tagName || '').toLowerCase() === 'collectionprop') userColls.push(children[c]);
            }
        }
        if (!userColls.length && threadValues) {
            var fallback = threadValues.querySelector('collectionProp');
            if (fallback) userColls = [fallback];
        }
        var userCount = userColls.length || 1;
        names.forEach(function (name, i) {
            if (!name) return;
            var values = [];
            for (var u = 0; u < userCount; u++) {
                var coll = userColls[u];
                var valProps = coll ? coll.getElementsByTagName('stringProp') : [];
                values.push(valProps[i] ? (valProps[i].textContent || '') : '');
            }
            if (userCount <= 1) params.push({ key: name, value: values[0] || '' });
            else params.push({ key: name, values: values });
        });
        var commentsEl = node.querySelector('stringProp[name="TestPlan.comments"]');
        return {
            enabled: isEnabled(node),
            name: node.getAttribute('testname') || '用户参数',
            comments: commentsEl ? (commentsEl.textContent || '') : '',
            per_iteration: getBoolProp(node, 'UserParameters.per_iteration', false),
            params: params
        };
    }

    function genXml(proc, indent, escapeXml) {
        if (!proc || proc.type !== 'beanshell_pre' || proc.enabled === false) return '';
        escapeXml = escapeXml || function (s) { return String(s == null ? '' : s); };
        var en = proc.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPreProcessor guiclass="TestBeanGUI" testclass="BeanShellPreProcessor" testname="' +
            escapeXml(proc.name || 'BeanShell PreProcessor') + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="filename">' + escapeXml(proc.filename || '') + '</stringProp>\n';
        xml += indent + '  <stringProp name="parameters">' + escapeXml(proc.parameters || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">' + (proc.reset_interpreter ? 'true' : 'false') + '</boolProp>\n';
        if (proc.comments && String(proc.comments).trim()) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(proc.comments) + '</stringProp>\n';
        }
        xml += indent + '  <stringProp name="script">' + escapeXml(proc.script || '') + '</stringProp>\n';
        xml += indent + '</BeanShellPreProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    global.JmsHttpBeanshellPreProcessorJmx = {
        parseElement: parseElement,
        parseUserParametersElement: parseUserParametersElement,
        genXml: genXml
    };
}(typeof window !== 'undefined' ? window : this));
