import api from './api'

export async function registerUser(payload) {
  const { data } = await api.post('/auth/register/', payload)
  return data // { user, access, refresh }
}

export async function loginUser(username, password) {
  const { data } = await api.post('/auth/login/', { username, password })
  return data // { user, access, refresh }
}

export async function logoutUser(refresh) {
  await api.post('/auth/logout/', { refresh })
}

export async function fetchCurrentUser() {
  const { data } = await api.get('/auth/me/')
  return data
}
