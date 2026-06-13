// BroadcastAudiencePicker.jsx — Unified audience picker (Classrooms + Users toggles)
// Opens as a modal Dialog. Classrooms and Users shown as collapsible toggle sections.

import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Button, Dialog,
  Checkbox, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  TextField,
} from '@mui/material';
import { X, Search, Users, ChevronDown, ChevronUp } from '../../icons';
import { userDisplayName, computeReach } from './broadcastUtils';

export default function BroadcastAudiencePicker({
  open,
  onClose,
  classrooms = [],
  teachers = [],
  initialClassrooms = [],
  initialTeachers = [],
  onConfirm,
}) {
  const [selectedClassrooms, setSelectedClassrooms] = useState(initialClassrooms);
  const [selectedTeachers, setSelectedTeachers] = useState(initialTeachers);
  const [searchQuery, setSearchQuery] = useState('');
  const [showClassrooms, setShowClassrooms] = useState(false);
  const [showUsers, setShowUsers] = useState(false);

  // Reset state when opening
  React.useEffect(() => {
    if (open) {
      setSelectedClassrooms(initialClassrooms);
      setSelectedTeachers(initialTeachers);
      setSearchQuery('');
      // Expand sections that have selections, otherwise expand both
      const hasCls = initialClassrooms.length > 0;
      const hasTch = initialTeachers.length > 0;
      setShowClassrooms(hasCls || !hasTch);
      setShowUsers(hasTch || !hasCls);
    }
  }, [open, initialClassrooms, initialTeachers]);

  const filteredTeachers = useMemo(() => {
    if (!searchQuery.trim()) return teachers;
    const q = searchQuery.toLowerCase();
    return teachers.filter(t => userDisplayName(t).toLowerCase().includes(q));
  }, [teachers, searchQuery]);

  const toggleClassroom = (id) => {
    setSelectedClassrooms(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleTeacher = (id) => {
    setSelectedTeachers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const reach = computeReach(selectedClassrooms, selectedTeachers, teachers, classrooms);
  const summary = selectedClassrooms.length === 0 && selectedTeachers.length === 0
    ? 'All staff' : `${reach} people selected`;

  const handleConfirm = () => {
    onConfirm(selectedClassrooms, selectedTeachers, reach);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: 3, mx: 2,
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          backgroundColor: 'var(--color-bg, #fff)',
        },
      }}
    >
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2, pt: 2, pb: 1, flexShrink: 0,
      }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>
          Select Audience
        </Typography>
        <Box onClick={onClose} sx={{ cursor: 'pointer', color: 'var(--color-text-soft)', display: 'flex' }}>
          <X size={20} />
        </Box>
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 1.5 }}>
        {/* ── Classrooms toggle section ── */}
        <SectionToggle
          label="CLASSROOMS"
          count={selectedClassrooms.length}
          expanded={showClassrooms}
          onToggle={() => setShowClassrooms(v => !v)}
        />
        {showClassrooms && (
          <List dense disablePadding sx={{ mb: 1 }}>
            {classrooms.map(c => (
              <ListItem key={c.id} disablePadding>
                <ListItemButton onClick={() => toggleClassroom(c.id)} dense sx={{ py: 0.4, borderRadius: '6px' }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <Checkbox
                      edge="start"
                      checked={selectedClassrooms.includes(c.id)}
                      disableRipple
                      size="small"
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={c.name}
                    primaryTypographyProps={{ fontSize: '0.85rem' }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {classrooms.length === 0 && (
              <Typography variant="caption" sx={{ px: 1, py: 1, color: 'var(--color-text-faint)', display: 'block' }}>
                No classrooms found
              </Typography>
            )}
          </List>
        )}

        {/* ── Users toggle section ── */}
        <SectionToggle
          label="USERS"
          count={selectedTeachers.length}
          expanded={showUsers}
          onToggle={() => setShowUsers(v => !v)}
        />
        {showUsers && (
          <>
            <Box sx={{ px: 0.5, pb: 0.75 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: <Search size={14} style={{ marginRight: 6, color: 'var(--color-text-faint)' }} />,
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '8px',
                    backgroundColor: 'var(--color-surface, #f8fafc)',
                    '& .MuiInputBase-input': { py: 0.75, fontSize: '0.82rem' },
                  },
                }}
              />
            </Box>
            <List dense disablePadding sx={{ maxHeight: 220, overflow: 'auto' }}>
              {filteredTeachers.map(t => (
                <ListItem key={t.id} disablePadding>
                  <ListItemButton onClick={() => toggleTeacher(t.id)} dense sx={{ py: 0.4, borderRadius: '6px' }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Checkbox
                        edge="start"
                        checked={selectedTeachers.includes(t.id)}
                        disableRipple
                        size="small"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={userDisplayName(t)}
                      primaryTypographyProps={{ fontSize: '0.85rem' }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {filteredTeachers.length === 0 && (
                <Typography variant="caption" sx={{ px: 1, py: 1, color: 'var(--color-text-faint)', display: 'block' }}>
                  No users found
                </Typography>
              )}
            </List>
          </>
        )}
      </Box>

      {/* Footer */}
      <Box sx={{
        px: 2, py: 1.5,
        borderTop: '1px solid var(--color-border)',
        flexShrink: 0,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center', mb: 1 }}>
          <Users size={14} style={{ color: 'var(--color-text-faint)' }} />
          <Typography sx={{ fontSize: '0.8rem', color: 'var(--color-text-soft)', fontWeight: 500 }}>
            {summary}
          </Typography>
        </Box>
        <Button
          variant="contained"
          fullWidth
          onClick={handleConfirm}
          sx={{
            borderRadius: '11px', textTransform: 'none',
            fontWeight: 700, py: 1,
            boxShadow: 'none',
          }}
        >
          Confirm · {reach} people
        </Button>
      </Box>
    </Dialog>
  );
}

// ── Section toggle header ────────────────────────────────────────────────────

function SectionToggle({ label, count, expanded, onToggle }) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 0.5, py: 0.75, cursor: 'pointer',
        borderRadius: '6px',
        '&:hover': { backgroundColor: 'rgba(0,0,0,0.02)' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Typography sx={{
          fontSize: '0.65rem', fontWeight: 700, letterSpacing: 1.5,
          textTransform: 'uppercase', color: 'var(--color-text-faint)',
        }}>
          {label}
        </Typography>
        {count > 0 && (
          <Box sx={{
            fontSize: '0.6rem', fontWeight: 700, color: 'var(--color-primary)',
            backgroundColor: 'var(--color-indigo-bg, rgba(79,70,229,0.08))',
            px: 0.75, py: 0.1, borderRadius: '4px',
          }}>
            {count}
          </Box>
        )}
      </Box>
      {expanded
        ? <ChevronUp size={16} style={{ color: 'var(--color-text-faint)' }} />
        : <ChevronDown size={16} style={{ color: 'var(--color-text-faint)' }} />
      }
    </Box>
  );
}
