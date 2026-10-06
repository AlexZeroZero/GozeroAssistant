# SPDX-License-Identifier: Apache-2.0
# Experimental generators; consensus attribution and pinned sources: ../NOTICE.
# These rejected/screened variants are NOT used by the distributed miner.

import subprocess,sys,pathlib,json,hashlib
from common import ROOT,OUT
for script in ('bitslice.py','hybrid.py','scalar.py','layouts.py','cl_tables.py'):
    subprocess.run([sys.executable,str(pathlib.Path(__file__).with_name(script))],cwd=ROOT,check=True)
manifest={'baselineRevision':'692df24','scope':'Offline research generation; not proof of GPU performance',
    'sources':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(OUT.glob('*.metal'))}}
(OUT/'sources.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(OUT)
