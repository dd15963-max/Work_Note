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

  const fileKey = (file) => `${file.name}::${file.size}::${file.lastModified}`;

  const mergeFileLists = (currentFiles, addedFiles) => {
    const seen = new Set();
    const merged = [];
    [...currentFiles, ...addedFiles].forEach((file) => {
      const key = fileKey(file);
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(file);
    });
    return merged;
  };

  const assignFilesToInput = (input, files) => {
    if (!input || !files.length) return false;
    try {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  };

  const setDragState = (panel, active) => {
    panel.classList.toggle("is-dragover", Boolean(active));
  };

  const handleDrop = (panel, event) => {
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => file && file.size >= 0);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    setDragState(panel, false);
    const input = panel.querySelector("input[type='file']");
    if (!(input instanceof HTMLInputElement)) return;
    input.multiple = true;
    const merged = mergeFileLists(Array.from(input.files || []), files);
    const ok = assignFilesToInput(input, merged);
    if (!ok) alert("이 브라우저에서는 드래그 파일을 자동으로 넣지 못했습니다. 파일 선택 버튼으로 업로드해 주세요.");
  };

  const ensureDropUpload = (uploadPanel) => {
    if (uploadPanel.dataset.dragUploadBound === "true") return;
    uploadPanel.dataset.dragUploadBound = "true";
    uploadPanel.setAttribute("data-drop-hint", "파일을 여기로 드래그하거나 파일 선택으로 여러 개 업로드");
    const input = uploadPanel.querySelector("input[type='file']");
    if (input instanceof HTMLInputElement) input.multiple = true;

    ["dragenter", "dragover"].forEach((type) => {
      uploadPanel.addEventListener(type, (event) => {
        if (!event.dataTransfer?.types?.includes("Files")) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setDragState(uploadPanel, true);
      });
    });
    ["dragleave", "dragend"].forEach((type) => {
      uploadPanel.addEventListener(type, (event) => {
        event.stopPropagation();
        if (type === "dragleave" && event.relatedTarget instanceof Node && uploadPanel.contains(event.relatedTarget)) return;
        setDragState(uploadPanel, false);
      });
    });
    uploadPanel.addEventListener("drop", (event) => handleDrop(uploadPanel, event));
  };

  const ensureUploadEnhancements = () => {
    document.querySelectorAll("input[type='file']").forEach((input) => {
      if (input instanceof HTMLInputElement) input.multiple = true;
    });
    document.querySelectorAll(".file-upload-panel").forEach(ensureDropUpload);
  };

  const apply = () => {
    const inlinePanels = Array.from(document.querySelectorAll(".inline-file-panel"));
    const salesPanels = Array.from(document.querySelectorAll(".sales-detail-panel"));
    salesPanels.forEach((panel) => {
      panel.classList.toggle("file-modal-panel", Boolean(panel.querySelector(".sales-file-manager")));
    });
    const panels = [...inlinePanels, ...salesPanels.filter((panel) => panel.classList.contains("file-modal-panel"))];
    panels.forEach(ensureCloseButton);
    ensureUploadEnhancements();
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

  document.addEventListener("dragover", (event) => {
    const inUploadPanel = event.target instanceof Element && event.target.closest(".file-upload-panel");
    if (inUploadPanel) return;
    if (document.body.classList.contains("file-modal-open") && event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "none";
    }
  });

  document.addEventListener("drop", (event) => {
    const inUploadPanel = event.target instanceof Element && event.target.closest(".file-upload-panel");
    if (inUploadPanel) return;
    if (document.body.classList.contains("file-modal-open") && event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
    }
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
