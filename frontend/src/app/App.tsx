import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom'
import { LoginPage } from '../features/auth/LoginPage'
import { BoardPage } from '../features/board/BoardPage'
import { HistoryPage } from '../features/history/HistoryPage'
import { TrashPage } from '../features/trash/TrashPage'
import { AppHeader } from './AppHeader'
import { ProtectedRoute } from './ProtectedRoute'
import { Toaster } from './Toaster'

const queryClient = new QueryClient()

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
            <Route path="/historial" element={<HistoryPage />} />
            <Route path="/papelera" element={<TrashPage />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
