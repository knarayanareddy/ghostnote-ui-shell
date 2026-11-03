// `/vitest` is the entrypoint that augments Vitest's Assertion type.
import "@testing-library/jest-dom/vitest";

// Script tests (scripts/*.test.mjs) run in the `node` environment, where there
// is no window. Only patch matchMedia when a DOM is actually present.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
