import "./style.css";

export default defineContentScript({
  matches: [
    "*://*.edu/StudentRegistrationSsb/*",
    "*://*.edu/ssb/*",
  ],
  cssInjectionMode: "ui",

  async main() {
    const { initRMPRatings } = await import("./modules/rmp-ratings");
    const { initUIEnhancer } = await import("./modules/ui-enhancer");
    const { initAutoRegister } = await import("./modules/auto-register");

    function detectPage(): "search" | "registration" | "results" | "unknown" {
      const url = window.location.href.toLowerCase();
      if (url.includes("classSearch") || url.includes("searchResults")) return "search";
      if (url.includes("registration") || url.includes("addDrop")) return "registration";
      if (url.includes("results")) return "results";
      return "unknown";
    }

    function activateModules() {
      const page = detectPage();

      initUIEnhancer();

      if (page === "search" || page === "results" || page === "unknown") {
        initRMPRatings(observer);
      }

      if (page === "registration") {
        initAutoRegister();
      }
    }

    const observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some(
        (m) => m.addedNodes.length > 0 || m.type === "childList"
      );
      if (hasNewNodes) {
        activateModules();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    activateModules();
  },
});
