import { requireAdmin } from '@/lib/admin/guard';
import { createAdminClient, isAdminSupabaseConfigured, ADMIN_SUPABASE_SETUP_HINT } from '@/lib/supabase/admin';
import { UsersTable, type AdminUserRow } from './UsersTable';
import { CreateUserForm } from './CreateUserForm';

export const dynamic = 'force-dynamic';

/**
 * The list is fetched with the service role on every request. No pagination
 * yet — 100 rows a page is Supabase's default and enough for the shell PR.
 * A later PR adds paging + search once we know how many accounts exist.
 */
async function fetchUsers(): Promise<{ rows: AdminUserRow[]; error: string | null }> {
  const admin = createAdminClient();
  if (!admin) return { rows: [], error: ADMIN_SUPABASE_SETUP_HINT };

  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) return { rows: [], error: error.message };

  const rows: AdminUserRow[] = data.users.map((u) => ({
    id: u.id,
    email: u.email ?? '(no email)',
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
    disabled: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
  }));

  // Newest sign-ups first — matches how admins typically triage.
  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return { rows, error: null };
}

export default async function AdminUsersPage() {
  await requireAdmin();
  const configured = isAdminSupabaseConfigured();
  const { rows, error } = await fetchUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-muted">
          {configured
            ? `${rows.length} account${rows.length === 1 ? '' : 's'}.`
            : 'Service-role key not set — showing an empty state.'}
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Create a user</h2>
        <p className="mt-1 text-xs text-muted">
          Sends an invitation email with a sign-in link. The account is created immediately.
        </p>
        <div className="mt-3">
          <CreateUserForm />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">All users</h2>
        {error ? (
          <p className="mt-3 rounded-lg border border-score-mid bg-score-mid-soft p-3 text-sm text-score-mid">
            {error}
          </p>
        ) : (
          <div className="mt-3">
            <UsersTable rows={rows} />
          </div>
        )}
      </section>
    </div>
  );
}
