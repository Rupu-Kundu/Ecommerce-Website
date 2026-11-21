import { Route, Routes } from 'react-router-dom'
import Layout from '../components/Layout'
import AdminCategoriesPage from '../pages/admin/AdminCategoriesPage'
import AdminLayout from '../pages/admin/AdminLayout'
import AdminOrdersPage from '../pages/admin/AdminOrdersPage'
import AdminOverviewPage from '../pages/admin/AdminOverviewPage'
import AdminProductsPage from '../pages/admin/AdminProductsPage'
import AdminSupportPage from '../pages/admin/AdminSupportPage'
import CartPage from '../pages/CartPage'
import CheckoutPage from '../pages/CheckoutPage'
import HelpPage from '../pages/HelpPage'
import HomePage from '../pages/HomePage'
import LoginPage from '../pages/LoginPage'
import NotFoundPage from '../pages/NotFoundPage'
import OrderDetailPage from '../pages/OrderDetailPage'
import OrdersPage from '../pages/OrdersPage'
import PaymentCancelPage from '../pages/PaymentCancelPage'
import PaymentDemoPage from '../pages/PaymentDemoPage'
import PaymentSuccessPage from '../pages/PaymentSuccessPage'
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
          <Route path="payment/demo" element={<PaymentDemoPage />} />
          <Route path="payment/success" element={<PaymentSuccessPage />} />
          {/* bKash / Nagad send the customer back here */}
          <Route path="payment/success/:method" element={<PaymentSuccessPage />} />
          <Route path="payment/cancel" element={<PaymentCancelPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
        </Route>

        {/* Admins only (customers are sent home, guests to /login) */}
        <Route element={<ProtectedRoute adminOnly />}>
          <Route path="admin-dashboard" element={<AdminLayout />}>
            <Route index element={<AdminOverviewPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="categories" element={<AdminCategoriesPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="chat" element={<AdminSupportPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
