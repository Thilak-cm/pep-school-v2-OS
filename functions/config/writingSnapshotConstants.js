// Shared defaults for the monthly writing snapshot feature (PEP-47)
import { MINI_MODEL } from "./modelConstants.js";

export const WRITING_SNAPSHOT_DEFAULTS = {
  model: MINI_MODEL,
  temperature: 0,
  max_tokens: 1500,
  minSamples: 3,
  timezone: "Asia/Kolkata",
};
