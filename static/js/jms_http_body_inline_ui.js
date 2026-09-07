/**
 * 压测造数 · HTTP 步骤 GET/HEAD Body 行内展示（路径后方）
 */
(function (global) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatBodyPreview(step) {
        if (!step || typeof step !== 'object') return '';
        if (step.body_type === 'form' && step.form_params && typeof step.form_params === 'object') {
            return Object.keys(step.form_params).map(function (k) {
                return k + '=' + step.form_params[k];
            }).join('&');
        }
        return String(step.body == null ? '' : step.body).trim();
    }

    function renderInlineBadge(step) {
        if (global.JmsJmxGetBodyImport &&
            typeof global.JmsJmxGetBodyImport.hasGetHeadBodyForDisplay === 'function' &&
            !global.JmsJmxGetBodyImport.hasGetHeadBodyForDisplay(step)) {
            return '';
        }
        if (!global.JmsJmxGetBodyImport) {
            var m = String(step && step.method || 'GET').toUpperCase();
            if (m !== 'GET' && m !== 'HEAD') return '';
            if (!step || !step.body || !String(step.body).trim()) return '';
        }
        var preview = formatBodyPreview(step);
        if (!preview) return '';
        var maxLen = 56;
        var label = preview.length > maxLen ? preview.slice(0, maxLen) + '…' : preview;
        return '<code class="jms-http-body-inline hf-mono" title="Body: ' + esc(preview) + '">' + esc(label) + '</code>';
    }

    global.JmsHttpBodyInlineUi = {
        formatBodyPreview: formatBodyPreview,
        renderInlineBadge: renderInlineBadge
    };
})(typeof window !== 'undefined' ? window : this);
