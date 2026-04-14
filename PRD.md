# PRD: 서답형 채점기준표 정제 도구

## 1. 제품 개요

### 1.1 문제 정의
한국 중고등학교 교사는 서답형(주관식) 시험 채점 시 다음 문제에 직면한다:
- 시험 출제 시 만든 채점기준표는 학생들의 실제 답안 다양성을 반영하지 못함
- 채점 중 예상치 못한 답변 유형이 등장하면 기준을 즉흥적으로 수정 → 일관성 붕괴
- 270명 답안을 일일이 읽고 패턴을 찾는 것은 비현실적

### 1.2 솔루션
**채점 전에** Gemini로 전체 답안을 유형별 클러스터링하여, 현재 기준으로 판단 불가능한 클러스터만 교사에게 노출 → 교사는 기준을 보완 → 재분류 → 반복. 모든 답안이 명확히 분류되면 기준표 완성.

### 1.3 핵심 원칙
- **채점기준표 정제가 주기능**, 자동채점은 부가기능
- **OCR은 한 번만**: 업로드 시 Gemini로 답안 추출 후 DB 저장, 이후 재호출 없음
- **Gemini 일괄 처리**: 문항당 270개 답안을 한 번의 호출로 클러스터링 (비용/속도 최적화)
- **사용자별 API 키**: 서버는 키를 보관만, 호출 비용은 교사 개인 부담

### 1.4 대상 사용자
- **Teacher**: 시험 생성, 답안 업로드, 기준표 정제, 채점
- **Admin**: 가입 신청 승인/거절, 사용자 관리

---

## 2. DB 스키마

SQLAlchemy(SQLite 개발 / PostgreSQL 운영) 기준. 모든 테이블에 `created_at`, `updated_at` (UTC).

### 2.1 `users`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| username | VARCHAR(50) | UNIQUE, NOT NULL | 로그인 ID |
| email | VARCHAR(255) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt |
| full_name | VARCHAR(100) | NOT NULL | |
| school | VARCHAR(200) | NULL | |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'teacher' | `teacher` \| `admin` |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | `pending` \| `approved` \| `rejected` |
| approved_by | INTEGER | FK users.id NULL | |
| approved_at | TIMESTAMP | NULL | |
| gemini_api_key_encrypted | TEXT | NULL | Fernet 암호화 |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

인덱스: `idx_users_status`, `idx_users_username`

### 2.2 `exams`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| teacher_id | INTEGER | FK users.id NOT NULL | |
| title | VARCHAR(200) | NOT NULL | |
| subject | VARCHAR(50) | NULL | |
| grade | INTEGER | NULL | 학년 |
| description | TEXT | NULL | |
| rubric_source_filename | VARCHAR(255) | NULL | |
| rubric_source_path | VARCHAR(500) | NULL | |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | `draft` \| `rubric_ready` \| `answers_uploaded` \| `rubric_refined` \| `graded` |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

### 2.3 `questions`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| exam_id | INTEGER | FK exams.id CASCADE | |
| number | VARCHAR(20) | NOT NULL | "1", "2-1" 등 |
| order_index | INTEGER | NOT NULL | |
| question_text | TEXT | NULL | |
| max_score | NUMERIC(5,2) | NOT NULL | |
| model_answer | TEXT | NULL | |
| rubric_json | JSON | NOT NULL, DEFAULT '[]' | 구조화된 채점기준 |
| rubric_draft_json | JSON | NULL | 자동저장 임시본 |
| rubric_version | INTEGER | NOT NULL, DEFAULT 1 | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

`rubric_json` 구조:
```json
{
  "criteria": [
    {"id": "c1", "description": "핵심 개념 A 포함", "points": 2}
  ],
  "notes": "부분점수 규칙 등"
}
```

UNIQUE: `(exam_id, number)`

### 2.4 `classes`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| exam_id | INTEGER | FK exams.id CASCADE | |
| name | VARCHAR(50) | NOT NULL | "1반" |
| scan_mode | VARCHAR(10) | NOT NULL | `single` \| `double` |
| source_pdf_filename | VARCHAR(255) | NULL | |
| source_pdf_path | VARCHAR(500) | NULL | |
| ocr_status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | `pending` \| `processing` \| `done` \| `failed` |
| ocr_error | TEXT | NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

