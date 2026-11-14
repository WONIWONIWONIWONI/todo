// 미러 폐쇄(AI-0050): 예전 주소로 들어온 사용자를 같은 경로의 정식 사이트로 보냄.
export default {
  fetch(request) {
    const url = new URL(request.url);
    return Response.redirect('https://woniwoniwoniwoni.github.io/todo' + url.pathname + url.search, 301);
  },
};
