import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, List, ListItem, ListItemText, ListItemAvatar,
  Avatar, Chip, CircularProgress, TextField, InputAdornment, Select, MenuItem,
  FormControl, InputLabel, IconButton, Menu, Divider, Button, Dialog, DialogTitle,
  DialogContent, DialogActions
} from '@mui/material';
import { Search as SearchIcon, MoreVert as MoreIcon, PersonAdd as PersonAddIcon } from '@mui/icons-material';
import { usersAPI } from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';

const AdminUsers = () => {
  const { showSuccess, showError } = useNotification();
  const { user: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [navigators, setNavigators] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'student',
    phone: '',
    assignedNavigator: ''
  });
  const [registerLoading, setRegisterLoading] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchNavigators();
  }, [roleFilter]);

  const fetchNavigators = async () => {
    try {
      const response = await usersAPI.getNavigators();
      setNavigators(response.data.navigators || []);
    } catch (err) {
      console.error('Error fetching navigators:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getAll({ role: roleFilter || undefined });
      setUsers(response.data.users || []);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await usersAPI.updateRole(userId, newRole);
      showSuccess('Role updated');
      fetchUsers();
    } catch (err) {
      showError('Failed to update role');
    }
    setMenuAnchor(null);
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      await usersAPI.updateStatus(userId, !currentStatus);
      showSuccess(`User ${currentStatus ? 'disabled' : 'enabled'}`);
      fetchUsers();
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to update user status');
    }
    setMenuAnchor(null);
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'administrator': return 'error';
      case 'learning_navigator': return 'primary';
      default: return 'default';
    }
  };

  const handleRegisterUser = async () => {
    try {
      setRegisterLoading(true);
      const dataToSend = {
        email: registerForm.email,
        firstName: registerForm.firstName,
        lastName: registerForm.lastName,
        role: registerForm.role,
        phone: registerForm.phone || undefined,
        assignedNavigator: registerForm.assignedNavigator || undefined
      };
      await usersAPI.registerUser(dataToSend);
      showSuccess('User registered successfully. They can now log in with Google.');
      setRegisterDialogOpen(false);
      setRegisterForm({
        email: '',
        firstName: '',
        lastName: '',
        role: 'student',
        phone: '',
        assignedNavigator: ''
      });
      fetchUsers();
    } catch (err) {
      showError(err.response?.data?.message || 'Failed to register user');
    } finally {
      setRegisterLoading(false);
    }
  };

  const isAdmin = currentUser?.role === 'administrator';

  const filteredUsers = users.filter(user => {
    if (!search) return true;
    const s = search.toLowerCase();
    return user.firstName?.toLowerCase().includes(s) ||
           user.lastName?.toLowerCase().includes(s) ||
           user.email?.toLowerCase().includes(s);
  });

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Manage Users</Typography>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setRegisterDialogOpen(true)}
        >
          Register User
        </Button>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ pb: '16px !important', display: 'flex', gap: 2 }}>
          <TextField
            size="small"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            sx={{ flexGrow: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Role</InputLabel>
            <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} label="Role">
              <MenuItem value="">All Roles</MenuItem>
              <MenuItem value="student">Student</MenuItem>
              <MenuItem value="learning_navigator">Learning Navigator</MenuItem>
              <MenuItem value="administrator">Administrator</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : (
            <List>
              {filteredUsers.map(user => (
                <ListItem key={user._id} sx={{ bgcolor: 'background.default', mb: 1, borderRadius: 1 }}>
                  <ListItemAvatar>
                    <Avatar src={user.profilePicture}>{user.firstName?.[0]}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={`${user.firstName} ${user.lastName}`}
                    secondary={user.email}
                  />
                  <Chip
                    label={user.role?.replace('_', ' ')}
                    size="small"
                    color={getRoleColor(user.role)}
                    sx={{ mr: 1, textTransform: 'capitalize' }}
                  />
                  <Chip
                    label={user.isActive ? 'Active' : 'Inactive'}
                    size="small"
                    color={user.isActive ? 'success' : 'default'}
                    variant="outlined"
                  />
                  <IconButton onClick={(e) => { setMenuAnchor(e.currentTarget); setSelectedUser(user); }}>
                    <MoreIcon />
                  </IconButton>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => handleRoleChange(selectedUser?._id, 'student')}>Set as Student</MenuItem>
        <MenuItem onClick={() => handleRoleChange(selectedUser?._id, 'learning_navigator')}>Set as Navigator</MenuItem>
        <MenuItem onClick={() => handleRoleChange(selectedUser?._id, 'administrator')}>Set as Admin</MenuItem>
        <Divider />
        <MenuItem onClick={() => handleToggleStatus(selectedUser?._id, selectedUser?.isActive)}>
          {selectedUser?.isActive ? 'Disable Account' : 'Enable Account'}
        </MenuItem>
      </Menu>

      {/* Register User Dialog */}
      <Dialog open={registerDialogOpen} onClose={() => setRegisterDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Register New User</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Email"
              type="email"
              value={registerForm.email}
              onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
              required
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="First Name"
                value={registerForm.firstName}
                onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                required
                fullWidth
              />
              <TextField
                label="Last Name"
                value={registerForm.lastName}
                onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                required
                fullWidth
              />
            </Box>
            <TextField
              label="Phone (optional)"
              value={registerForm.phone}
              onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
              fullWidth
            />
            {isAdmin && (
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select
                  value={registerForm.role}
                  onChange={(e) => setRegisterForm({ ...registerForm, role: e.target.value })}
                  label="Role"
                >
                  <MenuItem value="student">Student</MenuItem>
                  <MenuItem value="learning_navigator">Learning Navigator</MenuItem>
                  <MenuItem value="administrator">Administrator</MenuItem>
                </Select>
              </FormControl>
            )}
            {registerForm.role === 'student' && (
              <FormControl fullWidth>
                <InputLabel>Assign Navigator (optional)</InputLabel>
                <Select
                  value={registerForm.assignedNavigator}
                  onChange={(e) => setRegisterForm({ ...registerForm, assignedNavigator: e.target.value })}
                  label="Assign Navigator (optional)"
                >
                  <MenuItem value="">None</MenuItem>
                  {navigators.map((nav) => (
                    <MenuItem key={nav._id} value={nav._id}>
                      {nav.firstName} {nav.lastName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Typography variant="body2" color="text.secondary">
              The user will be able to log in with Google using this email address.
              Their Google account will be automatically linked to this profile.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRegisterUser}
            variant="contained"
            disabled={registerLoading || !registerForm.email || !registerForm.firstName || !registerForm.lastName}
          >
            {registerLoading ? 'Registering...' : 'Register User'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminUsers;
