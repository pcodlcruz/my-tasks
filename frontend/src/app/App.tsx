import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

const queryClient = new QueryClient()

function PlaceholderPage({ title }: { title: string }): JSX.Element {
  return <main>{title}</main>
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PlaceholderPage title="Iniciar sesión" />} />
          <Route path="/" element={<PlaceholderPage title="Tablero" />} />
          <Route path="/historial" element={<PlaceholderPage title="Historial" />} />
          <Route path="/papelera" element={<PlaceholderPage title="Papelera" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
