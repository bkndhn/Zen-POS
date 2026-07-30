import { getAppBaseUrl } from '@/utils/urlUtils';
import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Eye, EyeOff, Store, Clock, Loader2 } from 'lucide-react';
import { checkRateLimit, clearRateLimit, isValidEmail, logSecurityEvent } from '@/utils/securityUtils';
import HCaptcha from '@hcaptcha/react-hcaptcha';

const HCAPTCHA_SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

const Auth = () => {
  const { user, profile, signIn, signOut, loading: authLoading } = useAuth();
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [rememberMe, setRememberMe] = useState(false);

  React.useEffect(() => {
    const savedEmail = localStorage.getItem('hotel_pos_saved_email');
    if (savedEmail) {
      try {
        const decoded = decodeURIComponent(atob(savedEmail));
        setFormData(prev => ({ ...prev, email: decoded }));
      } catch {
        setFormData(prev => ({ ...prev, email: savedEmail }));
      }
      setRememberMe(true);
    }
  }, []);

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

  if (user && profile?.status !== 'paused' && profile?.status !== 'deleted') {
    return <Navigate to="/" replace />;
  }

  if (user && profile?.status === 'paused') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white dark:from-zinc-950 dark:to-zinc-900 px-4">
        <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-pink-100 dark:border-zinc-800 overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-pink-500 via-pink-600 to-pink-500"></div>
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-orange-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Account Paused</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Your account has been paused by an administrator.</p>
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
      import.meta.env.DEV && console.error('Password reset error:', error);
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

    if (!checkRateLimit('login_attempt', 5, 60000)) {
      logSecurityEvent('LOGIN_RATE_LIMITED', { email: formData.email });
      toast({
        title: "Too Many Attempts",
        description: "Please wait 1 minute before trying again.",
        variant: "destructive",
      });
      return;
    }

    if (!isValidEmail(formData.email)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    if (HCAPTCHA_SITE_KEY && !captchaToken) {
      toast({ title: "Verify you're human", description: "Please complete the captcha.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const { error } = await signIn(formData.email, formData.password, captchaToken || undefined);
      if (error) {
        logSecurityEvent('LOGIN_FAILED', { email: formData.email, reason: error.message });
        if (error.message?.includes('Invalid login credentials')) {
          throw new Error('Invalid email or password. Please check your credentials and try again.');
        }
        throw error;
      }

      clearRateLimit('login_attempt');
      
      if (rememberMe) {
        localStorage.setItem('hotel_pos_saved_email', btoa(encodeURIComponent(formData.email)));
      } else {
        localStorage.removeItem('hotel_pos_saved_email');
      }
    } catch (error: any) {
      logSecurityEvent('AUTH_ERROR', { email: formData.email, error: error.message });
      toast({
        title: "Error",
        description: error.message || "Authentication failed.",
        variant: "destructive",
      });
    } finally {
      resetCaptcha();
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 via-white to-pink-50/30 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 px-4 py-8">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-pink-100/50 dark:border-zinc-800/80 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-pink-500 via-pink-600 to-pink-500"></div>

        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 bg-gradient-to-br from-pink-600 to-pink-700 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/30">
              <Store className="w-7 h-7 text-white" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-1">
            {isForgotPassword ? 'Reset Password' : 'Welcome Back'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm text-center mb-8">
            {isForgotPassword
              ? 'Enter your email to receive a reset link'
              : 'Sign in to access your POS system'
            }
          </p>

          <form onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit} className="space-y-5">
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

            {!isForgotPassword && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</Label>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-xs font-semibold text-pink-600 hover:text-pink-700 dark:text-pink-400 hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    placeholder="Enter your password"
                    className="h-12 rounded-xl border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-gray-900 dark:text-gray-100 focus:border-pink-500 focus:ring-pink-500/20 transition-all pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            {!isForgotPassword && (
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500 dark:border-zinc-800 dark:bg-zinc-950"
                />
                <label htmlFor="rememberMe" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  Remember my email
                </label>
              </div>
            )}

            {HCAPTCHA_SITE_KEY && (
              <div className="flex justify-center pt-2">
                <HCaptcha
                  ref={captchaRef}
                  sitekey={HCAPTCHA_SITE_KEY}
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-700 hover:to-pink-800 text-white font-semibold rounded-xl shadow-lg shadow-pink-500/25 hover:shadow-pink-500/35 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isForgotPassword ? (
                'Send Reset Link'
              ) : (
                'Sign In'
              )}
            </button>

            {isForgotPassword && (
              <button
                type="button"
                onClick={() => setIsForgotPassword(false)}
                className="w-full text-center text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors pt-2"
              >
                Back to Sign In
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default Auth;
