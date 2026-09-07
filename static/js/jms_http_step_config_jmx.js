/**
 * HTTP 步骤级配置元件 · JMX 导入/导出（隔离模块）
 */
(function (global) {
    'use strict';

    var Catalog = global.JmsHttpStepConfigCatalog;

    function getStringProp(el, name) {
        if (!el) return '';
        var list = el.getElementsByTagName('stringProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
        }
        return '';
    }

    function getBoolProp(el, name, defaultVal) {
        if (!el) return defaultVal;
        var list = el.getElementsByTagName('boolProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) {
                return (list[i].textContent || '').trim().toLowerCase() === 'true';
            }
        }
        return defaultVal;
    }

    function parseHeaderManagerMeta(el) {
        if (!el) return { name: "", comments: "" };
        return {
            name: (el.getAttribute('testname') || '').trim(),
            comments: getStringProp(el, 'TestPlan.comments') || ''
        };
    }

    function parseHeaderManagerEl(el) {
        var headers = {};
        if (!el) return headers;
        var props = el.querySelectorAll('elementProp[elementType="Header"]');
        for (var i = 0; i < props.length; i++) {
            var name = getStringProp(props[i], 'Header.name');
            var val = getStringProp(props[i], 'Header.value');
            if (name) headers[name] = val;
        }
        return headers;
    }

    function parseHttpDefaultsEl(el) {
        var argsEl = el ? el.querySelector('elementProp[name="HTTPsampler.Arguments"]') : null;
        var postBodyRaw = getBoolProp(el, 'HTTPSampler.postBodyRaw', false);
        var argData = global.JmsStepHttpDefaultsJmx && typeof global.JmsStepHttpDefaultsJmx.parseArguments === 'function'
            ? global.JmsStepHttpDefaultsJmx.parseArguments(argsEl, postBodyRaw)
            : { arg_mode: 'params', parameters: [], body_data: '' };
        var out = {
            enabled: true,
            protocol: getStringProp(el, 'HTTPSampler.protocol') || '',
            domain: getStringProp(el, 'HTTPSampler.domain') || '',
            port: getStringProp(el, 'HTTPSampler.port') || '',
            path: getStringProp(el, 'HTTPSampler.path') || '',
            connect_timeout: getStringProp(el, 'HTTPSampler.connect_timeout') || '',
            response_timeout: getStringProp(el, 'HTTPSampler.response_timeout') || '',
            implementation: getStringProp(el, 'HTTPSampler.implementation') || '',
            content_encoding: getStringProp(el, 'HTTPSampler.contentEncoding') || '',
            name: (el && el.getAttribute('testname')) ? String(el.getAttribute('testname')).trim() : '',
            comments: getStringProp(el, 'TestPlan.comments') || '',
            follow_redirects: getBoolProp(el, 'HTTPSampler.follow_redirects', true),
            auto_redirects: getBoolProp(el, 'HTTPSampler.auto_redirects', false),
            use_keepalive: getBoolProp(el, 'HTTPSampler.use_keepalive', true),
            arg_mode: argData.arg_mode,
            parameters: argData.parameters,
            body_data: argData.body_data
        };
        if (global.JmsStepHttpDefaultsAdvanced && typeof global.JmsStepHttpDefaultsAdvanced.parseFromEl === 'function') {
            var adv = global.JmsStepHttpDefaultsAdvanced.parseFromEl(el);
            Object.keys(adv).forEach(function (k) { out[k] = adv[k]; });
        }
        return out;
    }

    function elementChildren(el) {
        var out = [];
        if (!el) return out;
        for (var i = 0; i < el.childNodes.length; i++) {
            if (el.childNodes[i].nodeType === 1) out.push(el.childNodes[i]);
        }
        return out;
    }

    function pairedWalk(tree, visitor) {
        var kids = elementChildren(tree);
        for (var i = 0; i < kids.length; i++) {
            var node = kids[i];
            if (node.tagName === 'hashTree') continue;
            var sub = (kids[i + 1] && kids[i + 1].tagName === 'hashTree') ? kids[i + 1] : null;
            visitor(node, sub);
            if (sub) i++;
        }
    }


    function shouldPreserveHostPathDisplayInline(path) {
        path = String(path || '');
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.shouldPreserveHostPathDisplay === 'function') {
            return global.JmsJmxPathHost.shouldPreserveHostPathDisplay(path);
        }
        return /^\/\/[^/?#]+/.test(path) || /^\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+\/?$/.test(path);
    }

    function repairHostPathForImportDisplayInline(step) {
        if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.repairHostPathForImportDisplay === 'function') {
            return global.JmsJmxPathHost.repairHostPathForImportDisplay(step);
        }
        if (!step || typeof step !== 'object') return step;
        var path = String(step.path || '');
        if (!shouldPreserveHostPathDisplayInline(path)) return step;
        var m = path.match(/^\/\/([^/?#]+)(\/.*)?$/) || path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        if (m) {
            var domain = m[1];
            var sub = m[2] || '/';
            if (sub.charAt(0) !== '/') sub = '/' + sub;
            step.path = sub === '/' ? ('//' + domain + '/') : ('//' + domain + sub);
        }
        return step;
    }

    function normalizeDomainInPath(step) {
        if (!step || !step.path) return;
        if (shouldPreserveHostPathDisplayInline(String(step.path))) return;
        var path = String(step.path);
        var split = global.JmsJmxPathHost && typeof global.JmsJmxPathHost.splitHostFromPath === 'function'
            ? global.JmsJmxPathHost.splitHostFromPath(path) : null;
        if (!split) {
            var m = path.match(/^\/\/([^/?#]+)(\/.*)?$/);
            if (!m) return;
            split = { domain: m[1], path: m[2] || '/' };
        }
        step.path = split.path || '/';
        if (!Catalog) return;
        if (!step.http_managers) step.http_managers = Catalog.defaultStepHttpManagers();
        var mgr = step.http_managers;
        mgr.http_defaults.enabled = true;
        mgr.http_defaults.domain = split.domain;
        if (step._protocol && !mgr.http_defaults.protocol) mgr.http_defaults.protocol = step._protocol;
        var sel = Catalog.parseSelectedTypes(mgr.selected_types);
        if (sel.indexOf('http_defaults') < 0) sel.push('http_defaults');
        mgr.selected_types = sel;
    }

    function applyImportedSamplerConfig(step, samplerTree) {
        if (!step || !Catalog) return step;
        if (!samplerTree) {
            if (shouldPreserveHostPathDisplayInline(step.path)) {
                repairHostPathForImportDisplayInline(step);
            } else {
                normalizeDomainInPath(step);
            }
            Catalog.migrateLegacyStepHeaders(step);
            return step;
        }
        var mgr = Catalog.defaultStepHttpManagers();
        var selected = [];
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';
            if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') {
                mgr.http_defaults = parseHttpDefaultsEl(node);
                mgr.http_defaults.enabled = true;
                if (selected.indexOf('http_defaults') < 0) selected.push('http_defaults');
            } else if (tc === 'HeaderManager') {
                var hmMeta = parseHeaderManagerMeta(node);
                mgr.header_manager = {
                    enabled: true,
                    headers: Catalog.objToVars(parseHeaderManagerEl(node)),
                    name: hmMeta.name,
                    comments: hmMeta.comments
                };
                if (selected.indexOf('header_manager') < 0) selected.push('header_manager');
            } else if (tc === 'CookieManager') {
                var cmParsed = global.JmsStepCookieManagerJmx && typeof global.JmsStepCookieManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepCookieManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        enabled: true,
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'CookieManager.clearEachIteration', true),
                        cookie_policy: 'standard',
                        cookies: []
                    };
                mgr.cookie_manager = Object.assign({ enabled: true }, cmParsed);
                if (selected.indexOf('cookie_manager') < 0) selected.push('cookie_manager');
            } else if (tc === 'AuthManager') {
                var amParsed = global.JmsStepAuthManagerJmx && typeof global.JmsStepAuthManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepAuthManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'AuthManager.clearEachIteration', false),
                        authorizations: []
                    };
                mgr.auth_manager = Object.assign({ enabled: true }, amParsed);
                if (selected.indexOf('auth_manager') < 0) selected.push('auth_manager');
            } else if (tc === 'CacheManager') {
                var cacheParsed = global.JmsStepCacheManagerJmx && typeof global.JmsStepCacheManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepCacheManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'clearEachIteration', false),
                        use_expires: getBoolProp(node, 'useExpires', true),
                        max_size: '5000'
                    };
                mgr.cache_manager = Object.assign({ enabled: true }, cacheParsed);
                if (selected.indexOf('cache_manager') < 0) selected.push('cache_manager');
            } else if (tc === 'CSVDataSet') {
                var csvParsed = global.JmsStepCsvDataSetJmx && typeof global.JmsStepCsvDataSetJmx.parseFromEl === 'function'
                    ? global.JmsStepCsvDataSetJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        filename: getStringProp(node, 'filename') || '',
                        file_encoding: getStringProp(node, 'fileEncoding') || 'UTF-8',
                        variable_names: getStringProp(node, 'variableNames') || '',
                        ignore_first_line: getBoolProp(node, 'ignoreFirstLine', false),
                        delimiter: getStringProp(node, 'delimiter') || ',',
                        quoted_data: getBoolProp(node, 'quotedData', false),
                        recycle: getBoolProp(node, 'recycle', true),
                        stop_thread: getBoolProp(node, 'stopThread', false),
                        share_mode: getStringProp(node, 'shareMode') || 'shareMode.all',
                        file_content: ''
                    };
                mgr.csv_data_set = Object.assign({ enabled: true }, csvParsed);
                if (selected.indexOf('csv_data_set') < 0) selected.push('csv_data_set');
            } else if (tc === 'CounterConfig') {
                var ctrParsed = global.JmsStepCounterJmx && typeof global.JmsStepCounterJmx.parseFromEl === 'function'
                    ? global.JmsStepCounterJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        start: getStringProp(node, 'CounterConfig.start') || '',
                        increment: getStringProp(node, 'CounterConfig.incr') || '',
                        maximum: getStringProp(node, 'CounterConfig.end') || '',
                        format: getStringProp(node, 'CounterConfig.format') || '',
                        variable_name: getStringProp(node, 'CounterConfig.name') || '',
                        per_user: getBoolProp(node, 'CounterConfig.per_user', false),
                        reset_each_iteration: getBoolProp(node, 'CounterConfig.reset_on_tg_iteration', false)
                    };
                mgr.counter = Object.assign({ enabled: true }, ctrParsed);
                if (selected.indexOf('counter') < 0) selected.push('counter');
            }
        });
        if (step._protocol || step._domain) {
            if (selected.indexOf('http_defaults') < 0) {
                mgr.http_defaults.enabled = true;
                selected.push('http_defaults');
            }
            if (step._protocol) mgr.http_defaults.protocol = step._protocol;
            if (step._domain) mgr.http_defaults.domain = step._domain;
        }
        if (selected.length) {
            mgr.selected_types = selected;
            step.http_managers = mgr;
        }
        if (Catalog.migrateJsonPostFromConfigToProcessors) {
            Catalog.migrateJsonPostFromConfigToProcessors(step);
        }
        if (shouldPreserveHostPathDisplayInline(step.path)) {
            repairHostPathForImportDisplayInline(step);
        } else {
            normalizeDomainInPath(step);
        }
        Catalog.migrateLegacyStepHeaders(step);
        return step;
    }

    function hasActiveConfig(step) {
        if (!step || !Catalog) return false;
        if (Catalog.anyActive(step.http_managers)) return true;
        return !!(step.headers && Catalog.varsToObj(step.headers) && Object.keys(Catalog.varsToObj(step.headers)).length);
    }

    function genHttpDefaultsXml(hd, childPad, escapeXml) {
        if (!hd || !hd.enabled) return '';
        if (global.JmsStepHttpDefaultsJmx && typeof global.JmsStepHttpDefaultsJmx.genHttpDefaultsXml === 'function') {
            return global.JmsStepHttpDefaultsJmx.genHttpDefaultsXml(hd, childPad, escapeXml);
        }
        if (global.JmsJmxExportCompact) {
            return global.JmsJmxExportCompact.httpDefaultsBlock(hd, childPad, escapeXml);
        }
        var xml = childPad + '<ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP 请求默认值" enabled="true">\n';
        xml += childPad + '  <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">\n';
        xml += childPad + '    <collectionProp name="Arguments.arguments"/>\n';
        xml += childPad + '  </elementProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.domain">' + escapeXml(hd.domain || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.port">' + escapeXml(hd.port || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.protocol">' + escapeXml(hd.protocol || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.path">' + escapeXml(hd.path || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.contentEncoding">' + escapeXml(hd.content_encoding || '') + '</stringProp>\n';
        xml += childPad + '  <boolProp name="HTTPSampler.follow_redirects">' + (hd.follow_redirects !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="HTTPSampler.auto_redirects">' + (hd.auto_redirects ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <boolProp name="HTTPSampler.use_keepalive">' + (hd.use_keepalive !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.connect_timeout">' + escapeXml(hd.connect_timeout || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.response_timeout">' + escapeXml(hd.response_timeout || '') + '</stringProp>\n';
        xml += childPad + '  <stringProp name="HTTPSampler.implementation">' + escapeXml(hd.implementation || 'HttpClient4') + '</stringProp>\n';
        xml += childPad + '</ConfigTestElement>\n' + childPad + '<hashTree/>\n';
        return xml;
    }

    function genAuthManagerXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepAuthManagerJmx && typeof global.JmsStepAuthManagerJmx.genAuthManagerXml === 'function') {
            return global.JmsStepAuthManagerJmx.genAuthManagerXml(cfg, childPad, escapeXml);
        }
        return '';
    }

    function genCookieManagerXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepCookieManagerJmx && typeof global.JmsStepCookieManagerJmx.genCookieManagerXml === 'function') {
            return global.JmsStepCookieManagerJmx.genCookieManagerXml(cfg, childPad, escapeXml);
        }
        return '';
    }

    function genCacheManagerXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepCacheManagerJmx && typeof global.JmsStepCacheManagerJmx.genCacheManagerXml === 'function') {
            return global.JmsStepCacheManagerJmx.genCacheManagerXml(cfg, childPad, escapeXml);
        }
        var clear = cfg.clear_each_iteration === true ? 'true' : 'false';
        var expires = cfg.use_expires !== false ? 'true' : 'false';
        var en = global.JmsJmxExportCompact ? global.JmsJmxExportCompact.enabledAttr(true) : ' enabled="true"';
        return childPad + '<CacheManager guiclass="CacheManagerGui" testclass="CacheManager" testname="HTTP 缓存管理器"' + en + '>\n' +
            childPad + '  <boolProp name="clearEachIteration">' + clear + '</boolProp>\n' +
            childPad + '  <boolProp name="useExpires">' + expires + '</boolProp>\n' +
            childPad + '</CacheManager>\n' + childPad + '<hashTree/>\n';
    }

    function genCounterXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepCounterJmx && typeof global.JmsStepCounterJmx.genCounterXml === 'function') {
            return global.JmsStepCounterJmx.genCounterXml(cfg, childPad, escapeXml);
        }
        return '';
    }

    function genCsvDataSetXml(cfg, childPad, escapeXml) {
        if (!cfg || !cfg.enabled) return '';
        if (global.JmsStepCsvDataSetJmx && typeof global.JmsStepCsvDataSetJmx.genCsvDataSetXml === 'function') {
            return global.JmsStepCsvDataSetJmx.genCsvDataSetXml(cfg, childPad, escapeXml);
        }
        return '';
    }

    function genHeaderManagerXml(headers, childPad, escapeXml, samplerName, hmMeta) {
        var hdrs = headers || {};
        hmMeta = hmMeta || {};
        var testname = (hmMeta.name && String(hmMeta.name).trim()) ? String(hmMeta.name).trim() : ('步骤配置请求头 ' + (samplerName || ''));
        var comments = hmMeta.comments;
        if (global.JmsJmxExportCompact) {
            return global.JmsJmxExportCompact.headerManagerBlock(hdrs, childPad, testname, escapeXml, comments);
        }
        if (!Object.keys(hdrs).length) {
            return childPad + '<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="' + escapeXml(testname) + '" enabled="true">\n' +
                childPad + '  <collectionProp name="HeaderManager.headers"/>\n' +
                childPad + '</HeaderManager>\n' + childPad + '<hashTree/>\n';
        }
        var xml = childPad + '<HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="' + escapeXml(testname) + '" enabled="true">\n';
        xml += childPad + '  <collectionProp name="HeaderManager.headers">\n';
        Object.keys(hdrs).forEach(function (hk) {
            xml += childPad + '    <elementProp name="' + escapeXml(hk) + '" elementType="Header">\n';
            xml += childPad + '      <stringProp name="Header.name">' + escapeXml(hk) + '</stringProp>\n';
            xml += childPad + '      <stringProp name="Header.value">' + escapeXml(hdrs[hk]) + '</stringProp>\n';
            xml += childPad + '    </elementProp>\n';
        });
        xml += childPad + '  </collectionProp>\n';
        xml += childPad + '</HeaderManager>\n' + childPad + '<hashTree/>\n';
        return xml;
    }

    function genStepConfigXml(step, childPad, escapeXml) {
        if (!step || !Catalog) return '';
        var mgr = Catalog.normalizeStepHttpManagers(step.http_managers || Catalog.defaultStepHttpManagers());
        Catalog.migrateLegacyStepHeaders(step);
        mgr = Catalog.normalizeStepHttpManagers(step.http_managers || mgr);
        var xml = '';
        var samplerName = step.name || '';
        if (Catalog.typeActive(mgr, 'http_defaults')) {
            xml += genHttpDefaultsXml(mgr.http_defaults, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'cookie_manager')) {
            xml += genCookieManagerXml(mgr.cookie_manager, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'auth_manager')) {
            xml += genAuthManagerXml(mgr.auth_manager, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'cache_manager')) {
            xml += genCacheManagerXml(mgr.cache_manager, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'csv_data_set')) {
            xml += genCsvDataSetXml(mgr.csv_data_set, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'counter')) {
            xml += genCounterXml(mgr.counter, childPad, escapeXml);
        }
        if (Catalog.typeActive(mgr, 'header_manager')) {
            xml += genHeaderManagerXml(
                Catalog.varsToObj(mgr.header_manager.headers),
                childPad,
                escapeXml,
                samplerName,
                { name: mgr.header_manager.name, comments: mgr.header_manager.comments }
            );
        }
        return xml;
    }

    function quoteSpecialHttpMethodsInYaml(yamlText) {
        if (!yamlText) return yamlText;
        return yamlText.replace(/^(\s+method:\s+)(HEAD|OPTIONS)\s*$/gm, '$1"$2"');
    }


    /** JMX 导入专用：仅从 XML 子树中的配置元件还原，不从采样器 domain/path 推断 */
    function applyImportedSamplerConfigStrict(step, samplerTree) {
        if (!step || !Catalog) return step;
        if (!samplerTree) {
            if (shouldPreserveHostPathDisplayInline(step.path)) {
                repairHostPathForImportDisplayInline(step);
            }
            Catalog.migrateLegacyStepHeaders(step);
            return step;
        }
        var mgr = Catalog.defaultStepHttpManagers();
        var selected = [];
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';
            if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') {
                mgr.http_defaults = parseHttpDefaultsEl(node);
                mgr.http_defaults.enabled = true;
                if (selected.indexOf('http_defaults') < 0) selected.push('http_defaults');
            } else if (tc === 'HeaderManager') {
                var hmMetaStrict = parseHeaderManagerMeta(node);
                mgr.header_manager = {
                    enabled: true,
                    headers: Catalog.objToVars(parseHeaderManagerEl(node)),
                    name: hmMetaStrict.name,
                    comments: hmMetaStrict.comments
                };
                if (selected.indexOf('header_manager') < 0) selected.push('header_manager');
            } else if (tc === 'CookieManager') {
                var cmParsedStrict = global.JmsStepCookieManagerJmx && typeof global.JmsStepCookieManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepCookieManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        enabled: true,
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'CookieManager.clearEachIteration', true),
                        cookie_policy: 'standard',
                        cookies: []
                    };
                mgr.cookie_manager = Object.assign({ enabled: true }, cmParsedStrict);
                if (selected.indexOf('cookie_manager') < 0) selected.push('cookie_manager');
            } else if (tc === 'AuthManager') {
                var amParsedStrict = global.JmsStepAuthManagerJmx && typeof global.JmsStepAuthManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepAuthManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'AuthManager.clearEachIteration', false),
                        authorizations: []
                    };
                mgr.auth_manager = Object.assign({ enabled: true }, amParsedStrict);
                if (selected.indexOf('auth_manager') < 0) selected.push('auth_manager');
            } else if (tc === 'CacheManager') {
                var cacheParsedStrict = global.JmsStepCacheManagerJmx && typeof global.JmsStepCacheManagerJmx.parseFromEl === 'function'
                    ? global.JmsStepCacheManagerJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        clear_each_iteration: getBoolProp(node, 'clearEachIteration', false),
                        use_expires: getBoolProp(node, 'useExpires', true),
                        max_size: '5000'
                    };
                mgr.cache_manager = Object.assign({ enabled: true }, cacheParsedStrict);
                if (selected.indexOf('cache_manager') < 0) selected.push('cache_manager');
            } else if (tc === 'CSVDataSet') {
                var csvParsedStrict = global.JmsStepCsvDataSetJmx && typeof global.JmsStepCsvDataSetJmx.parseFromEl === 'function'
                    ? global.JmsStepCsvDataSetJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        filename: getStringProp(node, 'filename') || '',
                        file_encoding: getStringProp(node, 'fileEncoding') || 'UTF-8',
                        variable_names: getStringProp(node, 'variableNames') || '',
                        ignore_first_line: getBoolProp(node, 'ignoreFirstLine', false),
                        delimiter: getStringProp(node, 'delimiter') || ',',
                        quoted_data: getBoolProp(node, 'quotedData', false),
                        recycle: getBoolProp(node, 'recycle', true),
                        stop_thread: getBoolProp(node, 'stopThread', false),
                        share_mode: getStringProp(node, 'shareMode') || 'shareMode.all',
                        file_content: ''
                    };
                mgr.csv_data_set = Object.assign({ enabled: true }, csvParsedStrict);
                if (selected.indexOf('csv_data_set') < 0) selected.push('csv_data_set');
            } else if (tc === 'CounterConfig') {
                var ctrParsedStrict = global.JmsStepCounterJmx && typeof global.JmsStepCounterJmx.parseFromEl === 'function'
                    ? global.JmsStepCounterJmx.parseFromEl(node, (node.getAttribute('testname') || '').trim())
                    : {
                        name: (node.getAttribute('testname') || '').trim(),
                        comments: getStringProp(node, 'TestPlan.comments') || '',
                        start: getStringProp(node, 'CounterConfig.start') || '',
                        increment: getStringProp(node, 'CounterConfig.incr') || '',
                        maximum: getStringProp(node, 'CounterConfig.end') || '',
                        format: getStringProp(node, 'CounterConfig.format') || '',
                        variable_name: getStringProp(node, 'CounterConfig.name') || '',
                        per_user: getBoolProp(node, 'CounterConfig.per_user', false),
                        reset_each_iteration: getBoolProp(node, 'CounterConfig.reset_on_tg_iteration', false)
                    };
                mgr.counter = Object.assign({ enabled: true }, ctrParsedStrict);
                if (selected.indexOf('counter') < 0) selected.push('counter');
            }
        });
        if (selected.length) {
            mgr.selected_types = selected;
            step.http_managers = mgr;
        }
        if (Catalog.migrateJsonPostFromConfigToProcessors) {
            Catalog.migrateJsonPostFromConfigToProcessors(step);
        }
        if (shouldPreserveHostPathDisplayInline(step.path)) {
            repairHostPathForImportDisplayInline(step);
        }
        Catalog.migrateLegacyStepHeaders(step);
        return step;
    }

    global.JmsHttpStepConfigJmx = {
        applyImportedSamplerConfig: applyImportedSamplerConfig,
        applyImportedSamplerConfigStrict: applyImportedSamplerConfigStrict,
        hasActiveConfig: hasActiveConfig,
        genStepConfigXml: genStepConfigXml,
        quoteSpecialHttpMethodsInYaml: quoteSpecialHttpMethodsInYaml,
        normalizeDomainInPath: normalizeDomainInPath
    };
}(typeof window !== 'undefined' ? window : this));
