import React, { useEffect, useState } from 'react';
import { Autocomplete, TextField, CircularProgress } from '@mui/material';
import { collection, getDocs, query, where, doc } from 'firebase/firestore';
import { db } from '../firebase';

/*
Props:
  selectedClassrooms: array of classroom IDs
  onClassroomsChange: (array) => void
  selectedStudents: array of student UIDs
  onStudentsChange: (array) => void
*/
function ClassroomStudentPicker({
  selectedClassrooms,
  onClassroomsChange,
  selectedStudents,
  onStudentsChange
}) {
  const [classrooms, setClassrooms] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingClassrooms, setLoadingClassrooms] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // fetch classrooms once
  useEffect(() => {
    (async () => {
      try {
        const qSnap = await getDocs(collection(db, 'classrooms'));
        const list = qSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setClassrooms(list);
      } catch (err) {
        console.error('fetch classrooms', err);
      } finally {
        setLoadingClassrooms(false);
      }
    })();
  }, []);

  // fetch students whenever classrooms selection changes
  useEffect(() => {
    if (!selectedClassrooms || selectedClassrooms.length === 0) {
      setStudents([]);
      return;
    }
    (async () => {
      setLoadingStudents(true);
      try {
        console.log('Fetching students for classrooms:', selectedClassrooms);
        
        // Convert string IDs to document references
        const classRefs = selectedClassrooms.slice(0, 10).map(classId => 
          doc(db, 'classrooms', classId)
        );
        
        const q = query(
          collection(db, 'students'),
          where('classroom_id', 'in', classRefs)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        
        console.log('Students query result:', {
          selectedClassrooms,
          studentsFound: list.length,
          students: list
        });
        
        setStudents(list);
      } catch (err) {
        console.error('fetch students', err);
        setStudents([]);
      } finally {
        setLoadingStudents(false);
      }
    })();
  }, [selectedClassrooms]);

  return (
    <>
      <Autocomplete
        multiple
        options={classrooms}
        getOptionLabel={(opt) => opt.name || ''}
        value={classrooms.filter((c) => selectedClassrooms.includes(c.id))}
        onChange={(_, newVal) => onClassroomsChange(newVal.map((c) => c.id))}
        loading={loadingClassrooms}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Select Classroom(s)"
            placeholder="Classrooms"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loadingClassrooms ? <CircularProgress color="inherit" size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              )
            }}
          />
        )}
        sx={{ mb: 3 }}
      />

      <Autocomplete
        multiple
        disabled={selectedClassrooms.length === 0}
        options={students}
        getOptionLabel={(opt) => opt.name || ''}
        value={students.filter((s) => selectedStudents.includes(s.id || s.uid))}
        onChange={(_, newVal) => onStudentsChange(newVal.map((s) => s.id || s.uid))}
        loading={loadingStudents}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Select Student(s)"
            placeholder="Students"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loadingStudents ? <CircularProgress color="inherit" size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              )
            }}
          />
        )}
      />
    </>
  );
}

export default ClassroomStudentPicker; 