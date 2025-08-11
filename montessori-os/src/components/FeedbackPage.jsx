import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Snackbar,
  Collapse,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Send,
  ExpandMore,
  ExpandLess,
  ArrowBack,
  BugReport,
  Lightbulb,
  Brush,
  Speed,
  Chat,
  History
} from '@mui/icons-material';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const FEEDBACK_CATEGORIES = [
  { value: 'bug', label: 'Bug Report', icon: <BugReport /> },
  { value: 'feature', label: 'Feature Request', icon: <Lightbulb /> },
  { value: 'ui-ux', label: 'UI/UX', icon: <Brush /> },
  { value: 'performance', label: 'Performance', icon: <Speed /> },
  { value: 'general', label: 'General', icon: <Chat /> }
];

function FeedbackPage({ currentUser, userRole, onBack, onNavigateToAdminDashboard }) {
  const [feedback, setFeedback] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [userFeedback, setUserFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  // Load user's feedback history
  useEffect(() => {
    if (!currentUser) return;

    // Use a simpler query that doesn't require composite index
    const q = query(
      collection(db, 'feedback'),
      where('userId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feedbackList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort client-side to avoid index requirement
      const sortedList = feedbackList.sort((a, b) => {
        const timeA = a.timestamp?.toDate?.() || new Date(a.timestamp) || new Date(0);
        const timeB = b.timestamp?.toDate?.() || new Date(b.timestamp) || new Date(0);
        return timeB - timeA; // Descending order
      });
      
      setUserFeedback(sortedList);
      setLoading(false);
    }, (error) => {
      console.error('Error loading feedback:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    try {
      setSubmitting(true);
      setError('');

      const feedbackData = {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userRole: userRole,
        userDisplayName: currentUser.displayName || 'Unknown User',
        userClassrooms: [], // TODO: Get from user context if available
        
        message: feedback.trim(),
        category: category || null,
        
        timestamp: serverTimestamp(),
        appVersion: '2.1.2', // TODO: Get from package.json or env
        userAgent: navigator.userAgent,
        
        status: 'new',
        adminNotes: ''
      };

      await addDoc(collection(db, 'feedback'), feedbackData);
      
      // Reset form
      setFeedback('');
      setCategory('');
      setShowCategory(false);
      
      // Show success message
      setShowSuccess(true);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryIcon = (catValue) => {
    const category = FEEDBACK_CATEGORIES.find(c => c.value === catValue);
    return category ? category.icon : <Chat />;
  };

  const getCategoryLabel = (catValue) => {
    const category = FEEDBACK_CATEGORIES.find(c => c.value === catValue);
    return category ? category.label : 'General';
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 8 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton 
          onClick={onBack}
          sx={{ 
            color: '#64748b',
            '&:hover': { backgroundColor: 'rgba(100, 116, 139, 0.08)' }
          }}
          aria-label="Go back"
        >
          <ArrowBack />
        </IconButton>
        <Typography variant="h5" component="h1">
          Help Us Improve Montessori OS
        </Typography>
      </Box>

      {/* Feedback Form */}
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Share Your Feedback
          </Typography>
          
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              multiline
              rows={6}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What's on your mind? Share your suggestions, report bugs, or tell us how we can improve the app..."
              variant="outlined"
              sx={{ mb: 2 }}
              disabled={submitting}
            />

            {/* Optional Category Section */}
            <Box sx={{ mb: 3 }}>
              <Button
                variant="text"
                onClick={() => setShowCategory(!showCategory)}
                startIcon={showCategory ? <ExpandLess /> : <ExpandMore />}
                size="small"
                sx={{ mb: 1 }}
              >
                {showCategory ? 'Hide Category' : 'Add Category (Optional)'}
              </Button>
              
              <Collapse in={showCategory}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    label="Category"
                  >
                    <MenuItem value="">
                      <em>No category</em>
                    </MenuItem>
                    {FEEDBACK_CATEGORIES.map((cat) => (
                      <MenuItem key={cat.value} value={cat.value}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {cat.icon}
                          {cat.label}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Collapse>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="contained"
              color="primary"
              startIcon={submitting ? <CircularProgress size={16} /> : <Send />}
              disabled={submitting || !feedback.trim()}
              sx={{ minWidth: 120 }}
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* User's Feedback History */}
      <Card sx={{ borderRadius: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <History />
            Your Feedback History
          </Typography>
          
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={32} />
            </Box>
          ) : userFeedback.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              No feedback submitted yet. Be the first to help us improve!
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {userFeedback.slice(0, 10).map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    p: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    backgroundColor: 'background.paper'
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {item.category && (
                      <Chip
                        icon={getCategoryIcon(item.category)}
                        label={getCategoryLabel(item.category)}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    <Chip
                      label={item.status}
                      size="small"
                      color={
                        item.status === 'new' ? 'primary' :
                        item.status === 'reviewed' ? 'info' :
                        item.status === 'implemented' ? 'success' :
                        item.status === 'declined' ? 'error' : 'default'
                      }
                    />
                  </Box>
                  
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {item.message}
                  </Typography>
                  
                  <Typography variant="caption" color="text.secondary">
                    Submitted: {formatTimestamp(item.timestamp)}
                  </Typography>
                </Box>
              ))}
              
              {userFeedback.length > 10 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  Showing 10 most recent. Total: {userFeedback.length} submissions
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Admin Section */}
      {userRole === 'admin' && (
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Admin Actions
            </Typography>
            <Button
              variant="outlined"
              color="primary"
              fullWidth
              onClick={onNavigateToAdminDashboard}
            >
              View All Feedback Dashboard
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Success Notification */}
      <Snackbar
        open={showSuccess}
        autoHideDuration={4000}
        onClose={() => setShowSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowSuccess(false)}
          severity="success"
          sx={{ width: '100%' }}
        >
          Thank you for your suggestion! We appreciate your feedback.
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default FeedbackPage;
