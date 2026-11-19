import { Route, Routes } from 'react-router-dom'
import Layout from '../components/Layout'
import CartPage from '../pages/CartPage'
import CheckoutPage from '../pages/CheckoutPage'
import HelpPage from '../pages/HelpPage'
import HomePage from '../pages/HomePage'
import LoginPage from '../pages/LoginPage'
import NotFoundPage from '../pages/NotFoundPage'
import ProductDetailsPage from '../pages/ProductDetailsPage'
import ProductListPage from '../pages/ProductListPage'
import RegisterPage from '../pages/RegisterPage'
import GuestRoute from './GuestRoute'
import ProtectedRoute from './ProtectedRoute'

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* Public pages */}
        <Route index element={<HomePage />} />
        <Route path="products" element={<ProductListPage />} />
        <Route path="products/:id" element={<ProductDetailsPage />} />
        <Route path="help" element={<HelpPage />} />

        {/* Guest-only pages (logged-in users are redirected) */}
        <Route element={<GuestRoute />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>

        {/* Logged-in users only (guests are sent to /login and brought back) */}
        <Route element={<ProtectedRoute />}>
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
