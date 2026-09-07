/**
 * catalog 逻辑控制器 · catalog_props 完整 JMX 写出（隔离模块）
 */
(function (global) {
    'use strict';

    function esc(s, helpers) {
        if (helpers && typeof helpers.escapeXml === 'function') return helpers.escapeXml(s);
        if (global.JmxCatalogElement && typeof global.JmxCatalogElement.escapeXml === 'function') {
            return global.JmxCatalogElement.escapeXml(s);
        }
        return String(s == null ? '' : s);
    }

    function legacy(step) {
        var P = global.JmsCatalogJmxPrepare;
        return P && typeof P.legacyItemFromCatalog === 'function' ? P.legacyItemFromCatalog(step) : (step.catalog_props || {});
    }

    function genHashTree(step, indent, helpers) {
        var xml = indent + '<hashTree>\n';
        var pad = indent + '  ';
        var M = global.JmsCatalogMountJmx;
        if (M && typeof M.genMountItemsXml === 'function' && step.catalog_hash_children && step.catalog_hash_children.length) {
            xml += M.genMountItemsXml(step.catalog_hash_children, pad, helpers);
        }
        var A = global.JmxScenarioAdvanced;
        if (A && typeof A.genStepsTreeXml === 'function') {
            xml += A.genStepsTreeXml(step.children || [], pad, helpers || {});
        }
        xml += indent + '</hashTree>\n';
        return xml;
    }

    function genIf(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var xml = indent + '<IfController guiclass="IfControllerPanel" testclass="IfController" testname="' +
            e(item.name || 'If 控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <stringProp name="IfController.condition">' + e(item.condition || '', helpers) + '</stringProp>\n';
        xml += indent + '  <boolProp name="IfController.evaluateAll">' + (item.evaluate_all ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="IfController.useExpression">' + (item.use_expression !== false ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</IfController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genLoop(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var forever = !!item.loop_forever;
        var loopsVal = forever ? '-1' : String(Number(item.loops) > 0 ? Number(item.loops) : 1);
        var xml = indent + '<LoopController guiclass="LoopControlPanel" testclass="LoopController" testname="' +
            e(item.name || '循环控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="LoopController.continue_forever">' + (forever ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '  <intProp name="LoopController.loops">' + loopsVal + '</intProp>\n';
        xml += indent + '</LoopController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genTxn(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var xml = indent + '<TransactionController guiclass="TransactionControllerGui" testclass="TransactionController" testname="' +
            e(item.name || '事务控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="TransactionController.parent">' + (item.generate_parent_sample ? 'true' : 'false') + '</boolProp>\n';
        xml += indent + '  <boolProp name="TransactionController.includeTimers">' + (item.include_timer_duration ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</TransactionController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genRandom(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var xml = indent + '<RandomController guiclass="RandomControlGui" testclass="RandomController" testname="' +
            e(item.name || '随机控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <boolProp name="RandomController.ignoreSubControllerBlocks">' + (item.ignore_sub_controller_blocks ? 'true' : 'false') + '</boolProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</RandomController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genSimple(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var xml = indent + '<GenericController guiclass="LogicControllerGui" testclass="GenericController" testname="' +
            e(item.name || '简单控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</GenericController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    function genInclude(step, indent, helpers) {
        var item = legacy(step);
        var e = esc;
        var path = item.includepath || item.include_path || '';
        var xml = indent + '<IncludeController guiclass="IncludeControllerGui" testclass="IncludeController" testname="' +
            e(item.name || 'Include 控制器', helpers) + '" enabled="' + (item.enabled === false ? 'false' : 'true') + '">\n';
        xml += indent + '  <stringProp name="IncludeController.includepath">' + e(path, helpers) + '</stringProp>\n';
        if (item.comments) xml += indent + '  <stringProp name="TestPlan.comments">' + e(item.comments, helpers) + '</stringProp>\n';
        xml += indent + '</IncludeController>\n';
        xml += genHashTree(step, indent, helpers);
        return xml;
    }

    var MAP = {
        IfController: genIf,
        LoopController: genLoop,
        TransactionController: genTxn,
        RandomController: genRandom,
        GenericController: genSimple,
        IncludeController: genInclude
    };

    function genXml(step, indent, helpers) {
        if (!step || step.type !== 'catalog_element' || !step.container) return '';
        var fn = MAP[step.alias];
        if (!fn) return '';
        return fn(step, indent, helpers);
    }

    global.JmsCatalogControllerJmx = {
        genXml: genXml,
        MAP: MAP
    };
})(typeof window !== 'undefined' ? window : this);
