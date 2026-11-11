import React, { useState } from "react";

const NOTE_MAX = 4000;
const SOURCE_MAX = 1000;
const URL_MAX = 500;
const COMMENT_MAX = 2000;
const REASON_MAX = 2000;

export const CORRECTABLE = {
  work: { year: 20, engInfo: 8000, urduInfo: 8000 },
  author: { bio: 8000 }
};

export const FIELD_LABELS = {
  year: "Year",
  engInfo: "English description",
  urduInfo: "Urdu description",
  bio: "Biography"
};

const NEW_WORK_LINES = ["title", "author", "year", "genre", "language", "magazine"];

const text = (v) => String(v ?? "").trim();

export const lines = (v) =>
String(v ?? "").
split("\n").
map((s) => s.trim()).
filter(Boolean);

const isHttpUrl = (value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const over = (value, max, label) => (text(value).length > max ? [`${label} must be ${max} characters or fewer`] : []);

const required = (value, message) => (text(value) ? [] : [message]);

function correctionErrors(values, targetKind) {
  const limits = CORRECTABLE[targetKind] || {};
  const field = text(values.field);
  const allowed = Object.prototype.hasOwnProperty.call(limits, field);
  return [
  ...(allowed ? [] : ["Choose what to correct"]),
  ...required(values.value, "A new value is required"),
  ...(allowed ? over(values.value, limits[field], `The new ${FIELD_LABELS[field].toLowerCase()}`) : []),
  ...required(values.reason, "Say why this is correct, for example where you found it"),
  ...over(values.reason, REASON_MAX, "The reason")];

}

export function formErrors(type, values, targetKind) {
  switch (type) {
    case "note":
      return [
      ...(text(values.body) || text(values.bodyUrdu) ? [] : ["Write the note in English, Urdu, or both"]),
      ...over(values.body, NOTE_MAX, "The English note"),
      ...over(values.bodyUrdu, NOTE_MAX, "The Urdu note")];

    case "citation":
      return [
      ...required(values.source, "A source is required"),
      ...over(values.source, SOURCE_MAX, "The source"),
      ...(text(values.url) && !isHttpUrl(text(values.url)) ? ["The link must start with http:// or https://"] : []),
      ...over(values.url, URL_MAX, "The link"),
      ...over(values.comment, COMMENT_MAX, "The comment")];

    case "correction":
      return correctionErrors(values, targetKind);
    case "add_keywords":
      return lines(values.keywords).length ? [] : ["Add at least one keyword"];
    case "new_work":
      return [...required(values.title, "A title is required"), ...required(values.author, "An author is required")];
    default:
      return ["Choose what to contribute"];
  }
}

export function toPayload(type, values) {
  const pick = (keys) => Object.fromEntries(keys.map((k) => [k, text(values[k])]));
  switch (type) {
    case "note":
      return pick(["body", "bodyUrdu"]);
    case "citation":
      return pick(["source", "url", "comment"]);
    case "correction":
      return pick(["field", "value", "reason"]);
    case "add_keywords":
      return { keywords: lines(values.keywords), keywordsUrdu: lines(values.keywordsUrdu) };
    case "new_work":
      return {
        ...pick([...NEW_WORK_LINES, "engInfo", "urduInfo"]),
        keywords: lines(values.keywords),
        keywordsUrdu: lines(values.keywordsUrdu)
      };
    default:
      return {};
  }
}

const joinLines = (v) => (Array.isArray(v) ? v.join("\n") : v || "");

const toValues = (initial) =>
Object.fromEntries(Object.entries(initial || {}).map(([k, v]) => [k, Array.isArray(v) ? joinLines(v) : v ?? ""]));

const urdu = { dir: "rtl", lang: "ur" };

function Field({ label, hint, children }) {
  return (
    <label className="bh-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>);

}

function NoteFields({ values, set }) {
  return (
    <>
      <Field label="Note in English">
        <textarea className="bh-textarea" maxLength={NOTE_MAX} value={values.body || ""} onChange={set("body")} />
      </Field>
      <Field label="Note in Urdu" hint="Optional. Write in either language or both.">
        <textarea className="bh-textarea" {...urdu} maxLength={NOTE_MAX} value={values.bodyUrdu || ""} onChange={set("bodyUrdu")} />
      </Field>
    </>);

}

function CitationFields({ values, set }) {
  return (
    <>
      <Field label="Source" hint="Author, title, publisher and year, or a catalogue reference.">
        <textarea className="bh-textarea short" maxLength={SOURCE_MAX} value={values.source || ""} onChange={set("source")} />
      </Field>
      <Field label="Link" hint="Optional. Must start with http:// or https://">
        <input className="bh-input" type="url" maxLength={URL_MAX} value={values.url || ""} onChange={set("url")} />
      </Field>
      <Field label="Comment" hint="Optional. What does this source say about it?">
        <textarea className="bh-textarea short" maxLength={COMMENT_MAX} value={values.comment || ""} onChange={set("comment")} />
      </Field>
    </>);

}

function CorrectionFields({ values, set, targetKind, current }) {
  const fields = Object.keys(CORRECTABLE[targetKind] || {});
  const field = values.field || "";
  const now = field ? current?.[field] : null;
  const dirFor = field === "urduInfo" ? urdu : {};
  return (
    <>
      <Field label="What needs correcting?">
        <select className="bh-select" value={field} onChange={set("field")}>
          <option value="">Choose…</option>
          {fields.map((f) =>
          <option key={f} value={f}>{FIELD_LABELS[f]}</option>
          )}
        </select>
      </Field>
      {field &&
      <div className="bh-two">
          <Field label="Current value">
            <textarea className="bh-textarea" {...dirFor} readOnly value={now ? String(now) : "Not set"} />
          </Field>
          <Field label="Corrected value">
            <textarea
            className="bh-textarea"
            {...dirFor}
            maxLength={CORRECTABLE[targetKind][field]}
            value={values.value || ""}
            onChange={set("value")} />

          </Field>
        </div>
      }
      <Field label="Why is this correct?" hint="Where you found it, so the moderators can check.">
        <textarea className="bh-textarea short" maxLength={REASON_MAX} value={values.reason || ""} onChange={set("reason")} />
      </Field>
    </>);

}

function KeywordFields({ values, set }) {
  return (
    <div className="bh-two">
      <Field label="Keywords in English" hint="One per line.">
        <textarea className="bh-textarea" value={values.keywords || ""} onChange={set("keywords")} />
      </Field>
      <Field label="Keywords in Urdu" hint="Optional. One per line, in the same order as the English.">
        <textarea className="bh-textarea" {...urdu} value={values.keywordsUrdu || ""} onChange={set("keywordsUrdu")} />
      </Field>
    </div>);

}

const NEW_WORK_LABELS = {
  title: "Title",
  author: "Author",
  year: "Year",
  genre: "Genre",
  language: "Language",
  magazine: "Magazine or collection"
};

function NewWorkFields({ values, set }) {
  return (
    <>
      <div className="bh-two">
        {NEW_WORK_LINES.map((k) =>
        <Field key={k} label={NEW_WORK_LABELS[k]} hint={k === "title" || k === "author" ? "Required." : null}>
            <input className="bh-input" value={values[k] || ""} onChange={set(k)} />
          </Field>
        )}
      </div>
      <Field label="Description in English">
        <textarea className="bh-textarea" maxLength={8000} value={values.engInfo || ""} onChange={set("engInfo")} />
      </Field>
      <Field label="Description in Urdu">
        <textarea className="bh-textarea" {...urdu} maxLength={8000} value={values.urduInfo || ""} onChange={set("urduInfo")} />
      </Field>
      <KeywordFields values={values} set={set} />
    </>);

}

const FIELDS = {
  note: NoteFields,
  citation: CitationFields,
  correction: CorrectionFields,
  add_keywords: KeywordFields,
  new_work: NewWorkFields
};

export default function ContributionForm({ type, targetKind, current, initial, onSubmit, submitLabel = "Send for review" }) {
  const [values, setValues] = useState(() => toValues(initial));
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const Fields = FIELDS[type];

  const set = (key) => (event) => {
    const value = event.target.value;
    setValues((v) => ({ ...v, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const problems = formErrors(type, values, targetKind);
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      await onSubmit(toPayload(type, values));
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setBusy(false);
    }
  };

  if (!Fields) return null;

  return (
    <form className="bh-form" onSubmit={handleSubmit} noValidate>
      <Fields values={values} set={set} targetKind={targetKind} current={current} />
      {errors.length > 0 &&
      <div className="bh-error" role="alert">
          {errors.map((e) =>
        <div key={e}>{e}</div>
        )}
        </div>
      }
      <div className="bh-actions">
        <button className="bh-btn" type="submit" disabled={busy}>
          {busy ? "Sending…" : submitLabel}
        </button>
      </div>
    </form>);

}
