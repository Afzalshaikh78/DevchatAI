import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  /**
   * Same-origin works for both localhost and production when the app and auth
   * endpoints are served from the same host.
   */
});
