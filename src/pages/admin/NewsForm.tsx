import { type FormEvent, useState } from "react";
import { api, useApi } from "../../api.ts";
import type { NewsInput, NewsItem } from "../../api-types.ts";
import { DeleteControl, Field, FormFooter, fieldProps, setFlash, useForm, useRequestId } from "../../components/form.tsx";
import { PageData } from "../../components/states.tsx";
import { useSite, useTitle } from "../../site.tsx";
import { Crumb, TextField, go, openCreated, useJustCreated } from "./common.tsx";

// News item: title, date (today by default), text with paragraphs split by a blank line.

type Values = Omit<NewsInput, "requestId">;

export function AdminNewsForm({ id }: { id?: string }) {
  const loaded = useApi<NewsItem>(id ? `/api/admin/news/${id}` : null);
  if (!id) return <NewsPage item={null} />;
  return <PageData loaded={loaded}>{(n) => <NewsPage item={n} />}</PageData>;
}

function NewsPage({ item }: { item: NewsItem | null }) {
  const { site } = useSite();
  const [n, setN] = useState(item);
  const form = useForm<Values>(
    n ? { title: n.title, date: n.date, body: n.body } : { title: "", date: site?.today ?? "", body: "" },
  );
  const created = useJustCreated(form.dirty);
  const requestId = useRequestId();
  useTitle(n ? n.title : "Новая новость");
  const bodyError = form.errors.body;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const out: { saved: NewsItem | null } = { saved: null };
    const ok = await form.submit(async (values) => {
      out.saved = n
        ? await api<NewsItem>(`/api/admin/news/${n.id}`, { method: "PUT", body: values })
        : await api<NewsItem>("/api/admin/news", { method: "POST", body: { ...values, requestId } });
    });
    if (!ok || !out.saved) return;
    if (!n) return openCreated(`/admin/news/${out.saved.id}`);
    setN(out.saved);
  };

  return (
    <div className="wrap admin">
      <Crumb to="/admin/news">Новости</Crumb>
      <h1>{n ? n.title : "Новая новость"}</h1>
      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField form={form} name="title" label="Заголовок" />
        <TextField form={form} name="date" label="Дата" type="date" />
        <Field label="Текст" name="body" hint="Абзацы разделяются пустой строкой" error={bodyError}>
          <textarea
            value={form.values.body}
            onChange={(e) => form.set("body", e.target.value)}
            {...fieldProps("body", bodyError)}
          />
        </Field>
        <FormFooter
          form={{ ...form, saved: form.saved || created.saved }}
          cancelTo="/admin/news"
          siteLink={n ? `/news/${n.id}` : undefined}
        />
        {n && (
          <div className="delete-zone">
            <DeleteControl
              name={n.title}
              onDelete={async () => {
                await api(`/api/admin/news/${n.id}`, { method: "DELETE" });
                setFlash(`Удалено: ${n.title}`);
                go("/admin/news");
              }}
            />
          </div>
        )}
      </form>
    </div>
  );
}
