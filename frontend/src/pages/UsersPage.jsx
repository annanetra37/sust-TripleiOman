import { useState, useEffect } from 'react';
import api from '../services/api';
import { UserPlus, Trash2, Shield, ToggleLeft, ToggleRight, Copy, Check, XCircle } from 'lucide-react';
import { HelpBanner, InfoTip } from '../components/HelpSystem';
import { useT } from '../i18n';

export default function UsersPage() {
  const { t } = useT();
  const [users, setUsers] = useState([]);
  const [orgUnits, setOrgUnits] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [showPerms, setShowPerms] = useState(null);
  const [invite, setInvite] = useState({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', role: 'CUSTOM', permissions: [] });
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.getUsers(), api.getOrgUnits()])
      .then(([u, o]) => { setUsers(u); setOrgUnits(o); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Initialize permissions when opening invite modal
  const openInviteModal = () => {
    setInvite({
      firstName: '', lastName: '', email: '', phone: '', jobTitle: '', role: 'CUSTOM',
      permissions: orgUnits.map((ou) => ({ orgUnitId: ou.id, name: ou.name, country: ou.country, canView: false, canUpload: false, canDelete: false })),
    });
    setInviteResult(null);
    setShowInvite(true);
  };

  const toggleAllPermsForUnit = (idx) => {
    const p = invite.permissions[idx];
    const allOn = p.canView && p.canUpload && p.canDelete;
    const next = [...invite.permissions];
    next[idx] = { ...p, canView: !allOn, canUpload: !allOn, canDelete: !allOn };
    setInvite({ ...invite, permissions: next });
  };

  const updateInvitePerm = (idx, key) => {
    const next = [...invite.permissions];
    next[idx] = { ...next[idx], [key]: !next[idx][key] };
    // If enabling upload or delete, also enable view
    if ((key === 'canUpload' || key === 'canDelete') && !next[idx][key] === false) {
      // no-op
    } else if ((key === 'canUpload' || key === 'canDelete') && next[idx][key]) {
      next[idx].canView = true;
    }
    setInvite({ ...invite, permissions: next });
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...invite,
        permissions: invite.role === 'CUSTOM'
          ? invite.permissions.filter((p) => p.canView || p.canUpload || p.canDelete)
          : undefined,
      };
      const res = await api.invite(payload);
      setInviteResult(res);
      if (!res.inviteLink) {
        // Email sent successfully — close after brief delay
        setTimeout(() => { setShowInvite(false); load(); }, 2000);
      } else {
        load();
      }
    } catch (err) {
      // If the error response actually contains a successful creation with invite link
      if (err.inviteLink) {
        setInviteResult(err);
        load();
      } else {
        setInviteResult({ message: err.error || 'Failed to invite user.', error: true });
      }
    }
  };

  const copyLink = async (link) => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleStatus = async (user) => {
    await api.updateUserStatus(user.id, !user.isActive);
    load();
  };

  const deleteUser = async (user) => {
    if (!confirm(t('users.deleteConfirm', { name: `${user.firstName} ${user.lastName}` }))) return;
    await api.deleteUser(user.id);
    load();
  };

  const openPerms = (user) => {
    setShowPerms(user.id);
    setPerms(orgUnits.map((ou) => {
      const existing = user.permissions?.find((p) => p.orgUnit?.id === ou.id);
      return { orgUnitId: ou.id, name: ou.name, canView: existing?.canView || false, canUpload: existing?.canUpload || false, canDelete: existing?.canDelete || false };
    }));
  };

  const savePerms = async () => {
    await api.updatePermissions(showPerms, perms.filter((p) => p.canView || p.canUpload || p.canDelete));
    setShowPerms(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('users.title')}</h1>
        <button className="btn-primary flex items-center gap-2" onClick={openInviteModal}>
          <UserPlus className="w-4 h-4" /> {t('users.inviteUser')}
        </button>
      </div>

      <HelpBanner id="users-guide" title={t('users.helpTitle')} variant="info">
        {t('users.helpBody')}
      </HelpBanner>

      {/* ─── Invite Modal ──────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {inviteResult?.error ? (
              // Real error — user was NOT created
              <div className="p-6 space-y-4">
                <XCircle className="w-12 h-12 text-red-500 mx-auto" />
                <h2 className="text-lg font-bold text-red-700 text-center">{t('users.invitationFailed')}</h2>
                <p className="text-sm text-red-600 text-center">{inviteResult.message}</p>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => setShowInvite(false)}>{t('common.close')}</button>
                  <button className="btn-primary flex-1" onClick={() => setInviteResult(null)}>{t('users.tryAgain')}</button>
                </div>
              </div>
            ) : inviteResult?.inviteLink ? (
              // User created but email failed — show manual invite link
              <div className="p-6 space-y-4">
                <h2 className="text-lg font-bold text-amber-600">{t('users.userCreatedNoEmail')}</h2>
                <p className="text-sm text-gray-600">{inviteResult.message}</p>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">{t('users.shareInviteLink')}</p>
                  <div className="flex items-center gap-2">
                    <input className="input text-xs flex-1" readOnly value={inviteResult.inviteLink} />
                    <button className="btn-secondary text-xs flex items-center gap-1" onClick={() => copyLink(inviteResult.inviteLink)}>
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? t('users.copied') : t('users.copy')}
                    </button>
                  </div>
                </div>
                <button className="btn-primary w-full" onClick={() => setShowInvite(false)}>{t('users.done')}</button>
              </div>
            ) : inviteResult ? (
              // Email sent successfully
              <div className="p-6 text-center space-y-3">
                <Check className="w-12 h-12 text-green-500 mx-auto" />
                <h2 className="text-lg font-bold text-green-700">{t('users.invitationSent')}</h2>
                <p className="text-sm text-gray-600">{inviteResult.message}</p>
              </div>
            ) : (
              // Invite form
              <form onSubmit={handleInvite} className="p-6 space-y-4">
                <h2 className="text-lg font-bold">{t('users.inviteUser')}</h2>

                <div className="grid grid-cols-2 gap-3">
                  <input className="input" placeholder={`${t('users.firstName')} *`} required value={invite.firstName} onChange={(e) => setInvite({ ...invite, firstName: e.target.value })} />
                  <input className="input" placeholder={`${t('users.lastName')} *`} required value={invite.lastName} onChange={(e) => setInvite({ ...invite, lastName: e.target.value })} />
                </div>
                <input type="email" className="input" placeholder={`${t('common.email')} *`} required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="input" placeholder={t('users.phone')} value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} />
                  <input className="input" placeholder={t('users.jobTitle')} value={invite.jobTitle} onChange={(e) => setInvite({ ...invite, jobTitle: e.target.value })} />
                </div>

                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-sm font-medium text-gray-700">{t('users.role')}</label>
                    <InfoTip>{t('users.roleTooltip')}</InfoTip>
                  </div>
                  <select className="input" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
                    <option value="CUSTOM">{t('users.customRestricted')}</option>
                    <option value="ADMIN">{t('users.adminFullAccess')}</option>
                  </select>
                </div>

                {/* Permissions grid — only for Custom role */}
                {invite.role === 'CUSTOM' && (
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      <label className="text-sm font-medium text-gray-700">{t('users.permissionsByOrgUnit')}</label>
                      <InfoTip>{t('users.permissionsTooltip')}</InfoTip>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-500">{t('users.orgUnitHeader')}</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-500 w-16">
                              <span className="flex items-center justify-center gap-0.5">{t('users.viewPerm')} <InfoTip size="sm">{t('users.viewTooltip')}</InfoTip></span>
                            </th>
                            <th className="text-center px-3 py-2 font-medium text-gray-500 w-16">
                              <span className="flex items-center justify-center gap-0.5">{t('users.uploadPerm')} <InfoTip size="sm">{t('users.uploadTooltip')}</InfoTip></span>
                            </th>
                            <th className="text-center px-3 py-2 font-medium text-gray-500 w-16">
                              <span className="flex items-center justify-center gap-0.5">{t('users.deletePerm')} <InfoTip size="sm">{t('users.deleteTooltip')}</InfoTip></span>
                            </th>
                            <th className="text-center px-3 py-2 font-medium text-gray-500 w-14">{t('users.allPerm')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {invite.permissions.map((p, i) => {
                            const allOn = p.canView && p.canUpload && p.canDelete;
                            return (
                              <tr key={p.orgUnitId} className="hover:bg-gray-50">
                                <td className="px-3 py-2">
                                  <p className="font-medium">{p.name}</p>
                                  <p className="text-xs text-gray-400">{p.country}</p>
                                </td>
                                <td className="text-center px-3 py-2">
                                  <input type="checkbox" className="w-4 h-4 rounded" checked={p.canView} onChange={() => updateInvitePerm(i, 'canView')} />
                                </td>
                                <td className="text-center px-3 py-2">
                                  <input type="checkbox" className="w-4 h-4 rounded" checked={p.canUpload} onChange={() => updateInvitePerm(i, 'canUpload')} />
                                </td>
                                <td className="text-center px-3 py-2">
                                  <input type="checkbox" className="w-4 h-4 rounded" checked={p.canDelete} onChange={() => updateInvitePerm(i, 'canDelete')} />
                                </td>
                                <td className="text-center px-3 py-2">
                                  <input type="checkbox" className="w-4 h-4 rounded accent-brand-600" checked={allOn} onChange={() => toggleAllPermsForUnit(i)} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {invite.permissions.every((p) => !p.canView && !p.canUpload && !p.canDelete) && (
                      <p className="text-xs text-amber-600 mt-1">{t('users.noPermsWarning')}</p>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="button" className="btn-secondary flex-1" onClick={() => setShowInvite(false)}>{t('common.cancel')}</button>
                  <button type="submit" className="btn-primary flex-1">{t('users.sendInvite')}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Edit Permissions Modal ────────────────── */}
      {showPerms && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold">{t('users.editPermissions')}</h2>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">{t('users.orgUnitHeader')}</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500 w-16">{t('users.viewPerm')}</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500 w-16">{t('users.uploadPerm')}</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500 w-16">{t('users.deletePerm')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {perms.map((p, i) => (
                    <tr key={p.orgUnitId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{p.name}</td>
                      {['canView', 'canUpload', 'canDelete'].map((key) => (
                        <td key={key} className="text-center px-3 py-2">
                          <input type="checkbox" className="w-4 h-4 rounded" checked={p[key]} onChange={(e) => {
                            const next = [...perms];
                            next[i] = { ...next[i], [key]: e.target.checked };
                            if ((key === 'canUpload' || key === 'canDelete') && e.target.checked) next[i].canView = true;
                            setPerms(next);
                          }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setShowPerms(null)}>{t('common.cancel')}</button>
              <button className="btn-primary flex-1" onClick={savePerms}>{t('users.savePermissions')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Users Table ───────────────────────────── */}
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">{t('users.user')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">{t('common.email')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">{t('users.role')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">{t('common.status')}</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">{t('common.loading')}</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-gray-400">{u.jobTitle || ''}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                    {u.role}
                  </span>
                  {u.role === 'CUSTOM' && u.permissions?.length > 0 && (
                    <span className="text-xs text-gray-400 ml-1">({u.permissions.length} {t('users.units')})</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.isActive ? t('users.active') : t('users.inactive')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button className="text-gray-400 hover:text-brand-600" title={t('users.editPermsTooltip')} onClick={() => openPerms(u)}>
                      <Shield className="w-4 h-4" />
                    </button>
                    <button className="text-gray-400 hover:text-amber-600" title={u.isActive ? t('users.deactivate') : t('users.activate')} onClick={() => toggleStatus(u)}>
                      {u.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button className="text-gray-400 hover:text-red-600" title={t('users.deleteUserTooltip')} onClick={() => deleteUser(u)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
