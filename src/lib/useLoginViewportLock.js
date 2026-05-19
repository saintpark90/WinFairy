import { useEffect } from 'react'

function applyLoginViewportVars() {
  const root = document.documentElement
  const viewportHeight = window.innerHeight
  const viewportWidth = window.innerWidth
  const frameHeight = Math.min(
    viewportHeight * 0.94,
    (viewportWidth - 32) * (16 / 9),
    560 * (16 / 9),
  )
  const frameWidth = Math.min(560, frameHeight * (9 / 16), viewportWidth - 32)

  root.style.setProperty('--login-viewport-height', `${viewportHeight}px`)
  root.style.setProperty('--login-frame-height', `${frameHeight}px`)
  root.style.setProperty('--login-frame-width', `${frameWidth}px`)
}

/**
 * 모바일 키보드가 올라와도 로그인 프레임 크기·위치를 유지합니다.
 * 높이는 최초 진입·화면 회전 시에만 갱신합니다.
 */
export function useLoginViewportLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined

    applyLoginViewportVars()
    document.body.classList.add('login-viewport-locked')
    document.documentElement.classList.add('login-viewport-locked-root')

    const onOrientationChange = () => {
      window.setTimeout(applyLoginViewportVars, 150)
    }

    const preventScroll = () => {
      window.scrollTo(0, 0)
    }

    window.addEventListener('orientationchange', onOrientationChange)
    window.addEventListener('scroll', preventScroll, { passive: true })
    window.visualViewport?.addEventListener('scroll', preventScroll, { passive: true })

    return () => {
      document.body.classList.remove('login-viewport-locked')
      document.documentElement.classList.remove('login-viewport-locked-root')
      window.removeEventListener('orientationchange', onOrientationChange)
      window.removeEventListener('scroll', preventScroll)
      window.visualViewport?.removeEventListener('scroll', preventScroll)

      const root = document.documentElement
      root.style.removeProperty('--login-viewport-height')
      root.style.removeProperty('--login-frame-height')
      root.style.removeProperty('--login-frame-width')
    }
  }, [enabled])
}

export function resetLoginScroll() {
  window.scrollTo(0, 0)
}
