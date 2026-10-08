/**
 * Blockheader und Target -- reines JavaScript, ohne Abhaengigkeiten.
 *
 * ACHTUNG, bewusste Verdopplung: Dieselbe Serialisierung steht in
 * src/lib/core/block.ts. Der Miner soll ohne den Rest des Projekts laufen,
 * deshalb liegt sie hier noch einmal.
 *
 * Abgesichert ist das zweifach:
 *   1. tests/core.test.ts vergleicht diese Datei Byte fuer Byte gegen
 *      serializeHeader() aus dem Projekt.
 *   2. Der Miner prueft sich beim Start selbst am Genesis-Block (selftest).
 *
 * Weicht die Serialisierung auch nur um ein Byte ab, ist JEDER Share
 * ungueltig -- und die Fehlermeldung sagt nur "Hash stimmt nicht".
 */

export const HEADER_SIZE = 136;
export const NONCE_OFFSET = 128;
export const DIFFICULTY_UNIT = 65536n;

/**
 * 136 Byte, Little-Endian.
 *    0 u32 version   |   4 u32 height    |   8 32B prev_hash
 *   40 32B merkle    |  72 32B state     | 104 u64 timestamp
 *  112 u32 difficulty| 116 u32 tx_count  | 120 u64 extranonce
 *  128 u64 nonce
 */
export function serializeHeader(j, nonce = 0n) {
  const b = new Uint8Array(HEADER_SIZE);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, j.version ?? 1, true);
  dv.setUint32(4, j.height, true);
  b.set(fromHex(j.prevHash), 8);
  b.set(fromHex(j.merkleRoot), 40);
  b.set(fromHex(j.stateRoot), 72);
  dv.setBigUint64(104, BigInt(j.timestamp), true);
  dv.setUint32(112, j.difficulty, true);
  dv.setUint32(116, j.txCount, true);
  dv.setBigUint64(120, BigInt(j.extranonce), true);
  dv.setBigUint64(128, BigInt(nonce), true);
  return b;
}

/** target = 2^240 / difficulty, als 32 Byte Big-Endian. */
export function targetBytes(difficulty) {
  const out = new Uint8Array(32);
  let x = (1n << 240n) / BigInt(difficulty);
  for (let i = 31; i >= 0; i--) { out[i] = Number(x & 0xffn); x >>= 8n; }
  return out;
}

export function fromHex(s) {
  const c = s.startsWith('\\x') ? s.slice(2) : s;
  const o = new Uint8Array(c.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(c.substr(i * 2, 2), 16);
  return o;
}

export const toHex = b =>
  Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

/** Speicherlayout der WASM-Engine, siehe wasm/gen_wat.py. */
export const MEM = {
  HEADER: 0, MIDSTATE: 144, NONCE: 176,
  HASH: 304, TARGET: 336, FOUND: 368,
};

/**
 * Selbsttest mit dem Genesis-Block als bekannter Antwort.
 *
 * Faengt zwei Fehler ab, die sonst erst nach Stunden auffallen: eine
 * abgewichene Serialisierung und eine Engine, die nicht zu dieser Fassung
 * passt. Kostet einen Hash.
 */
export const GENESIS = {
  version: 1, height: 0,
  prevHash: '00'.repeat(32),
  merkleRoot: '1007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840',
  stateRoot: 'e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca57',
  timestamp: '1788912000', difficulty: 4096, txCount: 1, extranonce: '0',
  nonce: 50773796n,
  hash: '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66',
};

export function selfTest(mem, initJob, mine) {
  mem.fill(0xff, MEM.TARGET, MEM.TARGET + 32);
  mem.set(serializeHeader(GENESIS, GENESIS.nonce), MEM.HEADER);
  initJob();
  const treffer = mine(Number(GENESIS.nonce) | 0, 1);
  const got = toHex(mem.slice(MEM.HASH, MEM.HASH + 32));
  if (treffer !== 1 || got !== GENESIS.hash) {
    throw new Error(
      'Selbsttest fehlgeschlagen — die Engine passt nicht zu diesem Miner.\n' +
      `  erwartet ${GENESIS.hash}\n  erhalten ${got}`);
  }
}
