import { useState, useEffect } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';
import { Button, Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { request } from 'librechat-data-provider';

interface TOrganization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatar?: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface TOrgMember {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  role: 'admin' | 'member';
  invitedBy?: string;
  joinedAt: string;
}

export default function OrganizationSettings() {
  const { token } = useAuthContext();
  const localize = useLocalize();
  const [organization, setOrganization] = useState<TOrganization | null>(null);
  const [members, setMembers] = useState<TOrgMember[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  useEffect(() => {
    fetchOrganization();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchOrganization = async () => {
    if (!token) return;
    try {
      const [orgData, membersData] = await Promise.all([
        request.get('/api/organizations/me'),
        request.get('/api/organizations/me/members'),
      ]);

      setOrganization(orgData);
      setOrgName(orgData.name);
      setOrgDescription(orgData.description || '');

      setMembers(membersData);
      const user = await request.get('/api/user');
      const myMembership = membersData.find((m: TOrgMember) => m.userId === user.id);
      setIsOrgAdmin(myMembership?.role === 'admin');
    } catch (err) {
      setError('Failed to load organization data');
    } finally {
      setLoading(false);
    }
  };

  const fetchInviteCode = async () => {
    try {
      const data = await request.get('/api/organizations/me/invite');
      setInviteCode(data.inviteCode);
    } catch (err) {
      setError('Failed to fetch invite code');
    }
  };

  const handleSaveOrg = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const data = await request.patch('/api/organizations/me', { name: orgName, description: orgDescription });
      setOrganization(data);
      setSuccess('Organization updated successfully');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update organization');
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) return;
    setSendingInvite(true);
    setError('');
    setSuccess('');
    try {
      await request.post('/api/organizations/me/invite/email', { email: inviteEmail });
      setSuccess('Invite email sent successfully');
      setInviteEmail('');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to send invite');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleRegenerateCode = async () => {
    try {
      const data = await request.post('/api/organizations/me/invite/code', {});
      setInviteCode(data.inviteCode);
      setSuccess('New invite code generated');
    } catch (err) {
      setError('Failed to generate invite code');
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setSuccess('Invite code copied to clipboard');
  };

  const handleChangeRole = async (userId: string, newRole: 'admin' | 'member') => {
    try {
      await request.patch(`/api/organizations/me/members/${userId}`, { role: newRole });
      setMembers(members.map(m => m.userId === userId ? { ...m, role: newRole } : m));
    } catch (err) {
      setError('Failed to update member role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await request.delete(`/api/organizations/me/members/${userId}`);
      setMembers(members.filter(m => m.userId !== userId));
    } catch (err) {
      setError('Failed to remove member');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-lg text-muted-foreground">You are not a member of any organization.</p>
        <p className="text-sm text-muted-foreground">Ask your admin for an invite code or link.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">Organization Settings</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Organization Profile */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Organization Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Name</label>
            <input
              type="text"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              disabled={!isOrgAdmin}
              className="w-full rounded-lg border px-3 py-2 disabled:bg-muted"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              value={orgDescription}
              onChange={e => setOrgDescription(e.target.value)}
              disabled={!isOrgAdmin}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 disabled:bg-muted"
            />
          </div>
          {isOrgAdmin && (
            <Button onClick={handleSaveOrg} disabled={saving}>
              {saving ? <Spinner /> : 'Save Changes'}
            </Button>
          )}
        </div>
      </section>

      {/* Invite Section */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Invite Members</h2>
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              className="flex-1 rounded-lg border px-3 py-2"
            />
            <Button onClick={handleSendInvite} disabled={sendingInvite || !isOrgAdmin}>
              {sendingInvite ? <Spinner /> : 'Send Invite'}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inviteCode}
              readOnly
              placeholder="Click to generate code"
              className="flex-1 rounded-lg border bg-muted px-3 py-2 font-mono"
            />
            <Button onClick={fetchInviteCode} variant="outline">
              Show Code
            </Button>
            {inviteCode && (
              <>
                <Button onClick={handleCopyCode} variant="outline">
                  Copy
                </Button>
                {isOrgAdmin && (
                  <Button onClick={handleRegenerateCode} variant="outline">
                    Regenerate
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {/* Members List */}
      <section className="space-y-4 rounded-lg border p-6">
        <h2 className="text-lg font-semibold">Members ({members.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-medium">Name</th>
                <th className="pb-2 text-left font-medium">Email</th>
                <th className="pb-2 text-left font-medium">Role</th>
                {isOrgAdmin && <th className="pb-2 text-left font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {members.map(member => (
                <tr key={member.userId} className="border-b">
                  <td className="py-2">{member.user.name}</td>
                  <td className="py-2">{member.user.email}</td>
                  <td className="py-2">
                    {isOrgAdmin ? (
                      <select
                        value={member.role}
                        onChange={e => handleChangeRole(member.userId, e.target.value as 'admin' | 'member')}
                        className="rounded border px-2 py-1"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </select>
                    ) : (
                      <span className="capitalize">{member.role}</span>
                    )}
                  </td>
                  {isOrgAdmin && (
                    <td className="py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveMember(member.userId)}
                        className="text-red-600"
                      >
                        Remove
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
