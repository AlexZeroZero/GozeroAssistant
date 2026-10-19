# towerminer benchmarks

All numbers below were **measured**, September 2026, on the TowerWalk proof of work
(Jetsam v1.4+). Nothing is extrapolated from one CPU to another.

## Method

- `towerminer --bench-walk <seconds> --idle-secs 0` (hash rate of the real mining loop,
  package power from RAPL when readable), or `towerminer --tune <seconds>` (every
  candidate profile, two alternating rounds, median).
- Profiles are written `T x P x F`: threads per core x pads (nonces) per thread x prefetch.
- A/B runs alternate the configurations on the same machine in the same session.
- Rented cloud machines run in containers: most had a CPU quota (`cpu.max`) far below the
  number of visible CPUs, and other tenants on the same host. Those rows are marked; their
  absolute rates are **not** the CPU's full capacity (0.3.0 now caps its threads to the quota).

## AMD, whole machine or dedicated CPUs

| CPU | Profile | Rate | Power | Efficiency | Notes |
|---|---|---|---|---|---|
| Ryzen 9 5950X (Zen 3) | Jetsam node's own miner (reference) | 12 492 H/s | 127 W | 98 H/J | same machine, same session as the next rows |
| Ryzen 9 5950X | towerminer 0.2.1, 1 x 1 x 0, 16 threads | **17 400 H/s** | 139.6 W | 124.6 H/J | +39 % vs the node |
| Ryzen 9 5950X | towerminer 0.2.1 `--policy efficiency` (2 x 2 x 1) | 16 472 H/s | 115 W | **142.6 H/J** | +45 % H/J vs the node |
| Ryzen 9 5950X | towerminer 0.2.2, default | 17 360 H/s | ~140 W | ~124 H/J | 3 alternated runs vs 0.2.1: 17 282 H/s (noise) |
| Ryzen 9 7950X3D (Zen 4), 8 cores of the frequency CCD | **2 x 1 x 0** | **15 240 H/s** | ~90 W (capped) | ~169 H/J | runs 15 150 / 15 330; now the Zen 4/5 default |
| Ryzen 9 7950X3D, same 8 cores | 1 x 2 x 0 (0.2.1 default) | 13 840 H/s | ~90 W | ~154 H/J | 2 x 1 x 1: 15 010 / 14 970 ; 2 x 2 x 1: 13 270 / 13 290 ; 1 x 1 x 0: 9 520 / 10 030 |
| 2 x EPYC 7742 (Zen 2), 112 cores | **2 x 1 x 1** | **57 230 H/s** | ~310 W | ~185 H/J | shared host (30-60 cores of other load): runs 56 790 / 57 680; now the Zen 2 default |
| 2 x EPYC 7742, 112 cores | 2 x 2 x 1 (0.2.1 default) | 53 400 H/s | ~300 W | ~178 H/J | runs 54 020 / 52 770 ; 1 x 1 x 0: 52 470-57 300 |
| 2 x EPYC 7742, 64 cores (one per pair) | 1 x 1 x 0 | 49 900 H/s | | | 780 H/s per core, while mining |

**Linux frequency governor on EPYC (acpi-cpufreq):** the `powersave` governor pins the lowest
P-state (1.5 GHz on an EPYC 7742) whatever the frequency cap. A thermal script that switched to
`powersave` above 70 °C left one 2 x EPYC 7742 box at 1.5 GHz two thirds of the time: 56-57 kH/s.
Capping `scaling_max_freq` with the `performance` governor instead: **63.0 kH/s** (12 min mean),
same peak temperature.

## Intel, rented cloud machines (towerminer 0.2.2 engine)

Every machine: `--gate` PASS and `--check-nonces` with 0 wrong, 0 duplicate, 0 out-of-range
nonces. Backends seen: `pclmul` (no VPCLMULQDQ, including a 2012 Xeon without AVX2),
`avx2+vpclmul`, `avx512bw+vpclmul`. "Default" = the 0.2.2 profile for unknown CPUs
(2 x 1 x 0); 0.3.0 adds Intel rows derived from this table.

| CPU (generation) | Visible CPUs | CPU quota | Default (2 x 1 x 0) | `--tune` best (median) | Notes |
|---|---|---|---|---|---|
| Xeon E5-2670 (Sandy Bridge, no AVX2) | 32 | 15.4 | 2 776 H/s | 1 x 2 x 1: 7 310 H/s | quota |
| Xeon E5-2620 v3 (Haswell) | 12 | 5.8 | 1 160 H/s | 1 x 2 x 1: 2 510 H/s | quota |
| Core i7-8700K (Coffee Lake) | 12 | 11.5 | 4 950 H/s | 2 x 1 x 0: 4 950 H/s | almost no quota |
| Xeon Gold 5115 (Skylake-SP) | 40 | 4.8 | 1 152 H/s | 1 x 2 x 1: 2 050 H/s | quota |
| Xeon Gold 6244 (Cascade Lake) | 32 | 15.4 | 8 023 H/s | 1 x 2 x 0: 18 540 H/s (one run) | quota; tune stopped by the thermal guard (77 °C) |
| Core i7-11700F (Rocket Lake) | 6 | 5.8 | 3 624 H/s | 2 x 1 x 1: 3 240 H/s | no temperature sensor in the container |
| Xeon Gold 6330 (Ice Lake-SP) | 112 | 13.4 | 2 381 H/s | 1 x 2 x 1: 4 530 H/s | quota |
| Core i7-12700 (Alder Lake, P+E) | 16 | 3.8 | 3 470 H/s | 1 x 2 x 1: 5 140 H/s | quota |
| Core i7-13700 (Raptor Lake, P+E) | 16 | 3.8 | | 1 x 2 x 1: 4 610 H/s | quota |
| Core i5-14600K (Raptor Lake, P+E) | 20 | 6.4 | 2 362 H/s | | tune stopped by the thermal guard (+14 °C/s) |
| Xeon Gold 6430 (Sapphire Rapids) | 128 | none | 15 944 H/s | 2 x 2 x 1: 17 250 H/s | VM, no temperature sensor |
| Core Ultra 9 285K (Arrow Lake, no SMT) | 24 | none | 9 514 H/s | 2 x 2 x 1: 14 370 H/s (one run) | 1 x 2 x 1: 14 320 H/s |

Rows marked "quota" favour one thread per core artificially (fewer threads fit the quota);
read them as "does it run correctly", not as the CPU's speed. The 0.3.0 Intel row
"SMT with L2 >= 2 MiB -> 2 x 2 x 1" is deduced, not measured without a quota.

## Reproduce

```
towerminer --bench-walk 60 --idle-secs 0        # current profile
towerminer --tune 60                            # every candidate, stores the best for this CPU
towerminer --gate && towerminer --check-nonces 30
```
