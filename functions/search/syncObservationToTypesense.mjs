// Stub - #331 - Not implemented

import * as functions from "firebase-functions/v1";

export const syncObservationToTypesense = functions
  .region("asia-south1")
  .firestore.document("students/{studentId}/observations/{observationId}")
  .onWrite(async () => {
    throw new Error("Not implemented");
  });
