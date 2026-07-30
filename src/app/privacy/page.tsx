import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFlags } from '@/lib/flags';
import { ContentPageHeader } from '@/components/ContentPageHeader';

/**
 * Privacy policy.
 *
 * Every statement below matches how the code actually behaves — nothing here
 * is boilerplate. If a phase changes data handling (Phase 1 added Supabase,
 * Phase 2 added Spoonacular, Phase 3 added OFF barcode lookups), this file
 * must change with it.
 *
 * Gated by NEXT_PUBLIC_FEATURE_PRIVACY_PAGE. Off returns 404, keeping the
 * page invisible on any deploy that hasn't opted in.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Privacy — ForkChop',
  description: 'What ForkChop stores, what it sends where, and what it does not.',
};

const LAST_UPDATED = '29 July 2026';

export default function PrivacyPage() {
  if (!getFlags().privacyPage) notFound();

  return (
    <>
      <ContentPageHeader title="Privacy policy" />

      <main className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
        <article className="prose prose-neutral max-w-none space-y-6 text-sm leading-relaxed">
          <header>
            <h1 className="text-3xl font-extrabold">Privacy policy</h1>
            <p className="mt-1 text-xs text-muted">Last updated {LAST_UPDATED}</p>
          </header>

          <Section title="What ForkChop is">
            <p>
              ForkChop is a recipe-matching tool. You tell it what&rsquo;s in your kitchen and it
              suggests things you can cook. Everything below describes what happens with the
              information you give it.
            </p>
          </Section>

          <Section title="Signed out — nothing leaves your browser">
            <p>
              Without an account, your pantry, allergies, dislikes and saved recipes all live in
              <em> your browser&rsquo;s localStorage</em>. They are never sent to us. Clearing your
              site data clears everything ForkChop has ever known about you on this device.
            </p>
          </Section>

          <Section title="Signed in — what your account holds">
            <p>Signing in creates an account backed by Supabase. Your account stores:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>Your email address, so we can send you a magic link.</li>
              <li>Your pantry (raw text, resolved ingredient id, and whether each was typed, scanned or spoken).</li>
              <li>Recipes you&rsquo;ve saved.</li>
              <li>For recipes sourced from a third party, a snapshot of the recipe so it still renders if that source is offline.</li>
            </ul>
            <p>
              Every row is protected by row-level security keyed on your user id — no other
              signed-in user can read or modify your data.
            </p>
            <p>
              We do not use analytics or advertising trackers. We do not sell or share your data.
              Signing out and deleting your account removes everything the account holds.
            </p>
          </Section>

          <Section title="Passwords, cookies, tracking">
            <p>
              Sign-in is passwordless. We never see or store your password, because there is no
              password. The only cookies we set are Supabase&rsquo;s authentication cookies, which
              keep you signed in and are cleared when you sign out. There are no advertising
              cookies, no third-party analytics, no session replay.
            </p>
          </Section>

          <Section title="Third parties, and exactly what they see">
            <p>ForkChop hands off to a few services. What each one receives:</p>

            <h3 className="mt-3 font-semibold">Supabase (authentication and database)</h3>
            <p>
              Hosts your account and the database above. Sees your email and everything stored
              against your account. Governed by{' '}
              <a href="https://supabase.com/privacy" className="text-brand hover:underline">
                Supabase&rsquo;s privacy policy
              </a>
              .
            </p>

            <h3 className="mt-3 font-semibold">Spoonacular (recipe search)</h3>
            <p>
              When your pantry is thin on cookable local recipes, ForkChop asks Spoonacular for
              more. We send the ingredient names and any filters you&rsquo;ve set (diet, cuisine,
              meal, allergens, time). We do not send your identity, email or any other stored
              data. Governed by{' '}
              <a href="https://spoonacular.com/food-api/terms-of-use" className="text-brand hover:underline">
                Spoonacular&rsquo;s terms
              </a>
              .
            </p>

            <h3 className="mt-3 font-semibold">Open Food Facts (barcode lookups)</h3>
            <p>
              When you scan a barcode, ForkChop sends the barcode number — and nothing else — to
              Open Food Facts to look up the product. No user identifier, no cookies, no other
              pantry data. Open Food Facts is a free public database.
            </p>

            <h3 className="mt-3 font-semibold">Your browser&rsquo;s speech recognition</h3>
            <p>
              The microphone button uses the browser&rsquo;s built-in Web Speech API. On Chrome
              that means audio is streamed to Google&rsquo;s servers for recognition; on Safari,
              Apple&rsquo;s. That is your browser&rsquo;s behaviour, not something ForkChop
              routes. We only receive the transcribed text, and only what you commit from the
              review tray.
            </p>

            <h3 className="mt-3 font-semibold">Your device&rsquo;s camera</h3>
            <p>
              The scan button uses your camera locally. Video frames are decoded in-browser and
              never sent anywhere. Only the resulting barcode number leaves the device.
            </p>

            <h3 className="mt-3 font-semibold">Grocery checkout providers</h3>
            <p>
              When you check out, ForkChop hands off to the store&rsquo;s own website with your
              items pre-populated. <strong>ForkChop never sees your payment details.</strong> You
              complete the purchase on the store&rsquo;s domain, under their terms.
            </p>

            <h3 className="mt-3 font-semibold">Vercel (hosting)</h3>
            <p>
              The app is served from Vercel. Vercel receives standard request metadata (IP
              address, user agent, requested paths) for the same reasons any web host does.
              Governed by{' '}
              <a href="https://vercel.com/legal/privacy-policy" className="text-brand hover:underline">
                Vercel&rsquo;s privacy policy
              </a>
              .
            </p>
          </Section>

          <Section title="Children">
            <p>ForkChop is not directed at children under 13 and we do not knowingly collect data from them.</p>
          </Section>

          <Section title="Your rights">
            <p>
              You can sign out at any time from the account menu, and delete your account by
              emailing us. Deleting the account removes every row keyed to your user id — pantry,
              saved recipes, everything.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We&rsquo;ll update this page when the app&rsquo;s data handling changes. The date at
              the top always reflects the last real change.
            </p>
          </Section>
        </article>
      </main>
    </>
  );
}

/** Small semantic wrapper so section headings render consistently. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-muted">{children}</div>
    </section>
  );
}
