"use client";

import { Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { WorkspaceSidebar } from "@/components/dashboard/workspace-sidebar";

type Resource = "users" | "profiles" | "accounts" | "posts";
type RecordValue = Record<string, unknown> & { _id: string };
type Field = { name: string; label: string; type?: "email" | "password" | "textarea" | "datetime-local"; options?: string[] };

type Props = { resource: Resource; title: string; description: string };

const configuration: Record<Resource, { fields: Field[]; columns: string[]; tenantScoped: boolean }> = {
  users: { fields: [{ name: "name", label: "Name" }, { name: "email", label: "Email", type: "email" }, { name: "password", label: "Temporary password", type: "password" }, { name: "role", label: "Role", options: ["owner", "member"] }], columns: ["name", "email", "role"], tenantScoped: false },
  profiles: { fields: [{ name: "name", label: "Profile name" }, { name: "kind", label: "Kind", options: ["business", "personal"] }, { name: "timezone", label: "Time zone" }], columns: ["name", "kind", "timezone", "createdAt"], tenantScoped: false },
  accounts: { fields: [{ name: "platform", label: "Platform", options: ["instagram", "facebook", "linkedin", "pinterest", "x", "youtube"] }, { name: "displayName", label: "Display name" }, { name: "handle", label: "Handle" }, { name: "destinationId", label: "Provider destination ID" }, { name: "status", label: "Connection status", options: ["connected", "pending", "expired", "revoked"] }, { name: "scopes", label: "Scopes", type: "textarea" }], columns: ["displayName", "platform", "handle", "status"], tenantScoped: true },
  posts: { fields: [{ name: "title", label: "Internal title" }, { name: "contentText", label: "Content", type: "textarea" }, { name: "timezone", label: "Time zone" }, { name: "status", label: "Status", options: ["draft", "scheduled"] }, { name: "scheduledFor", label: "Scheduled for", type: "datetime-local" }, { name: "destinations", label: "Destinations JSON", type: "textarea" }], columns: ["title", "status", "timezone", "scheduledFor"], tenantScoped: true },
};

const defaultValues = (resource: Resource) => ({ role: "owner", kind: "business", timezone: "America/Santo_Domingo", status: resource === "posts" ? "draft" : "connected" });

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json() as { data?: T; error?: string };
  if (!response.ok || payload.data === undefined) throw new Error(payload.error ?? "The request could not be completed.");
  return payload.data;
}

function formatCell(value: unknown) {
  if (!value) return "-";
  if (typeof value === "string" && value.includes("T")) return new Date(value).toLocaleString();
  return String(value);
}

