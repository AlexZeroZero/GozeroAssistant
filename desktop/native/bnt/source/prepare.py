"""Prepare pinned, licensed PoW reference sources; never runs a miner."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parents[2]/'.local/blocknet-research'

def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def main():
    source = RESEARCH/'core-master'
    argon = RESEARCH/'phc-winner-argon2-20190702'
    assert digest(RESEARCH/'argon2-source.zip') == '506a80b90ac3ca8407636f3b26b7fed87a55f2f1275cde850cd6698903c4f008'
    assert digest(source/'crypto-rs/src/pow.rs') == 'edf5e236ae3dd61c72eaaf98bf9c6f0bb2460f3cd065ecf02626b887041da158'
    (HERE/'vendor/blocknet').mkdir(parents=True, exist_ok=True)
    shutil.copy2(source/'crypto-rs/src/pow.rs', HERE/'vendor/blocknet/pow.rs')
    shutil.copy2(source/'LICENSE', HERE/'vendor/blocknet/LICENSE')
    for name in ['src', 'include']:
        shutil.copytree(argon/name, HERE/'vendor/argon2'/name, dirs_exist_ok=True)
    shutil.copy2(argon/'LICENSE', HERE/'vendor/argon2/LICENSE')
    # These workspaces contain public PoW inputs, not wallet keys or passwords.
    # Avoid a redundant 2 GiB wipe after each hash; never use this build as a KDF.
    core = HERE/'vendor/argon2/src/core.c'
    text = core.read_text(encoding='utf-8')
    assert text.count('int FLAG_clear_internal_memory = 1;') == 1
    core.write_text(text.replace('int FLAG_clear_internal_memory = 1;',
        '/* Gozero: public PoW only. Not suitable for password hashing. */\nint FLAG_clear_internal_memory = 0;'), encoding='utf-8')
    # Specialize indexing for the consensus-fixed p=1, t=1 case. Leave the
    # compression function intact. This removes divisions, cross-lane branches,
    # and the external index_alpha call from every 1 KiB block.
    opt = (argon/'src/opt.c').read_text(encoding='utf-8')
    start = opt.index('        /* 1.2.2 Computing the lane')
    end = opt.index('        curr_block =', start)
    opt = opt[:start]+'''        /* Gozero specialization: one lane, first and only pass. */
        uint64_t x = (uint32_t)pseudo_rand;
        uint64_t relative = (x * x) >> 32;
        ref_index = curr_offset - 2 - (uint32_t)(((uint64_t)(curr_offset - 1) * relative) >> 32);
        ref_block = instance->memory + ref_index;
'''+opt[end:]
    needle = '        curr_block = instance->memory + curr_offset;'
    assert opt.count(needle) == 1
    opt = opt.replace(needle, '''#ifdef GOZERO_PREFETCH
        /* First half uses known address blocks: fetch a future reference while
         * the CPU compresses current data. Never read ahead across address-block
         * or segment boundaries. Prefetch affects scheduling only, not hashing. */
        if (data_independent_addressing && i + 4 < instance->segment_length &&
            (i % ARGON2_ADDRESSES_IN_BLOCK) + 4 < ARGON2_ADDRESSES_IN_BLOCK) {
            uint64_t future = (uint32_t)address_block.v[(i % ARGON2_ADDRESSES_IN_BLOCK) + 4];
            future = (future * future) >> 32;
            uint32_t at = curr_offset + 4;
            uint32_t index = at - 2 - (uint32_t)(((uint64_t)(at - 1) * future) >> 32);
            const char *ptr = (const char *)(instance->memory + index);
            for (unsigned line = 0; line < ARGON2_BLOCK_SIZE; line += 64)
                __builtin_prefetch(ptr + line, 0, 0);
        }
#endif
'''+needle)
    (HERE/'native/gozero-opt.c').write_text(opt, encoding='utf-8')
    with zipfile.ZipFile(RESEARCH/'core-master.zip') as z:
        commit = z.comment.decode('ascii')
    manifest = {'blocknet': {'repository': 'https://github.com/blocknetprivacy/core',
        'archiveCommit': commit, 'archiveSha256': digest(RESEARCH/'core-master.zip'),
        'powSha256': digest(HERE/'vendor/blocknet/pow.rs'), 'license': 'BSD-3-Clause'},
        'argon2': {'repository': 'https://github.com/P-H-C/phc-winner-argon2',
        'tag': '20190702', 'archiveSha256': digest(RESEARCH/'argon2-source.zip'),
        'license': 'Apache-2.0 OR CC0-1.0'},
        'changes': ['Public PoW workspace reuse; omit redundant wipe',
                    'Runtime AVX2 detection with SSE2 fallback',
                    'One-lane, one-pass index specialization',
                    'Optional four-block look-ahead prefetch in the data-independent half'],
        'consensus': {'argon2':'id', 'version':19, 'memoryKiB':2097152,
                      'iterations':1, 'lanes':1, 'outputBytes':32, 'nonce':'uint64 little-endian', 'salt':'92-byte block header'}}
    (HERE/'sources.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print('Prepared verified reference sources', commit)

if __name__ == '__main__':
    main()
