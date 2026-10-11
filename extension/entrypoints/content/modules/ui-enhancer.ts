const ENHANCED_ATTR = "data-betterssb-enhanced";

function enhanceTables(): void {
  const tables = document.querySelectorAll("table");
  for (const table of tables) {
    if (table.hasAttribute(ENHANCED_ATTR)) continue;
    table.setAttribute(ENHANCED_ATTR, "true");

    const wrapper = table.closest(".dataTables_wrapper") ?? table.parentElement;
    if (wrapper) {
      (wrapper as HTMLElement).classList.add("betterssb-enhanced");
    }
  }
}

function enhanceForms(): void {
  const forms = document.querySelectorAll("form");
  for (const form of forms) {
    if (form.hasAttribute(ENHANCED_ATTR)) continue;
    form.setAttribute(ENHANCED_ATTR, "true");
    form.classList.add("betterssb-enhanced");
  }
}

function applyGlobalEnhancements(): void {
  if (document.body.hasAttribute(ENHANCED_ATTR)) return;
  document.body.setAttribute(ENHANCED_ATTR, "true");

  const style = document.createElement("style");
  style.textContent = `
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      -webkit-font-smoothing: antialiased;
    }
    .select2-container .select2-choice,
    .select2-container .select2-choices {
      border-radius: 6px !important;
    }
    [id*="search"] .panel,
    [id*="Search"] .panel {
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
  `;
  document.head.appendChild(style);
}

export function initUIEnhancer(): void {
  applyGlobalEnhancements();
  enhanceTables();
  enhanceForms();
}
