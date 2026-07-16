(() => {
  const guarded = new WeakSet();
  const EDITABLE_SELECTOR = [
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[contenteditable='']"
  ].join(",");
  const guardedKeys = new Set([" ", "Spacebar", "Enter"]);

  const isEditable = (element) => {
    if (!(element instanceof Element)) return false;
    const editable = element.closest(EDITABLE_SELECTOR);
    if (!editable) return false;
    if (editable.matches("input[type='button'], input[type='submit'], input[type='reset'], input[type='checkbox'], input[type='radio'], input[type='file']")) return false;
    return true;
  };

  const shouldGuard = (event) => {
    if (!guardedKeys.has(event.key)) return false;
    if (!isEditable(event.target)) return false;
    return true;
  };

  const stopParentShortcuts = (event) => {
    if (!shouldGuard(event)) return;
    event.stopPropagation();
  };

  const installGuard = (element) => {
    if (!(element instanceof Element) || guarded.has(element)) return;
    if (!element.matches(EDITABLE_SELECTOR)) return;
    guarded.add(element);
    element.addEventListener("keydown", stopParentShortcuts);
    element.addEventListener("keypress", stopParentShortcuts);
    element.addEventListener("keyup", stopParentShortcuts);
  };

  const scan = (root = document) => {
    if (root instanceof Element && root.matches(EDITABLE_SELECTOR)) installGuard(root);
    root.querySelectorAll?.(EDITABLE_SELECTOR).forEach(installGuard);
  };

  const scheduleScan = (() => {
    let scheduled = false;
    return () => {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        scan();
      }, 30);
    };
  })();

  window.addEventListener("DOMContentLoaded", () => scan());
  document.addEventListener("focusin", (event) => {
    const editable = event.target instanceof Element ? event.target.closest(EDITABLE_SELECTOR) : null;
    if (editable) installGuard(editable);
  });
  new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
