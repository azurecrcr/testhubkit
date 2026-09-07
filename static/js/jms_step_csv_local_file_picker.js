/**
 * HTTP 步骤 CSV 数据文件设置 · 本地选文件（不经过服务端上传）
 * 优先 File System Access API 选文件并一次性读取内容；尽力解析本机绝对路径。
 */
(function (global) {
    'use strict';

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
        if (file && file.webkitRelativePath) {
            var relPath = String(file.webkitRelativePath).trim();
            if (relPath && isRealAbsolutePath(relPath)) return relPath;
        }
        return '';
    }

    function readFileTextOnce(file) {
        if (!file) return Promise.resolve('');
        if (typeof file.text === 'function') {
            return file.text();
        }
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                resolve(String(reader.result || ''));
            };
            reader.onerror = function () {
                reject(new Error('文件读取失败'));
            };
            reader.readAsText(file, 'UTF-8');
        });
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
                description: 'CSV 数据文件',
                accept: {
                    'text/csv': ['.csv'],
                    'text/plain': ['.txt', '.csv']
                }
            }],
            multiple: false
        }).then(function (handles) {
            if (!handles || !handles.length) return null;
            return handles[0].getFile().then(function (file) {
                return readFileTextOnce(file).then(function (content) {
                    return {
                        file: file,
                        content: content,
                        absolutePath: resolveLocalAbsolutePath(file, null)
                    };
                });
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
                var absPath = resolveLocalAbsolutePath(file, inputEl);
                readFileTextOnce(file).then(function (content) {
                    resolve({
                        file: file,
                        content: content,
                        absolutePath: absPath
                    });
                }).catch(reject);
            }
            inputEl.addEventListener('change', onChange);
            inputEl.value = '';
            inputEl.click();
        });
    }

    function pickStepCsvLocalFile(fallbackInput) {
        if (supportsFileSystemAccess()) {
            return pickViaFileSystemAccess().catch(function (err) {
                if (err && err.name === 'AbortError') return null;
                return pickViaFileInput(fallbackInput);
            });
        }
        return pickViaFileInput(fallbackInput);
    }

    global.JmsStepCsvLocalFilePicker = {
        isRealAbsolutePath: isRealAbsolutePath,
        resolveLocalAbsolutePath: resolveLocalAbsolutePath,
        readFileTextOnce: readFileTextOnce,
        supportsFileSystemAccess: supportsFileSystemAccess,
        pickStepCsvLocalFile: pickStepCsvLocalFile
    };
}(typeof window !== 'undefined' ? window : this));
