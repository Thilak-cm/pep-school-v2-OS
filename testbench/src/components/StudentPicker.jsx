import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where, limit as firestoreLimit } from "firebase/firestore";
import { db } from "../firebase.js";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

import { resolveInitialState } from "../utils/studentPickerHelpers.js";

/**
 * StudentPicker — prop-driven student selector.
 *
 * Props:
 * - scope: "hardcoded" | "program" | "school-wide"
 * - defaults: initial student list (for hardcoded/program scopes)
 * - programFilter: program ID for program-scoped "Load more" fetch
 * - onSelect(student | null): callback when student is picked
 * - renderOptionExtra(student): optional render function for extra content in option rows
 */
export default function StudentPicker({ scope = "program", defaults, programFilter, onSelect, renderOptionExtra }) {
  const initial = resolveInitialState({ scope, defaults });
  const [students, setStudents] = useState(initial.students);
  const [allStudents, setAllStudents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [canLoadMore, setCanLoadMore] = useState(initial.canLoadMore);
  const [loadedMore, setLoadedMore] = useState(false);

  // Fetch all students for school-wide scope
  useEffect(() => {
    if (scope !== "school-wide" || allStudents) return;
    loadAllStudents();
  }, [scope]);

  async function loadAllStudents() {
    setLoading(true);
    try {
      const classroomsSnap = await getDocs(collection(db, "classrooms"));
      const classroomMap = {};
      for (const d of classroomsSnap.docs) {
        classroomMap[d.id] = { name: d.data().name || d.id, programId: d.data().programId };
      }

      const studentsSnap = await getDocs(collection(db, "students"));
      const all = [];
      for (const d of studentsSnap.docs) {
        const data = d.data();
        if (data.status === "graduated") continue;
        all.push({
          id: d.id,
          displayName: data.displayName || d.id,
          classroomId: data.classroomId || "",
          classroomName: classroomMap[data.classroomId]?.name || data.classroomId || "",
        });
      }
      all.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setAllStudents(all);
      setStudents(all);
    } catch (err) {
      console.error("Failed to load all students:", err);
      setLoadError("Failed to load students — check permissions or network");
    } finally {
      setLoading(false);
    }
  }

  // Re-initialize for non-school-wide scopes when defaults or programFilter changes
  useEffect(() => {
    if (scope === "school-wide") return;
    setStudents(defaults || []);
    setCanLoadMore(scope === "program");
    setLoadedMore(false);
    onSelect(null);
  }, [scope, programFilter]);

  const loadMore = useCallback(async () => {
    if (scope !== "program" || loadedMore) return;
    setLoading(true);

    try {
      const program = programFilter || "primary";
      const currentIds = new Set(students.map((s) => s.id));

      const classroomsSnap = await getDocs(collection(db, "classrooms"));
      const classroomMap = {};
      for (const d of classroomsSnap.docs) {
        const data = d.data();
        if (data.programId === program) {
          classroomMap[d.id] = { name: data.name || d.id, programId: data.programId };
        }
      }

      const classroomIds = Object.keys(classroomMap);
      const extra = [];

      for (const cid of classroomIds) {
        if (extra.length >= 5) break;
        const studentsSnap = await getDocs(
          query(collection(db, "students"), where("classroomId", "==", cid), firestoreLimit(10))
        );
        for (const studentDoc of studentsSnap.docs) {
          if (currentIds.has(studentDoc.id)) continue;
          const data = studentDoc.data();
          if (data.status === "graduated") continue;
          extra.push({
            id: studentDoc.id,
            displayName: data.displayName || studentDoc.id,
            classroomId: cid,
            classroomName: classroomMap[cid]?.name || cid,
          });
          if (extra.length >= 5) break;
        }
      }

      setStudents((prev) => [...prev, ...extra]);
      setLoadedMore(true);
      setCanLoadMore(false);
    } catch (err) {
      console.error("Failed to load more students:", err);
    } finally {
      setLoading(false);
    }
  }, [students, programFilter, scope, loadedMore]);

  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
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
      {canLoadMore && scope === "program" && (
        <Button size="small" onClick={loadMore} disabled={loading} sx={{ mt: 0.5, whiteSpace: "nowrap" }}>
          {loading ? "Loading..." : "Load more"}
        </Button>
      )}
    </Box>
  );
}
