import { getAppBaseUrl } from '@/utils/urlUtils';

import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Eye, EyeOff, Store, Clock, Loader2 } from 'lucide-react';
import { checkRateLimit, clearRateLimit, isValidEmail, isStrongPassword, logSecurityEvent } from '@/utils/securityUtils';
import HCaptcha from '@hcaptcha/react-hcaptcha';

const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

const Auth = () => {
  const { user, profile, signIn, signUp, signOut, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'admin', // Only admins can signup from login page
    hotelName: ''
  });

  React.useEffect(() => {
    (async () => {
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const { data } = await supabase.rpc('get_signup_enabled');
        if (typeof data === 'boolean') setSignupEnabled(data);
      } catch { /* default true */ }
    })();
  }, []);

  // Show loading while authentication is being initialized
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white dark:from-zinc-950 dark:to-zinc-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-pink-600 dark:text-pink-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is logged in and profile is active, redirect to main page
  if (user && profile?.status === 'active') {
    return <Navigate to="/" replace />;
  }

  // If user is logged in but account is paused
  if (user && profile?.status === 'paused') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white dark:from-zinc-950 dark:to-zinc-900 px-4">
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-pink-100 dark:border-zinc-800 overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-pink-500 via-pink-600 to-pink-500"></div>
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Account Pending</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Your account is awaiting approval from the administrator.</p>
            <div className="bg-gray-50 dark:bg-zinc-800/50 border dark:border-zinc-800 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1"><span className="font-medium">Name:</span> {profile?.name}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-1"><span className="font-medium">Role:</span> {profile?.role}</p>
              {profile?.hotel_name && <p className="text-sm text-gray-600 dark:text-gray-300 mb-1"><span className="font-medium">Hotel:</span> {profile?.hotel_name}</p>}
              <p className="text-sm dark:text-gray-300"><span className="font-medium">Status:</span> <span className="text-orange-600 dark:text-orange-400">Pending Approval</span></p>
            </div>
            <button
              onClick={signOut}
              className="w-full py-3 px-4 border border-gray-300 dark:border-zinc-700 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If user is logged in but account is deleted
  if (user && profile?.status === 'deleted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white dark:from-zinc-950 dark:to-zinc-900 px-4">
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-pink-100 dark:border-zinc-800 overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-red-500 via-red-600 to-red-500"></div>
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-red-600 text-2xl">⚠️</span>
            </div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">Account Deactivated</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Your account has been deactivated. Please contact support.</p>
            <button
              onClick={signOut}
              className="w-full py-3 px-4 border border-gray-300 dark:border-zinc-700 rounded-xl text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If user is logged in but profile is not loaded yet, show loading
  if (user && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white dark:from-zinc-950 dark:to-zinc-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-pink-600 dark:text-pink-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">Setting up your account...</p>
        </div>
      </div>
    );
  }

  const resetCaptcha = () => {
    setCaptchaToken(null);
    try { captchaRef.current?.resetCaptcha(); } catch { /* noop */ }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (HCAPTCHA_SITE_KEY && !captchaToken) {
      toast({ title: "Verify you're human", description: "Please complete the captcha.", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${getAppBaseUrl()}/auth`,
        captchaToken: captchaToken || undefined,
      });

      if (error) throw error;

      toast({
        title: "Password Reset Email Sent",
        description: "Check your email for a password reset link.",
      });
      setIsForgotPassword(false);
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send password reset email.",
        variant: "destructive",
      });
    } finally {
      resetCaptcha();
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Rate limiting check - prevent brute force attacks
    if (!checkRateLimit('login_attempt', 5, 60000)) {
      logSecurityEvent('LOGIN_RATE_LIMITED', { email: formData.email });
      toast({
        title: "Too Many Attempts",
        description: "Please wait 1 minute before trying again.",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    if (!isValidEmail(formData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    // For signup, enforce strong password requirements
    if (!isLogin) {
      const passwordCheck = isStrongPassword(formData.password);
      if (!passwordCheck.valid) {
        toast({
          title: "Weak Password",
          description: passwordCheck.message,
          variant: "destructive",
        });
        return;
      }
    }

    if (HCAPTCHA_SITE_KEY && !captchaToken) {
      toast({ title: "Verify you're human", description: "Please complete the captcha.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(formData.email, formData.password, captchaToken || undefined);
        if (error) {
          logSecurityEvent('LOGIN_FAILED', { email: formData.email, reason: error.message });
          if (error.message?.includes('Invalid login credentials')) {
            throw new Error('Invalid email or password. Please check your credentials and try again.');
          }
          throw error;
        }

        // Clear rate limit on successful login
        clearRateLimit('login_attempt');
        toast({
          title: "Welcome back!",
          description: "Successfully signed in.",
        });
      } else {
        if (formData.role === 'admin' && !formData.hotelName.trim()) {
          throw new Error('Hotel name is required for admin accounts');
        }

        const { error } = await signUp(
          formData.email,
          formData.password,
          formData.name,
          formData.role,
          formData.hotelName,
          undefined,
          { captchaToken: captchaToken || undefined }
        );

        if (error) {
          if (error.message?.includes('User already registered')) {
            throw new Error('An account with this email already exists. Please sign in instead or use a different email address.');
          }
          throw error;
        }

        if (formData.role === 'admin') {
          toast({
            title: "Registration Successful!",
            description: "Your admin account is pending approval. You'll be notified once activated.",
          });
        } else {
          toast({
            title: "Account Created!",
            description: "Successfully created your account.",
          });
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      toast({
        title: "Error",
        description: error.message || "An error occurred during authentication.",
        variant: "destructive",
      });
    } finally {
      resetCaptcha();
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 via-white to-pink-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 px-4 py-8">
      {/* Main Card */}
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-pink-100/50 dark:border-zinc-800/80 overflow-hidden">
        {/* Top Gradient Accent */}
        <div className="h-2 bg-gradient-to-r from-pink-500 via-pink-600 to-pink-500"></div>

        {/* Content */}
        <div className="p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 bg-gradient-to-br from-pink-600 to-pink-700 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/30">
              <Store className="w-7 h-7 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-1">
            {isForgotPassword ? 'Reset Password' : (isLogin ? 'Welcome Back' : 'Create Account')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm text-center mb-8">
            {isForgotPassword
              ? 'Enter your email to receive a reset link'
              : (isLogin
                ? 'Sign in to access your POS system'
                : 'Register your hotel for ZenPOS'
              )
            }
          </p>

          {/* Form */}
          <form onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit} className="space-y-5">
            {/* Sign Up Fields */}
            {!isLogin && !isForgotPassword && (
              <>
                {/* Full Name */}
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder="Enter your full name"
                    className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-900 dark:text-gray-100 focus:border-pink-500 focus:ring-pink-500/20 transition-all"
                  />
                </div>

                {/* Hotel Name - Required for admin signup */}
                <div className="space-y-2">
                  <Label htmlFor="hotelName" className="text-sm font-medium text-gray-700 dark:text-gray-300">Hotel Name</Label>
                  <Input
                    id="hotelName"
                    type="text"
                    value={formData.hotelName}
                    onChange={(e) => setFormData(prev => ({ ...prev, hotelName: e.target.value }))}
                    required
                    placeholder="Enter your hotel name"
                    className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-900 dark:text-gray-100 focus:border-pink-500 focus:ring-pink-500/20 transition-all"
                  />
                </div>

                {/* Info message */}
                <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 rounded-xl p-3">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Note:</strong> Your account will be reviewed by our team.
                    Staff members can be added after your account is activated.
                  </p>
                </div>
              </>
            )}

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
                placeholder="Enter your email"
                className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-900 dark:text-gray-100 focus:border-pink-500 focus:ring-pink-500/20 transition-all"
              />
            </div>

            {/* Password */}
            {!isForgotPassword && (
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    placeholder="Enter your password"
                    minLength={isLogin ? 6 : 8}
                    className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-900 dark:text-gray-100 focus:border-pink-500 focus:ring-pink-500/20 transition-all pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {/* hCaptcha */}
            {HCAPTCHA_SITE_KEY ? (
              <div className="flex justify-center">
                <HCaptcha
                  ref={captchaRef}
                  sitekey={HCAPTCHA_SITE_KEY}
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                  onError={() => setCaptchaToken(null)}
                  theme="light"
                />
              </div>
            ) : null}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white font-semibold rounded-xl shadow-lg shadow-pink-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Please wait...
                </>
              ) : (
                isForgotPassword ? 'Send Reset Link' : (isLogin ? 'Sign In' : 'Create Account')
              )}
            </button>

            {/* Forgot Password Link - Only on Login */}
            {isLogin && !isForgotPassword && (
              <button
                type="button"
                onClick={() => setIsForgotPassword(true)}
                className="w-full text-sm text-pink-600 hover:text-pink-700 dark:text-pink-400 dark:hover:text-pink-300 font-medium transition-colors"
              >
                Forgot password?
              </button>
            )}
          </form>

          {/* Footer Link */}
          <div className="mt-8 text-center">
            {!isForgotPassword && isLogin && !signupEnabled ? null : (
              <button
                onClick={() => {
                  if (isForgotPassword) {
                    setIsForgotPassword(false);
                  } else {
                    if (isLogin && !signupEnabled) return;
                    setIsLogin(!isLogin);
                    setFormData({ email: '', password: '', name: '', role: 'user', hotelName: '' });
                  }
                }}
                className="text-sm text-gray-600 dark:text-gray-400"
              >
                {isForgotPassword
                  ? 'Back to sign in'
                  : (isLogin
                    ? <>Don't have an account? <span className="text-pink-600 font-semibold hover:text-pink-700">Sign up</span></>
                    : <>Already have an account? <span className="text-pink-600 font-semibold hover:text-pink-700">Sign in</span></>
                  )
                }
              </button>
            )}
          </div>
        </div >
      </div >
    </div >
  );
};

export default Auth;
