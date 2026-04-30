"""Centralized Gemini prompt registry.

각 프롬프트는 `{변수}` 자리표시자를 가진 템플릿 문자열입니다.
사용자별 오버라이드(User 모델의 *_prompt_override 컬럼)가 있으면 그것을, 없으면 기본값을 사용합니다.

JSON 예시 등에서 중괄호를 그대로 표시하려면 `{{` `}}`로 이스케이프해야 합니다.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from string import Formatter
from typing import Optional

logger = logging.getLogger(__name__)


# ───────────────── 1. OCR (학생 답안 추출) ─────────────────
OCR_DEFAULT = """이 시험 답안지 이미지에서 학생 답안을 추출해줘.

이 시험의 문항 번호 목록 (정확히 이 번호를 사용할 것):
{q_list}

출력 형식:
{{
  "answers": [
    {{"question_number": "1-1)", "answer_text": "답안"}},
    {{"question_number": "1-2)", "answer_text": "답안"}}
  ]
}}

규칙:
- question_number는 반드시 위 목록에 있는 번호 그대로 사용
- 답안지의 각 칸을 문항 번호 순서대로 읽어서 매핑
- 답안이 없거나 빈칸이면 빈 문자열 ""
- **취소선이 그어진 글자는 무시할 것**. 학생이 답을 고치며 글자 위에 줄을 그어 지운 경우(한 줄/두 줄/여러 줄 가로선, 사선, 지그재그 포함), 그 글자는 답안에 포함하지 않음. 옆이나 아래에 새로 쓴 답안만 추출.
- 학생 정보(학번/이름)는 추출하지 않음
- 손글씨가 불분명해도 최선을 다해 해독
- 모든 문항을 빠짐없이 포함 (빈칸도 포함)
- **수식·수학 기호는 LaTeX로 출력**. 인라인은 `$...$`, 디스플레이는 `$$...$$`로 감싸기.
  - 예: 제곱 → `$x^2$`, 분수 → `$\\frac{{a}}{{b}}$`, 제곱근 → `$\\sqrt{{x}}$`, 적분 → `$\\int_0^1 x\\,dx$`, 행렬 → `$$\\begin{{pmatrix}}a&b\\\\c&d\\end{{pmatrix}}$$`
  - 학생이 컴퓨터식 표기(`x^2`, `sqrt(x)`, `(a+b)/(c-d)`)로 썼더라도 LaTeX로 변환
  - 일반 텍스트(국어, 영어 단어 등)는 LaTeX로 감싸지 말 것
- JSON만 반환, 다른 설명 없음"""


# ───────────────── 2. 채점 ─────────────────
GRADING_DEFAULT = """아래는 한 문항의 정보와 채점할 학생 답안 목록입니다.

{question_text_section}## 모범답안
{model_answer}

## 채점기준 (배점: {max_score}점)
{rubric_json}

## 학생 답안 목록
{answers_json}

각 답안을 채점해줘.

채점 원칙:
1. **내용 정확성 우선**: 문법이 맞아도 내용이 틀리면 오답. 모범답안의 의미/조건을 충족해야 정답.
2. 모범답안과 내용상 동등한 표현은 정답으로 인정.
3. 채점기준에 감점 조건이 있으면 그에 따라 감점.
4. 빈칸, "모르겠다", "모름" 등 무응답은 0점.
{extra_section}
출력 형식:
{{
  "results": [
    {{
      "answer_id": 1,
      "score": 2.0,
      "matched_criteria_ids": ["criteria_0"],
      "rationale": "채점 근거 (내용 정확성과 감점 이유 명시)"
    }}
  ]
}}

주의사항:
- 모든 답안에 대해 결과를 반환
- score는 0 이상 {max_score} 이하
- rationale은 한국어로, 내용이 맞는지 틀린지를 명확히 설명
- rationale에 수식·수학 기호가 들어가면 LaTeX(`$...$`, `$$...$$`)로 표기
"""


# ───────────────── 3. 클러스터링 (채점기준 정제) ─────────────────
CLUSTERING_DEFAULT = """아래는 한 문항의 정보와 학생 답안 목록입니다.

{question_text_section}## 모범답안
{model_answer}

## 채점기준 (배점: {max_score}점)
{rubric_json}

## 학생 답안 목록
{answers_json}

위 학생 답안들을 유사한 유형으로 클러스터링하고,
각 클러스터에 대해 현재 채점기준으로 점수 판단이 가능한지 분류해줘.

채점 원칙:
- 모범답안과 동일하거나 내용상 동등한 답안은 정답 처리
- 문장형 답안은 핵심 의미가 맞으면 정답으로 인정
- 채점기준이 "정답만 인정"이라도 모범답안을 기준으로 내용의 정확성을 판단할 것
- 채점기준에 명시되지 않은 유형(부분 정답, 다른 표현의 정답 등)은 judgable=false로 표시
- 빈칸, "모르겠다", "모름", "?" 등 무응답/포기 답안은 채점기준과 무관하게 0점 처리 (judgable=true, suggested_score=0)
{extra_section}
출력 형식:
{{
  "clusters": [
    {{
      "label": "클러스터 레이블 (핵심 특징 요약)",
      "representative_text": "대표 답안 텍스트",
      "member_ids": [1, 2, 3],
      "judgable": true,
      "suggested_score": 2.0,
      "reason": "판단 근거 또는 판단 불가 이유"
    }}
  ]
}}

