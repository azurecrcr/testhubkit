/**
 * Catalog 步骤语义 · 统一判断/属性读取（yamlToCatalogStep 仅解析 catalog_element；legacy 由 unify_migrate 处理）
 */
(function (global) {
    'use strict';

    var CTRL_ALIASES = {
        IfController: 1,
        RandomController: 1,
        GenericController: 1,
        TransactionController: 1,
        LoopController: 1
    };

    function isCatalog(step) {
        return !!(step && step.type === 'catalog_element');
    }

    function alias(step) {
        return isCatalog(step) ? String(step.alias || '') : '';
    }

    function prop(step, key, fallback) {
        if (!isCatalog(step) || !step.catalog_props) return fallback;
        var v = step.catalog_props[key];
        return v === undefined || v === null ? fallback : v;
    }

    function isController(step) {
        return isCatalog(step) && !!step.container && step.category === 'controller';
    }

    function isAlias(step, name) {
        return alias(step) === name;
    }

    function isIfController(step) { return isAlias(step, 'IfController'); }
    function isRandomController(step) { return isAlias(step, 'RandomController'); }
    function isSimpleController(step) { return isAlias(step, 'GenericController'); }
    function isTransactionController(step) { return isAlias(step, 'TransactionController'); }
    function isLoopController(step) { return isAlias(step, 'LoopController'); }
    function isLogicContainer(step) {
        return isController(step) && !!CTRL_ALIASES[alias(step)];
    }

    function isHttpSampler(step) {
        return isCatalog(step) && (step.category === 'sampler' || alias(step) === 'HTTPSamplerProxy');
    }

    function isBeanShellPost(step) { return isAlias(step, 'BeanShellPostProcessor'); }
    function isDebugSampler(step) { return isAlias(step, 'DebugSampler'); }
    function isJsonPost(step) { return isAlias(step, 'JSONPostProcessor'); }
    function isRegexExtract(step) { return isAlias(step, 'RegexExtractor'); }
    function isXPathExtract(step) { return isAlias(step, 'XPathExtractor'); }
    function isJsr223Post(step) { return isAlias(step, 'JSR223PostProcessor'); }
    function isJdbcPost(step) { return isAlias(step, 'JDBCPostProcessor'); }

    function isAuxProcessor(step) {
        return isBeanShellPost(step) || isJsonPost(step) || isRegexExtract(step) ||
            isXPathExtract(step) || isJsr223Post(step) || isJdbcPost(step);
    }

    function displayLabel(step) {
        if (!step) return '';
        if (isIfController(step)) return 'If「' + (step.name || '控制器') + '」';
        if (isRandomController(step)) return '随机控制器「' + (step.name || '控制器') + '」';
        if (isSimpleController(step)) return '简单控制器「' + (step.name || '控制器') + '」';
        if (isTransactionController(step)) return '事务控制器「' + (step.name || '控制器') + '」';
        if (isLoopController(step)) return '循环控制器「' + (step.name || '控制器') + '」';
        if (isBeanShellPost(step)) return 'BeanShell「' + (step.name || '处理器') + '」';
        if (isDebugSampler(step)) return 'Debug「' + (step.name || '采样器') + '」';
        if (isJsonPost(step)) return 'JSON提取「' + (step.name || '处理器') + '」';
        if (isRegexExtract(step)) return '正则提取「' + (step.name || '处理器') + '」';
        if (isXPathExtract(step)) return 'XPath提取「' + (step.name || '处理器') + '」';
        if (isJsr223Post(step)) return 'JSR223「' + (step.name || '处理器') + '」';
        if (isJdbcPost(step)) return 'JDBC「' + (step.name || '处理器') + '」';
        return step.name || step.label_zh || step.alias || '';
    }

    function yamlToCatalogStep(st, uidFn, recurse) {
        if (!st) return null;
        if (st.type === 'catalog_element') {
            var cat = {
                id: uidFn(),
                type: 'catalog_element',
                name: st.name || st.label_zh || st.alias || 'Catalog',
                enabled: st.enabled !== false,
                alias: st.alias || '',
                testclass: st.testclass || st.alias || '',
                guiclass: st.guiclass || '',
                jmeter_class: st.jmeter_class || '',
                category: st.category || 'other',
                label_zh: st.label_zh || st.alias || '',
                container: !!st.container,
                scope: st.scope || 'core',
                jmx_fragment: st.jmx_fragment || ''
            };
            if (st.catalog_props && typeof st.catalog_props === 'object') cat.catalog_props = st.catalog_props;
            if (st.container) cat.children = recurse(st.children || []);
            if (Array.isArray(st.catalog_hash_children) && st.catalog_hash_children.length) {
                cat.catalog_hash_children = recurse(st.catalog_hash_children);
            }
            if (st.import_order != null) cat.import_order = st.import_order;
            return cat;
        }
        return null;
    }

    global.JmsCatalogStepCompat = {
        isCatalog: isCatalog,
        alias: alias,
        prop: prop,
        isController: isController,
        isIfController: isIfController,
        isRandomController: isRandomController,
        isSimpleController: isSimpleController,
        isTransactionController: isTransactionController,
        isLoopController: isLoopController,
        isLogicContainer: isLogicContainer,
        isHttpSampler: isHttpSampler,
        isBeanShellPost: isBeanShellPost,
        isDebugSampler: isDebugSampler,
        isJsonPost: isJsonPost,
        isRegexExtract: isRegexExtract,
        isXPathExtract: isXPathExtract,
        isJsr223Post: isJsr223Post,
        isJdbcPost: isJdbcPost,
        isAuxProcessor: isAuxProcessor,
        displayLabel: displayLabel,
        yamlToCatalogStep: yamlToCatalogStep
    };
})(typeof window !== 'undefined' ? window : this);
