'use strict';

// Only migrate persisted profiles. New requests must still pass strict validation.
function migrateRetiredCoins(raw) {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
 let changed = false;
 for (const profile of [raw, ...Object.values(raw.taskProfiles || {})]) {
  if (!profile || typeof profile !== 'object') continue;
  if (profile.coin === 'VELA') {
   profile.coin = 'YSR';
   // Require deliberate device selection before starting another algorithm.
   profile.selected = [];
   changed = true;
  }
  for (const field of ['wallets', 'pools', 'poolBackups', 'kernels', 'manualInputs']) {
   if (profile[field] && Object.hasOwn(profile[field], 'VELA')) {
    delete profile[field].VELA;
    changed = true;
   }
  }
 }
 return changed;
}
module.exports = {migrateRetiredCoins};
