/**
 * 线程组顶层组件 · 追加到时间线末尾（隔离模块，供各添加入口复用）
 */
(function (global) {
    'use strict';

    function assignOrder(tg, ref) {
        var Logic = global.JmsTgLogicCtrlAppendOrder;
        if (Logic && typeof Logic.isLogicContainerStep === 'function' &&
            typeof Logic.assignLogicControllerTimelineOrder === 'function' &&
            Logic.isLogicContainerStep(ref) &&
            Logic.assignLogicControllerTimelineOrder(tg, ref)) {
            return;
        }
        var TL = global.JmsTgDetailTimeline;
        if (TL && typeof TL.assignAppendTimelineOrder === 'function') {
            TL.assignAppendTimelineOrder(tg, ref);
        }
    }

    global.JmsTgTopLevelAppend = {
        assignOrder: assignOrder
    };
}(typeof window !== 'undefined' ? window : this));
