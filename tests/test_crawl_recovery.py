import io
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools import check_crawl_backup, crawl_blip


class CrawlRecoveryTests(unittest.TestCase):
    def test_partial_mnet_failure_preserves_subscribed_calendar(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'rescene.ics'
            path.write_bytes(b'previous calendar')
            with patch.object(crawl_blip, 'ICS', path), patch.object(
                crawl_blip, 'mnet_month', side_effect=[[], OSError(), [], [], []]
            ):
                _, fetched = crawl_blip.write_ics({}, datetime(2026, 11, 8, tzinfo=timezone.utc))
            self.assertEqual(path.read_bytes(), b'previous calendar')
            self.assertEqual(len(fetched), 4)

    def test_error_payload_is_not_an_empty_month(self):
        with patch('urllib.request.urlopen', return_value=io.BytesIO(b'{"error":"limited"}')):
            with self.assertRaises(ValueError):
                crawl_blip.mnet_month(2026, 11)
        with patch('urllib.request.urlopen', return_value=io.BytesIO(b'{"events":[]}')):
            self.assertEqual(crawl_blip.mnet_month(2026, 11), [])

    def test_backup_runs_after_failure_or_missed_interval(self):
        now = datetime(2026, 11, 8, 12, tzinfo=timezone.utc)
        success = {'created_at':'2026-11-08T11:56:00Z', 'conclusion':'success'}
        failure = {'created_at':'2026-11-08T11:59:00Z', 'conclusion':'failure'}
        self.assertTrue(check_crawl_backup.recent_success([success], 10, now))
        self.assertFalse(check_crawl_backup.recent_success([success, failure], 10, now))
        self.assertFalse(check_crawl_backup.recent_success([success], 2, now))
