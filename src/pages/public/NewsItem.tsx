import { useApi } from "../../api.ts";
import type { NewsItem } from "../../api-types.ts";
import { PageData } from "../../components/states.tsx";
import { dayFull } from "../../format.ts";
import { Link } from "../../router.tsx";
import { useTitle } from "../../site.tsx";
import "../../styles/public.css";

export function NewsItemPage({ id }: { id?: string }) {
  return (
    <PageData loaded={useApi<NewsItem>(`/api/news/${encodeURIComponent(id ?? "")}`)}>
      {(item) => <NewsView item={item} />}
    </PageData>
  );
}

function NewsView({ item }: { item: NewsItem }) {
  useTitle(item.title);
  // Plain text: paragraphs are separated by a blank line.
  const paragraphs = item.body
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <article className="wrap section news-item">
      <p className="dt num">{dayFull(item.date)}</p>
      <h1>{item.title}</h1>
      <div className="news-body">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <Link className="go" to="/news">
        Все новости
      </Link>
    </article>
  );
}
