import type { AuthConfig } from "convex/server";

// The fleet's one production Clerk instance (docs/architecture/auth-flow.md).
// Clerk mints the token from the JWT template named "convex". Every function
// in this folder reads the caller from ctx.auth.getUserIdentity() and never
// from an argument.
const CLERK_JWT_ISSUER = "https://clerk.neorgon.com";

export default {
  providers: [
    {
      domain: CLERK_JWT_ISSUER,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
