import { useApi } from "../../api.ts";
import type { NewsPage } from "../../api-types.ts";
import { Empty, PageData } from "../../components/states.tsx";
import { useTitle } from "../../site.tsx";
import { NewsCardLink } from "./parts.tsx";
import "../../styles/public.css";

export function NewsList(_props: { id?: string }) {
  useTitle("Новости");
  return (
    <PageData loaded={useApi<NewsPage>("/api/news")}>
      {(news) => (
        <section className="wrap section">
          <div className="sec-h">
            <h1>Новости</h1>
          </div>
          {news.length === 0 ? (
            <Empty>Новостей пока нет</Empty>
          ) : (
            <div className="ncards">
              {news.map((n) => (
                <NewsCardLink key={n.id} n={n} h="h2" />
              ))}
            </div>
          )}
        </section>
      )}
    </PageData>
  );
}
