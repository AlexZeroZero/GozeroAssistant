/*
 * YSKAR CUDA-Backend -- Kernel und Geraetezugriff.
 *
 * DIESE DATEI ENTHAELT KEINE C++-STANDARDBIBLIOTHEK. Nur C-Kopfdateien und
 * cuda_runtime.h. Das ist keine Stilfrage, sondern notwendig:
 *
 *   MSVC 14.44 (Visual Studio 2022, neuere Fassungen) bricht ab, sobald
 *   seine Standardbibliothek mit CUDA vor 12.4 uebersetzt wird:
 *
 *     yvals_core.h: error STL1002: Unexpected compiler version,
 *                   expected CUDA 12.4 or newer
 *
 *   CUDA 12.4 kann aber Compute Capability 5.0 (z.B. GeForce 940MX) nicht
 *   mehr uebersetzen -- dafuer braucht es 11.8. Beides zugleich geht nur,
 *   wenn nvcc die Standardbibliothek gar nicht erst zu sehen bekommt.
 *
 * Deshalb: Hier der Kernel, daneben yskar_host.cpp mit Protokoll, Faeden
 * und Zeichenketten -- uebersetzt von cl.exe oder g++, ohne CUDA. Verbunden
 * werden beide ueber die schmale C-Schnittstelle in yskar_backend.h.
 *
 * Gerechnet wird nichts anderes als vorher. yskar_sha256.h ist unveraendert
 * dieselbe Datei, die auch die Pruefung mit gcc uebersetzt.
 */
#include <stdint.h>
#include <string.h>
#include <stdio.h>

#include <cuda_runtime.h>

#include "yskar_sha256.h"
#include "yskar_backend.h"

/* Midstate und Ziel liest jeder Thread, keiner schreibt -- genau dafuer ist
   der Konstantenspeicher da. */
__constant__ uint32_t c_mid[8];
__constant__ uint8_t  c_target[32];

static char   g_fehler[512] = {0};
static int    g_bloecke = 0;
static int    g_threads = 256;
static unsigned long long *g_treffer = NULL;

static int melde(const char *was, cudaError_t e) {
  snprintf(g_fehler, sizeof g_fehler, "%s: %s", was, cudaGetErrorString(e));
  return 1;
}
#define CUDA_OK(was, x) do { cudaError_t e_ = (x); if (e_ != cudaSuccess) return melde(was, e_); } while (0)

/*
 * Jeder Thread prueft `iters` Nonces im Abstand der Gittergroesse.
 *
 * Der Abstand statt aufeinanderfolgender Nonces je Thread ist Absicht:
 * Benachbarte Threads arbeiten an benachbarten Nonces, und am Ende eines
 * Stapels ist ein lueckenloser Bereich abgearbeitet.
 */
__global__ void yskar_kernel(uint64_t basis, uint32_t iters,
                             unsigned long long *treffer) {
  const uint64_t tid = (uint64_t)blockIdx.x * blockDim.x + threadIdx.x;
  const uint64_t schritt = (uint64_t)gridDim.x * blockDim.x;
  uint8_t hash[32];

  for (uint32_t k = 0; k < iters; k++) {
    const uint64_t nonce = basis + tid + (uint64_t)k * schritt;
    yskar_hash_nonce(hash, c_mid, nonce);
    if (yskar_meets_target(hash, c_target)) {
      /* KEIN return: Der Thread rechnet seine Iterationen zu Ende. Sonst
         blieben Nonces ungeprueft, waehrend der Rechner sie als geprueft
         zaehlt -- die gemeldete Hashrate waere zu hoch. */
      atomicCAS(treffer, (unsigned long long)YSKAR_NONE, (unsigned long long)nonce);
    }
  }
}

/* Einen einzigen Hash auf der Karte rechnen -- fuer den Selbsttest. */
__global__ void yskar_einzel(uint64_t nonce, uint8_t *aus) {
  if (blockIdx.x == 0 && threadIdx.x == 0) yskar_hash_nonce(aus, c_mid, nonce);
}

/* ------------------------------------------------------- Schnittstelle */

