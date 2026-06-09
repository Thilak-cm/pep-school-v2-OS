import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase.js";
import { useAuth } from "../contexts/AuthContext.js";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

/**
 * ClassroomPicker — role-scoped classroom selector for digest testbench.
 *
 * Props:
 * - onSelect(classroom | null): callback when classroom is picked
 *   classroom shape: { id, name, program }
 */
export default function ClassroomPicker({ onSelect }) {
  const { role, user, manageableClassrooms } = useAuth();
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    loadClassrooms();
  }, []);

  async function loadClassrooms() {
    setLoading(true);
    setLoadError(null);
    try {
      const snap = await getDocs(collection(db, "classrooms"));
      let all = snap.docs
        .map((d) => ({
          id: d.id,
          name: d.data().name || d.id,
          program: d.data().program || d.data().programId || "",
          status: d.data().status || "active",
          teacherIds: d.data().teacherIds || [],
        }))
        .filter((c) => c.status === "active");

      // Role-scoped filtering
      if (role === "teacher") {
        all = all.filter((c) => c.teacherIds.includes(user.uid));
      } else if (role === "classroomadmin" && Array.isArray(manageableClassrooms)) {
        all = all.filter((c) => manageableClassrooms.includes(c.id));
      }
      // superadmin sees all

      all.sort((a, b) => a.name.localeCompare(b.name));
      setClassrooms(all);
    } catch (err) {
      console.error("Failed to load classrooms:", err);
      setLoadError("Failed to load classrooms");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Autocomplete
      options={classrooms}
      loading={loading}
      getOptionLabel={(c) => c.name}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      onChange={(_, value) => onSelect(value)}
      renderOption={(props, c) => {
        const { key, ...rest } = props;
        return (
          <Box component="li" key={key} {...rest} sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <Box>
              <Typography variant="body2">{c.name}</Typography>
              <Typography variant="caption" color="text.secondary">{c.program}</Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Select Classroom"
          placeholder="Search classrooms..."
          size="small"
          error={!!loadError}
          helperText={loadError}
        />
      )}
      sx={{ minWidth: 280 }}
    />
  );
}
