import { useCallback, useEffect, useMemo, useState } from 'react'
import { addCartItem, fetchCart, removeCartItem, updateCartItem } from '../services/cartService'
import { CartContext } from './cartContext'
import useAuth from './useAuth'

const EMPTY_CART = { id: null, items: [], total_items: 0, subtotal: '0.00', notices: [] }

/**
 * Holds the logged-in user's cart. The cart itself is stored on the server,
 * so it is the same after logout/login, on another tab, or another device.
 */
export default function CartProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // Remember whose cart this is, so a logged-out user (or a different user) never sees it.
  const [stored, setStored] = useState({ owner: null, cart: EMPTY_CART })
  const cart = userId !== null && stored.owner === userId ? stored.cart : EMPTY_CART

  // Replace the cart (used after the user changes it — old notices no longer apply).
  const setCart = useCallback((data) => setStored({ owner: userId, cart: data }), [userId])

  // Store a freshly fetched cart. Stock notices are only reported once by the server,
  // so keep earlier notices instead of letting a second fetch wipe them out.
  const storeFetchedCart = useCallback(
    (data) =>
      setStored((prev) => {
        const previous = prev.owner === userId ? prev.cart.notices : []
        const notices = [...new Set([...previous, ...data.notices])]
        return { owner: userId, cart: { ...data, notices } }
      }),
    [userId],
  )

  // Called when the user leaves the cart/checkout page — notices have been seen.
  const clearNotices = useCallback(
    () =>
      setStored((prev) =>
        prev.cart.notices.length ? { ...prev, cart: { ...prev.cart, notices: [] } } : prev,
      ),
    [],
  )

  const refreshCart = useCallback(async () => {
    const data = await fetchCart()
    storeFetchedCart(data)
    return data
  }, [storeFetchedCart])

  // Load the cart whenever a user logs in.
  useEffect(() => {
    if (userId === null) return undefined
    let cancelled = false
    fetchCart()
      .then((data) => {
        if (!cancelled) storeFetchedCart(data)
      })
      .catch(() => {}) // pages that need the cart show their own errors
    return () => {
      cancelled = true
    }
  }, [userId, storeFetchedCart])

  const addToCart = useCallback(
    async (productId, quantity = 1) => {
      const data = await addCartItem(productId, quantity)
      setCart(data)
      return data
    },
    [setCart],
  )

  const updateQuantity = useCallback(
    async (itemId, quantity) => {
      const data = await updateCartItem(itemId, quantity)
      setCart(data)
      return data
    },
    [setCart],
  )

  const removeItem = useCallback(
    async (itemId) => {
      const data = await removeCartItem(itemId)
      setCart(data)
      return data
    },
    [setCart],
  )

  const value = useMemo(
    () => ({
      cart,
      itemCount: cart.total_items,
      refreshCart,
      setCart, // used by checkout when the server returns an updated cart
      clearNotices,
      addToCart,
      updateQuantity,
      removeItem,
    }),
    [cart, refreshCart, setCart, clearNotices, addToCart, updateQuantity, removeItem],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
