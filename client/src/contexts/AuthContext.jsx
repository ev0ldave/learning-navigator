import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/auth/me');
      if (response.data.success) {
        setUser(response.data.user);
        setIsAuthenticated(true);
        // Check if we should prompt for phone number
        if (response.data.promptForPhone) {
          setShowPhonePrompt(true);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (token) => {
    localStorage.setItem('token', token);
    await checkAuth();
  };

  const loginLocal = async (email, password) => {
    try {
      const response = await api.post('/auth/local/login', { email, password });
      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        // Use checkAuth to get full user data including phone prompt status
        await checkAuth();
        return { success: true };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const register = async (userData) => {
    try {
      const response = await api.post('/auth/local/register', userData);
      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        setUser(response.data.user);
        setIsAuthenticated(true);
        return { success: true };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      };
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const updateUser = (updatedUser) => {
    setUser(prev => ({ ...prev, ...updatedUser }));
  };

  const dismissPhonePrompt = async () => {
    try {
      await api.post('/auth/dismiss-phone-prompt');
      setShowPhonePrompt(false);
    } catch (error) {
      console.error('Error dismissing phone prompt:', error);
      // Still hide the prompt even if the API call fails
      setShowPhonePrompt(false);
    }
  };

  const savePhoneNumber = async (phone, enableSmsReminders = true) => {
    try {
      const response = await api.put(`/users/${user._id}`, {
        phone,
        notificationPreferences: {
          ...user.notificationPreferences,
          smsReminders: enableSmsReminders
        }
      });
      if (response.data.success) {
        setUser(response.data.user);
        setShowPhonePrompt(false);
        return { success: true };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to save phone number' 
      };
    }
  };

  const isAdmin = () => user?.role === 'administrator';
  const isNavigator = () => ['learning_navigator', 'administrator'].includes(user?.role);
  const isStudent = () => user?.role === 'student';

  const value = {
    user,
    loading,
    isAuthenticated,
    showPhonePrompt,
    login,
    loginLocal,
    register,
    logout,
    updateUser,
    checkAuth,
    dismissPhonePrompt,
    savePhoneNumber,
    isAdmin,
    isNavigator,
    isStudent
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
