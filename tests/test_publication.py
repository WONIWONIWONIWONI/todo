import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('promote',Path(__file__).resolve().parent.parent/'tools/promote_draft.py')
promote=importlib.util.module_from_spec(spec);spec.loader.exec_module(promote)
class PublicationTests(unittest.TestCase):
    def test_deleted_task_ids_stay_reserved_after_publication(self):
        with tempfile.TemporaryDirectory() as temp:
            stage = Path(temp)
            tasks = stage / promote.TASK_FILE
            tasks.parent.mkdir()
            tasks.write_text('아이디,내용\nS1,계속\nS2,삭제\n', encoding='utf-8')
            registry = stage / promote.RETIRED_FILE
            registry.write_text('아이디\nZ-G1\n', encoding='utf-8')
            draft = '아이디,내용\nS1,계속\n'.encode()
            promote.reserve_deleted_tasks(stage, draft)
            tasks.write_bytes(draft)
            self.assertEqual(promote.task_ids(registry.read_bytes()), {'S2', 'Z-G1'})
            with self.assertRaisesRegex(ValueError, 'S2'):
                promote.reserve_deleted_tasks(stage, draft + b'S2,new\n')

    def fixture(self, temp):
        root=Path(temp);(root/'.admin').mkdir();(root/'shared').mkdir();(root/'data').mkdir()
        (root/'data/weekly.json').write_text('{"events":[]}')
        (root/'shared/admin-files.json').write_text('["data/weekly.json"]')
        (root/'.admin/transaction.json').write_text(json.dumps({'path':'data/weekly.json','baseSha':'original','fileSha':'draft','note':'test'}))
        return root
    def test_conflict_cannot_commit_or_push(self):
        calls=[]
        def run(*args,**kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args,0,stdout='newer\n' if args[:2]==('git','rev-parse') else '',stderr='')
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(promote,'ROOT',self.fixture(temp)),patch.object(promote,'run',run):
                with self.assertRaisesRegex(RuntimeError,'CONFLICT'):promote.main()
        self.assertFalse(any('commit' in c or 'push' in c for c in calls))
    def test_validation_failure_preserves_main(self):
        calls=[]
        def run(*args,**kwargs):
            calls.append(args)
            if 'tools/prepare_release.py' in args:raise subprocess.CalledProcessError(1,args)
            if args[:3]==('git','worktree','add'):
                stage=Path(args[4]);(stage/'data').mkdir(parents=True)
            output='original\n' if args[:2]==('git','rev-parse') and ':data/' in args[-1] else 'head\n'
            return subprocess.CompletedProcess(args,0,stdout=output,stderr='')
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(promote,'ROOT',self.fixture(temp)),patch.object(promote,'run',run):
                with self.assertRaises(subprocess.CalledProcessError):promote.main()
        self.assertFalse(any('push' in c or 'commit' in c for c in calls))
        self.assertTrue(any(c[:3]==('git','worktree','remove') for c in calls))
    def test_already_published_draft_can_retry_without_rewriting_main(self):
        calls=[]
        def run(*args,**kwargs):
            calls.append(args);output='draft\n' if ':data/' in args[-1] else 'head\n'
            return subprocess.CompletedProcess(args,0,stdout=output,stderr='')
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(promote,'ROOT',self.fixture(temp)),patch.object(promote,'run',run):promote.main()
        self.assertFalse(any('push' in c or 'commit' in c for c in calls))
if __name__=='__main__':unittest.main()
