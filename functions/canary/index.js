import * as functions from "firebase-functions/v1";

// Temporary canary to verify CI applies the allUsers invoker binding to
// newly created callable functions (see deploy.yml invoker sweep step).
// Safe to delete once verified. (Touched to retrigger the functions deploy
// path filter after the --force fix - deploy.yml alone doesn't match it.)
export const invokerBindingCanary = functions
    .region("asia-south1")
    .https.onCall(async (data, context) => {
      return {ok: true, authed: Boolean(context.auth)};
    });
