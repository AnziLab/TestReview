# 📝 채점기준 정제 도구

> 한국 중고등학교 교사를 위한 서답형(주관식) 시험 채점기준표 정제 도구

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11+-green.svg)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 📄 채점기준표 자동 추출 | PDF 채점기준표를 올리면 Gemini AI가 문항·모범답안·채점기준을 자동 인식 |
| ✍️ 채점기준 초안 생성 | 시험지만 있으면 AI가 채점기준표 초안을 자동 작성 |
| 🔍 답안 클러스터링 | 학생 전체 답안을 유사한 유형으로 묶어 기준 미충족 답안만 표시 |
| 📊 채점기준 정제 | 예상치 못한 답안 유형을 확인하고 채점기준을 완성 |
| 🤖 일괄 채점 | 완성된 기준표로 전체 학생 자동 채점 |
| 📥 Excel 내보내기 | 학생별 답안·점수 엑셀 다운로드 |

---

## 🔒 보안 및 개인정보

- **완전 로컬 실행**: 별도 서버 없이 본인 컴퓨터에서만 동작
- **외부 전송 최소화**: Gemini API(Google)로만 데이터 전송, 그 외 없음
- **본인 API 키 사용**: Google AI Studio에서 발급한 개인 키 사용 → 본인 계정 아래에서만 처리
- **127.0.0.1 바인딩**: 같은 네트워크 다른 사람이 접속 불가

> 소스코드 전체가 이 저장소에 공개되어 있어 누구나 직접 확인할 수 있습니다.

---

## 💻 설치 방법

> 자세한 설치 가이드는 **[INSTALL.md](INSTALL.md)** 를 참고하세요.

### Mac

```
1. install.command 파일을 다운로드
2. 더블클릭 → 자동으로 Git/Python/Node.js 설치 + 앱 다운로드
3. 설치 완료 후 ~/TestReview/start.command 더블클릭
```

### Windows

```
1. install.bat 파일을 다운로드
2. 우클릭 → 관리자로 실행 → 자동으로 Git/Python/Node.js 설치 + 앱 다운로드
3. 바탕화면 "TestReview" 더블클릭
```

> Git, Python, Node.js가 없어도 설치 스크립트가 자동으로 설치합니다.
> Git으로 설치되므로 앱 실행 시 자동으로 최신 버전으로 업데이트됩니다.

---

## 🚀 사용 흐름

```
1. 시험 만들기
   └─ 채점기준표 PDF 업로드 → AI 자동 추출
   └─ 또는 시험지 업로드 → AI 채점기준 초안 생성

2. 학생 답안 업로드
   └─ 반별 스캔 PDF 업로드 (단면/양면)
   └─ AI가 학번·이름·답안 자동 인식

3. 채점기준 정제 (핵심)
   └─ AI가 전체 답안을 유형별로 클러스터링
   └─ 현재 기준으로 판단 불가한 유형만 표시
   └─ 교사가 기준 수정 → 재분류 → 반복
   └─ 모든 답안이 분류되면 기준표 완성

4. 채점
   └─ 완성된 기준표로 전체 자동 채점
   └─ Excel 다운로드
```

---

## ⚙️ 시스템 요구사항

| 항목 | 최소 사양 |
|------|----------|
| OS | Windows 10/11, macOS 12+ |
| RAM | 4GB 이상 |
| 저장공간 | 2GB 이상 |
| 인터넷 | Gemini API 호출용 (시험지·답안 전송 시) |

---

## 🔑 Gemini API 키 발급

1. [Google AI Studio](https://aistudio.google.com) 접속
2. **Get API Key** → **Create API key**
3. 앱 설정 페이지에 입력

> 무료 티어로 충분히 사용 가능합니다.

---

## 🔄 업데이트

- **자동**: 앱 실행(start.command / start.bat) 시 자동으로 최신 버전 확인 및 업데이트
- **수동**: 앱 내 **설정 → 업데이트 확인** 버튼

---

## 🛠 기술 스택

- **Backend**: FastAPI, SQLAlchemy, SQLite, Alembic
- **Frontend**: Next.js 16, TypeScript, TailwindCSS
- **AI**: Google Gemini 2.5 Flash

---

## 📄 라이선스

MIT License — 자유롭게 사용, 수정, 배포 가능합니다.
