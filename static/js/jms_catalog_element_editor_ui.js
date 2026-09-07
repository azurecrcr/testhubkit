/**
 * JMeter catalog_element · 配置弹窗（保存后才写入步骤树）
 */
(function (global) {
    'use strict';

    var MODAL_ID = 'jms-catalog-element-editor-modal';
    var _pending = null;

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    function vb() { return global.JmsVisualBuilder; }

    function schemaApi() { return global.JmsCatalogElementEditorSchema; }

    function appendApi() { return global.JmsCatalogContextAppend; }

    function bridgeApi() { return global.JmsStudioCatalogBridge; }

    function findStepInList(list, stepId) {
        if (appendApi() && typeof appendApi().findStepInList === 'function') {
            return appendApi().findStepInList(list, stepId);
        }
        if (!list || !stepId) return null;
        var want = String(stepId);
        for (var i = 0; i < list.length; i += 1) {
            var s = list[i];
            if (!s) continue;
            if (String(s.id) === want) return s;
            if (Array.isArray(s.children)) {
                var n = findStepInList(s.children, stepId);
                if (n) return n;
            }
        }
        return null;
    }

    function findPlan(model, planId) {
        if (appendApi() && typeof appendApi().findPlan === 'function') {
            return appendApi().findPlan(model, planId);
        }
        return (model.test_plans || []).filter(function (p) { return p && String(p.id) === String(planId); })[0];
    }

    function findTg(model, planId, tgId) {
        if (appendApi() && typeof appendApi().findTg === 'function') {
            return appendApi().findTg(model, planId, tgId);
        }
        return null;
    }

    function locatePlanCatalogStep(model, stepId) {
        if (!model || !stepId) return { step: null, list: null, index: -1 };
        var list = model.plan_catalog_items || [];
        var want = String(stepId);
        for (var i = 0; i < list.length; i += 1) {
            if (list[i] && String(list[i].id) === want) {
                return { step: list[i], list: list, index: i };
            }
        }
        return { step: null, list: list, index: -1 };
    }

    function locateStep(model, planId, tgId, stepId, mount) {
        mount = mount || {};
        var tg = findTg(model, planId, tgId);
        if (!tg || !stepId) return { tg: tg, step: null, host: null, list: null, index: -1 };
        if (mount.samplerStepId && global.JmsCatalogSamplerChildren) {
            var sampler = global.JmsCatalogSamplerChildren.findSamplerStep(model, planId, tgId, mount.samplerStepId);
            var list = sampler && sampler.catalog_hash_children;
            if (list) {
                for (var i = 0; i < list.length; i += 1) {
                    if (list[i] && String(list[i].id) === String(stepId)) {
                        return { tg: tg, step: list[i], host: sampler, list: list, index: i };
                    }
                }
            }
        }
        var step = findStepInList(tg.steps, stepId);
        return { tg: tg, step: step, host: tg, list: tg.steps, index: -1 };
    }

    function buildDraftStep(comp, catalogState) {
        if (bridgeApi() && typeof bridgeApi().buildCatalogStep === 'function') {
            return bridgeApi().buildCatalogStep(comp, (catalogState && catalogState.templates) || {});
        }
        return {
            id: 'cat_' + Math.random().toString(36).slice(2, 10),
            type: 'catalog_element',
            name: (comp.label_zh || comp.alias) + ' ' + Math.floor(Math.random() * 900 + 100),
            enabled: true,
            alias: comp.alias,
            category: comp.category || 'other',
            label_zh: comp.label_zh || comp.alias,
            container: !!comp.container
        };
    }

    function categoryBadge(step) {
        var cat = (step && step.category) || 'other';
        if (cat === 'listener') return 'LIS';
        if (cat === 'config') return 'CFG';
        return 'CAT';
    }

    function ensureModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (modal) return modal;
        modal = global.document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'jms-modal jms-catalog-editor-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML =
            '<div class="jms-modal__backdrop" data-catalog-editor-close="1"></div>' +
            '<div class="jms-modal__panel jms-pcat-editor-panel" role="dialog" aria-modal="true">' +
            '<header class="jms-modal__head jms-pcat-editor__head">' +
            '<div class="jms-pcat-editor__head-main">' +
            '<span class="jms-pcat-editor__icon" data-catalog-editor-icon aria-hidden="true">P</span>' +
            '<div class="jms-pcat-editor__titles">' +
            '<span class="jms-pcat-editor__badge" data-catalog-editor-badge>PLAN</span>' +
            '<h3 class="jms-modal__title" data-catalog-editor-title>配置元件</h3>' +
            '<p class="jms-pcat-editor__alias" data-catalog-editor-alias></p>' +
            '</div></div>' +
            '<button type="button" class="jms-modal__close jms-pcat-editor__close" data-catalog-editor-close="1" aria-label="关闭">×</button>' +
            '</header>' +
            '<div class="jms-modal__body jms-pcat-editor__body">' +
            '<div class="jms-pcat-editor__sheet">' +
            '<div class="jms-pcat-editor__row jms-pcat-editor__row--meta">' +
            '<div class="jms-field jms-pcat-editor__field jms-pcat-editor__field--name"><label>名称</label><input type="text" data-catalog-editor-name /></div>' +
            '<label class="jms-pcat-editor__chip jms-pcat-editor__chip--enabled"><input type="checkbox" data-catalog-editor-enabled checked /><span>启用</span></label>' +
            '</div>' +
            '<div class="jms-field jms-pcat-editor__field"><label>注释</label><input type="text" data-catalog-editor-comments placeholder="可选说明" /></div>' +
            '<div class="jms-pcat-editor__dynamic" data-catalog-editor-dynamic></div>' +
            '</div></div>' +
            '<footer class="jms-modal__foot jms-pcat-editor__foot">' +
            '<button type="button" class="jms-btn-ghost jms-pcat-editor__btn jms-pcat-editor__btn--ghost" data-catalog-editor-close="1">取消</button>' +
            '<button type="button" class="jms-btn-primary jms-pcat-editor__btn jms-pcat-editor__btn--primary" data-catalog-editor-save="1">保存</button>' +
            '</footer></div>';
        global.document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
            if (ev.target.closest('[data-catalog-editor-close]')) closeModal(true);
            if (ev.target.closest('[data-catalog-editor-save]')) saveModal();
        });
        var dyn = modal.querySelector('[data-catalog-editor-dynamic]');
        if (dyn) {
            dyn.addEventListener('click', function (ev) {
                var addBtn = ev.target.closest('.jms-catalog-kv-add');
                if (addBtn) {
                    var key = addBtn.getAttribute('data-kv-key');
                    var list = dyn.querySelector('.jms-catalog-kv-list[data-key="' + key + '"]');
                    if (list) {
                        var row = global.document.createElement('div');
                        row.className = 'jms-catalog-kv-row';
                        row.innerHTML = '<input type="text" data-kv-key placeholder="Name" />' +
                            '<input type="text" data-kv-val placeholder="Value" />' +
                            '<button type="button" class="jms-btn-ghost jms-catalog-kv-del" title="删除">×</button>';
                        list.appendChild(row);
                    }
                    return;
                }
                var delBtn = ev.target.closest('.jms-catalog-kv-del');
                if (delBtn) {
                    var r = delBtn.closest('.jms-catalog-kv-row');
                    if (r) r.remove();
                }
            });
        }
        return modal;
    }

    function field(modal, sel) {
        return modal.querySelector(sel);
    }

    function defaultProps(step) {
        var S = schemaApi();
        if (S && typeof S.defaultProps === 'function') return S.defaultProps(step);
        return { comments: '' };
    }

    function getSchema(step) {
        var S = schemaApi();
        if (S && typeof S.getSchema === 'function') return S.getSchema(step);
        return { fields: [] };
    }

    function renderDynamicFields(container, step, props) {
        container.innerHTML = '';
        var schema = getSchema(step);
        (schema.fields || []).forEach(function (f) {
            var wrap = global.document.createElement('div');
            wrap.className = 'jms-field';
            wrap.setAttribute('data-field-key', f.key);
            var val = props[f.key];
            if (f.type === 'checkbox') {
                wrap.innerHTML = '<label><input type="checkbox" data-dyn-input="1" data-key="' + esc(f.key) + '" /> ' + esc(f.label) + '</label>';
                var cb = wrap.querySelector('input');
                if (cb) cb.checked = !!val;
            } else if (f.type === 'select') {
                var opts = (f.options || []).map(function (o) {
                    var sel = String(val) === String(o.val) ? ' selected' : '';
                    return '<option value="' + esc(o.val) + '"' + sel + '>' + esc(o.label) + '</option>';
                }).join('');
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><select data-dyn-input="1" data-key="' + esc(f.key) + '">' + opts + '</select>';
            } else if (f.type === 'textarea') {
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><textarea data-dyn-input="1" data-key="' + esc(f.key) + '"></textarea>';
                wrap.querySelector('textarea').value = val != null ? val : '';
            } else if (f.type === 'patterns') {
                var lines = Array.isArray(val) ? val.join('\n') : (val || '');
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><textarea data-dyn-input="1" data-key="' + esc(f.key) + '" data-field-type="patterns"></textarea>';
                wrap.querySelector('textarea').value = lines;
            } else if (f.type === 'kv') {
                var rows = Array.isArray(val) ? val : [];
                var kvHtml = rows.map(function (row, idx) {
                    return '<div class="jms-catalog-kv-row" data-kv-index="' + idx + '">' +
                        '<input type="text" data-kv-key placeholder="Name" value="' + esc(row.name || row.key || '') + '" />' +
                        '<input type="text" data-kv-val placeholder="Value" value="' + esc(row.value || '') + '" />' +
                        '<button type="button" class="jms-btn-ghost jms-catalog-kv-del" title="删除">×</button></div>';
                }).join('');
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><div class="jms-catalog-kv-list" data-key="' + esc(f.key) + '">' +
                    kvHtml + '</div><button type="button" class="jms-btn-ghost jms-catalog-kv-add" data-kv-key="' + esc(f.key) + '">+ 添加</button>';
            } else {
                var minAttr = f.min != null ? ' min="' + f.min + '"' : '';
                wrap.innerHTML = '<label>' + esc(f.label) + '</label><input type="' + (f.type === 'number' ? 'number' : 'text') + '" data-dyn-input="1" data-key="' + esc(f.key) + '"' + minAttr + ' />';
                var inp = wrap.querySelector('input');
                if (inp) inp.value = val != null ? val : (f.default != null ? f.default : '');
            }
            container.appendChild(wrap);
        });
    }

    function readDynamicProps(container, step) {
        var schema = getSchema(step);
        var props = {};
        (schema.fields || []).forEach(function (f) {
            if (f.type === 'kv') {
                var list = container.querySelector('.jms-catalog-kv-list[data-key="' + f.key + '"]');
                var rows = [];
                if (list) {
                    list.querySelectorAll('.jms-catalog-kv-row').forEach(function (row) {
                        var k = row.querySelector('[data-kv-key]');
                        var v = row.querySelector('[data-kv-val]');
                        var name = k && k.value.trim();
                        if (!name) return;
                        rows.push({ name: name, value: v ? v.value : '' });
                    });
                }
                props[f.key] = rows;
                return;
            }
            var el = container.querySelector('[data-dyn-input="1"][data-key="' + f.key + '"]');
            if (!el) return;
            if (f.type === 'checkbox') props[f.key] = !!el.checked;
            else if (f.type === 'number') props[f.key] = Number(el.value) || 0;
            else if (f.type === 'patterns') {
                props[f.key] = String(el.value || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
            } else props[f.key] = el.value;
        });
        return props;
    }

    function applyFormToStep(modal, step) {
        step.name = field(modal, '[data-catalog-editor-name]').value.trim() || step.name;
        step.enabled = field(modal, '[data-catalog-editor-enabled]').checked;
        if (!step.catalog_props) step.catalog_props = defaultProps(step);
        step.catalog_props.comments = field(modal, '[data-catalog-editor-comments]').value.trim();
        var dyn = readDynamicProps(field(modal, '[data-catalog-editor-dynamic]'), step);
        Object.keys(dyn).forEach(function (k) { step.catalog_props[k] = dyn[k]; });
        var S = schemaApi();
        if (S && typeof S.persistEditorProps === 'function') {
            step.catalog_props = S.persistEditorProps(step, step.catalog_props);
        }
        return step;
    }

    function editorProps(step) {
        var S = schemaApi();
        if (S && typeof S.propsForEditor === 'function') return S.propsForEditor(step);
        return step.catalog_props || defaultProps(step);
    }

    function syncPlanSceneFields(visual, step) {
        if (!visual || !step || step.scope !== 'plan_catalog') return;
        var R = global.JmsPlanCatalogResolve;
        if (!R) return;
        var isScene = (typeof R.isHttpDefaultsItem === 'function' && R.isHttpDefaultsItem(step)) ||
            (typeof R.isBackendListenerItem === 'function' && R.isBackendListenerItem(step));
        if (isScene && typeof R.syncSceneFieldsOntoModel === 'function') {
            R.syncSceneFieldsOntoModel(visual.getModel());
        }
    }

    function fillForm(modal, step, isCreate) {
        var props = editorProps(step);
        if (!step.catalog_props) step.catalog_props = props;
        field(modal, '[data-catalog-editor-title]').textContent = (isCreate ? '添加 · ' : '配置 · ') + (step.label_zh || step.alias);
        field(modal, '[data-catalog-editor-alias]').textContent = (step.alias || '') + ' · ' + (step.category || 'other');
        var badge = field(modal, '[data-catalog-editor-badge]');
        if (badge) badge.textContent = categoryBadge(step);
        var icon = field(modal, '[data-catalog-editor-icon]');
        if (icon) icon.textContent = categoryBadge(step).slice(0, 1);
        field(modal, '[data-catalog-editor-name]').value = step.name || '';
        field(modal, '[data-catalog-editor-enabled]').checked = step.enabled !== false;
        field(modal, '[data-catalog-editor-comments]').value = props.comments || '';
        renderDynamicFields(field(modal, '[data-catalog-editor-dynamic]'), step, props);
    }

    function closeModal(fromCancel) {
        var modal = global.document.getElementById(MODAL_ID);
        if (fromCancel && _pending && _pending.mode === 'create') {
            _pending = null;
        }
        if (!modal) return;
        modal.classList.remove('jms-modal-open');
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('data-mode');
        modal.removeAttribute('data-plan-level');
    }

    function commitPendingStep(modal) {
        if (!_pending || _pending.mode !== 'create') return null;
        var visual = vb();
        if (!visual) return null;
        var step = applyFormToStep(modal, Object.assign({}, _pending.draft));
        var ctx = Object.assign({}, _pending.insertCtx || {});
        var created = null;
        var isSamplerChild = ctx.httpMount || ctx.context === 'sampler' || ctx.context === 'sampler_child';

        var isPlanLevel = ctx.context === 'test_plan';

        if (isPlanLevel && global.JmsPlanCatalogAppend &&
            typeof global.JmsPlanCatalogAppend.appendPlanCatalogItem === 'function') {
            var planRes = global.JmsPlanCatalogAppend.appendPlanCatalogItem(visual, step, ctx);
            if (planRes && planRes.ok) {
                created = planRes.step;
            }
        } else if (isSamplerChild && global.JmsCatalogSamplerChildren &&
            typeof global.JmsCatalogSamplerChildren.appendUnderSampler === 'function') {
            created = global.JmsCatalogSamplerChildren.appendUnderSampler(
                visual, ctx.planId, ctx.tgId, ctx.parentStepId, step
            );
            if (created && global.JmsCatalogPostAdd && typeof global.JmsCatalogPostAdd.assignHttpMountKey === 'function') {
                var sampler = global.JmsCatalogSamplerChildren.findSamplerStep(
                    visual.getModel(), ctx.planId, ctx.tgId, ctx.parentStepId
                );
                if (sampler && sampler.catalog_hash_children) {
                    global.JmsCatalogPostAdd.assignHttpMountKey(
                        sampler, sampler.catalog_hash_children.length - 1
                    );
                }
            }
        } else if (ctx.controllerMount && ctx.parentStepId) {
            var TreeAppend = global.JmsCatalogControllerTreeChildAppend;
            if (TreeAppend && typeof TreeAppend.isTreeChild === 'function' && TreeAppend.isTreeChild(step) &&
                typeof TreeAppend.append === 'function') {
                created = TreeAppend.append(visual, step, ctx);
                if (created) {
                    ctx = TreeAppend.normalizeTreeCtx ? TreeAppend.normalizeTreeCtx(ctx) : Object.assign({}, ctx, { context: 'controller' });
                }
            } else if (global.JmsCatalogSamplerChildren &&
                typeof global.JmsCatalogSamplerChildren.appendUnderMountHost === 'function') {
                created = global.JmsCatalogSamplerChildren.appendUnderMountHost(
                    visual, ctx.planId, ctx.tgId, ctx.parentStepId, step
                );
                if (created) {
                    var hostStep = global.JmsCatalogSamplerChildren.findMountHostStep(
                        visual.getModel(), ctx.planId, ctx.tgId, ctx.parentStepId
                    );
                    if (hostStep && global.JmsMountCatalogBridge && typeof global.JmsMountCatalogBridge.hashMountKey === 'function') {
                        var hashIdx = (hostStep.catalog_hash_children || []).length - 1;
                        var mountKey = global.JmsMountCatalogBridge.hashMountKey(created, hashIdx);
                        var Hm = global.JmsIfMountSaveHelper;
                        if (Hm && typeof Hm.notifyMountAdded === 'function') {
                            Hm.notifyMountAdded(hostStep, mountKey);
                        }
                    }
                    ctx.httpMount = true;
                    ctx.context = 'sampler_child';
                }
            }
        } else if (appendApi() && typeof appendApi().appendCatalogAtContext === 'function') {
            var res = appendApi().appendCatalogAtContext(visual, step, ctx);
            if (res && res.ok) {
                created = res.step;
                ctx.planId = res.planId || ctx.planId;
                ctx.tgId = res.tgId || ctx.tgId;
            }
        }

        if (!created) return null;

        syncPlanSceneFields(visual, created);

        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        if (typeof visual.syncYamlFromModel === 'function') visual.syncYamlFromModel();

        if (global.JmsCatalogPostAdd && typeof global.JmsCatalogPostAdd.refreshAfterSave === 'function') {
            global.JmsCatalogPostAdd.refreshAfterSave(visual, ctx.planId, ctx.tgId, created, ctx);
        }

        _pending = null;
        return { step: created, ctx: ctx };
    }

    function saveModal() {
        var modal = global.document.getElementById(MODAL_ID);
        if (!modal) return;

        if (_pending && _pending.mode === 'create') {
            var committed = commitPendingStep(modal);
            closeModal(false);
            if (committed && committed.step && typeof global.hfFloatToast === 'function') {
                global.hfFloatToast('已添加：' + (committed.step.label_zh || committed.step.name || committed.step.alias), { variant: 'success' });
            } else if (!committed && typeof global.hfFloatToast === 'function') {
                global.hfFloatToast('保存失败：无法写入步骤树', { variant: 'error' });
            }
            return;
        }

        var planId = modal.getAttribute('data-plan-id');
        var tgId = modal.getAttribute('data-tg-id');
        var stepId = modal.getAttribute('data-step-id');
        var isPlanLevel = modal.getAttribute('data-plan-level') === '1';
        var samplerStepId = modal.getAttribute('data-sampler-step-id') || '';
        var visual = vb();
        if (!visual || !planId || !stepId) return;
        if (!isPlanLevel && !tgId) return;
        var step;
        if (isPlanLevel) {
            step = locatePlanCatalogStep(visual.getModel(), stepId).step;
        } else {
            step = locateStep(visual.getModel(), planId, tgId, stepId, { samplerStepId: samplerStepId }).step;
        }
        if (!step) { closeModal(false); return; }
        applyFormToStep(modal, step);
        syncPlanSceneFields(visual, step);
        if (typeof visual.notifyUserEdit === 'function') visual.notifyUserEdit();
        if (typeof visual.syncYamlFromModel === 'function') visual.syncYamlFromModel();
        if (global.JmsCatalogPostAdd && typeof global.JmsCatalogPostAdd.refreshAfterSave === 'function') {
            global.JmsCatalogPostAdd.refreshAfterSave(visual, planId, tgId, step, isPlanLevel ? {
                context: 'test_plan'
            } : {
                httpMount: !!samplerStepId,
                parentStepId: samplerStepId || null,
                context: samplerStepId ? 'sampler_child' : 'thread_group'
            });
        } else if (typeof visual.triggerRender === 'function') {
            visual.triggerRender();
        }
        closeModal(false);
        if (typeof global.hfFloatToast === 'function') {
            global.hfFloatToast('已保存：' + (step.label_zh || step.name || step.alias), { variant: 'success' });
        }
    }

    function openModalForStep(step, planId, tgId, insertCtx, isCreate) {
        var modal = ensureModal();
        modal.setAttribute('data-plan-id', planId || '');
        modal.setAttribute('data-tg-id', tgId || '');
        modal.setAttribute('data-step-id', step.id || '');
        if (insertCtx && insertCtx.context === 'test_plan') {
            modal.setAttribute('data-plan-level', '1');
        } else {
            modal.removeAttribute('data-plan-level');
        }
        modal.setAttribute('data-mode', isCreate ? 'create' : 'edit');
        var samplerId = (insertCtx && (insertCtx.httpMount || insertCtx.context === 'sampler_child' || insertCtx.context === 'sampler'))
            ? insertCtx.parentStepId : '';
        if (samplerId) modal.setAttribute('data-sampler-step-id', samplerId);
        else modal.removeAttribute('data-sampler-step-id');
        fillForm(modal, step, isCreate);
        modal.classList.add('jms-modal-open');
        modal.setAttribute('aria-hidden', 'false');
        var nameInput = field(modal, '[data-catalog-editor-name]');
        if (nameInput) {
            global.setTimeout(function () {
                try { nameInput.focus({ preventScroll: true }); nameInput.select(); } catch (e) { nameInput.focus(); }
            }, 60);
        }
    }

    function openForCreate(comp, insertCtx, catalogState) {
        if (!comp) return;
        insertCtx = insertCtx || {};
        var draft = buildDraftStep(comp, catalogState || {});
        insertCtx = insertCtx || {};
        if (insertCtx.context === 'test_plan') {
            draft.scope = 'plan_catalog';
            if (draft.alias === 'Arguments' && !draft.catalog_props) {
                draft.catalog_props = { comments: '', arguments: [] };
            }
            if (draft.alias === 'HeaderManager' && !draft.catalog_props) {
                draft.catalog_props = { comments: '', headers: [] };
            }
            if (draft.alias === 'ConfigTestElement' && (comp.configType === 'http_defaults' || comp.guiclass === 'HttpDefaultsGui')) {
                draft.guiclass = 'HttpDefaultsGui';
                draft.testclass = 'ConfigTestElement';
                draft.category = 'config';
                draft.name = 'HTTP 请求默认值';
                draft.label_zh = 'HTTP 请求默认值';
                if (!draft.catalog_props) draft.catalog_props = defaultProps(draft);
            }
            if (draft.alias === 'BackendListener') {
                draft.category = 'listener';
                draft.guiclass = 'BackendListenerGui';
                draft.testclass = 'BackendListener';
                if (!draft.label_zh || draft.label_zh === draft.alias) {
                    draft.label_zh = 'InfluxDB Backend Listener';
                }
                if (!draft.catalog_props) draft.catalog_props = defaultProps(draft);
            }
        }
        _pending = {
            mode: 'create',
            comp: comp,
            insertCtx: insertCtx,
            catalogState: catalogState || {},
            draft: draft
        };
        openModalForStep(draft, insertCtx.planId, insertCtx.tgId, insertCtx, true);
    }

    function openForStep(planId, tgId, step, insertCtx) {
        if (!step) return;
        var HN = global.JmsJmxImportHeaderPropsNormalizeV1;
        if (HN && typeof HN.normalizeCatalogElementStep === 'function') {
            HN.normalizeCatalogElementStep(step);
        }
        var JA = global.JmsJmxImportJsonAssertPropsNormalizeV1;
        if (JA && typeof JA.normalizeCatalogElementStep === 'function') {
            JA.normalizeCatalogElementStep(step);
        }
        _pending = null;
        openModalForStep(step, planId, tgId, insertCtx, false);
    }

    function bindTreeClicks() {
        var root = global.document.getElementById('jms-visual-root');
        if (!root || root.dataset.jmsCatalogEditorBound === '1') return;
        root.dataset.jmsCatalogEditorBound = '1';
        root.addEventListener('click', function (ev) {
            var delBtn = ev.target.closest('.jms-btn-del-catalog, .jms-tree-del');
            if (delBtn && global.JmsCatalogElementDeleteUi && typeof global.JmsCatalogElementDeleteUi.onDeleteClick === 'function') {
                if (global.JmsCatalogElementDeleteUi.onDeleteClick(ev)) return;
            }

            var editBtn = ev.target.closest('.jms-btn-edit-catalog');
            if (editBtn) {
                ev.preventDefault();
                ev.stopPropagation();
                if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                var card = editBtn.closest('.jms-catalog-card');
                if (!card) return;
                var visual = vb();
                if (!visual) return;
                var isPlanLevel = card.getAttribute('data-plan-level') === '1';
                var loc;
                if (isPlanLevel) {
                    loc = { step: locatePlanCatalogStep(visual.getModel(), card.getAttribute('data-step-id')).step };
                } else {
                    loc = locateStep(visual.getModel(), card.getAttribute('data-plan-id'), card.getAttribute('data-tg-id'), card.getAttribute('data-step-id'), {});
                }
                if (loc.step) {
                    openForStep(
                        card.getAttribute('data-plan-id'),
                        card.getAttribute('data-tg-id') || '',
                        loc.step,
                        isPlanLevel ? { context: 'test_plan' } : null
                    );
                }
                return;
            }

            var mountEdit = ev.target.closest('.jms-http-ctx-edit-catalog-mount');
            if (mountEdit) {
                ev.preventDefault();
                ev.stopPropagation();
                openCatalogMountEdit(mountEdit);
                return;
            }

            var mountCard = ev.target.closest('.jms-aux-card--http-mount-catalog');
            if (mountCard && ev.target.closest('.jms-http-ctx-edit-catalog-mount')) {
                ev.preventDefault();
                ev.stopPropagation();
                openCatalogMountFromCard(mountCard);
            }
        }, true);
    }

    function openCatalogMountEdit(btn) {
        var visual = vb();
        if (!visual || !btn) return;
        var planId = btn.getAttribute('data-plan-id');
        var tgId = btn.getAttribute('data-tg-id');
        var samplerId = btn.getAttribute('data-step-id');
        var idx = parseInt(btn.getAttribute('data-catalog-index'), 10);
        var sampler = global.JmsCatalogSamplerChildren &&
            global.JmsCatalogSamplerChildren.findSamplerStep(visual.getModel(), planId, tgId, samplerId);
        var item = sampler && sampler.catalog_hash_children && sampler.catalog_hash_children[idx];
        if (item) {
            openForStep(planId, tgId, item, { httpMount: true, parentStepId: samplerId, context: 'sampler_child' });
        }
    }

    function openCatalogMountFromCard(card) {
        var visual = vb();
        if (!visual || !card) return;
        var planId = card.getAttribute('data-plan-id');
        var tgId = card.getAttribute('data-tg-id');
        var samplerId = card.getAttribute('data-step-id');
        var mountNode = card.closest('.jms-tree-node--http-mount-catalog');
        var mountKey = mountNode && mountNode.getAttribute('data-http-mount-key');
        var idx = mountKey && mountKey.indexOf('cat:') === 0 ? parseInt(mountKey.slice(4), 10) : NaN;
        if (isNaN(idx)) {
            var editBtn = card.querySelector('.jms-http-ctx-edit-catalog-mount');
            if (editBtn) { openCatalogMountEdit(editBtn); return; }
            return;
        }
        var sampler = global.JmsCatalogSamplerChildren &&
            global.JmsCatalogSamplerChildren.findSamplerStep(visual.getModel(), planId, tgId, samplerId);
        var item = sampler && sampler.catalog_hash_children && sampler.catalog_hash_children[idx];
        if (item) {
            openForStep(planId, tgId, item, { httpMount: true, parentStepId: samplerId, context: 'sampler_child' });
        }
    }

    global.JmsCatalogElementEditorUi = {
        openForCreate: openForCreate,
        openForStep: openForStep,
        locateStep: locateStep,
        ensureModal: ensureModal,
        hasPendingCreate: function () { return !!(_pending && _pending.mode === 'create'); }
    };

    if (global.document.readyState === 'loading') {
        global.document.addEventListener('DOMContentLoaded', bindTreeClicks);
    } else {
        bindTreeClicks();
    }
    global.addEventListener('pageshow', bindTreeClicks);
})(window);
