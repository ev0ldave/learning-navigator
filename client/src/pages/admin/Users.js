import React, { useState, useEffect } from 'react';
import {
  Box, Card, CardContent, Typography, List, ListItem, ListItemText, ListItemAvatar,
  Avatar, Chip, CircularProgress, TextField, InputAdornment, Select, MenuItem,
  FormControl, InputLabel, IconButton, Menu, Divider
} from '@mui/material';
import { Search as SearchIcon, MoreVert as MoreIcon } from '@mui/icons-material';
import { usersAPI } from '../../services/api';
import { useNotification } from '../../contexts/NotificationContext';

const AdminUsers = () => {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, [roleFilter]);

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

  const filteredUsers = users.filter(user => {
    if (!search) return true;
    const s = search.toLowerCase();
    return user.firstName?.toLowerCase().includes(s) ||
           user.lastName?.toLowerCase().includes(s) ||
           user.email?.toLowerCase().includes(s);
  });

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Manage Users</Typography>

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
    </Box>
  );
};

export default AdminUsers;
