import { Route, Routes } from 'react-router-dom'
import Layout from '../components/Layout'
import HomePage from '../pages/HomePage'
import LoginPage from '../pages/LoginPage'
import NotFoundPage from '../pages/NotFoundPage'
import ProductDetailsPage from '../pages/ProductDetailsPage'
import ProductListPage from '../pages/ProductListPage'
import RegisterPage from '../pages/RegisterPage'
import GuestRoute from './GuestRoute'

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public pages */}
        <Route index element={<HomePage />} />
        <Route path="products" element={<ProductListPage />} />
        <Route path="products/:id" element={<ProductDetailsPage />} />

        {/* Guest-only pages (logged-in users are redirected) */}
        <Route element={<GuestRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>

        {/*
          Protected pages are added on Day 2 by wrapping them in ProtectedRoute:
            <Route element={<ProtectedRoute />}>            cart, checkout, orders
            <Route element={<ProtectedRoute adminOnly />}>  admin dashboard
        */}

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
