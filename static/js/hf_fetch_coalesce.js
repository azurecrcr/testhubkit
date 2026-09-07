/**
 * 合并同 URL 的并发 GET，并对热点只读接口做短 TTL 缓存，
 * 降低用例工作台首屏重复打 /api/auth/me、AI 配置、RAG status 等。
 */
(function (global) {
  "use strict";

  if (global.__hfFetchCoalesceInstalled) return;
  global.__hfFetchCoalesceInstalled = true;

  var TTL_MS = {
    "/api/auth/me": 8000,
    "/api/user-ai-config": 4000,
    "/api/builtin-ai/config": 8000,
    "/api/rag/status": 15000,
    "/api/test-cases/attachments/status": 3000,
    "/api/toolkit-lock": 4000,
    "/api/test-cases/system-prompts": 30000,
    "/api/test-case-templates": 30000,
  };

  var inflight = Object.create(null);
  var cache = Object.create(null);
  var origFetch = global.fetch.bind(global);

  function normalizePath(url) {
    try {
      var u = typeof url === "string" ? new URL(url, global.location.origin) : new URL(url.url, global.location.origin);
      if (u.origin !== global.location.origin) return null;
      return u.pathname + u.search;
    } catch (e) {
      return null;
    }
  }

  function basePath(fullPath) {
    if (!fullPath) return null;
    var q = fullPath.indexOf("?");
    return q >= 0 ? fullPath.slice(0, q) : fullPath;
  }

  function ttlFor(fullPath) {
    var p = basePath(fullPath);
    if (!p) return 0;
    if (Object.prototype.hasOwnProperty.call(TTL_MS, p)) return TTL_MS[p];
    if (p.indexOf("/api/test-cases/workbench-sessions") === 0) return 1500;
    return 0;
  }

  function isGet(init, input) {
    var method = (init && init.method) || (input && typeof input !== "string" && input.method) || "GET";
    return String(method).toUpperCase() === "GET";
  }

  function cloneResponse(res) {
    try {
      return res.clone();
    } catch (e) {
      return res;
    }
  }

  function invalidateMatching(pathPrefix) {
    Object.keys(cache).forEach(function (k) {
      if (k === pathPrefix || k.indexOf(pathPrefix) === 0) delete cache[k];
    });
    Object.keys(inflight).forEach(function (k) {
      if (k === pathPrefix || k.indexOf(pathPrefix) === 0) delete inflight[k];
    });
  }

  global.HfFetchCoalesce = {
    invalidate: invalidateMatching,
    clearAll: function () {
      cache = Object.create(null);
      inflight = Object.create(null);
    },
  };

  global.fetch = function (input, init) {
    if (!isGet(init, input)) {
      var mutatingPath = normalizePath(input);
      if (mutatingPath) {
        var bp = basePath(mutatingPath);
        if (bp === "/api/auth/me" || bp === "/api/auth/logout" || bp === "/api/auth/login/password" ||
            bp.indexOf("/api/auth/") === 0) {
          invalidateMatching("/api/auth/me");
          invalidateMatching("/api/user-ai-config");
        } else if (bp === "/api/user-ai-config" || bp === "/api/builtin-ai/config") {
          invalidateMatching(bp);
        } else if (bp.indexOf("/api/test-cases/attachments") === 0) {
          invalidateMatching("/api/test-cases/attachments/status");
        } else if (bp.indexOf("/api/rag/") === 0) {
          invalidateMatching("/api/rag/status");
        }
      }
      return origFetch(input, init);
    }

    var fullPath = normalizePath(input);
    var ttl = ttlFor(fullPath);
    if (!fullPath || !ttl) {
      return origFetch(input, init);
    }

    var now = Date.now();
    var hit = cache[fullPath];
    if (hit && hit.expires > now && hit.response) {
      return Promise.resolve(cloneResponse(hit.response));
    }

    if (inflight[fullPath]) {
      return inflight[fullPath].then(function (res) {
        return cloneResponse(res);
      });
    }

    inflight[fullPath] = origFetch(input, init).then(function (res) {
      try {
        cache[fullPath] = {
          expires: Date.now() + ttl,
          response: cloneResponse(res),
        };
      } catch (e) { /* ignore */ }
      delete inflight[fullPath];
      return res;
    }, function (err) {
      delete inflight[fullPath];
      throw err;
    });

    return inflight[fullPath].then(function (res) {
      return cloneResponse(res);
    });
  };
})(typeof window !== "undefined" ? window : this);