### 2.5 `students`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| class_id | INTEGER | FK classes.id CASCADE | |
| student_number | VARCHAR(20) | NULL | OCR 추출 |
| name | VARCHAR(50) | NULL | OCR 추출 |
| page_indices | JSON | NOT NULL | 원본 PDF 페이지 번호 [1,2] |
| ocr_confidence | VARCHAR(20) | NULL | `high` \| `medium` \| `low` |
| needs_review | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

### 2.6 `answers`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| student_id | INTEGER | FK students.id CASCADE | |
| question_id | INTEGER | FK questions.id CASCADE | |
| answer_text | TEXT | NOT NULL | Gemini 추출 (불변) |
| created_at | TIMESTAMP | NOT NULL | |

UNIQUE: `(student_id, question_id)`

### 2.7 `refinement_sessions`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| question_id | INTEGER | FK questions.id CASCADE | |
| rubric_snapshot_json | JSON | NOT NULL | 호출 당시 rubric 스냅샷 |
| status | VARCHAR(20) | NOT NULL | `running` \| `done` \| `failed` |
| error | TEXT | NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| completed_at | TIMESTAMP | NULL | |

### 2.8 `answer_clusters`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| session_id | INTEGER | FK refinement_sessions.id CASCADE | |
| label | VARCHAR(200) | NOT NULL | |
| representative_text | TEXT | NOT NULL | |
| size | INTEGER | NOT NULL | |
| judgable | BOOLEAN | NOT NULL | 현재 기준 판단 가능 여부 |
| suggested_score | NUMERIC(5,2) | NULL | |
| reason | TEXT | NULL | |
| created_at | TIMESTAMP | NOT NULL | |

### 2.9 `cluster_members`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| cluster_id | INTEGER | FK answer_clusters.id CASCADE | |
| answer_id | INTEGER | FK answers.id | |

UNIQUE: `(cluster_id, answer_id)`

### 2.10 `gradings`
| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | INTEGER | PK | |
| answer_id | INTEGER | FK answers.id CASCADE UNIQUE | |
| score | NUMERIC(5,2) | NOT NULL | |
| matched_criteria_ids | JSON | NULL | |
| rationale | TEXT | NULL | |
| graded_by | VARCHAR(20) | NOT NULL | `auto` \| `manual` |
| graded_by_user_id | INTEGER | FK users.id NULL | |
| rubric_version | INTEGER | NOT NULL | |
| created_at | TIMESTAMP | NOT NULL | |
| updated_at | TIMESTAMP | NOT NULL | |

### 관계 요약
```
users 1──* exams 1──* questions 1──* answers *──1 students *──1 classes
                                  └── refinement_sessions ──* answer_clusters ──* cluster_members
answers ──1 gradings
```

---

## 3. API 엔드포인트

Prefix: `/api/v1`. 인증: JWT Bearer.

### Auth
| Method | Path | 설명 |
|---|---|---|
| POST | `/auth/signup` | 가입 신청 (status=pending) |
| POST | `/auth/login` | 로그인 → access/refresh token |
| POST | `/auth/refresh` | 토큰 갱신 |
| POST | `/auth/logout` | 로그아웃 |
| GET | `/auth/me` | 현재 유저 정보 |

### User Settings
| Method | Path | 설명 |
|---|---|---|
| PUT | `/me/api-key` | Gemini API 키 저장(암호화) |
| DELETE | `/me/api-key` | 키 삭제 |
| POST | `/me/api-key/test` | 키 유효성 테스트 |
| PUT | `/me/password` | 비밀번호 변경 |

### Admin
| Method | Path | 설명 |
|---|---|---|
| GET | `/admin/users` | 유저 목록 (status 필터) |
| POST | `/admin/users/{id}/approve` | 승인 |
| POST | `/admin/users/{id}/reject` | 거절 |
| POST | `/admin/users/{id}/disable` | 비활성화 |

