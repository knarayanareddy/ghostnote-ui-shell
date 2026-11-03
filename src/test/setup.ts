import "@testing-library/jest-dom";

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
