/**
 * Image moderation service.
 *
 * Architecture
 * ------------
 * All UI code calls `moderateImage(uri)` — it never knows which provider is active.
 * Swap in a real cloud provider (Google Vision SafeSearch, Azure AI Content Safety,
 * AWS Rekognition, etc.) by calling `setModerationProvider(myProvider)` once at
 * app startup (e.g. in _layout.tsx) without touching any screen code.
 *
 * Extending to video/files
 * ------------------------
 * Add `moderateVideo(uri)` / `moderateFile(uri, mimeType)` following the same
 * provider pattern when needed.
 */

export type ModerationResult = {
  safe: boolean;
  /** Human-readable reason, only set when safe === false */
  reason?: string;
};

export type ImageModerationProvider = (imageUri: string) => Promise<ModerationResult>;

export const MODERATION_BLOCK_MESSAGE =
  'This image cannot be sent because it violates our community safety guidelines.';

/**
 * Stub provider — passes every image as safe.
 * Replace by calling setModerationProvider() with a real implementation.
 *
 * Example cloud implementation skeleton:
 *
 *   setModerationProvider(async (uri) => {
 *     const blob = await fetch(uri).then(r => r.blob());
 *     const base64 = await blobToBase64(blob);
 *     const response = await fetch('https://vision.googleapis.com/v1/images:annotate?key=API_KEY', {
 *       method: 'POST',
 *       body: JSON.stringify({
 *         requests: [{ image: { content: base64 }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }]
 *       }),
 *     });
 *     const data = await response.json();
 *     const safe = data.responses[0].safeSearchAnnotation;
 *     const blocked = ['LIKELY', 'VERY_LIKELY'];
 *     if (blocked.includes(safe.adult) || blocked.includes(safe.racy)) {
 *       return { safe: false, reason: 'explicit content detected' };
 *     }
 *     return { safe: true };
 *   });
 */
const stubProvider: ImageModerationProvider = async (_imageUri) => ({ safe: true });

let activeProvider: ImageModerationProvider = stubProvider;

/** Replace the active moderation provider at runtime. Call once at app startup. */
export const setModerationProvider = (provider: ImageModerationProvider): void => {
  activeProvider = provider;
};

/**
 * Moderate an image before upload.
 * Returns { safe: true } when the image is allowed, or
 * { safe: false, reason } when it should be blocked.
 */
export const moderateImage = (imageUri: string): Promise<ModerationResult> => {
  return activeProvider(imageUri);
};
