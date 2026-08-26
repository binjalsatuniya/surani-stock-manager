import { useEffect, useMemo, useState } from 'react';
import { PERMS, defaultPermsForRole, diffFromRole, hasPermission, roleLabel, NOTIFY_ACTIVITIES, readNotifyPrefs, type PermissionMap, type Role, type RoleTemplate, type SalesPerson, type User } from '@surani/shared';
import { api } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../hooks/usePermission';

// Superadmin is the protected default and can't be assigned to others — nobody can be made as
// powerful as the Super Admin.
const CREATABLE_ROLES: Role[] = ['admin', 'account', 'staff'];

export function UsersPage() {
  const { user: me } = useAuth();
  const isSuper = me?.role === 'superadmin';
  const isPrimary = !!me?.isPrimary; // the main Super Admin
  // Mirrors the server: you may only create/assign/manage roles ranked below your own.
  const ROLE_RANK: Record<string, number> = { superadmin: 100, admin: 50 };
  const rankOf = (r?: string | null) => ROLE_RANK[(r || '').toLowerCase()] ?? 10;
  const myRank = rankOf(me?.role);
  const can = usePermission();
  // Seeing User Master and being allowed to add people are separate rights.
  const canCreateUsers = can('create_users');
  const [users, setUsers] = useState<User[]>([]);
  // Custom roles from Role Master, offered alongside the built-in ones.
  const [customRoles, setCustomRoles] = useState<RoleTemplate[]>([]);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [error, setError] = useState('');

  // Permission editor state
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editRole, setEditRole] = useState<Role>('staff');
  const [editPerms, setEditPerms] = useState<PermissionMap>({} as PermissionMap);
  // Live roles: what the ROLE grants, so the screen can show which ticks are personal exceptions.
  const [editRolePerms, setEditRolePerms] = useState<Partial<PermissionMap>>({});
  const [editIsLive, setEditIsLive] = useState(false);
  const [editNotify, setEditNotify] = useState<Record<string, boolean>>({});
  const [editSalesPersonId, setEditSalesPersonId] = useState('');
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [saving, setSaving] = useState(false);

  // Built-in roles first, then anything defined in Role Master.
  const roleOptions: Role[] = useMemo(
    () => [...CREATABLE_ROLES, ...customRoles.map((r) => r.name)].filter((r) => rankOf(r) < myRank),
    [customRoles, myRank]
  );

  const groups = useMemo(() => Array.from(new Set(PERMS.map((p) => p.group))), []);

  async function reload() {
    setUsers(await api.users.list());
  }

  useEffect(() => {
    reload();
    api.roles.list().then(setCustomRoles).catch(() => setCustomRoles([]));
    api.salesPersons.list().then(setSalesPersons).catch(() => setSalesPersons([]));
  }, []);

  async function onAdd() {
    setError('');
    if (!name.trim() || !username.trim() || !password) return;
    try {
      await api.users.create({ name: name.trim(), username: username.trim(), password, role });
      setName('');
      setUsername('');
      setPassword('');
      setRole('staff');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add user');
    }
  }

  async function onDelete(id: string) {
    setError('');
    try {
      if (isPrimary) {
        // JAYNIL re-enters their login password to confirm this destructive action.
        const password = prompt('Enter YOUR login password to delete this user:');
        if (!password) return;
        await api.users.remove(id, password);
        reload();
      } else {
        if (!confirm('Send a request to delete this user? JAYNIL must approve it.')) return;
        const res = await api.users.remove(id);
        if (res.queued) alert('Deletion request sent to JAYNIL for approval.');
        reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete user');
    }
  }

  async function onEditLogin(u: User) {
    const newUsername = prompt(`Username for ${u.name}:`, u.username);
    if (newUsername === null) return; // cancelled
    const newPassword = prompt('New password (leave blank to keep the current one):', '');
    if (newPassword === null) return; // cancelled
    const payload: { username?: string; password?: string } = {};
    if (newUsername.trim() && newUsername.trim() !== u.username) payload.username = newUsername.trim();
    if (newPassword) {
      if (newPassword.length < 4) {
        setError('Password must be at least 4 characters.');
        return;
      }
      payload.password = newPassword;
    }
    if (!payload.username && !payload.password) return;
    setError('');
    try {
      await api.users.update(u.id, payload);
      alert(`Login updated for ${u.name}.`);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update login');
    }
  }

  // Who can this user act on?
  const canEditLogin = (u: User) => isSuper && (u.role !== 'superadmin' || isPrimary || u.id === me?.id);
  const canDelete = (u: User) => !u.isPrimary && u.id !== me?.id && (u.role !== 'superadmin' || isPrimary);

  function openEditor(u: User) {
    setError('');
    setEditUser(u);
    setEditRole(u.role);
    // Initialise every checkbox from the EFFECTIVE permission (resolves the granular-key fallback),
    // so opening and saving a pre-split user preserves exactly what they could already do.
    const resolved = {} as PermissionMap;
    PERMS.forEach((p) => (resolved[p.id] = hasPermission(u.role, u.permissions, p.id)));
    setEditPerms(resolved);
    const live = u.permissionOverrides != null;
    setEditIsLive(live);
    setEditRolePerms(customRoles.find((c) => c.name.toLowerCase() === (u.role || '').toLowerCase())?.permissions ?? {});
    const notify = readNotifyPrefs(u.preferences);
    setEditNotify(Object.fromEntries(NOTIFY_ACTIVITIES.map((a) => [a.key, notify[a.key] === true])));
    setEditSalesPersonId(u.preferences?.salesPersonId ?? '');
  }

  function toggleNotify(key: string, value: boolean) {
    setEditNotify((prev) => ({ ...prev, [key]: value }));
  }

  // Changing the role pre-fills that role's default permissions (the admin can then fine-tune).
  function onEditRoleChange(r: Role) {
    setEditRole(r);
    // A custom role carries its own template; the built-ins use their coded defaults.
    const custom = customRoles.find((c) => c.name === r);
    setEditRolePerms(custom?.permissions ?? {});
    setEditPerms(custom ? ({ ...defaultPermsForRole(''), ...custom.permissions } as PermissionMap) : defaultPermsForRole(r));
  }

  function togglePerm(key: string, value: boolean) {
    setEditPerms((prev) => ({ ...prev, [key]: value }));
  }

  function setAllPerms(value: boolean) {
    const next = {} as PermissionMap;
    PERMS.forEach((p) => (next[p.id] = value));
    setEditPerms(next);
  }

  async function onSaveEditor() {
    if (!editUser) return;
    setSaving(true);
    setError('');
    try {
      await api.users.update(
        editUser.id,
        editIsLive
          ? // Only what differs from the role, so future role edits still reach this person.
            { role: editRole, permissionOverrides: diffFromRole(editRolePerms, editPerms), notifyPrefs: editNotify, salesPersonId: editSalesPersonId || null }
          : { role: editRole, permissions: editPerms, notifyPrefs: editNotify, salesPersonId: editSalesPersonId || null }
      );
      setEditUser(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save user');
    } finally {
      setSaving(false);
    }
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>User Master <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>— login accounts &amp; permissions</span></h2>
        {canCreateUsers ? (
          <>
            <div className="toolbar">
              <div className="field" style={{ margin: 0 }}>
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Username</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary" onClick={onAdd}>
                Add User
              </button>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              New users start with the permissions of the role you give them.{' '}
              {isSuper ? (
                <>
                  Fine-tune an individual with the <strong>Permissions</strong> button. Super Admin
                  can't be assigned to anyone else.
                </>
              ) : (
                <>
                  You can only assign roles below your own, and only the Super Admin can change a
                  person's individual permissions — set up what each role may do in{' '}
                  <strong>Role Master</strong>.
                </>
              )}
            </p>
          </>
        ) : (
          <p className="muted" style={{ marginTop: 4 }}>
            Only the main Super Admin (JAYNIL) can create new users. You can view users below; deleting a user
            sends a request to JAYNIL for approval.
          </p>
        )}
        {error && <div className="login-err show">{error}</div>}
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.username}</td>
                <td style={{ textTransform: 'capitalize' }}>{roleLabel(u.role)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {isSuper && u.role !== 'superadmin' && (
                      <button className="btn btn-sm" onClick={() => openEditor(u)}>
                        Permissions
                      </button>
                    )}
                    {canEditLogin(u) && (
                      <button className="btn btn-sm" onClick={() => onEditLogin(u)}>
                        Edit login
                      </button>
                    )}
                    {canDelete(u) && (
                      <button className="btn btn-sm btn-danger" onClick={() => onDelete(u.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editUser && (
        <div className="card">
          <div className="toolbar" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0, flex: 1 }}>Permissions — {editUser.name}</h3>
            <div className="field" style={{ margin: 0 }}>
              <label>Role</label>
              <select value={editRole} onChange={(e) => onEditRoleChange(e.target.value as Role)}>
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-sm" onClick={() => setAllPerms(true)}>Select all</button>
            <button className="btn btn-sm" onClick={() => setAllPerms(false)}>Clear all</button>
            {editIsLive && (
              <button
                className="btn btn-sm"
                title="Drop this person's individual exceptions so they follow their role exactly"
                onClick={() => setEditPerms({ ...(defaultPermsForRole('') as PermissionMap), ...editRolePerms } as PermissionMap)}
              >
                Reset to role
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginTop: 12 }}>
            {groups.map((group) => (
              <div key={group}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', marginBottom: 8 }}>
                  {group}
                </div>
                {PERMS.filter((p) => p.group === group).map((p) => (
                  <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={!!editPerms[p.id]}
                      onChange={(e) => togglePerm(p.id, e.target.checked)}
                    />
                    {p.label}
                    {/* Under live roles, show which ticks are this person's own rather than their
                        role's — otherwise there is no way to tell why they differ from a colleague. */}
                    {editIsLive && !!editPerms[p.id] !== !!editRolePerms[p.id] && (
                      <span
                        title={
                          editPerms[p.id]
                            ? 'Given to this person individually — their role does not include it'
                            : 'Withdrawn from this person individually — their role does include it'
                        }
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: 999,
                          background: editPerms[p.id] ? '#f0fdf4' : '#fffbeb',
                          color: editPerms[p.id] ? '#15803d' : '#b45309',
                          border: `1px solid ${editPerms[p.id] ? '#bbf7d0' : '#fcd34d'}`,
                        }}
                      >
                        {editPerms[p.id] ? 'EXTRA' : 'REMOVED'}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', marginBottom: 4 }}>
              Phone Notifications
            </div>
            <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 12 }}>
              Send <strong>{editUser.name}</strong> a phone notification when another user does any of these.
              (A user is never notified about their own actions.)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 16px' }}>
              {NOTIFY_ACTIVITIES.map((a) => (
                <label key={a.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!editNotify[a.key]}
                    onChange={(e) => toggleNotify(a.key, e.target.checked)}
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b', marginBottom: 4 }}>
              Follow-up
            </div>
            <p className="muted" style={{ marginTop: 0, marginBottom: 8, fontSize: 12 }}>
              Which sales person <strong>{editUser.name}</strong> is. When you give them the "Follow-up" permission,
              their Follow-up tab shows only this sales person's companies.
            </p>
            <select value={editSalesPersonId} onChange={(e) => setEditSalesPersonId(e.target.value)} style={{ minWidth: 240 }}>
              <option value="">— Not a sales person —</option>
              {salesPersons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={saving} onClick={onSaveEditor}>
              {saving ? 'Saving…' : 'Save Permissions'}
            </button>
            <button className="btn btn-sm" onClick={() => setEditUser(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
