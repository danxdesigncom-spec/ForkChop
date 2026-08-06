import Link from 'next/link';
import { requireAdmin } from '@/lib/admin/guard';
import { isAdminSupabaseConfigured } from '@/lib/supabase/admin';

export default async function AdminHome() {
  const { email } = await requireAdmin();
  const supabaseReady = isAdminSupabaseConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {email}</h1>
        <p className="mt-1 text-sm text-muted">Pick a section to get started.</p>
      </div>

      {!supabaseReady && (
        <div className="rounded-xl border border-score-mid bg-score-mid-soft p-4 text-sm text-score-mid">
          <p className="font-medium">SUPABASE_SERVICE_ROLE_KEY is not set.</p>
          <p className="mt-1 text-xs">
            The admin UI renders, but user management actions will report themselves
            as not configured until the key is added (server-only, in Vercel).
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <AdminCard
          href="/admin/users"
          title="Users"
          blurb="List every account, send sign-in links, create users, disable and enable."
        />
        <AdminCard
          href="/admin/recipes"
          title="Recipes"
          blurb="Browse the local corpus, import JSON, pull from Spoonacular, disable individual recipes."
        />
      </div>
    </div>
  );
}

function AdminCard({ href, title, blurb }: { href: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-brand"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{blurb}</p>
    </Link>
  );
}
