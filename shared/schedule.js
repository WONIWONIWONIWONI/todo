/* Conservative, testable event matching. No DOM, global view state or external requests. */
(function (root) {
  'use strict';
  const grams = key => { const set = new Set(); for (let i=0; i<key.length-1; i++) set.add(key.slice(i,i+2)); if (!set.size && key) set.add(key); return set; };
  const dice = (a,b) => { const A=grams(a),B=grams(b); if (!A.size || !B.size) return 0; let n=0; for (const value of A) if (B.has(value)) n++; return 2*n/(A.size+B.size); };
  const minutes = time => root.RSData.isTime(time) ? +time.slice(0,2)*60 + +time.slice(3,5) : null;
  function createMatcher({ key, rawKey, fixes = [] }) {
    function score(x,y) {
      const manual = fixes.find(r => ['병합','분리'].includes(r['구분']) && ((r['대상아이디']===String(x.id) && r['상대아이디']===String(y.id)) || (r['대상아이디']===String(y.id) && r['상대아이디']===String(x.id))));
      if (manual) return manual['구분']==='분리' ? 0 : 10;
      if (x.date!==y.date) return 0;
      if (x.members?.length && y.members?.length && !x.members.some(m => y.members.includes(m))) return 0;
      const a=key(x.title), b=key(y.title); if (!a || !b) return 0;
      const tx=minutes(x.time),ty=minutes(y.time),gap=tx!==null && ty!==null ? Math.abs(tx-ty) : null;
      if (gap!==null && gap>60) return 0;
      const inside=a.includes(b) || b.includes(a),d=dice(a,b),rd=dice(rawKey(x.title),rawKey(y.title));
      const sameTime=gap===0 && rd>=0.7;
      if (!inside && !sameTime && d<0.82) return 0;
      if (inside && a!==b && Math.min(a.length,b.length)<6 && !sameTime) return 0;
      return (inside ? 1 : Math.max(d,sameTime ? 0.7 : 0)) + 0.1*rd + (gap!==null ? 0.05*(1-gap/180) : 0);
    }
    return { score };
  }
  root.RSSchedule = Object.freeze({ dice, minutes, createMatcher });
})(globalThis);
