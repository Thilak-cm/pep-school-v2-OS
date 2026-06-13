// BroadcastDesk.jsx — Manage-first desk page: status tabs, card list
// The app header (AppHeader.jsx) handles back chevron + "Broadcasts" title.
// This component renders the + New button, segmented tabs, and card list.

import React, { useState, useMemo } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { Plus } from '../../icons';
import BroadcastCard from './BroadcastCard';
import { classifyBroadcast } from './broadcastUtils';

const TABS = ['live', 'scheduled', 'done'];
const TAB_LABELS = { live: 'Live', scheduled: 'Scheduled', done: 'Done' };

export default function BroadcastDesk({
  broadcasts,
  classrooms,
  onNewBroadcast,
  onSelectBroadcast,
}) {
  const [activeTab, setActiveTab] = useState('live');

  // Classify broadcasts into status buckets
  const buckets = useMemo(() => {
    const result = { live: [], scheduled: [], done: [] };
    for (const b of broadcasts) {
      const status = classifyBroadcast(b);
      result[status].push(b);
    }
    // Sort live by priority (lower = higher), scheduled by startsAt, done by expiresAt desc
    result.live.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3));
    result.scheduled.sort((a, b) => {
      const ta = a.startsAt?.toMillis?.() || a.startsAt?.seconds * 1000 || 0;
      const tb = b.startsAt?.toMillis?.() || b.startsAt?.seconds * 1000 || 0;
      return ta - tb;
    });
    result.done.sort((a, b) => {
      const ta = a.expiresAt?.toMillis?.() || a.expiresAt?.seconds * 1000 || 0;
      const tb = b.expiresAt?.toMillis?.() || b.expiresAt?.seconds * 1000 || 0;
      return tb - ta;
    });
    return result;
  }, [broadcasts]);

  const currentList = buckets[activeTab] || [];

  return (
    <Box sx={{ pb: 4 }}>
      {/* ── + New pill (top-right aligned) ── */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 0.5, mb: 1.5 }}>
        <Button
          variant="contained"
          size="small"
          onClick={onNewBroadcast}
          startIcon={<Plus size={16} />}
          sx={{
            borderRadius: '999px', textTransform: 'none',
            fontWeight: 700, fontSize: '0.8rem',
            px: 1.75, py: 0.6,
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          }}
        >
          New
        </Button>
      </Box>

      {/* ── Status tabs (segmented control) ── */}
      <Box sx={{ mb: 2 }}>
        <Box sx={{
          display: 'flex',
          backgroundColor: 'var(--color-surface, #f1f3f7)',
          borderRadius: '10px', p: '3px',
        }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab;
            const count = buckets[tab].length;
            return (
              <Box
                key={tab}
                onClick={() => setActiveTab(tab)}
                sx={{
                  flex: 1, textAlign: 'center',
                  py: 0.75, borderRadius: '7px',
                  cursor: 'pointer',
                  fontWeight: 600, fontSize: '0.8rem',
                  transition: 'all 0.2s ease',
                  ...(isActive
                    ? {
                      backgroundColor: '#fff',
                      color: 'var(--color-text)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }
                    : {
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-faint)',
                    }),
                }}
              >
                {TAB_LABELS[tab]} · {count}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* ── Card list ── */}
      <Box>
        {currentList.length === 0 && (
          <Box sx={{ py: 6, textAlign: 'center', color: 'var(--color-text-faint)' }}>
            <Typography sx={{ fontSize: '0.9rem' }}>
              {activeTab === 'live' && 'No live broadcasts. Tap + New to send one.'}
              {activeTab === 'scheduled' && 'No scheduled broadcasts.'}
              {activeTab === 'done' && 'No past broadcasts.'}
            </Typography>
          </Box>
        )}

        {currentList.map(broadcast => (
          <BroadcastCard
            key={broadcast.id}
            broadcast={broadcast}
            classrooms={classrooms}
            onClick={() => onSelectBroadcast(broadcast)}
          />
        ))}
      </Box>
    </Box>
  );
}