### Exams
| Method | Path | 설명 |
|---|---|---|
| GET | `/exams` | 내 시험 목록 |
| POST | `/exams` | 시험 생성 |
| GET | `/exams/{id}` | 상세 |
| PUT | `/exams/{id}` | 수정 |
| DELETE | `/exams/{id}` | 삭제 |
| POST | `/exams/{id}/rubric-file` | 기준표 파일 업로드 → Gemini 추출 |
| GET | `/exams/{id}/rubric-extraction` | 추출 상태 폴링 |

### Questions
| Method | Path | 설명 |
|---|---|---|
| GET | `/exams/{exam_id}/questions` | 목록 |
| POST | `/exams/{exam_id}/questions` | 수동 추가 |
| PUT | `/questions/{id}` | 수정 |
| DELETE | `/questions/{id}` | 삭제 |
| PUT | `/questions/{id}/rubric-draft` | **자동저장** (debounce) |
| POST | `/questions/{id}/rubric-draft/commit` | draft → 확정 반영 |

### Classes & Upload
| Method | Path | 설명 |
|---|---|---|
| GET | `/exams/{exam_id}/classes` | 반 목록 |
| POST | `/exams/{exam_id}/classes` | 반 생성 + PDF 업로드 |
| GET | `/classes/{id}/ocr-status` | OCR 진행상황 폴링 |
| DELETE | `/classes/{id}` | 삭제 |
| POST | `/classes/{id}/reprocess` | 재OCR |

### Students & Answers
| Method | Path | 설명 |
|---|---|---|
| GET | `/classes/{id}/students` | 학생+답안 |
| PUT | `/students/{id}` | 학번/이름 수동 수정 |
| PUT | `/answers/{id}` | 답안 텍스트 수정 |
| GET | `/exams/{id}/answers.xlsx` | Excel 다운로드 |

### Refinement (핵심)
| Method | Path | 설명 |
|---|---|---|
| POST | `/questions/{id}/refine` | 정제 세션 시작 |
| POST | `/exams/{id}/refine-all` | 전 문항 일괄 정제 |
| GET | `/refinement-sessions/{id}` | 상태 폴링 |
| GET | `/refinement-sessions/{id}/clusters` | 클러스터 목록 |
| GET | `/clusters/{id}/members` | 클러스터 답안 목록 |

### Grading
| Method | Path | 설명 |
|---|---|---|
| POST | `/exams/{id}/grade` | 일괄 자동채점 |
| GET | `/exams/{id}/gradings` | 채점 결과 |
| PUT | `/gradings/{id}` | 수동 수정 |
| GET | `/exams/{id}/gradings.xlsx` | 성적표 다운로드 |

---

## 4. 프론트엔드 페이지

| Path | 역할 |
|---|---|
| `/login` | 로그인 |
| `/signup` | 가입 신청 |
| `/pending` | 승인 대기 안내 |
| `/dashboard` | 시험 목록 |
| `/settings/api-key` | Gemini API 키 등록 |
| `/settings/account` | 비밀번호/프로필 |
| `/exams/new` | 시험 생성 + 기준표 업로드 |
| `/exams/[examId]` | 시험 허브 (진행상태 오버뷰) |
| `/exams/[examId]/rubric` | 문항/채점기준 확인·수정 |
| `/exams/[examId]/classes` | 반 목록, PDF 업로드 |
| `/exams/[examId]/classes/[classId]` | 학생/답안 미리보기, OCR 보정 |
| `/exams/[examId]/refine` | 정제 허브 (문항 선택) |
| `/exams/[examId]/refine/[questionId]` | **핵심**: 클러스터 + 기준 편집 분할뷰 |
| `/exams/[examId]/grading` | 자동채점 + 결과 |
| `/admin/users` | 가입신청 승인 |

---

## 5. 핵심 로직

### Gemini 호출 전략

**기준표 추출**
- PDF/HWPX → 이미지 변환 → Gemini
- `response_mime_type="application/json"` + JSON Schema 강제
- 출력: `{number, question_text, max_score, model_answer, criteria:[{description, points}]}`

**학생 답안 OCR**
- PDF → PyMuPDF로 페이지별 이미지
- scan_mode에 따라 1~2페이지 = 1학생
- Gemini가 학번/이름/문항별 답안 한번에 추출
- DB 저장 후 재OCR 없음