extern "C" {

int yskar_dev_is_emulation(void) { return 0; }
const char *yskar_dev_error(void) { return g_fehler; }

int yskar_dev_count(int *anzahl) {
  *anzahl = 0;
  cudaError_t e = cudaGetDeviceCount(anzahl);
  if (e != cudaSuccess) { *anzahl = 0; return melde("CUDA nicht verfuegbar", e); }
  return 0;
}

int yskar_dev_info(int id, char *name, int namelen,
                   int *major, int *minor, unsigned long long *vram, int *sm) {
  cudaDeviceProp p;
  CUDA_OK("cudaGetDeviceProperties", cudaGetDeviceProperties(&p, id));
  snprintf(name, (size_t)namelen, "%s", p.name);
  *major = p.major; *minor = p.minor;
  *vram = (unsigned long long)p.totalGlobalMem;
  *sm = p.multiProcessorCount;
  return 0;
}

int yskar_dev_init(int id) {
  cudaDeviceProp p;
  CUDA_OK("cudaSetDevice", cudaSetDevice(id));
  CUDA_OK("cudaGetDeviceProperties", cudaGetDeviceProperties(&p, id));
  /* Genug Bloecke, damit jeder Multiprozessor mehrere hat -- sonst stehen
     Rechenwerke still, waehrend auf Speicher gewartet wird. */
  g_bloecke = p.multiProcessorCount * 8;
  if (g_bloecke < 1) g_bloecke = 1;
  CUDA_OK("cudaMalloc", cudaMalloc(&g_treffer, sizeof(unsigned long long)));
  return 0;
}

int yskar_dev_set_job(const uint32_t mid[8], const uint8_t target[32]) {
  CUDA_OK("cudaMemcpyToSymbol(mid)", cudaMemcpyToSymbol(c_mid, mid, sizeof(uint32_t) * 8));
  CUDA_OK("cudaMemcpyToSymbol(target)", cudaMemcpyToSymbol(c_target, target, 32));
  return 0;
}

unsigned long long yskar_dev_batchsize(unsigned int iters) {
  return (unsigned long long)g_bloecke * (unsigned long long)g_threads * iters;
}

int yskar_dev_batch(unsigned long long basis, unsigned int iters,
                    unsigned long long *geprueft, unsigned long long *gefunden) {
  const unsigned long long keine = YSKAR_NONE;
  CUDA_OK("cudaMemcpy(reset)", cudaMemcpy(g_treffer, &keine, sizeof keine, cudaMemcpyHostToDevice));
  yskar_kernel<<<g_bloecke, g_threads>>>(basis, iters, g_treffer);
  CUDA_OK("Kernelstart", cudaGetLastError());
  CUDA_OK("cudaDeviceSynchronize", cudaDeviceSynchronize());
  CUDA_OK("cudaMemcpy(treffer)", cudaMemcpy(gefunden, g_treffer, sizeof *gefunden, cudaMemcpyDeviceToHost));
  *geprueft = yskar_dev_batchsize(iters);
  return 0;
}

int yskar_dev_single(unsigned long long nonce, unsigned char aus[32]) {
  uint8_t *d = NULL;
  CUDA_OK("cudaMalloc(hash)", cudaMalloc(&d, 32));
  yskar_einzel<<<1, 1>>>(nonce, d);
  cudaError_t e = cudaGetLastError();
  if (e == cudaSuccess) e = cudaDeviceSynchronize();
  if (e == cudaSuccess) e = cudaMemcpy(aus, d, 32, cudaMemcpyDeviceToHost);
  cudaFree(d);
  if (e != cudaSuccess) return melde("Einzelhash", e);
  return 0;
}

/* Genau ein Thread, genau eine Nonce -- ohne Wettlauf zwischen Threads. */
int yskar_dev_one(unsigned long long nonce, unsigned long long *gefunden) {
  const unsigned long long keine = YSKAR_NONE;
  CUDA_OK("cudaMemcpy(reset)", cudaMemcpy(g_treffer, &keine, sizeof keine, cudaMemcpyHostToDevice));
  yskar_kernel<<<1, 1>>>(nonce, 1, g_treffer);
  CUDA_OK("Kernelstart", cudaGetLastError());
  CUDA_OK("cudaDeviceSynchronize", cudaDeviceSynchronize());
  CUDA_OK("cudaMemcpy(treffer)", cudaMemcpy(gefunden, g_treffer, sizeof *gefunden, cudaMemcpyDeviceToHost));
  return 0;
}

void yskar_dev_free(void) {
  if (g_treffer) { cudaFree(g_treffer); g_treffer = NULL; }
}

}  /* extern "C" */
