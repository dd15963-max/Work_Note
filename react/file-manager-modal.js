(() => {
  let scheduled = false;

  const textOf = (element) => (element?.textContent || "").trim();
  const isFileButton = (button) => /파일\s*\d*/.test(textOf(button));

  const findCloseButton = (panel) => {
    if (panel.classList.contains("inline-file-panel")) {
      const article = panel.closest("article");
      return Array.from(article?.querySelectorAll(".card-actions button") || []).find(isFileButton) || null;
    }
    const group = panel.closest(".sales-row-group");
    return Array.from(group?.querySelectorAll(".sales-management-actions button") || []).find((button) => isFileButton(button) && button.getAttribute("aria-expanded") === "true")
      || Array.from(group?.querySelectorAll(".sales-management-actions button") || []).find(isFileButton)
      || null;
  };

  const closePanel = (panel) => {
    const button = findCloseButton(panel);
    if (button) button.click();
  };

  const ensureCloseButton = (panel) => {
    if (panel.querySelector(":scope > .file-modal-close")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-modal-close";
    button.setAttribute("aria-label", "파일함 닫기");
    button.textContent = "×";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      closePanel(panel);
    });
    panel.prepend(button);
  };

  const apply = () => {
    const inlinePanels = Array.from(document.querySelectorAll(".inline-file-panel"));
    const salesPanels = Array.from(document.querySelectorAll(".sales-detail-panel"));
    salesPanels.forEach((panel) => {
      panel.classList.toggle("file-modal-panel", Boolean(panel.querySelector(".sales-file-manager")));
    });
    const panels = [...inlinePanels, ...salesPanels.filter((panel) => panel.classList.contains("file-modal-panel"))];
    panels.forEach(ensureCloseButton);
    document.body.classList.toggle("file-modal-open", panels.length > 0);
  };

  const scheduleApply = () => {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      apply();
    }, 20);
  };

  document.addEventListener("mousedown", (event) => {
    const panel = event.target instanceof Element ? event.target.closest(".inline-file-panel, .sales-detail-panel.file-modal-panel") : null;
    if (!panel || event.target !== panel) return;
    closePanel(panel);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const panels = Array.from(document.querySelectorAll(".inline-file-panel, .sales-detail-panel.file-modal-panel"));
    const panel = panels.at(-1);
    if (panel) closePanel(panel);
  });

  window.addEventListener("DOMContentLoaded", scheduleApply);
  new MutationObserver(scheduleApply).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-expanded"] });
})();
