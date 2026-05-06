import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Divider,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Snackbar,
  TextField as MuiTextField,
  Collapse
} from '@mui/material';
import { Search, Filter as FilterList, Pencil as Edit, Save, XCircle as Cancel, Bug as BugReport, Lightbulb, Paintbrush as Brush, Gauge as Speed, MessageCircle as Chat, User as Person, Clock as AccessTime, ShieldCheck as AdminPanelSettings, ChevronDown as ExpandMore, ChevronUp as ExpandLess } from '../icons';
import { formatTimestamp as formatDateWithTime } from '../utils/dateFormat';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { fuzzySearchFeedback } from '../utils/fuzzySearch';
import { isAdminRole, isSuperAdmin } from '../utils/roleUtils';

const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: 'Bug Report', icon: <BugReport /> },
  { value: 'feature', label: 'Feature Request', icon: <Lightbulb /> },
  { value: 'ui-ux', label: 'UI/UX', icon: <Brush /> },
  { value: 'performance', label: 'Performance', icon: <Speed /> },
  { value: 'general', label: 'General', icon: <Chat /> }
];

const STATUS_OPTIONS = [
  { value: 'new', label: 'New', color: 'primary' },
  { value: 'reviewed', label: 'Reviewed', color: 'info' },
  { value: 'implemented', label: 'Implemented', color: 'success' },
  { value: 'declined', label: 'Declined', color: 'error' }
];

