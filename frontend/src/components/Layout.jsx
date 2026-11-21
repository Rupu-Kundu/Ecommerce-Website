import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import ChatWidget from './ChatWidget'
import Footer from './Footer'
import Navbar from './Navbar'

export default function Layout() {
  const { pathname, hash } = useLocation()

  // Start each new page at the top (links in the footer would otherwise keep the scroll position).
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Footer />
      <ChatWidget />
    </div>
  )
}
