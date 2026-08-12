import { useEffect, useMemo, useState } from 'react';
import {
  BUILT_IN_ROLES,
  PERMS,
  defaultPermsForRole,
  roleLabel,
  type PermissionKey,
  type PermissionMap,
  type RoleTemplate,
} from '@surani/shared';
import { api } from '../lib/apiClient';
import { usePermission } from '../hooks/usePermission';
import { useDialogs } from '../components/Dialogs';

/**
 * Role Master — create named permission templates such as "Warehouse".
 *
 * A role is a starting point, not standing authority: assigning it pre-fills that user's
 * permissions, and from then on the user carries their own set. Editing a role therefore never
 * changes what existing users can already do — deliberately, so nobody's access shifts under them
 * without someone choosing it.
 */
export function RolesPage() {
  const can = usePermission();
  const { confirm } = useDialogs();
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [name, setName] = useState('');
  const [perms, setPerms] = useState<Partial<PermissionMap>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const groups = useMemo(() => Array.from(new Set(PERMS.map((p) => p.group))), []);

  async function reload() {
    setRoles(await api.roles.list());
  }
  useEffect(() => {
    reload().catch(() => setError('Could not load roles.'));
  }, []);

  function resetForm() {
    setEditingId(null);
    setName('');
    setPerms({});
    setError('');
  }

  function onEdit(r: RoleTemplate) {
    setEditingId(r.id);
    setName(r.name);
    setPerms({ ...r.permissions });
    setError('');
    setSaved('');
  }

  async function onSave() {
    setError('');
    setSaved('');
    if (name.trim().length < 2) return setError('Give the role a name.');
    try {
      if (editingId) await api.roles.update(editingId, { name: name.trim(), permissions: perms });
      else await api.roles.create({ name: name.trim(), permissions: perms });
      setSaved(`Saved “${name.trim()}”.`);
      resetForm();
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the role.');
    }
  }

  async function onDelete(r: RoleTemplate) {
    if (!(await confirm(`Delete the “${r.name}” role?`, { okLabel: 'Delete', danger: true }))) return;
    try {
      await api.roles.remove(r.id);
      if (editingId === r.id) resetForm();
      reload();
    } catch (e) {
      await confirm(e instanceof Error ? e.message : 'Could not delete the role.', {
        okLabel: 'OK',
        cancelLabel: 'Close',
      });
    }
  }

  const countOn = (p: Partial<PermissionMap>) => PERMS.filter((x) => p[x.id]).length;

  if (!can('manage_roles')) return <div className="card">You do not have permission to manage roles.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Role Master</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          A role is a set of permissions with a name. When you put a user on a role, these boxes are
          ticked for them to start with — you can still adjust that person afterwards in User Master.
        </p>
        <div
          style={{
            background: '#f0fdfa',
            border: '1px solid #99f6e4',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12.5,
            color: '#0f766e',
            marginBottom: 12,
          }}
        >
          Changing a role here does <strong>not</strong> change users who are already on it — their
          permissions stay as they are. Edit those in User Master.
          <div style={{ marginTop: 4 }}>
            Admin, Account and Staff are built into the system and cannot be edited here: Admin
            changes are queued for your approval, which is behaviour rather than a permission. You
            can copy one as the starting point for a new role.
          </div>
        </div>

        <div className="toolbar" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 240 }}>
            <label>Role name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse" maxLength={40} />
          </div>
          <button className="btn btn-primary" onClick={onSave}>
            {editingId ? 'Save Changes' : 'Create Role'}
          </button>
          {editingId && (
            <button className="btn btn-sm" onClick={resetForm}>
              Cancel
            </button>
          )}
          <span className="muted" style={{ fontSize: 12 }}>{countOn(perms)} permissions ticked</span>
        </div>
        {error && <div className="login-err show" style={{ marginTop: 6 }}>{error}</div>}
        {saved && <div style={{ color: '#15803d', fontSize: 12.5, marginTop: 6 }}>{saved}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginTop: 14 }}>
          {groups.map((group) => (
            <div key={group}>
              <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b' }}>
                {group}
              </div>
              {PERMS.filter((p) => p.group === group).map((p) => (
                <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={!!perms[p.id as PermissionKey]}
                    onChange={(e) => setPerms((cur) => ({ ...cur, [p.id]: e.target.checked }))}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Roles</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Permissions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {/* The built-ins are part of the system rather than rows in a table — superadmin
                bypasses every check and an admin's changes are queued for approval, which no
                amount of ticking boxes can express. Shown so the page reflects reality. */}
            {BUILT_IN_ROLES.filter((r) => r !== 'superadmin').map((r) => (
              <tr key={r} style={{ background: 'var(--surface-2, #f8fafc)' }}>
                <td>
                  {roleLabel(r)}
                  <span className="muted" style={{ fontSize: 10.5, marginLeft: 6 }}>built-in</span>
                </td>
                <td className="muted">{countOn(defaultPermsForRole(r))} ticked by default</td>
                <td>
                  <button
                    className="btn btn-sm"
                    title="Start a new custom role from this one's permissions"
                    onClick={() => {
                      setEditingId(null);
                      setName('');
                      setPerms(defaultPermsForRole(r));
                      setSaved('');
                      setError('');
                    }}
                  >
                    Copy to new role
                  </button>
                </td>
              </tr>
            ))}
            {roles.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td className="muted">{countOn(r.permissions)} ticked</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => onEdit(r)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onDelete(r)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  No custom roles yet — the three above are the built-ins. Use “Copy to new role” to
                  start from one of them, or create one from scratch.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
