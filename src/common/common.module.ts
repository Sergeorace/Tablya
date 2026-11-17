import { Global, Module } from '@nestjs/common';
import { JsonLogger } from './json.logger';

/**
 * Module global : JsonLogger injectable partout sans import explicite.
 * Le logger lit le contexte requête via AsyncLocalStorage (als.ts).
 */
@Global()
@Module({
  providers: [JsonLogger],
  exports: [JsonLogger],
})
export class CommonModule {}
