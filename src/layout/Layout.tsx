import type { ReactNode } from "react";
import { api } from "../api.ts";
import { Link, navigate, useLocation } from "../router.tsx";
import { useSite } from "../site.tsx";
import { Icon, Shield } from "./icons.tsx";

// Page frames. Every frame has the top bar with the test-site note and the footer.
//   PublicLayout — header with the site menu
//   AdminLayout  — header with the organizer menu
//   BareLayout   — no header: judge screens and the protocol

export const TEST_NOTE = "Тестовый сайт. Данные — образцы";

function TopBar() {
  const { site } = useSite();
  const user = site?.user;
  return (
    <div className="top">
      <div className="wrap">
        <span>{TEST_NOTE}</span>
        <span className="sp">
          {user?.role === "organizer" && <Link to="/admin/tournaments">Работа организатора</Link>}
          {user?.role === "judge" && <Link to="/judge">Мои матчи</Link>}
          <a href="#contacts">Контакты</a>
        </span>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Ленинградская областная федерация тенниса — на главную">
      <Shield />
      <span>
        <span className="t1">ЛЕНИНГРАДСКАЯ ОБЛАСТНАЯ</span>
        <br />
        <span className="t2">ФЕДЕРАЦИЯ ТЕННИСА</span>
      </span>
    </Link>
  );
}

const SITE_MENU = [
  { to: "/tournaments", label: "Турниры", icon: "i-cup", match: ["/tournaments"] },
  { to: "/rating", label: "Рейтинг", icon: "i-rating", match: ["/rating", "/players"] },
  { to: "/live", label: "Онлайн-счёт", icon: "i-live", match: ["/live"] },
  { to: "/news", label: "Новости", icon: "i-news", match: ["/news"] },
] as const;

const ADMIN_MENU = [
  { to: "/admin/tournaments", label: "Турниры", match: ["/admin/tournaments", "/admin/divisions", "/admin/matches"] },
  { to: "/admin/players", label: "Игроки", match: ["/admin/players"] },
  { to: "/admin/judges", label: "Судьи", match: ["/admin/judges"] },
  { to: "/admin/news", label: "Новости", match: ["/admin/news"] },
  { to: "/admin/groups", label: "Группы", match: ["/admin/groups"] },
  { to: "/admin/contacts", label: "Контакты", match: ["/admin/contacts"] },
  { to: "/live", label: "Онлайн-счёт", match: [] },
];

const current = (path: string, prefixes: readonly string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`)) ? "page" : undefined;

function Footer() {
  const { site } = useSite();
  const c = site?.contacts;
  return (
    <footer className="site-foot" id="contacts">
      <div className="wrap">
        <div className="fgrid">
          <div>
            <div className="fb">
              <Shield />
              <span>
                <span className="t1">ЛЕНИНГРАДСКАЯ ОБЛАСТНАЯ</span>
                <br />
                <span className="t2">ФЕДЕРАЦИЯ ТЕННИСА</span>
              </span>
            </div>
            <p className="report">Нашли ошибку в счёте или имени? Напишите нам</p>
            <dl className="fadr">
              {c?.address && (
                <div>
                  <dt>Адрес</dt>
                  <dd>{c.address}</dd>
                </div>
              )}
              {c?.phone && (
                <div>
                  <dt>Телефон</dt>
                  <dd>
                    <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}>{c.phone}</a>
                  </dd>
                </div>
              )}
              {c?.email && (
                <div>
                  <dt>Почта</dt>
                  <dd>
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <nav aria-label="Разделы сайта">
            <h2>Разделы</h2>
            <ul>
              {SITE_MENU.map((m) => (
                <li key={m.to}>
                  <Link to={m.to}>{m.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="fbot">
          <span>© Ленинградская областная федерация тенниса</span>
          <span>{TEST_NOTE}</span>
          <span className="sp">
            <Link to="/login">Вход для сотрудников</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}

function Frame({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">
        К содержанию
      </a>
      <TopBar />
      {header}
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  return (
    <Frame
      header={
        <header className="site-head">
          <div className="wrap head">
            <Brand />
            <nav className="main" aria-label="Меню сайта">
              {SITE_MENU.map((m) => (
                <Link key={m.to} to={m.to} aria-current={current(path, m.match)}>
                  <Icon id={m.icon} />
                  {m.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
      }
    >
      {children}
    </Frame>
  );
}

export async function logout(reload: () => void): Promise<void> {
  try {
    await api("/api/logout", { method: "POST", body: {} });
  } catch {
    // Signed out on the server or not: the page forgets the user either way.
  }
  reload();
  navigate("/");
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const { path } = useLocation();
  const { reload } = useSite();
  return (
    <Frame
      header={
        <header className="site-head">
          <div className="wrap head">
            <Brand />
            <nav className="main" aria-label="Работа организатора">
              {ADMIN_MENU.map((m) => (
                <Link key={m.to} to={m.to} aria-current={current(path, m.match)}>
                  {m.label}
                </Link>
              ))}
              <Link className="end" to="/">
                Открыть сайт
              </Link>
              <a
                href="/"
                onClick={(e) => {
                  e.preventDefault();
                  void logout(reload);
                }}
              >
                Выйти
              </a>
            </nav>
          </div>
        </header>
      }
    >
      {children}
    </Frame>
  );
}

export function BareLayout({ children }: { children: ReactNode }) {
  return <Frame>{children}</Frame>;
}
