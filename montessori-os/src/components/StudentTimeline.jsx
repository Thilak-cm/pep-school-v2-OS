import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  Grid,
  Paper,
  Container
} from '@mui/material';
import {
  MoreVert,
  Edit,
  Delete,
  Star,
  StarBorder,
  FilterList,
  Search,
  CalendarToday,
  Person,
  ArrowBack
} from '@mui/icons-material';

// Sample data for demonstration
const sampleObservations = [
  {
    id: 1,
    studentName: 'Emma Johnson',
    studentAvatar: 'E',
    timestamp: '2024-01-15T10:30:00Z',
    text: 'Emma showed excellent progress in practical life activities today. She successfully completed the pouring exercise with minimal spills.',
    tags: ['Practical Life', 'Fine Motor'],
    starred: true,
    teacher: 'Ms. Sarah'
  },
  {
    id: 2,
    studentName: 'Emma Johnson',
    studentAvatar: 'E',
    timestamp: '2024-01-14T14:15:00Z',
    text: 'Emma demonstrated strong language skills during circle time. She confidently shared her weekend activities with the class.',
    tags: ['Language', 'Social Skills'],
    starred: false,
    teacher: 'Ms. Sarah'
  },
  {
    id: 3,
    studentName: 'Emma Johnson',
    studentAvatar: 'E',
    timestamp: '2024-01-13T09:45:00Z',
    text: 'Emma showed interest in the sensorial materials. She spent 20 minutes exploring the pink tower independently.',
    tags: ['Sensorial', 'Concentration'],
    starred: true,
    teacher: 'Ms. Sarah'
  }
];

const StudentTimeline = () => {
  const [observations, setObservations] = useState(sampleObservations);
  const [selectedTag, setSelectedTag] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedObservation, setSelectedObservation] = useState(null);

  const handleMenuOpen = (event, observation) => {
    setAnchorEl(event.currentTarget);
    setSelectedObservation(observation);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedObservation(null);
  };

  const handleStarToggle = (observationId) => {
    setObservations(prev => 
      prev.map(obs => 
        obs.id === observationId 
          ? { ...obs, starred: !obs.starred }
          : obs
      )
    );
  };

  const handleDelete = (observationId) => {
    setObservations(prev => prev.filter(obs => obs.id !== observationId));
    handleMenuClose();
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredObservations = observations.filter(observation => {
    const matchesSearch = observation.text.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         observation.studentName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTag = selectedTag === 'all' || observation.tags.includes(selectedTag);
    return matchesSearch && matchesTag;
  });

  const allTags = Array.from(new Set(observations.flatMap(obs => obs.tags)));

  return (
    <Box
      sx={{
        width: '375px',
        height: '812px',
        margin: '40px auto',
        overflow: 'hidden',
        backgroundColor: '#f8fafc',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e2e8f0',
          p: 2
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <IconButton
            size="small"
            sx={{ color: '#64748b' }}
            aria-label="Go back"
          >
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" component="h1" sx={{ color: '#1e293b', fontWeight: 600 }}>
            Student Timeline
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          View and manage observations for Emma Johnson
        </Typography>
      </Box>

      {/* Filters */}
      <Paper 
        sx={{ 
          m: 2, 
          p: 2, 
          borderRadius: 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search observations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Filter by Tag</InputLabel>
            <Select
              value={selectedTag}
              label="Filter by Tag"
              onChange={(e) => setSelectedTag(e.target.value)}
              startAdornment={<FilterList sx={{ mr: 1, color: 'text.secondary' }} />}
            >
              <MenuItem value="all">All Tags</MenuItem>
              {allTags.map(tag => (
                <MenuItem key={tag} value={tag}>{tag}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<CalendarToday />}
            fullWidth
            size="small"
          >
            Date Range
          </Button>
        </Box>
      </Paper>

      {/* Timeline */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, pb: 2 }}>
        {filteredObservations.length > 0 ? (
          <List sx={{ width: '100%' }}>
            {filteredObservations.map((observation, index) => (
              <React.Fragment key={observation.id}>
                <Card sx={{ mb: 2, borderRadius: 2 }}>
                  <CardContent sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.875rem' }}>
                          {observation.studentAvatar}
                        </Avatar>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="600" sx={{ color: '#1e293b' }}>
                            {observation.studentName}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>
                            {formatDate(observation.timestamp)} • {observation.teacher}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => handleStarToggle(observation.id)}
                          color={observation.starred ? 'warning' : 'default'}
                          aria-label={observation.starred ? 'Unstar observation' : 'Star observation'}
                        >
                          {observation.starred ? <Star /> : <StarBorder />}
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, observation)}
                          aria-label="More options"
                        >
                          <MoreVert />
                        </IconButton>
                      </Box>
                    </Box>

                    <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6, color: '#374151' }}>
                      {observation.text}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {observation.tags.map(tag => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          variant="outlined"
                          color="primary"
                          sx={{ fontSize: '0.75rem' }}
                        />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
                {index < filteredObservations.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        ) : (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Person sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" sx={{ color: '#64748b', mb: 1 }}>
              No observations found
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              Try adjusting your search or filter criteria
            </Typography>
          </Box>
        )}
      </Box>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            minWidth: 150,
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #e2e8f0'
          }
        }}
      >
        <MenuItem onClick={handleMenuClose}>
          <Edit sx={{ mr: 1, fontSize: 20 }} />
          Edit
        </MenuItem>
        <MenuItem 
          onClick={() => handleDelete(selectedObservation?.id)}
          sx={{ color: '#ef4444' }}
        >
          <Delete sx={{ mr: 1, fontSize: 20 }} />
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default StudentTimeline; 