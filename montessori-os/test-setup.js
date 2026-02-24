// Registers the custom ESM loader before tests run.
// Used via: node --import ./test-setup.js --test
import { register } from 'node:module';

register('./test-loader.js', import.meta.url);
