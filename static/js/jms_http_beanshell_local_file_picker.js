/**
 * HTTP 步骤 BeanShell · 本地选脚本文件（不经过服务端上传）
 */
(function (global) {
    'use strict';

    var SCRIPT_ACCEPT = '.bsh,.txt,.java,.groovy,.js,.bean,.beanshell,text/plain';

    function isFakePath(pathStr) {
        return /fakepath/i.test(String(pathStr || ''));
    }

    function isRealAbsolutePath(pathStr) {
        if (!pathStr) return false;
        var p = String(pathStr).trim();
        if (!p || isFakePath(p)) return false;
        if (p.charAt(0) === '/') return true;
        if (/^[A-Za-z]:[\\/]/.test(p)) return true;
        if (p.indexOf('\\\\') >= 0) return true;
        return false;
    }

    function resolveNativeFilePath(file) {
        if (!file) return '';
        if (file.path && String(file.path).trim()) {
            return String(file.path).trim();
        }
        return '';
    }

    function resolveInputSyncPath(inputEl) {
        if (!inputEl || !inputEl.value) return '';
        return String(inputEl.value).trim();
    }

    function resolveLocalAbsolutePath(file, inputEl) {
        var nativePath = resolveNativeFilePath(file);
        if (isRealAbsolutePath(nativePath)) return nativePath;
        var syncPath = resolveInputSyncPath(inputEl);
        if (isRealAbsolutePath(syncPath)) return syncPath;
        return '';
    }

    function supportsFileSystemAccess() {
        try {
            return !!(global.window && typeof global.window.showOpenFilePicker === 'function');
        } catch (e) {
            return false;
        }
    }

    function pickViaFileSystemAccess() {
        return global.window.showOpenFilePicker({
            types: [{
                description: 'BeanShell 脚本',
                accept: {
                    'text/plain': ['.bsh', '.txt', '.java', '.groovy', '.js', '.bean', '.beanshell'],
                    'application/javascript': ['.js']
                }
            }],
            multiple: false
        }).then(function (handles) {
            if (!handles || !handles.length) return null;
            return handles[0].getFile().then(function (file) {
                return {
                    file: file,
                    absolutePath: resolveLocalAbsolutePath(file, null)
                };
            });
        });
    }

    function pickViaFileInput(inputEl) {
        return new Promise(function (resolve, reject) {
            if (!inputEl) {
                reject(new Error('文件选择器未就绪'));
                return;
            }
            function onChange() {
                inputEl.removeEventListener('change', onChange);
                var file = inputEl.files && inputEl.files[0];
                if (!file) {
                    resolve(null);
                    return;
                }
                resolve({
                    file: file,
                    absolutePath: resolveLocalAbsolutePath(file, inputEl)
                });
            }
            inputEl.addEventListener('change', onChange);
            inputEl.value = '';
            inputEl.click();
        });
    }

    function pickHttpBeanshellLocalScript(fallbackInput) {
        if (supportsFileSystemAccess()) {
            return pickViaFileSystemAccess().catch(function (err) {
                if (err && err.name === 'AbortError') return null;
                return pickViaFileInput(fallbackInput);
            });
        }
        return pickViaFileInput(fallbackInput);
    }

    global.JmsHttpBeanshellLocalFilePicker = {
        SCRIPT_ACCEPT: SCRIPT_ACCEPT,
        isRealAbsolutePath: isRealAbsolutePath,
        resolveLocalAbsolutePath: resolveLocalAbsolutePath,
        supportsFileSystemAccess: supportsFileSystemAccess,
        pickHttpBeanshellLocalScript: pickHttpBeanshellLocalScript
    };
}(typeof window !== 'undefined' ? window : this));