주의사항:
- member_ids는 제공된 답안의 id 값
- judgable=true: 모범답안 기준으로 명확히 점수 판단 가능
- judgable=false: 채점기준으로 처리되지 않는 새로운 유형이거나 부분 정답
- suggested_score는 0 이상 {max_score} 이하
- 모든 답안이 정확히 하나의 클러스터에 속해야 함
- label/representative_text/reason에 수식이 들어가면 LaTeX(`$...$`)로 표기
"""


# ───────────────── 4. 채점기준 추출 (기존 표/문서 → 구조화) ─────────────────
RUBRIC_EXTRACT_DEFAULT = """이 문서는 한국 학교 시험의 서답형 채점기준표입니다.

표의 컬럼 구조는 다음과 같습니다:
- 첫 번째 컬럼: 번호 (문항 번호)
- 두 번째 컬럼: 정답 또는 인정답 (모범답안)
- 세 번째 컬럼: 채점기준 (감점 조건, 부분점수 기준 등)
- 네 번째/다섯 번째 컬럼: 배점

각 문항을 아래 규칙에 따라 추출하세요:

1. 하위 문항 처리: 하나의 번호 아래 "(1)", "1)", "①" 등으로 구분된 항목은 각각 별도 문항으로 추출
   예) 번호 1의 1), 2) → number를 "1-1)", "1-2)"로 표기
   예) 번호 3의 1), 2) → "3-1)", "3-2)"로 표기

2. model_answer: 반드시 해당 하위 문항의 정답만 기재. 다른 번호의 정답 혼입 금지.

3. criteria: 해당 하위 문항의 채점기준만 기재. 감점 조건, 부분점수 기준 등을 포함.
   배점 숫자(단독)는 criteria로 쓰지 말 것.

4. max_score: 해당 하위 문항의 요소별 배점(각 항목 점수)을 사용.
   전체 배점(합계)이 아닌 각 하위 문항의 배점을 쓸 것.

5. question_text: 이 표에는 문제 내용이 없으므로 빈 문자열("")로 설정."""


# ───────────────── 5. 채점기준 자동생성 (시험지 → 채점기준 초안) ─────────────────
RUBRIC_GENERATE_DEFAULT = """이 문서는 {context} 시험지입니다.

{question_from}번부터 {question_to}번 문항에 대한 채점기준표 초안을 작성해주세요.
하위 문항(예: 3-(1), 3-(2))도 각각 별도 항목으로 추출하세요.

각 문항마다 아래 정보를 생성하세요:
- number: 문항 번호 ("1", "2-1", "3-(1)" 등 원문 그대로)
- question_text: 해당 문항을 이해하는 데 필요한 지문+질문 전체
- max_score: 배점 (시험지에 표시된 경우 그대로, 없으면 합리적으로 추정)
- model_answer: 모범 답안 (정확하고 완전한 답)
- criteria: 세부 채점 기준 목록. 각 항목은 description(기준 설명)과 points(점수) 포함

채점 기준 작성 지침:
- 부분 점수 가능한 경우 항목을 나눠서 작성
- 오탈자/문법 감점 기준도 포함 (해당되는 경우)
- 인정답이 있으면 criteria에 명시

JSON 형식으로만 응답:
{{
  "questions": [
    {{
      "number": "1",
      "question_text": "지문 및 질문 텍스트",
      "max_score": 4,
      "model_answer": "모범 답안",
      "criteria": [
        {{"description": "핵심 내용 포함", "points": 2}},
        {{"description": "문법/철자 정확", "points": 2}}
      ]
    }}
  ]
}}"""


# ───────────────── 6. 시험지 본문 추출 (지문+질문) ─────────────────
EXAM_PAPER_EXTRACT_DEFAULT = """이 문서는 한국 학교 시험지입니다.

{question_from}번부터 {question_to}번 문항의 내용을 추출하세요.

규칙:
- 각 문항 번호(1, 2, 3 ... {question_to})마다 그 문항에 필요한 모든 텍스트를 추출
- 지문(reading passage)이 있으면 지문 전체를 해당 문항 텍스트에 포함
- 하위 문항(예: 3-(1), 3-(2))은 상위 문항(3번)과 같은 지문을 공유하므로,
  상위 문항 번호(정수)를 키로 지문+질문 전체를 저장
- 지문이 여러 문항에 걸쳐 있으면 각 문항에 중복 저장해도 됨

