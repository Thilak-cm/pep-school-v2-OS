import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase.js";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

export default function StudentPicker({ featureId, onSelect, programFilter }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStudents();
  }, [featureId, programFilter]);

  async function loadStudents() {
    setLoading(true);

    // Load all students from all classrooms
    const classroomsSnap = await getDocs(collection(db, "classrooms"));
    const allStudents = [];

    for (const classroomDoc of classroomsSnap.docs) {
      const classroomId = classroomDoc.id;
      const classroomData = classroomDoc.data();
      const programId = classroomData.programId || null;

      // If we have a program filter, skip non-matching classrooms
      if (programFilter && programId !== programFilter) continue;

      const studentsSnap = await getDocs(collection(db, "classrooms", classroomId, "students"));
      for (const studentDoc of studentsSnap.docs) {
        const data = studentDoc.data();
        if (data.status === "graduated") continue;
        allStudents.push({
          id: studentDoc.id,
          displayName: data.displayName || studentDoc.id,
          classroomId,
          programId,
          classroomName: classroomData.name || classroomId,
        });
      }
    }

    // For handwriting analysis, enrich with handwritten media counts
    if (featureId === "handwriting_analysis") {
      await enrichWithHandwrittenCounts(allStudents);
      // Sort by handwritten count descending
      allStudents.sort((a, b) => (b.handwrittenCount || 0) - (a.handwrittenCount || 0));
    } else {
      allStudents.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    setStudents(allStudents);
    setLoading(false);
  }

  async function enrichWithHandwrittenCounts(studentList) {
    // Batch load handwritten counts from students/{id}/media where handwritten=true
    for (const student of studentList) {
      try {
        const mediaQuery = query(
          collection(db, "students", student.id, "media"),
          where("handwritten", "==", true)
        );
        const snap = await getDocs(mediaQuery);
        student.handwrittenCount = snap.size;
      } catch {
        student.handwrittenCount = 0;
      }
    }
  }

  return (
    <Autocomplete
      options={students}
      loading={loading}
      getOptionLabel={(s) => s.displayName}
      onChange={(_, value) => onSelect(value)}
      renderOption={(props, s) => {
        const { key, ...rest } = props;
        return (
          <Box component="li" key={key} {...rest} sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
            <Box>
              <Typography variant="body2">{s.displayName}</Typography>
              <Typography variant="caption" color="text.secondary">{s.classroomName}</Typography>
            </Box>
            {featureId === "handwriting_analysis" && (
              <Chip
                label={`${s.handwrittenCount || 0} hw`}
                size="small"
                color={s.handwrittenCount >= 3 ? "success" : "default"}
                variant={s.handwrittenCount >= 3 ? "filled" : "outlined"}
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
  );
}
