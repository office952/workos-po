import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import {
  restoreCloudUnauthorizedExpiry,
  setCloudUnauthorizedHandler,
} from "../session/sessionExpiryBridge";

afterEach(() => {
  cleanup();
  resetResourceCache();
  setCloudUnauthorizedHandler(null);
  restoreCloudUnauthorizedExpiry();
  sessionStorage.clear();
});
