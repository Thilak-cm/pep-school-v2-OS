// BroadcastComposer.jsx — Thin wrapper managing sub-views for the Broadcasts screen
// Routes between: Desk (list), Compose (create/edit), Detail (receipts)

import React, { useEffect, useState, useCallback } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { listBroadcasts } from '../services/broadcastService';
import { isSuperAdmin } from '../utils/roleUtils';
import useNotify from '../notifications/useNotify';
import BroadcastDesk from './broadcasts/BroadcastDesk';
import BroadcastCompose from './broadcasts/BroadcastCompose';
import BroadcastDetail from './broadcasts/BroadcastDetail';
import { userDisplayName } from './broadcasts/broadcastUtils';

export default function BroadcastComposer({ currentUser, userRole }) {
  const [broadcasts, setBroadcasts] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const notify = useNotify();

  // Sub-view state: 'desk' | 'compose' | 'detail'
  const [view, setView] = useState('desk');
  const [selectedBroadcast, setSelectedBroadcast] = useState(null);
  const [editingBroadcast, setEditingBroadcast] = useState(null);

  const isSuperAdminUser = isSuperAdmin(userRole);

  // ── Load data ──────────────────────────────────────────────────────────

  const loadBroadcasts = useCallback(async () => {
    try {
      const list = await listBroadcasts();
      setBroadcasts(list);
    } catch {
      notify.error('Failed to load broadcasts');
    }
  }, [notify]);

  useEffect(() => {
    if (!isSuperAdminUser) return;

    const load = async () => {
      setLoading(true);
      await loadBroadcasts();

      // Load classrooms for audience picker
      try {
        const snap = await getDocs(query(collection(db, 'classrooms'), where('status', '==', 'active')));
        setClassrooms(snap.docs.map(d => {
          const data = d.data() || {};
          return { id: d.id, name: data.name || d.id, teacherIds: data.teacherIds || [] };
        }));
      } catch {
        // Non-critical
      }

      // Load all users for audience picker + receipts
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) }));
        list.sort((a, b) => userDisplayName(a).localeCompare(userDisplayName(b)));
        setTeachers(list);
      } catch {
        // Non-critical
      }

      setLoading(false);
    };
    load();
  }, [isSuperAdminUser, loadBroadcasts]);

  // ── Navigation handlers ────────────────────────────────────────────────

  const handleNewBroadcast = () => {
    setEditingBroadcast(null);
    setView('compose');
  };

  const handleSelectBroadcast = (broadcast) => {
    setSelectedBroadcast(broadcast);
    setView('detail');
  };

  const handleEditBroadcast = (broadcast) => {
    setEditingBroadcast(broadcast);
    setView('compose');
  };

  const handleComposeClose = async (didSave) => {
    setView(selectedBroadcast ? 'detail' : 'desk');
    setEditingBroadcast(null);
    if (didSave) {
      await loadBroadcasts();
      // If we came from detail, refresh the selected broadcast
      if (selectedBroadcast) {
        const updated = (await listBroadcasts()).find(b => b.id === selectedBroadcast.id);
        if (updated) setSelectedBroadcast(updated);
      }
    }
  };

  const handleDetailClose = () => {
    setSelectedBroadcast(null);
    setView('desk');
  };

  const handleBroadcastChanged = async () => {
    await loadBroadcasts();
    // Refresh selected broadcast if still viewing detail
    if (selectedBroadcast) {
      const updated = (await listBroadcasts()).find(b => b.id === selectedBroadcast.id);
      if (updated) setSelectedBroadcast(updated);
      else handleDetailClose(); // Broadcast was deleted
    }
  };

  // ── Access guard ──────────────────────────────────────────────────────

  if (!isSuperAdminUser) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <span style={{ color: 'var(--color-error)' }}>Superadmin access required</span>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <>
      <BroadcastDesk
        broadcasts={broadcasts}
        classrooms={classrooms}
        onNewBroadcast={handleNewBroadcast}
        onSelectBroadcast={handleSelectBroadcast}
      />

      <BroadcastCompose
        open={view === 'compose'}
        onClose={handleComposeClose}
        editingBroadcast={editingBroadcast}
        broadcasts={broadcasts}
        classrooms={classrooms}
        teachers={teachers}
        currentUser={currentUser}
      />

      <BroadcastDetail
        open={view === 'detail'}
        broadcast={selectedBroadcast}
        onClose={handleDetailClose}
        onEdit={handleEditBroadcast}
        onBroadcastChanged={handleBroadcastChanged}
        teachers={teachers}
        classrooms={classrooms}
      />
    </>
  );
}
