import { useEffect, useRef } from 'react'

function CalendarContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return
      onClose()
    }
    const onScroll = () => onClose()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [onClose])

  useEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const pad = 8
    let left = x
    let top = y
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad)
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad)
    }
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [x, y, items])

  return (
    <div
      ref={menuRef}
      className="calendar-context-menu"
      role="menu"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="calendar-context-menu-item"
          onClick={() => {
            item.onSelect()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default CalendarContextMenu
