import React from 'react';
import ClassroomNoteCard from './ClassroomNoteCard';

export default function GroupedMediaCard({ note, onNoteClick, ...props }) {
  return (
    <ClassroomNoteCard
      {...props}
      note={note}
      onNoteClick={onNoteClick}
    />
  );
}
