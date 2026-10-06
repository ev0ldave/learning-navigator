import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Popover,
  Tabs,
  Tab,
  TextField,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Divider,
  Typography,
  CircularProgress,
  Chip
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

const ROLE_TABS = [
  { label: 'Students', value: 'student' },
  { label: 'Navigators', value: 'learning_navigator' },
  { label: 'Admins', value: 'administrator' }
];

// Read-only "view as" control: lets an admin_reader pick a role and a specific
// user, then view the entire site exactly as that user sees it.
const ViewAsSwitcher = () => {
  const { isAdminReader, isImpersonating, user, startImpersonation, stopImpersonation } = useAuth();
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState(null);
  const [role, setRole] = useState('student');
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  const open = Boolean(anchorEl);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/impersonatable-users', {
        params: { role, search: search.trim() || undefined }
      });
      if (response.data.success) {
        setUsers(response.data.users);
      }
    } catch (error) {
      console.error('Failed to load users for view-as:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [role, search]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(loadUsers, 250);
    return () => clearTimeout(timer);
  }, [open, loadUsers]);

  if (!isAdminReader()) {
    return null;
  }

  const handleOpen = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleSelect = async (targetId) => {
    setSwitching(true);
    try {
      await startImpersonation(targetId);
      handleClose();
      navigate('/dashboard');
    } finally {
      setSwitching(false);
    }
  };

  const handleStop = async () => {
    setSwitching(true);
    try {
      await stopImpersonation();
      handleClose();
      navigate('/dashboard');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleOpen}
        startIcon={<VisibilityIcon />}
        size="small"
        variant={isImpersonating ? 'contained' : 'outlined'}
        color={isImpersonating ? 'warning' : 'inherit'}
        sx={{ mr: 1, textTransform: 'none', maxWidth: 220 }}
      >
        {isImpersonating
          ? `Viewing as ${user?.firstName} ${user?.lastName}`
          : 'View as…'}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 360, maxWidth: '90vw' } } }}
      >
        <Box sx={{ p: 2, pb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            View the site as another user
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Read-only. You cannot make changes while viewing.
          </Typography>
        </Box>

        {isImpersonating && (
          <Box sx={{ px: 2, pb: 1 }}>
            <Chip
              icon={<CloseIcon />}
              label={`Stop viewing as ${user?.firstName}`}
              onClick={handleStop}
              color="warning"
              variant="outlined"
              sx={{ width: '100%', justifyContent: 'space-between' }}
            />
          </Box>
        )}

        <Tabs
          value={role}
          onChange={(e, value) => setRole(value)}
          variant="fullWidth"
        >
          {ROLE_TABS.map(tab => (
            <Tab key={tab.value} label={tab.label} value={tab.value} />
          ))}
        </Tabs>

        <Box sx={{ p: 2, pb: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>

        <Divider />

        <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : users.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
              No users found.
            </Typography>
          ) : (
            <List disablePadding>
              {users.map(u => (
                <ListItemButton
                  key={u._id}
                  disabled={switching}
                  selected={isImpersonating && u._id === user?._id}
                  onClick={() => handleSelect(u._id)}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ width: 32, height: 32 }}>
                      {u.firstName?.[0]}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`${u.firstName} ${u.lastName}`}
                    secondary={u.email}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
};

export default ViewAsSwitcher;
