import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSent(true);
    } catch {} finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 px-4">
      <div className="w-full max-w-md card">
        <h1 className="text-xl font-bold mb-2">Reset Password</h1>
        {sent ? (
          <div>
            <p className="text-green-700 bg-green-50 p-3 rounded-lg text-sm">If the email exists, a reset link has been sent.</p>
            <Link to="/login" className="btn-primary block text-center mt-4">Back to Login</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-gray-500 text-sm">Enter your email to receive a password reset link.</p>
            <input type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
            <Link to="/login" className="block text-center text-sm text-brand-600 hover:underline">Back to Login</Link>
          </form>
        )}
      </div>
    </div>
  );
}
