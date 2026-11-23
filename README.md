# AI 학습 점검

**문제 풀기**에서 PDF, JPG, PNG, WebP 파일(3MB 이하)을 올리고 문제 수를 1~10개 중에서 선택합니다. 기본값은 5개입니다. Gemini는 선택한 수만큼 4지선다 문제를 만들고, 필요한 경우 도형이나 그래프를 제공합니다. 모든 문항을 제출하면 해설을 볼 수 있습니다. 오답은 Gemini 코치의 첫 질문에 최대 두 번 답하며 단서를 얻거나, 정답과 해설을 바로 열 수 있습니다. 틀린 개념은 한 번 더 풀 수 있습니다.

**개념 정리**는 별도 탭에서 파일을 분석하고, 핵심 그림 한 장과 개념별 설명을 차례로 보여줍니다. **지난 리포트**에서는 이 브라우저에 저장된 학습 기록을 다시 볼 수 있습니다. 리포트는 첫 풀이 기준으로 자신감과 정답률 차이, 자신감 유형별 문항 수, 복습 우선순위와 선택한 오답 이유를 보여줍니다. 재검증은 첫 풀이 통계와 분리합니다. 자신감 1~2점은 낮음, 3점은 반반, 4~5점은 높음으로 분류합니다. 판단 정확도는 `100 − |(자신감 − 1) × 25 − 정오답 점수|`로 계산합니다.

문항 해설 아래 **출제 근거 보기**를 펼치면 현재 풀이에 사용한 PDF의 해당 쪽이나 원본 사진이 표시됩니다. PDF 인용 문구는 해당 쪽에서 텍스트로 확인되는 경우에만 원문에서 확인했다고 표시합니다. 원본 파일은 현재 브라우저 탭에서만 남아 있어 지난 리포트에는 첨부되지 않습니다.

## VS Code에서 실행

Node.js 22 이상을 설치한 뒤 이 폴더에서 실행합니다. 처음 실행하거나 패키지 버전이 바뀌면 npm 패키지를 먼저 설치합니다.

```powershell
cd onknowing
npm.cmd ci
npm.cmd run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 이미 onknowing 폴더에 있다면 cd 명령은 생략합니다. `dist/index.html`을 직접 열면 첫 화면을 미리 볼 수 있습니다. 문제를 생성하려면 로컬 서버 주소로 접속하세요.

## Gemini 설정

개발자가 [Google AI Studio](https://aistudio.google.com/apikey)에서 Gemini API 키를 발급한 뒤 `.env`에 설정합니다. 처음 설정하는 경우 `.env.example`을 복사해서 사용하세요.

```dotenv
GEMINI_API_KEY=발급받은_키
GEMINI_MODEL=gemini-3.1-flash-lite
PORT=3000
```

서버를 다시 실행하면 방문자는 키 입력 없이 문제를 만들 수 있습니다. 브라우저는 같은 사이트의 `/api/quiz`로 파일을 보내고, 서버가 환경변수의 키로 Gemini에 요청합니다. 파일은 앱에 저장하지 않으며 리포트만 브라우저에 남깁니다. `.env`는 Git에서 제외되어 있습니다.

## Vercel 배포

1. 이 폴더를 GitHub 저장소에 올리고 Vercel에서 Import합니다.
2. Framework Preset은 Other, Output Directory는 `dist`, Build Command는 `npm run build`로 설정합니다.
3. 환경변수 `GEMINI_API_KEY`, 필요하면 `GEMINI_MODEL`을 설정하고 배포합니다.
4. `api/`의 Vercel Functions가 서버 API 요청을 처리합니다. 배포 환경에도 키가 설정되어야 방문자가 문제를 만들 수 있습니다.

공개 사이트에서 공용 서버 키를 사용할 경우 접근 제한과 요청량 제한을 추가해야 합니다. 현재 서버는 팀의 로컬 프로토타입 용도이며 로그인이나 사용자별 할당량은 구현하지 않았습니다. API 사용 가능 모델과 무료 할당량은 본인 AI Studio 프로젝트에서 확인해주세요.

## 파일

- `dist/index.html`, `dist/style.css`, `dist/app.js`: 파일 선택, 문제 풀이, 개념 정리, 리포트 화면
- `dist/training.js`: 채점, 자신감 분류, 리포트 계산
- `lib/gemini.js`: 서버에서 사용하는 Gemini 요청·응답 처리
- `lib/quiz.js`: 문제 생성 요청과 생성 결과 검증
- `lib/coach.js`: 오답 코칭 프롬프트와 Gemini 응답 처리
- `server.js`: 로컬 HTTP 서버
- `api/`: Vercel 서버 함수
- `lib/handler.js`: 서버 공통 처리
- `tests/`: 실제 네트워크 호출 없이 검증하는 API 계약 테스트

## 확인

```powershell
npm.cmd run build
npm.cmd test
```

자동 테스트는 파일 형식, 생성 문항 수, 중복 선택지, 자신감·정오답 유형, 리포트 계산을 검증합니다. 직접 확인하려면 학습 자료 PDF나 사진을 하나 올려 보세요.

REST Interactions API (`Api-Revision: 2026-05-20`), `store: false`와 전체 대화 문맥 전송을 사용합니다. 모델 ID는 서버의 `GEMINI_MODEL`에서 변경할 수 있습니다. [Google 공식 시작 안내](https://aistudio.google.com/docs/get-started) · [Interactions API](https://aistudio.google.com/docs/interactions-overview)
