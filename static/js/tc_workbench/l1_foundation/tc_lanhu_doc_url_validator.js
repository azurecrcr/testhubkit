/**
 * 蓝湖需求文档 URL 前缀校验（https://lanhuapp.com）
 * 供添加文档、连接文档等流程复用，独立于树组件内部逻辑。
 */
(function (global) {
  "use strict";

  var INVALID_LANHU_DOC_URL_MSG = "文档 URL 须以 https://lanhuapp.com 开头";

  function isValidLanhuDocUrlHttpsPrefix(url) {
    return /^https:\/\/lanhuapp\.com/i.test(String(url || "").trim());
  }

  global.TcLanhuDocUrlValidator = {
    isValid: isValidLanhuDocUrlHttpsPrefix,
    message: INVALID_LANHU_DOC_URL_MSG,
  };
})(typeof window !== "undefined" ? window : this);
