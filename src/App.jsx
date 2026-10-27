import { Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "./store.jsx";
import { Footer, Header, Toast } from "./components/Layout.jsx";
import ModalHost from "./components/ModalHost.jsx";
import { Setup, SignIn } from "./pages/Gate.jsx";
import Home from "./pages/Home.jsx";
import Diary from "./pages/Diary.jsx";
import Watchlist from "./pages/Watchlist.jsx";
import Nights from "./pages/Nights.jsx";
import Jazz from "./pages/Jazz.jsx";
import Us from "./pages/Us.jsx";

export default function App() {
  const { apiUrl, session } = useStore();

  if (!apiUrl) return <Setup />;
  if (!session) return <SignIn />;

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/nights" element={<Nights />} />
          <Route path="/jazz" element={<Jazz />} />
          <Route path="/us" element={<Us />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
      <ModalHost />
      <Toast />
    </>
  );
}
