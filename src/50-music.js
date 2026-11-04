  // [src/50-music.js] 음악방송 탭: 투표 앱·음방 정보·주간 음방 달력·투표 방법
  // ---------- 음악방송: 시간표 + 투표 방법 (2026-11-02 조사) ----------
  // 바뀌면 여기만 고치면 돼요. day: 0=일 1=월 … 6=토, end는 대략 끝나는 시각
  // 출처: 쇼케이팝 공식 사이트(showkpop.com), 빅크 '더쇼' 회차 기사(스타데일리뉴스·스포츠경향), 아티스트 공식 X 투표 안내
  //       (MONSTA X·i-dle·NMIXX·ILLIT·NCT WISH·Kep1er·CORTIS·Hearts2Hearts), 쿠궁 공식 X(팬캐스트→쿠궁 이름 변경),
  //       MBC 음악중심 문자투표 안내, weknews 음방 투표 정리(2026.7), 나무위키 음악중심·뮤직뱅크 차트
  // 앱 열기 (휴대폰): 각 앱이 등록해 둔 링크(open)를 써서 앱이 있으면 바로 켜져요.
  //   안드로이드: intent로 그 앱을 직접 열고, 없으면 구글 플레이
  //   아이폰: 링크를 그대로 눌러 유니버설 링크로 열기. 앱이 없으면 앱스토어(빅크·LiNC·Mnet Plus·아이돌챔프·쿠궁) 또는 앱 홈페이지(뮤빗·뮤니버스·하이어)
  //   open 주소는 각 도메인의 apple-app-site-association · assetlinks.json으로 확인 (2026-11-02)
  const APPS = {
    // scheme: 앱을 바로 여는 주소 형식 (각 앱 공식 웹페이지 코드에서 확인, 2026-11-02)
    // iosScheme: 아이폰에서만 쓰는 주소. open: 안드로이드 앱 링크(https). ul: 아이폰 사파리에서도 그 링크로 앱이 열림
    // 아이돌챔프는 앱 주소가 없어서 앱 링크만: 홈 화면 웹앱에서는 새 창(사파리)으로 넘겨서 열어요
    mubeat: { name: '뮤빗', and: 'com.vlending.apps.mubeat', ios: '1320789688', iosScheme: 'mubeat://', open: 'https://mubeat.tv/?app-link-url=home', web: 'https://mubeat.tv' },
    bigc: { name: '빅크', and: 'im.bigc.lively', ios: '1575835045', scheme: 'bigc://', web: 'https://www.bigc.im' },
    idolchamp: { name: '아이돌챔프', and: 'com.nwz.ichampclient', ios: '1185735018', open: 'https://app.idolchamp.com/open/navi/vote', ul: true, web: 'https://www.idolchamp.co.kr' },
    mnetplus: { name: 'Mnet Plus', and: 'world.mnetplus', ios: '6443405421', scheme: 'mnetplus://', web: 'https://www.mnetplus.world' },
    coogoong: { name: '쿠궁', and: 'com.contentsmadang.fancast', ios: '1641638840', scheme: 'fancast://main?tabname=vote', web: 'https://coogoong.com' },
    linc: { name: 'LiNC', and: 'io.stayge.youmeonapp', ios: '6467824343', scheme: 'lincapp://', web: 'https://www.linc.fan' },
    higher: { name: '하이어', and: 'com.dalcomsoft.mysu.a', ios: '1672001935', scheme: 'higherfan://' },
    muniverse: { name: '뮤니버스', and: 'com.tnk.muniverse', ios: '6749677921', scheme: 'muniverse://', web: 'https://www.muniverse.io/votes' },
  };
  const PHONE = (() => {
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    return '';
  })();
  const STANDALONE = (() => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } })();
  const playUrl = (a) => `https://play.google.com/store/apps/details?id=${a.and}`;
  const iosUrl = (a) => `https://apps.apple.com/kr/app/id${a.ios}`;
  // 버튼 주소(누르면 openApp이 대신 처리). 컴퓨터는 웹(없으면 구글 플레이)
  const appHref = (k) => {
    const a = APPS[k];
    if (!a) return '';
    if (PHONE === 'ios') return a.ul ? a.open : iosUrl(a);
    if (PHONE === 'android') return a.open || playUrl(a);
    return a.web || playUrl(a);
  };
  // 새 창으로 열면 아이폰이 앱을 안 켜는 경우가 있어서 휴대폰은 같은 창
  // 아이돌챔프(앱 주소 없음)는 홈 화면 웹앱에서 새 창 → 사파리에서 앱 링크로 열리게
  const appTarget = (k) => (PHONE && !(PHONE === 'ios' && STANDALONE && APPS[k] && APPS[k].ul) ? '' : ' target="_blank"');
  // 휴대폰에서 투표 앱 열기. 홈 화면 웹앱 · 카톡 · X 안에서도 되도록 scheme으로 직접 열어요.
  // 안드로이드: 앱이 없으면 플레이 스토어. 아이폰: 앱이 안 열리면 앱스토어.
  // link: 공유 링크에서 뽑은 주소 { sc: 앱 주소, https: 앱 링크 }
  function openApp(k, link) {
    const a = APPS[k];
    if (!a || !PHONE) return false;
    if (PHONE === 'android') {
      const fb = `S.browser_fallback_url=${encodeURIComponent(playUrl(a))}`;
      const asc = link ? link.sc : a.scheme;
      const web = link ? link.https : a.open;
      if (asc) {
        const [sc, rest] = asc.split('://');
        location.href = `intent://${rest}#Intent;scheme=${sc};package=${a.and};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;${fb};end`;
      } else if (web) {
        location.href = `intent://${web.replace(/^https:\/\//, '')}#Intent;scheme=https;package=${a.and};${fb};end`;
      } else {
        location.href = playUrl(a); // 설치돼 있으면 스토어에 '열기' 버튼
      }
      return true;
    }
    const store = `itms-apps://apps.apple.com/app/id${a.ios}`;
    const sc = link ? link.sc : a.scheme || a.iosScheme;
    if (!sc) {
      if (link || a.ul) return false; // 링크 그대로: 앱이 열리거나, 없으면 그 페이지가 앱스토어로
      location.href = store; // 앱스토어 (설치돼 있으면 '열기' 버튼)
      return true;
    }
    let left = false;
    let blurred = false;
    const done = () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
    const onHide = () => { if (document.hidden) left = true; };
    const onLeave = () => { left = true; };
    const onBlur = () => { blurred = true; };
    // '앱에서 열까요?' 창이나 '주소가 잘못됨' 창이 떴다가 닫힌 경우: 앱이 안 열렸으면 앱스토어
    const onFocus = () => { if (!blurred) return; done(); if (!left) location.href = store; };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    const timer = setTimeout(() => {
      if (blurred && !left) { setTimeout(done, 15000); return; } // 창이 떠 있음: 닫힐 때 onFocus가 처리
      done();
      if (!left && !document.hidden) location.href = store;
    }, 2500);
    location.href = sc;
    return true;
  }
  // 공지에 붙는 앱 공유 링크 → 앱 주소 (각 링크 페이지가 앱을 여는 방법 그대로)
  function shareDeep(href) {
    let u;
    try { u = new URL(href); } catch (e) { return null; }
    if (u.hostname === 'mubeat.applink.info' && u.pathname.length > 1) return { k: 'mubeat', sc: `mubeat://applink.info${u.pathname}` };
    if (u.hostname === 'higher.fan' && /^\/app\/./.test(u.pathname)) return { k: 'higher', sc: `higherfan://${u.pathname.slice(5)}` };
    if (u.hostname === 'promo-web.idolchamp.com') {
      const d = u.searchParams.get('deeplink');
      if (d && /^https:\/\/app\.idolchamp\.com\//.test(d)) return { k: 'idolchamp', https: d };
    }
    return null;
  }
  const MUSIC_SHOWS = [
    { id: 'showkpop', span: '목~토', day: 1, name: '쇼케이팝', sub: 'SHOW K-POP', time: '18:00', end: '19:10', ch: 'Arirang TV',
      re: /쇼케이팝|show\s*k-?pop|monshow/i,
      chart: '글로벌 음원 45 · 앨범 10 · SNS 10 · 방송 5 · 사전투표 15 (%)로 1위 후보 2팀 → 두 팀만 생방송 투표 15%를 더해 최종 1위',
      parts: [
        ['글로벌 음원 45%', '써클차트 글로벌 K-POP 데이터 · 방송 전전주 일 ~ 토 (예: 10/19 방송 → 10/4 ~ 10/10)'],
        ['글로벌 앨범 10%', '써클차트 · 방송 전전주 일 ~ 토'],
        ['SNS 10%', '써클차트 소셜차트(동영상 조회수) · 방송 전전주 일 ~ 토'],
        ['방송 점수 5%', '10/30 공지로 10% → 5%'],
        ['사전투표 15%', '뮤빗 · 방송 전주 목 12:00 ~ 전주 토 12:00'],
        ['생방송 투표 15%', '뮤빗 · 생방송 중에만, 1위 후보 2팀만 · 1인 최대 50표'],
      ],
      partsSrc: '쇼케이팝 공식 공지 (2026-10-30 비율 변경 반영)',
      pre: { cost: '하트비트로 투표', appKey: 'mubeat', app: '뮤빗(Mubeat)', where: '뮤빗 → 투표 → SHOW K-POP 탭', when: '방송 전주 목 12:00 ~ 토 12:00',
        steps: ['뮤빗 앱 아래 가운데 투표 버튼', 'SHOW K-POP 탭 → 사전투표 부문', '리센느 투표 버튼'],
        ticket: '하트비트: 광고 · 미션 · 퀴즈로 무료로 모아요', limit: '가진 하트비트만큼 (앱 화면에서 확인)', weight: '15%' },
      live: { cost: '1인 최대 50표', appKey: 'mubeat', app: '뮤빗(Mubeat)', where: '뮤빗 → 투표 → SHOW K-POP → 생방송 투표', when: '생방송 중에만 (18:00 ~ 19:10) · 결방이면 없음',
        steps: ['뮤빗 → 투표 → SHOW K-POP 탭', '생방송 투표', '리센느 투표'],
        limit: '1인 최대 50표', qty: '50표', weight: '15% · 1위 후보 2팀만' },
      tip: '정식 데뷔 가수 음원만 집계하고 드라마 · 웹툰 OST와 오디션 프로그램 음원은 빠져요. 통산 3주 1위면 명예의 전당에 올라 차트에서 빠져요. 투표 화면 오른쪽 위 인증서 아이콘으로 투표 인증서를 저장 · 공유할 수 있어요.',
      after: '쇼스테이지: 방송이 끝나면 바로 그날 출연진 전체를 대상으로 100% 투표 (뮤빗) → 1위는 시상과 SHOW STAGE 명예의 전당',
      links: [['쇼케이팝 공식', 'https://showkpop.com']] },
    { id: 'theshow', span: '금~월', day: 2, name: '더쇼', sub: 'THE SHOW', time: '18:00', end: '19:00', ch: 'SBS LIFE',
      re: /더\s*쇼(?!케)|the\s*show\b/i,
      chart: '사전 집계(음원 40 · 음반 20 · 팬 인게이지먼트 20 · 사전투표 20 %)로 1위 후보 3팀 → 생방송 투표 20%를 더해서 더쇼 초이스 · 그날 출연한 가수만',
      parts: [
        ['음원 40%', '애플뮤직 글로벌 스트리밍 · 방송 전전주 금 ~ 전주 목 (미국 PT 기준)'],
        ['음반 20%', '한터차트 · 방송 전전주 토 ~ 전주 금'],
        ['팬 인게이지먼트 20%', '써클차트 · K-POP RADAR: 공식 유튜브 · 틱톡 조회수 · 좋아요 · 댓글 수 · 방송 전전주 토 ~ 전주 금'],
        ['사전투표 20%', '빅크 · 방송 전주 금 17:00 ~ 방송 주 월 10:00'],
        ['생방송 투표 20%', '빅크 · 방송 당일 18:05 ~ 19:00 (사전 집계 점수에 더해요)'],
      ],
      partsSrc: '더쇼 공식 X 공지',
      pre: { cost: 'Free Gem 400 또는 Royal Gem 20 = 1표 · 무제한', appKey: 'bigc', app: '빅크(BIGC)', where: '빅크 → 빅크 초이스 → 1위 후보 사전투표', when: '방송 전주 금 17:00 ~ 월 10:00 (예: 402회 10/30 17:00 ~ 11/2 10:00)',
        steps: ['빅크 앱 로그인', '빅크 초이스(BIGC CHOICE) → 생방송 1위 후보 부문', '리센느 투표 (그 주 출연 라인업 중 3팀이 1위 후보가 돼요)'],
        ticket: 'Free Gem 400개 또는 Royal Gem 20개 = 1표 (Free Gem은 출석 · 광고 · 미션으로 무료)', limit: '무제한 (가진 만큼)', weight: '사전 집계의 20%' },
      live: { cost: 'Free Gem 4,000 또는 Royal Gem 200 = 1표 · 무제한', appKey: 'bigc', app: '빅크(BIGC)', where: '빅크 → 실시간 투표 배너', when: '방송 당일 화 18:05 ~ 19:00', window: '18:05 ~ 19:00',
        steps: ['빅크 앱 홈 실시간 투표 배너', '리센느 투표'],
        ticket: 'Free Gem 4,000개 또는 Royal Gem 200개 = 1표 (사전투표의 10배)', limit: '무제한 (가진 만큼)', weight: '20% (사전 집계 점수에 더해요)' },
      tip: '방송 당일 출연한 가수만 집계하고, 결방이나 하이라이트 방송이면 집계하지 않아요. 3주 1위 곡은 트리플 크라운으로 다음 주부터 차트에서 빠져요. 음원 점수는 애플뮤직 글로벌 스트리밍, 팬 점수는 리센느 공식 유튜브 · 틱톡의 조회수 · 좋아요 · 댓글이에요. 사전투표 때 팬픽캠(직캠 주인공 멤버) 투표도 같이 열리고, 생방송 · 다시보기는 빅크 온(BIGC ON)에서 볼 수 있어요.',
      after: '방송 뒤 애프터 투표: 엔딩요정 · 핫스테이지 · 팬픽캠 주인공 (빅크)',
      links: [['SBS 더쇼 공식', 'https://programs.sbs.co.kr/fune/theshow/about/58354']] },
    { id: 'showchamp', span: '금~월', day: 3, name: '쇼챔피언', sub: 'SHOW CHAMPION', time: '17:00', end: '18:20', ch: 'MBC M',
      re: /쇼\s*챔피언|쇼챔|show\s*champion/i,
      chart: '음원 35 · 방송 20 · 사전투표 20 · 음반 15 · SNS 10 (%) · 실시간 투표 없음',
      parts: [
        ['음원 35%', '멜론 · 지니 · FLO · 벅스 주간 순위 합산 · 방송 전주 월 ~ 일'],
        ['방송 20%', '쇼챔피언 출연팀 기준 · 방송 당일 (MBC PLUS 방송 · 주간 아이돌 출연도 반영된다고 알려져 있어요)'],
        ['사전투표 20%', '아이돌챔프 글로벌 팬 투표 · 방송 전주 금 20:00 ~ 방송 주 월 14:59'],
        ['음반 15%', '한터 앨범 차트 · 방송 전주 월 ~ 일'],
        ['SNS 10%', '써클차트 · 유튜브 뮤직비디오 반영 · 방송 전주 월 ~ 일'],
      ],
      partsSrc: '쇼챔피언 공식 차트 산정 방식 안내',
      pre: { cost: '챔심 · 투표마다 필요 수량 달라요', appKey: 'idolchamp', app: '아이돌챔프(IDOLCHAMP)', where: '아이돌챔프 → Vote → SHOW CHAMPION 챔피언송', when: '방송 전주 금 20:00 ~ 월 14:59',
        steps: ['아이돌챔프 앱 로그인 → 아래 Vote', 'SHOW CHAMPION 챔피언송 사전투표 배너', '리센느 곡 → 투표하기 → 챔심을 투표권으로 최대 교환 → 최대 투표'],
        ticket: '챔심 (투표마다 필요한 수가 다를 수 있어요). 루비챔심은 사라지지 않고, 타임챔심은 매달 1일에 사라져요',
        earn: ['출석: 1회 30타임챔심 + 출석 뒤 광고를 보면 10루비챔심', '룰렛(광고): 루비챔심 랜덤 · 하루 최대 10회', '퀴즈: 1회 30타임챔심 (최근 퀴즈 10개까지) · 5일 연속 100점이면 50루비챔심', '출석과 룰렛만 꾸준히 해도 안 사라지는 루비챔심이 쌓여요'],
        limit: '하루 최대 300 챔심까지 투표 (300/300) · 매일 다시 채워져요', qty: '하루 300', weight: '20% (실시간 투표가 없어서 팬 투표는 이게 전부)' },
      live: null,
      tip: '마감(월 14:59) 직전까지 표 차이가 벌어져요. 남은 챔심은 마감 전에 꼭 다 써 주세요. 후보는 정식 발매곡 · 팀당 1곡이고, 선공개곡 · 리메이크 · OST · 방송 프로그램 곡 등은 빠져요. 통산 3주 1위(트리플 챔피언) 곡도 빠지고, 방송 뒤 홈페이지에 TOP5 점수가 공개돼요.',
      },
    { id: 'mcountdown', span: '토~화', day: 4, name: '엠카운트다운', sub: 'M COUNTDOWN', time: '18:00', end: '19:30', ch: 'Mnet',
      // 결방: from ~ until (until 비우면 다시 시작 날짜 미정). 날짜가 지나면 저절로 원래대로 보여요
      off: { from: '2026-10-23', until: '', title: '2026년 남은 방송은 쉬어요', note: '10월 22일 950회가 올해 마지막 방송이었어요. 다시 시작하는 날은 아직 안 나왔어요.', src: 'https://www.ggilbo.com/news/articleView.html?idxno=1188358' },
      re: /엠\s*카운트다운|엠카|m\s*countdown/i,
      chart: '음원 50 · 음반 15 · 글로벌 소셜 미디어 15 · 글로벌 팬 투표 10 · 엠넷 방송 10 (%)로 1위 후보 2팀 → 생방송 투표 10%를 더해 1위',
      parts: [
        ['음원 50%', '써클차트: Apple Music · Spotify · 멜론 · 벅스 · VIBE · 지니 · FLO · YouTube · 텐센트 뮤직 등'],
        ['음반 15%', '써클 앨범 차트 주간 판매량'],
        ['글로벌 소셜 미디어 15%', '유튜브 공식 MV · 숏폼 영상 · TikTok'],
        ['글로벌 팬 투표 10%', 'Mnet Plus 사전투표'],
        ['엠넷 방송 10%', 'Mnet 채널 방송 점수 (프로그램 속 MV 노출 · 출연 등)'],
        ['생방송 투표 10%', 'Mnet Plus · 1위 후보 2팀만'],
      ],
      partsSrc: 'Mnet 엠카운트다운 공식 차트 산정 비중 · 자료 제공: 써클차트, TikTok',
      pre: { cost: '무료 · 하루 5표', appKey: 'mnetplus', app: 'Mnet Plus', where: 'Mnet Plus → 투표 → 엠카운트다운 사전투표', when: '방송 전주 토 00:00 ~ 화 23:59 (월 11:00에 중간 집계 공개)',
        steps: ['Mnet Plus 앱(또는 웹) 로그인', '투표 → 엠카운트다운 사전투표', '리센느 곡 투표'],
        ticket: '무료 (따로 모을 재화가 없어요)', limit: '하루 최대 5표 · 여러 팀 · 같은 팀 다시 투표 가능', qty: '하루 5표', weight: '10%' },
      live: { cost: '무료 · 최대 5표', appKey: 'mnetplus', app: 'Mnet Plus', where: 'Mnet Plus 홈 → MCOUNTDOWN → 실시간 투표', when: '1위 후보 발표 뒤 ~ 실시간 투표 끝날 때까지',
        steps: ['Mnet Plus 홈 "엠카운트다운 실시간 투표" 배너 (또는 MCOUNTDOWN 메뉴)', '실시간 투표', '리센느 투표'],
        ticket: '무료', limit: '최대 5표', qty: '5표', weight: '10% · 1위 후보 2팀만' },
      tip: '방송일 기준 최근 4주 안에 발매된 곡만 차트에 들어가요. 그해 트리플 크라운(3주 1위)을 한 곡은 집계에서 빠져요. 결방이면 순위를 집계하지 않지만 특집 방송을 하면 정상 집계해요. 출연하지 않아도 1위를 할 수 있어요.' },
    { id: 'musicbank', span: '일~수', day: 5, name: '뮤직뱅크', sub: 'MUSIC BANK', time: '17:05', end: '18:35', ch: 'KBS2',
      re: /뮤직\s*뱅크|뮤뱅|music\s*bank/i,
      chart: '디지털 음원 60 · 방송 횟수 20 · 글로벌 팬 투표 10 · 음반 5 · 소셜 미디어 5 (%) · 20만 점 만점',
      parts: [
        ['디지털 음원 60%', '멜론 · 지니 · FLO · VIBE · 벅스 1~100위 곡별 점유율 (12만 점)'],
        ['방송 횟수 20%', 'KBS TV(뉴스 제외) · KBS 유튜브 디지털 콘텐츠 출연 · KBS 2FM 7개 프로그램 라디오 (4만 점)'],
        ['글로벌 팬 투표 10%', '쿠궁(옛 팬캐스트) 사전투표 · 일 15:00 ~ 수 11:00, 그 주 금요일 방송에 바로 반영 (2만 점)'],
        ['음반 5%', '써클차트 앨범차트 (1만 점). 다른 음방은 1위를 만점으로 두고 판매량 비율로 점수를 주지만, 뮤뱅은 1만 점을 판매량 비율로 나눠 가져요 · 예) 50만 · 30만 · 10만 장이면 다른 음방(1,000점 만점) 1,000 · 600 · 200점, 뮤뱅 5,555 · 3,333 · 1,111점'],
        ['소셜 미디어 5%', '써클차트 소셜차트 2.0: 유튜브 뮤직비디오 조회수 · 틱톡 좋아요 지수 (1만 점)'],
      ],
      pre: { cost: '블루하트 · 골드하트 50 = 1표 · 무제한', appKey: 'coogoong', app: '쿠궁(옛 팬캐스트)', where: '쿠궁 → 투표 → 뮤직뱅크 사전투표', when: '매주 일 15:00 ~ 수 11:00 (회차별 마감 시각은 앱 공지 확인)',
        steps: ['쿠궁 앱 로그인 (팬캐스트 계정 그대로 써요)', '투표 → 뮤직뱅크 사전투표', '리센느 → 하트로 투표'],
        ticket: '블루하트 또는 골드하트 50개 = 1표 (출석 · 광고 · 미션으로 모아요)', limit: '무제한 (가진 하트만큼)', weight: '10% (그 주 금요일 K-차트에 반영)' },
      live: null,
      tip: '컴백 첫 주에는 그 주 출연 가수 곡이 모두 사전투표 후보로 올라오지만, 음원 · 음반 점수가 없어 1위 후보는 될 수 없어요 (그래서 음총팀이 첫 주 투표를 쉬자고 공지할 수 있어요). 쿠궁은 팬캐스트가 2026년 7월에 바꾼 새 이름이에요 (같은 앱, 같은 계정). 방송 횟수에는 KBS TV와 함께 KBS 유튜브 콘텐츠 · KBS 2FM 라디오 출연도 들어가요.',
      links: [['KBS 뮤직뱅크 공식', 'https://program.kbs.co.kr/2tv/enter/musicbank/pc/']] },
    { id: 'musiccore', span: '화~목', day: 6, name: '쇼! 음악중심', sub: 'MUSIC CORE', time: '15:20', end: '16:40', ch: 'MBC',
      re: /음악\s*중심|음중|music\s*core/i,
      chart: '사전 점수(음원 50 · 음반 10 · 동영상 10 · 방송 횟수 5 · 시청자위원회 5 · 글로벌 투표 10 %)로 1위 후보 3팀 → 생방송 앱 투표 6 · 문자 투표 4 (%)를 더해 1위',
      parts: [
        ['음원 50%', '써클 디지털 차트 (다운로드 영향이 커요)'],
        ['음반 10%', '음반 점수'],
        ['동영상 10%', '뮤직비디오 등 영상 점수 (15세 등급에 안 맞는 MV는 빠져요)'],
        ['방송 횟수 5%', '방송 횟수 점수'],
        ['시청자위원회 5%', '시청자위원회 투표'],
        ['글로벌 투표 10%', '사전투표: 뮤빗 5 + 뮤니버스 5'],
        ['생방송 앱 투표 6%', '1위 후보 3팀만 · 뮤빗 · 뮤니버스'],
        ['생방송 문자 투표 4%', '1위 후보 3팀만 · #0505'],
      ],
      partsSrc: '2026년 5월 30일 방송부터',
      pre: { cost: '뮤빗 하트비트 3 · 뮤니버스 애드루미 5 = 1표 · 무제한', appKey: 'mubeat', appKeys: ['mubeat', 'muniverse'], app: '뮤빗 · 뮤니버스', short: '뮤빗·뮤니버스', where: '뮤빗 또는 뮤니버스 → 투표 → 쇼! 음악중심 글로벌 사전투표', when: '방송 주 화 18:00 ~ 목 11:00 (예: 968회 10/27 18:00 ~ 10/29 11:00)',
        steps: ['뮤빗 → 투표 → 쇼! 음악중심 글로벌 사전투표 → 리센느', '뮤니버스 → Vote → 쇼! 음악중심 글로벌 사전투표 → 리센느'],
        ticket: '뮤빗 하트비트 3개 = 1표 · 뮤니버스 애드루미 5개 = 1표 (광고 · 미션 · 출석으로 무료)', limit: '무제한 (가진 만큼)', weight: '10% (뮤빗 5% + 뮤니버스 5%, 따로 계산돼서 두 앱 다 해야 해요)' },
      live: { cost: '뮤빗 투표권 1 (하트비트 30) · 뮤니버스 애드루미 50 또는 골드루미 60 = 1표 · 각 최대 5표', appKey: 'mubeat', appKeys: ['mubeat', 'muniverse'], app: '뮤빗 · 뮤니버스 · 문자', short: '앱 2개 · 문자', where: '뮤빗 · 뮤니버스 → 쇼! 음악중심 생방송 앱 투표 / 문자 #0505', when: '1위 후보 발표 뒤 ~ 약 16:10 (앱) · 약 15:35 ~ 16:20 (문자) · 회차마다 공지',
        steps: ['뮤빗 → 투표 → 쇼! 음악중심 → 생방송 앱 투표 → 리센느', '뮤니버스 → Vote → 쇼! 음악중심 생방송 앱 투표 → 리센느', '문자: #0505로 "리센느" 또는 후보 번호를 한 번만'],
        ticket: '뮤빗: 투표권 1장 = 1표 (하트비트 30개 = 투표권 1장, 방송 전에 미리 바꿔 두세요) · 뮤니버스: 애드루미 50개 또는 골드루미 60개 = 1표',
        limit: '뮤빗 · 뮤니버스 각각 최대 5표 · 문자는 번호당 1건 100원, 두 번 보내면 무효', qty: '앱 2개 + 문자', weight: '앱 6 : 문자 4' },
      tip: '방송일 기준 최근 9주 안에 발매된 정식 데뷔 가수의 곡 1곡만 들어가요. OST · 오디션 프로그램 곡 · MBC 심의 부적격 곡은 빠지고, 결방이나 녹화 방송이면 집계하지 않아요. 통산 3주 1위(트리플크라운)면 레전드 M-Chart로 명예 졸업해요. 리센느 공식 투표 안내에도 뮤빗과 뮤니버스가 함께 나와요. 뮤니버스에서는 매주 레전드 무대를 뽑는 STAGE M PICK 투표도 열려요.',
      sms: { to: '#0505', body: '리센느' },
      links: [['MBC 음악중심 공식', 'https://www.imbc.com/broad/tv/ent/musiccore/']] },
    { id: 'inkigayo', span: '월~금', day: 0, name: '인기가요', sub: 'INKIGAYO', time: '15:10', end: '16:40', ch: 'SBS',
      re: /인기가요|inkigayo/i,
      chart: '온라인 음원 50 · SNS 20 · 음반 10 · On-Air 10 · 시청자 사전투표 5 · 실시간 앱 투표 5 (%) · 부문별 1위 곡 만점 기준 차등 점유율',
      parts: [
        ['온라인 음원 50%', '멜론 · 지니 · FLO · Spotify · 150위까지 반영'],
        ['SNS 20%', '뮤직비디오 유튜브 조회수'],
        ['음반 10%', '써클 앨범 차트'],
        ['On-Air 10%', 'SBS TV · 라디오 방송 횟수'],
        ['시청자 사전투표 5%', 'LiNC 앱 · 방송 9일 전 월 12:00 ~ 금 23:59'],
        ['실시간 앱 투표 5%', '하이어 · 생방송 중'],
      ],
      partsSrc: '2024년 10월 6일 방송부터 · 집계 기간: 방송 전주 월 ~ 방송 주 월',
      pre: { cost: '팬포인트 30 또는 GEM 8 = 1표 · 하루 10표', appKey: 'linc', app: 'LiNC(링크)', where: 'LiNC → 투표 → 인기가요 사전투표', when: '방송 9일 전 월 12:00 ~ 금 23:59 · 그다음 주 일요일 방송에 반영 (예: 10/12 ~ 10/16 → 10/25 방송)',
        steps: ['LiNC 앱 홈 "투표하기(Vote Now)"', '인기가요 사전투표', '리센느 → 팬포인트(또는 GEM)로 투표'],
        ticket: '팬포인트 30개 또는 GEM 8개 = 1표 (팬포인트는 광고를 보면 무료로 쌓여요)', limit: '하루 최대 10표', qty: '하루 10표', weight: '5%' },
      live: { cost: '루비 50 = 1표 · 최대 5표', appKey: 'higher', app: '하이어(HIGHER)', where: '하이어 → 홈 실시간 투표 배너', when: '생방송 중 ~ 방송 끝날 때까지',
        steps: ['하이어 앱 홈 실시간 투표 배너 (또는 아래 투표 아이콘)', '리센느 투표'],
        ticket: '루비 50개 = 1표 (루비는 광고를 보면 무료)', limit: '계정당 최대 5표', qty: '5표', weight: '5%' },
      tip: '음원 · SNS 비중이 가장 큰 음방이라 리센느 MV 유튜브 조회수가 특히 중요해요. 하이어에서 영상을 보면 써클 앨범 차트에도 반영돼요. 통산 3번 1위면 트리플 크라운으로 명예 졸업하고, 결방 · 녹화 방송이면 집계하지 않아요. OST는 집계하지 않아요.',
      after: '핫스테이지: 실시간 투표가 끝난 직후 ~ 수요일, 그날 출연 무대 중 최고의 무대 투표 (슈퍼스타 X) → 다음 주 방송에서 1~3위 발표',
      links: [['SBS 인기가요 공식', 'https://programs.sbs.co.kr/enter/gayo/main']] },
  ];
  // --- 편성표: 방송사 공식 편성표에서 3시간마다 받아 둔 날짜별 방송 시간 (data/onair.json, tools/crawl_onair.py) ---
  state.onair = null;
  function onairLoad() {
    if (state.onair) return;
    state.onair = { air: {}, loading: true };
    fetch(BASE + 'data/onair.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((d) => { state.onair = { updated: d.updated || '', air: d.air || {} }; })
      .catch(() => { state.onair = { air: {}, error: 'fail' }; })
      .finally(() => (route().tab === 'music' ? render({ keepScroll: true }) : schRefresh()));
  }
  // 그날 방송: 편성표에 있으면 그 시간, 아직 없으면 평소 시간. moved = 평소보다 5분 넘게 당기거나 늦춤, off = 편성표에 그날 방송이 없음
  function airOf(m, date) {
    onairLoad();
    const a = ((state.onair.air || {})[m.id] || {})[date];
    if (!a || !a.start) return { time: m.time, end: m.end, off: !!(a && a.off) };
    return { time: a.start, end: a.end || m.end, moved: Math.abs(hmMin(a.start) - hmMin(m.time)) >= 5 };
  }
  // 오늘부터 가장 가까운 그 음방 방송일
  const nextAir = (m, t) => addDays(t, (m.day - dowOf(t) + 7) % 7);
  // 그 날 결방이면 결방 정보: 직접 적은 결방(MUSIC_SHOWS의 off) → 편성표에 그날 방송이 없을 때
  function offOn(m, date) {
    if (!m) return null;
    if (m.off && date >= m.off.from && (!m.off.until || date <= m.off.until)) return m.off;
    return airOf(m, date).off ? { title: `${mdw(date)} 방송은 결방이에요`, note: `${m.ch} 공식 편성표에 이날 방송이 없어요.`, short: `${md(date)} 결방`, auto: true } : null;
  }
  const offShort = (o) => o.short || (o.until ? `${+o.until.slice(5, 7)}월 ${+o.until.slice(8, 10)}일까지 결방` : '결방 · 다시 시작 미정');
  // 편성표가 평소와 다를 때 한 줄 (같으면 '')
  function airNote(m, date) {
    const a = airOf(m, date);
    return a.off ? `${m.ch} 편성표에 이날 방송이 없어요 (결방)` : a.moved ? `${m.ch} 편성표: ${a.time} 방송 · 평소 ${m.time}` : '';
  }
  // 음방.csv 는 짧은 이름(음악중심)을 써요
  const showById = (id) => MUSIC_SHOWS.find((m) => m.id === id || m.name === id || m.name.replace(/^쇼!\s*/, '') === id);
  // 공식 일정(Mnet Plus · blip) 제목으로 어떤 음방인지 (같은 요일일 때만, 페스티벌·시상식은 빼고)
  function showOfEvent(e) {
    if (!e || !e.title || /페스티벌|festival|어워즈|awards?|콘서트|concert|in\s+japan/i.test(e.title)) return null;
    return MUSIC_SHOWS.find((m) => m.re.test(e.title) && dowOf(e.date) === m.day) || null;
  }
  // 리센느 음방 출연 (확정): 음방.csv의 출연·1위후보 + 공식 일정에 올라온 음방
  function musicAppearances() {
    const out = new Map();
    (state.data.music || []).filter((r) => r.kind !== 'pre' && r.date).forEach((r) => {
      const m = showById(r.show);
      if (!m) return;
      const k = m.id + r.date;
      const cur = out.get(k) || { show: m, date: r.date, manual: true };
      out.set(k, { ...cur, top: cur.top || r.kind === 'top', vote: cur.vote || r.kind === 'vote', memo: r.memo || cur.memo, src: r.src || cur.src });
    });
    const official = [];
    Object.keys(state.sch || {}).forEach((ym) => schOf(ym).forEach((e) => official.push(e)));
    ((state.blip && state.blip.events) || []).forEach((e) => official.push(e));
    weeklyNew().forEach((e) => official.push(e)); // 주간 일정표에 올라온 음방도
    official.forEach((e) => {
      const m = showOfEvent(e);
      if (!m) return;
      const k = m.id + e.date;
      if (out.has(k)) out.get(k).official = true;
      else out.set(k, { show: m, date: e.date, official: true });
    });
    return [...out.values()].sort((x, y) => x.date.localeCompare(y.date));
  }
  // 리센느가 들어간 사전투표 (음방.csv)
  const musicPrevotes = () => (state.data.music || []).filter((r) => r.kind === 'pre' && r.end && showById(r.show)).map((r) => ({ ...r, show: showById(r.show) }));
  // 오늘 할 일로: 음총팀이 하라고 한 실시간 투표(그날) + 사전투표(기간 동안)
  function musicTodos(d) {
    const out = [];
    const base = { ally: null, kind: 'self', days: [], tbd: false, tags: [], proof: '', proofLinks: [], deadline: '' };
    musicAppearances().filter((a) => a.date === d && a.vote && a.show.live).forEach((a) => {
      const m = a.show;
      const air = airOf(m, d);
      // 방송 시간이 바뀐 날은 정해 둔 투표 시간 대신 실제 방송 시간
      const win = air.moved ? `${air.time} ~ ${air.end} (방송 시간 변경)` : m.live.window || `${air.time} ~ ${air.end}`;
      out.push({ ...base, id: `mv-${m.id}-${d}`, camp: '음방 실시간 투표', title: `${m.name} ${a.top ? '1위 후보 ' : ''}실시간 투표`, qty: m.live.qty || '',
        platform: m.live.app, window: win, repeat: '1회', start: d, end: d, link: appHref(m.live.appKey), appKey: m.live.appKey, sms: m.sms || null,
        memo: [airNote(m, d) && `${airNote(m, d)}. 투표 시간도 달라질 수 있어요.`, `${m.live.where}`, `${m.live.when} · ${m.live.limit}`, a.memo].filter(Boolean).join('\n'), music: m });
    });
    musicPrevotes().forEach((r) => {
      const st = r.start ? r.start.date : '';
      if ((st && d < st) || d > r.end.date) return;
      const m = r.show;
      out.push({ ...base, id: `mp-${r.id}`, camp: '음방 사전투표', title: `${m.name} 사전투표`, qty: m.pre.qty || '',
        platform: m.pre.app, window: `~ ${mdw(r.end.date)}${r.end.time ? ' ' + r.end.time : ''}`, repeat: '매일', start: st, end: r.end.date, link: appHref(m.pre.appKey), appKey: m.pre.appKey,
        memo: [m.pre.where, m.pre.limit, r.memo].filter(Boolean).join('\n'), music: m });
    });
    return out;
  }
  // 스케줄에 넣을 확정 출연 중 공식 일정에 없는 것 (음방.csv로 넣은 것)
  const musicManualEvents = () => musicAppearances().filter((a) => a.manual && !a.official).map((a) => ({
    id: `mv-${a.show.id}-${a.date}`, date: a.date, end: a.date, time: airOf(a.show, a.date).time, title: `${a.show.name} 출연`, type: '음방', place: a.show.ch, src: 'etc', link: a.src || '', mv: a.show,
  }));
  // 투표 한 줄 요약 (스케줄 일정 줄 · 가이드)
  const liveLine = (m) => (m.live ? `실시간 투표 ${m.live.window || m.time + '~'} · ${m.live.app}${m.live.qty ? ' ' + m.live.qty : ''}` : '실시간 투표 없음 · 사전투표가 점수에 반영');
  // 투표 가이드 음방 맨 위: 리센느 이번 주 음방 (누르면 그 음방 탭으로)
  function musicVoteStrip() {
    const t = today();
    const until = addDays(t, 6);
    const rows = [];
    musicPrevotes().forEach((r) => {
      if (r.end.date < t || (r.start && r.start.date > until)) return;
      const live = !r.start || r.start.date <= t;
      rows.push({ at: live ? t : r.start.date, k: live ? '진행 중' : `${mdw(r.start.date)}부터`, hot: live, t: `${r.show.name} 사전투표`, d: `~ ${mdw(r.end.date)}${r.end.time ? ' ' + r.end.time : ''}`, g: r.show.id });
    });
    musicAppearances().forEach((a) => {
      if (a.date < t || a.date > until) return;
      const air = airOf(a.show, a.date);
      const d = air.off ? '편성표에 없음 (결방)' : air.moved ? `${air.time} ${a.show.ch} · 시간 변경` : a.vote && a.show.live ? a.show.live.window || `${air.time} ~ ${air.end}` : `${air.time} ${a.show.ch}`;
      rows.push({ at: a.date, k: a.date === t ? '오늘' : mdw(a.date), hot: a.date === t, t: `${a.show.name} ${a.vote ? (a.top ? '1위 후보 투표' : '실시간 투표') : a.top ? '1위 후보' : '출연'}`, d, g: a.show.id });
    });
    rows.sort((x, y) => x.at.localeCompare(y.at));
    const li = (r) => `<li><button type="button" data-mgtab="${r.g}"><span class="mv-k${r.hot ? ' hot' : ''}">${esc(r.k)}</span><b>${esc(r.t)}</b><span class="mv-d num">${esc(r.d)}</span></button></li>`;
    if (!rows.length) return ''; // 이번 주 리센느 음방이 없으면 칸을 숨겨요
    return `<section class="mv-strip" aria-label="리센느 음방 투표">
        <div class="mv-head"><h2>리센느 이번 주 음방</h2><small>7일 안</small></div>
        ${rows.length ? `<ul>${rows.slice(0, 4).map(li).join('')}</ul>${rows.length > 4 ? `<details class="mv-more"><summary>${rows.length - 4}개 더 보기</summary><ul>${rows.slice(4).map(li).join('')}</ul></details>` : ''}`
          : '<p class="mv-none">출연·사전투표가 정해지면 여기와 오늘 할 일, 리센느 일정 달력에 보여요.</p>'}
      </section>`;
  }
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const nowHM = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const hmMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  // 오늘 화면 한 줄: 오늘 음방 (끝났거나 없으면 다음 음방)
  function musicLine() {
    const dow = dowOf(today());
    const now = hmMin(nowHM());
    const todays = MUSIC_SHOWS.find((m) => m.day === dow && !offOn(m, today()));
    let show = todays, k = '오늘 음방', tag = '', at = today();
    if (todays) {
      const a = airOf(todays, at);
      const st = hmMin(a.time);
      const en = hmMin(a.end) > st ? hmMin(a.end) : st + 90;
      if (now >= st && now < en) tag = '방송 중';
      else if (now >= en) show = null;
    }
    for (let i = 1; i <= 7 && !show; i++) {
      const m = MUSIC_SHOWS.find((x) => x.day === (dow + i) % 7 && !offOn(x, addDays(today(), i)));
      if (m) { show = m; at = addDays(today(), i); k = i === 1 ? '내일 음방' : `${WD[m.day]}요일 음방`; }
    }
    if (!show) return '';
    const mine = musicAppearances().some((a) => a.show === show && a.date === at);
    if (mine && !tag) tag = '리센느 출연';
    const air = airOf(show, at);
    return `<button type="button" class="sch-next mus-line" data-music aria-label="요일별 음악방송 시간표 보기"><span class="sch-next-k">${k}</span><span class="sch-next-t">${esc(show.name)}${tag ? ` <i class="mus-live">${tag}</i>` : ''}</span><span class="sch-next-d">${air.time} ${esc(show.ch)}${air.moved ? ` · 시간 변경 (평소 ${show.time})` : ''}</span><svg class="mus-go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`;
  }
  function openMusic() {
    let m = document.getElementById('music');
    if (!m) {
      m = document.createElement('div');
      m.id = 'music'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', '요일별 음악방송 시간표'); m.tabIndex = -1;
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-modal-close]')) hideModal(m); });
    }
    const dow = dowOf(today());
    m.innerHTML = `
      <div class="modal-box">
        <div class="modal-head"><h2>요일별 음악방송 시간표</h2><button type="button" class="icon-btn" data-modal-close aria-label="닫기">닫기</button></div>
        <div class="mus-table">
          ${[1, 2, 3, 4, 5, 6, 0].map((d) => {
            const x = MUSIC_SHOWS.find((y) => y.day === d);
            const day = x && nextAir(x, today());
            const o = x && offOn(x, day);
            const a = x && airOf(x, day);
            const sub = o ? `<small class="mus-off">${esc(offShort(o))}</small>` : a && a.moved ? `<small class="mus-moved">${md(day)} 시간 변경 · 평소 ${x.time}</small>` : x ? `<small>${esc(x.live ? '실시간 ' + x.live.app : '실시간 투표 없음')}</small>` : '';
            return `<div class="mus-row${d === dow ? ' on' : ''}${o ? ' off' : ''}"><span class="mus-d">${WD[d]}${d === dow ? '<small>오늘</small>' : ''}</span><span class="mus-n">${x ? esc(x.name) : '<i>음방 없음</i>'}${sub}</span><span class="mus-t num">${x ? (o ? x.time : a.time) : ''}</span><span class="mus-c">${x ? esc(x.ch) : ''}</span></div>`;
          }).join('')}
        </div>
        <p class="muted">방송사 공식 편성표 기준이에요 (3시간마다 확인). 편성표가 아직 안 나온 주는 평소 시간이에요.</p>
        <button type="button" class="btn small primary mus-guide" data-goguide="music">음방별 투표 방법 보기</button>
      </div>`;
    showModal(m);
  }


  // ---------- 투표 가이드 ----------
  // ---------- 음방 주간 달력 ----------
  // 막대 = 사전투표 기간 (끝나는 시각), 날짜 칸 = 방송(ON AIR) · 생방송 투표. 막대를 누르면 그 음방 투표 방법으로 가요.
  const MC_COLOR = { showkpop: '#8a6fc9', theshow: '#7f9a3e', showchamp: '#3a9696', mcountdown: '#cf8443', musicbank: '#3f8fc2', musiccore: '#6a5bd0', inkigayo: '#c9658c' };
  // 리센느 일정 달력과 같이 일요일부터 시작해요
  const MC_WD = ['일', '월', '화', '수', '목', '금', '토'];
  const mcShow = (n) => showById(n) || MUSIC_SHOWS.find((m) => m.re && m.re.test(n || ''));
  const mcApp = (m, r) => r.app || ((m.pre && (m.pre.short || m.pre.app)) || '').replace(/\s*\(.*?\)/g, '');
  function musicCalendar(t) {
    const rows = (state.data.musicCal || []).map((r) => ({ ...r, m: mcShow(r.show) })).filter((r) => r.m || r.kind === 'note');
    // 달력은 음방달력.csv(총공팀 일정표)만 그대로 보여 줘요
    if (!rows.some((r) => r.kind !== 'note')) return '';
    const weekStart = (d) => addDays(d, -dowOf(d));
    const airs = rows.filter((r) => r.kind === 'air');
    const first = weekStart(rows.map((r) => r.start.date).sort()[0]);
    const lastDay = (airs.length ? airs : rows).map((r) => r.end.date).sort().pop();
    const weeks = [];
    for (let w = first; w <= lastDay; w = addDays(w, 7)) weeks.push(w);
    const laneOf = {};   // 막대 아이디 → 줄 번호 (주를 넘어가도 같은 높이)
    const week = (w) => {
      const last = addDays(w, 6);
      const days = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(w, i));
      const cell = (d, i) => {
        const on = rows.filter((r) => r.start.date === d && r.kind === 'air');
        const shows = [...new Set(on.map((r) => r.m))];
        const items = shows.map((m) => `<button type="button" class="mc-air" data-mgtab="${m.id}" style="--c:${MC_COLOR[m.id] || '#6b7280'}" aria-label="${esc(m.name)} 방송"><b>${esc(MG_SHORT[m.id] || m.name)}</b></button>`).join('');
        return `<div class="mc-day${d === t ? ' today' : ''}${d < t ? ' past' : ''}" style="grid-column:${i + 1}"><span class="mc-dn${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${+d.slice(8)}</span>${items}</div>`;
      };
      // 이번 주에 걸친 막대: 주 안으로 잘라서 겹치지 않게 줄을 나눠요
      const segs = rows.filter((r) => (r.kind === 'pre' || r.kind === 'jury') && r.start.date <= last && r.end.date >= w).map((r) => {
        const a = r.start.date < w ? w : r.start.date;
        const b = r.end.date > last ? last : r.end.date;
        const c0 = days.indexOf(a), c1 = days.indexOf(b);
        return { r, c0, n: c1 - c0 + 1, contL: r.start.date < w, contR: r.end.date > last };
      }).sort((x, y) => x.c0 - y.c0 || y.n - x.n);
      // 앞 주에서 이어지는 막대는 같은 줄(높이)에 먼저 놓고, 나머지는 빈 줄에
      const lanes = [];
      const free = (l, a, b) => { for (let c = a; c <= b; c++) if (lanes[l] && lanes[l][c]) return false; return true; };
      [...segs.filter((g) => g.contL), ...segs.filter((g) => !g.contL)].forEach((g) => {
        const a = g.c0, b = g.c0 + g.n - 1;
        const want = g.contL ? laneOf[g.r.id] : undefined;
        let l = want != null && free(want, a, b) ? want : 0;
        if (l !== want) while (!free(l, a, b)) l++;
        while (lanes.length <= l) lanes.push([]);
        for (let c = a; c <= b; c++) lanes[l][c] = true;
        g.lane = l;
        laneOf[g.r.id] = l;
      });
      const bar = (g) => {
        const { r, n } = g;
        const m = r.m;
        const short = MG_SHORT[m.id] || m.name;
        const app = mcApp(m, r);
        const endsHere = !g.contR && r.end.time;
        const what = r.kind === 'jury' ? '시청자위원회' : '사전투표';
        let label;
        if (r.kind === 'jury') label = n >= 3 ? `${m.name} 시청자위원회 투표` : n === 2 ? `${short} 시청자위원회` : `${short} 시청자`;
        else label = n >= 4 ? `${m.name} 사전투표 · ${app}` : n === 3 ? (app.length > 5 ? `${short} 사전` : `${short} 사전 · ${app}`) : n === 2 ? `${short} 사전` : (g.contL ? '' : short);
        // 하루짜리 막대는 칸이 좁아서 '~' 없이 시각만
        const tm = endsHere ? (n === 1 ? r.end.time : `~${r.end.time}`) : (g.contR ? '→' : '');
        const aria = `${m.name} ${what} ${md(r.start.date)}${r.start.time ? ' ' + r.start.time : ''} ~ ${md(r.end.date)}${r.end.time ? ' ' + r.end.time : ''}${app && r.kind !== 'jury' ? ' · ' + app : ''}`;
        return `<button type="button" class="mc-bar${r.kind === 'jury' ? ' jury' : ''}${g.contL ? ' cont-l' : ''}${g.contR ? ' cont-r' : ''}${r.end.date < t ? ' past' : ''}${n === 1 ? ' n1' : ''}" data-mgtab="${m.id}" style="--c:${MC_COLOR[m.id] || '#6b7280'};grid-column:${g.c0 + 1} / span ${n};grid-row:${g.lane + 3}" aria-label="${esc(aria)}">${label ? `<span class="mc-bl">${esc(label)}</span>` : ''}${tm ? `<span class="mc-bt">${esc(tm)}</span>` : ''}</button>`;
      };
      return `<div class="mc-week${last < t ? ' past' : ''}" style="grid-template-rows:auto auto${lanes.length ? ` repeat(${lanes.length}, auto)` : ''}">
        ${days.map(cell).join('')}
        <i class="mc-gap" aria-hidden="true"></i>
        ${segs.map(bar).join('')}
      </div>`;
    };
    const past = weeks.filter((w) => addDays(w, 6) < t);
    const now = weeks.filter((w) => addDays(w, 6) >= t);
    const ym = (now[0] || weeks[0]).slice(0, 7).replace('-', '.');
    return `
      <section class="card mc" aria-label="음방 주간 달력">
        <div class="mc-head"><h2>주간 음방 달력</h2><span class="mc-ym">${ym} <small>KST</small></span></div>
        <ul class="mc-key"><li><i></i>사전투표 ~마감</li><li><i class="k-jury"></i>음중 시청자위원회</li><li><i class="k-air"></i>방송일</li></ul>
        <div class="mc-wd" aria-hidden="true">${MC_WD.map((x, i) => `<span class="${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${x}</span>`).join('')}</div>
        ${past.length ? `<details class="mc-past"><summary>지난 주 ${past.length}주 보기</summary>${past.map(week).join('')}</details>` : ''}
        ${(now.length ? now : weeks).map(week).join('')}
        <p class="mc-foot">일반적인 일정 안내예요. 실제 투표는 공지를 따라 주세요.</p>
      </section>`;
  }
  function renderMusic() {
    return `
      <section class="page-head"><h1>음악방송</h1><p>리센느 음방 일정 · 음방 7개 투표 방법</p></section>
      ${musicGuides(today())}
      ${sourceLine()}`;
  }
  const MG_SHORT = { showkpop: '쇼케', theshow: '더쇼', showchamp: '쇼챔', mcountdown: '엠카', musicbank: '뮤뱅', musiccore: '음중', inkigayo: '인가' };
  // 음방 탭 고르기: 다시 그리지 않고 카드만 바꿔요
  function pickMusic(id, scroll) {
    const pick = document.querySelector('.mg-pick');
    if (!pick) return;
    state.mgShow = id;
    pick.id = 'guide-music-' + id;
    pick.querySelectorAll('[data-mgtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mgtab === id)));
    pick.querySelectorAll('[data-mg]').forEach((c) => { c.hidden = c.dataset.mg !== id; });
    if (scroll) pick.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-mgtab]');
    if (b) pickMusic(b.dataset.mgtab, !b.classList.contains('mg-tab'));
  });
  function musicGuides(t) {
    const pctOf = (x) => { const r = /(\d+(?:\.\d+)?)\s*%/.exec(x || ''); return r ? +r[1] : 0; };
    // 점수 항목: 이름 · 비율 · 팬 투표인지 · 생방송(1위 후보 단계)인지
    const partsOf = (m) => (m.parts || []).map(([k, v]) => ({ k, v, p: pctOf(k), name: k.replace(/\s*\d+(?:\.\d+)?\s*%/, ''), vote: /투표/.test(k), live: /생방송|실시간/.test(k) }));
    const nTop = (m) => (/후보\s*(\d)\s*팀/.exec(m.chart || '') || [])[1];
    const appBtn = (keys, extra) => {
      const list = keys.filter((k) => APPS[k]);
      if (!list.length) return '';
      const many = list.length > 1;
      return `<div class="mg-app"><div class="mg-btns${many ? ' many' : ''}">${list.map((k) => `<a class="btn primary" href="${esc(appHref(k))}"${appTarget(k)} rel="noopener" data-app="${k}">${esc(APPS[k].name)}${many ? ' 투표' : ' 앱에서 투표'}</a>`).join('')}${extra || ''}</div></div>`;
    };
    // 투표 칸: 언제 → 어떻게 → 투표권 · 투표 수 → 버튼. 점수 비율은 아래 '1위 점수'에서 한 번만
    const box = (no, title, v, cls, m) => {
      if (!v) return `<section class="mg-box none"><div class="mg-box-h"><h3>${title}<em>${no}</em></h3></div><p class="mg-none">이 음방은 실시간 투표가 없어요. 사전투표가 팬 투표의 전부예요.</p></section>`;
      const p = pctOf(v.weight);
      const btns = appBtn(v.appKeys || [v.appKey], cls === 'live' && m.sms ? `<a class="btn sms mg-sms" href="sms:${encodeURIComponent(m.sms.to)}?&body=${encodeURIComponent(m.sms.body)}">문자 ${esc(m.sms.to)}</a>` : '');
      const note = (v.weight || '').replace(/^[^(·]*?\d+(?:\.\d+)?\s*%\s*/, '').replace(/^[·(\s]+|[)\s]+$/g, '').trim();
      return `<section class="mg-box ${cls || ''}">
        <div class="mg-box-h"><h3>${title}<em>${no}</em></h3>${p ? `<span class="mg-pct">점수 ${p}%</span>` : ''}</div>
        <p class="mg-period"><span>언제</span>${esc(v.when)}</p>
        <ol class="mg-steps">${(v.steps || [v.where]).map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
        <dl>
          ${btns ? '' : `<dt>앱</dt><dd>${esc(v.app)}</dd>`}
          ${v.ticket ? `<dt>투표권</dt><dd>${esc(v.ticket)}</dd>` : ''}
          ${v.earn ? `<dt>모으기</dt><dd><ul class="mg-earn">${v.earn.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></dd>` : ''}
          <dt>투표 수</dt><dd>${esc(v.limit)}</dd>
          ${note && !/실시간 투표가 없어서/.test(note) ? `<dt>참고</dt><dd>${esc(note)}</dd>` : ''}</dl>
        ${btns}
      </section>`;
    };
    // 1위 점수: 막대 하나로 비율을 보여주고, 팬이 직접 올릴 수 있는 투표 몫을 강조
    const score = (m) => {
      const ps = partsOf(m);
      if (!ps.length) return `<p class="mg-chart">${esc(m.chart)}</p>`;
      const total = ps.reduce((x, y) => x + y.p, 0);
      const fan = ps.filter((x) => x.vote).reduce((x, y) => x + y.p, 0);
      let g = 0;
      ps.forEach((x) => { x.c = x.vote ? (x.live ? 'vl' : 'vp') : `g${g++ % 4}`; });
      const n = nTop(m);
      const how = m.live
        ? `사전 점수${n ? `로 1위 후보 ${n}팀을 뽑고` : '에'}, 방송 중 실시간 투표를 더해 1위가 정해져요`
        : '실시간 투표 없이 사전 점수만으로 1위가 정해져요';
      return `<section class="mg-score">
        <div class="mg-score-h"><h3>1위는 이렇게 정해져요</h3><span class="mg-fan">팬 투표 <b>${fan}${total !== 100 ? ` / ${total}` : ''}%</b></span></div>
        <p class="mg-how">${how}</p>
        <div class="mg-bar" role="img" aria-label="${esc(ps.map((x) => `${x.name} ${x.p}%`).join(', '))}">${ps.map((x) => `<i class="${x.c}" style="flex-grow:${x.p}"></i>`).join('')}</div>
        <ul class="mg-legend">${ps.map((x) => `<li class="${x.vote ? 'vote' : ''}"><i class="${x.c}"></i>${esc(x.name)} <b>${x.p}</b></li>`).join('')}</ul>
        <details class="mg-parts"><summary>항목별 기준 · 집계 기간</summary><dl>${ps.map((x) => `<dt>${esc(x.k)}</dt><dd>${esc(x.v)}</dd>`).join('')}</dl>${m.partsSrc ? `<small>${esc(m.partsSrc)}</small>` : ''}</details>
      </section>`;
    };
    const notes = (m) => {
      const list = (m.tip || '').split(/(?<=[.])\s+/).map((x) => x.trim()).filter(Boolean);
      if (!list.length && !m.after) return '';
      return `<details class="mg-notes mg-fold"><summary><h3>알아두면 좋아요</h3><span class="mg-cnt">${list.length + (m.after ? 1 : 0)}개</span></summary><ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}${m.after ? `<li class="after"><b>방송 뒤 투표</b>${esc(m.after.replace(/^[^:]+:\s*/, (h) => h))}</li>` : ''}</ul></details>`;
    };
    const card = (m, sel) => {
      const day = nextAir(m, t);
      const o = offOn(m, day);
      const air = airOf(m, day);
      return `
      <article class="card guide mg" data-mg="${m.id}" role="tabpanel"${m === sel ? '' : ' hidden'}>
        <header class="mg-head">
          <span class="mg-day" aria-label="${WD[m.day]}요일">${WD[m.day]}</span>
          <div class="mg-title"><h2>${esc(m.name)}</h2><small>${esc(m.sub)}</small></div>
          <div class="mg-air"><b class="num">${o ? m.time : air.time}</b><span>${esc(m.ch)}</span></div>
        </header>
        ${o ? `<div class="mg-off" role="note"><b>${esc(o.title)}</b><p>${esc(o.note)}${o.auto ? '' : ' 그동안은 투표도 열리지 않아요.'}</p>${o.src ? `<a href="${esc(o.src)}" target="_blank" rel="noopener">관련 기사 ↗</a>` : ''}</div>` : ''}
        ${!o && air.moved ? `<div class="mg-off" role="note"><b>${mdw(day)} 방송은 ${air.time}에 시작해요</b><p>평소 ${m.time}에서 바뀌었어요 (${esc(m.ch)} 공식 편성표). 실시간 투표 시간도 달라질 수 있어요.</p></div>` : ''}
        <div class="mg-grid">${box('방송 전', '사전투표', m.pre, '', m)}${box('방송 중', '실시간 투표', m.live, 'live', m)}</div>
        ${score(m)}
        ${notes(m)}
        ${m.links ? `<div class="mg-links">${m.links.map(([nm, u]) => `<a class="btn small" href="${esc(u)}" target="_blank" rel="noopener">${esc(nm)} ↗</a>`).join('')}</div>` : ''}
      </article>`;
    };
    const order = [1, 2, 3, 4, 5, 6, 0].map((d) => MUSIC_SHOWS.find((m) => m.day === d)).filter(Boolean);
    const { arg } = route();
    const want = arg && arg.startsWith('music-') ? arg.slice(6) : state.mgShow;
    // 처음 보여 줄 음방: 주소로 고른 것 → 직접 고른 것 → 오늘 요일 음방
    const wd = new Date(t.replace(/-/g, '/')).getDay();
    const sel = order.find((m) => m.id === want) || order.find((m) => m.day === wd) || order[0];
    const offNext = (m) => offOn(m, nextAir(m, t));
    const tabs = order.map((m) => `<button type="button" role="tab" class="mg-tab${offNext(m) ? ' off' : ''}${m.day === wd ? ' today' : ''}" data-mgtab="${m.id}" aria-selected="${m === sel}" aria-label="${WD[m.day]}요일 ${esc(m.name)}${m.day === wd ? ' (오늘)' : ''}${offNext(m) ? ' · 결방' : ''}"><small>${WD[m.day]}</small><b>${esc(MG_SHORT[m.id] || m.name)}</b>${offNext(m) ? '<em class="mg-tab-off">결방</em>' : ''}</button>`).join('');
    return `
      <section class="mg-section" id="guide-music">
        ${musicVoteStrip()}
        ${musicCalendar(t)}
        <a class="mg-pred" href="https://x.com/KshowAnalysis1" target="_blank" rel="noopener"><span class="mg-pred-x" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.19L2 3h6.33l4.37 5.77L17.75 3zm-1.08 16.17h1.7L7.4 4.73H5.58l11.09 14.44z"/></svg></span>차트 결과 예측<span class="mg-pred-go" aria-hidden="true">↗</span><span class="sr">(X @KshowAnalysis1에서 열기)</span></a>
        <details class="card mg-intro mg-fold">
          <summary><h3>음방 투표가 처음이라면</h3></summary>
          <ol>
            <li><b>앱 준비</b><span>음방마다 투표 앱이 달라요. 버튼을 누르면 앱이 열리고, 없으면 설치 화면으로 가요.</span></li>
            <li><b>사전투표</b><span>방송 며칠 전부터 열려요. 기간 동안 앱에서 모은 투표권으로 리센느에 투표해요.</span></li>
            <li><b>실시간 투표</b><span>생방송 중에만 열려요. 대부분 1위 후보에 오른 팀에게만 투표할 수 있어요.</span></li>
          </ol>
          <p>리센느 출연 · 투표가 확정되면 오늘 할 일에 자동으로 떠요. 기간은 회차마다 바뀔 수 있어요. 어느 음방에 투표할지는 리센느 음원총공팀 공지를 먼저 따라 주세요.</p>
        </details>
        <details class="card mg-table mg-fold">
          <summary><h3>음방 7개 한눈에 비교</h3></summary>
          <div role="table" aria-label="음방별 투표 한눈에">
          <div class="mg-tr mg-th" role="row"><span role="columnheader">방송</span><span role="columnheader">사전투표</span><span role="columnheader">실시간</span></div>
          ${order.map((m) => `<button type="button" class="mg-tr" role="row" data-mgtab="${m.id}"><span role="cell"><b>${esc(m.name)}</b>${offNext(m) ? '<i class="mg-offtag">결방</i>' : airOf(m, nextAir(m, t)).moved ? '<i class="mg-offtag">시간 변경</i>' : ''}<small><em>${WD[m.day]}</em> ${offNext(m) ? m.time : airOf(m, nextAir(m, t)).time} · ${esc(m.ch)}</small></span><span role="cell">${esc(m.pre.short || m.pre.app.replace(/\(.*\)/, ''))}<small>${esc(m.pre.cost ? m.span : [m.span, m.pre.qty].filter(Boolean).join(' · '))}</small>${m.pre.cost ? `<span class="mg-cost">${esc(m.pre.cost)}</span>` : ''}</span><span role="cell">${m.live ? `${esc(m.live.short || m.live.app.replace(/\(.*\)/, ''))}${m.live.cost ? `<span class="mg-cost">${esc(m.live.cost)}</span>` : `<small>${esc(m.live.qty || '방송 중')}</small>`}` : '<i>없음</i>'}</span></button>`).join('')}
          </div>
        </details>
        <div class="mg-pick" id="guide-music-${sel.id}">
          <div class="mg-tabs" role="tablist" aria-label="음방 고르기">${tabs}</div>
          <div class="mg-cards">${order.map((m) => card(m, sel)).join('')}</div>
        </div>
      </section>`;
  }
