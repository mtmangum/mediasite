import { installDemo } from "./demo-install";

// Import this first: in the GitHub Pages demo build it swaps the network for sample data.
// In every other build `__DEMO__` is false and this (and the demo code) is removed.
if (__DEMO__) installDemo();
