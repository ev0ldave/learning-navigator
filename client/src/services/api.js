import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authAPI = {
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  loginLocal: (email, password) => api.post('/auth/local/login', { email, password }),
  register: (data) => api.post('/auth/local/register', data)
};

// User endpoints
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getNavigators: () => api.get('/users/navigators'),
  getStudents: (params) => api.get('/users/students', { params }),
  getMyStudents: () => api.get('/users/my-students'),
  getById: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.put(`/users/${id}`, data),
  updateRole: (id, role) => api.put(`/users/${id}/role`, { role }),
  updateStatus: (id, isActive) => api.put(`/users/${id}/status`, { isActive }),
  assignNavigator: (studentId, navigatorId) => 
    api.put(`/users/${studentId}/assign-navigator`, { navigatorId }),
  updateAvailability: (id, availability) => 
    api.put(`/users/${id}/availability`, { availability }),
  deactivate: (id) => api.delete(`/users/${id}`),
  registerUser: (data) => api.post('/users/register', data)
};

// Meeting endpoints
export const meetingsAPI = {
  getAll: (params) => api.get('/meetings', { params }),
  getUpcoming: () => api.get('/meetings/upcoming'),
  getById: (id) => api.get(`/meetings/${id}`),
  create: (data) => api.post('/meetings', data),
  update: (id, data) => api.put(`/meetings/${id}`, data),
  cancel: (id, reason) => api.put(`/meetings/${id}/cancel`, { reason }),
  complete: (id) => api.put(`/meetings/${id}/complete`),
  markNoShow: (id) => api.put(`/meetings/${id}/no-show`),
  deleteSeries: (id, scope = 'all', reason) => 
    api.delete(`/meetings/series/${id}`, { params: { scope }, data: { reason } }),
  updateRecurrence: (id, frequency, endDate) =>
    api.put(`/meetings/series/${id}/recurrence`, { frequency, endDate })
};

// Calendar endpoints
export const calendarAPI = {
  getEvents: (start, end) => api.get('/calendar/events', { params: { start, end } }),
  getAvailability: (navigatorId, date) => 
    api.get(`/calendar/availability/${navigatorId}`, { params: { date } }),
  getSlots: (navigatorId, startDate, endDate, duration) =>
    api.get(`/calendar/slots/${navigatorId}`, { params: { startDate, endDate, duration } })
};

// Weekly hours / availability endpoints
export const availabilityAPI = {
  getWeeklyHours: () => api.get('/availability'),
  getByUser: (userId) => api.get(`/availability/user/${userId}`),
  updateWeeklyHours: (data) => api.put('/availability', data),
  getSlots: (userId, date, duration) => 
    api.get(`/availability/slots/${userId}`, { params: { date, duration } })
};

// Note endpoints
export const notesAPI = {
  getAll: (params) => api.get('/notes', { params }),
  getByStudent: (studentId, type) => 
    api.get(`/notes/student/${studentId}`, { params: { type } }),
  getByMeeting: (meetingId) => api.get(`/notes/meeting/${meetingId}`),
  getById: (id) => api.get(`/notes/${id}`),
  create: (data) => api.post('/notes', data),
  update: (id, data) => api.put(`/notes/${id}`, data),
  share: (id) => api.put(`/notes/${id}/share`),
  delete: (id) => api.delete(`/notes/${id}`)
};

// Report endpoints
export const reportsAPI = {
  getAll: (params) => api.get('/reports', { params }),
  getById: (id) => api.get(`/reports/${id}`),
  getOptions: () => api.get('/reports/config/options'),
  generateIndividual: (data) => api.post('/reports/individual', data),
  generateGroup: (data) => api.post('/reports/group', data),
  generateSessionHistory: (data) => api.post('/reports/session-history', data),
  generateCustom: (data) => api.post('/reports/custom', data),
  export: (id, format) => api.get(`/reports/${id}/export/${format}`, {
    responseType: format === 'json' ? 'json' : 'arraybuffer'
  }),
  delete: (id) => api.delete(`/reports/${id}`)
};

// Notification endpoints
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.put(`/notifications/${id}/read`),
  markAllAsRead: () => api.put('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
  deleteAll: () => api.delete('/notifications')
};

// Admin endpoints
export const adminAPI = {
  // Job management (simplified - stats only)
  getJobStats: () => api.get('/admin/jobs/stats'),
  
  // School Quarter management
  getQuarters: () => api.get('/admin/quarters'),
  getActiveQuarter: () => api.get('/admin/quarters/active'),
  createQuarter: (data) => api.post('/admin/quarters', data),
  updateQuarter: (id, data) => api.put(`/admin/quarters/${id}`, data),
  activateQuarter: (id) => api.put(`/admin/quarters/${id}/activate`),
  deleteQuarter: (id) => api.delete(`/admin/quarters/${id}`)
};

export default api;
