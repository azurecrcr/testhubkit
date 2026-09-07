/**
 * 线程组顶层逻辑控制器 · 追加到步骤区底部（隔离模块）
 */
(function (global) {
    'use strict';

    var LOGIC_TYPES = [
        'if_controller', 'random_controller', 'simple_controller',
        'transaction_controller', 'loop_controller'
    ];

    function isLogicContainerStep(st) {
        return !!(st && st.type && LOGIC_TYPES.indexOf(st.type) >= 0);
    }

    function readOrder(ref) {
        if (!ref) return null;
        if (ref.timeline_order != null) return ref.timeline_order;
        if (ref.import_order != null) return ref.import_order;
        return null;
    }

    function maxStepAreaOrder(tg, skipRef) {
        var max = -1;
        (tg.steps || []).forEach(function (st) {
            if (!st || st === skipRef) return;
            var o = readOrder(st);
            if (o != null && o > max) max = o;
        });
        return max;
    }

    function persistOrder(ref, order) {
        if (!ref || order == null) return;
        ref.timeline_order = order;
        ref.import_order = order;
    }

    /** 逻辑控制器写入步骤区时间线末尾（不影响 HTTP/后置等其它 append） */
    function assignLogicControllerTimelineOrder(tg, ref) {
        if (!tg || !ref || !isLogicContainerStep(ref)) return false;
        var TL = global.JmsTgDetailTimeline;
        if (TL && typeof TL.ensureAllTopLevelHaveTimelineOrder === 'function') {
            TL.ensureAllTopLevelHaveTimelineOrder(tg, ref);
        }
        var maxAmongSteps = maxStepAreaOrder(tg, ref);
        if (maxAmongSteps >= 0) {
            persistOrder(ref, maxAmongSteps + 1);
            return true;
        }
        if (TL && typeof TL.assignAppendTimelineOrder === 'function') {
            TL.assignAppendTimelineOrder(tg, ref);
            return true;
        }
        persistOrder(ref, 0);
        return true;
    }

    global.JmsTgLogicCtrlAppendOrder = {
        isLogicContainerStep: isLogicContainerStep,
        assignLogicControllerTimelineOrder: assignLogicControllerTimelineOrder
    };
}(typeof window !== 'undefined' ? window : this));
