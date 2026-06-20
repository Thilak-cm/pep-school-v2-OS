/**
 * Hook for promoting a testbench variant to live Firestore config (PEP-326).
 *
 * Wraps the promoteTestBenchConfig CF call with loading/error/success state.
 */
import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { cloudFunctions } from "../firebase.js";

export default function usePromoteToLive() {
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Call the promote CF.
   * @param {object} params
   * @param {string} params.featureId
   * @param {object} params.fields — selected variant fields to promote
   * @param {string} [params.programId]
   * @param {string} [params.promptType]
   * @param {string} [params.runId]
   * @returns {Promise<{ status: string, promotedAt: string, targets: Array }>}
   */
  async function promote({ featureId, fields, programId, promptType, runId }) {
    setPromoting(true);
    setError(null);
    try {
      const fn = httpsCallable(cloudFunctions, "promoteTestBenchConfig");
      const result = await fn({ featureId, fields, programId, promptType, runId });
      return result.data;
    } catch (err) {
      const message = err?.message || "Promotion failed";
      setError(message);
      throw err;
    } finally {
      setPromoting(false);
    }
  }

  return { promote, promoting, error, clearError: () => setError(null) };
}
