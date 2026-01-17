const DEFAULT_DURATION = 2500;
let globalTimer = null;

/**
 * Create a toast function bound to a specific element
 * @param {HTMLElement|string} elementOrId - Toast element or its ID
 * @param {Object} options - Toast options
 * @param {number} options.duration - Duration in ms (default: 2500)
 * @returns {Function} showToast function
 */
export function createToast(elementOrId, options = {}) {
  const duration = options.duration || DEFAULT_DURATION;

  return function showToast(message) {
    const element =
      typeof elementOrId === "string"
        ? document.getElementById(elementOrId)
        : elementOrId;

    if (!element) return;

    element.textContent = message;
    element.classList.remove("hidden");

    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      element.classList.add("hidden");
    }, duration);
  };
}

/**
 * Show toast using global toast element (id="toast")
 * @param {string} message - Message to display
 * @param {Object} options - Options
 * @param {string} options.elementId - Custom element ID (default: "toast")
 * @param {number} options.duration - Duration in ms (default: 2500)
 */
export function showGlobalToast(message, options = {}) {
  const elementId = options.elementId || "toast";
  const duration = options.duration || DEFAULT_DURATION;
  const element = document.getElementById(elementId);

  if (!element) return;

  element.textContent = message;
  element.classList.remove("hidden");

  clearTimeout(globalTimer);
  globalTimer = setTimeout(() => {
    element.classList.add("hidden");
  }, duration);
}
