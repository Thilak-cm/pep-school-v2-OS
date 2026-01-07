import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  CircularProgress,
  Divider,
  Avatar
} from '@mui/material';
import {
  WarningAmber as WarningIcon,
  ErrorOutline,
  CheckCircleOutline
} from '@mui/icons-material';
import { collectionGroup, query, where, getDocs, doc, getDoc, documentId } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { prepareNotificationsFeature } from '../utils/notificationsFeature';
import NewFeaturePill from './NewFeaturePill';

function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [signals, setSignals] = useState([]);
  const [currentRole, setCurrentRole] = useState(null);
  const [studentNames, setStudentNames] = useState({});

  useEffect(() => {
    prepareNotificationsFeature();
  }, []);

  useEffect(() => {
    let active = true;
    const loadRole = async () => {
      try {
        const uid = auth?.currentUser?.uid;
        if (!uid) return;
        const snap = await getDoc(doc(db, 'users', uid));
        if (!active) return;
        setCurrentRole(snap.exists() ? (snap.data()?.role || null) : null);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load user role', err);
      }
    };
    loadRole();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchSignals = async () => {
      try {
        const uid = auth?.currentUser?.uid;
        if (!uid) {
          setLoading(false);
          return;
        }
        if (currentRole && currentRole !== 'superadmin') {
          setSignals([]);
          setLoading(false);
          return;
        }

        const signalsQuery = query(collectionGroup(db, 'ai_summaries'));
        const snapshot = await getDocs(signalsQuery);
        if (!active) return;

        const rows = snapshot.docs
          .filter((d) => d.id === 'signals')
          .map((d) => {
            const studentId = d.ref.parent?.parent?.id || null;
            return { id: d.id, studentId, ...(d.data() || {}) };
          });
        setSignals(rows);

        // Fetch student names (superadmin only) for display
        const ids = rows.map((r) => r.studentId).filter(Boolean);
        const uniqueIds = Array.from(new Set(ids));
        const nameEntries = await Promise.all(uniqueIds.map(async (sid) => {
          try {
            const sSnap = await getDoc(doc(db, 'students', sid));
            if (!sSnap.exists()) return [sid, sid];
            const s = sSnap.data() || {};
            const label = s.displayName || s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || sid;
            return [sid, label];
          } catch (e) {
            return [sid, sid];
          }
        }));
        setStudentNames(Object.fromEntries(nameEntries));
      } catch (err) {
        console.error('Failed to load signals', err);
        setError('Failed to load notifications.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchSignals();
    return () => { active = false; };
  }, [currentRole]);

  const severityCounts = signals.reduce((acc, s) => {
    const sev = s?.redFlag?.severity || null;
    if (s.status !== 'ok' || !sev) return acc;
    acc[sev] = (acc[sev] || 0) + 1;
    return acc;
  }, { low: 0, medium: 0, high: 0 });

  const gapsList = signals.filter((s) => s.status === 'ok' && Array.isArray(s.coverageGaps) && s.coverageGaps.length > 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Paper
        elevation={0}
        sx={{
          p: 3,
          backgroundColor: 'white',
          borderRadius: 2,
          border: '1px solid #e2e8f0'
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b' }}>
            Notifications
          </Typography>
          {loading && <CircularProgress size={20} />}
        </Stack>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
          Student signals (weekly). Super admins only for now.
        </Typography>

        {error && currentRole === 'superadmin' && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2 }}>
            <ErrorOutline color="error" fontSize="small" />
            <Typography variant="body2" color="error">{error}</Typography>
          </Stack>
        )}

        {!loading && currentRole !== 'superadmin' && (
          <Box sx={{ mt: 2 }}>
            <NewFeaturePill label="New notifications page coming soon!" />
          </Box>
        )}

        {!error && !loading && currentRole === 'superadmin' && (
          <Stack spacing={2} sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip icon={<WarningIcon />} label={`High: ${severityCounts.high || 0}`} color="error" variant="outlined" />
              <Chip icon={<WarningIcon />} label={`Medium: ${severityCounts.medium || 0}`} color="warning" variant="outlined" />
              <Chip icon={<WarningIcon />} label={`Low: ${severityCounts.low || 0}`} variant="outlined" />
            </Stack>

            <Divider />

            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Coverage gaps
            </Typography>
            {gapsList.length === 0 ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircleOutline sx={{ color: '#22c55e' }} />
                <Typography variant="body2" sx={{ color: '#16a34a' }}>
                  No coverage gaps detected in the latest run.
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {gapsList.map((item) => (
                  <Paper
                    key={item.studentId}
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 2, borderColor: '#e2e8f0' }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
                      <Avatar sx={{ width: 36, height: 36, bgcolor: '#6366f1' }}>
                        {studentNames[item.studentId]?.[0]?.toUpperCase?.() || '?'}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 180 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                          {studentNames[item.studentId] || item.studentId}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          Gaps: {item.coverageGaps.join(', ')}
                        </Typography>
                      </Box>
                      {item.redFlag?.severity && (
                        <Chip
                          label={`Flag: ${item.redFlag.severity}`}
                          size="small"
                          color={
                            item.redFlag.severity === 'high'
                              ? 'error'
                              : item.redFlag.severity === 'medium'
                                ? 'warning'
                                : 'default'
                          }
                        />
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}

export default NotificationsPage;
