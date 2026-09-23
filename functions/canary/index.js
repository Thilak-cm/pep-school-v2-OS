import * as functions from "firebase-functions/v1";

// Temporary canary to verify CI applies the allUsers invoker binding to
// newly created callable functions (see deploy.yml invoker sweep step).
// Safe to delete once verified.
export const invokerBindingCanary = functions
    .region("asia-south1")
    .https.onCall(async (data, context) => {
      return {ok: true, authed: Boolean(context.auth)};
    });
