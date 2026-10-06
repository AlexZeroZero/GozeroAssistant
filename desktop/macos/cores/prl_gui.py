"""Expose upstream pool telemetry to the GUI without changing mining or fees."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / 'prl/scripts'))
import pmk_mine


class JsonStatus:
    def __init__(self, sink):
        self.sink = sink

    def __call__(self, event, **fields):
        if event not in {'gpu_dispatch', 'completed', 'python_overhead'}:
            self.sink(event, **fields)


pmk_mine.Status = JsonStatus
if __name__ == '__main__':
    try:
        raise SystemExit(pmk_mine.main())
    except KeyboardInterrupt:
        raise SystemExit(0)
