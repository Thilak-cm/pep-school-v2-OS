import { useState, useEffect, useCallback } from "react";
import { collection, getDocs, query, where, limit as firestoreLimit } from "firebase/firestore";
import { db } from "../firebase.js";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";

// Top 5 students by handwritten media count (from Firestore media stats, April 2026)
const HANDWRITING_DEFAULTS = [
  { id: "2025-GUL-030", displayName: "Sudarshan", classroomId: "gulmohar", classroomName: "Gulmohar", handwrittenCount: 9 },
  { id: "2025-GUL-003", displayName: "Akshleena Mishra", classroomId: "gulmohar", classroomName: "Gulmohar", handwrittenCount: 6 },
  { id: "2025-GUL-017", displayName: "Kartik Maheshwari", classroomId: "gulmohar", classroomName: "Gulmohar", handwrittenCount: 4 },
  { id: "2025-PER-003", displayName: "Anagha Mandyam", classroomId: "periwinkle", classroomName: "Periwinkle", handwrittenCount: 4 },
  { id: "2025-GUL-021", displayName: "Nuha Rao", classroomId: "gulmohar", classroomName: "Gulmohar", handwrittenCount: 4 },
];

// 2 students per program with most observation data
const SOUL_DEFAULTS_BY_PROGRAM = {
  toddler: [
    { id: "2026-PAR-006", displayName: "Dhyan J", classroomId: "parijat", classroomName: "Parijat" },
    { id: "2025-PAR-016", displayName: "Navisha Yadav", classroomId: "parijat", classroomName: "Parijat" },
  ],
  primary: [
    { id: "2025-PER-006", displayName: "Atharv Choubey", classroomId: "periwinkle", classroomName: "Periwinkle" },
    { id: "2025-GUL-017", displayName: "Kartik Maheshwari", classroomId: "gulmohar", classroomName: "Gulmohar" },
  ],
  elementary: [
    { id: "2025-POW-005", displayName: "Abhignya Girish", classroomId: "power", classroomName: "Power" },
    { id: "2025-POW-003", displayName: "Aaron Neil", classroomId: "power", classroomName: "Power" },
  ],
  adolescent: [
    { id: "2026-AED-016", displayName: "Riaan Das", classroomId: "aedon", classroomName: "Aedon" },
    { id: "2026-AED-002", displayName: "Divyaan Harlalka", classroomId: "aedon", classroomName: "Aedon" },
  ],
};

export default function StudentPicker({ featureId, onSelect, programFilter }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(true);
  const [loadedMore, setLoadedMore] = useState(false);

  const isHandwriting = featureId === "handwriting_analysis";


  // Load defaults immediately — no Firestore queries needed
  useEffect(() => {
    if (isHandwriting) {
      setStudents(HANDWRITING_DEFAULTS);
      setCanLoadMore(false); // handwriting is fixed to top 5, no load more
    } else {
      const program = programFilter || "primary";
      setStudents(SOUL_DEFAULTS_BY_PROGRAM[program] || []);
      setCanLoadMore(true);
      setLoadedMore(false);
    }
    onSelect(null);
  }, [featureId, programFilter]);

  const loadMore = useCallback(async () => {
    if (isHandwriting || loadedMore) return;
    setLoading(true);

    try {
      const program = programFilter || "primary";
      const currentIds = new Set(students.map((s) => s.id));

      // Build classroom lookup for this program
      const classroomsSnap = await getDocs(collection(db, "classrooms"));
      const classroomMap = {};
      for (const doc of classroomsSnap.docs) {
        const data = doc.data();
        if (data.programId === program) {
          classroomMap[doc.id] = { name: data.name || doc.id, programId: data.programId };
        }
      }

      // Fetch students from matching classrooms
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
  }, [students, programFilter, isHandwriting, loadedMore]);

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
              {isHandwriting && (
                <Chip
                  label={`${s.handwrittenCount} handwritten images`}
                  size="small"
                  color="success"
                  variant="filled"
                />
              )}
            </Box>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Select Student"
            placeholder="Search students..."
            size="small"
          />
        )}
        sx={{ minWidth: 280 }}
      />
      {canLoadMore && !isHandwriting && (
        <Button size="small" onClick={loadMore} disabled={loading} sx={{ mt: 0.5, whiteSpace: "nowrap" }}>
          {loading ? "Loading..." : "Load more"}
        </Button>
      )}
    </Box>
  );
}
