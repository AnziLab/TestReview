'use client'

import { useMemo } from 'react'
import katex from 'katex'

/**
 * 텍스트에서 `$...$`(인라인) 또는 `$$...$$`(디스플레이) 구간을 KaTeX로 렌더링하고,
 * 그 외는 그대로 표시. 잘못된 LaTeX는 원문 그대로 노출하고 빨간색으로 표시.
 *
 * 사용 예:
 *   <MathText text="x = $\\frac{a}{b}$ 입니다." />
 */
export function MathText({
  text,
  className,
  block = false,
}: {
  text: string | null | undefined
  className?: string
  block?: boolean  // true면 div, false면 span으로 감싸기
}) {
  const segments = useMemo(() => parseSegments(text ?? ''), [text])
  const Wrapper = block ? 'div' : 'span'

  return (
    <Wrapper className={className}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') return <span key={idx}>{seg.value}</span>
        // 수식 렌더링
        try {
          const html = katex.renderToString(seg.value, {
            displayMode: seg.display,
            throwOnError: false,
            output: 'html',
            strict: false,
          })
          return (
            <span
              key={idx}
              className={seg.display ? 'block my-1' : 'inline-block'}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )
        } catch {
          // KaTeX 자체가 던지는 경우는 거의 없지만 방어
          return (
            <span key={idx} className="text-rose-600 font-mono text-xs">
              {seg.display ? `$$${seg.value}$$` : `$${seg.value}$`}
            </span>
          )
        }
      })}
    </Wrapper>
  )
}

type Segment =
  | { type: 'text'; value: string }
  | { type: 'math'; display: boolean; value: string }

/**
 * 텍스트를 일반/수식 구간으로 쪼갠다.
 * `$$...$$` 우선 처리, 그다음 `$...$`. 짝이 맞지 않으면 그냥 텍스트 취급.
 * `\$`(이스케이프된 달러)는 일반 문자.
 */
function parseSegments(text: string): Segment[] {
  const out: Segment[] = []
  let i = 0
  let buf = ''
  const flushText = () => {
    if (buf) {
      out.push({ type: 'text', value: buf })
      buf = ''
    }
  }

  while (i < text.length) {
    const c = text[i]
    // 이스케이프된 $
    if (c === '\\' && text[i + 1] === '$') {
      buf += '$'
      i += 2
      continue
    }
    if (c === '$') {
      // $$...$$ ?
      if (text[i + 1] === '$') {
        const end = text.indexOf('$$', i + 2)
        if (end !== -1) {
          flushText()
          out.push({ type: 'math', display: true, value: text.slice(i + 2, end) })
          i = end + 2
          continue
        }
      } else {
        // $...$
        const end = findInlineDollarEnd(text, i + 1)
        if (end !== -1) {
          flushText()
          out.push({ type: 'math', display: false, value: text.slice(i + 1, end) })
          i = end + 1
          continue
        }
      }
    }
    buf += c
    i++
  }
  flushText()
  return out
}

function findInlineDollarEnd(text: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === '\\' && text[j + 1] === '$') {
      j++
      continue
    }
    if (text[j] === '$') return j
  }
  return -1
}
