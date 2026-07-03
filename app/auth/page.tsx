'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Icon from '@/components/AppIcon';

const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 64;

export default function AuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = supabaseBrowser();
  const redirectPath = searchParams.get('redirect') || '/dashboard';
  const shouldSwitchAccount = searchParams.get('switch') === '1';
  const requestedMode = searchParams.get('mode');
  
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    acceptTerms: false
  });

  useEffect(() => {
    if (requestedMode === 'login' || requestedMode === 'signup' || requestedMode === 'reset') {
      setMode(requestedMode);
      setError('');
      setMessage('');
    }
  }, [requestedMode]);

  // Check if user is already logged in
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (shouldSwitchAccount) {
        if (session) {
          await supabase.auth.signOut();
        }
        return;
      }

      if (session) {
        router.push(redirectPath);
      }
    };
    checkUser();
  }, [supabase, router, redirectPath, shouldSwitchAccount]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const validateForm = () => {
    if (!formData.email) {
      setError('Email is required');
      return false;
    }

    if (mode !== 'reset' && !formData.password) {
      setError('Email and password are required');
      return false;
    }

    if (mode === 'signup') {
      if (!formData.fullName) {
        setError('Full name is required');
        return false;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return false;
      }
      if (formData.password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
        return false;
      }
      if (formData.password.length > MAX_PASSWORD_LENGTH) {
        setError(`Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`);
        return false;
      }
      if (!formData.acceptTerms) {
        setError('You must accept the terms and conditions');
        return false;
      }
    }

    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(typeof result?.error === 'string' ? result.error : 'Unable to sign in right now. Please try again.');
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await supabase.from('profiles').upsert({
          id: userData.user.id,
          email: userData.user.email || formData.email || '',
          display_name: userData.user.user_metadata?.full_name || formData.fullName,
          updated_at: new Date().toISOString()
        });
      }

      setMessage('Login successful! Redirecting...');
      setTimeout(() => {
        router.push(redirectPath);
      }, 1000);
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          fullName: formData.fullName,
          acceptTerms: formData.acceptTerms,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(typeof result?.error === 'string' ? result.error : 'We could not create your account. Check the form and try again.');
        return;
      }

      if (result?.emailConfirmationRequired === false) {
        setMessage('Account created successfully! Redirecting...');
        setTimeout(() => {
          router.push(redirectPath);
        }, 1000);
      } else {
        setMessage('Please check your email and click the confirmation link to complete your registration.');
      }
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email) {
      setError('Email is required');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(typeof result?.error === 'string' ? result.error : 'We could not send reset instructions right now. Please try again.');
        return;
      }

      setMessage(
        typeof result?.message === 'string'
          ? result.message
          : 'If an account exists for that email, password reset instructions will be sent.'
      );
    } catch {
      setError('Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      });

      if (error) {
        setError('Google sign-in failed. Please try again.');
      }
    } catch {
      setError('Google sign-in failed. Please try again.');
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      confirmPassword: '',
      fullName: '',
      acceptTerms: false
    });
    setError('');
    setMessage('');
  };

  const switchMode = (newMode: 'login' | 'signup' | 'reset') => {
    setMode(newMode);
    resetForm();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="Grid3X3" size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">CollabBoard</h1>
          <p className="text-gray-600 mt-1">
            {mode === 'login' && 'Welcome back! Please sign in to your account.'}
            {mode === 'signup' && 'Create your account to get started.'}
            {mode === 'reset' && 'Reset your password'}
          </p>
          {shouldSwitchAccount && mode === 'login' && (
            <p className="text-sm text-gray-500 mt-2">
              You can now sign in with a different account.
            </p>
          )}
        </div>

        {/* Messages */}
        {message && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg" role="status" aria-live="polite">
            <div className="flex items-center">
              <Icon name="CheckCircle" size={16} className="text-green-600 mr-2" />
              <p className="text-sm text-green-700">{message}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert" aria-live="assertive">
            <div className="flex items-center">
              <Icon name="AlertCircle" size={16} className="text-red-600 mr-2" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Forms */}
        <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handlePasswordReset}>
          <div className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="Enter your full name"
                  autoComplete="name"
                  disabled={loading}
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Enter your email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={loading}
                required
              />
            </div>

            {mode !== 'reset' && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder={mode === 'signup' ? 'Create a strong passphrase' : 'Enter your password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    maxLength={MAX_PASSWORD_LENGTH}
                    disabled={loading}
                    required
                    className="pr-24"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute inset-y-0 right-3 text-sm font-medium text-blue-600 hover:text-blue-500"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {mode === 'signup' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Use at least {MIN_PASSWORD_LENGTH} characters. Passphrases are supported up to {MAX_PASSWORD_LENGTH} characters.
                  </p>
                )}
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    maxLength={MAX_PASSWORD_LENGTH}
                    disabled={loading}
                    required
                    className="pr-24"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="absolute inset-y-0 right-3 text-sm font-medium text-blue-600 hover:text-blue-500"
                    aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                  >
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <div className="flex items-center">
                <input
                  id="acceptTerms"
                  name="acceptTerms"
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled={loading}
                  required
                />
                <label htmlFor="acceptTerms" className="ml-2 text-sm text-gray-600">
                  I accept the{' '}
                  <a href="/terms" className="text-blue-600 hover:text-blue-500">
                    Terms of Service
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" className="text-blue-600 hover:text-blue-500">
                    Privacy Policy
                  </a>
                </label>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              loading={loading}
            >
              {mode === 'login' && (loading ? 'Signing in...' : 'Sign In')}
              {mode === 'signup' && (loading ? 'Creating account...' : 'Create Account')}
              {mode === 'reset' && (loading ? 'Sending...' : 'Send Reset Email')}
            </Button>
          </div>
        </form>

        {/* Google Sign In */}
        {mode !== 'reset' && (
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <Icon name="Chrome" size={16} className="mr-2" />
              Google
            </Button>
          </div>
        )}

        {/* Mode Switcher */}
        <div className="mt-6 text-center">
          {mode === 'login' && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Don&apos;t have an account?{' '}
                <button
                  onClick={() => switchMode('signup')}
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  Sign up
                </button>
              </p>
              <p className="text-sm text-gray-600">
                <button
                  onClick={() => switchMode('reset')}
                  className="text-blue-600 hover:text-blue-500 font-medium"
                >
                  Forgot your password?
                </button>
              </p>
            </div>
          )}

          {mode === 'signup' && (
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <button
                onClick={() => switchMode('login')}
                className="text-blue-600 hover:text-blue-500 font-medium"
              >
                Sign in
              </button>
            </p>
          )}

          {mode === 'reset' && (
            <p className="text-sm text-gray-600">
              Remember your password?{' '}
              <button
                onClick={() => switchMode('login')}
                className="text-blue-600 hover:text-blue-500 font-medium"
              >
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
