/**
 * JMeter 场景高级特性：SetupThreadGroup / IfController / BeanShell / Raw JMX
 * 与现有 genJmx 链路隔离，仅在检测到高级字段时启用扩展导出。
 */
(function (global) {
    'use strict';

    function compat() { return global.JmsCatalogStepCompat; }
    function isIfController(st) { var C = compat(); return C ? C.isIfController(st) : false; }

    function isRandomController(st) { var C = compat(); return C ? C.isRandomController(st) : false; }

    function isSimpleController(st) { var C = compat(); return C ? C.isSimpleController(st) : false; }

    function isTransactionController(st) { var C = compat(); return C ? C.isTransactionController(st) : false; }

    function isLoopController(st) { var C = compat(); return C ? C.isLoopController(st) : false; }

    function isLogicContainer(st) { var C = compat(); return C ? C.isLogicContainer(st) : false; }

    function isHttpStep(st) {
        var C = compat();
        if (C && C.isHttpSampler(st)) return true;
        return st && !isLogicContainer(st) && !!st.method;
    }

    function countStepsRecursive(steps) {
        var n = 0;
        (steps || []).forEach(function (st) {
            if (!st) return;
            if (isLogicContainer(st)) n += countStepsRecursive(st.children);
            else if (isHttpStep(st)) n += 1;
        });
        return n;
    }

    function flattenHttpSteps(steps, out) {
        out = out || [];
        (steps || []).forEach(function (st) {
            if (!st) return;
            if (isLogicContainer(st)) flattenHttpSteps(st.children, out);
            else if (isHttpStep(st)) out.push(st);
        });
        return out;
    }

    function hasAdvancedFeatures(data) {
        if (!data || typeof data !== 'object') return false;
        if (data.execution_mode === 'raw_jmx' && data.raw_jmx && data.raw_jmx.enabled) return true;
        if (Array.isArray(data.setup_thread_groups) && data.setup_thread_groups.length) return true;
        if (Array.isArray(data.post_thread_groups) && data.post_thread_groups.length) return true;
        function walk(steps) {
            for (var i = 0; i < (steps || []).length; i++) {
                var st = steps[i];
                if (!st) continue;
                if (isLogicContainer(st)) {
                    if (walk(st.children)) return true;
                    continue;
                }
                if (st.processors && st.processors.length) return true;
                if (st.extractors && st.extractors.length > 1) return true;
                if (st.assertions && st.assertions.some(function (a) { return a.type === 'json'; })) return true;
                if (st.type === 'beanshell_post' || st.type === 'debug_sampler' || st.type === 'json_post' || st.type === 'regex_extract' || st.type === 'xpath_extract' || st.type === 'jsr223_post' || st.type === 'jdbc_post') return true;
            }
            return false;
        }
        var groups = (data.setup_thread_groups || []).concat(data.thread_groups || []).concat(data.post_thread_groups || []);
        for (var g = 0; g < groups.length; g++) {
            if (groups[g].processors && groups[g].processors.length) return true;
            if (walk(groups[g].steps)) return true;
        }
        return false;
    }

    function shouldUseRawJmx(data) {
        return !!(data && data.execution_mode === 'raw_jmx' && data.raw_jmx && data.raw_jmx.enabled && data.raw_jmx.xml);
    }

    function normalizeStepTree(steps, label) {
        label = label || 'steps';
        if (!Array.isArray(steps) || !steps.length) throw new Error(label + ' 必须是非空数组');
        return steps.map(function (step, i) {
            if (!step || typeof step !== 'object') throw new Error(label + '[' + i + '] 必须是对象');
            if (step.type !== 'catalog_element') {
                var M = global.JmsCatalogUnifyMigrate;
                if (M && typeof M.stepToCatalog === 'function') step = M.stepToCatalog(step) || step;
            }
            if (step.container) {
                step.children = normalizeStepTree(step.children || [], label + '[' + i + '].children');
            }
            return step;
        });
    }

    function normalizeSetupThreadGroups(list, rootLoadFallback, data) {
        if (!Array.isArray(list)) return [];
        return list.map(function (tg, i) {
            if (typeof global.normalizeThreadGroup === 'function') {
                var row = global.normalizeThreadGroup(tg, 'setup_thread_groups[' + i + ']', rootLoadFallback, data);
                if (tg.processors) row.processors = tg.processors;
                if (tg.kind) row.kind = tg.kind;
                if (tg.config_timeline_active === true) row.config_timeline_active = true;
                if (Array.isArray(tg.config_items)) row.config_items = tg.config_items;
                if (Array.isArray(tg.removed_config_types)) row.removed_config_types = tg.removed_config_types.slice();
                row.steps = normalizeStepTree(row.steps, 'setup_thread_groups[' + i + '].steps');
                return row;
            }
            return tg;
        });
    }

    function normalizePostThreadGroups(list, rootLoadFallback, data) {
        if (!Array.isArray(list)) return [];
        return list.map(function (tg, i) {
            if (typeof global.normalizeThreadGroup === 'function') {
                var row = global.normalizeThreadGroup(tg, 'post_thread_groups[' + i + ']', rootLoadFallback, data);
                if (tg.processors) row.processors = tg.processors;
                if (tg.kind) row.kind = tg.kind;
                if (tg.config_timeline_active === true) row.config_timeline_active = true;
                if (Array.isArray(tg.config_items)) row.config_items = tg.config_items;
                if (Array.isArray(tg.removed_config_types)) row.removed_config_types = tg.removed_config_types.slice();
                row.steps = normalizeStepTree(row.steps, 'post_thread_groups[' + i + '].steps');
                return row;
            }
            return tg;
        });
    }

    function genBeanShellXml(proc, indent, escapeXml) {
        if (global.JmsTgBeanshellPostJmx && typeof global.JmsTgBeanshellPostJmx.genXml === 'function') {
            return global.JmsTgBeanshellPostJmx.genXml(proc, indent, escapeXml);
        }
        if (!proc || proc.type !== 'beanshell_post') return '';
        var en = proc.enabled === false ? 'false' : 'true';
        var xml = indent + '<BeanShellPostProcessor guiclass="TestBeanGUI" testclass="BeanShellPostProcessor" testname="' +
            escapeXml(proc.name || 'BeanShell PostProcessor') + '" enabled="' + en + '">\n';
        xml += indent + '  <stringProp name="filename"></stringProp>\n';
        xml += indent + '  <stringProp name="parameters"></stringProp>\n';
        xml += indent + '  <boolProp name="resetInterpreter">false</boolProp>\n';
        xml += indent + '  <stringProp name="script">' + escapeXml(proc.script || '') + '</stringProp>\n';
        xml += indent + '</BeanShellPostProcessor>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function genProcessorsXml(list, indent, escapeXml) {
        var xml = '';
        var arr = Array.isArray(list) ? list : [];
        arr.forEach(function (proc) {
            xml += genBeanShellXml(proc, indent, escapeXml);
        });
        return xml;
    }


    function genDebugSamplerXml(item, indent, escapeXml) {
        if (!item || item.type !== 'debug_sampler') return '';
        var en = item.enabled === false ? 'false' : 'true';
        var xml = indent + '<DebugSampler guiclass="TestBeanGUI" testclass="DebugSampler" testname="' +
            escapeXml(item.name || 'Debug Sampler') + '" enabled="' + en + '">\n';
        xml += indent + '  <boolProp name="displayJMeterProperties">' + (item.display_jmeter_properties ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="displayJMeterVariables">' + (item.display_jmeter_variables !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="displaySystemProperties">' + (item.display_system_properties ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += indent + '</DebugSampler>\n';
        xml += indent + '<hashTree/>\n';
        return xml;
    }

    function isTreeStep(st) {
        return !!(st && st.type === 'catalog_element');
    }

    function stepsNeedTreeXml(steps) {
        for (var i = 0; i < (steps || []).length; i++) {
            var s = steps[i];
            if (!s) continue;
            if (isTreeStep(s)) return true;
            if (s.container && stepsNeedTreeXml(s.children)) return true;
        }
        return false;
    }



    function genRandomControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = indent + '<RandomController guiclass="RandomControlGui" testclass="RandomController" testname="' +
            escapeXml(item.name || '随机控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="RandomController.ignoreSubControllerBlocks">' + (item.ignore_sub_controller_blocks ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</RandomController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }


    function genSimpleControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = indent + '<GenericController guiclass="LogicControllerGui" testclass="GenericController" testname="' +
            escapeXml(item.name || '简单控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += indent + '</GenericController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }


    function genTransactionControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = indent + '<TransactionController guiclass="TransactionControllerGui" testclass="TransactionController" testname="' +
            escapeXml(item.name || '事务控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="TransactionController.parent">' + (item.generate_parent_sample ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="TransactionController.includeTimers">' + (item.include_timer_duration ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += indent + '</TransactionController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }



    function genLoopControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var forever = !!item.loop_forever;
        var loopsVal = forever ? '-1' : String(Number(item.loops) > 0 ? Number(item.loops) : 1);
        var xml = indent + '<LoopController guiclass="LoopControlPanel" testclass="LoopController" testname="' +
            escapeXml(item.name || '循环控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="LoopController.continue_forever">' + (forever ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) {
            xml += indent + '  <stringProp name="TestPlan.comments">' + escapeXml(item.comments) + '</stringProp>\n';
        }
        xml += indent + '  <intProp name="LoopController.loops">' + loopsVal + '</intProp>\n';
        xml += indent + '</LoopController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }

    function genIfControllerXml(item, indent, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = indent + '<IfController guiclass="IfControllerPanel" testclass="IfController" testname="' +
            escapeXml(item.name || 'If 控制器') + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <stringProp name="IfController.condition">' + escapeXml(item.condition || '') + '</stringProp>\n';
        xml += indent + '  <boolProp name="IfController.evaluateAll">' + (item.evaluate_all ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="IfController.useExpression">' + (item.use_expression !== false ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '</IfController>\n';
        xml += indent + '<hashTree>\n';
        xml += genStepsTreeXml(item.children || [], indent + '  ', helpers);
        xml += indent + '</hashTree>\n';
        return xml;
    }

    function genSamplerChildrenAdvanced(st, childPad, helpers) {
        var escapeXml = helpers.escapeXml;
        var xml = '';

        (st.extractors || []).forEach(function (ex) {
            if (!ex || !ex.var || !ex.json_path) return;
            xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
                escapeXml(ex.var) + '" enabled="true">\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(ex.var) + '</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(ex.json_path) + '</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
            xml += childPad + '</JSONPostProcessor>\n';
            xml += childPad + '<hashTree/>\n';
        });

        if (st.extract && st.extract.var && st.extract.json_path && !(st.extractors && st.extractors.length)) {
            xml += childPad + '<JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="提取 ' +
                escapeXml(st.extract.var) + '" enabled="true">\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.referenceNames">' + escapeXml(st.extract.var) + '</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.jsonPathExprs">' + escapeXml(st.extract.json_path) + '</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.match_numbers">0</stringProp>\n';
            xml += childPad + '  <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>\n';
            xml += childPad + '</JSONPostProcessor>\n';
            xml += childPad + '<hashTree/>\n';
        }

        (st.processors || []).forEach(function (proc) {
            xml += genBeanShellXml(proc, childPad, escapeXml);
        });

        /* JSON/扩展断言统一由 genSingleHttpStepXml → genAssertionXml 导出，此处不再重复写入 */

        return xml;
    }

    function genStepsTreeXml(steps, indent, helpers) {
        helpers = helpers || {};
        if (global.JmsJmxExportCatalogGuard && typeof global.JmsJmxExportCatalogGuard.prepareSteps === 'function') {
            steps = global.JmsJmxExportCatalogGuard.prepareSteps(steps || []);
        }
        var xml = '';
        var usedStepNames = {};
        (steps || []).forEach(function (st, stepIdx) {
            if (!st) return;
            if (st.type === 'catalog_element' && global.JmxCatalogElement && typeof global.JmxCatalogElement.genXml === 'function') {
                xml += global.JmxCatalogElement.genXml(st, indent, helpers);
                return;
            }
            if (typeof helpers.genSingleStepXml === 'function' && st && st.method) {
                xml += helpers.genSingleStepXml(st, stepIdx, indent, usedStepNames);
            }
        });
        return xml;
    }

    function genLoadPropsXml(load, indent) {
        var loops = load.loops;
        var loopForever = loops < 0 ? 'true' : 'false';
        var loopsVal = loops < 0 ? '-1' : String(loops);
        var xml = '';
        xml += indent + '<intProp name="ThreadGroup.num_threads">' + (Number(load.users) || 1) + '</intProp>\n';
        xml += indent + '<intProp name="ThreadGroup.ramp_time">' + (Number(load.spawn_rate) || 1) + '</intProp>\n';
        xml += indent + '<longProp name="ThreadGroup.duration">' + (Number(load.duration_sec) || 60) + '</longProp>\n';
        xml += indent + '<longProp name="ThreadGroup.delay">0</longProp>\n';
        xml += indent + '<boolProp name="ThreadGroup.same_user_on_next_iteration">false</boolProp>\n';
        xml += indent + '<boolProp name="ThreadGroup.scheduler">true</boolProp>\n';
        xml += indent + '<stringProp name="ThreadGroup.on_sample_error">continue</stringProp>\n';
        xml += indent + '<elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="循环控制器">\n';
        xml += indent + '  <intProp name="LoopController.loops">' + loopsVal + '</intProp>\n';
        xml += indent + '  <boolProp name="LoopController.continue_forever">' + loopForever + '</boolProp>\n';
        xml += indent + '</elementProp>\n';
        return xml;
    }

    function genThreadGroupLikeXml(plan, bu, defaultHeaders, listenerData, tgLabel, opts) {
        opts = opts || {};
        var isSetup = !!opts.isSetup;
        var isPost = !!opts.isPost;
        var helpers = opts.helpers || {};
        var escapeXml = helpers.escapeXml || function (s) { return String(s == null ? '' : s); };
        var tgName = escapeXml(tgLabel || plan.name || 'Thread Group');
        var tag = isSetup ? 'SetupThreadGroup' : (isPost ? 'PostThreadGroup' : 'ThreadGroup');
        var gui = isSetup ? 'SetupThreadGroupGui' : (isPost ? 'PostThreadGroupGui' : 'ThreadGroupGui');
        var xml = '      <' + tag + ' guiclass="' + gui + '" testclass="' + tag + '" testname="' + tgName + '" enabled="true">\n';
        xml += genLoadPropsXml(plan.load, '        ');
        xml += '      </' + tag + '>\n      <hashTree>\n';

        if (helpers.genThreadGroupLocalVariablesXml) {
            xml += helpers.genThreadGroupLocalVariablesXml(plan.variables, '        ', '线程组变量 ' + (plan.name || ''));
        } else if (helpers.genUserDefinedVariablesXml && helpers.hasJmxVariableEntries && helpers.hasJmxVariableEntries(plan.variables)) {
            xml += helpers.genUserDefinedVariablesXml(plan.variables, '        ', '线程组变量 ' + (plan.name || ''));
        }

        xml += genProcessorsXml(plan.processors, '        ', escapeXml);

        if (helpers.genStepsTreeXml) {
            xml += helpers.genStepsTreeXml(plan.steps, '        ', helpers);
        } else if (helpers.genStepsXml) {
            xml += helpers.genStepsXml(plan.steps, '        ');
        }

        if (helpers.backendListenerXml) {
            var exportTgBackendAdv = (global.JmsTgBackendListenerJmx && typeof global.JmsTgBackendListenerJmx.shouldExport === 'function')
                ? global.JmsTgBackendListenerJmx.shouldExport(plan.listeners, listenerData)
                : (listenerData.influxdb && listenerData.influxdb.enabled !== false);
            if (exportTgBackendAdv) xml += helpers.backendListenerXml(listenerData, '        ');
        }
        xml += '      </hashTree>\n';
        return xml;
    }

    function formatImportReport(summary) {
        if (!summary) return '';
        var lines = [];
        lines.push('计划「' + (summary.planName || '') + '」');
        if (summary.setupThreadGroups) lines.push('前置线程组：' + summary.setupThreadGroups + ' 个');
        lines.push('线程组：' + (summary.threadGroups || 0) + ' 个');
        if (summary.postThreadGroups) lines.push('后置线程组：' + summary.postThreadGroups + ' 个');
        lines.push('HTTP 步骤：' + (summary.steps || 0) + ' 个');
        lines.push('公共变量：' + (summary.variables || 0) + ' 个');
        if (summary.ifControllers) lines.push('IfController：' + summary.ifControllers + ' 个');
        if (summary.beanshellProcessors) lines.push('BeanShell：' + summary.beanshellProcessors + ' 个');
        if (summary.jsonAssertions) lines.push('JSON 断言：' + summary.jsonAssertions + ' 个');
        if (summary.extractors) lines.push('JSON 提取：' + summary.extractors + ' 个');
        if (summary.placeholders) lines.push('⚠ 占位请求：' + summary.placeholders + ' 个');
        if (summary.csvAttachments && summary.csvAttachments.length) {
            lines.push('⚠ CSV 附件待上传：' + summary.csvAttachments.length + ' 个');
        }
        (summary.warnings || []).forEach(function (w) { lines.push('⚠ ' + w); });
        return lines.join('\n');
    }

    function collectCsvFilesForZipFromScenario(data) {
        var files = {};
        var groups = (data.setup_thread_groups || []).concat(data.thread_groups || []).concat(data.post_thread_groups || []);
        groups.forEach(function (tg) {
            var csv = tg.http_managers && tg.http_managers.csv_data_set;
            if (!csv || !csv.enabled) return;
            if (csv.file_content) {
                var name = (csv.filename || '').trim() || 'data/data.csv';
                files[name] = csv.file_content;
            }
        });
        if (data._csv_uploads && typeof data._csv_uploads === 'object') {
            Object.keys(data._csv_uploads).forEach(function (k) {
                files[k] = data._csv_uploads[k];
            });
        }
        return files;
    }

    global.JmxScenarioAdvanced = {
        isIfController: isIfController,
        isHttpStep: isHttpStep,
        countStepsRecursive: countStepsRecursive,
        flattenHttpSteps: flattenHttpSteps,
        hasAdvancedFeatures: hasAdvancedFeatures,
        shouldUseRawJmx: shouldUseRawJmx,
        normalizeStepTree: normalizeStepTree,
        normalizeSetupThreadGroups: normalizeSetupThreadGroups,
        normalizePostThreadGroups: normalizePostThreadGroups,
        genBeanShellXml: genBeanShellXml,
        genProcessorsXml: genProcessorsXml,
        genIfControllerXml: genIfControllerXml,
        genDebugSamplerXml: genDebugSamplerXml,
        stepsNeedTreeXml: stepsNeedTreeXml,
        genSamplerChildrenAdvanced: genSamplerChildrenAdvanced,
        genStepsTreeXml: genStepsTreeXml,
        genThreadGroupLikeXml: genThreadGroupLikeXml,
        formatImportReport: formatImportReport,
        collectCsvFilesForZipFromScenario: collectCsvFilesForZipFromScenario
    };
})(typeof window !== 'undefined' ? window : this);
