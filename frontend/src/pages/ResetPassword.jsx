import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setError('');
    setLoading(true);
    try {
      await api.resetPassword({ token, password });
      navigate('/login', { state: { message: 'Password reset. Please sign in.' } });
    } catch (err) {
      setError(err.error || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md card space-y-4">
        <h1 className="text-xl font-bold">Set New Password</h1>
        {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <input type="password" className="input" required placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input type="password" className="input" required placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <p className="text-xs text-gray-400">8+ chars, uppercase, number, special character</p>
        <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</button>
        <Link to="/login" className="block text-center text-sm text-brand-600 hover:underline">Back to Login</Link>
      </form>
    </div>
  );
}
