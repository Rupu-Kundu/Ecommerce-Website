import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Loader from '../components/Loader'
import Layout from '../components/Layout'
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

// The admin dashboard is only for admins, so its code is downloaded separately, on first visit.
const AdminLayout = lazy(() => import('../pages/admin/AdminLayout'))
const AdminOverviewPage = lazy(() => import('../pages/admin/AdminOverviewPage'))
const AdminProductsPage = lazy(() => import('../pages/admin/AdminProductsPage'))
const AdminCategoriesPage = lazy(() => import('../pages/admin/AdminCategoriesPage'))
const AdminOrdersPage = lazy(() => import('../pages/admin/AdminOrdersPage'))
const AdminSupportPage = lazy(() => import('../pages/admin/AdminSupportPage'))
const AdminCustomersPage = lazy(() => import('../pages/admin/AdminCustomersPage'))
const AdminCustomerDetailPage = lazy(() => import('../pages/admin/AdminCustomerDetailPage'))

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

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Admin dashboard: its own full-screen shell (sidebar + top bar), no store navbar/footer.
          Admins only — customers are sent home, guests to /login. */}
      <Route element={<ProtectedRoute adminOnly />}>
        <Route path="admin-dashboard" element={<Suspense fallback={<Loader label="Loading admin…" />}><AdminLayout /></Suspense>}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="customers" element={<AdminCustomersPage />} />
          <Route path="customers/:id" element={<AdminCustomerDetailPage />} />
          <Route path="chat" element={<AdminSupportPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
