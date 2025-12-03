import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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

const MIRROR_STYLE_PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'textTransform',
  'textAlign',
  'lineHeight',
];

const getMentionCoordinates = (textarea, index) => {
  if (typeof window === 'undefined' || !textarea) return null;

  const rect = textarea.getBoundingClientRect();
  const doc = textarea.ownerDocument;
  const mirror = doc.createElement('div');
  const computed = window.getComputedStyle(textarea);

  MIRROR_STYLE_PROPS.forEach((prop) => {
    mirror.style[prop] = computed[prop];
  });

  mirror.style.position = 'absolute';
  mirror.style.top = `${rect.top + window.scrollY}px`;
  mirror.style.left = `${rect.left + window.scrollX}px`;
  mirror.style.height = `${rect.height}px`;
  mirror.style.width = `${rect.width}px`;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  mirror.style.visibility = 'hidden';

  mirror.textContent = textarea.value.slice(0, index);
  const marker = doc.createElement('span');
  marker.textContent = '@';
  mirror.appendChild(marker);

  doc.body.appendChild(mirror);
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
  const markerRect = marker.getBoundingClientRect();
  doc.body.removeChild(mirror);

  return markerRect;
};

const getCaretRect = (textarea, index) => {
  if (typeof window === 'undefined' || !textarea) return null;

  const rect = textarea.getBoundingClientRect();
  const doc = textarea.ownerDocument;
  const mirror = doc.createElement('div');
  const computed = window.getComputedStyle(textarea);

  MIRROR_STYLE_PROPS.forEach((prop) => {
    mirror.style[prop] = computed[prop];
  });

  mirror.style.position = 'absolute';
  mirror.style.top = `${rect.top + window.scrollY}px`;
  mirror.style.left = `${rect.left + window.scrollX}px`;
  mirror.style.height = `${rect.height}px`;
  mirror.style.width = `${rect.width}px`;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';
  mirror.style.visibility = 'hidden';

  mirror.textContent = textarea.value.slice(0, index);
  const marker = doc.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);

  doc.body.appendChild(mirror);
  mirror.scrollTop = textarea.scrollTop;
  mirror.scrollLeft = textarea.scrollLeft;
  const markerRect = marker.getBoundingClientRect();
  doc.body.removeChild(mirror);

  return markerRect;
};

const findScrollableParent = (node) => {
  if (typeof window === 'undefined') return null;
  let el = node?.parentElement || null;
  while (el) {
    const style = window.getComputedStyle(el);
    const overflowY = style.getPropertyValue('overflow-y');
    const canScroll =
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight;
    if (canScroll) return el;
    el = el.parentElement;
  }
  return window;
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
  const [mentionAnchor, setMentionAnchor] = useState(null);

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

  const updateMentionPosition = useCallback(() => {
    if (!activeMention || !inputRef.current) {
      setMentionAnchor(null);
      return;
    }

    const coords = getMentionCoordinates(inputRef.current, activeMention.start);
    if (!coords) {
      setMentionAnchor(null);
      return;
    }

    const top = coords.top + coords.height;
    const left = coords.left;
    const virtualEl = {
      getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        top,
        bottom: top,
        left,
        right: left,
        x: left,
        y: top,
        toJSON: () => {},
      }),
    };
    setMentionAnchor(virtualEl);
  }, [activeMention]);

  const handleTextChange = (e) => {
    const nextText = e.target.value;
    const caret = e.target.selectionStart;
    const mention = findActiveMention(nextText, caret);
    setActiveMention(mention);
    onChange(nextText);
    requestAnimationFrame(() => ensureCaretVisible());
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

  useEffect(() => {
    updateMentionPosition();
  }, [activeMention, value, updateMentionPosition]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return undefined;
    const handleScroll = () => updateMentionPosition();
    textarea.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);
    return () => {
      textarea.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [updateMentionPosition]);

  const ensureCaretVisible = useCallback(() => {
    if (typeof window === 'undefined') return;
    const textarea = inputRef.current;
    if (!textarea) return;
    const caretIndex = typeof textarea.selectionStart === 'number'
      ? textarea.selectionStart
      : (value || '').length;
    const caretRect = getCaretRect(textarea, caretIndex);
    if (!caretRect) return;

    const scrollContainer = findScrollableParent(textarea);
    if (!scrollContainer) return;

    const preferredTopRatio = 0.25;
    const preferredBottomRatio = 0.75;

    if (scrollContainer === window) {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const preferredTop = viewportHeight * preferredTopRatio;
      const preferredBottom = viewportHeight * preferredBottomRatio;
      let delta = 0;
      if (caretRect.bottom > preferredBottom) {
        delta = caretRect.bottom - preferredBottom;
      } else if (caretRect.top < preferredTop) {
        delta = caretRect.top - preferredTop;
      }
      if (delta !== 0) {
        window.scrollBy({ top: delta, behavior: 'smooth' });
      }
      return;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const caretTop = caretRect.top - containerRect.top + scrollContainer.scrollTop;
    const caretBottom = caretRect.bottom - containerRect.top + scrollContainer.scrollTop;
    const preferredTop = scrollContainer.scrollTop + scrollContainer.clientHeight * preferredTopRatio;
    const preferredBottom = scrollContainer.scrollTop + scrollContainer.clientHeight * preferredBottomRatio;

    let delta = 0;
    if (caretBottom > preferredBottom) {
      delta = caretBottom - preferredBottom;
    } else if (caretTop < preferredTop) {
      delta = caretTop - preferredTop;
    }

    if (delta !== 0) {
      const nextTop = Math.max(0, scrollContainer.scrollTop + delta);
      scrollContainer.scrollTo({ top: nextTop, behavior: 'smooth' });
    }
  }, [value]);

  const handleCaretMove = () => {
    requestAnimationFrame(() => ensureCaretVisible());
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
        onKeyUp={handleCaretMove}
        onClick={handleCaretMove}
        onFocus={handleCaretMove}
        onSelect={handleCaretMove}
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
        anchorEl={mentionAnchor || inputRef.current}
        placement="bottom-start"
        style={{ zIndex: 1300 }}
        modifiers={[
          { name: 'offset', options: { offset: [0, 6] } },
          { name: 'preventOverflow', options: { padding: 8 } },
        ]}
      >
        <Paper
          elevation={3}
          sx={{
            mt: 0.5,
            minWidth: 220,
            maxWidth: 260,
            maxHeight: 220,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
          }}
        >
          <List dense>
            {filteredOptions.map((student, idx) => (
              <ListItemButton
                key={student.id}
                selected={idx === highlightIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelectStudent(student)}
                sx={{ py: 0.75, px: 1.5 }}
              >
                <ListItemText
                  primary={student.fullName}
                  primaryTypographyProps={{
                    fontWeight: idx === highlightIndex ? 700 : 600,
                    fontSize: '0.95rem',
                  }}
                  secondary={student.classroom_name || student.classroomName || ''}
                  secondaryTypographyProps={{
                    fontSize: '0.8rem',
                    color: 'text.secondary',
                  }}
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
