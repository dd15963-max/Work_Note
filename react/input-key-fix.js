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
    "input[type='number']"
  ].join(",");
  const remembered = new WeakMap();
  const restoring = new WeakSet();

  const editableTarget = (target) => {
    if (!(target instanceof Element)) return null;
    const element = target.closest(TEXT_EDIT_SELECTOR);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return null;
    if (element.readOnly || element.disabled) return null;
    return element;
  };

  const canAcceptLineBreak = (element) => element instanceof HTMLTextAreaElement;

  const selectionOf = (element) => ({
    start: element.selectionStart ?? element.value.length,
    end: element.selectionEnd ?? element.value.length
  });

  const restoreSelection = (element, selection) => {
    try {
      element.setSelectionRange(selection.start, selection.end);
    } catch {
      // Ignore input types that do not support selection ranges.
    }
  };

  const setNativeValue = (element, value) => {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  };

  const emitInput = (element, data, inputType) => {
    try {
      element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
    } catch {
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const remember = (element, value = element.value, selection = selectionOf(element)) => {
    remembered.set(element, { value, selection });
    scheduleRestore(element);
  };

  const shouldRestore = (current, stored) => {
    if (!stored || current === stored) return false;
    if (stored.endsWith(" ") && stored.trimEnd() === current) return true;
    if (stored.endsWith("\n") && stored.trimEnd() === current) return true;
    return false;
  };

  const restoreOnce = (element) => {
    const data = remembered.get(element);
    if (!data || document.activeElement !== element) return;
    if (!shouldRestore(element.value, data.value)) return;
    setNativeValue(element, data.value);
    restoreSelection(element, data.selection);
  };

  const scheduleRestore = (element) => {
    if (restoring.has(element)) return;
    restoring.add(element);
    const delays = [0, 16, 40, 90, 180, 320];
    delays.forEach((delay, index) => {
      window.setTimeout(() => {
        restoreOnce(element);
        if (index === delays.length - 1) restoring.delete(element);
      }, delay);
    });
    window.requestAnimationFrame(() => restoreOnce(element));
  };

  const insertText = (element, text, inputType = "insertText") => {
    const { start, end } = selectionOf(element);
    const nextValue = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;
    const nextCaret = start + text.length;
    setNativeValue(element, nextValue);
    restoreSelection(element, { start: nextCaret, end: nextCaret });
    remember(element, nextValue, { start: nextCaret, end: nextCaret });
    emitInput(element, text, inputType);
    scheduleRestore(element);
  };

  document.addEventListener("beforeinput", (event) => {
    const target = editableTarget(event.target);
    if (!target) return;
    if (event.isComposing) return;

    if (event.inputType === "insertText" && event.data === " ") {
      event.preventDefault();
      event.stopPropagation();
      insertText(target, " ", "insertText");
      return;
    }

    if ((event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") && canAcceptLineBreak(target)) {
      event.preventDefault();
      event.stopPropagation();
      insertText(target, "\n", event.inputType);
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    const target = editableTarget(event.target);
    if (!target || event.isComposing) return;

    if ((event.key === " " || event.key === "Spacebar") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      insertText(target, " ", "insertText");
      return;
    }

    if (event.key === "Enter" && canAcceptLineBreak(target) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      insertText(target, "\n", "insertLineBreak");
    }
  }, true);

  document.addEventListener("input", (event) => {
    const target = editableTarget(event.target);
    if (!target) return;
    remember(target);
  }, true);

  document.addEventListener("focusin", (event) => {
    const target = editableTarget(event.target);
    if (target) remember(target);
  });
})();
