(function () {
  "use strict";

  var PHONE_SELECTOR =
    'input[type="tel"], input[autocomplete="tel"], input[id*="phone" i], input[name*="phone" i]';
  var MAX_DIGITS = 10;

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "").slice(0, MAX_DIGITS);
  }

  function formatPhone(digits) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return "(" + digits.slice(0, 3) + ") " + digits.slice(3);
    return "(" + digits.slice(0, 3) + ") " + digits.slice(3, 6) + "-" + digits.slice(6);
  }

  function setNativeValue(input, value) {
    var descriptor =
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value") ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

    if (descriptor && descriptor.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }
  }

  function isPhoneInput(target) {
    return target instanceof HTMLInputElement && target.matches(PHONE_SELECTOR);
  }

  function formatInput(input) {
    var formatted = formatPhone(digitsOnly(input.value));
    if (input.value === formatted) return;

    setNativeValue(input, formatted);
    try {
      input.setSelectionRange(formatted.length, formatted.length);
    } catch (_error) {
      // Some iOS input states do not allow selection updates.
    }
  }

  function hardenInput(input) {
    if (!isPhoneInput(input) || input.dataset.strataPhoneInput === "1") return;

    input.dataset.strataPhoneInput = "1";
    input.inputMode = "tel";
    input.maxLength = 14;
    if (!input.autocomplete) input.autocomplete = "tel";
    formatInput(input);
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(PHONE_SELECTOR).forEach(hardenInput);
  }

  document.addEventListener(
    "focusin",
    function (event) {
      if (isPhoneInput(event.target)) hardenInput(event.target);
    },
    true
  );

  document.addEventListener(
    "input",
    function (event) {
      if (!isPhoneInput(event.target)) return;
      formatInput(event.target);
    },
    true
  );

  function boot() {
    scan(document);

    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (isPhoneInput(node)) hardenInput(node);
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
