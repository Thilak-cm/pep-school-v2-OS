import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Card,
  CardContent,
  Grid,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  ArrowBack,
  PersonAdd,
  AdminPanelSettings,
  School,
  CheckCircle,
  Error,
  Info
} from '@mui/icons-material';
import { collection, getDocs, getDoc, doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, cloudFunctions } from '../firebase';
import useNotify from '../notifications/useNotify.js';

const AddUserPage = ({ onBack, currentUser, userRole }) => {
  const notify = useNotify();
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'teacher',
    adminLevel: 'regular',
    permissions: []
  });

  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassrooms, setSelectedClassrooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Initialize Cloud Functions
  const createUserWithEmailCheck = httpsCallable(cloudFunctions, 'createUserWithEmailCheck');

  // Permission definitions
  const permissionGroups = {
    super: [
      { key: 'manage_users', label: 'Manage Users', description: 'Create, edit, and delete user accounts' },
      { key: 'view_reports', label: 'View Reports', description: 'Access all system reports and analytics' },
      { key: 'manage_classrooms', label: 'Manage Classrooms', description: 'Create, edit, and delete classrooms' },
      { key: 'manage_students', label: 'Manage Students', description: 'Add, edit, and remove students' },
      { key: 'manage_attendance', label: 'Manage Attendance', description: 'View and edit attendance records' },
      { key: 'manage_settings', label: 'Manage Settings', description: 'Access system configuration' }
    ],
    regular: [
      { key: 'view_reports', label: 'View Reports', description: 'Access system reports and analytics' },
      { key: 'manage_classrooms', label: 'Manage Classrooms', description: 'Create, edit, and delete classrooms' },
      { key: 'manage_students', label: 'Manage Students', description: 'Add, edit, and remove students' }
    ]
  };

  // Allowed email domains for new users
  const allowedDomains = ['pepschoolv2.com'];

  // Check if current user is super admin
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userLoading, setUserLoading] = useState(true);

  useEffect(() => {
    if (userRole !== 'admin') {
      setError('Access denied. Only admins can access this page.');
      setUserLoading(false);
      return;
    }
    checkAdminLevel();
  }, [userRole, currentUser]);

  const checkAdminLevel = async () => {
    try {
      setUserLoading(true);
      // Get the current user's document from Firestore to check admin level
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const isSuper = userData.adminLevel === 'super';
        setIsSuperAdmin(isSuper);
        
        if (!isSuper) {
          setError('Access denied. Only super admins can create new users.');
        }
      } else {
        setError('User data not found. Please contact support.');
      }
    } catch (error) {
      console.error('Error checking admin level:', error);
      setError('Failed to verify admin permissions. Please try again.');
    } finally {
      setUserLoading(false);
    }
  };

  // Fetch classrooms when user is confirmed to be super admin
  useEffect(() => {
    if (isSuperAdmin && !error) {
      fetchClassrooms();
    }
  }, [isSuperAdmin, error]);

  const fetchClassrooms = async () => {
    try {
      setLoading(true);
      const classroomsSnapshot = await getDocs(collection(db, 'classrooms'));
      const classroomsList = [];
      
      classroomsSnapshot.forEach((doc) => {
        const data = doc.data();
        classroomsList.push({
          id: doc.id,
          name: data.name || 'Unnamed Classroom',
          studentCount: data.studentCount || 0
        });
      });
      
      setClassrooms(classroomsList.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Error fetching classrooms:', error);
      setError('Failed to fetch classrooms. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};

    // Email validation
    if (!formData.email || !formData.email.trim()) {
      errors.email = 'Email is required';
    } else {
      const email = formData.email.trim();
      const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!basicEmailRegex.test(email)) {
        errors.email = 'Enter a valid email address';
      } else {
        const domain = email.split('@')[1].toLowerCase();
        if (!allowedDomains.includes(domain)) {
          errors.email = `Allowed domains: ${allowedDomains.join(', ')}`;
        }
      }
    }

    // Name validation
    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }

    // Role-specific validation
    if (formData.role === 'teacher' && selectedClassrooms.length === 0) {
      errors.classrooms = 'Please select at least one classroom for teachers';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear validation errors when user starts typing
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Reset permissions when role changes
    if (field === 'role') {
      setFormData(prev => ({
        ...prev,
        role: value,
        adminLevel: value === 'admin' ? 'regular' : null,
        permissions: []
      }));
    }

    // Reset admin level when changing admin level
    if (field === 'adminLevel') {
      setFormData(prev => ({
        ...prev,
        adminLevel: value,
        permissions: []
      }));
    }
  };

  const handlePermissionChange = (permissionKey, checked) => {
    setFormData(prev => ({
      ...prev,
      permissions: checked
        ? [...prev.permissions, permissionKey]
        : prev.permissions.filter(p => p !== permissionKey)
    }));
  };

  const handleClassroomToggle = (classroomId) => {
    setSelectedClassrooms(prev => 
      prev.includes(classroomId)
        ? prev.filter(id => id !== classroomId)
        : [...prev, classroomId]
    );
    
    // Clear validation error
    if (validationErrors.classrooms) {
      setValidationErrors(prev => ({ ...prev, classrooms: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      // Call Cloud Function to create user and check for email uniqueness
      const result = await createUserWithEmailCheck({
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        role: formData.role,
        adminLevel: formData.adminLevel,
        permissions: formData.permissions,
        selectedClassrooms: selectedClassrooms
      });

      if (result.data.success) {
        setSuccess(true);
        notify.success('User created successfully', { id: 'user-create', duration: 3000 });
        // Reset form after successful submission
        setTimeout(() => {
          setFormData({
            email: '',
            firstName: '',
            lastName: '',
            role: 'teacher',
            adminLevel: 'regular',
            permissions: []
          });
          setSelectedClassrooms([]);
          setSuccess(false);
        }, 3000);
      } else {
        const msg = result.data.message || 'Failed to create user. Email might already be in use.';
        setError(msg);
        notify.error(msg, { id: 'user-create', duration: 4500 });
      }

    } catch (error) {
      console.error('Error creating user:', error);
      
      // Handle specific Cloud Function errors
      const code = error.code;
      const map = {
        'functions/already-exists': 'A user with this email already exists. Please use a different email address.',
        'functions/invalid-argument': 'Invalid input. Please check all required fields.',
        'functions/unauthenticated': 'Authentication error. Please log in again.',
        'functions/internal': 'Server error. Please try again later.',
      };
      const msg = map[code] || 'Failed to create user. Please try again.';
      setError(msg);
      notify.error(msg, { id: 'user-create', duration: 4500 });
    } finally {
      setSubmitting(false);
    }
  };

  if (userLoading) {
    return (
      <Box sx={{
        width: '100%',
        maxWidth: '375px',
        minHeight: '100vh',
        margin: '0 auto',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <Box sx={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          justifyContent: 'center', 
          alignItems: 'center',
          p: 3
        }}>
          <CircularProgress size={48} sx={{ mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            Verifying admin permissions...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (!isSuperAdmin) {
    return (
      <Box sx={{
        width: '100%',
        maxWidth: '375px',
        minHeight: '100vh',
        margin: '0 auto',
        backgroundColor: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <Box sx={{ p: 3 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            Access Denied
          </Alert>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Only super admins can create new users.
          </Typography>
          <Button
            variant="contained"
            startIcon={<ArrowBack />}
            onClick={onBack}
            fullWidth
          >
            Back to Admin Panel
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{
      width: '100%',
      maxWidth: '375px',
      minHeight: '100vh',
      margin: '0 auto',
      backgroundColor: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <Box sx={{ 
        p: 3, 
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: 'white',
        flexShrink: 0
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton onClick={onBack} size="small">
            <ArrowBack />
          </IconButton>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
            Add New User
          </Typography>
        </Box>
      </Box>

      {/* Form */}
      <Box sx={{ 
        flex: 1, 
        overflow: 'auto', 
        p: 3,
        backgroundColor: '#f8fafc'
      }}>
        {success && (
          <Alert 
            severity="success" 
            icon={<CheckCircle />}
            sx={{ mb: 3 }}
            onClose={() => setSuccess(false)}
          >
            User created successfully! The form will reset in a few seconds.
          </Alert>
        )}

        {error && (
          <Alert 
            severity="error" 
            icon={<Error />}
            sx={{ mb: 3 }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            {/* Basic Information */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ 
                mb: 3, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1.5,
                color: 'text.primary',
                fontSize: '1.1rem',
                fontWeight: 600,
                '&::after': {
                  content: '""',
                  flex: 1,
                  height: '2px',
                  background: 'linear-gradient(90deg, #4f46e5 0%, #e2e8f0 100%)',
                  borderRadius: '1px'
                }
              }}>
                <PersonAdd sx={{ color: '#4f46e5', fontSize: '1.5rem' }} />
                Basic Information
              </Typography>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="First Name"
                value={formData.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                error={!!validationErrors.firstName}
                helperText={validationErrors.firstName}
                required
                size="small"
                sx={{ backgroundColor: 'white' }}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={formData.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                error={!!validationErrors.lastName}
                helperText={validationErrors.lastName}
                required
                size="small"
                sx={{ backgroundColor: 'white' }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                error={!!validationErrors.email}
                helperText={validationErrors.email || `Allowed domains: ${allowedDomains.join(', ')}`}
                required
                size="small"
                sx={{ backgroundColor: 'white' }}
              />
            </Grid>

            {/* Role Selection */}
            <Grid item xs={12}>
              <Divider sx={{ 
                my: 4, 
                borderColor: '#e2e8f0',
                '&::before': {
                  borderTop: '2px solid #4f46e5'
                },
                '&::after': {
                  borderTop: '2px solid #4f46e5'
                }
              }} />
              <Typography variant="h6" sx={{ 
                mb: 3, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1.5,
                color: 'text.primary',
                fontSize: '1.1rem',
                fontWeight: 600,
                '&::after': {
                  content: '""',
                  flex: 1,
                  height: '2px',
                  background: 'linear-gradient(90deg, #4f46e5 0%, #e2e8f0 100%)',
                  borderRadius: '1px'
                }
              }}>
                {formData.role === 'admin' ? 
                  <AdminPanelSettings sx={{ color: '#4f46e5', fontSize: '1.5rem' }} /> : 
                  <School sx={{ color: '#4f46e5', fontSize: '1.5rem' }} />
                }
                Role & Permissions
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <FormControl fullWidth size="small" sx={{ backgroundColor: 'white' }}>
                <InputLabel>User Role</InputLabel>
                <Select
                  value={formData.role}
                  label="User Role"
                  onChange={(e) => handleInputChange('role', e.target.value)}
                >
                  <MenuItem value="teacher">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <School />
                      Teacher
                    </Box>
                  </MenuItem>
                  <MenuItem value="admin">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AdminPanelSettings />
                      Administrator
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Admin Level Selection */}
            {formData.role === 'admin' && (
              <Grid item xs={12}>
                <FormControl fullWidth size="small" sx={{ mt: 2, backgroundColor: 'white' }}>
                  <InputLabel>Admin Level</InputLabel>
                  <Select
                    value={formData.adminLevel}
                    label="Admin Level"
                    onChange={(e) => handleInputChange('adminLevel', e.target.value)}
                  >
                    <MenuItem value="regular">Regular Admin</MenuItem>
                    <MenuItem value="super">Super Admin</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* Permissions */}
            {formData.role === 'admin' && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ 
                  mb: 2, 
                  color: 'text.secondary',
                  mt: 2
                }}>
                  Permissions will be automatically set based on admin level, but you can customize them:
                </Typography>
                
                {/* Select All Button */}
                <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      const allPermissions = permissionGroups[formData.adminLevel]?.map(p => p.key) || [];
                      setFormData(prev => ({ ...prev, permissions: allPermissions }));
                    }}
                    sx={{ 
                      borderColor: 'primary.main',
                      color: 'primary.main',
                      '&:hover': {
                        borderColor: 'primary.dark',
                        backgroundColor: 'primary.50'
                      }
                    }}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => setFormData(prev => ({ ...prev, permissions: [] }))}
                    sx={{ 
                      borderColor: 'text.secondary',
                      color: 'text.secondary',
                      '&:hover': {
                        borderColor: 'text.primary',
                        backgroundColor: 'grey.50'
                      }
                    }}
                  >
                    Clear All
                  </Button>
                </Box>
                
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 1,
                  backgroundColor: 'white',
                  p: 2,
                  borderRadius: 1,
                  border: '1px solid #e2e8f0'
                }}>
                  {permissionGroups[formData.adminLevel]?.map((permission) => (
                    <FormControlLabel
                      key={permission.key}
                      control={
                        <Checkbox
                          checked={formData.permissions.includes(permission.key)}
                          onChange={(e) => handlePermissionChange(permission.key, e.target.checked)}
                          size="small"
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {permission.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {permission.description}
                          </Typography>
                        </Box>
                      }
                    />
                  ))}
                </Box>
              </Grid>
            )}

            {/* Classroom Assignment for Teachers */}
            {formData.role === 'teacher' && (
              <>
                <Grid item xs={12}>
                  <Divider sx={{ 
                    my: 4, 
                    borderColor: '#e2e8f0',
                    '&::before': {
                      borderTop: '2px solid #4f46e5'
                    },
                    '&::after': {
                      borderTop: '2px solid #4f46e5'
                    }
                  }} />
                  <Typography variant="h6" sx={{ 
                    mb: 3, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 1.5,
                    color: 'text.primary',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    '&::after': {
                      content: '""',
                      flex: 1,
                      height: '2px',
                      background: 'linear-gradient(90deg, #4f46e5 0%, #e2e8f0 100%)',
                      borderRadius: '1px'
                    }
                  }}>
                    <School sx={{ color: '#4f46e5', fontSize: '1.5rem' }} />
                    Classroom Assignment
                  </Typography>
                </Grid>

                <Grid item xs={12}>
                  {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : classrooms.length === 0 ? (
                    <Alert severity="info" icon={<Info />}>
                      No classrooms found. Teacher will be created without classroom assignments.
                    </Alert>
                  ) : (
                    <>
                      <Typography variant="body2" sx={{ 
                        mb: 2, 
                        color: 'text.secondary' 
                      }}>
                        Select classrooms to assign this teacher to:
                      </Typography>
                      <Box sx={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        gap: 1,
                        backgroundColor: 'white',
                        p: 2,
                        borderRadius: 1,
                        border: '1px solid #e2e8f0'
                      }}>
                        {classrooms.map((classroom) => (
                          <Chip
                            key={classroom.id}
                            label={`${classroom.name} (${classroom.studentCount} students)`}
                            onClick={() => handleClassroomToggle(classroom.id)}
                            color={selectedClassrooms.includes(classroom.id) ? 'primary' : 'default'}
                            variant={selectedClassrooms.includes(classroom.id) ? 'filled' : 'outlined'}
                            clickable
                            size="small"
                          />
                        ))}
                      </Box>
                      {validationErrors.classrooms && (
                        <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                          {validationErrors.classrooms}
                        </Typography>
                      )}
                    </>
                  )}
                </Grid>
              </>
            )}

            {/* Submit Button */}
            <Grid item xs={12} sx={{ mt: 4, mb: 2 }}>
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                disabled={submitting}
                startIcon={submitting ? <CircularProgress size={20} /> : <PersonAdd />}
                sx={{ py: 1.5 }}
              >
                {submitting ? 'Creating User...' : 'Create User Account'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Box>
    </Box>
  );
};

export default AddUserPage;
