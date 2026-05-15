import { createContext, useContext } from "react";

/**
 * Auth context for the test bench app.
 *
 * Provided by AuthGate after authentication succeeds.
 * Value shape: { user, role, allowedFeatures, manageableClassrooms }
 *   - user: Firebase Auth user object
 *   - role: string ("superadmin" | "teacher" | etc.)
 *   - allowedFeatures: string[] from testbench_access/{uid} (null for superadmins)
 *   - manageableClassrooms: string[] from users/{uid} (classroom IDs for classroomadmins)
 */
const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthGate");
  }
  return ctx;
}

export default AuthContext;
