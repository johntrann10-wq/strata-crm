(function () {
  "use strict";

  var STYLE_ID = "strata-ios-integrations-cleanup-style";
  var HIDDEN_ATTR = "data-strata-ios-hidden-infra";
  var RISKY_TEXT = [
    "INTEGRATION_VAULT_SECRET",
    "CRON_SECRET",
    "Vault",
    "Cron secret"
  ];

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "[" + HIDDEN_ATTR + "='true']{display:none!important;}";
    document.head.appendChild(style);
  }

  function isSettingsPage() {
    return /\/settings(?:$|[?#/])/.test(window.location.pathname);
  }

  function textMatches(text) {
    return RISKY_TEXT.some(function (needle) {
      return text.includes(needle);
    });
  }

  function findHideTarget(node) {
    var current = node;
    for (var depth = 0; current && depth < 6; depth += 1) {
      if (!(current instanceof HTMLElement)) break;
      var className = current.getAttribute("class") || "";
      if (/rounded|border|card|grid|space-y/.test(className) && current.textContent.length < 900) {
        return current;
      }
      current = current.parentElement;
    }
    return node instanceof HTMLElement ? node : null;
  }

  function cleanup() {
    if (!isSettingsPage()) return;
    injectStyles();

    Array.from(document.querySelectorAll("p,span,div,section")).forEach(function (node) {
      if (!(node instanceof HTMLElement)) return;
      var text = node.textContent || "";
      if (!textMatches(text)) return;
      var target = findHideTarget(node);
      if (target) target.setAttribute(HIDDEN_ATTR, "true");
    });
  }

  function boot() {
    cleanup();
    var lastPath = window.location.pathname + window.location.search;
    new MutationObserver(function () {
      var nextPath = window.location.pathname + window.location.search;
      if (nextPath !== lastPath) lastPath = nextPath;
      cleanup();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
