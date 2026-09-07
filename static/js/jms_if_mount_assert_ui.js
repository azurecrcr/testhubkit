/**
 * If 控制器挂载区 · 断言 · 弹窗创建（保存后再写入 assertions）
 */
(function (global) {
    'use strict';

    var TYPE_MAP = {
        response: 'response_assert',
        json: 'json_assert',
        size: 'size_assert',
        md5hex: 'md5hex_assert',
        response_assert: 'response_assert',
        json_assert: 'json_assert',
        size_assert: 'size_assert',
        md5hex_assert: 'md5hex_assert'
    };

    var UI_MAP = {
        response_assert: 'JmsTgResponseAssertionUi',
        json_assert: 'JmsTgJsonAssertionUi',
        size_assert: 'JmsTgSizeAssertionUi',
        md5hex_assert: 'JmsTgMd5hexAssertionUi'
    };

    function openCreate(planId, tgId, ifStepId, type) {
        var full = TYPE_MAP[type] || type;
        var uiName = UI_MAP[full];
        var ui = uiName ? global[uiName] : null;
        if (ui && typeof ui.openCreateForIfMount === 'function') {
            ui.openCreateForIfMount(planId, tgId, ifStepId);
        }
    }

    global.JmsIfMountAssertUi = {
        openCreate: openCreate
    };
}(typeof window !== 'undefined' ? window : this));
