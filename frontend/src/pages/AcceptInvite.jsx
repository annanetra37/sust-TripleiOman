import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function AcceptInvite() {
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
    setLoading(true);
    try {
      await api.acceptInvite({ token, password });
      navigate('/login');
    } catch (err) {
      setError(err.error || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md card space-y-4">
        <h1 className="text-xl font-bold">Set Your Password</h1>
        <p className="text-sm text-gray-500">Create a password to activate your account.</p>
        {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
        <input type="password" className="input" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input type="password" className="input" required placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button type="submit" className="btn-primary w-full" disabled={loading}>{loading ? 'Activating...' : 'Activate Account'}</button>
      </form>
    </div>
  );
}
