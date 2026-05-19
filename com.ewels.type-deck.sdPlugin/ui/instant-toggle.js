(() => {
  // Auto-tick "Instant type" once the textarea grows past this many characters.
  // Only fires on upward crossings, so user unticks are respected.
  const AUTO_INSTANT_THRESHOLD = 500;

  const apply = (disabled) => {
    for (const el of document.querySelectorAll("[data-instant-toggle]")) {
      el.disabled = !!disabled;
    }
  };

  SDPIComponents.useSettings("instantType", apply);

  // Seed lastTextLen from the settings broadcast itself — sdpi-textarea's
  // valuechange event doesn't fire on the initial load if the saved text is
  // undefined (a fresh action), so we can't rely on it for the baseline.
  let lastTextLen = 0;
  let initialized = false;
  SDPIComponents.useSettings("text", (value) => {
    lastTextLen = value?.length ?? 0;
    initialized = true;
  });

  document.addEventListener("DOMContentLoaded", () => {
    const cb = document.querySelector('sdpi-checkbox[setting="instantType"]');
    cb?.addEventListener("valuechange", () => apply(cb.value));

    const textArea = document.querySelector('sdpi-textarea[setting="text"]');
    if (!textArea || !cb) return;

    textArea.addEventListener("valuechange", () => {
      const newLen = textArea.value?.length ?? 0;
      if (initialized) {
        const wasOver = lastTextLen >= AUTO_INSTANT_THRESHOLD;
        const isOver = newLen >= AUTO_INSTANT_THRESHOLD;
        if (isOver && !wasOver && !cb.value) {
          cb.value = true;
        }
      }
      lastTextLen = newLen;
    });
  });
})();