**클러스터링 (핵심)**
- 문항 1개당 1 Gemini 호출
- 입력: rubric_json + answers 전체 (answer_id, text)
- 출력: clusters [{label, representative_text, member_ids, judgable, reason, suggested_score}]
- 실패 시 절반씩 나눠 재시도

**자동채점**
- rubric 확정 후 문항당 1 Gemini 호출
- 출력: [{answer_id, score, matched_criteria_ids, rationale}]

### 자동저장
- `rubric_draft_json` 컬럼에 1초 debounce로 저장
- 페이지 진입 시 draft 있으면 "복구/버리기" 모달
- 명시적 저장 시 `/commit` → `rubric_json` 반영 + `rubric_version += 1`

### 인증
- bcrypt 해시, JWT access(15분) + refresh(14일)
- 가입 시 `status=pending`, 어드민 승인 후 `status=approved`
- 최초 어드민: `python -m app.cli create-admin`
- API 키: Fernet 암호화, 응답/로그에 절대 평문 노출 없음

### 파일 저장
- `StorageBackend` 인터페이스 (LocalStorage / S3Storage)
- 경로: `storage/{user_id}/{exam_id}/...`

---

## 6. 파일 구조

### Backend
```
backend/
├── alembic/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── deps.py              # get_db, get_current_user, require_admin
│   ├── security.py          # jwt, bcrypt, fernet
│   ├── cli.py               # create-admin
│   ├── models/
│   │   ├── user.py
│   │   ├── exam.py
│   │   ├── class_.py
│   │   ├── answer.py
│   │   ├── refinement.py
│   │   └── grading.py
│   ├── schemas/
│   ├── api/v1/
│   │   ├── auth.py
│   │   ├── me.py
│   │   ├── admin.py
│   │   ├── exams.py
│   │   ├── questions.py
│   │   ├── classes.py
│   │   ├── students.py
│   │   ├── refinement.py
│   │   └── grading.py
│   ├── services/
│   │   ├── rubric_extract_service.py
│   │   ├── ocr_service.py
│   │   ├── refinement_service.py
│   │   ├── grading_service.py
│   │   └── export_service.py
│   ├── gemini/
│   │   ├── client.py
│   │   ├── prompts.py
│   │   ├── rubric_extract.py
│   │   ├── ocr.py
│   │   ├── clustering.py
│   │   └── grading.py
│   ├── storage/
│   │   ├── base.py
│   │   ├── local.py
│   │   └── s3.py
│   └── utils/
│       ├── pdf.py
│       ├── hwpx.py
│       └── excel.py
```

### Frontend
```
frontend/src/
├── app/
│   ├── login/
│   ├── signup/
│   ├── pending/
│   └── (authed)/
│       ├── layout.tsx       # 인증 가드
│       ├── dashboard/
│       ├── settings/
│       ├── exams/
│       │   ├── new/
│       │   └── [examId]/
│       │       ├── rubric/
│       │       ├── classes/
│       │       ├── refine/
│       │       └── grading/
│       └── admin/users/
├── components/
│   ├── ui/
│   ├── rubric/RubricEditor.tsx
│   ├── refine/ClusterCard.tsx
│   └── upload/
├── lib/
│   ├── api/
│   ├── hooks/
│   │   ├── useAutosave.ts
│   │   └── usePolling.ts
│   └── types.ts
└── store/auth.ts
```

---

## 7. 구현 우선순위

1. Auth + Admin 승인 + API 키 저장
2. Exam/Question CRUD + 기준표 파일 → Gemini 추출
3. Rubric 편집기 + 자동저장
4. Class PDF 업로드 → OCR → 답안 저장 + Excel
5. **Refinement 클러스터링** (핵심)
6. Auto grading
7. Admin 페이지

---

## 8. 비기능 요구사항

- Gemini 호출: 교사 개인 API 키 사용, 서버는 중계만
- API 키: 로그/응답에 절대 평문 노출 없음
- DB: Alembic 마이그레이션, SQLite → PostgreSQL 전환 가능
- 동시성: 세션 ID로 정제 작업 격리
- 자동저장: 1초 debounce, 오프라인에도 로컬 임시 보존
