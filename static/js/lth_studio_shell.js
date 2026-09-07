(function () {
    'use strict';
    if (!document.body || !document.body.classList.contains('lth-studio-v2')) return;

    function clickById(id) {
        var el = document.getElementById(id);
        if (el) el.click();
    }

    document.querySelectorAll('[data-lth-trigger]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            clickById(btn.getAttribute('data-lth-trigger'));
        });
    });

    var moreTrigger = document.getElementById('lth-more-trigger');
    var morePanel = document.getElementById('lth-more-panel');
    if (moreTrigger && morePanel) {
        moreTrigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var open = !morePanel.classList.contains('hidden');
            morePanel.classList.toggle('hidden', open);
            moreTrigger.setAttribute('aria-expanded', open ? 'false' : 'true');
        });
        document.addEventListener('click', function () {
            morePanel.classList.add('hidden');
            moreTrigger.setAttribute('aria-expanded', 'false');
        });
        morePanel.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    document.querySelectorAll('[data-lth-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var mode = btn.getAttribute('data-lth-mode');
            var modeBtn = document.querySelector('.jms-editor-mode-btn[data-mode="' + mode + '"]');
            if (modeBtn) modeBtn.click();
            if (morePanel) morePanel.classList.add('hidden');
        });
    });

    var navModes = document.getElementById('lth-nav-modes');
    var editorModes = document.querySelector('.jms-editor-modes');
    if (navModes && editorModes && !navModes.querySelector('.jms-editor-mode-btn')) {
        navModes.appendChild(editorModes);
    }


    function getStepMenuClipBottom(actions) {
        var margin = 8;
        var clipBottom = window.innerHeight - margin;
        var tg = actions.closest('.jms-tg-block');
        if (tg) clipBottom = Math.min(clipBottom, tg.getBoundingClientRect().bottom - margin);
        var plan = actions.closest('.jms-plan-card');
        if (plan) clipBottom = Math.min(clipBottom, plan.getBoundingClientRect().bottom - margin);
        var ws = actions.closest('.lth-studio-workspace');
        if (ws) clipBottom = Math.min(clipBottom, ws.getBoundingClientRect().bottom - margin);
        return clipBottom;
    }

    function measureStepMenuDropup(actions) {
        var menu = actions.querySelector('.lth-step-menu');
        if (!menu) return;
        menu.classList.remove('lth-step-menu--dropup');
        actions.classList.add('is-measuring');
        var menuRect = menu.getBoundingClientRect();
        if (menuRect.height && menuRect.bottom > getStepMenuClipBottom(actions)) {
            menu.classList.add('lth-step-menu--dropup');
        }
        actions.classList.remove('is-measuring');
    }

    function openStepMenuHover(actions) {
        if (!actions || actions.classList.contains('is-open')) return;
        measureStepMenuDropup(actions);
        actions.classList.add('is-hover');
    }

    function closeStepMenuHover(actions) {
        if (!actions || actions.classList.contains('is-open')) return;
        actions.classList.remove('is-hover', 'is-measuring');
        resetStepMenuPlacement(actions);
    }

    function resetStepMenuPlacement(actions) {
        if (!actions) return;
        actions.classList.remove('is-measuring');
        var menu = actions.querySelector('.lth-step-menu');
        if (menu) menu.classList.remove('lth-step-menu--dropup');
    }
    var visualRoot = document.getElementById('jms-visual-root');
    if (visualRoot) {
        visualRoot.addEventListener('click', function (ev) {
            var menuBtn = ev.target.closest('.lth-step-menu-btn');
            if (menuBtn) {
                ev.stopPropagation();
                var actions = menuBtn.closest('.lth-step-actions');
                if (!actions) return;
                document.querySelectorAll('.lth-step-actions.is-open, .lth-step-actions.is-hover').forEach(function (a) {
                    if (a !== actions) {
                        a.classList.remove('is-open', 'is-hover', 'is-measuring');
                        resetStepMenuPlacement(a);
                    }
                });
                var opening = !actions.classList.contains('is-open');
                actions.classList.remove('is-hover', 'is-measuring');
                actions.classList.toggle('is-open');
                if (opening) {
                    measureStepMenuDropup(actions);
                } else {
                    resetStepMenuPlacement(actions);
                }
                return;
            }
            var addMoreBtn = ev.target.closest('.lth-tg-add-more-btn');
            if (addMoreBtn) {
                ev.stopPropagation();
                var wrap = addMoreBtn.closest('.lth-tg-add-more');
                if (!wrap) return;
                document.querySelectorAll('.lth-tg-add-more.is-open').forEach(function (w) {
                    if (w !== wrap) w.classList.remove('is-open');
                });
                wrap.classList.toggle('is-open');
                return;
            }
            var isTreeStudioV2 = document.body.classList.contains('lth-studio-v2') &&
                document.body.classList.contains('lth-tg-view-tree') &&
                document.body.classList.contains('lth-hub-jmeter-tab');
            var auxCard = ev.target.closest('.jms-aux-card');
            if (auxCard) {
                if (ev.target.closest('.lth-step-actions, button, a, input, select, textarea')) return;
                if (isTreeStudioV2) {
                    var kindTree = auxCard.getAttribute('data-step-kind') || '';
                    if (kindTree === 'debug_sampler') {
                        auxCard.classList.toggle('jms-aux-card--collapsed');
                    }
                    return;
                }
                var kind = auxCard.getAttribute('data-step-kind') || '';
                var editAuxBtn = auxCard.querySelector(
                    kind === 'debug_sampler' ? '.jms-btn-edit-debug' :
                        (kind === 'json_post' ? '.jms-btn-edit-tg-json-extract' :
                            (kind === 'regex_extract' ? '.jms-btn-edit-tg-regex-extract' :
                                (kind === 'xpath_extract' ? '.jms-btn-edit-tg-xpath-extract' :
                                    (kind === 'jsr223_post' ? '.jms-btn-edit-tg-jsr223-post' :
                                        (kind === 'jdbc_post' ? '.jms-btn-edit-tg-jdbc-post' : '.jms-btn-edit-beanshell')))))
                );
                if (editAuxBtn) editAuxBtn.click();
                return;
            }
            var card = ev.target.closest('.jms-http-card, .jms-if-card, .jms-random-card, .jms-simple-card, .jms-transaction-card, .jms-loop-card');
            if (!card) return;
            if (ev.target.closest('.lth-step-actions, .jms-http-card__actions, button, a, input, select, textarea')) return;
            if (isTreeStudioV2 && card.classList.contains('jms-http-card')) {
                return;
            }
            if (document.body.classList.contains('lth-tg-view-tree') &&
                document.body.classList.contains('lth-hub-jmeter-tab') &&
                (card.classList.contains('jms-if-card') || card.classList.contains('jms-random-card') ||
                    card.classList.contains('jms-simple-card') || card.classList.contains('jms-transaction-card') ||
                    card.classList.contains('jms-loop-card'))) {
                return;
            }
            if (card.classList.contains('jms-if-card')) {
                var editIfBtn = card.querySelector('.jms-btn-edit-if');
                if (editIfBtn) editIfBtn.click();
                return;
            }
            if (card.classList.contains('jms-random-card')) {
                var editRandomBtn = card.querySelector('.jms-btn-edit-random');
                if (editRandomBtn) editRandomBtn.click();
                return;
            }
            if (card.classList.contains('jms-simple-card')) {
                var editSimpleBtn = card.querySelector('.jms-btn-edit-simple');
                if (editSimpleBtn) editSimpleBtn.click();
                return;
            }
            if (card.classList.contains('jms-transaction-card')) {
                var editTxnBtn = card.querySelector('.jms-btn-edit-transaction');
                if (editTxnBtn) editTxnBtn.click();
                return;
            }
            if (card.classList.contains('jms-loop-card')) {
                var editLoopBtn = card.querySelector('.jms-btn-edit-loop');
                if (editLoopBtn) editLoopBtn.click();
                return;
            }
            var editBtn = card.querySelector('.jms-btn-edit-step');
            if (editBtn) editBtn.click();
        });

/* step menu: click-only (no hover) */
        /* hover open disabled — menu opens on ⋮ click only */
    }

