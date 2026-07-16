(() => {
  const TEXT_EDIT_SELECTOR = [
    "textarea",
    "input:not([type])",
    "input[type='text']",
    "input[type='search']",
    "input[type='email']",
    "input[type='url']",
    "input[type='tel']",
    "input[type='password']",
    "input[type='number']",
    "[contenteditable='true']",
    "[contenteditable='']"
  ].join(",");
  const trailingWhitespacePattern = /[\s\u00a0]$/;
  const remembered = new WeakMap();
  const scheduled = new WeakSet();

  const isTextEditable = (element) => element instanceof Element && Boolean(element.closest(TEXT_EDIT_SELECTOR));

  const editableTarget = (target) => {
    if (!(target instanceof Element)) return null;
    return target.closest(TEXT_EDIT_SELECTOR);
  };

  const readValue = (element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
    return element.textContent || "";
  };

  const writeValue = (element, value) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = value;
      return;
    }
    element.textContent = value;
  };

  const selectionOf = (element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return {
        start: element.selectionStart,
        end: element.selectionEnd
      };
    }
    return { start: null, end: null };
  };

  const restoreSelection = (element, selection) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    if (selection.start === null || selection.end === null) return;
    try {
      element.setSelectionRange(selection.start, selection.end);
    } catch {
      // Some input types do not allow selection ranges.
    }
  };

  const shouldRestore = (current, raw) => {
    if (!raw || raw === current) return false;
    if (!trailingWhitespacePattern.test(raw)) return false;
    if (raw.trimEnd() === current) return true;
    if (raw.replace(/[\s\u00a0]+$/g, "") === current) return true;
    return false;
  };

  const scheduleRestore = (element) => {
    if (scheduled.has(element)) return;
    scheduled.add(element);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        scheduled.delete(element);
        const data = remembered.get(element);
        if (!data) return;
        if (document.activeElement !== element) return;
        const current = readValue(element);
        if (!shouldRestore(current, data.value)) return;
        writeValue(element, data.value);
        restoreSelection(element, data.selection);
      }, 0);
    });
  };

  const remember = (element) => {
    if (!isTextEditable(element)) return;
    remembered.set(element, {
      value: readValue(element),
      selection: selectionOf(element)
    });
    scheduleRestore(element);
  };

  document.addEventListener("input", (event) => {
    const target = editableTarget(event.target);
    if (target) remember(target);
  }, true);

  document.addEventListener("keyup", (event) => {
    const target = editableTarget(event.target);
    if (!target) return;
    if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") remember(target);
  }, true);

  document.addEventListener("beforeinput", (event) => {
    const target = editableTarget(event.target);
    if (!target) return;
    const data = event.data || "";
    if (data === " " || data === "\n") {
      window.setTimeout(() => remember(target), 0);
    }
  }, true);
})();
