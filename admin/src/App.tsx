import { useState } from "react";
import { isLoggedIn } from "./api";
import { LoginPage } from "./LoginPage";
import { AdvisorsPage } from "./AdvisorsPage";

export function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

  return loggedIn ? (
    <AdvisorsPage onLoggedOut={() => setLoggedIn(false)} />
  ) : (
    <LoginPage onLoggedIn={() => setLoggedIn(true)} />
  );
}
