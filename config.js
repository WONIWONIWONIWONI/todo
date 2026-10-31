// ===== 사이트 설정 =====
// 운영진이 바꿀 곳은 여기뿐이에요. 따옴표('') 안의 글자만 바꾸세요.

window.SITE_CONFIG = {
  // 사이트 이름 (상단에 표시)
  SITE_TITLE: '리센느 오늘의 할일',

  // 구글 시트 ID
  // 비워두면 사이트에 들어 있는 정리본(sample-data.js)을 보여줘요. 지금은 이 방식으로 운영 중.
  // 나중에 시트로 운영하려면 시트를 새 양식으로 바꾼 뒤 아래 ID를 다시 넣으세요.
  //   이전에 쓰던 시트 ID: 1Nr7NvEBDgyZnWJx4IwfS6WhDZoXJ3YHAgcIcuZS8cao
  SHEET_ID: '',

  // 시트 아래쪽 탭 이름 (시트 탭 이름을 바꾸지 않았다면 그대로 두세요)
  TABS: {
    alliances: '연합',
    tasks: '할일',
    guides: '가이드',
  },
};
