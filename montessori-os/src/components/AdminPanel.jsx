// AdminPanel.jsx
import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';

function AdminPanel({ onViewClassrooms }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* View All Classrooms */}
      <Card
        onClick={onViewClassrooms}
        sx={{
          cursor: 'pointer',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          },
        }}
        aria-label="View all classrooms"
      >
        <CardContent>
          <Typography variant="h6" component="h2">
            View All Classrooms
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Tap to view every classroom in the school
          </Typography>
        </CardContent>
      </Card>

      {/* Bulk Upload Roster */}
      <Card aria-label="Bulk upload roster coming soon" sx={{ opacity: 0.5 }}>
        <CardContent>
          <Typography variant="h6" component="h2">
            Bulk Upload Roster
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Feature coming soon
          </Typography>
        </CardContent>
      </Card>

      {/* Search & Filter Notes */}
      <Card aria-label="Search and filter notes coming soon" sx={{ opacity: 0.5 }}>
        <CardContent>
          <Typography variant="h6" component="h2">
            Search &amp; Filter Notes
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Feature coming soon
          </Typography>
        </CardContent>
      </Card>

      {/* Add User (Admin/Teacher) - Coming Soon */}
      <Card aria-label="Add user coming soon" sx={{ opacity: 0.5 }}>
        <CardContent>
          <Typography variant="h6" component="h2">
            Add User (Admin / Teacher)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Feature coming soon
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default AdminPanel; 