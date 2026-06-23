import React, { useEffect } from 'react';
import {
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  IconButton,
  Button,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  EventNote as MeetingIcon,
  Note as NoteIcon,
  NotificationsOff as EmptyIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { useNotification } from '../../contexts/NotificationContext';

const NotificationPanel = ({ anchorEl, open, onClose }) => {
  const { 
    notifications, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    fetchNotifications 
  } = useNotification();

  // Fetch notifications when panel opens
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const getNotificationIcon = (type) => {
    if (type?.includes('meeting')) return <MeetingIcon />;
    if (type?.includes('note')) return <NoteIcon />;
    return <MeetingIcon />;
  };

  const handleNotificationClick = async (notification) => {
    if (!notification.channels?.inApp?.read) {
      await markAsRead(notification._id);
    }
    onClose();
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      PaperProps={{
        sx: { width: 360, maxHeight: 480 }
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Notifications</Typography>
        <Button size="small" onClick={markAllAsRead}>
          Mark all as read
        </Button>
      </Box>
      <Divider />
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : notifications.length === 0 ? (
        <Box sx={{ p: 4, textAlign: 'center' }}>
          <EmptyIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography color="text.secondary">
            No notifications
          </Typography>
        </Box>
      ) : (
        <List sx={{ maxHeight: 360, overflow: 'auto' }}>
          {notifications.map((notification) => (
            <ListItem
              key={notification._id}
              onClick={() => handleNotificationClick(notification)}
              sx={{
                bgcolor: notification.channels?.inApp?.read ? 'transparent' : 'action.hover',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.selected' }
              }}
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNotification(notification._id);
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemAvatar>
                <Avatar sx={{ bgcolor: 'primary.main' }}>
                  {getNotificationIcon(notification.type)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={notification.title}
                secondary={
                  <>
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.primary"
                      sx={{ display: 'block' }}
                    >
                      {notification.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </Typography>
                  </>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Popover>
  );
};

export default NotificationPanel;
