import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFlags } from '@/lib/flags';
import { buildNavLinks } from '@/lib/nav-links';
import { ComponentGallery } from './ComponentGallery';

/**
 * Temporary v2 component gallery for review on Vercel Preview.
 * Flag-gated: a 404 whenever the redesign flag is off. Delete before phase 6.
 */
export const metadata: Metadata = {
  title: 'v2 components',
  robots: { index: false, follow: false },
};

export default function ComponentsPage() {
  const flags = getFlags();
  if (!flags.redesign) notFound();
  return <ComponentGallery links={buildNavLinks(flags)} />;
}
