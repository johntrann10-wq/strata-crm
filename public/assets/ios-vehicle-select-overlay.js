(function () {
  "use strict";

  var SHEET_ID = "strata-ios-vehicle-picker";
  var STYLE_ID = "strata-ios-vehicle-picker-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".strata-ios-select-hidden{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;}",
      ".strata-ios-select-button{display:flex;width:100%;min-height:44px;align-items:center;justify-content:space-between;gap:12px;border:1px solid #d8dee8;border-radius:12px;background:#fff;padding:10px 12px;text-align:left;font:inherit;color:#111827;box-shadow:0 1px 0 rgba(15,23,42,.03);}",
      ".strata-ios-select-button:disabled{opacity:.55;}",
      ".strata-ios-select-button__text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".strata-ios-select-button__chevron{color:#64748b;font-size:16px;line-height:1;}",
      ".strata-ios-picker-shell{width:100%;margin-top:8px;}",
      ".strata-ios-picker-sheet{position:relative;z-index:5;width:100%;overflow:hidden;border:1px solid #d8dee8;border-radius:16px;background:#fff;box-shadow:0 10px 26px rgba(15,23,42,.12);padding:8px;}",
      ".strata-ios-picker-head{display:none;}",
      ".strata-ios-picker-search{width:100%;min-height:40px;border:1px solid #d8dee8;border-radius:12px;background:#f8fafc;padding:8px 10px;font:inherit;font-size:15px;color:#111827;outline:none;}",
      ".strata-ios-picker-search::placeholder{color:#64748b;}",
      ".strata-ios-picker-list{margin-top:8px;max-height:190px;overflow:auto;-webkit-overflow-scrolling:touch;border-radius:12px;border:1px solid #eef2f7;background:#fff;}",
      ".strata-ios-picker-option{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;border:0;border-bottom:1px solid #eef2f7;background:#fff;padding:12px 13px;text-align:left;font:inherit;font-size:15px;line-height:1.25;color:#111827;}",
      ".strata-ios-picker-option:last-child{border-bottom:0;}",
      ".strata-ios-picker-option[aria-selected='true']{background:#fff7ed;color:#ea580c;font-weight:700;}",
      ".strata-ios-picker-empty{padding:16px 14px;color:#64748b;font-size:14px;text-align:center;}",
      ".dark .strata-ios-select-button{border-color:#374151;background:#111827;color:#f8fafc;}",
      ".dark .strata-ios-picker-sheet{border-color:#374151;background:#111827;box-shadow:0 18px 42px rgba(0,0,0,.42);}",
      ".dark .strata-ios-picker-search{border-color:#374151;background:#0f172a;color:#f8fafc;}",
      ".dark .strata-ios-picker-list{border-color:#374151;background:#111827;}",
      ".dark .strata-ios-picker-option{border-bottom-color:#1f2937;background:#111827;color:#f8fafc;}",
      ".dark .strata-ios-picker-option[aria-selected='true']{background:rgba(249,115,22,.16);color:#fb923c;}"
    ].join("");
    document.head.appendChild(style);
  }

  function isMakeOrModelSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return false;
    var first = select.options[0] ? select.options[0].textContent || "" : "";
    return /select make|loading makes|select model|loading models/i.test(first);
  }

  function selectedLabel(select) {
    var selected = select.options[select.selectedIndex];
    if (selected && selected.value) return selected.textContent || "";
    return select.options[0] ? select.options[0].textContent || "Select" : "Select";
  }

  function syncButton(select, button) {
    button.disabled = select.disabled;
    var text = button.querySelector(".strata-ios-select-button__text");
    if (text) text.textContent = selectedLabel(select);
  }

  function setSelectValue(select, value) {
    var descriptor =
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), "value") ||
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(select, value);
    } else {
      select.value = value;
    }
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function closePicker() {
    var existing = document.getElementById(SHEET_ID);
    if (existing) existing.remove();
  }

  function installRouteCloseHandlers() {
    if (window.__strataIosVehiclePickerRouteCloseInstalled) return;
    window.__strataIosVehiclePickerRouteCloseInstalled = true;
    ["pushState", "replaceState"].forEach(function (method) {
      var original = history[method];
      if (typeof original !== "function") return;
      history[method] = function () {
        closePicker();
        return original.apply(this, arguments);
      };
    });
    window.addEventListener("popstate", closePicker);
    window.addEventListener("hashchange", closePicker);
    window.addEventListener("pagehide", closePicker);
  }

  function openPicker(select, button) {
    closePicker();
    var shell = document.createElement("div");
    shell.id = SHEET_ID;

    var sheet = document.createElement("section");
    sheet.className = "strata-ios-picker-sheet";
    sheet.setAttribute("role", "listbox");

    sheet.innerHTML =
      '<input class="strata-ios-picker-search" type="search" placeholder="Search" autocomplete="off" />' +
      '<div class="strata-ios-picker-list"></div>';

    var anchor = button.parentElement || document.body;
    shell.className = "strata-ios-picker-shell";
    shell.appendChild(sheet);
    button.insertAdjacentElement("afterend", shell);

    var height = 250;
    var search = sheet.querySelector(".strata-ios-picker-search");
    var list = sheet.querySelector(".strata-ios-picker-list");
    list.style.maxHeight = "190px";
    window.setTimeout(function () {
      try { search.focus({ preventScroll: true }); } catch (_) { search.focus(); }
    }, 0);

    function render() {
      var query = search.value.trim().toLowerCase();
      var options = Array.from(select.options)
        .filter(function (option) {
          return option.value;
        })
        .filter(function (option) {
          return !query || (option.textContent || "").toLowerCase().includes(query);
        });

      list.innerHTML = "";
      if (!options.length) {
        var empty = document.createElement("div");
        empty.className = "strata-ios-picker-empty";
        empty.textContent = "No matches";
        list.appendChild(empty);
        return;
      }

      options.forEach(function (option) {
        var row = document.createElement("button");
        row.type = "button";
        row.className = "strata-ios-picker-option";
        row.setAttribute("aria-selected", String(option.value === select.value));
        row.textContent = option.textContent || option.value;
        row.addEventListener("click", function () {
          setSelectValue(select, option.value);
          closePicker();
        });
        list.appendChild(row);
      });
    }

    search.addEventListener("input", render);
    render();

    sheet.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
    sheet.addEventListener("touchstart", function (event) { event.stopPropagation(); }, { passive: true });
    sheet.addEventListener("click", function (event) { event.stopPropagation(); });

    var staleObserver = new MutationObserver(function () {
      if (!select.isConnected || !button.isConnected || !sheet.isConnected) {
        closePicker();
        staleObserver.disconnect();
      }
    });
    staleObserver.observe(anchor, { childList: true, subtree: true });
  }

  function cleanupOrphanButtons(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll(".strata-ios-select-button").forEach(function (button) {
      var previous = button.previousElementSibling;
      if (!(previous instanceof HTMLSelectElement) || previous.dataset.strataVehiclePicker !== "1" || !previous.isConnected) {
        button.remove();
      }
    });
  }

  function hardenSelect(select) {
    if (!isMakeOrModelSelect(select)) return;
    if (select.dataset.strataVehiclePicker === "1") {
      var existingButton = select.nextElementSibling;
      if (existingButton && existingButton.classList && existingButton.classList.contains("strata-ios-select-button")) {
        syncButton(select, existingButton);
      }
      return;
    }
    injectStyles();
    cleanupOrphanButtons(select.parentElement || document);
    select.dataset.strataVehiclePicker = "1";
    select.classList.add("strata-ios-select-hidden");

    var button = document.createElement("button");
    button.type = "button";
    button.className = "strata-ios-select-button";
    button.innerHTML =
      '<span class="strata-ios-select-button__text"></span><span class="strata-ios-select-button__chevron">⌄</span>';
    button.addEventListener("click", function () {
      if (!select.disabled) openPicker(select, button);
    });

    select.insertAdjacentElement("afterend", button);
    syncButton(select, button);
    select.addEventListener("change", function () {
      syncButton(select, button);
    });

    var selectObserver = new MutationObserver(function () {
      if (!select.isConnected) {
        button.remove();
        selectObserver.disconnect();
        return;
      }
      syncButton(select, button);
    });
    selectObserver.observe(select, { attributes: true, childList: true, subtree: true });
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    cleanupOrphanButtons(root);
    root.querySelectorAll("select").forEach(hardenSelect);
  }

  function boot() {
    installRouteCloseHandlers();
    scan(document);
    new MutationObserver(function (mutations) {
      var activePicker = document.getElementById(SHEET_ID);
      if (activePicker) {
        var activeAnchor = activePicker.parentElement;
        if (!activeAnchor || !activeAnchor.isConnected) closePicker();
      }
      cleanupOrphanButtons(document);
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node instanceof HTMLSelectElement) hardenSelect(node);
          scan(node);
        });
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
