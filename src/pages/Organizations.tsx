import React, { useState, useEffect } from 'react';
import { Plus, Building2, Users, Pencil, Trash2, Eye, X } from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/UI/Card';
import { Button } from '../components/UI/Button';
import { Badge } from '../components/UI/Badge';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../lib/api';
import { apiClient } from '../lib/apiClient';

interface Organization {
  id: string;
  name: string;
  slug: string;
  status: string;
  created_at: string;
  admin?: { name: string; email: string } | null;
}

export const Organizations: React.FC = () => {
  const { isSuperAdmin } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [viewOrg, setViewOrg] = useState<Organization | null>(null);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [editForm, setEditForm] = useState({ name: '', status: 'active' });
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [form, setForm] = useState({
    organizationName: '',
    adminEmail: '',
    adminName: '',
    password: '',
    sendInvite: false,
  });

  const fetchOrganizations = async () => {
    setLoading(true);
    const { data: orgData, error: orgErr } = await apiClient
      .from('organizations')
      .select('id, name, slug, status, created_at')
      .order('created_at', { ascending: false });
    if (orgErr) {
      setError(orgErr.message);
      setOrganizations([]);
      setLoading(false);
      return;
    }
    setError(null);
    const orgs = orgData || [];
    if (orgs.length === 0) {
      setOrganizations([]);
      setLoading(false);
      return;
    }
    const { data: adminData } = await apiClient
      .from('users')
      .select('organization_id, name, email')
      .eq('role', 'admin')
      .in('organization_id', orgs.map((o: any) => o.id));
    const adminByOrgId: Record<string, { name: string; email: string }> = {};
    (adminData || []).forEach((r: any) => {
      if (r.organization_id) adminByOrgId[r.organization_id] = { name: r.name, email: r.email };
    });
    setOrganizations(orgs.map((row: any) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      created_at: row.created_at,
      admin: adminByOrgId[row.id] || null,
    })));
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) fetchOrganizations();
  }, [isSuperAdmin]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!form.organizationName.trim() || !form.adminEmail.trim() || !form.adminName.trim()) {
      setError('Organization name, admin email, and admin name are required.');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setError('Password is required (min 6 characters).');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error: apiErr } = await apiFetch('/admin/organizations', {
        method: 'POST',
        body: JSON.stringify({
          organizationName: form.organizationName.trim(),
          adminEmail: form.adminEmail.trim(),
          adminName: form.adminName.trim(),
          password: form.password,
        }),
      });
      if (apiErr) {
        setError(apiErr.message);
        setSubmitting(false);
        return;
      }
      void data;
      setSuccess('Organization and admin user created. An invite email will be sent when Resend is configured.');
      setForm({ organizationName: '', adminEmail: '', adminName: '', password: '', sendInvite: false });
      setCreateOpen(false);
      fetchOrganizations();
    } catch (err: any) {
      setError(err?.message || 'Request failed');
    }
    setSubmitting(false);
  };

  const handleEditOpen = (org: Organization) => {
    setEditOrg(org);
    setEditForm({ name: org.name, status: org.status });
    setError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editOrg) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: err } = await apiClient
        .from('organizations')
        .update({ name: editForm.name.trim(), status: editForm.status, updated_at: new Date().toISOString() })
        .eq('id', editOrg.id);
      if (err) throw err;
      setSuccess('Organization updated.');
      setEditOrg(null);
      fetchOrganizations();
    } catch (err: any) {
      setError(err?.message || 'Update failed');
    }
    setSubmitting(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteOrg) return;
    setError(null);
    setSubmitting(true);
    try {
      const { count } = await apiClient.from('users').select('*', { count: 'exact', head: true }).eq('organization_id', deleteOrg.id);
      if (count && count > 0) {
        setError(`Cannot delete: ${count} user(s) are linked to this organization. Reassign them to another organization first.`);
        setSubmitting(false);
        return;
      }
      const { error: err } = await apiClient.from('organizations').delete().eq('id', deleteOrg.id);
      if (err) throw err;
      setSuccess('Organization deleted.');
      setDeleteOrg(null);
      fetchOrganizations();
    } catch (err: any) {
      setError(err?.message || 'Delete failed');
    }
    setSubmitting(false);
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">Only Super Admins can manage organizations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-600">Create organizations and their first admin user</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create organization
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}
      {success && (
        <div className="p-4 rounded-lg bg-green-50 text-green-700 text-sm">{success}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Card key={org.id} className="relative">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gray-500" />
                  <span className="font-semibold">{org.name}</span>
                </div>
                <Badge variant={org.status === 'active' ? 'success' : 'default'}>
                  {org.status}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-500 mb-2">/{org.slug}</p>
                {org.admin && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>{org.admin.name} ({org.admin.email})</span>
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  Created {new Date(org.created_at).toLocaleDateString()}
                </p>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => setViewOrg(org)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleEditOpen(org)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteOrg(org)} className="text-red-600 hover:text-red-700 hover:border-red-300">
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-xl">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Create organization</h2>
              <p className="text-sm text-gray-500">Add an organization and its first admin user.</p>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization name *</label>
                <input
                  type="text"
                  value={form.organizationName}
                  onChange={(e) => setForm((f) => ({ ...f, organizationName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Inc"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin email *</label>
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="admin@acme.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Admin name *</label>
                <input
                  type="text"
                  value={form.adminName}
                  onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Jane Doe"
                />
              </div>
              <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                An invite email with login details will be sent to the admin email when Resend is configured on the API.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Min 6 characters"
                  minLength={6}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View organization modal */}
      {viewOrg && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-xl">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">Organization details</h2>
              <button onClick={() => setViewOrg(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <span className="text-sm text-gray-500">Name</span>
                <p className="font-medium">{viewOrg.name}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Slug</span>
                <p className="font-medium">/{viewOrg.slug}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Status</span>
                <p><Badge variant={viewOrg.status === 'active' ? 'success' : 'default'}>{viewOrg.status}</Badge></p>
              </div>
              {viewOrg.admin && (
                <div>
                  <span className="text-sm text-gray-500">Admin</span>
                  <p className="font-medium">{viewOrg.admin.name} ({viewOrg.admin.email})</p>
                </div>
              )}
              <div>
                <span className="text-sm text-gray-500">Created</span>
                <p>{new Date(viewOrg.created_at).toLocaleString()}</p>
              </div>
            </div>
            <div className="p-6 border-t flex gap-2">
              <Button variant="outline" onClick={() => { setViewOrg(null); handleEditOpen(viewOrg); }}>Edit</Button>
              <Button variant="outline" onClick={() => setViewOrg(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit organization modal */}
      {editOrg && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-xl">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">Edit organization</h2>
              <button onClick={() => setEditOrg(null)} className="text-gray-400 hover:text-gray-600" disabled={submitting}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <p className="text-xs text-gray-500">Slug /{editOrg.slug} is read-only.</p>
              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
                <Button type="button" variant="outline" onClick={() => setEditOrg(null)} disabled={submitting}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteOrg && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full shadow-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Delete organization</h2>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete &quot;{deleteOrg.name}&quot;? This may affect users linked to this organization.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setDeleteOrg(null)} disabled={submitting}>Cancel</Button>
              <Button onClick={handleDeleteConfirm} disabled={submitting} className="bg-red-600 hover:bg-red-700">
                {submitting ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
