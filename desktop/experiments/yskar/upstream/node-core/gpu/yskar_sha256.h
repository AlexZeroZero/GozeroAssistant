/*
 * YSKAR SHA-256d fuer den 136-Byte-Blockheader.
 *
 * Dieselbe Datei wird zweimal uebersetzt:
 *
 *   nvcc  fuer die GPU     (yskar_gpu.cu)
 *   gcc   fuer die Pruefung (test/test_sha.c)
 *
 * Das ist Absicht. Die GPU-Ausfuehrung laesst sich nur auf einem Rechner mit
 * NVIDIA-Karte testen. Die RECHNUNG dagegen laesst sich ueberall pruefen --
 * wenn es dieselbe Rechnung ist. Ein zweiter, getrennt geschriebener
 * Pruefcode wuerde nur beweisen, dass der Pruefcode stimmt.
 *
 * ---------------------------------------------------------------------
 * Aufbau des Headers (136 Byte, siehe src/lib/core/block.ts):
 *
 *     0   version        u32 LE
 *     4   height         u32 LE
 *     8   prev_hash      32
 *    40   merkle_root    32
 *    72   state_root     32
 *   104   timestamp      u64 LE
 *   112   difficulty     u32 LE
 *   116   tx_count       u32 LE
 *   120   extranonce     u64 LE
 *   128   nonce          u64 LE
 *
 * 136 Byte sind zwei volle SHA-256-Bloecke (0..127) und acht Byte im
 * dritten. Die Nonce liegt VOLLSTAENDIG im dritten Block -- also ist der
 * Zustand nach den ersten beiden Bloecken fuer einen ganzen Job gleich.
 * Dieser "Midstate" wird einmal je Job gerechnet; je Versuch bleiben zwei
 * Kompressionen statt vier. Die WASM-Engine macht genau dasselbe.
 *
 * Verglichen wird der Hash BYTEWEISE VON VORN gegen das Ziel -- so wie
 * submitNonce() im Knoten es tut. Byte 0 ist das hoechstwertige.
 * ---------------------------------------------------------------------
 */
#ifndef YSKAR_SHA256_H
#define YSKAR_SHA256_H

#include <stdint.h>

#ifdef __CUDACC__
#  define YSKAR_FN __host__ __device__ __forceinline__
#  define YSKAR_CONST __constant__
#else
#  define YSKAR_FN static inline
#  define YSKAR_CONST static const
#endif

#define YSKAR_HEADER_BYTES 136
#define YSKAR_NONCE_OFFSET 128

YSKAR_CONST uint32_t YSKAR_K[64] = {
  0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
  0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
  0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
  0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
  0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
  0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
  0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
  0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u,
};

#define YSKAR_ROTR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))

/* Anfangszustand von SHA-256. */
YSKAR_FN void yskar_sha_init(uint32_t s[8]) {
  s[0] = 0x6a09e667u; s[1] = 0xbb67ae85u; s[2] = 0x3c6ef372u; s[3] = 0xa54ff53au;
  s[4] = 0x510e527fu; s[5] = 0x9b05688cu; s[6] = 0x1f83d9abu; s[7] = 0x5be0cd19u;
}

/*
 * Eine SHA-256-Kompression ueber 16 Woerter.
 *
 * Die Woerter sind bereits Big-Endian gelesen -- SHA-256 rechnet in
 * Big-Endian, der YSKAR-Header ist Little-Endian. Die Umwandlung passiert
 * beim Einlesen, nicht hier.
 */
YSKAR_FN void yskar_sha_block(uint32_t s[8], const uint32_t in[16]) {
  uint32_t w[64];
  for (int i = 0; i < 16; i++) w[i] = in[i];
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = YSKAR_ROTR(w[i-15], 7) ^ YSKAR_ROTR(w[i-15], 18) ^ (w[i-15] >> 3);
    uint32_t s1 = YSKAR_ROTR(w[i-2], 17) ^ YSKAR_ROTR(w[i-2], 19) ^ (w[i-2] >> 10);
    w[i] = w[i-16] + s0 + w[i-7] + s1;
  }
  uint32_t a = s[0], b = s[1], c = s[2], d = s[3];
  uint32_t e = s[4], f = s[5], g = s[6], h = s[7];
  for (int i = 0; i < 64; i++) {
    uint32_t S1 = YSKAR_ROTR(e, 6) ^ YSKAR_ROTR(e, 11) ^ YSKAR_ROTR(e, 25);
    uint32_t ch = (e & f) ^ (~e & g);
    uint32_t t1 = h + S1 + ch + YSKAR_K[i] + w[i];
    uint32_t S0 = YSKAR_ROTR(a, 2) ^ YSKAR_ROTR(a, 13) ^ YSKAR_ROTR(a, 22);
    uint32_t mj = (a & b) ^ (a & c) ^ (b & c);
    uint32_t t2 = S0 + mj;
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  s[0] += a; s[1] += b; s[2] += c; s[3] += d;
  s[4] += e; s[5] += f; s[6] += g; s[7] += h;
}