function FeedbackTimeline({ currentUser, userRole }) {
  const [allFeedback, setAllFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const canView = isAdminRole(userRole);
  const canEdit = isSuperAdmin(userRole);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  
  // Collapse state for status groups (new is expanded by default, others collapsed)
  const [expandedStatuses, setExpandedStatuses] = useState({
    new: false,
    reviewed: true,
    implemented: false,
    declined: false
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Load all feedback
  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return undefined;
    }
    const q = query(
      collection(db, 'feedback'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feedbackList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllFeedback(feedbackList);
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use fuzzy search for better feedback matching
  const searchResults = fuzzySearchFeedback(allFeedback, searchQuery);
  
  // Apply additional filters after fuzzy search
  const filteredFeedback = searchResults.filter(feedback => {
    const matchesCategory = !categoryFilter || feedback.category === categoryFilter;
    const matchesStatus = !statusFilter || feedback.status === statusFilter;
    const matchesUser = !userFilter || feedback.userRole === userFilter;
    
    return matchesCategory && matchesStatus && matchesUser;
  });

  // Group feedback by status for organized display
  const groupedFeedback = filteredFeedback.reduce((groups, feedback) => {
    const status = feedback.status || 'new';
    if (!groups[status]) {
      groups[status] = [];
    }
    groups[status].push(feedback);
    return groups;
  }, {});

  // Define status order for display
  const statusOrder = ['new', 'reviewed', 'implemented', 'declined'];

  const handleFeedbackClick = (feedback) => {
    setSelectedFeedback(feedback);
    setAdminNotes(feedback.adminNotes || '');
    setStatus(feedback.status || 'new');
    setDetailDialogOpen(true);
    setEditing(false);
  };

  const handleCloseDialog = () => {
    setDetailDialogOpen(false);
    setSelectedFeedback(null);
    setEditing(false);
    setAdminNotes('');
    setStatus('');
  };

  const handleEditClick = () => {
    if (!canEdit) return;
    setEditing(true);
  };

  const handleSave = async () => {
    if (!selectedFeedback || !canEdit) return;

    try {
      setSaving(true);

      const updateData = {
        status: status,
        adminNotes: adminNotes.trim(),
        updatedAt: serverTimestamp(),
        lastReviewedBy: currentUser?.uid || 'unknown',
        lastReviewedAt: serverTimestamp()
      };

      await updateDoc(doc(db, 'feedback', selectedFeedback.id), updateData);

      setEditing(false);
      setSaving(false);
    } catch {
      alert('Error saving changes. Please try again.');
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setAdminNotes(selectedFeedback?.adminNotes || '');
    setStatus(selectedFeedback?.status || 'new');
  };

  const getCategoryIcon = (catValue) => {
    const category = FEEDBACK_CATEGORIES.find(c => c.value === catValue);
    return category ? category.icon : <Chat />;
  };

  const getCategoryLabel = (catValue) => {
    const category = FEEDBACK_CATEGORIES.find(c => c.value === catValue);
    return category ? category.label : 'General';
  };

  const getStatusColor = (statusValue) => {
    const status = STATUS_OPTIONS.find(s => s.value === statusValue);
    return status ? status.color : 'default';
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return formatDateWithTime(timestamp);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setCategoryFilter('');
    setStatusFilter('');
    setUserFilter('');
  };

  const hasActiveFilters = searchQuery || categoryFilter || statusFilter || userFilter;

  const toggleStatusGroup = (status) => {
    setExpandedStatuses(prev => ({
      ...prev,
      [status]: !prev[status]
    }));
  };

  if (!canView) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Access denied. Admin access required.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 8 }}>
      {/* Filter toggle button */}
      <Button
        variant={filtersOpen ? 'contained' : 'outlined'}
        size="small"
        onClick={() => setFiltersOpen(!filtersOpen)}
        startIcon={<FilterList />}
        endIcon={filtersOpen ? <ExpandLess /> : <ExpandMore />}
        sx={{ alignSelf: 'flex-start', textTransform: 'none', borderRadius: 2 }}
      >
        Filters{hasActiveFilters ? ` (${filteredFeedback.length})` : ''} · {allFeedback.length} total
      </Button>

      {/* Collapsible search and filters */}
      <Collapse in={filtersOpen} timeout="auto" unmountOnExit>
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Search */}
              <TextField
                fullWidth
                placeholder="Search feedback, user names, or emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: <Search style={{ marginRight: 8, color: 'var(--color-text-soft)' }} />
                }}
              />

              {/* Filter Row */}
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    label="Category"
                  >
                    <MenuItem value="">All Categories</MenuItem>
                    {FEEDBACK_CATEGORIES.map((cat) => (
                      <MenuItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    label="Status"
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    {STATUS_OPTIONS.map((status) => (
                      <MenuItem key={status.value} value={status.value}>
                        {status.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>User Role</InputLabel>
                  <Select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    label="User Role"
                  >
                    <MenuItem value="">All Users</MenuItem>
                    <MenuItem value="teacher">Teachers</MenuItem>
                    <MenuItem value="admin">Admins</MenuItem>
                  </Select>
                </FormControl>

                {hasActiveFilters && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={clearFilters}
                  >
                    Clear Filters
                  </Button>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      </Collapse>

      {/* Feedback List */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4, gap: 2, flexDirection: 'column' }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary">
            Coach Pepper is sorting through feedback...
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {statusOrder.map((status) => {
            const statusFeedback = groupedFeedback[status] || [];
            if (statusFeedback.length === 0) return null;
            
            const isExpanded = expandedStatuses[status];
            
            return (
              <Box key={status}>
                {/* Status Header as Toggle Button */}
                <Button
                  onClick={() => toggleStatusGroup(status)}
                  fullWidth
                  variant={isExpanded ? "contained" : "outlined"}
                  color={getStatusColor(status)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    py: 1.5,
                    px: 2,
                    mb: 2,
                    textTransform: 'none',
                    borderRadius: 2,
                    '&:hover': {
                      boxShadow: 2
                    }
                  }}
                  endIcon={isExpanded ? <ExpandLess /> : <ExpandMore />}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                    <Chip
                      label={`${statusFeedback.length} ${status.charAt(0).toUpperCase() + status.slice(1)}`}
                      color={isExpanded ? "default" : getStatusColor(status)}
                      variant={isExpanded ? "filled" : "filled"}
                      size="medium"
                      sx={{
                        backgroundColor: isExpanded ? 'background.paper' : undefined,
                        color: isExpanded ? 'primary.main' : undefined
                      }}
                    />
                    <Typography 
                      variant="h6" 
                      sx={{ 
                        color: isExpanded ? 'primary.contrastText' : 'text.primary',
                        fontWeight: 600
                      }}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)} Feedback
                    </Typography>
                  </Box>
                </Button>
                
                {/* Feedback Cards for this Status */}
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                    {statusFeedback.map((feedback) => (
                      <Card
                        key={feedback.id}
                        onClick={() => handleFeedbackClick(feedback)}
                        sx={{
                          cursor: 'pointer',
                          '&:hover': {
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            transform: 'translateY(-1px)',
                          },
                          transition: 'all 0.2s ease-in-out',
                        }}
                      >
                        <CardContent sx={{ p: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                            {feedback.category && (
                              <Chip
                                icon={getCategoryIcon(feedback.category)}
                                label={getCategoryLabel(feedback.category)}
                                size="small"
                                variant="outlined"
                              />
                            )}
                            <Chip
                              label={feedback.status}
                              size="small"
                              color={getStatusColor(feedback.status)}
                            />
                            <Chip
                              label={feedback.userRole}
                              size="small"
                              variant="outlined"
                              sx={{ ml: 'auto' }}
                            />
                          </Box>
                          
                          <Typography variant="body1" sx={{ mb: 1, lineHeight: 1.5 }}>
                            {feedback.message.length > 150 
                              ? `${feedback.message.substring(0, 150)}...` 
                              : feedback.message
                            }
                          </Typography>
                          
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Person size={16} />
                              {feedback.userDisplayName || feedback.userEmail}
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AccessTime size={16} />
                              {formatTimestamp(feedback.timestamp)}
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
          
          {filteredFeedback.length === 0 && allFeedback.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              No feedback matches the current filters.
            </Typography>
          )}
          
          {allFeedback.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
              No feedback submitted yet.
            </Typography>
          )}
        </Box>
      )}

      {/* Feedback Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            maxWidth: 600,
            width: 'calc(100% - 32px)',
            mx: 'auto'
          }
        }}
      >
        {selectedFeedback && (
          <>
            <DialogTitle component="div" sx={{ pb: 1, pr: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {selectedFeedback.category && (
                    <Chip
                      icon={getCategoryIcon(selectedFeedback.category)}
                      label={getCategoryLabel(selectedFeedback.category)}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  <Typography component="h2" variant="h6">
                    Feedback Details
                  </Typography>
                </Box>
                <IconButton
                  aria-label="Close dialog"
                  onClick={handleCloseDialog}
                  sx={{ color: 'text.secondary' }}
                >
                  <Cancel />
                </IconButton>
              </Box>
            </DialogTitle>
            
            <DialogContent sx={{ pb: 2 }}>
              {/* Feedback Message */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Message:
                </Typography>
                <Typography variant="body1" sx={{ 
                  p: 2, 
                  backgroundColor: 'var(--color-bg)', 
                  borderRadius: 2, 
                  border: '1px solid var(--color-border)',
                  lineHeight: 1.6
                }}>
                  {selectedFeedback.message}
                </Typography>
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              {/* User Information */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  User Information:
                </Typography>
                
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Name:</Typography>
                    <Typography variant="body1">{selectedFeedback.userDisplayName || 'Unknown'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Email:</Typography>
                    <Typography variant="body1">{selectedFeedback.userEmail}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Role:</Typography>
                    <Typography variant="body1">{selectedFeedback.userRole}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.secondary">Submitted:</Typography>
                    <Typography variant="body1">{formatTimestamp(selectedFeedback.timestamp)}</Typography>
                  </Box>
                </Box>
              </Box>
              
              <Divider sx={{ my: 2 }} />
              
              {/* Admin Management */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                  Admin Management:
                </Typography>
                
                {editing ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Status</InputLabel>
                      <Select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        label="Status"
                      >
                        {STATUS_OPTIONS.map((statusOption) => (
                          <MenuItem key={statusOption.value} value={statusOption.value}>
                            {statusOption.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      label="Admin Notes"
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add your notes about this feedback..."
                      variant="outlined"
                    />
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary">Status:</Typography>
                      <Chip
                        label={selectedFeedback.status}
                        color={getStatusColor(selectedFeedback.status)}
                        size="small"
                      />
                    </Box>
                    
                    {selectedFeedback.adminNotes && (
                      <Box>
                        <Typography variant="body2" color="text.secondary">Admin Notes:</Typography>
                        <Typography variant="body1" sx={{ 
                          p: 2, 
                          backgroundColor: 'var(--color-bg)', 
                          borderRadius: 2, 
                          border: '1px solid var(--color-border)',
                          fontStyle: 'italic'
                        }}>
                          {selectedFeedback.adminNotes}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </DialogContent>
            
            <DialogActions sx={{ px: 3, pb: 3, gap: 2 }}>
              {editing && canEdit ? (
                <>
                  <Button 
                    onClick={handleCancel} 
                    variant="outlined" 
                    sx={{ flex: 1 }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSave} 
                    variant="contained" 
                    color="primary"
                    startIcon={saving ? <CircularProgress size={16} /> : <Save />}
                    sx={{ flex: 1 }}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              ) : (
                <>
                  {canEdit && (
                    <Button 
                      onClick={handleEditClick} 
                      variant="outlined" 
                      startIcon={<Edit />}
                      sx={{ flex: 1 }}
                    >
                      Edit Status & Notes
                    </Button>
                  )}
                  <Button 
                    onClick={handleCloseDialog} 
                    variant="contained" 
                    sx={{ flex: 1 }}
                  >
                    Close
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

export default FeedbackTimeline;
