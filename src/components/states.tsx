import { Component, type ReactNode, useEffect } from "react";
import type { Loaded } from "../api.ts";
import { Link, useLocation } from "../router.tsx";
import { useSite, useTitle } from "../site.tsx";

// Page states from the design: "Загружаем…" after 0.5 s, load failure with "Обновить",
// "Такой страницы нет" for unknown addresses and deleted records.

export function NotFound() {
  useTitle("Такой страницы нет");
  return (
    <div className="wrap state">
      <p>Такой страницы нет</p>
      <div className="acts">
        <Link className="btn btn-p" to="/">
          На главную
        </Link>
        <Link className="btn btn-o" to="/tournaments">
          Турниры
        </Link>
      </div>
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="wrap state" role="alert">
      <p>Не удалось загрузить страницу. Проверьте связь</p>
      <div className="acts">
        <button type="button" className="btn btn-p" onClick={onRetry}>
          Обновить
        </button>
      </div>
    </div>
  );
}

/** A staff page got 401: the sign-in ended. Reloading the user sends the page to the login form, which comes back here. */
function Expired() {
  const { reload } = useSite();
  const { path } = useLocation();
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <div className="wrap state" role="alert">
      <p>Вход истёк. Войдите снова</p>
      <div className="acts">
        <Link className="btn btn-p" to={`/login?next=${encodeURIComponent(path)}`}>
          Войти
        </Link>
      </div>
    </div>
  );
}

export function Loading({ show }: { show: boolean }) {
  return <div className="wrap state">{show && <p className="muted">Загружаем…</p>}</div>;
}

/**
 * Renders a loaded page: waiting, failure, not found (404) or the content.
 * Usage: <PageData loaded={useApi<T>(path)}>{(data) => ...}</PageData>
 */
export function PageData<T>({ loaded, children }: { loaded: Loaded<T>; children: (data: T) => ReactNode }) {
  if (loaded.data) return <>{children(loaded.data)}</>;
  if (loaded.error) {
    if (loaded.error.status === 404) return <NotFound />;
    if (loaded.error.status === 401) return <Expired />;
    return <LoadError onRetry={loaded.reload} />;
  }
  return <Loading show={loaded.slow} />;
}

/** Empty list message: an explanation instead of blank space. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** A render error (for example a tab left open across a release) shows the load failure, not a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  render() {
    if (this.state.failed) return <LoadError onRetry={() => window.location.reload()} />;
    return this.props.children;
  }
}