/* 64 Byte als 16 Big-Endian-Woerter lesen. */
YSKAR_FN void yskar_load_be(uint32_t out[16], const uint8_t *p) {
  for (int i = 0; i < 16; i++) {
    out[i] = ((uint32_t)p[i*4] << 24) | ((uint32_t)p[i*4+1] << 16)
           | ((uint32_t)p[i*4+2] << 8) | (uint32_t)p[i*4+3];
  }
}

/*
 * Midstate: Zustand nach den ersten 128 Byte des Headers.
 *
 * Einmal je Job. Die Nonce beginnt bei Byte 128 und beruehrt diese beiden
 * Bloecke nicht.
 */
YSKAR_FN void yskar_midstate(uint32_t mid[8], const uint8_t header[YSKAR_HEADER_BYTES]) {
  uint32_t w[16];
  yskar_sha_init(mid);
  yskar_load_be(w, header);      yskar_sha_block(mid, w);
  yskar_load_be(w, header + 64); yskar_sha_block(mid, w);
}

/*
 * SHA-256d fuer eine Nonce, ausgehend vom Midstate.
 *
 * Dritter Block: acht Nonce-Byte (Little-Endian, wie im Header), dann das
 * Endbit 0x80, dann Nullen, am Ende die Laenge in Bit (136 * 8 = 1088).
 *
 * Zweiter Durchlauf: 32 Byte Hash, 0x80, Nullen, Laenge 256 Bit.
 *
 * Ergebnis als 32 Byte in der Reihenfolge, in der auch Node sie ausgibt.
 */
YSKAR_FN void yskar_hash_nonce(uint8_t out[32], const uint32_t mid[8], uint64_t nonce) {
  uint32_t s[8];
  for (int i = 0; i < 8; i++) s[i] = mid[i];

  /* Nonce-Bytes in der Header-Reihenfolge (LE), dann als BE-Woerter gelesen. */
  uint8_t n[8];
  for (int i = 0; i < 8; i++) n[i] = (uint8_t)(nonce >> (8 * i));

  uint32_t w[16];
  w[0] = ((uint32_t)n[0] << 24) | ((uint32_t)n[1] << 16) | ((uint32_t)n[2] << 8) | n[3];
  w[1] = ((uint32_t)n[4] << 24) | ((uint32_t)n[5] << 16) | ((uint32_t)n[6] << 8) | n[7];
  w[2] = 0x80000000u;
  for (int i = 3; i < 15; i++) w[i] = 0;
  w[15] = YSKAR_HEADER_BYTES * 8;
  yskar_sha_block(s, w);

  /* Zweiter Durchlauf ueber die 32 Byte des ersten. */
  uint32_t t[8];
  yskar_sha_init(t);
  for (int i = 0; i < 8; i++) w[i] = s[i];
  w[8] = 0x80000000u;
  for (int i = 9; i < 15; i++) w[i] = 0;
  w[15] = 256;
  yskar_sha_block(t, w);

  for (int i = 0; i < 8; i++) {
    out[i*4]   = (uint8_t)(t[i] >> 24);
    out[i*4+1] = (uint8_t)(t[i] >> 16);
    out[i*4+2] = (uint8_t)(t[i] >> 8);
    out[i*4+3] = (uint8_t)(t[i]);
  }
}

/*
 * hash <= ziel, byteweise von vorn.
 *
 * Genau die Pruefung aus submitNonce(). Byte 0 ist das hoechstwertige;
 * beim ersten Unterschied entscheidet dieses Byte.
 */
YSKAR_FN int yskar_meets_target(const uint8_t hash[32], const uint8_t target[32]) {
  for (int i = 0; i < 32; i++) {
    if (hash[i] < target[i]) return 1;
    if (hash[i] > target[i]) return 0;
  }
  return 1;
}

#endif
