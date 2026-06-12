process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err.message);
  console.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] unhandledRejection:', reason);
  process.exit(1);
});
console.log('[start] loading dist/index.cjs...');
try {
  require('./dist/index.cjs');
  console.log('[start] dist/index.cjs loaded OK');
} catch(e) {
  console.error('[CRASH] Failed to load dist/index.cjs:', e.message);
  console.error(e.stack);
  process.exit(1);
}