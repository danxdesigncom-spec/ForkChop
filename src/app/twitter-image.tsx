import OpenGraphImage, {
  alt as ogAlt,
  size as ogSize,
  contentType as ogContentType,
} from './opengraph-image';

/**
 * Twitter uses the same card as Open Graph — same aspect, same content.
 * Next disallows re-exporting the route-segment config values (runtime, size,
 * alt), so they are re-declared here and the default handler is wrapped.
 */

export const runtime = 'edge';
export const alt = ogAlt;
export const size = ogSize;
export const contentType = ogContentType;

export default function TwitterImage() {
  return OpenGraphImage();
}
