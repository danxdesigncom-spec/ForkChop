import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFlags } from '@/lib/flags';
import { ContentPageHeader } from '@/components/ContentPageHeader';

/**
 * About page.
 *
 * Explains what the app is, how it works and what it is not — grounded in
 * the code, not marketing copy. Gated by NEXT_PUBLIC_FEATURE_ABOUT_PAGE.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About — ForkChop',
  description: 'What ForkChop is, how it works, and how it decides what to cook.',
};

export default function AboutPage() {
  const flags = getFlags();
  if (!flags.aboutPage) notFound();

  return (
    <>
      <ContentPageHeader title="About" flags={flags} />

      <main className="mx-auto max-w-3xl px-4 py-8 lg:py-12">
        <article className="space-y-8 text-sm leading-relaxed">
          <header>
            <h1 className="text-3xl font-extrabold">About ForkChop</h1>
            <p className="mt-2 text-muted">
              A recipe app that starts with what you already have, not what you wish you did.
            </p>
          </header>

          <Section title="The idea">
            <p>
              Most recipe apps ask what you want to eat. ForkChop asks what&apos;s in your kitchen
              and finds things you can cook right now, plus things you&apos;re only one or two
              ingredients short of. Missing the parsley is different from missing the chicken, so
              it treats them differently.
            </p>
          </Section>

          <Section title="How the matching works">
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong>Free-text resolution.</strong> Type <em>&ldquo;2 chicken breasts&rdquo;</em>,{' '}
                <em>&ldquo;cilantro&rdquo;</em>, <em>&ldquo;tomatos&rdquo;</em> — a staged parser turns
                each into a canonical ingredient, tolerating amounts, plurals, dialect swaps and
                typos.
              </li>
              <li>
                <strong>Ingredient importance.</strong> Each recipe ingredient is tagged core,
                normal or optional. Missing a core ingredient sinks the match; missing a garnish
                barely moves it.
              </li>
              <li>
                <strong>Staples are assumed.</strong> Salt, oil, water and a handful of others
                are never reported as missing.
              </li>
              <li>
                <strong>Strict allergen filter.</strong> A recipe containing a flagged allergen —
                even in an optional garnish — is removed entirely.
              </li>
              <li>
                <strong>Local first, then wider.</strong> A hand-curated corpus is searched first;
                Spoonacular only when the local results are thin. External recipes flow through
                the same filters and ranking as local ones.
              </li>
            </ul>
          </Section>

          <Section title="What ForkChop isn&apos;t">
            <ul className="ml-5 list-disc space-y-2">
              <li>A payment processor. Checkout hands off to the store&apos;s own site.</li>
              <li>A medical or nutrition tool. Allergen filtering is a convenience over ingredient data, not a substitute for reading a label.</li>
              <li>A social network. There are no follows, no comments, no public profiles.</li>
              <li>An advertising business. There are no ads, no third-party trackers, no data sales.</li>
            </ul>
          </Section>

          <Section title="Built with">
            <p>
              Next.js and TypeScript, Supabase for accounts and data, Tailwind CSS for the design.
              Deployed on Vercel. The recipe corpus is bundled with the app; wider search uses
              Spoonacular, barcode lookups use Open Food Facts. Voice input uses the
              browser&apos;s built-in speech recognition — no third-party service is contacted
              through us.
            </p>
          </Section>

          <Section title="Privacy in short">
            <p>
              Signed out, your pantry stays in your browser. Signed in, it&apos;s stored against
              your account and protected by row-level security. We don&apos;t use analytics or
              advertising trackers. The{' '}
              <a href="/privacy" className="text-brand hover:underline">
                privacy policy
              </a>{' '}
              is short and code-accurate.
            </p>
          </Section>
        </article>
      </main>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">{title}</h2>
      <div className="space-y-2 text-muted">{children}</div>
    </section>
  );
}
