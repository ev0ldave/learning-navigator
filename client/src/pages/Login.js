import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Divider,
  Alert,
  CircularProgress,
  Tabs,
  Tab
} from '@mui/material';
import { Google as GoogleIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loginLocal, register } = useAuth();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: ''
  });

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleGoogleLogin = () => {
    // OAuth redirects must go directly to the backend server, not through the React proxy
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';
    window.location.href = `${apiUrl}/auth/google`;
  };

  const handleLocalLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await loginLocal(loginForm.email, loginForm.password);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.message || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await register(registerForm);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.message || 'Registration failed');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2
      }}
    >
      <Card sx={{ maxWidth: 450, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Typography variant="h4" component="h1" gutterBottom fontWeight={600}>
              Learning Navigator
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Sign in to manage your learning sessions
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Button
            variant="contained"
            fullWidth
            size="large"
            startIcon={<GoogleIcon />}
            onClick={handleGoogleLogin}
            sx={{ mb: 3 }}
          >
            Continue with Google
          </Button>

          <Divider sx={{ my: 3 }}>
            <Typography variant="body2" color="text.secondary">
              OR (Development Only)
            </Typography>
          </Divider>

          <Tabs
            value={tab}
            onChange={(e, newValue) => setTab(newValue)}
            variant="fullWidth"
            sx={{ mb: 3 }}
          >
            <Tab label="Login" />
            <Tab label="Register" />
          </Tabs>

          {tab === 0 ? (
            <Box component="form" onSubmit={handleLocalLogin}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                margin="normal"
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                required
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                margin="normal"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
              />
              <Button
                type="submit"
                variant="outlined"
                fullWidth
                size="large"
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Sign In'}
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleRegister}>
              <TextField
                fullWidth
                label="First Name"
                margin="normal"
                value={registerForm.firstName}
                onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                required
              />
              <TextField
                fullWidth
                label="Last Name"
                margin="normal"
                value={registerForm.lastName}
                onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                required
              />
              <TextField
                fullWidth
                label="Email"
                type="email"
                margin="normal"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                required
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                margin="normal"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                required
              />
              <Button
                type="submit"
                variant="outlined"
                fullWidth
                size="large"
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Create Account'}
              </Button>
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, textAlign: 'center' }}>
            Test accounts (dev only):<br />
            1411andrew@gmail.com | ev0ldave@gmail.com | trlandrew@students.highline.edu
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;
