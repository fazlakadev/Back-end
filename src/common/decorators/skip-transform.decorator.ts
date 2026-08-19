import { SetMetadata } from '@nestjs/common';

export const SKIP_TRANSFORM_KEY = 'skip_transform';

/**
 * Skips the global TransformInterceptor for a route (e.g. SSE streams where
 * the envelope wrapper would corrupt the event payloads).
 */
export const SkipTransform = () => SetMetadata(SKIP_TRANSFORM_KEY, true);