/* step menu: defer close on menu panel click */
    document.addEventListener('click', function (ev) {
        if (ev.target.closest('.lth-step-menu')) return;
        document.querySelectorAll('.lth-step-actions.is-open, .lth-step-actions.is-hover, .lth-tg-add-more.is-open').forEach(function (el) {
            el.classList.remove('is-open', 'is-hover', 'is-measuring');
            resetStepMenuPlacement(el);
        });
    });

    var progressSteps = document.querySelectorAll('.lth-studio-step');
    function setProgress(idx) {
        progressSteps.forEach(function (el, i) {
            el.classList.toggle('lth-studio-step--active', i === idx);
            el.classList.toggle('lth-studio-step--done', i < idx);
        });
    }

    var btnValidate = document.getElementById('btn-validate');
    var btnGenerate = document.getElementById('btn-generate-result');
    if (btnValidate) btnValidate.addEventListener('click', function () { setTimeout(function () { setProgress(1); }, 50); });
    if (btnGenerate) btnGenerate.addEventListener('click', function () { setTimeout(function () { setProgress(2); }, 200); });

    var drawerIds = ['modal-tg-load', 'modal-tg-http-mgr', 'modal-step-edit', 'modal-if-edit', 'modal-beanshell-edit', 'modal-debug-edit', 'modal-http-jdbc-post-proc-edit', 'modal-tg-jdbc-post-edit', 'modal-tg-if-edit', 'modal-if-mount-timer-edit', 'modal-http-if-edit', 'modal-http-step-user-params-edit'];
    function syncGnavOffset() {
        var gnav = document.querySelector('.hf-gnav');
        var h = gnav ? Math.ceil(gnav.getBoundingClientRect().height) : 62;
        document.documentElement.style.setProperty('--lth-gnav-h', h + 'px');
    }
    syncGnavOffset();
    window.addEventListener('resize', syncGnavOffset);
    drawerIds.forEach(function (id) {
        var modal = document.getElementById(id);
        if (modal && modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
    });
/* jmeter tab: center popup only, no drawer */
    function syncDrawerBodyClass() {
        if (document.body.classList.contains('lth-hub-jmeter-tab')) {
            document.body.classList.remove('lth-drawer-open');
            return;
        }
        var any = drawerIds.some(function (id) {
            var m = document.getElementById(id);
            return m && m.classList.contains('jms-modal-open');
        });
        document.body.classList.toggle('lth-drawer-open', any);
    }
    drawerIds.forEach(function (id) {
        var modal = document.getElementById(id);
        if (!modal) return;
        new MutationObserver(syncDrawerBodyClass).observe(modal, { attributes: true, attributeFilter: ['class'] });
    });

    function syncEditorLayoutClass() {
        var yamlWrap = document.getElementById('jms-yaml-wrap');
        var isYaml = yamlWrap && !yamlWrap.classList.contains('hidden');
        document.body.classList.toggle('lth-editor-yaml', !!isYaml);
        document.body.classList.toggle('lth-editor-visual', !isYaml);
    }
    syncEditorLayoutClass();
    document.querySelectorAll('.jms-editor-mode-btn').forEach(function (btn) {
        btn.addEventListener('click', function () { setTimeout(syncEditorLayoutClass, 0); });
    });
    document.querySelectorAll('[data-lth-mode]').forEach(function (btn) {
        var orig = btn.onclick;
        btn.addEventListener('click', function () { setTimeout(syncEditorLayoutClass, 0); });
    });
    var yamlWrapEl = document.getElementById('jms-yaml-wrap');
    if (yamlWrapEl) {
        new MutationObserver(syncEditorLayoutClass).observe(yamlWrapEl, { attributes: true, attributeFilter: ['class'] });
    }


    var navCollapseBtn = document.getElementById('lth-nav-collapse-btn');
    var navEl = document.getElementById('lth-studio-nav');
    var navStorageKey = 'lth-studio-nav-collapsed';
    function setNavCollapsed(collapsed) {
        document.body.classList.toggle('lth-nav-collapsed', !!collapsed);
        if (navCollapseBtn) {
            navCollapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            navCollapseBtn.title = collapsed ? '展开场景配置' : '收起场景配置';
            var sr = navCollapseBtn.querySelector('.sr-only');
            if (sr) sr.textContent = collapsed ? '展开场景配置' : '收起场景配置';
        }
        try { sessionStorage.setItem(navStorageKey, collapsed ? '1' : '0'); } catch (e) {}
    }
    if (navCollapseBtn) {
        navCollapseBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            setNavCollapsed(!document.body.classList.contains('lth-nav-collapsed'));
        });
    }
    if (navEl) {
        navEl.addEventListener('click', function (e) {
            if (!document.body.classList.contains('lth-nav-collapsed')) return;
            if (e.target.closest('#lth-nav-collapse-btn, .lth-nav-collapse-btn')) return;
            setNavCollapsed(false);
        });
    }
    try {
        if (sessionStorage.getItem(navStorageKey) === '1') setNavCollapsed(true);
    } catch (e) {}


    function initTplCombobox() {
        var wrap = document.getElementById('tpl-select-wrap');
        var select = document.getElementById('tpl-select');
        if (!wrap || !select || wrap.dataset.lthCombobox === '1') return;
        wrap.dataset.lthCombobox = '1';
        select.classList.add('lth-tpl-select-native');
        select.tabIndex = -1;

        var combo = document.createElement('div');
        combo.className = 'lth-tpl-combobox';

        var trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'lth-tpl-combobox__trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '场景模板');

        var valueEl = document.createElement('span');
        valueEl.className = 'lth-tpl-combobox__value';
        var chevron = document.createElement('span');
        chevron.className = 'lth-tpl-combobox__chevron';
        chevron.setAttribute('aria-hidden', 'true');
        trigger.appendChild(valueEl);
        trigger.appendChild(chevron);

        var menu = document.createElement('ul');
        menu.className = 'lth-tpl-combobox__menu hidden';
        menu.setAttribute('role', 'listbox');

        function buildOptions() {
            menu.innerHTML = '';
            Array.from(select.options).forEach(function (opt) {
                var li = document.createElement('li');
                li.className = 'lth-tpl-combobox__option';
                li.setAttribute('role', 'option');
                li.dataset.value = opt.value;
                li.textContent = opt.textContent;
                menu.appendChild(li);
            });
        }

        function syncUi() {
            var sel = select.options[select.selectedIndex];
            valueEl.textContent = sel ? sel.textContent : '';
            menu.querySelectorAll('.lth-tpl-combobox__option').forEach(function (el) {
                var on = el.dataset.value === select.value;
                el.classList.toggle('is-selected', on);
                el.setAttribute('aria-selected', on ? 'true' : 'false');
            });
        }

        function closeMenu() {
            menu.classList.add('hidden');
            combo.classList.remove('is-open');
            trigger.setAttribute('aria-expanded', 'false');
        }

        function openMenu() {
            menu.classList.remove('hidden');
            combo.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
        }

        buildOptions();
        syncUi();

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            if (menu.classList.contains('hidden')) openMenu();
            else closeMenu();
        });

        menu.addEventListener('click', function (e) {
            var opt = e.target.closest('.lth-tpl-combobox__option');
            if (!opt) return;
            if (select.value !== opt.dataset.value) {
                select.value = opt.dataset.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            syncUi();
            closeMenu();
        });

        select.addEventListener('change', syncUi);

        document.addEventListener('click', function () { closeMenu(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeMenu();
        });

        combo.appendChild(trigger);
        combo.appendChild(menu);
        var slot = wrap.querySelector('.lth-tpl-select-slot');
        var row = wrap.querySelector('.lth-tpl-controls-row');
        if (slot) slot.appendChild(combo);
        else if (row) row.appendChild(combo);
        else wrap.appendChild(combo);
    }
    initTplCombobox();

})();