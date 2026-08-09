import { AppProviders } from "./providers";
import { AuthProvider } from "../lib/auth";
import { AppRouter } from "./router";

export function App() {
  return (
    <AppProviders>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </AppProviders>
  );
}
