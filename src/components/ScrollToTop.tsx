import { useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/** Back and forward keep whatever offset the browser restored for that entry. */
export function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()

  useLayoutEffect(() => {
    if (navigationType === 'POP') return
    window.scrollTo(0, 0)
  }, [pathname, navigationType])

  return null
}
