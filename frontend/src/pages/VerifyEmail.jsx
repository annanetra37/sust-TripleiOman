import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Mail } from 'lucide-react';
import { LogoMark } from '../components/Logo';

export default function VerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || '';
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.verifyEmail({ email, otp });
      setSuccess('Email verified! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await api.resendOtp(email);
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown((c) => {
          if (c <= 1) { clearInterval(timer); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.error || 'Failed to resend');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <LogoMark className="w-12 h-12 text-brand-600 mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Verify Your Email</h1>
          <p className="text-gray-500 mt-1">Enter the 6-digit code sent to <strong>{email}</strong></p>
        </div>

        <form onSubmit={handleVerify} className="card space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          {success && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{success}</div>}

          <input
            type="text" className="input text-center text-2xl tracking-widest" maxLength={6}
            placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          />

          <button type="submit" className="btn-primary w-full" disabled={loading || otp.length !== 6}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Didn't receive the code?{' '}
            <button type="button" className="text-brand-600 hover:underline disabled:text-gray-400"
              disabled={resendCooldown > 0} onClick={handleResend}>
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
