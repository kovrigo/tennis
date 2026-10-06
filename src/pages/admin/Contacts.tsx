import type { FormEvent } from "react";
import { api, useApi } from "../../api.ts";
import type { Contacts } from "../../api-types.ts";
import { FormFooter, useForm } from "../../components/form.tsx";
import { PageData } from "../../components/states.tsx";
import { useSite, useTitle } from "../../site.tsx";
import { TextField } from "./common.tsx";

// Federation contacts for the footer of every page.

export function AdminContacts(_props: { id?: string }) {
  useTitle("Контакты");
  const loaded = useApi<Contacts>("/api/admin/contacts");
  return <PageData loaded={loaded}>{(c) => <ContactsPage contacts={c} />}</PageData>;
}

function ContactsPage({ contacts }: { contacts: Contacts }) {
  const { reload } = useSite();
  const form = useForm<Contacts>(contacts);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await form.submit((values) => api<Contacts>("/api/admin/contacts", { method: "PUT", body: values }));
    if (ok) reload();
  };

  return (
    <div className="wrap admin">
      <h1>Контакты</h1>
      <p className="lead muted">Видны в подвале каждой страницы</p>
      <form className="form" onSubmit={onSubmit} noValidate>
        <TextField form={form} name="address" label="Адрес" />
        <TextField form={form} name="phone" label="Телефон" type="tel" autoComplete="off" />
        <TextField form={form} name="email" label="Почта" type="email" autoComplete="off" />
        <FormFooter form={form} cancelTo="/admin/tournaments" />
      </form>
    </div>
  );
}