export function ModelAdmin({ resource, title, description }: Props) {
  const { fields, columns, tenantScoped } = configuration[resource];
  const [records, setRecords] = useState<RecordValue[]>([]);
  const [profiles, setProfiles] = useState<RecordValue[]>([]);
  const [profileId, setProfileId] = useState("");
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, string>>(defaultValues(resource));
  const [editing, setEditing] = useState<RecordValue | null>(null);
  const [deleting, setDeleting] = useState<RecordValue | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("Loading records...");

  const load = async (workspaceId = profileId) => {
    try {
      if (tenantScoped && !workspaceId) { setRecords([]); setMessage("Select a workspace to load records."); return; }
      const loaded = await request<RecordValue[]>(`/api/${resource}${tenantScoped ? `?profileId=${workspaceId}` : ""}`);
      setRecords(loaded);
      setMessage(`${loaded.length} record${loaded.length === 1 ? "" : "s"} loaded.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load records."); }
  };

  useEffect(() => { queueMicrotask(async () => {
    try {
      const availableProfiles = await request<RecordValue[]>("/api/profiles");
      setProfiles(availableProfiles);
      const workspaceId = availableProfiles[0]?._id ?? "";
      if (configuration[resource].tenantScoped) setProfileId(workspaceId);
      if (configuration[resource].tenantScoped && !workspaceId) { setMessage("Select a workspace to load records."); return; }
      const loaded = await request<RecordValue[]>(`/api/${resource}${configuration[resource].tenantScoped ? `?profileId=${workspaceId}` : ""}`);
      setRecords(loaded);
      setMessage(`${loaded.length} record${loaded.length === 1 ? "" : "s"} loaded.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load records."); }
  }); }, [resource]);

  const openCreate = () => { setValues(defaultValues(resource)); setEditing({ _id: "" }); };
  const openEdit = (record: RecordValue) => {
    const nextValues = Object.fromEntries(fields.map((field) => [field.name, field.name === "scopes" && Array.isArray(record.scopes) ? record.scopes.join(", ") : field.name === "scheduledFor" && record.scheduledFor ? new Date(String(record.scheduledFor)).toISOString().slice(0, 16) : String(record[field.name] ?? "")]));
    setValues(nextValues);
    setEditing(record);
  };
  const closeEditor = () => { setEditing(null); setValues(defaultValues(resource)); };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isEdit = Boolean(editing?._id);
    try {
      const body: Record<string, unknown> = { ...values };
      if (tenantScoped) body.profileId = profileId;
      if (resource === "accounts") body.scopes = values.scopes ? values.scopes.split(",").map((scope) => scope.trim()).filter(Boolean) : [];
      if (resource === "posts") {
        body.contentHtml = values.contentText;
        body.scheduledFor = values.scheduledFor ? new Date(values.scheduledFor).toISOString() : undefined;
        if (!isEdit) body.destinations = JSON.parse(values.destinations || "[]");
      }
      if (isEdit) ["email", "password", "profileId", "platform", "destinationId", "destinations"].forEach((key) => delete body[key]);
      await request(`/api/${resource}${isEdit ? `/${editing?._id}` : ""}`, { method: isEdit ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      closeEditor();
      await load();
      setMessage("Record saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save record."); }
  };

  const deleteRecord = async () => {
    if (!deleting || confirmation !== "DELETE") return;
    try {
      await request(`/api/${resource}/${deleting._id}`, { method: "DELETE" });
      setDeleting(null);
      setConfirmation("");
      await load();
      setMessage("Record deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete record."); }
  };

  const visibleRecords = records.filter((record) => Object.values(record).some((value) => String(value).toLowerCase().includes(query.toLowerCase())));
  const currentProfileName = profiles.find((profile) => profile._id === profileId)?.name;

  return <main className="dashboard-shell min-h-screen"><div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
    <WorkspaceSidebar profileName={typeof currentProfileName === "string" ? currentProfileName : undefined} activeView="Settings" />
    <section className="min-w-0 px-5 py-7 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#252d4b] pb-6"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#a891ff]">Workspace settings</p><h1 className="mt-1 font-serif text-3xl font-semibold sm:text-4xl">{title}</h1><p className="mt-2 text-sm text-[#9ba6c3]">{description}</p></div><button onClick={openCreate} className="admin-primary inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold"><Plus size={17} />New {title.slice(0, -1)}</button></header>
      <p role="status" className="admin-status mt-4 rounded-lg px-3 py-2 text-xs font-medium">{message}</p>
      {tenantScoped && <label className="mt-5 block max-w-sm text-xs font-bold uppercase tracking-wide text-[#9ba6c3]">Workspace<select value={profileId} onChange={(event) => { setProfileId(event.target.value); void load(event.target.value); }} className="admin-select mt-2 min-h-10 w-full rounded-lg px-3 text-sm normal-case">{profiles.map((profile) => <option key={profile._id} value={profile._id}>{String(profile.name)}</option>)}</select></label>}
      <section className="admin-table-card mt-6 overflow-hidden rounded-xl border"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-serif text-xl font-semibold">{title} data</h2><p className="mt-1 text-xs text-[#9ba6c3]">{visibleRecords.length} visible records</p></div><label className="admin-search flex min-h-10 items-center gap-2 rounded-lg px-3"><Search size={16} /><span className="sr-only">Search {title}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}...`} /></label></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr>{columns.map((column) => <th key={column} className="px-5 py-3 text-xs font-bold uppercase tracking-wide">{column}</th>)}<th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide">Actions</th></tr></thead><tbody>{visibleRecords.map((record) => <tr key={record._id}>{columns.map((column) => <td key={column} className="max-w-60 truncate px-5 py-4">{formatCell(record[column])}</td>)}<td className="px-5 py-4 text-right"><button onClick={() => openEdit(record)} className="admin-icon-button" aria-label={`Edit ${String(record.name ?? record.title ?? record._id)}`}><Edit3 size={16} /></button><button onClick={() => { setDeleting(record); setConfirmation(""); }} className="admin-icon-button admin-delete ml-2" aria-label={`Delete ${String(record.name ?? record.title ?? record._id)}`}><Trash2 size={16} /></button></td></tr>)}{!visibleRecords.length && <tr><td colSpan={columns.length + 1} className="px-5 py-14 text-center text-[#9ba6c3]">No records match the current view.</td></tr>}</tbody></table></div></section>
    </section></div>
    {editing && <div className="admin-modal-backdrop"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="record-dialog-title"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#a891ff]">{editing._id ? "Edit record" : "New record"}</p><h2 id="record-dialog-title" className="mt-1 font-serif text-2xl font-semibold">{editing._id ? `Edit ${title.slice(0, -1)}` : `Create ${title.slice(0, -1)}`}</h2></div><button onClick={closeEditor} className="admin-icon-button" aria-label="Close form"><X size={18} /></button></div><form onSubmit={save} className="mt-6 space-y-4">{fields.map((field) => <label key={field.name} className="block text-sm font-semibold">{field.label}{field.options ? <select required value={values[field.name] ?? field.options[0]} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="admin-select mt-1.5 min-h-11 w-full rounded-lg px-3 text-sm">{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === "textarea" ? <textarea required={field.name !== "destinations" || !editing._id} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="admin-input mt-1.5 min-h-28 w-full rounded-lg p-3 text-sm" /> : <input required={field.name !== "scheduledFor" && !(editing._id && field.name === "password")} type={field.type ?? "text"} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="admin-input mt-1.5 min-h-11 w-full rounded-lg px-3 text-sm" />}</label>)}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={closeEditor} className="admin-secondary min-h-10 rounded-lg px-4 text-sm font-bold">Cancel</button><button className="admin-primary min-h-10 rounded-lg px-4 text-sm font-bold">Save changes</button></div></form></section></div>}
    {deleting && <div className="admin-modal-backdrop"><section className="admin-modal admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8492]">Destructive action</p><h2 id="delete-dialog-title" className="mt-1 font-serif text-2xl font-semibold">Delete this record?</h2><p className="mt-3 text-sm leading-6 text-[#9ba6c3]">This action cannot be undone. Type <strong className="text-[#f4f6ff]">DELETE</strong> to confirm.</p><label className="sr-only" htmlFor="delete-confirmation">Confirmation</label><input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="admin-input mt-5 min-h-11 w-full rounded-lg px-3 text-sm" placeholder="DELETE" autoFocus /><div className="mt-6 flex justify-end gap-2"><button onClick={() => setDeleting(null)} className="admin-secondary min-h-10 rounded-lg px-4 text-sm font-bold">Cancel</button><button onClick={() => void deleteRecord()} disabled={confirmation !== "DELETE"} className="admin-danger min-h-10 rounded-lg px-4 text-sm font-bold disabled:opacity-40">Delete record</button></div></section></div>}
  </main>;
}