출력 형식 (JSON):
{{
  "questions": [
    {{
      "number": 1,
      "text": "문항 1의 지문 및 질문 전체 텍스트"
    }},
    {{
      "number": 2,
      "text": "문항 2의 지문 및 질문 전체 텍스트"
    }}
  ]
}}

- number는 정수 (1, 2, 3 ...)
- text에는 해당 문항을 이해하는 데 필요한 모든 내용 포함 (지문, 보기, 질문 지시문 등)
- {question_from}번 미만 또는 {question_to}번 초과 문항은 무시
- JSON만 반환, 다른 설명 없음"""


# ───────────────── Registry ─────────────────


@dataclass(frozen=True)
class PromptDef:
    key: str
    label: str
    description: str
    default: str
    placeholders: tuple[str, ...]  # 사용 가능한 변수 목록 (필수 = 모두)
    override_field: str  # User 모델의 컬럼명


PROMPTS: dict[str, PromptDef] = {
    "ocr": PromptDef(
        key="ocr",
        label="답안 OCR",
        description="시험 답안지 이미지에서 학생 답안을 추출할 때 사용합니다.",
        default=OCR_DEFAULT,
        placeholders=("q_list",),
        override_field="ocr_prompt_override",
    ),
    "grading": PromptDef(
        key="grading",
        label="채점",
        description="학생 답안을 자동 채점할 때 사용합니다. (모든 문항)",
        default=GRADING_DEFAULT,
        placeholders=(
            "question_text_section",
            "model_answer",
            "max_score",
            "rubric_json",
            "answers_json",
            "extra_section",
        ),
        override_field="grading_prompt_override",
    ),
    "clustering": PromptDef(
        key="clustering",
        label="채점기준 정제 (클러스터링)",
        description="유사 답안을 묶어 채점기준 보완점을 찾을 때 사용합니다.",
        default=CLUSTERING_DEFAULT,
        placeholders=(
            "question_text_section",
            "model_answer",
            "max_score",
            "rubric_json",
            "answers_json",
            "extra_section",
        ),
        override_field="clustering_prompt_override",
    ),
    "rubric_extract": PromptDef(
        key="rubric_extract",
        label="채점기준표 추출",
        description="기존 채점기준 표/PDF에서 구조화된 데이터를 추출할 때 사용합니다.",
        default=RUBRIC_EXTRACT_DEFAULT,
        placeholders=(),
        override_field="rubric_extract_prompt_override",
    ),
    "rubric_generate": PromptDef(
        key="rubric_generate",
        label="채점기준 자동생성",
        description="시험지에서 채점기준 초안을 자동 생성할 때 사용합니다.",
        default=RUBRIC_GENERATE_DEFAULT,
        placeholders=("context", "question_from", "question_to"),
        override_field="rubric_generate_prompt_override",
    ),
    "exam_paper_extract": PromptDef(
        key="exam_paper_extract",
        label="시험지 본문 추출",
        description="시험지 PDF에서 각 문항의 지문/질문 텍스트를 추출할 때 사용합니다.",
        default=EXAM_PAPER_EXTRACT_DEFAULT,
        placeholders=("question_from", "question_to"),
        override_field="exam_paper_extract_prompt_override",
    ),
}


# ───────────────── Helpers ─────────────────


def select_template(override: Optional[str], default: str) -> str:
    """오버라이드가 비어있지 않으면 사용, 아니면 default."""
    if override and override.strip():
        return override
    return default


def render(template: str, fallback: str, **kwargs) -> str:
    """`template.format_map(kwargs)`. 실패 시 `fallback`으로 재시도."""
    try:
        return template.format_map(kwargs)
    except (KeyError, IndexError, ValueError) as e:
        logger.warning(
            "Prompt template invalid (%s), falling back to default", e
        )
        return fallback.format_map(kwargs)


def extract_placeholders(template: str) -> set[str]:
    """템플릿에 등장하는 `{var}` 이름들의 집합."""
    return {name for _, name, _, _ in Formatter().parse(template) if name}


def validate_template(key: str, template: str) -> Optional[str]:
    """사용자 입력 검증. OK면 None, 문제 있으면 에러 메시지."""
    pdef = PROMPTS.get(key)
    if not pdef:
        return f"알 수 없는 프롬프트 키: {key}"
    if not template or not template.strip():
        return "템플릿이 비어있습니다."

    actual = extract_placeholders(template)
    allowed = set(pdef.placeholders)

    unknown = actual - allowed
    if unknown:
        return (
            f"허용되지 않은 변수: {{{', '.join(sorted(unknown))}}}. "
            f"사용 가능한 변수: {{{', '.join(allowed) or '없음'}}}"
        )

    missing = allowed - actual
    if missing:
        return (
            f"필수 변수 누락: {{{', '.join(sorted(missing))}}}. "
            f"각 변수는 한 번 이상 등장해야 합니다."
        )

    try:
        sample = {p: "" for p in pdef.placeholders}
        template.format_map(sample)
    except Exception as e:
        return f"템플릿 형식 오류: {e}"

    return None
