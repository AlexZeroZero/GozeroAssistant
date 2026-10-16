Gozero MDS Core 0.1.12-rc.2
Windows x64 standalone preview / used by Gozero Assistant 1.0.49

Requires NVIDIA compute capability 8.0+ and PTX9.0-compatible driver.
GozeroMdsCore.exe --backend cuda --payout-address YOUR_MSS_ADDRESS --worker Rig1 --mss-confirmed --duty 0.9
Default pool stratum+tcp://mds.gozero.trade:13333. Use your reusable MSS address.
RTX3090 measured options: --cuda-unroll 2 --cuda-block 256 --cuda-dispatch 4000 --cuda-batch 20992
Other GPUs: leave these options at zero for startup tuning.
This bare executable has no temperature monitor. Use the Assistant for managed Windows mining.
Linux standalone deployment is a separate tar.gz with a temperature supervisor.
No embedded fee in the standalone core; Assistant 0.5% fee unchanged.
Full million-round consensus and CPU candidate verification retained.
See VALIDATION.txt for measurements and limitations.
