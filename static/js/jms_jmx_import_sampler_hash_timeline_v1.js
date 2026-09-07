/**
 * JMX 导入 · HTTP 取样器 hashTree 子元件按时间线写入 catalog_hash_children（隔离模块）
 */
(function (global) {
    'use strict';

    var PROC_MAP = {
        json_post: { alias: 'JSONPostProcessor', testclass: 'JSONPostProcessor', guiclass: 'JSONPostProcessorGui', category: 'postprocessor', label_zh: 'JSON 提取器' },
        regex_extract: { alias: 'RegexExtractor', testclass: 'RegexExtractor', guiclass: 'RegexExtractorGui', category: 'postprocessor', label_zh: '正则表达式提取器' },
        xpath_extract: { alias: 'XPathExtractor', testclass: 'XPathExtractor', guiclass: 'XPathExtractorGui', category: 'postprocessor', label_zh: 'XPath 提取器' },
        jdbc_post: { alias: 'JDBCPostProcessor', testclass: 'JDBCPostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'JDBC 后置处理器' },
        jsr223_post: { alias: 'JSR223PostProcessor', testclass: 'JSR223PostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'JSR223 后置处理器' },
        beanshell_post: { alias: 'BeanShellPostProcessor', testclass: 'BeanShellPostProcessor', guiclass: 'TestBeanGUI', category: 'postprocessor', label_zh: 'BeanShell 后置处理器' }
    };

    var PRE_MAP = {
        beanshell_pre: { alias: 'BeanShellPreProcessor', testclass: 'BeanShellPreProcessor', guiclass: 'TestBeanGUI', category: 'preprocessor', label_zh: 'BeanShell 前置处理器' }
    };

    var ASSERT_MAP = {
        response: { alias: 'ResponseAssertion', testclass: 'ResponseAssertion', guiclass: 'AssertionGui', category: 'assertion', label_zh: '响应断言' },
        response_assert: { alias: 'ResponseAssertion', testclass: 'ResponseAssertion', guiclass: 'AssertionGui', category: 'assertion', label_zh: '响应断言' },
        json: { alias: 'JSONPathAssertion', testclass: 'JSONPathAssertion', guiclass: 'JSONPathAssertionGui', category: 'assertion', label_zh: 'JSON 断言' },
        json_assert: { alias: 'JSONPathAssertion', testclass: 'JSONPathAssertion', guiclass: 'JSONPathAssertionGui', category: 'assertion', label_zh: 'JSON 断言' },
        size: { alias: 'SizeAssertion', testclass: 'SizeAssertion', guiclass: 'SizeAssertionGui', category: 'assertion', label_zh: '大小断言' },
        size_assert: { alias: 'SizeAssertion', testclass: 'SizeAssertion', guiclass: 'SizeAssertionGui', category: 'assertion', label_zh: '大小断言' },
        md5hex: { alias: 'MD5HexAssertion', testclass: 'MD5HexAssertion', guiclass: 'MD5HexAssertionGui', category: 'assertion', label_zh: 'MD5Hex 断言' },
        md5hex_assert: { alias: 'MD5HexAssertion', testclass: 'MD5HexAssertion', guiclass: 'MD5HexAssertionGui', category: 'assertion', label_zh: 'MD5Hex 断言' },
        jsr223_assert: { alias: 'JSR223Assertion', testclass: 'JSR223Assertion', guiclass: 'TestBeanGUI', category: 'assertion', label_zh: 'JSR223 断言' }
    };

    function uid(prefix) {
        return (prefix || 'cat_') + Math.random().toString(36).slice(2, 10);
    }

    function elementChildren(el) {
        var out = [];
        var ch = (el && el.childNodes) || [];
        for (var i = 0; i < ch.length; i++) {
            if (ch[i].nodeType === 1) out.push(ch[i]);
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

    function buildCatalog(map, name, props, enabled) {
        return {
            id: uid('cat_'),
            type: 'catalog_element',
            name: name || map.label_zh || map.alias,
            enabled: enabled !== false,
            alias: map.alias,
            testclass: map.testclass || map.alias,
            guiclass: map.guiclass || (map.alias + 'Gui'),
            category: map.category || 'other',
            label_zh: map.label_zh || map.alias,
            container: false,
            scope: 'unified',
            catalog_props: props && typeof props === 'object' ? Object.assign({}, props) : {},
            jmx_fragment: ''
        };
    }

    function legacyToCatalog(mapTable, raw, fallbackName) {
        if (!raw || !raw.type) return null;
        var map = mapTable[raw.type];
        if (!map) return null;
        var props = Object.assign({}, raw);
        delete props.type;
        delete props.id;
        return buildCatalog(map, raw.name || fallbackName || map.label_zh, props, raw.enabled !== false);
    }

    function configNodeToCatalog(node, gui, helpers) {
        var CC = global.JmsJmxImportControllerConfigStepV1;
        if (CC && typeof CC.buildStep === 'function' && helpers) {
            return CC.buildStep(node, gui, helpers);
        }
        return null;
    }

    function parseAssertionNode(node, helpers) {
        if (!node || !helpers || !helpers.isEnabled(node)) return null;
        var tc = node.getAttribute('testclass') || '';
        if (tc === 'JSONPathAssertion' && global.JmsHttpJsonAssertionJmx &&
            typeof global.JmsHttpJsonAssertionJmx.parseElement === 'function') {
            return global.JmsHttpJsonAssertionJmx.parseElement(node);
        }
        if (tc === 'ResponseAssertion' && global.JmsHttpResponseAssertionJmx &&
            typeof global.JmsHttpResponseAssertionJmx.parseElement === 'function') {
            return global.JmsHttpResponseAssertionJmx.parseElement(node);
        }
        if (tc === 'SizeAssertion' && global.JmsHttpSizeAssertionJmx &&
            typeof global.JmsHttpSizeAssertionJmx.parseElement === 'function') {
            return global.JmsHttpSizeAssertionJmx.parseElement(node);
        }
        if (tc === 'MD5HexAssertion' && global.JmsHttpMd5hexAssertionJmx &&
            typeof global.JmsHttpMd5hexAssertionJmx.parseElement === 'function') {
            return global.JmsHttpMd5hexAssertionJmx.parseElement(node);
        }
        if (tc === 'JSR223Assertion' && global.JmxJsr223Assertion &&
            typeof global.JmxJsr223Assertion.parseElement === 'function') {
            return global.JmxJsr223Assertion.parseElement(node);
        }
        if (tc === 'JSONPathAssertion') {
            return {
                type: 'json',
                name: node.getAttribute('testname') || 'JSON 断言',
                enabled: true,
                value: helpers.getStringProp(node, 'JSON_PATH'),
                expected: helpers.getStringProp(node, 'EXPECTED_VALUE'),
                validate: helpers.getBoolProp(node, 'JSONVALIDATION', false),
                expect_null: helpers.getBoolProp(node, 'EXPECT_NULL', false),
                invert: helpers.getBoolProp(node, 'INVERT', false),
                is_regex: helpers.getBoolProp(node, 'ISREGEX', false)
            };
        }
        return null;
    }

    function parseProcessorNode(node, helpers) {
        if (!node || !helpers || !helpers.isEnabled(node)) return null;
        var tc = node.getAttribute('testclass') || '';
        if (tc === 'JSONPostProcessor' && global.JmxJsonPostProcessor &&
            typeof global.JmxJsonPostProcessor.parseElement === 'function') {
            return global.JmxJsonPostProcessor.parseElement(node);
        }
        if (tc === 'JSONPostProcessor' && helpers.getStringProp) {
            var varName = helpers.getStringProp(node, 'JSONPostProcessor.referenceNames');
            var jsonPath = helpers.getStringProp(node, 'JSONPostProcessor.jsonPathExprs');
            if (varName && jsonPath) {
                return {
                    type: 'json_post',
                    name: node.getAttribute('testname') || 'JSON PostProcessor',
                    enabled: true,
                    var: varName,
                    json_path: jsonPath,
                    match_numbers: helpers.getStringProp(node, 'JSONPostProcessor.match_numbers') || '0',
                    default_value: helpers.getStringProp(node, 'JSONPostProcessor.defaultValues') || ''
                };
            }
        }
        if (tc === 'RegexExtractor' && global.JmxRegexExtractor &&
            typeof global.JmxRegexExtractor.parseElement === 'function') {
            return global.JmxRegexExtractor.parseElement(node);
        }
        if (tc === 'XPathExtractor' && global.JmxXPathExtractor &&
            typeof global.JmxXPathExtractor.parseElement === 'function') {
            return global.JmxXPathExtractor.parseElement(node);
        }
        if (tc === 'JSR223PostProcessor' && global.JmxJsr223PostProcessor &&
            typeof global.JmxJsr223PostProcessor.parseElement === 'function') {
            return global.JmxJsr223PostProcessor.parseElement(node);
        }
        if (tc === 'JDBCPostProcessor' && global.JmxJdbcPostProcessor &&
            typeof global.JmxJdbcPostProcessor.parseElement === 'function') {
            return global.JmxJdbcPostProcessor.parseElement(node);
        }
        if (tc === 'BeanShellPostProcessor' && helpers.parseBeanShell) {
            return helpers.parseBeanShell(node);
        }
        return null;
    }

    function parsePreProcessorNode(node, helpers) {
        if (!node || !helpers || !helpers.isEnabled(node)) return null;
        var tc = node.getAttribute('testclass') || '';
        if (tc === 'BeanShellPreProcessor' && global.JmsHttpBeanshellPreProcessorJmx &&
            typeof global.JmsHttpBeanshellPreProcessorJmx.parseElement === 'function') {
            return global.JmsHttpBeanshellPreProcessorJmx.parseElement(node);
        }
        return null;
    }

    function hashChildFromNode(node, gui, helpers) {
        if (!node || !helpers) return null;
        var tc = node.getAttribute('testclass') || node.tagName;
        if (helpers.configTypeFromNode && helpers.configTypeFromNode(node, gui)) {
            return configNodeToCatalog(node, gui, helpers);
        }
        var assertion = parseAssertionNode(node, helpers);
        if (assertion) return legacyToCatalog(ASSERT_MAP, assertion, node.getAttribute('testname'));
        var proc = parseProcessorNode(node, helpers);
        if (proc) return legacyToCatalog(PROC_MAP, proc, node.getAttribute('testname'));
        var pre = parsePreProcessorNode(node, helpers);
        if (pre) return legacyToCatalog(PRE_MAP, pre, node.getAttribute('testname'));
        return null;
    }

    function stripLegacyMountFields(step) {
        if (!step || typeof step !== 'object') return;
        delete step.assertions;
        delete step.processors;
        delete step.pre_processors;
        delete step.extractors;
        delete step.extract;
        delete step.http_managers;
        delete step.step_listeners;
        if (step.catalog_props && typeof step.catalog_props === 'object') {
            delete step.catalog_props.assertions;
            delete step.catalog_props.processors;
            delete step.catalog_props.pre_processors;
            delete step.catalog_props.extractors;
            delete step.catalog_props.extract;
            delete step.catalog_props.http_managers;
        }
    }

    function isSamplerHost(step) {
        if (!step) return false;
        if (!step.type && (step.method || step.path != null)) return true;
        return step.type === 'catalog_element' && step.alias === 'HTTPSamplerProxy';
    }

    function applyHashTimeline(subTree, step, helpers) {
        if (!subTree || !step || !helpers) return;
        if (!Array.isArray(step.catalog_hash_children)) step.catalog_hash_children = [];
        pairedWalk(subTree, function (node, sub) {
            var gui = node.getAttribute('guiclass') || '';
            var child = hashChildFromNode(node, gui, helpers);
            if (child) step.catalog_hash_children.push(child);
            if (sub && ((node.getAttribute('testclass') || '') === 'GenericController')) {
                pairedWalk(sub, function (nestedNode, nestedSub) {
                    var ng = nestedNode.getAttribute('guiclass') || '';
                    var nestedChild = hashChildFromNode(nestedNode, ng, helpers);
                    if (nestedChild) step.catalog_hash_children.push(nestedChild);
                });
            }
        });
        stripLegacyMountFields(step);
    }

    function mergeUniqueHashChildren(step, extra) {
        if (!step || !extra || !extra.length) return;
        if (!Array.isArray(step.catalog_hash_children)) step.catalog_hash_children = [];
        extra.forEach(function (item) {
            if (!item) return;
            var dup = step.catalog_hash_children.some(function (ex) {
                return ex && ex.alias === item.alias && ex.name === item.name;
            });
            if (!dup) step.catalog_hash_children.push(item);
        });
    }

    function migrateCatalogPropsMountsToHash(step) {
        if (!isSamplerHost(step)) return;
        var props = step.catalog_props || {};
        var extras = [];
        (props.assertions || step.assertions || []).forEach(function (a) {
            var cat = legacyToCatalog(ASSERT_MAP, a, a && a.name);
            if (cat) extras.push(cat);
        });
        (props.processors || step.processors || []).forEach(function (p) {
            var cat = legacyToCatalog(PROC_MAP, p, p && p.name);
            if (cat) extras.push(cat);
        });
        (props.pre_processors || step.pre_processors || []).forEach(function (p) {
            var cat = legacyToCatalog(PRE_MAP, p, p && p.name);
            if (cat) extras.push(cat);
        });
        mergeUniqueHashChildren(step, extras);
        stripLegacyMountFields(step);
    }

    function migrateTree(steps) {
        (steps || []).forEach(function (step) {
            if (!step) return;
            migrateCatalogPropsMountsToHash(step);
            if (Array.isArray(step.children)) migrateTree(step.children);
        });
    }

    function migrateThreadGroup(tg) {
        if (!tg || !Array.isArray(tg.steps)) return;
        migrateTree(tg.steps);
    }

    global.JmsJmxImportSamplerHashTimelineV1 = {
        applyHashTimeline: applyHashTimeline,
        migrateCatalogPropsMountsToHash: migrateCatalogPropsMountsToHash,
        migrateTree: migrateTree,
        migrateThreadGroup: migrateThreadGroup,
        stripLegacyMountFields: stripLegacyMountFields
    };
}(typeof window !== 'undefined' ? window : this));
