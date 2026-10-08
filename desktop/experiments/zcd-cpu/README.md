# XMRig CPU source build for Gozero

This is a transparent, experimental Windows x64 build of XMRig 6.26.0 for
Zycord's `rx/2` CPU algorithm. It is not a new mining algorithm and is not
advertised as undetectable, signed, antivirus-approved, or faster than upstream.
Gozero 1.0.20 includes cpu.2 as its default ZCD adapter, with the unchanged official
XMRig available as a separate choice.

## Scope

- Retain RandomX, CPU assembly optimizations, hardware topology and TLS Stratum.
- Compile out CUDA, OpenCL, HTTP management, MSR access, DMI and unused optional
  mining algorithm families. RandomX's required Argon2 code remains enabled.
- Enable secure JIT memory handling. Fix permission transitions to cover the
  entire owned allocation: AVX2 dataset code can exceed the first 64 KiB.
  cpu.1 crashed on the tested CPU during dataset initialization; do not use it.
  Proof-of-work logic is unchanged; see the offline benchmark report.
- Use existing large-page privileges only; remove automatic account-rights grants.
  Do not request elevation, install drivers, or change system/security policies.
- Preserve the XMRig name, copyright and GPL license. At the user's explicit
  request, cpu.2 sets upstream's default/minimum donation constants to zero
  (permitted by the upstream comment in src/donate.h). The official binary
  remains unchanged and retains its 1% fee.
  The assistant's separately disclosed 0.5% fee belongs to its controller, not
  this standalone binary.
- Do not copy driver files or example mining launch scripts into the output.

## Build

`inputs.json` pins source and dependency archives and the portable GCC/CMake
toolchain. Toolchain and CMake download hashes are checked against publisher
checksum files. Source archives are anchored to explicit upstream commits;
their recorded SHA256 values identify the downloaded inputs, not a digital
publisher signature.

Place the four archives at an ASCII-only build path as `source.zip`, `deps.zip`,
`toolchain.zip` and `cmake.zip`; unpack each into its matching directory. Then run:

```powershell
python build.py --root C:\path\to\isolated-build
```

The script verifies archives, applies the small documented source patch, and
builds with four compiler jobs. It does not launch mining. `output` contains
the executable, license, exact source patch, build record and input manifest.
Keep the source archive and patch with any redistribution of the binary, and
retain dependency licenses and corresponding source obligations. XMRig is
GPL-3.0-or-later; this recipe does not relicense it under the application's MIT
license. Build timestamps and absolute paths may prevent byte-identical rebuilds.

## Validation and limitations

Compilation, startup/configuration checks, algorithm checks, pool share
acceptance, performance comparison and antivirus-vendor review are separate
results. Passing one does not imply the others passed. With no ZCD pool endpoint,
share acceptance and payment attribution cannot be verified. Do not replace the
production default based only on a successful compile or an absent popup.

Unsigned mining programs can still be classified as unwanted software or blocked
by behavioral protection. Address a disputed detection using the vendor's sample
review process and the exact detection name, executable SHA256, public source and
build record. Do not disable protection, add broad exclusions, hide behavior,
pack/obfuscate the executable, or repeatedly alter it to chase detection results.
