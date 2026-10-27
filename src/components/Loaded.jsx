import { useStore } from "../store.jsx";
import { explain } from "../lib/errors.js";
import { Says } from "./Layout.jsx";

// Shows Pierre while the data loads, or what went wrong, then hands the data to its child.
export default function Loaded({ children }) {
  const { data, status, error, refresh } = useStore();
  if (data) return children(data);
  if (status === "error") {
    return (
      <div className="page-center">
        <Says anim="shrug">{explain(error)}</Says>
        <button type="button" className="btn" onClick={() => refresh()}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <div className="page-center">
      <Says anim="peek">Fetching the reels…</Says>
    </div>
  );
}
