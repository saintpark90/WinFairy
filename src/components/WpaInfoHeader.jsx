import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function WpaInfoBubbleContent() {
  return (
    <>
      <p className="top5-info-tip-lead">
        WPA(Win Probability Added)는 직관한 경기에서 해당 선수가 승리 확률에 얼마나
        기여했는지 나타내는 지표입니다.
      </p>

      <p className="top5-info-tip-section-title">표에 표시되는 합산 WPA</p>
      <p className="top5-info-tip-formula">선수 WPA = Σ (직관 경기별 WPA)</p>
      <p className="top5-info-tip-note">
        직관한 경기마다 선수별 WPA를 구한 뒤, 소수 첫째 자리까지 합산합니다.
      </p>

      <p className="top5-info-tip-section-title">경기별 WPA (1순위 · API)</p>
      <p className="top5-info-tip-note">
        KBO 키플레이어 API의 경기 단위 값{' '}
        <code className="top5-info-tip-code">GAME_WPA_RT</code>를 우선 사용합니다.
      </p>

      <p className="top5-info-tip-section-title">경기별 WPA (2순위 · 타자 추정)</p>
      <p className="top5-info-tip-formula">
        max(0, 1루×1.1 + 2루×2.2 + 3루×3.3 + HR×4.4 + BB×0.9 + RBI×1.4 + R×1.3 −
        아웃×0.35)
      </p>
      <p className="top5-info-tip-note">
        1루타 = 안타 − 2루타 − 3루타 − 홈런, 아웃 = 타수 − 안타
      </p>

      <p className="top5-info-tip-section-title">경기별 WPA (2순위 · 투수 추정)</p>
      <p className="top5-info-tip-formula">
        max(0, 아웃×0.55 + SO×0.45 − ER×1.8 − 피안타×0.35 − BB×0.4 + 승 2.5 + SV 2 +
        HD 1.2)
      </p>
      <p className="top5-info-tip-note">
        승·세이브·홀드 보너스는 해당 기록이 있을 때만 더합니다. API 값이 없을 때만
        추정식을 사용합니다.
      </p>
    </>
  )
}

function WpaInfoHeader() {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [coords, setCoords] = useState(null)
  const tipRef = useRef(null)
  const bubbleRef = useRef(null)
  const hoverCloseTimerRef = useRef(null)
  const bubbleId = useId()

  const visible = open || hovered

  const updateCoords = useCallback(() => {
    const trigger = tipRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const bubbleHeight = bubbleRef.current?.offsetHeight ?? 360
    const spaceBelow = window.innerHeight - rect.bottom
    const placeAbove = spaceBelow < bubbleHeight + 12 && rect.top > bubbleHeight + 12

    setCoords({
      left: rect.left + rect.width / 2,
      top: placeAbove ? rect.top - 8 : rect.bottom + 8,
      placeAbove,
    })
  }, [])

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current)
      hoverCloseTimerRef.current = null
    }
  }, [])

  const scheduleHoverClose = useCallback(() => {
    clearHoverCloseTimer()
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setHovered(false)
    }, 120)
  }, [clearHoverCloseTimer])

  useLayoutEffect(() => {
    if (!visible) {
      setCoords(null)
      return undefined
    }

    updateCoords()
    const frame = window.requestAnimationFrame(() => {
      updateCoords()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [visible, updateCoords])

  useEffect(() => {
    if (!visible) return undefined

    updateCoords()

    const handleScrollOrResize = () => {
      updateCoords()
    }

    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [visible, updateCoords])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (
        !tipRef.current?.contains(event.target) &&
        !bubbleRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => () => clearHoverCloseTimer(), [clearHoverCloseTimer])

  const toggleOpen = () => {
    setOpen((prev) => !prev)
  }

  const bubblePortal =
    visible && coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={bubbleRef}
            id={bubbleId}
            className={`top5-info-tip-bubble top5-info-tip-bubble--portal${
              coords.placeAbove ? ' top5-info-tip-bubble--above' : ''
            }`}
            role="tooltip"
            style={{
              top: coords.top,
              left: coords.left,
            }}
            onMouseEnter={() => {
              clearHoverCloseTimer()
              setHovered(true)
            }}
            onMouseLeave={() => {
              if (!open) scheduleHoverClose()
            }}
          >
            <WpaInfoBubbleContent />
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <span className="top5-header-with-tip">
        WPA
        <span
          ref={tipRef}
          className={`top5-info-tip${open ? ' top5-info-tip--open' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="WPA 안내"
          aria-expanded={visible}
          aria-controls={bubbleId}
          onClick={(event) => {
            event.stopPropagation()
            toggleOpen()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleOpen()
            }
          }}
          onMouseEnter={() => {
            clearHoverCloseTimer()
            setHovered(true)
          }}
          onMouseLeave={() => {
            if (!open) scheduleHoverClose()
          }}
          onFocus={() => {
            clearHoverCloseTimer()
            setHovered(true)
          }}
          onBlur={() => {
            if (!open) setHovered(false)
          }}
        >
          ?
        </span>
      </span>
      {bubblePortal}
    </>
  )
}

export default WpaInfoHeader
