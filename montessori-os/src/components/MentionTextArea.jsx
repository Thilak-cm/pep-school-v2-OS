import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  TextField,
  Popper,
  Paper,
  List,
  ListItemButton,
  ListItemText
} from '@mui/material';

const findActiveMention = (text, caretIndex) => {
  const prefix = text.slice(0, caretIndex);
  const atIndex = prefix.lastIndexOf('@');
  if (atIndex === -1) return null;

  if (atIndex > 0 && !/\s/.test(prefix[atIndex - 1])) return null;

  const query = prefix.slice(atIndex + 1);
  if (query.includes(' ')) return null;

  return { query, start: atIndex, end: caretIndex };
};

function MentionTextArea({
  value,
  onChange,
  placeholder = 'Use @ to tag students quickly',
  students = [],
  tags = [],
  onTagsChange = () => {}
}) {
  const inputRef = useRef(null);
  const [activeMention, setActiveMention] = useState(null);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const filteredOptions = useMemo(() => {
    if (!activeMention) return [];
    const q = activeMention.query.toLowerCase();
    return students
      .filter((stu) => stu.fullName.toLowerCase().includes(q) || stu.firstName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [activeMention, students]);

  useEffect(() => {
    if (!activeMention || filteredOptions.length === 0) {
      setHighlightIndex(0);
    } else if (highlightIndex >= filteredOptions.length) {
      setHighlightIndex(0);
    }
  }, [activeMention, filteredOptions.length, highlightIndex]);

  const handleTextChange = (e) => {
    const nextText = e.target.value;
    const caret = e.target.selectionStart;
    const mention = findActiveMention(nextText, caret);
    setActiveMention(mention);
    onChange(nextText);
  };

  const closeMention = () => {
    setActiveMention(null);
    setHighlightIndex(0);
  };

  const handleSelectStudent = (student) => {
    if (!activeMention) return;
    const before = value.slice(0, activeMention.start);
    const after = value.slice(activeMention.end);
    const insertText = student.fullName;
    const spaced = `${before}${insertText} ${after}`;
    const nextCaret = (before + insertText + ' ').length;

    onChange(spaced);
    closeMention();

    if (!tags.some((t) => t.id === student.id)) {
      onTagsChange([...tags, { id: student.id, fullName: student.fullName, firstName: student.firstName }]);
    }

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(nextCaret, nextCaret);
      }
    });
  };

  const handleKeyDown = (e) => {
    if (!activeMention || filteredOptions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % filteredOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + filteredOptions.length) % filteredOptions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleSelectStudent(filteredOptions[highlightIndex] || filteredOptions[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMention();
    }
  };

  return (
    <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 1 }}>
      <TextField
        inputRef={inputRef}
        multiline
        rows={6}
        fullWidth
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        variant="outlined"
        sx={{
          '& .MuiOutlinedInput-root': {
            borderRadius: 2,
          }
        }}
      />
      <Popper
        open={!!activeMention && filteredOptions.length > 0}
        anchorEl={inputRef.current}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
      >
        <Paper elevation={3} sx={{ mt: 0.5, minWidth: 260 }}>
          <List dense>
            {filteredOptions.map((student, idx) => (
              <ListItemButton
                key={student.id}
                selected={idx === highlightIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectStudent(student)}
              >
                <ListItemText
                  primary={student.fullName}
                  secondary={student.classroom_name || student.classroomName || ''}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      </Popper>
    </Box>
  );
}

export default MentionTextArea;
