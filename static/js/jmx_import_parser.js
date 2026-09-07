/**
 * JMeter JMX → TestHub 场景 YAML（增强版：递归控制器、SetupThreadGroup、BeanShell 等）
 */
(function (global) {
    'use strict';

    var MAX_BYTES = 2 * 1024 * 1024;

    function getStringProp(el, name) {
        if (!el) return '';
        var list = el.getElementsByTagName('stringProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
        }
        return '';
    }

    function getIntProp(el, name) {
        if (!el) return '';
        var tags = ['intProp', 'longProp', 'stringProp'];
        for (var t = 0; t < tags.length; t++) {
            var list = el.getElementsByTagName(tags[t]);
            for (var i = 0; i < list.length; i++) {
                if (list[i].getAttribute('name') === name) return (list[i].textContent || '').trim();
            }
        }
        return '';
    }

    function getProp(el, name, defaultVal) {
        var v = getStringProp(el, name);
        if (v !== '') return v;
        v = getIntProp(el, name);
        return v !== '' ? v : defaultVal;
    }

    function getBoolProp(el, name, defaultVal) {
        if (!el) return defaultVal;
        var list = el.getElementsByTagName('boolProp');
        for (var i = 0; i < list.length; i++) {
            if (list[i].getAttribute('name') === name) {
                var t = (list[i].textContent || '').trim().toLowerCase();
                return t === 'true';
            }
        }
        return defaultVal;
    }

    function isEnabled(node) {
        var en = node.getAttribute('enabled');
        return en === null || en === 'true';
    }

    function elementChildren(el) {
        var out = [];
        if (!el) return out;
        for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 1) out.push(n);
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

    function parseHeaderManager(el) {
        var headers = {};
        var coll = el.getElementsByTagName('elementProp');
        for (var i = 0; i < coll.length; i++) {
            var ep = coll[i];
            if (ep.getAttribute('elementType') !== 'Header') continue;
            var name = getStringProp(ep, 'Header.name');
            var val = getStringProp(ep, 'Header.value');
            if (name) headers[name] = val;
        }
        return headers;
    }

    function mergeHeaders(target, source) {
        if (!source) return target;
        Object.keys(source).forEach(function (k) {
            target[k] = source[k];
        });
        return target;
    }

    function parseHttpDefaults(el) {
        var result = {
            enabled: true,
            protocol: getProp(el, 'HTTPSampler.protocol', ''),
            domain: getProp(el, 'HTTPSampler.domain', ''),
            port: getProp(el, 'HTTPSampler.port', ''),
            path: getProp(el, 'HTTPSampler.path', ''),
            connect_timeout: getProp(el, 'HTTPSampler.connect_timeout', ''),
            response_timeout: getProp(el, 'HTTPSampler.response_timeout', ''),
            implementation: getProp(el, 'HTTPSampler.implementation', ''),
            content_encoding: getProp(el, 'HTTPSampler.contentEncoding', ''),
            follow_redirects: getBoolProp(el, 'HTTPSampler.follow_redirects', true),
            auto_redirects: getBoolProp(el, 'HTTPSampler.auto_redirects', false),
            use_keepalive: getBoolProp(el, 'HTTPSampler.use_keepalive', true),
            arg_mode: 'params',
            parameters: [],
            body_data: ''
        };
        if (global.JmsTgHttpDefaultsJmx && typeof global.JmsTgHttpDefaultsJmx.parseArguments === 'function') {
            var argsEl = el.querySelector('elementProp[name="HTTPsampler.Arguments"]');
            var postRaw = getBoolProp(el, 'HTTPSampler.postBodyRaw', false);
            var argPart = global.JmsTgHttpDefaultsJmx.parseArguments(argsEl, postRaw);
            result.arg_mode = argPart.arg_mode;
            result.parameters = argPart.parameters;
            result.body_data = argPart.body_data;
        }
        if (global.JmsTgHttpDefaultsAdvanced && typeof global.JmsTgHttpDefaultsAdvanced.parseFromEl === 'function') {
            Object.assign(result, global.JmsTgHttpDefaultsAdvanced.parseFromEl(el));
        }
        return result;
    }

    function parseThreadGroupLoad(el) {
        var loopVal = '';
        var main = el.getElementsByTagName('elementProp');
        for (var i = 0; i < main.length; i++) {
            if (main[i].getAttribute('name') === 'ThreadGroup.main_controller') {
                loopVal = getProp(main[i], 'LoopController.loops', '-1');
                break;
            }
        }
        if (loopVal === '') loopVal = getProp(el, 'LoopController.loops', '-1');
        var users = parseInt(getProp(el, 'ThreadGroup.num_threads', '1'), 10);
        var ramp = parseInt(getProp(el, 'ThreadGroup.ramp_time', '1'), 10);
        var duration = parseInt(getProp(el, 'ThreadGroup.duration', '60'), 10);
        return {
            users: Math.max(1, isNaN(users) ? 1 : users),
            spawn_rate: Math.max(1, isNaN(ramp) ? 1 : ramp),
            duration_sec: Math.max(1, isNaN(duration) ? 60 : duration),
            loops: loopVal === '' || loopVal === '-1' ? -1 : (parseInt(loopVal, 10) || -1)
        };
    }

    function parseTestPlanVariables(testPlan) {
        var vars = {};
        if (!testPlan) return vars;
        var args = testPlan.querySelector('elementProp[name="TestPlan.user_defined_variables"]');
        if (!args) return vars;
        var props = args.querySelectorAll('elementProp[elementType="Argument"]');
        for (var i = 0; i < props.length; i++) {
            var name = getStringProp(props[i], 'Argument.name');
            if (name) vars[name] = getStringProp(props[i], 'Argument.value');
        }
        return vars;
    }

    function objToCatalogKvList(obj) {
        var rows = [];
        Object.keys(obj || {}).forEach(function (k) {
            if (!k) return;
            rows.push({ name: k, key: k, value: obj[k] != null ? String(obj[k]) : '' });
        });
        return rows;
    }

    function pushPlanHeaderCatalogItem(planCatalogItems, hmObj, testname) {
        if (!Object.keys(hmObj || {}).length) return;
        planCatalogItems.push({
            type: 'catalog_element',
            id: 'pcat_imp_' + Math.random().toString(36).slice(2, 8),
            name: testname || '公共请求头',
            label_zh: testname || '公共请求头',
            enabled: true,
            alias: 'HeaderManager',
            testclass: 'HeaderManager',
            guiclass: 'HeaderPanel',
            category: 'config',
            container: false,
            scope: 'imported',
            catalog_props: { comments: '', headers: objToCatalogKvList(hmObj) }
        });
    }

    function pushPlanArgumentsCatalogItem(planCatalogItems, varsObj, testname) {
        if (!Object.keys(varsObj || {}).length) return;
        planCatalogItems.push({
            type: 'catalog_element',
            id: 'pcat_imp_' + Math.random().toString(36).slice(2, 8),
            name: testname || '计划变量',
            label_zh: testname || '计划变量',
            enabled: true,
            alias: 'Arguments',
            testclass: 'Arguments',
            guiclass: 'ArgumentsPanel',
            category: 'config',
            container: false,
            scope: 'imported',
            catalog_props: { comments: '', arguments: objToCatalogKvList(varsObj) }
        });
    }

    function parseArgumentsElement(node) {
        var vars = {};
        if (!node) return vars;
        var props = node.querySelectorAll('elementProp[elementType="Argument"]');
        for (var i = 0; i < props.length; i++) {
            var name = getStringProp(props[i], 'Argument.name');
            if (name) vars[name] = getStringProp(props[i], 'Argument.value');
        }
        return vars;
    }

    function inferBaseUrlFromVariables(variables, httpDefaults, firstStep) {
        if (variables && variables.BASE_URL) return String(variables.BASE_URL).replace(/\/$/, '');
        var protocol = (httpDefaults && httpDefaults.protocol) ||
            (firstStep && firstStep._protocol) || 'https';
        var domain = (httpDefaults && httpDefaults.domain) ||
            (firstStep && firstStep._domain) || '';
        if (!domain) return 'https://example.com';
        var port = httpDefaults && httpDefaults.port;
        var base = protocol + '://' + domain;
        if (port && port !== '80' && port !== '443') base += ':' + port;
        return base;
    }


    function _hostPrefixedImportPath(path) {
        return /^\/\/[^/?#]+/.test(String(path || ''));
    }

    function _collapsedHostImportPath(path) {
        return /^\/[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+\/?$/.test(String(path || ''));
    }

    function _restoreHostPrefixedImportPath(path) {
        path = String(path || '/');
        if (_hostPrefixedImportPath(path)) return path;
        if (!_collapsedHostImportPath(path)) return path;
        var m = path.match(/^\/([a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z0-9.-]+)\/?$/);
        return m ? ('//' + m[1] + '/') : path;
    }

    function normalizeImportedPath(path, variables) {
        path = String(path || '/');
        var hostFn = global.JmsJmxPathHost && global.JmsJmxPathHost.isHostPrefixedPath;
        if (hostFn ? hostFn.call(global.JmsJmxPathHost, path) : _hostPrefixedImportPath(path)) {
            return path;
        }
        var base = variables && variables.BASE_URL ? String(variables.BASE_URL).replace(/\/$/, '') : '';
        if (base && path.indexOf(base) === 0) {
            path = path.slice(base.length) || '/';
        }
        path = path.replace(/^\$\{BASE_URL\}\/?/, '');
        path = path.replace(/^\$\{ORIGIN\}\/?/, '');
        if (hostFn ? hostFn.call(global.JmsJmxPathHost, path) : _hostPrefixedImportPath(path)) {
            return path;
        }
        path = path.replace(/^\/+/, '/');
        if (path.indexOf('://') > 0) {
            try {
                var u = path.match(/^(https?):\/\/[^/]+(\/.*)?$/);
                if (u) path = u[2] || '/';
            } catch (e) { /* ignore */ }
        }
        if (!path.startsWith('/')) path = '/' + path;
        return _restoreHostPrefixedImportPath(path);
    }

    function normalizeCsvFilename(filename) {
        filename = String(filename || '').trim();
        if (!filename) return '';
        var base = filename.replace(/\\/g, '/').split('/').pop();
        return 'data/' + base;
    }

    function parseBeanShell(node) {
        if (global.JmsTgBeanshellPostJmx && typeof global.JmsTgBeanshellPostJmx.parseElement === 'function') {
            var parsed = global.JmsTgBeanshellPostJmx.parseElement(node);
            if (parsed) return parsed;
        }
        return {
            type: 'beanshell_post',
            name: node.getAttribute('testname') || 'BeanShell PostProcessor',
            enabled: isEnabled(node),
            script: getStringProp(node, 'script') || ''
        };
    }


    function parseDebugSampler(node) {
        return {
            type: 'debug_sampler',
            name: node.getAttribute('testname') || 'Debug Sampler',
            enabled: isEnabled(node),
            display_jmeter_variables: getBoolProp(node, 'displayJMeterVariables', true),
            display_jmeter_properties: getBoolProp(node, 'displayJMeterProperties', false),
            display_system_properties: getBoolProp(node, 'displaySystemProperties', false),
            comments: getStringProp(node, 'TestPlan.comments') || ''
        };
    }

    function parseExtractors(samplerTree) {
        var extractors = [];
        if (!samplerTree) return extractors;
        pairedWalk(samplerTree, function (node) {
            if ((node.getAttribute('testclass') || '') !== 'JSONPostProcessor') return;
            if (!isEnabled(node)) return;
            var varName = getStringProp(node, 'JSONPostProcessor.referenceNames');
            var jsonPath = getStringProp(node, 'JSONPostProcessor.jsonPathExprs');
            if (varName && jsonPath) {
                extractors.push({ var: varName, json_path: jsonPath });
            }
        });
        return extractors;
    }

    function parseAssertions(samplerTree) {
        var assertions = [];
        if (!samplerTree) return assertions;
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || '';
            if (!isEnabled(node)) return;
            if (tc === 'ResponseAssertion') {
                if (global.JmsHttpResponseAssertionJmx &&
                    typeof global.JmsHttpResponseAssertionJmx.parseElement === 'function') {
                    var raFull = global.JmsHttpResponseAssertionJmx.parseElement(node);
                    if (raFull) {
                        assertions.push(raFull);
                        return;
                    }
                }
                if (global.JmxResponseAssertion && typeof global.JmxResponseAssertion.parseElement === 'function') {
                    var ra = global.JmxResponseAssertion.parseElement(node);
                    if (ra) assertions.push(ra);
                } else {
                    var code = getStringProp(node, 'Assertion.response_code');
                    if (code) assertions.push({ type: 'status', value: parseInt(code, 10) || 200 });
                }
            } else if (tc === 'DurationAssertion') {
                var dur = getStringProp(node, 'DurationAssertion.duration');
                if (dur) assertions.push({ type: 'duration', value: parseInt(dur, 10) || 3000 });
            } else if (tc === 'JSR223Assertion') {
                if (global.JmxJsr223Assertion && typeof global.JmxJsr223Assertion.parseElement === 'function') {
                    var jsrA = global.JmxJsr223Assertion.parseElement(node);
                    if (jsrA && jsrA.enabled !== false) assertions.push(jsrA);
                }
            } else if (tc === 'JSONPathAssertion') {
                if (global.JmsHttpJsonAssertionJmx &&
                    typeof global.JmsHttpJsonAssertionJmx.parseElement === 'function') {
                    var jaFull = global.JmsHttpJsonAssertionJmx.parseElement(node);
                    if (jaFull) {
                        assertions.push(jaFull);
                        return;
                    }
                }
                assertions.push({
                    type: 'json',
                    value: getStringProp(node, 'JSON_PATH'),
                    expected: getStringProp(node, 'EXPECTED_VALUE'),
                    validate: getBoolProp(node, 'JSONVALIDATION', false),
                    expect_null: getBoolProp(node, 'EXPECT_NULL', false),
                    invert: getBoolProp(node, 'INVERT', false),
                    is_regex: getBoolProp(node, 'ISREGEX', false)
                });
            } else if (tc === 'SizeAssertion') {
                if (global.JmsHttpSizeAssertionJmx &&
                    typeof global.JmsHttpSizeAssertionJmx.parseElement === 'function') {
                    var saFull = global.JmsHttpSizeAssertionJmx.parseElement(node);
                    if (saFull) {
                        assertions.push(saFull);
                        return;
                    }
                }
                var legacySize = getStringProp(node, 'SizeAssertion.size');
                if (legacySize) {
                    var opInt = parseInt(getStringProp(node, 'SizeAssertion.operator') || '1', 10);
                    var opMap = { 1: 'eq', 2: 'ne', 3: 'gt', 4: 'lt', 5: 'ge', 6: 'le' };
                    assertions.push({
                        type: 'size',
                        value: legacySize,
                        operator: opMap[opInt] || 'eq'
                    });
                }
            } else if (tc === 'MD5HexAssertion') {
                if (global.JmsHttpMd5hexAssertionJmx &&
                    typeof global.JmsHttpMd5hexAssertionJmx.parseElement === 'function') {
                    var m5Full = global.JmsHttpMd5hexAssertionJmx.parseElement(node);
                    if (m5Full) {
                        assertions.push(m5Full);
                    }
                }
            }
        });
        return assertions;
    }

    function parseTgLevelAssertionNode(node) {
        if (!node || !isEnabled(node)) return null;
        var tc = node.getAttribute('testclass') || '';
        if (tc === 'ResponseAssertion' && global.JmsHttpResponseAssertionJmx &&
            typeof global.JmsHttpResponseAssertionJmx.parseElement === 'function') {
            return global.JmsHttpResponseAssertionJmx.parseElement(node);
        }
        if (tc === 'JSONPathAssertion' && global.JmsHttpJsonAssertionJmx &&
            typeof global.JmsHttpJsonAssertionJmx.parseElement === 'function') {
            return global.JmsHttpJsonAssertionJmx.parseElement(node);
        }
        if (tc === 'SizeAssertion' && global.JmsHttpSizeAssertionJmx &&
            typeof global.JmsHttpSizeAssertionJmx.parseElement === 'function') {
            return global.JmsHttpSizeAssertionJmx.parseElement(node);
        }
        if (tc === 'MD5HexAssertion' && global.JmsHttpMd5hexAssertionJmx &&
            typeof global.JmsHttpMd5hexAssertionJmx.parseElement === 'function') {
            return global.JmsHttpMd5hexAssertionJmx.parseElement(node);
        }
        return null;
    }

    function parseTgLevelAssertions(tgTree) {
        var assertions = [];
        if (!tgTree || !tgTree.children) return assertions;
        var children = tgTree.children;
        for (var i = 0; i < children.length; i++) {
            var node = children[i];
            if (!node || node.tagName === 'hashTree') continue;
            var parsed = parseTgLevelAssertionNode(node);
            if (parsed) assertions.push(parsed);
        }
        if (global.JmsTgAssertResolver &&
            typeof global.JmsTgAssertResolver.sanitizeImportedTgAssertions === 'function') {
            return global.JmsTgAssertResolver.sanitizeImportedTgAssertions({ assertions: assertions }).assertions || [];
        }
        return assertions;
    }


    function parseSamplerPreProcessors(samplerTree) {
        var preProcessors = [];
        var userParams = null;
        if (!samplerTree) return { pre_processors: preProcessors, user_parameters: userParams };
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || '';
            if (tc === 'BeanShellPreProcessor') {
                if (global.JmsHttpBeanshellPreProcessorJmx && typeof global.JmsHttpBeanshellPreProcessorJmx.parseElement === 'function') {
                    var bp = global.JmsHttpBeanshellPreProcessorJmx.parseElement(node);
                    if (bp && bp.enabled !== false) preProcessors.push(bp);
                }
                return;
            }
            if (tc === 'UserParameters') {
                if (global.JmsHttpBeanshellPreProcessorJmx && typeof global.JmsHttpBeanshellPreProcessorJmx.parseUserParametersElement === 'function') {
                    userParams = global.JmsHttpBeanshellPreProcessorJmx.parseUserParametersElement(node);
                }
            }
        });
        return { pre_processors: preProcessors, user_parameters: userParams };
    }

    function parseSamplerProcessors(samplerTree) {
        var processors = [];
        if (!samplerTree) return processors;
        pairedWalk(samplerTree, function (node) {
            var tc = node.getAttribute('testclass') || '';
            if (tc === 'JSR223PostProcessor') {
                if (!isEnabled(node)) return;
                if (global.JmxJsr223PostProcessor && typeof global.JmxJsr223PostProcessor.parseElement === 'function') {
                    var jsr = global.JmxJsr223PostProcessor.parseElement(node);
                    if (jsr) processors.push(jsr);
                }
                return;
            }
            if (tc === 'JSONPostProcessor') {
                if (!isEnabled(node)) return;
                if (global.JmxJsonPostProcessor && typeof global.JmxJsonPostProcessor.parseElement === 'function') {
                    var jp = global.JmxJsonPostProcessor.parseElement(node);
                    if (jp) processors.push(jp);
                } else {
                    var varName = getStringProp(node, 'JSONPostProcessor.referenceNames');
                    var jsonPath = getStringProp(node, 'JSONPostProcessor.jsonPathExprs');
                    if (varName && jsonPath) {
                        processors.push({
                            type: 'json_post',
                            name: node.getAttribute('testname') || 'JSON PostProcessor',
                            enabled: true,
                            var: varName,
                            json_path: jsonPath,
                            match_numbers: getStringProp(node, 'JSONPostProcessor.match_numbers') || '0',
                            default_value: getStringProp(node, 'JSONPostProcessor.defaultValues') || ''
                        });
                    }
                }
                return;
            }
            if (tc === 'RegexExtractor') {
                if (!isEnabled(node)) return;
                if (global.JmxRegexExtractor && typeof global.JmxRegexExtractor.parseElement === 'function') {
                    var reProc = global.JmxRegexExtractor.parseElement(node);
                    if (reProc) processors.push(reProc);
                }
                return;
            }
            if (tc === 'XPathExtractor') {
                if (!isEnabled(node)) return;
                if (global.JmxXPathExtractor && typeof global.JmxXPathExtractor.parseElement === 'function') {
                    var xpProc = global.JmxXPathExtractor.parseElement(node);
                    if (xpProc) processors.push(xpProc);
                }
                return;
            }
            if (tc === 'JDBCPostProcessor') {
                if (!isEnabled(node)) return;
                if (global.JmxJdbcPostProcessor && typeof global.JmxJdbcPostProcessor.parseElement === 'function') {
                    var jdbcProc = global.JmxJdbcPostProcessor.parseElement(node);
                    if (jdbcProc) processors.push(jdbcProc);
                }
                return;
            }
            if (tc !== 'BeanShellPostProcessor') return;
            if (!isEnabled(node)) return;
            processors.push(parseBeanShell(node));
        });
        return processors;
    }

    function parseSampler(el, subTree, variables) {
        var method = (getProp(el, 'HTTPSampler.method', 'GET') || 'GET').toUpperCase();
        var step = {
            name: el.getAttribute('testname') || 'HTTP 请求',
            method: method,
            path: (global.JmsJmxPathImport && typeof global.JmsJmxPathImport.normalizeJmxImportedPath === 'function')
                ? global.JmsJmxPathImport.normalizeJmxImportedPath(getProp(el, 'HTTPSampler.path', '/'), variables, normalizeImportedPath)
                : normalizeImportedPath(getProp(el, 'HTTPSampler.path', '/'), variables),
            enabled: isEnabled(el)
        };
        var enc = getProp(el, 'HTTPSampler.contentEncoding', '');
        if (enc) step.encoding = enc;

        var domain = getProp(el, 'HTTPSampler.domain', '');
        var protocol = getProp(el, 'HTTPSampler.protocol', '');
        if (domain) step._domain = domain;
        if (protocol) step._protocol = protocol;

        var postRaw = getBoolProp(el, 'HTTPSampler.postBodyRaw', false);
        var argsEl = el.querySelector('elementProp[name="HTTPsampler.Arguments"]');
        if (argsEl && method !== 'GET' && method !== 'HEAD') {
            var argProps = argsEl.getElementsByTagName('elementProp');
            if (postRaw && argProps.length) {
                step.body_type = 'json';
                step.body = getStringProp(argProps[0], 'Argument.value') || '';
            } else if (argProps.length) {
                var form = {};
                for (var i = 0; i < argProps.length; i++) {
                    var ap = argProps[i];
                    if (ap.getAttribute('elementType') === 'HTTPArgument') {
                        var k = getStringProp(ap, 'Argument.name') || ('arg' + i);
                        form[k] = getStringProp(ap, 'Argument.value');
                    }
                }
                if (Object.keys(form).length) {
                    step.body_type = 'form';
                    step.form_params = form;
                }
            }
        } else if (argsEl && (method === 'GET' || method === 'HEAD')) {
            if (!postRaw &&
                global.JmsJmxGetQueryImport &&
                typeof global.JmsJmxGetQueryImport.applyImportedGetHeadQueryParams === 'function') {
                global.JmsJmxGetQueryImport.applyImportedGetHeadQueryParams(step, argsEl);
            }
            if (global.JmsJmxGetBodyImport &&
                typeof global.JmsJmxGetBodyImport.applyImportedGetHeadBody === 'function') {
                global.JmsJmxGetBodyImport.applyImportedGetHeadBody(step, argsEl, postRaw);
            }
        }

        var assertions = parseAssertions(subTree);
        if (assertions.length) {
            step.assertions = assertions;
            var st = assertions.find(function (a) { return a.type === 'status'; });
            if (st) step.assert_status = st.value;
        }

        var preParsed = parseSamplerPreProcessors(subTree);
        if (preParsed.pre_processors.length) step.pre_processors = preParsed.pre_processors;
        if (preParsed.user_parameters) step.user_parameters = preParsed.user_parameters;

        var processors = parseSamplerProcessors(subTree);
        if (processors.length) step.processors = processors;

        var extractors = parseExtractors(subTree);
        if (processors.length) {
            var jsonProcVars = {};
            processors.forEach(function (p) {
                if (p && p.type === 'json_post' && p.var) jsonProcVars[p.var] = true;
            });
            if (Object.keys(jsonProcVars).length) {
                extractors = extractors.filter(function (ex) { return ex && !jsonProcVars[ex.var]; });
            }
        }
        if (extractors.length) {
            step.extractors = extractors;
            step.extract = { json_path: extractors[0].json_path, var: extractors[0].var };
        }

        if (global.JmsJsonPostExtractSync &&
            typeof global.JmsJsonPostExtractSync.syncExtractorsFromJsonPostProcessors === 'function') {
            global.JmsJsonPostExtractSync.syncExtractorsFromJsonPostProcessors(step);
        }

        if (global.JmsStepAssertResolver &&
            typeof global.JmsStepAssertResolver.sanitizeImportedStepAssertions === 'function') {
            global.JmsStepAssertResolver.sanitizeImportedStepAssertions(step);
        }

        if (global.JmsHttpStepConfigJmx &&
            typeof global.JmsHttpStepConfigJmx.applyImportedSamplerConfigStrict === 'function') {
            global.JmsHttpStepConfigJmx.applyImportedSamplerConfigStrict(step, subTree);
        } else if (global.JmsHttpStepConfigJmx &&
            typeof global.JmsHttpStepConfigJmx.applyImportedSamplerConfig === 'function') {
            global.JmsHttpStepConfigJmx.applyImportedSamplerConfig(step, subTree);
        }

        return step;
    }

    function defaultCsvDataSet() {
        return {
            enabled: false,
            filename: '',
            file_encoding: 'UTF-8',
            variable_names: '',
            ignore_first_line: false,
            delimiter: ',',
            quoted_data: false,
            recycle: true,
            stop_thread: false,
            share_mode: 'shareMode.all',
            file_content: '',
            source_path: ''
        };
    }

    function defaultCounter() {
        return {
            enabled: false,
            start: '1',
            increment: '1',
            maximum: '999999',
            format: '',
            variable_name: 'counter',
            per_user: true
        };
    }

    function defaultHttpManagers() {
        return {
            http_defaults: {
                enabled: false,
                protocol: '', domain: '', port: '', path: '',
                connect_timeout: '', response_timeout: '',
                implementation: 'HttpClient4', content_encoding: '',
                follow_redirects: true, auto_redirects: false, use_keepalive: true
            },
            header_manager: { enabled: false, headers: {} },
            cookie_manager: {
                enabled: false, clear_each_iteration: true,
                controlled_by_thread_group: false, cookies: []
            },
            cache_manager: {
                enabled: false, clear_each_iteration: true, use_expires: true
            },
            csv_data_set: defaultCsvDataSet(),
            counter: defaultCounter(),
            selected_types: []
        };
    }

    function parseCsvDataSet(node) {
        var src = getStringProp(node, 'filename');
        return {
            enabled: true,
            filename: normalizeCsvFilename(src),
            source_path: src,
            file_encoding: getStringProp(node, 'fileEncoding') || 'UTF-8',
            variable_names: getStringProp(node, 'variableNames'),
            ignore_first_line: getBoolProp(node, 'ignoreFirstLine', false),
            delimiter: getStringProp(node, 'delimiter') || ',',
            quoted_data: getBoolProp(node, 'quotedData', false),
            recycle: getBoolProp(node, 'recycle', true),
            stop_thread: getBoolProp(node, 'stopThread', false),
            share_mode: getStringProp(node, 'shareMode') || 'shareMode.all',
            file_content: ''
        };
    }

    function applyConfigElement(node, gui, tg) {
        var tc = node.getAttribute('testclass') || node.tagName;
        if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') {
            tg.http_managers.http_defaults = parseHttpDefaults(node);
            if (tg._selectedTypes.indexOf('http_defaults') < 0) tg._selectedTypes.push('http_defaults');
        } else if (tc === 'HeaderManager') {
            tg.http_managers.header_manager = {
                enabled: true,
                headers: mergeHeaders(tg.http_managers.header_manager.headers || {}, parseHeaderManager(node)),
                name: (node.getAttribute('testname') || '').trim(),
                comments: getStringProp(node, 'TestPlan.comments') || ''
            };
            if (tg._selectedTypes.indexOf('header_manager') < 0) tg._selectedTypes.push('header_manager');
        } else if (tc === 'CookieManager') {
            tg.http_managers.cookie_manager = {
                enabled: true,
                clear_each_iteration: getBoolProp(node, 'CookieManager.clearEachIteration', true),
                controlled_by_thread_group: getBoolProp(node, 'CookieManager.controlledByThreadGroup', false),
                cookies: []
            };
            if (tg._selectedTypes.indexOf('cookie_manager') < 0) tg._selectedTypes.push('cookie_manager');
        } else if (tc === 'CacheManager') {
            tg.http_managers.cache_manager = {
                enabled: true,
                clear_each_iteration: getBoolProp(node, 'CacheManager.clearEachIteration', true),
                use_expires: getBoolProp(node, 'CacheManager.useExpires', true)
            };
            if (tg._selectedTypes.indexOf('cache_manager') < 0) tg._selectedTypes.push('cache_manager');
        } else if (tc === 'CSVDataSet') {
            tg.http_managers.csv_data_set = parseCsvDataSet(node);
            if (tg._selectedTypes.indexOf('csv_data_set') < 0) tg._selectedTypes.push('csv_data_set');
        } else if (tc === 'CounterConfig') {
            tg.http_managers.counter = {
                enabled: true,
                start: getProp(node, 'CounterConfig.start', '1'),
                increment: getProp(node, 'CounterConfig.incr', '1'),
                maximum: getProp(node, 'CounterConfig.end', '999999'),
                format: getProp(node, 'CounterConfig.format', ''),
                variable_name: getProp(node, 'CounterConfig.name', 'counter'),
                per_user: getBoolProp(node, 'CounterConfig.per_user', true)
            };
            if (tg._selectedTypes.indexOf('counter') < 0) tg._selectedTypes.push('counter');
        } else if (tc === 'BackendListener') {
            if (global.JmsTgBackendListenerJmx && typeof global.JmsTgBackendListenerJmx.applyImportConfig === 'function') {
                global.JmsTgBackendListenerJmx.applyImportConfig(node, tg);
            } else {
                if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
                tg.listeners.backend_listener = isEnabled(node);
            }
        } else if (tc === 'ResultCollector') {
            if (global.JmsTgListenerImportJmx && typeof global.JmsTgListenerImportJmx.applyResultCollector === 'function') {
                global.JmsTgListenerImportJmx.applyResultCollector(node, tg);
            } else {
                if (!tg.listeners) tg.listeners = { view_results_tree: false, aggregate_report: false, backend_listener: false };
                if (isEnabled(node)) {
                    if (gui === 'ViewResultsFullVisualizer') tg.listeners.view_results_tree = true;
                    if (gui === 'StatVisualizer') tg.listeners.aggregate_report = true;
                }
            }
        }
    }


    function configTypeFromNode(node, gui) {
        var tc = node.getAttribute('testclass') || node.tagName;
        if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') return 'http_defaults';
        if (tc === 'HeaderManager') return 'header_manager';
        if (tc === 'AuthManager') return 'auth_manager';
        if (tc === 'CookieManager') return 'cookie_manager';
        if (tc === 'CacheManager') return 'cache_manager';
        if (tc === 'CSVDataSet') return 'csv_data_set';
        if (tc === 'CounterConfig') return 'counter';
        return null;
    }

    function buildConfigItemFromNode(node, gui) {
        var type = configTypeFromNode(node, gui);
        if (!type) return null;
        var testname = (node.getAttribute('testname') || '').trim();
        var data;
        if (type === 'http_defaults') {
            data = parseHttpDefaults(node);
            data.name = testname;
            data.comments = getStringProp(node, 'TestPlan.comments') || '';
        } else if (type === 'header_manager') {
            data = {
                name: testname,
                comments: getStringProp(node, 'TestPlan.comments') || '',
                headers: parseHeaderManager(node)
            };
        } else if (type === 'auth_manager') {
            if (global.JmsTgAuthManagerJmx && typeof global.JmsTgAuthManagerJmx.parseFromEl === 'function') {
                data = global.JmsTgAuthManagerJmx.parseFromEl(node, testname);
            } else {
                data = {
                    name: testname,
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    clear_each_iteration: getBoolProp(node, 'AuthManager.clearEachIteration', false),
                    authorizations: []
                };
            }
        } else if (type === 'cookie_manager') {
            if (global.JmsTgCookieManagerJmx && typeof global.JmsTgCookieManagerJmx.parseFromEl === 'function') {
                data = global.JmsTgCookieManagerJmx.parseFromEl(node, testname);
            } else {
                data = {
                    name: testname,
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    clear_each_iteration: getBoolProp(node, 'CookieManager.clearEachIteration', true),
                    cookie_policy: 'standard',
                    cookies: []
                };
            }
        } else if (type === 'cache_manager') {
            if (global.JmsTgCacheManagerJmx && typeof global.JmsTgCacheManagerJmx.parseFromEl === 'function') {
                data = global.JmsTgCacheManagerJmx.parseFromEl(node, testname);
            } else {
                data = {
                    name: testname,
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    clear_each_iteration: getBoolProp(node, 'CacheManager.clearEachIteration', true),
                    use_expires: getBoolProp(node, 'CacheManager.useExpires', true),
                    max_size: '5000'
                };
            }
        } else if (type === 'csv_data_set') {
            data = parseCsvDataSet(node);
        } else if (type === 'counter') {
            data = {
                name: testname || '',
                comments: getStringProp(node, 'TestPlan.comments') || '',
                start: getProp(node, 'CounterConfig.start', '1'),
                increment: getProp(node, 'CounterConfig.incr', '1'),
                maximum: getProp(node, 'CounterConfig.end', '999999'),
                format: getProp(node, 'CounterConfig.format', ''),
                variable_name: getProp(node, 'CounterConfig.name', 'counter'),
                per_user: getBoolProp(node, 'CounterConfig.per_user', true),
                reset_each_iteration: getBoolProp(node, 'CounterConfig.reset_on_tg_iteration', false)
            };
        }
        return { type: type, name: testname, data: data || {} };
    }

    function recordConfigElement(node, gui, tg, opts) {
        opts = opts || {};
        if (!opts.parent_step_id) {
            applyConfigElement(node, gui, tg);
        }
        var raw = buildConfigItemFromNode(node, gui);
        if (!raw) return;
        var Catalog = global.JmsTgConfigCatalog;
        var item = Catalog && typeof Catalog.normalizeItem === 'function'
            ? Catalog.normalizeItem(raw)
            : Object.assign({ id: 'cfg_' + Math.random().toString(36).slice(2, 10) }, raw);
        if (!item) return;
        item.import_order = tg._importSeq++;
        if (opts.parent_step_id) item.parent_step_id = opts.parent_step_id;
        if (!Array.isArray(tg.config_items)) tg.config_items = [];
        tg.config_items.push(item);
    }

    function walkSamplerConfigTimeline(subTree, tg, stepId) {
        if (!subTree || !stepId) return;
        pairedWalk(subTree, function (node, sub) {
            var gui = node.getAttribute('guiclass') || '';
            if (!configTypeFromNode(node, gui)) return;
            recordConfigElement(node, gui, tg, { parent_step_id: stepId });
        });
    }

    function tagStepOrder(tg, step) {
        if (step && typeof step === 'object') {
            if (!step.id) step.id = 'stp_' + Math.random().toString(36).slice(2, 10);
            step.import_order = tg._importSeq++;
        }
        return step;
    }

    function preassignStepId(step) {
        if (step && typeof step === 'object' && !step.id) {
            step.id = 'stp_' + Math.random().toString(36).slice(2, 10);
        }
        return step && step.id;
    }

    function walkStepsTree(tree, tg, variables, parentStepId) {
        var steps = [];
        if (!tree) return steps;
        pairedWalk(tree, function (node, sub) {
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';

            if (tc === 'BeanShellPostProcessor') {
                steps.push(tagStepOrder(tg, parseBeanShell(node)));
                return;
            }

            if (tc === 'JSONPostProcessor') {
                if (global.JmxJsonPostProcessor && typeof global.JmxJsonPostProcessor.parseElement === 'function') {
                    var jp = global.JmxJsonPostProcessor.parseElement(node);
                    if (jp) steps.push(tagStepOrder(tg, jp));
                }
                return;
            }

            if (tc === 'RegexExtractor') {
                if (global.JmxRegexExtractor && typeof global.JmxRegexExtractor.parseElement === 'function') {
                    var re = global.JmxRegexExtractor.parseElement(node);
                    if (re) steps.push(tagStepOrder(tg, re));
                }
                return;
            }

            if (tc === 'XPathExtractor') {
                if (global.JmxXPathExtractor && typeof global.JmxXPathExtractor.parseElement === 'function') {
                    var xp = global.JmxXPathExtractor.parseElement(node);
                    if (xp) steps.push(tagStepOrder(tg, xp));
                }
                return;
            }

            if (tc === 'JSR223PostProcessor') {
                if (global.JmxJsr223PostProcessor && typeof global.JmxJsr223PostProcessor.parseElement === 'function') {
                    var j223 = global.JmxJsr223PostProcessor.parseElement(node);
                    if (j223) steps.push(tagStepOrder(tg, j223));
                }
                return;
            }

            if (tc === 'JDBCPostProcessor') {
                if (global.JmxJdbcPostProcessor && typeof global.JmxJdbcPostProcessor.parseElement === 'function') {
                    var jdbc = global.JmxJdbcPostProcessor.parseElement(node);
                    if (jdbc) steps.push(tagStepOrder(tg, jdbc));
                }
                return;
            }

            if (tc === 'DebugSampler') {
                steps.push(tagStepOrder(tg, parseDebugSampler(node)));
                return;
            }

            if (tc === 'RandomController') {
                var rndItem = {
                    type: 'random_controller',
                    name: node.getAttribute('testname') || '随机控制器',
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    ignore_sub_controller_blocks: getBoolProp(node, 'RandomController.ignoreSubControllerBlocks', false),
                    enabled: isEnabled(node),
                    children: []
                };
                var rndId = preassignStepId(rndItem);
                rndItem.children = walkStepsTree(sub, tg, variables, rndId);
                steps.push(tagStepOrder(tg, rndItem));
                return;
            }

            if (tc === 'IfController') {
                var item = {
                    type: 'if_controller',
                    name: node.getAttribute('testname') || 'If 控制器',
                    condition: getStringProp(node, 'IfController.condition'),
                    evaluate_all: getBoolProp(node, 'IfController.evaluateAll', false),
                    use_expression: getBoolProp(node, 'IfController.useExpression', true),
                    enabled: isEnabled(node),
                    children: []
                };
                var ifId = preassignStepId(item);
                item.children = walkStepsTree(sub, tg, variables, ifId);
                steps.push(tagStepOrder(tg, item));
                return;
            }

            if (tc === 'TransactionController') {
                var txnItem = {
                    type: 'transaction_controller',
                    name: node.getAttribute('testname') || '事务控制器',
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    generate_parent_sample: getBoolProp(node, 'TransactionController.parent', false),
                    include_timer_duration: getBoolProp(node, 'TransactionController.includeTimers', false),
                    enabled: isEnabled(node),
                    children: []
                };
                var txnId = preassignStepId(txnItem);
                txnItem.children = walkStepsTree(sub, tg, variables, txnId);
                steps.push(tagStepOrder(tg, txnItem));
                return;
            }

            if (tc === 'LoopController' && gui === 'LoopControlPanel') {
                var forever = getBoolProp(node, 'LoopController.continue_forever', false);
                var loopsRaw = getProp(node, 'LoopController.loops', '1');
                var loopsNum = parseInt(loopsRaw, 10);
                if (isNaN(loopsNum)) loopsNum = 1;
                var loopItem = {
                    type: 'loop_controller',
                    name: node.getAttribute('testname') || '循环控制器',
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    loop_forever: forever || loopsNum < 0,
                    loops: (forever || loopsNum < 0) ? -1 : (loopsNum > 0 ? loopsNum : 1),
                    enabled: isEnabled(node),
                    children: []
                };
                var loopId = preassignStepId(loopItem);
                loopItem.children = walkStepsTree(sub, tg, variables, loopId);
                steps.push(tagStepOrder(tg, loopItem));
                return;
            }

            if (tc === 'GenericController' && gui === 'LogicControllerGui') {
                var simpleItem = {
                    type: 'simple_controller',
                    name: node.getAttribute('testname') || '简单控制器',
                    comments: getStringProp(node, 'TestPlan.comments') || '',
                    enabled: isEnabled(node),
                    children: []
                };
                var simpleId = preassignStepId(simpleItem);
                simpleItem.children = walkStepsTree(sub, tg, variables, simpleId);
                steps.push(tagStepOrder(tg, simpleItem));
                return;
            }

            if (tc === 'HTTPSamplerProxy' || node.tagName === 'HTTPSamplerProxy') {
                var step = tagStepOrder(tg, parseSampler(node, sub, variables));
                if (sub) {
                    var HT = global.JmsJmxImportSamplerHashTimelineV1;
                    if (HT && typeof HT.applyHashTimeline === 'function') {
                        HT.applyHashTimeline(sub, step, {
                            isEnabled: isEnabled,
                            getStringProp: getStringProp,
                            getBoolProp: getBoolProp,
                            configTypeFromNode: configTypeFromNode,
                            buildConfigItemFromNode: buildConfigItemFromNode,
                            parseBeanShell: parseBeanShell
                        });
                    } else {
                        walkSamplerConfigTimeline(sub, tg, step.id);
                    }
                }
                steps.push(step);
                return;
            }

            if (tc === 'MailerResultCollector') {
                var ML = global.JmsJmxImportListenerStepV1;
                if (ML && typeof ML.buildMailerStep === 'function') {
                    var mailerStep = ML.buildMailerStep(node);
                    if (mailerStep) {
                        steps.push(tagStepOrder(tg, mailerStep));
                        return;
                    }
                }
            }

            if (tc === 'Arguments') {
                var ArgImp = global.JmsJmxImportTgArgumentsStepV1;
                if (ArgImp && typeof ArgImp.buildStep === 'function') {
                    var argStep = ArgImp.buildStep(node);
                    if (argStep) {
                        steps.push(tagStepOrder(tg, argStep));
                        if (typeof ArgImp.mergeIntoTgVariables === 'function') {
                            ArgImp.mergeIntoTgVariables(tg, argStep);
                        }
                        return;
                    }
                }
            }

            if (tc === 'BackendListener' || tc === 'ResultCollector') {
                var L = global.JmsJmxImportListenerStepV1;
                if (L && typeof L.buildStep === 'function') {
                    var listenerStep = L.buildStep(node);
                    if (listenerStep) {
                        steps.push(tagStepOrder(tg, listenerStep));
                        return;
                    }
                }
                applyConfigElement(node, gui, tg);
                return;
            }

            var cfgTypeInline = configTypeFromNode(node, gui);
            if (cfgTypeInline && parentStepId) {
                var CC = global.JmsJmxImportControllerConfigStepV1;
                if (CC && typeof CC.buildStep === 'function') {
                    var ctrlCfgStep = CC.buildStep(node, gui, {
                        configTypeFromNode: configTypeFromNode,
                        buildConfigItemFromNode: buildConfigItemFromNode
                    });
                    if (ctrlCfgStep) {
                        steps.push(tagStepOrder(tg, ctrlCfgStep));
                        return;
                    }
                }
            }

            recordConfigElement(node, gui, tg, { parent_step_id: parentStepId || undefined });

            if (sub && ((tc === 'GenericController' && gui !== 'LogicControllerGui') || tc === 'WhileController')) {
                var nested = walkStepsTree(sub, tg, variables, parentStepId);
                if (nested.length) steps = steps.concat(nested);
            }
        });
        return steps;
    }

    function createThreadGroupShell(node, kind) {
        if (kind === true) kind = 'setup';
        if (kind === false || kind == null) kind = 'thread';
        var kindLabels = { setup: 'Setup 线程组', thread: '线程组', post: 'Post 线程组' };
        return {
            kind: kind,
            name: node.getAttribute('testname') || (kindLabels[kind] || '线程组'),
            load: parseThreadGroupLoad(node),
            steps: [],
            processors: [],
            assertions: [],
            variables: {},
            http_managers: defaultHttpManagers(),
            config_items: [],
            _selectedTypes: [],
            _importSeq: 0
        };
    }

    function finalizeThreadGroup(tg) {
        if (global.JmsTgImportTimeline &&
            typeof global.JmsTgImportTimeline.normalizeTgImportTimelineOrder === 'function') {
            global.JmsTgImportTimeline.normalizeTgImportTimelineOrder(tg);
        }
        tg.http_managers.selected_types = tg._selectedTypes.slice();
        delete tg._selectedTypes;
        delete tg._importSeq;
        tg.steps = (tg.steps || []).map(stripInternalStep);
        if (global.JmsTgAssertResolver &&
            typeof global.JmsTgAssertResolver.sanitizeImportedTgAssertions === 'function') {
            global.JmsTgAssertResolver.sanitizeImportedTgAssertions(tg);
        }
        return tg;
    }

    function stripInternalStep(step) {
        if (!step || typeof step !== 'object') return step;
        if (step.type === 'if_controller' || step.type === 'random_controller' || step.type === 'simple_controller' || step.type === 'transaction_controller' || step.type === 'loop_controller') {
            step.children = (step.children || []).map(stripInternalStep);
            return step;
        }
        delete step._domain;
        delete step._protocol;
        return step;
    }

    function countHttpSteps(steps) {
        var n = 0;
        (steps || []).forEach(function (st) {
            if (!st || typeof st !== 'object') return;
            if (st.type === 'if_controller' || st.type === 'random_controller' || st.type === 'simple_controller' || st.type === 'transaction_controller' || st.type === 'loop_controller') n += countHttpSteps(st.children);
            else if (st.method) n += 1;
        });
        return n;
    }

    function collectCsvNeeds(groups) {
        var list = [];
        (groups || []).forEach(function (tg) {
            var csv = tg.http_managers && tg.http_managers.csv_data_set;
            if (!csv || !csv.enabled || !csv.source_path) return;
            list.push({
                normalized: csv.filename,
                source_path: csv.source_path,
                variable_names: csv.variable_names
            });
        });
        return list;
    }

    function buildImportReport(scenario, meta) {
        var httpSteps = 0;
        var ifControllers = 0;
        var beanshell = 0;
        var jsonAssertions = 0;
        var extractors = 0;
        var placeholders = 0;

        function walk(steps) {
            (steps || []).forEach(function (st) {
                if (!st) return;
                if (st.type === 'if_controller' || st.type === 'random_controller') {
                    ifControllers += 1;
                    walk(st.children);
                    return;
                }
                if (st.name === '占位请求' && st.path === '/') placeholders += 1;
                if (st.method) httpSteps += 1;
                if (st.type === 'beanshell_post') beanshell += 1;
                if (st.processors) beanshell += st.processors.length;
                if (st.extractors) extractors += st.extractors.length;
                if (st.assertions) {
                    st.assertions.forEach(function (a) {
                        if (a.type === 'json') jsonAssertions += 1;
                    });
                }
            });
        }

        (scenario.setup_thread_groups || []).forEach(function (tg) {
            if (tg.processors) beanshell += tg.processors.length;
            walk(tg.steps);
        });
        (scenario.thread_groups || []).forEach(function (tg) {
            if (tg.processors) beanshell += tg.processors.length;
            walk(tg.steps);
        });
        (scenario.post_thread_groups || []).forEach(function (tg) {
            if (tg.processors) beanshell += tg.processors.length;
            walk(tg.steps);
        });

        return {
            planName: scenario.name,
            threadGroups: (scenario.thread_groups || []).length,
            setupThreadGroups: (scenario.setup_thread_groups || []).length,
            postThreadGroups: (scenario.post_thread_groups || []).length,
            steps: httpSteps,
            variables: (function () {
                if (global.JmsPlanCatalogResolve && typeof global.JmsPlanCatalogResolve.resolvePlanVariablesFromData === 'function') {
                    return Object.keys(global.JmsPlanCatalogResolve.resolvePlanVariablesFromData(scenario)).length;
                }
                return Object.keys(scenario.variables || {}).length;
            })(),
            ifControllers: ifControllers,
            beanshellProcessors: beanshell,
            jsonAssertions: jsonAssertions,
            extractors: extractors,
            placeholders: placeholders,
            csvAttachments: collectCsvNeeds((scenario.setup_thread_groups || []).concat(scenario.thread_groups || []).concat(scenario.post_thread_groups || [])),
            warnings: meta.warnings || [],
            supportsRawJmx: true
        };
    }


    var CATALOG_CTRL_MAP = {
        if_controller: { alias: 'IfController', testclass: 'IfController', guiclass: 'IfControllerPanel', category: 'controller', container: true, label_zh: 'If 控制器' },
        random_controller: { alias: 'RandomController', testclass: 'RandomController', guiclass: 'RandomControlPanel', category: 'controller', container: true, label_zh: '随机控制器' },
        simple_controller: { alias: 'GenericController', testclass: 'GenericController', guiclass: 'LogicControllerGui', category: 'controller', container: true, label_zh: '简单控制器' },
        transaction_controller: { alias: 'TransactionController', testclass: 'TransactionController', guiclass: 'TransactionControllerGui', category: 'controller', container: true, label_zh: '事务控制器' },
        loop_controller: { alias: 'LoopController', testclass: 'LoopController', guiclass: 'LoopControlPanel', category: 'controller', container: true, label_zh: '循环控制器' }
    };

    function catalogUid(prefix) {
        return (prefix || 'cat_') + Math.random().toString(36).slice(2, 10);
    }

    function copyStepProps(src, skip) {
        skip = skip || {};
        var out = {};
        if (!src || typeof src !== 'object') return out;
        Object.keys(src).forEach(function (k) {
            if (skip[k]) return;
            out[k] = src[k];
        });
        return out;
    }

    function catalogizeStep(step) {
        if (!step) return null;
        if (global.JmsCatalogUnifyMigrate && typeof global.JmsCatalogUnifyMigrate.stepToCatalog === 'function') {
            return global.JmsCatalogUnifyMigrate.stepToCatalog(step);
        }
        if (step.type === 'catalog_element') {
            if (Array.isArray(step.children)) {
                step.children = step.children.map(catalogizeStep).filter(Boolean);
            }
            return step;
        }
        if (!step.type && (step.method || step.path != null)) {
            var httpCat = {
                id: step.id || catalogUid(),
                type: 'catalog_element',
                name: step.name || 'HTTP 请求',
                enabled: step.enabled !== false,
                alias: 'HTTPSamplerProxy',
                testclass: 'HTTPSamplerProxy',
                guiclass: 'HttpTestSampleGui',
                category: 'sampler',
                label_zh: 'HTTP 请求',
                container: false,
                scope: 'unified',
                method: step.method,
                path: step.path,
                catalog_props: copyStepProps(step, { id: 1, type: 1, children: 1, catalog_hash_children: 1 }),
                jmx_fragment: step.jmx_fragment || ''
            };
            if (Array.isArray(step.catalog_hash_children)) {
                httpCat.catalog_hash_children = step.catalog_hash_children.map(catalogizeStep).filter(Boolean);
            }
            if (step.import_order != null) httpCat.import_order = step.import_order;
            return httpCat;
        }
        var map = CATALOG_CTRL_MAP[step.type];
        if (!map) return step;
        var cat = {
            id: step.id || catalogUid(),
            type: 'catalog_element',
            name: step.name || map.label_zh || map.alias,
            enabled: step.enabled !== false,
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || (map.alias + 'Gui'),
            category: map.category || 'controller',
            label_zh: map.label_zh || step.name || map.alias,
            container: !!map.container,
            scope: 'unified',
            catalog_props: copyStepProps(step, { id: 1, type: 1, children: 1 }),
            jmx_fragment: step.jmx_fragment || ''
        };
        if (map.container) cat.children = (step.children || []).map(catalogizeStep).filter(Boolean);
        if (step.import_order != null) cat.import_order = step.import_order;
        return cat;
    }

    function catalogizeScenarioSteps(scenario) {
        if (!scenario || typeof scenario !== 'object') return scenario;
        function walkTg(tg) {
            if (!tg || !Array.isArray(tg.steps)) return;
            tg.steps = tg.steps.map(catalogizeStep).filter(Boolean);
        }
        (scenario.setup_thread_groups || []).forEach(walkTg);
        (scenario.thread_groups || []).forEach(walkTg);
        (scenario.post_thread_groups || []).forEach(walkTg);
        return scenario;
    }

    function parseJmxXml(xmlText, opts) {
        opts = opts || {};
        var parser = new DOMParser();
        var doc = parser.parseFromString(xmlText, 'application/xml');
        if (doc.querySelector('parsererror')) {
            throw new Error('JMX 不是有效的 XML');
        }

        var testPlan = doc.querySelector('TestPlan');
        var planName = (testPlan && testPlan.getAttribute('testname')) || '导入的测试计划';
        var planVariables = parseTestPlanVariables(testPlan);
        var serializeTg = testPlan ? getBoolProp(testPlan, 'TestPlan.serialize_threadgroups', false) : false;
        var defaultHeaders = {};
        var warnings = [];

        var rootHash = doc.querySelector('jmeterTestPlan > hashTree > hashTree');
        if (!rootHash) rootHash = doc.querySelector('hashTree');

        var globalHttpDefaults = null;
        var setupThreadGroups = [];
        var threadGroups = [];
        var postThreadGroups = [];
        var planCatalogItems = [];

        function planNodeHandledKey(node) {
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';
            if (tc === 'HeaderManager') return true;
            if (tc === 'Arguments') return true;
            if (tc === 'ConfigTestElement' && gui === 'HttpDefaultsGui') return true;
            if (tc === 'SetupThreadGroup' || tc === 'ThreadGroup' || tc === 'PostThreadGroup') return true;
            return false;
        }

        function nodeToJmxFragment(node) {
            try {
                if (global.XMLSerializer) return new global.XMLSerializer().serializeToString(node);
            } catch (e) {}
            return '';
        }

        function pushPlanCatalogNode(node, sub) {
            if (!node || node.parentNode !== rootHash) return;
            if (planNodeHandledKey(node)) return;
            var tc = node.getAttribute('testclass') || node.tagName;
            var gui = node.getAttribute('guiclass') || '';
            var alias = tc;
            var container = !!(sub && sub.querySelector && sub.querySelector('[testclass]'));
            var item = {
                type: 'catalog_element',
                name: node.getAttribute('testname') || alias,
                enabled: node.getAttribute('enabled') !== 'false',
                alias: alias,
                testclass: tc,
                guiclass: gui,
                category: tc === 'ResultCollector' ? 'listener' : (tc.indexOf('Config') >= 0 ? 'config' : 'other'),
                label_zh: node.getAttribute('testname') || alias,
                container: container,
                scope: 'imported',
                jmx_fragment: nodeToJmxFragment(node),
                catalog_props: { comments: '' }
            };
            if (container && sub) item.children = [];
            planCatalogItems.push(item);
        }

        if (rootHash) {
            pairedWalk(rootHash, function (node, sub) {
                var tc = node.getAttribute('testclass') || node.tagName;
                if (tc === 'ResultCollector' && node.parentNode === rootHash) {
                    pushPlanCatalogNode(node, sub);
                    return;
                }
                if (node.parentNode === rootHash && !planNodeHandledKey(node)) {
                    pushPlanCatalogNode(node, sub);
                    return;
                }
                if (tc === 'HeaderManager' && node.parentNode === rootHash) {
                    pushPlanHeaderCatalogItem(planCatalogItems, parseHeaderManager(node), node.getAttribute('testname'));
                    return;
                }
                if (tc === 'Arguments' && node.parentNode === rootHash) {
                    pushPlanArgumentsCatalogItem(planCatalogItems, parseArgumentsElement(node), node.getAttribute('testname'));
                    return;
                }
                if (tc === 'HeaderManager') {
                    defaultHeaders = mergeHeaders(defaultHeaders, parseHeaderManager(node));
                } else if (tc === 'ConfigTestElement' && node.getAttribute('guiclass') === 'HttpDefaultsGui') {
                    globalHttpDefaults = parseHttpDefaults(node);
                } else if (tc === 'SetupThreadGroup') {
                    var stg = createThreadGroupShell(node, 'setup');
                    if (sub) {
                        stg.assertions = parseTgLevelAssertions(sub);
                        stg.steps = walkStepsTree(sub, stg, planVariables);
                    }
                    setupThreadGroups.push(finalizeThreadGroup(stg));
                } else if (tc === 'ThreadGroup') {
                    var tg = createThreadGroupShell(node, 'thread');
                    if (sub) {
                        tg.assertions = parseTgLevelAssertions(sub);
                        tg.steps = walkStepsTree(sub, tg, planVariables);
                    }
                    finalizeThreadGroup(tg);
                    if (!tg.steps.length) {
                        warnings.push('线程组「' + tg.name + '」未解析到 HTTP 步骤');
                    }
                    threadGroups.push(tg);
                } else if (tc === 'PostThreadGroup') {
                    var ptg = createThreadGroupShell(node, 'post');
                    if (sub) {
                        ptg.assertions = parseTgLevelAssertions(sub);
                        ptg.steps = walkStepsTree(sub, ptg, planVariables);
                    }
                    finalizeThreadGroup(ptg);
                    if (!ptg.steps.length) {
                        warnings.push('后置线程组「' + ptg.name + '」未解析到 HTTP 步骤');
                    }
                    postThreadGroups.push(ptg);
                }
            });
        }

        if (!threadGroups.length) {
            var samplers = doc.querySelectorAll('HTTPSamplerProxy');
            var steps = [];
            for (var si = 0; si < samplers.length; si++) {
                steps.push(parseSampler(samplers[si], null, planVariables));
            }
            if (!steps.length) throw new Error('JMX 中未找到 ThreadGroup 或 HTTP 请求');
            threadGroups.push({
                kind: 'thread',
                name: '导入线程组',
                load: { users: 1, spawn_rate: 1, duration_sec: 60, loops: -1 },
                steps: steps,
                processors: [],
                variables: {},
                http_managers: defaultHttpManagers()
            });
        }

        var allSteps = [];
        setupThreadGroups.forEach(function (tg) { allSteps = allSteps.concat(tg.steps); });
        threadGroups.forEach(function (tg) { allSteps = allSteps.concat(tg.steps); });
        postThreadGroups.forEach(function (tg) { allSteps = allSteps.concat(tg.steps); });
        var firstHttp = null;
        function findHttp(steps) {
            for (var i = 0; i < (steps || []).length; i++) {
                var st = steps[i];
                if (st.type === 'if_controller') {
                    var nested = findHttp(st.children);
                    if (nested) return nested;
                } else if (st.method) return st;
            }
            return null;
        }
        setupThreadGroups.some(function (tg) { firstHttp = findHttp(tg.steps); return !!firstHttp; });
        if (!firstHttp) threadGroups.some(function (tg) { firstHttp = findHttp(tg.steps); return !!firstHttp; });
        if (!firstHttp) postThreadGroups.some(function (tg) { firstHttp = findHttp(tg.steps); return !!firstHttp; });

        var hd = globalHttpDefaults || (threadGroups[0] && threadGroups[0].http_managers.http_defaults);
        var baseUrl = inferBaseUrlFromVariables(planVariables, hd, firstHttp);

        if (Object.keys(planVariables).length) {
            pushPlanArgumentsCatalogItem(planCatalogItems, planVariables, '计划变量 ' + planName);
        }

        var scenario = {
            name: planName,
            base_url: baseUrl,
            env: 'staging',
            build: '${BUILD_ID}',
            layout: 'scenario',
            execution_mode: opts.preferRawJmx ? 'raw_jmx' : 'visual',
            serialize_threadgroups: serializeTg,
            default_headers: {},
            variables: {},
            influxdb: {
                enabled: true,
                url: 'http://127.0.0.1:8086/write?db=jmeter',
                measurement: 'jmeter',
                application: 'jmx-import',
                tags: { scenario: 'jmx-import', env: 'staging' }
            },
            setup_thread_groups: setupThreadGroups,
            thread_groups: threadGroups,
            post_thread_groups: postThreadGroups
        };
        if (planCatalogItems.length) {
            scenario.plan_catalog_items = planCatalogItems;
        } else if (Object.keys(defaultHeaders).length) {
            pushPlanHeaderCatalogItem(planCatalogItems, defaultHeaders, '公共请求头');
            scenario.plan_catalog_items = planCatalogItems;
        }

        if (opts.storeRawJmx !== false) {
            scenario.raw_jmx = {
                enabled: true,
                original_filename: opts.originalFilename || 'imported.jmx',
                xml: xmlText
            };
        }

        catalogizeScenarioSteps(scenario);
        var report = buildImportReport(scenario, { warnings: warnings });
        scenario._import_report = report;
        return scenario;
    }

    function scenarioToYaml(scenario) {
        var copy = JSON.parse(JSON.stringify(scenario));
        delete copy._import_report;
        if (copy.raw_jmx) delete copy.raw_jmx.xml;
        if (global.jsyaml && typeof global.jsyaml.dump === 'function') {
            if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.repairHostPathsInScenarioObject === 'function') {
                global.JmsJmxPathHost.repairHostPathsInScenarioObject(copy);
            }
            var yaml = global.jsyaml.dump(copy, { lineWidth: 120, noRefs: true });
            if (global.JmsHttpStepConfigJmx &&
                typeof global.JmsHttpStepConfigJmx.quoteSpecialHttpMethodsInYaml === 'function') {
                yaml = global.JmsHttpStepConfigJmx.quoteSpecialHttpMethodsInYaml(yaml);
            }
            if (global.JmsJmxPathHost && typeof global.JmsJmxPathHost.quoteHostPathsInYaml === 'function') {
                yaml = global.JmsJmxPathHost.quoteHostPathsInYaml(yaml);
            }
            return yaml;
        }
        throw new Error('jsyaml 未加载');
    }

    function parseFileAsync(file, callbacks) {
        callbacks = callbacks || {};
        if (!file) {
            if (callbacks.onError) callbacks.onError('未选择文件');
            return;
        }
        var name = (file.name || '').toLowerCase();
        if (!name.endsWith('.jmx')) {
            if (callbacks.onError) callbacks.onError('仅支持 .jmx 文件');
            return;
        }
        if (file.size > MAX_BYTES) {
            if (callbacks.onError) callbacks.onError('文件超过 2MB，请精简后重试');
            return;
        }
        if (callbacks.onStart) callbacks.onStart(file);

        var reader = new FileReader();
        reader.onload = function () {
            var text = reader.result;
            var runParse = function () {
                try {
                    if (callbacks.onProgress) callbacks.onProgress('正在解析 JMX…');
                    var P = global.JmxImportParser;
                    var parseFn = (P && typeof P.parseJmxXml === 'function') ? P.parseJmxXml : parseJmxXml;
                    var yamlFn = (P && typeof P.scenarioToYaml === 'function') ? P.scenarioToYaml : scenarioToYaml;
                    var scenario = parseFn.call(P || null, text, {
                        originalFilename: file.name,
                        storeRawJmx: true,
                        preferRawJmx: false
                    });
                    var yaml = yamlFn.call(P || null, scenario);
                    var summary = scenario._import_report || buildImportReport(scenario, { warnings: [] });
                    if (callbacks.onSuccess) {
                        callbacks.onSuccess({
                            yaml: yaml,
                            scenario: scenario,
                            summary: summary,
                            rawXml: text,
                            rawFilename: file.name
                        });
                    }
                } catch (e) {
                    if (callbacks.onError) callbacks.onError(e.message || String(e));
                }
            };
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(function () { setTimeout(runParse, 0); }, { timeout: 3000 });
            } else {
                setTimeout(runParse, 0);
            }
        };
        reader.onerror = function () {
            if (callbacks.onError) callbacks.onError('读取文件失败');
        };
        reader.readAsText(file);
    }

    global.JmxImportParser = {
        MAX_BYTES: MAX_BYTES,
        parseJmxXml: parseJmxXml,
        scenarioToYaml: scenarioToYaml,
        parseFileAsync: parseFileAsync,
        countHttpSteps: countHttpSteps,
        buildImportReport: buildImportReport,
        normalizeImportedPath: normalizeImportedPath,
        configTypeFromNode: configTypeFromNode,
        buildConfigItemFromNode: buildConfigItemFromNode
    };
})(typeof window !== 'undefined' ? window : this);
