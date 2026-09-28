import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import { LoginPage } from '../features/auth/LoginPage'
import { BoardPage } from '../features/board/BoardPage'
import { AppHeader } from './AppHeader'
import { ProtectedRoute } from './ProtectedRoute'

const queryClient = new QueryClient()

function PlaceholderPage({ title }: { title: string }): JSX.Element {
  return <main className="mx-auto max-w-7xl px-4 py-6">{title}</main>
}

function ProtectedLayout(): JSX.Element {
  return (
    <ProtectedRoute>
      <AppHeader />
      <Outlet />
    </ProtectedRoute>
  )
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<BoardPage />} />
            <Route path="/historial" element={<PlaceholderPage title="Historial" />} />
            <Route path="/papelera" element={<PlaceholderPage title="Papelera" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
