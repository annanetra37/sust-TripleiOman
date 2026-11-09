import { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { LogoFull } from '../components/Logo';
import COUNTRIES from '../utils/countries';

const INDUSTRIES = ['Technology', 'Manufacturing', 'Finance', 'Healthcare', 'Energy', 'Retail', 'Transportation', 'Agriculture', 'Construction', 'Other'];
const SIZES = ['1-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'];
const STRUCTURES = ['Corporation', 'LLC', 'Partnership', 'Sole Proprietorship', 'Non-profit', 'Public Company'];

// Personal / free email providers that are blocked.
const PERSONAL_DOMAINS = new Set([
  'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','yahoo.fr','yahoo.de',
  'hotmail.com','hotmail.co.uk','hotmail.fr','hotmail.de',
  'outlook.com','live.com','msn.com',
  'aol.com','icloud.com','me.com','mac.com',
  'mail.com','protonmail.com','proton.me','zoho.com',
  'yandex.com','yandex.ru','gmx.com','gmx.de','gmx.net',
  'tutanota.com','tuta.io','fastmail.com',
  'qq.com','163.com','126.com','sina.com',
  'web.de','t-online.de','freenet.de',
  'rediffmail.com','inbox.com','mail.ru',
]);

function isPersonalEmail(email) {
  if (!email || !email.includes('@')) return false;
  const domain = email.toLowerCase().split('@')[1];
  return PERSONAL_DOMAINS.has(domain);
}

function validatePassword(pw) {
  if (!pw) return '';
  const issues = [];
  if (pw.length < 8) issues.push('at least 8 characters');
  if (!/[A-Z]/.test(pw)) issues.push('an uppercase letter');
  if (!/[0-9]/.test(pw)) issues.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('a special character');
  if (issues.length === 0) return '';
  return `Password must include ${issues.join(', ')}.`;
}

// Small reusable inline error label.
function FieldError({ message }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}

export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', phone: '',
    companyName: '', country: '', industry: '', companySize: '',
    ownershipType: '', yearEstablished: '', legalStructure: '',
    hqLocation: '', stockExchange: '', tickerSymbol: '',
  });

  // Per-field errors — only shown after the user has interacted with the
  // field (on blur) so we don't flash red on a fresh, empty form.
  const [fieldErrors, setFieldErrors] = useState({});

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));

    // Clear field error on typing (re-validated on blur).
    if (fieldErrors[key]) {
      setFieldErrors((prev) => ({ ...prev, [key]: '' }));
    }
  };

  const validateField = useCallback((key, value) => {
    if (key === 'email') {
      if (!value) return 'Email is required.';
      if (isPersonalEmail(value)) {
        return 'Please use a business email address. Personal emails (Gmail, Hotmail, Yahoo, etc.) are not accepted.';
      }
    }
    if (key === 'password') {
      return validatePassword(value);
    }
    return '';
  }, []);

  const handleBlur = (key) => () => {
    const msg = validateField(key, form[key]);
    setFieldErrors((prev) => ({ ...prev, [key]: msg }));
  };

  // Validate step 1 fields before advancing to step 2.
  const step1Valid = () => {
    const emailErr = validateField('email', form.email);
    const pwErr = validateField('password', form.password);

    const errors = {};
    if (emailErr) errors.email = emailErr;
    if (pwErr) errors.password = pwErr;
    if (!form.firstName.trim()) errors.firstName = 'First name is required.';
    if (!form.lastName.trim()) errors.lastName = 'Last name is required.';

    setFieldErrors((prev) => ({ ...prev, ...errors }));
    return Object.values(errors).every((v) => !v);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (step === 1) {
      if (!step1Valid()) return;
      return setStep(2);
    }

    setLoading(true);
    try {
      await api.signup(form);
      navigate('/verify-email', { state: { email: form.email } });
    } catch (err) {
      setError(err.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-6">
          <LogoFull className="mb-3" size="large" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">Create Account</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Step {step} of 2 — {step === 1 ? 'Personal Information' : 'Company Details'}</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-6">
          <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-brand-600' : 'bg-gray-200'}`} />
          <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-brand-600' : 'bg-gray-200'}`} />
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

          {step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    className={`input ${fieldErrors.firstName ? 'border-red-400 focus:ring-red-400' : ''}`}
                    required
                    value={form.firstName}
                    onChange={set('firstName')}
                    onBlur={handleBlur('firstName')}
                  />
                  <FieldError message={fieldErrors.firstName} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    className={`input ${fieldErrors.lastName ? 'border-red-400 focus:ring-red-400' : ''}`}
                    required
                    value={form.lastName}
                    onChange={set('lastName')}
                    onBlur={handleBlur('lastName')}
                  />
                  <FieldError message={fieldErrors.lastName} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  className={`input ${fieldErrors.email ? 'border-red-400 focus:ring-red-400' : ''}`}
                  required
                  value={form.email}
                  onChange={set('email')}
                  onBlur={handleBlur('email')}
                  placeholder="you@company.com"
                />
                <FieldError message={fieldErrors.email} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  className={`input ${fieldErrors.password ? 'border-red-400 focus:ring-red-400' : ''}`}
                  required
                  value={form.password}
                  onChange={set('password')}
                  onBlur={handleBlur('password')}
                />
                {fieldErrors.password
                  ? <FieldError message={fieldErrors.password} />
                  : <p className="text-xs text-gray-400 mt-1">8+ chars, uppercase, number, special character</p>
                }
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" className="input" value={form.phone} onChange={set('phone')} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input className="input" required value={form.companyName} onChange={set('companyName')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                  <select className="input" required value={form.country} onChange={set('country')}>
                    <option value="">Select country...</option>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">HQ Location</label>
                  <input className="input" value={form.hqLocation} onChange={set('hqLocation')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry *</label>
                  <select className="input" required value={form.industry} onChange={set('industry')}>
                    <option value="">Select...</option>
                    {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Size *</label>
                  <select className="input" required value={form.companySize} onChange={set('companySize')}>
                    <option value="">Select...</option>
                    {SIZES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Legal Structure</label>
                  <select className="input" value={form.legalStructure} onChange={set('legalStructure')}>
                    <option value="">Select...</option>
                    {STRUCTURES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year Established</label>
                  <input type="number" className="input" min="1800" max="2030" value={form.yearEstablished} onChange={set('yearEstablished')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Exchange</label>
                  <input className="input" value={form.stockExchange} onChange={set('stockExchange')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ticker Symbol</label>
                  <input className="input" value={form.tickerSymbol} onChange={set('tickerSymbol')} />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3">
            {step === 2 && (
              <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>Back</button>
            )}
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {step === 1 ? 'Next' : loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>

          <p className="text-center text-sm text-gray-500">
            Already have an account? <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
