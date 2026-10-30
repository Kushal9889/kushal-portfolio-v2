"""A failed tool must never become a passing release gate."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]

def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class ReleaseGateTests(unittest.TestCase):
    def test_benchmark_rejects_nonzero_even_with_pass_output(self):
        bench = load('bench-film')
        with patch.object(bench.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, 'PASS', 'failure')):
            with self.assertRaises(RuntimeError):
                bench.run(['gate'])

    def test_benchmark_returns_success_output(self):
        bench = load('bench-film')
        result = subprocess.CompletedProcess([], 0, 'PASS', '')
        with patch.object(bench.subprocess, 'run', return_value=result):
            self.assertIs(bench.run(['gate']), result)

    def test_film_check_preserves_real_exit_status(self):
        jobs, _ = load('film-gates').plan('std')
        self.assertEqual(next(cmd for name, cmd, _ in jobs if name == 'check'), ['npm', 'run', 'check'])

    def test_ui_suite_propagates_python_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            stub = Path(directory) / 'python3'
            stub.write_text('#!/bin/sh\necho PASS\nexit 7\n')
            stub.chmod(0o755)
            result = subprocess.run(['bash', 'scripts/ui-suite.sh'], cwd=ROOT,
                env={**os.environ, 'PATH': directory + ':' + os.environ['PATH']}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 7)
            self.assertNotIn('suite passed', result.stdout)

    def test_fault_matrix_stops_on_failed_evaluation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'node_modules/.bin').mkdir(parents=True)
            (root / 'scripts/agent-faults.sh').write_text((ROOT / 'scripts/agent-faults.sh').read_text())
            stub = root / 'node_modules/.bin/tsx'
            stub.write_text('#!/bin/sh\necho "GATE FAIL"\nexit 9\n')
            stub.chmod(0o755)
            result = subprocess.run(['bash', str(root / 'scripts/agent-faults.sh')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 9)
            self.assertNotIn('AGENT_FAULT=429', result.stdout)

if __name__ == '__main__':
    unittest.main()
