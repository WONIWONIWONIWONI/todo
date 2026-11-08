import io
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools import check_crawl_backup, crawl_blip, crawl_x


class CrawlRecoveryTests(unittest.TestCase):
    def test_long_x_notice_retries_and_preserves_processed_items(self):
        now = datetime(2026, 11, 8, tzinfo=crawl_x.KST)
        old = {'id': '1', 'at': '2026-11-04T10:00', 'text': '할 수', 'state': 'wait'}
        inbox = {'items': [old, dict(old, id='2', state='done'), dict(old, id='3', state='skip')]}
        calls = []

        def unavailable(tid):
            calls.append(tid)
            return None

        self.assertTrue(crawl_x.refresh_inbox(inbox, [], now, unavailable))
        self.assertFalse(crawl_x.refresh_inbox(inbox, [], now, unavailable))
        self.assertEqual(calls, ['1', '1'])
        complete = '할 수 있습니다.\n\n투표 링크 https://example.org'
        self.assertTrue(crawl_x.refresh_inbox(inbox, [], now, lambda _: (complete, True)))
        self.assertEqual((old['text'], old['guess'], old['state']), (complete, 'todo', 'wait'))
        self.assertFalse(crawl_x.refresh_inbox(inbox, [], now, self.fail))

    def test_thread_lookup_only_uses_requested_post(self):
        import json
        payload = {'status': {'id': '123', 'text': '원 게시물 전체', 'is_note_tweet': True},
                   'thread': [{'id': '456', 'text': '다른 게시물'}]}
        with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(payload).encode())):
            self.assertEqual(crawl_x.long_text('123'), ('원 게시물 전체', True))
        with patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(payload).encode())):
            self.assertIsNone(crawl_x.long_text('456'))

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
