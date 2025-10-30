export function createModal(overlayId, options = {}) {
  const overlay =
    typeof overlayId === "string" ? document.getElementById(overlayId) : overlayId;
  if (!overlay) {
    throw new Error(`modal overlay "${overlayId}" not found`);
  }

  const settings = {
    closeOnOverlay: true,
    closeOnEsc: true,
    onOpen: null,
    onClose: null,
    ...options,
  };

  const focusSelector = overlay.getAttribute("data-auto-focus");
  const closeButtons = overlay.querySelectorAll("[data-modal-close]");

  overlay.setAttribute(
    "aria-hidden",
    overlay.classList.contains("hidden") ? "true" : "false",
  );

  const open = () => {
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    const focusTarget =
      (focusSelector && overlay.querySelector(focusSelector)) ||
      overlay.querySelector("[data-autofocus]") ||
      overlay.querySelector("input, textarea, select, button");
    focusTarget?.focus();
    settings.onOpen?.();
  };

  const close = () => {
    if (overlay.classList.contains("hidden")) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    settings.onClose?.();
  };

  closeButtons.forEach((btn) => btn.addEventListener("click", close));

  if (settings.closeOnOverlay) {
    overlay.addEventListener("click", (evt) => {
      if (evt.target === overlay) {
        close();
      }
    });
  }

  if (settings.closeOnEsc) {
    document.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape" && !overlay.classList.contains("hidden")) {
        close();
      }
    });
  }

  return { open, close, overlay };
}
