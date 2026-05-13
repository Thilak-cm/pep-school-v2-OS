import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase.js";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

/**
 * StudentPicker — prop-driven student selector.
 *
 * Props:
 * - scope: "hardcoded" | "program" | "school-wide"
 * - defaults: initial student list (for hardcoded scope)
 * - programFilter: program ID for program-scoped fetch
 * - onSelect(student | null): callback when student is picked
 * - renderOptionExtra(student): optional render function for extra content in option rows
 */
export default function StudentPicker({ scope = "program", defaults, programFilter, onSelect, renderOptionExtra }) {
  const [students, setStudents] = useState(scope === "hardcoded" ? (defaults || []) : []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Fetch students for non-hardcoded scopes
  useEffect(() => {
    if (scope === "hardcoded") {
      setStudents(defaults || []);
      return;
    }
    loadStudents();
  }, [scope, programFilter]);

  async function loadStudents() {
    setLoading(true);
    setLoadError(null);
    try {
      // Build classroom lookup
      const classroomsSnap = await getDocs(collection(db, "classrooms"));
      const classroomMap = {};
      for (const d of classroomsSnap.docs) {
        const data = d.data();
        classroomMap[d.id] = { name: data.name || d.id, programId: data.programId };
      }

      // For program scope, only include classrooms matching the program
      const programId = programFilter || "primary";
      const relevantClassroomIds = scope === "program"
        ? new Set(Object.entries(classroomMap).filter(([, v]) => v.programId === programId).map(([k]) => k))
        : null; // school-wide: all classrooms

      // Fetch students
      const studentsSnap = await getDocs(collection(db, "students"));
      const all = [];
      for (const d of studentsSnap.docs) {
        const data = d.data();
        if (data.status === "graduated") continue;
        if (relevantClassroomIds && !relevantClassroomIds.has(data.classroomId)) continue;
        all.push({
          id: d.id,
          displayName: data.displayName || d.id,
          classroomId: data.classroomId || "",
          classroomName: classroomMap[data.classroomId]?.name || data.classroomId || "",
        });
      }
      all.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setStudents(all);
    } catch (err) {
      console.error("Failed to load students:", err);
      setLoadError("Failed to load students — check permissions or network");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Autocomplete
      options={students}
      loading={loading}
      getOptionLabel={(s) => s.displayName}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      onChange={(_, value) => onSelect(value)}
      renderOption={(props, s) => {
        const { key, ...rest } = props;
        return (
          <Box component="li" key={key} {...rest} sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <Box>
              <Typography variant="body2">{s.displayName}</Typography>
              <Typography variant="caption" color="text.secondary">{s.classroomName}</Typography>
            </Box>
            {renderOptionExtra?.(s)}
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Select Student"
          placeholder="Search students..."
          size="small"
          error={!!loadError}
          helperText={loadError}
        />
      )}
      sx={{ minWidth: 280 }}
    />
  );
}
