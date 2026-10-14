"""A repeated QA run cannot accept stale cleanup proof or swallowed failures."""
import importlib
import json
from pathlib import Path
import unittest

import pytest


@pytest.mark.parametrize('failure', ['captured_cleanup_error', 'previous_run_receipt'])
def test_volume_runner_rejects_unproven_current_cleanup(tmp_path, monkeypatch, failure):
    monorepo_scripts = Path(__file__).resolve().parents[2] / 'scripts'
    export_scripts = Path(__file__).resolve().parents[1] / 'tests/support/source-operations/scripts'
    scripts = monorepo_scripts if (monorepo_scripts / 'test_invoice_volume.py').is_file() else export_scripts
    monkeypatch.syspath_prepend(str(scripts))
    volume = importlib.import_module('test_invoice_volume')
    class OwnedResources(unittest.TestCase):
        tag = 'current-run'
    if failure == 'captured_cleanup_error':
        def failed_docker_removal():
            raise RuntimeError('Docker removal failed')
        OwnedResources.addClassCleanup(failed_docker_removal)
    (tmp_path/'cleanup.json').write_text(json.dumps({
        'run': 'previous-run' if failure == 'previous_run_receipt' else 'current-run',
        'owned_resources_removed': True, 'private_fixtures_removed': True}))
    monkeypatch.setattr(volume, 'OUTPUT', tmp_path)
    monkeypatch.setattr(volume.InvoiceVolumeTest, 'qa', OwnedResources, raising=False)
    with pytest.raises(RuntimeError):
        volume.InvoiceVolumeTest.cleanup()
