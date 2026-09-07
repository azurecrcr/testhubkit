/**
 * JMX 导入 · GET/HEAD 请求体解析（隔离模块，不影响 POST/PUT/PATCH 既有逻辑）
 */
(function (global) {
    'use strict';

    function getStringProp(el, name) {
        if (!el) return '';
        var list = el.getElementsByTagName('stringProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
        }
        return '';
    }

    function isGetOrHead(method) {
        var m = String(method || 'GET').toUpperCase();
        return m === 'GET' || m === 'HEAD';
    }

    function hasBodyContent(step) {
        if (!step || typeof step !== 'object') return false;
        if (step.body_type === 'form' && step.form_params && typeof step.form_params === 'object') {
            return Object.keys(step.form_params).length > 0;
        }
        return step.body !== undefined && step.body !== null && String(step.body).length > 0;
    }

    /** 从 HTTPsampler.Arguments 解析 GET/HEAD body */
    function parseGetHeadBodyFromArguments(argsEl, postRaw) {
        if (!argsEl) return null;
        var argProps = argsEl.getElementsByTagName('elementProp');
        if (!argProps.length) return null;

        if (postRaw) {
            var raw = getStringProp(argProps[0], 'Argument.value');
            if (raw === '') return null;
            return { body_type: 'json', body: raw };
        }

        var unnamed = [];
        for (var i = 0; i < argProps.length; i++) {
            var ap = argProps[i];
            if (ap.getAttribute('elementType') !== 'HTTPArgument') continue;
            var name = getStringProp(ap, 'Argument.name');
            var val = getStringProp(ap, 'Argument.value');
            if (name) continue;
            if (val !== '') unnamed.push(val);
        }

        if (unnamed.length === 1) {
            return { body_type: 'json', body: unnamed[0] };
        }
        if (unnamed.length > 1) {
            return { body_type: 'json', body: unnamed.join('') };
        }
        return null;
    }

    function applyImportedGetHeadBody(step, argsEl, postRaw) {
        if (!step || !argsEl || !isGetOrHead(step.method)) return step;
        var parsed = parseGetHeadBodyFromArguments(argsEl, postRaw);
        if (!parsed) return step;
        step._jmx_get_body = true;
        step.body_type = parsed.body_type;
        if (parsed.body_type === 'form') {
            step.form_params = parsed.form_params;
            delete step.body;
        } else {
            step.body = parsed.body;
            delete step.form_params;
        }
        return step;
    }

    function shouldExportGetHeadBody(step) {
        return !!(step && step._jmx_get_body === true && isGetOrHead(step.method) && hasBodyContent(step));
    }

    function hasGetHeadBodyForDisplay(step) {
        return !!(step && isGetOrHead(step.method) && hasBodyContent(step));
    }

    global.JmsJmxGetBodyImport = {
        parseGetHeadBodyFromArguments: parseGetHeadBodyFromArguments,
        applyImportedGetHeadBody: applyImportedGetHeadBody,
        shouldExportGetHeadBody: shouldExportGetHeadBody,
        hasGetHeadBodyForDisplay: hasGetHeadBodyForDisplay
    };
})(typeof window !== 'undefined' ? window : this);
