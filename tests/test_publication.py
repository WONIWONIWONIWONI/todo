import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('promote',Path(__file__).resolve().parent.parent/'tools/promote_draft.py')
promote=importlib.util.module_from_spec(spec);spec.loader.exec_module(promote)

def task_csv(*rows):
    return ('아이디,내용\n' + ''.join(f'{key},{text}\n' for key, text in rows)).encode()

class MergeTests(unittest.TestCase):
    """원본이 바뀐 뒤에도 초안이 바꾼 줄만 얹는지 (다른 사람이 바꾼 줄은 그대로 두는지)."""
    def test_draft_lines_are_added_and_newer_lines_kept(self):
        base=task_csv(('S1','계속'))
        current=task_csv(('S1','계속'),('S2','새 줄'))
        draft=task_csv(('S1','계속'),('S3','내 줄'),('S4','내 줄2'))
        merged,touched=promote.merge_draft(current,base,draft,promote.TASK_FILE)
        self.assertEqual(merged.decode(),task_csv(('S1','계속'),('S2','새 줄'),('S3','내 줄'),('S4','내 줄2')).decode())
        self.assertEqual(touched,['S3','S4'])
    def test_same_line_changed_by_both_sides_stays_a_conflict(self):
        base=task_csv(('S1','계속'))
        current=task_csv(('S1','다른 사람'))
        draft=task_csv(('S1','내용'))
        merged,detail=promote.merge_draft(current,base,draft,promote.TASK_FILE)
        self.assertIsNone(merged)
        self.assertIn('S1',detail)
    def test_removed_line_is_removed_and_newer_lines_stay(self):
        base=task_csv(('S1','계속'),('S2','지울 줄'))
        current=task_csv(('S1','계속'),('S2','지울 줄'),('S3','새 줄'))
        draft=task_csv(('S1','계속'))
        merged,_=promote.merge_draft(current,base,draft,promote.TASK_FILE)
        self.assertEqual(merged.decode(),task_csv(('S1','계속'),('S3','새 줄')).decode())
    def test_column_change_is_not_merged(self):
        base=b'\xec\x95\x84\xec\x9d\xb4\xeb\x94\x94,\xeb\x82\xb4\xec\x9a\xa9\nS1,\xea\xb3\x84\xec\x86\x8d\n'
        current=base.replace(b',\xeb\x82\xb4\xec\x9a\xa9',b',\xeb\x82\xb4\xec\x9a\xa9,\xeb\xa9\x94\xeb\xaa\xa8')
        merged,detail=promote.merge_draft(current,base,base,promote.TASK_FILE)
        self.assertIsNone(merged)
        self.assertIn('\uc5f4',detail)
    def test_json_notices_merge_and_newer_timestamp_stays(self):
        base=json.dumps({'updated':'1','notices':[{'id':'n1','title':'A'}]},ensure_ascii=False,indent=1).encode()+b'\n'
        current=json.dumps({'updated':'2','notices':[{'id':'n1','title':'A'},{'id':'n2','title':'B'}]},ensure_ascii=False,indent=1).encode()+b'\n'
        draft=json.dumps({'updated':'3','notices':[{'id':'n1','title':'A'},{'id':'n3','title':'C'}]},ensure_ascii=False,indent=1).encode()+b'\n'
        merged,_=promote.merge_draft(current,base,draft,'data/notice.json')
        data=json.loads(merged)
        self.assertEqual(data['updated'],'2')
        self.assertEqual([item['id'] for item in data['notices']],['n1','n2','n3'])
    def test_json_item_changed_by_both_sides_stays_a_conflict(self):
        base=json.dumps({'notices':[{'id':'n1','title':'A'}]},ensure_ascii=False,indent=1).encode()+b'\n'
        current=json.dumps({'notices':[{'id':'n1','title':'B'}]},ensure_ascii=False,indent=1).encode()+b'\n'
        draft=json.dumps({'notices':[{'id':'n1','title':'C'}]},ensure_ascii=False,indent=1).encode()+b'\n'
        merged,detail=promote.merge_draft(current,base,draft,'data/notice.json')
        self.assertIsNone(merged)
        self.assertIn('n1',detail)

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

    @staticmethod
    def weekly(events):
        return json.dumps({'events':events},ensure_ascii=False,indent=1).encode()+b'\n'

    def test_conflict_cannot_commit_or_push(self):
        calls=[]
        base=self.weekly([{'id':'e1','title':'A'}]);current=self.weekly([{'id':'e1','title':'B'}]);draft=self.weekly([{'id':'e1','title':'C'}])
        def run(*args,**kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args,0,stdout='head\n' if args[:2]==('git','rev-parse') else '',stderr='')
        def git_bytes(*args,**kwargs):
            return base if args[0]=='cat-file' else current
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(promote,'ROOT',self.fixture(temp)),patch.object(promote,'run',run),patch.object(promote,'git_bytes',git_bytes):
                with self.assertRaisesRegex(RuntimeError,'CONFLICT'):promote.main()
        self.assertFalse(any('commit' in c or 'push' in c for c in calls))

    def test_draft_merge_publishes_only_the_draft_changes(self):
        calls=[];staged={}
        base=self.weekly([{'id':'e1','title':'A'}])
        current=self.weekly([{'id':'e1','title':'A'},{'id':'e2','title':'다른 사람'}])
        draft=self.weekly([{'id':'e1','title':'A'},{'id':'e3','title':'내 줄'}])
        def run(*args,**kwargs):
            calls.append(args)
            if args[:3]==('git','worktree','add'):
                stage=Path(args[4]);(stage/'data').mkdir(parents=True);(stage/'data/weekly.json').write_bytes(current)
                staged['root']=stage
            if 'commit' in args:
                staged['file']=(staged['root']/'data/weekly.json').read_bytes()
            return subprocess.CompletedProcess(args,0,stdout='head\n' if args[:2]==('git','rev-parse') else '',stderr='')
        def git_bytes(*args,**kwargs):
            return base if args[0]=='cat-file' else current
        with tempfile.TemporaryDirectory() as temp:
            root=self.fixture(temp);(root/'data/weekly.json').write_bytes(draft)
            with patch.object(promote,'ROOT',root),patch.object(promote,'run',run),patch.object(promote,'git_bytes',git_bytes):
                promote.main()
        self.assertTrue(any(c[0]=='git' and 'push' in c for c in calls))
        self.assertEqual(json.loads(staged['file'])['events'],[{'id':'e1','title':'A'},{'id':'e2','title':'다른 사람'},{'id':'e3','title':'내 줄'}])


    def test_unreadable_newer_data_stays_a_conflict(self):
        calls=[]
        def run(*args,**kwargs):
            calls.append(args)
            return subprocess.CompletedProcess(args,0,stdout='head\n' if args[:2]==('git','rev-parse') else '',stderr='')
        def git_bytes(*args,**kwargs):
            raise subprocess.CalledProcessError(1,args)
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(promote,'ROOT',self.fixture(temp)),patch.object(promote,'run',run),patch.object(promote,'git_bytes',git_bytes):
                with self.assertRaisesRegex(RuntimeError,'CONFLICT'):promote.main()
        self.assertFalse(any('push' in c or 'commit' in c for c in calls))
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
if __name__=='__main__':
    unittest.main()
