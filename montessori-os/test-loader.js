// Custom ESM loader that adds .js extensions to relative imports.
// Needed because source files use extensionless imports (Vite resolves them)
// but Node's built-in test runner requires explicit .js extensions.

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Only try .js for relative imports that have no extension
    if (err.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.\w+$/.test(specifier)) {
      return nextResolve(specifier + '.js', context);
    }
    throw err;
  }
}
