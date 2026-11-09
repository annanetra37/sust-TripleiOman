import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, session } from '../lib/api';
import { useI18n } from '../i18n';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setLang, setDigits, setHijri } = useI18n();

  const applyPrefs = useCallback((u) => {
    if (!u) return;
    setDigits(u.digitStyle || 'western');
    setHijri(!!u.showHijri);
  }, [setDigits, setHijri]);

  const loadOrg = useCallback(async (u) => {
    const ms = u?.memberships || [];
    const stored = session.orgId;
    // Staff may open a non-member org through an approved, time-boxed support grant.
    if (stored && (ms.find((m) => m.organisation.id === stored) || u?.platformRole)) {
      try { const o = await api.get('/orgs/current'); setOrg(o); return o; } catch { /* fall back below */ }
    }
    const id = ms[0]?.organisation.id || null;
    session.setOrg(id);
    if (!id) { setOrg(null); return null; }
    try { const o = await api.get('/orgs/current'); setOrg(o); return o; } catch { setOrg(null); return null; }
  }, []);

  const refreshMe = useCallback(async () => {
    if (!session.access) { setUser(null); setLoading(false); return null; }
    try {
      const me = await api.get('/auth/me', { org: false });
      setUser(me); applyPrefs(me);
      await loadOrg(me);
      return me;
    } catch {
      session.clear(); setUser(null); setOrg(null); return null;
    } finally { setLoading(false); }
  }, [applyPrefs, loadOrg]);

  useEffect(() => { refreshMe(); }, [refreshMe]);
  useEffect(() => {
    const onLogout = () => { setUser(null); setOrg(null); };
    window.addEventListener('tio:logout', onLogout);
    return () => window.removeEventListener('tio:logout', onLogout);
  }, []);

  /** Complete a login step: the server returns tokens, or an MFA challenge/enrolment. */
  const acceptSession = useCallback(async (res) => {
    if (res.accessToken) {
      session.setTokens(res.accessToken, res.refreshToken);
      setUser(res.user); applyPrefs(res.user);
      if (res.user?.locale) setLang(res.user.locale);
      await loadOrg(res.user);
    }
    return res;
  }, [applyPrefs, loadOrg, setLang]);

  const switchOrg = useCallback(async (id) => {
    session.setOrg(id);
    const o = await api.get('/orgs/current');
    setOrg(o);
    return o;
  }, []);

  const logout = useCallback(() => {
    session.clear(); session.setOrg(null); setUser(null); setOrg(null);
  }, []);

  const role = org?.myRole;
  const can = useCallback((perm) => {
    const M = {
      'org.manage': ['OWNER', 'FINANCE_ADMIN'], 'members.manage': ['OWNER'],
      'data.write': ['OWNER', 'FINANCE_ADMIN', 'PREPARER', 'EXTERNAL_ACCOUNTANT'],
      'return.prepare': ['OWNER', 'FINANCE_ADMIN', 'PREPARER', 'EXTERNAL_ACCOUNTANT'],
      'return.approve': ['OWNER', 'FINANCE_ADMIN', 'APPROVER'],
      'return.file': ['OWNER', 'FINANCE_ADMIN', 'APPROVER', 'PREPARER', 'EXTERNAL_ACCOUNTANT'],
      'einvoice.send': ['OWNER', 'FINANCE_ADMIN', 'APPROVER', 'PREPARER', 'EXTERNAL_ACCOUNTANT'],
      'audit.read': ['OWNER', 'FINANCE_ADMIN', 'APPROVER', 'AUDITOR'], 'support.grant': ['OWNER', 'FINANCE_ADMIN'],
    };
    return !!role && (M[perm] || []).includes(role);
  }, [role]);

  return <Ctx.Provider value={{ user, org, role, loading, can, refreshMe, acceptSession, switchOrg, logout, setOrg }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
