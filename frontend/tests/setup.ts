import "@testing-library/jest-dom/vitest";
import * as matchers from "vitest-axe/matchers";
import "vitest-axe/extend-expect";
import { afterEach, beforeEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";

expect.extend(matchers);

// jsdom does not implement <canvas>; axe-core probes it while evaluating color
// contrast. Returning null keeps the (jsdom-approximate) contrast checks from
// emitting noisy "not implemented" warnings.
beforeEach(() => {
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = () => null as never;
  }
});

afterEach(() => {
  cleanup();
});
